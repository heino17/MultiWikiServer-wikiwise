/*\
title: $:/plugins/tiddlywiki/tiddlyweb/tiddlywebadaptor.js
type: application/javascript
module-type: syncadaptor

A sync adaptor module for synchronising with MultiWikiServer-compatible servers. It has three key areas of concern:

* Basic operations like put, get, and delete a tiddler on the server
* Real time updates from the server (handled by SSE)
* Managing login/logout (not yet implemeneted)
* Bags and recipes, which are unknown to the syncer

A key aspect of the design is that the syncer never overlaps basic server operations; it waits for the
previous operation to complete before sending a new one.

\*/
// the blank line is important, and so is the following use strict
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
var CONFIG_HOST_TIDDLER = "$:/config/multiwikiclient/host", DEFAULT_HOST_TIDDLER = "$protocol$//$host$/", MWC_STATE_TIDDLER_PREFIX = "$:/state/multiwikiclient/", BAG_STATE_TIDDLER = "$:/state/multiwikiclient/tiddlers/bag", REVISION_STATE_TIDDLER = "$:/state/multiwikiclient/tiddlers/revision", CONNECTION_STATE_TIDDLER = "$:/state/multiwikiclient/connection", INCOMING_UPDATES_FILTER_TIDDLER = "$:/config/multiwikiclient/incoming-updates-filter", ENABLE_SSE_TIDDLER = "$:/config/multiwikiclient/use-server-sent-events";
var SERVER_NOT_CONNECTED = "NOT CONNECTED", SERVER_CONNECTING_SSE = "CONNECTING SSE", SERVER_CONNECTED_SSE = "CONNECTED SSE", SERVER_POLLING = "SERVER POLLING";
class MultiWikiClientAdaptor {
    constructor(options) {
        this.name = "multiwikiclient";
        this.supportsLazyLoading = true;
        this.wiki = options.wiki;
        this.host = this.getHost();
        this.recipe = this.wiki.getTiddlerText("$:/config/multiwikiclient/recipe");
        this.useServerSentEvents = this.wiki.getTiddlerText(ENABLE_SSE_TIDDLER) === "yes";
        this.last_known_tiddler_id = $tw.utils.parseNumber(this.wiki.getTiddlerText("$:/state/multiwikiclient/recipe/last_tiddler_id", "0"));
        this.outstandingRequests = Object.create(null); // Hashmap by title of outstanding request object: {type: "PUT"|"GET"|"DELETE"}
        this.lastRecordedUpdate = Object.create(null); // Hashmap by title of last recorded update via SSE: {type: "update"|"detetion", tiddler_id:}
        this.logger = new $tw.utils.Logger("MultiWikiClientAdaptor");
        this.isLoggedIn = false;
        this.isReadOnly = false;
        this.logoutIsAvailable = true;
        // Compile the dirty tiddler filter
        this.incomingUpdatesFilterFn = this.wiki.compileFilter(this.wiki.getTiddlerText(INCOMING_UPDATES_FILTER_TIDDLER));
        this.setUpdateConnectionStatus(SERVER_NOT_CONNECTED);
    }
    setUpdateConnectionStatus(status) {
        this.serverUpdateConnectionStatus = status;
        this.wiki.addTiddler({
            title: CONNECTION_STATE_TIDDLER,
            text: status
        });
    }
    setLoggerSaveBuffer(loggerForSaving) {
        this.logger.setSaveBuffer(loggerForSaving);
    }
    isReady() {
        return true;
    }
    getHost() {
        var text = this.wiki.getTiddlerText(CONFIG_HOST_TIDDLER, DEFAULT_HOST_TIDDLER), substitutions = [
            { name: "protocol", value: document.location.protocol },
            { name: "host", value: document.location.host },
            { name: "pathname", value: document.location.pathname }
        ];
        for (var t = 0; t < substitutions.length; t++) {
            var s = substitutions[t];
            text = $tw.utils.replaceString(text, new RegExp("\\$" + s.name + "\\$", "mg"), s.value);
        }
        return text;
    }
    getTiddlerInfo(tiddler) {
        var title = tiddler.fields.title, revision = this.wiki.extractTiddlerDataItem(REVISION_STATE_TIDDLER, title), bag = this.wiki.extractTiddlerDataItem(BAG_STATE_TIDDLER, title);
        if (revision && bag) {
            return {
                title: title,
                revision: revision,
                bag: bag
            };
        }
        else {
            return undefined;
        }
    }
    getTiddlerBag(title) {
        return this.wiki.extractTiddlerDataItem(BAG_STATE_TIDDLER, title);
    }
    getTiddlerRevision(title) {
        return this.wiki.extractTiddlerDataItem(REVISION_STATE_TIDDLER, title);
    }
    setTiddlerInfo(title, revision, bag) {
        this.wiki.setText(BAG_STATE_TIDDLER, null, title, bag, { suppressTimestamp: true });
        this.wiki.setText(REVISION_STATE_TIDDLER, null, title, revision, { suppressTimestamp: true });
    }
    removeTiddlerInfo(title) {
        this.wiki.setText(BAG_STATE_TIDDLER, null, title, undefined, { suppressTimestamp: true });
        this.wiki.setText(REVISION_STATE_TIDDLER, null, title, undefined, { suppressTimestamp: true });
    }
    httpRequest(options) {
        return (new Promise((resolve) => {
            $tw.utils.httpRequest(Object.assign(Object.assign({}, options), { responseType: options.responseType === "json" ? "text" : options.responseType, callback: (err, data, request) => {
                    var _a;
                    if (err)
                        return resolve([false, err || new Error("Unknown error"), undefined]);
                    // Create a map of header names to values
                    const headers = {};
                    (_a = request.getAllResponseHeaders()) === null || _a === void 0 ? void 0 : _a.trim().split(/[\r\n]+/).forEach((line) => {
                        var _a;
                        const parts = line.split(": ");
                        const header = (_a = parts.shift()) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                        const value = parts.join(": ");
                        if (header)
                            headers[header] = value;
                    });
                    // Resolve the promise with the response data and headers
                    resolve([true, undefined, {
                            headers,
                            data: options.responseType === "json" ? $tw.utils.parseJSONSafe(data, () => undefined) : data,
                        }]);
                } }));
        }));
    }
    /*
    Get the current status of the server connection
    */
    getStatus(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const [ok, error, data] = yield this.httpRequest({
                url: this.host + "recipes/" + this.recipe + "/status",
                type: "GET",
                responseType: "json",
                headers: {
                    'Content-Type': 'application/json',
                    "X-Requested-With": "TiddlyWiki"
                },
            });
            if (!ok) {
                this.logger.log("Error getting status", error);
                if (callback)
                    callback(error);
                return;
            }
            /** @type {Partial<UserAuthStatus>} */
            const status = data.data;
            if (callback) {
                callback(
                // Error
                null, 
                // Is logged in
                (_a = status.isLoggedIn) !== null && _a !== void 0 ? _a : false, 
                // Username
                (_b = status.username) !== null && _b !== void 0 ? _b : "(anon)", 
                // Is read only
                (_c = status.isReadOnly) !== null && _c !== void 0 ? _c : true, 
                // Is anonymous
                !status.isLoggedIn);
            }
        });
    }
    /*
    Get details of changed tiddlers from the server
    */
    getUpdatedTiddlers(syncer, callback) {
        if (!this.useServerSentEvents) {
            this.pollServer({
                callback: function (err, changes) {
                    callback(null, changes);
                }
            });
            return;
        }
        var self = this;
        // Do nothing if there's already a connection in progress.
        if (this.serverUpdateConnectionStatus !== SERVER_NOT_CONNECTED) {
            return callback(null, {
                modifications: [],
                deletions: []
            });
        }
        // Try to connect a server stream
        this.setUpdateConnectionStatus(SERVER_CONNECTING_SSE);
        this.connectServerStream({
            syncer: syncer,
            onerror: function (err) {
                self.logger.log("Error connecting SSE stream", err);
                // If the stream didn't work, try polling
                self.setUpdateConnectionStatus(SERVER_POLLING);
                self.pollServer({
                    callback: function (err, changes) {
                        self.setUpdateConnectionStatus(SERVER_NOT_CONNECTED);
                        callback(null, changes);
                    }
                });
            },
            onopen: function () {
                self.setUpdateConnectionStatus(SERVER_CONNECTED_SSE);
                // The syncer is expecting a callback but we don't have any data to send
                callback(null, {
                    modifications: [],
                    deletions: []
                });
            }
        });
    }
    /*
    Attempt to establish an SSE stream with the server and transfer tiddler changes. Options include:
  
    syncer: reference to syncer object used for storing data
    onopen: invoked when the stream is successfully opened
    onerror: invoked if there is an error
    */
    connectServerStream(options) {
        var self = this;
        const eventSource = new EventSource("/recipes/" + this.recipe + "/events?last_known_tiddler_id=" + this.last_known_tiddler_id);
        eventSource.onerror = function (event) {
            if (options.onerror) {
                options.onerror(event);
            }
        };
        eventSource.onopen = function (event) {
            if (options.onopen) {
                options.onopen(event);
            }
        };
        eventSource.addEventListener("change", function (event) {
            const data = $tw.utils.parseJSONSafe(event.data);
            if (!data)
                return;
            console.log("SSE data", data);
            // Update last seen tiddler_id
            if (data.tiddler_id > self.last_known_tiddler_id) {
                self.last_known_tiddler_id = data.tiddler_id;
            }
            // Record the last update to this tiddler
            self.lastRecordedUpdate[data.title] = {
                type: data.is_deleted ? "deletion" : "update",
                tiddler_id: data.tiddler_id
            };
            console.log(`Oustanding requests is ${JSON.stringify(self.outstandingRequests[data.title])}`);
            // Process the update if the tiddler is not the subject of an outstanding request
            if (self.outstandingRequests[data.title])
                return;
            if (data.is_deleted) {
                self.removeTiddlerInfo(data.title);
                delete options.syncer.tiddlerInfo[data.title];
                options.syncer.logger.log("Deleting tiddler missing from server:", data.title);
                options.syncer.wiki.deleteTiddler(data.title);
                options.syncer.processTaskQueue();
            }
            else {
                var result = self.incomingUpdatesFilterFn.call(self.wiki, self.wiki.makeTiddlerIterator([data.title]));
                if (result.length > 0) {
                    self.setTiddlerInfo(data.title, data.tiddler_id.toString(), data.bag_name);
                    options.syncer.storeTiddler(data.tiddler);
                }
            }
        });
    }
    /*
    Poll the server for changes. Options include:
  
    callback: invoked on completion as (err,changes)
    */
    pollServer(options) {
        return __awaiter(this, void 0, void 0, function* () {
            var self = this;
            const [ok, err, result] = yield this.httpRequest({
                url: this.host + "recipes/" + this.recipe + "/tiddlers.json",
                data: {
                    last_known_tiddler_id: this.last_known_tiddler_id,
                    include_deleted: "true"
                },
                responseType: "json",
            });
            if (!ok) {
                return options.callback(err);
            }
            const { data: tiddlerInfoArray = [] } = result;
            var modifications = [], deletions = [];
            $tw.utils.each(tiddlerInfoArray, 
            /**
             * @param {{ title: string; tiddler_id: number; is_deleted: boolean; bag_name: string; }} tiddlerInfo
             */
            function (tiddlerInfo) {
                if (tiddlerInfo.tiddler_id > self.last_known_tiddler_id) {
                    self.last_known_tiddler_id = tiddlerInfo.tiddler_id;
                }
                if (tiddlerInfo.is_deleted) {
                    deletions.push(tiddlerInfo.title);
                }
                else {
                    modifications.push(tiddlerInfo.title);
                }
            });
            // Invoke the callback with the results
            options.callback(null, {
                modifications: modifications,
                deletions: deletions
            });
            setTimeout(() => {
                // If Browswer Storage tiddlers were cached on reloading the wiki, add them after sync from server completes in the above callback.
                if ($tw.browserStorage && $tw.browserStorage.isEnabled()) {
                    $tw.browserStorage.addCachedTiddlers();
                }
            });
        });
    }
    /*
    Queue a load for a tiddler if there has been an update for it since the specified revision
    */
    checkLastRecordedUpdate(title, revision) {
        var lru = this.lastRecordedUpdate[title];
        if (lru) {
            var numRevision = $tw.utils.getInt(revision, 0);
            if (!numRevision) {
                this.logger.log("Error: revision is not a number", revision);
                return;
            }
            console.log(`Checking for updates to ${title} since ${JSON.stringify(revision)} comparing to ${numRevision}`);
            if (lru.tiddler_id > numRevision) {
                this.syncer && this.syncer.enqueueLoadTiddler(title);
            }
        }
    }
    get syncer() {
        //@ts-expect-error
        if ($tw.syncadaptor === this)
            return $tw.syncer;
    }
    /*
    Save a tiddler and invoke the callback with (err,adaptorInfo,revision)
    */
    saveTiddler(tiddler, callback, options) {
        return __awaiter(this, void 0, void 0, function* () {
            var self = this, title = tiddler.fields.title;
            if (this.isReadOnly || title.substr(0, MWC_STATE_TIDDLER_PREFIX.length) === MWC_STATE_TIDDLER_PREFIX) {
                return callback(null);
            }
            self.outstandingRequests[title] = { type: "PUT" };
            const [ok, err, result] = yield this.httpRequest({
                url: this.host + "recipes/" + encodeURIComponent(this.recipe) + "/tiddlers/" + encodeURIComponent(title),
                type: "PUT",
                headers: {
                    "Content-type": "application/json"
                },
                data: JSON.stringify(tiddler.getFieldStrings()),
                responseType: "json",
            });
            delete self.outstandingRequests[title];
            if (!ok)
                return callback(err);
            const { headers, data } = result;
            //If Browser-Storage plugin is present, remove tiddler from local storage after successful sync to the server
            if ($tw.browserStorage && $tw.browserStorage.isEnabled()) {
                $tw.browserStorage.removeTiddlerFromLocalStorage(title);
            }
            // Save the details of the new revision of the tiddler
            const revision = data.tiddler_id, bag_name = data.bag_name;
            console.log(`Saved ${title} with revision ${revision} and bag ${bag_name}`);
            // If there has been a more recent update from the server then enqueue a load of this tiddler
            self.checkLastRecordedUpdate(title, revision);
            // Invoke the callback
            self.setTiddlerInfo(title, revision, bag_name);
            callback(null, { bag: bag_name }, revision);
        });
    }
    /*
    Load a tiddler and invoke the callback with (err,tiddlerFields)

    The syncer does not pass itself into options.
    */
    loadTiddler(title, callback, options) {
        return __awaiter(this, void 0, void 0, function* () {
            var self = this;
            self.outstandingRequests[title] = { type: "GET" };
            const [ok, err, result] = yield this.httpRequest({
                url: this.host + "recipes/" + encodeURIComponent(this.recipe) + "/tiddlers/" + encodeURIComponent(title),
            });
            delete self.outstandingRequests[title];
            if (err === 404) {
                return callback(null, null);
            }
            else if (!ok) {
                return callback(err);
            }
            const { data, headers } = result;
            const revision = headers["x-revision-number"], bag_name = headers["x-bag-name"];
            // If there has been a more recent update from the server then enqueue a load of this tiddler
            self.checkLastRecordedUpdate(title, revision);
            // Invoke the callback
            self.setTiddlerInfo(title, revision, bag_name);
            callback(null, $tw.utils.parseJSONSafe(data));
        });
    }
    /*
    Delete a tiddler and invoke the callback with (err)
    options include:
    tiddlerInfo: the syncer's tiddlerInfo for this tiddler
    */
    deleteTiddler(title, callback, options) {
        return __awaiter(this, void 0, void 0, function* () {
            var self = this;
            if (this.isReadOnly) {
                return callback(null);
            }
            // If we don't have a bag it means that the tiddler hasn't been seen by the server, so we don't need to delete it
            // var bag = this.getTiddlerBag(title);
            // if(!bag) { return callback(null, options.tiddlerInfo.adaptorInfo); }
            self.outstandingRequests[title] = { type: "DELETE" };
            // Issue HTTP request to delete the tiddler
            const [ok, err, result] = yield this.httpRequest({
                url: this.host + "recipes/" + encodeURIComponent(this.recipe) + "/tiddlers/" + encodeURIComponent(title),
                type: "DELETE",
            });
            delete self.outstandingRequests[title];
            if (!ok) {
                return callback(err);
            }
            const { data } = result;
            const revision = data.tiddler_id, bag_name = data.bag_name;
            // If there has been a more recent update from the server then enqueue a load of this tiddler
            self.checkLastRecordedUpdate(title, revision);
            self.removeTiddlerInfo(title);
            // Invoke the callback & return null adaptorInfo
            callback(null, null);
        });
    }
}
if ($tw.browser && document.location.protocol.startsWith("http")) {
    exports.adaptorClass = MultiWikiClientAdaptor;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGl3aWtpY2xpZW50YWRhcHRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tdWx0aXdpa2ljbGllbnRhZGFwdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7Ozs7R0FlRztBQUVILGtFQUFrRTtBQUNsRSxZQUFZLENBQUM7Ozs7Ozs7Ozs7O0FBc0JiLElBQUksbUJBQW1CLEdBQUcsZ0NBQWdDLEVBQ3pELG9CQUFvQixHQUFHLHFCQUFxQixFQUM1Qyx3QkFBd0IsR0FBRywyQkFBMkIsRUFDdEQsaUJBQWlCLEdBQUcsdUNBQXVDLEVBQzNELHNCQUFzQixHQUFHLDRDQUE0QyxFQUNyRSx3QkFBd0IsR0FBRyxxQ0FBcUMsRUFDaEUsK0JBQStCLEdBQUcsbURBQW1ELEVBQ3JGLGtCQUFrQixHQUFHLGtEQUFrRCxDQUFDO0FBRXpFLElBQUksb0JBQW9CLEdBQUcsZUFBZSxFQUN6QyxxQkFBcUIsR0FBRyxnQkFBZ0IsRUFDeEMsb0JBQW9CLEdBQUcsZUFBZSxFQUN0QyxjQUFjLEdBQUcsZ0JBQWdCLENBQUM7QUFFbkMsTUFBTSxzQkFBc0I7SUFpQjNCLFlBQVksT0FBc0I7UUFGbEMsU0FBSSxHQUFHLGlCQUFpQixDQUFDO1FBQ3pCLHdCQUFtQixHQUFHLElBQUksQ0FBQztRQUUxQixJQUFJLENBQUMsSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUM7UUFDekIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDM0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQzNFLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLEtBQUssQ0FBQztRQUNsRixJQUFJLENBQUMscUJBQXFCLEdBQUcsR0FBRyxDQUFDLEtBQUss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QUFDLHVCQUF1QixDQUFDLEtBQUssRUFBRSxRQUFRLENBQUMsQ0FBQztZQUM5QyxJQUFJLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDOUIsZ0RBQWdEO1lBQ2hELFFBQVEsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDdEIsQ0FBQztLQUFBO0NBQ0Q7QUFHRCxJQUFJLEdBQUcsQ0FBQyxPQUFPLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7SUFDbEUsT0FBTyxDQUFDLFlBQVksR0FBRyxzQkFBc0IsQ0FBQztBQUMvQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLypcXFxudGl0bGU6ICQ6L3BsdWdpbnMvdGlkZGx5d2lraS90aWRkbHl3ZWIvdGlkZGx5d2ViYWRhcHRvci5qc1xudHlwZTogYXBwbGljYXRpb24vamF2YXNjcmlwdFxubW9kdWxlLXR5cGU6IHN5bmNhZGFwdG9yXG5cbkEgc3luYyBhZGFwdG9yIG1vZHVsZSBmb3Igc3luY2hyb25pc2luZyB3aXRoIE11bHRpV2lraVNlcnZlci1jb21wYXRpYmxlIHNlcnZlcnMuIEl0IGhhcyB0aHJlZSBrZXkgYXJlYXMgb2YgY29uY2VybjpcblxuKiBCYXNpYyBvcGVyYXRpb25zIGxpa2UgcHV0LCBnZXQsIGFuZCBkZWxldGUgYSB0aWRkbGVyIG9uIHRoZSBzZXJ2ZXJcbiogUmVhbCB0aW1lIHVwZGF0ZXMgZnJvbSB0aGUgc2VydmVyIChoYW5kbGVkIGJ5IFNTRSlcbiogTWFuYWdpbmcgbG9naW4vbG9nb3V0IChub3QgeWV0IGltcGxlbWVuZXRlZClcbiogQmFncyBhbmQgcmVjaXBlcywgd2hpY2ggYXJlIHVua25vd24gdG8gdGhlIHN5bmNlclxuXG5BIGtleSBhc3BlY3Qgb2YgdGhlIGRlc2lnbiBpcyB0aGF0IHRoZSBzeW5jZXIgbmV2ZXIgb3ZlcmxhcHMgYmFzaWMgc2VydmVyIG9wZXJhdGlvbnM7IGl0IHdhaXRzIGZvciB0aGVcbnByZXZpb3VzIG9wZXJhdGlvbiB0byBjb21wbGV0ZSBiZWZvcmUgc2VuZGluZyBhIG5ldyBvbmUuXG5cblxcKi9cblxuLy8gdGhlIGJsYW5rIGxpbmUgaXMgaW1wb3J0YW50LCBhbmQgc28gaXMgdGhlIGZvbGxvd2luZyB1c2Ugc3RyaWN0XG5cInVzZSBzdHJpY3RcIjtcbmltcG9ydCB0eXBlIHsgTG9nZ2VyIH0gZnJvbSBcIiQ6L2NvcmUvbW9kdWxlcy91dGlscy9sb2dnZXIuanNcIjtcbmltcG9ydCB0eXBlIHsgU3luY2VyLCBUaWRkbGVyLCBJVGlkZGx5V2lraSB9IGZyb20gXCJ0aWRkbHl3aWtpXCI7XG5cbmRlY2xhcmUgbW9kdWxlICd0aWRkbHl3aWtpJyB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgU3luY2VyIHtcblx0XHR3aWtpOiBXaWtpO1xuXHRcdGxvZ2dlcjogTG9nZ2VyO1xuXHRcdHRpZGRsZXJJbmZvOiBSZWNvcmQ8c3RyaW5nLCB7IGJhZzogc3RyaW5nOyByZXZpc2lvbjogc3RyaW5nIH0+O1xuXHRcdGVucXVldWVMb2FkVGlkZGxlcih0aXRsZTogc3RyaW5nKTogdm9pZDtcblx0XHRzdG9yZVRpZGRsZXIodGlkZGxlcjogVGlkZGxlcik6IHZvaWQ7XG5cdFx0cHJvY2Vzc1Rhc2tRdWV1ZSgpOiB2b2lkO1xuXHR9XG5cdGludGVyZmFjZSBJVGlkZGx5V2lraSB7XG4gICAgYnJvd3NlclN0b3JhZ2U6IGFueTtcbiAgfVxufVxuXG5kZWNsYXJlIGNvbnN0IGV4cG9ydHM6IHtcblx0YWRhcHRvckNsYXNzOiB0eXBlb2YgTXVsdGlXaWtpQ2xpZW50QWRhcHRvcjtcbn07XG5cbnZhciBDT05GSUdfSE9TVF9USURETEVSID0gXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L2hvc3RcIixcblx0REVGQVVMVF9IT1NUX1RJRERMRVIgPSBcIiRwcm90b2NvbCQvLyRob3N0JC9cIixcblx0TVdDX1NUQVRFX1RJRERMRVJfUFJFRklYID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvXCIsXG5cdEJBR19TVEFURV9USURETEVSID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvdGlkZGxlcnMvYmFnXCIsXG5cdFJFVklTSU9OX1NUQVRFX1RJRERMRVIgPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC90aWRkbGVycy9yZXZpc2lvblwiLFxuXHRDT05ORUNUSU9OX1NUQVRFX1RJRERMRVIgPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC9jb25uZWN0aW9uXCIsXG5cdElOQ09NSU5HX1VQREFURVNfRklMVEVSX1RJRERMRVIgPSBcIiQ6L2NvbmZpZy9tdWx0aXdpa2ljbGllbnQvaW5jb21pbmctdXBkYXRlcy1maWx0ZXJcIixcblx0RU5BQkxFX1NTRV9USURETEVSID0gXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L3VzZS1zZXJ2ZXItc2VudC1ldmVudHNcIjtcblxudmFyIFNFUlZFUl9OT1RfQ09OTkVDVEVEID0gXCJOT1QgQ09OTkVDVEVEXCIsXG5cdFNFUlZFUl9DT05ORUNUSU5HX1NTRSA9IFwiQ09OTkVDVElORyBTU0VcIixcblx0U0VSVkVSX0NPTk5FQ1RFRF9TU0UgPSBcIkNPTk5FQ1RFRCBTU0VcIixcblx0U0VSVkVSX1BPTExJTkcgPSBcIlNFUlZFUiBQT0xMSU5HXCI7XG5cbmNsYXNzIE11bHRpV2lraUNsaWVudEFkYXB0b3Ige1xuXHR3aWtpO1xuXHRob3N0O1xuXHRyZWNpcGU7XG5cdHVzZVNlcnZlclNlbnRFdmVudHM7XG5cdGxhc3Rfa25vd25fdGlkZGxlcl9pZDtcblx0b3V0c3RhbmRpbmdSZXF1ZXN0cztcblx0bGFzdFJlY29yZGVkVXBkYXRlO1xuXHRsb2dnZXI7XG5cdGlzTG9nZ2VkSW47XG5cdGlzUmVhZE9ubHk7XG5cdGxvZ291dElzQXZhaWxhYmxlO1xuXHRpbmNvbWluZ1VwZGF0ZXNGaWx0ZXJGbjtcblx0c2VydmVyVXBkYXRlQ29ubmVjdGlvblN0YXR1cyE6IHN0cmluZztcblxuXHRuYW1lID0gXCJtdWx0aXdpa2ljbGllbnRcIjtcblx0c3VwcG9ydHNMYXp5TG9hZGluZyA9IHRydWU7XG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IHsgd2lraTogYW55IH0pIHtcblx0XHR0aGlzLndpa2kgPSBvcHRpb25zLndpa2k7XG5cdFx0dGhpcy5ob3N0ID0gdGhpcy5nZXRIb3N0KCk7XG5cdFx0dGhpcy5yZWNpcGUgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L3JlY2lwZVwiKTtcblx0XHR0aGlzLnVzZVNlcnZlclNlbnRFdmVudHMgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoRU5BQkxFX1NTRV9USURETEVSKSA9PT0gXCJ5ZXNcIjtcblx0XHR0aGlzLmxhc3Rfa25vd25fdGlkZGxlcl9pZCA9ICR0dy51dGlscy5wYXJzZU51bWJlcih0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvcmVjaXBlL2xhc3RfdGlkZGxlcl9pZFwiLCBcIjBcIikpO1xuXHRcdHRoaXMub3V0c3RhbmRpbmdSZXF1ZXN0cyA9IE9iamVjdC5jcmVhdGUobnVsbCk7IC8vIEhhc2htYXAgYnkgdGl0bGUgb2Ygb3V0c3RhbmRpbmcgcmVxdWVzdCBvYmplY3Q6IHt0eXBlOiBcIlBVVFwifFwiR0VUXCJ8XCJERUxFVEVcIn1cblx0XHR0aGlzLmxhc3RSZWNvcmRlZFVwZGF0ZSA9IE9iamVjdC5jcmVhdGUobnVsbCk7IC8vIEhhc2htYXAgYnkgdGl0bGUgb2YgbGFzdCByZWNvcmRlZCB1cGRhdGUgdmlhIFNTRToge3R5cGU6IFwidXBkYXRlXCJ8XCJkZXRldGlvblwiLCB0aWRkbGVyX2lkOn1cblx0XHR0aGlzLmxvZ2dlciA9IG5ldyAkdHcudXRpbHMuTG9nZ2VyKFwiTXVsdGlXaWtpQ2xpZW50QWRhcHRvclwiKTtcblx0XHR0aGlzLmlzTG9nZ2VkSW4gPSBmYWxzZTtcblx0XHR0aGlzLmlzUmVhZE9ubHkgPSBmYWxzZTtcblx0XHR0aGlzLmxvZ291dElzQXZhaWxhYmxlID0gdHJ1ZTtcblx0XHQvLyBDb21waWxlIHRoZSBkaXJ0eSB0aWRkbGVyIGZpbHRlclxuXHRcdHRoaXMuaW5jb21pbmdVcGRhdGVzRmlsdGVyRm4gPSB0aGlzLndpa2kuY29tcGlsZUZpbHRlcih0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoSU5DT01JTkdfVVBEQVRFU19GSUxURVJfVElERExFUikpO1xuXHRcdHRoaXMuc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhTRVJWRVJfTk9UX0NPTk5FQ1RFRCk7XG5cdH1cblxuXHRzZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKHN0YXR1czogc3RyaW5nKSB7XG5cdFx0dGhpcy5zZXJ2ZXJVcGRhdGVDb25uZWN0aW9uU3RhdHVzID0gc3RhdHVzO1xuXHRcdHRoaXMud2lraS5hZGRUaWRkbGVyKHtcblx0XHRcdHRpdGxlOiBDT05ORUNUSU9OX1NUQVRFX1RJRERMRVIsXG5cdFx0XHR0ZXh0OiBzdGF0dXNcblx0XHR9KTtcblx0fVxuXHRzZXRMb2dnZXJTYXZlQnVmZmVyKGxvZ2dlckZvclNhdmluZzogTG9nZ2VyKSB7XG5cdFx0dGhpcy5sb2dnZXIuc2V0U2F2ZUJ1ZmZlcihsb2dnZXJGb3JTYXZpbmcpO1xuXHR9XG5cdGlzUmVhZHkoKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0Z2V0SG9zdCgpIHtcblx0XHR2YXIgdGV4dCA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChDT05GSUdfSE9TVF9USURETEVSLCBERUZBVUxUX0hPU1RfVElERExFUiksIHN1YnN0aXR1dGlvbnMgPSBbXG5cdFx0XHR7IG5hbWU6IFwicHJvdG9jb2xcIiwgdmFsdWU6IGRvY3VtZW50LmxvY2F0aW9uLnByb3RvY29sIH0sXG5cdFx0XHR7IG5hbWU6IFwiaG9zdFwiLCB2YWx1ZTogZG9jdW1lbnQubG9jYXRpb24uaG9zdCB9LFxuXHRcdFx0eyBuYW1lOiBcInBhdGhuYW1lXCIsIHZhbHVlOiBkb2N1bWVudC5sb2NhdGlvbi5wYXRobmFtZSB9XG5cdFx0XTtcblx0XHRmb3IgKHZhciB0ID0gMDsgdCA8IHN1YnN0aXR1dGlvbnMubGVuZ3RoOyB0KyspIHtcblx0XHRcdHZhciBzID0gc3Vic3RpdHV0aW9uc1t0XTtcblx0XHRcdHRleHQgPSAkdHcudXRpbHMucmVwbGFjZVN0cmluZyh0ZXh0LCBuZXcgUmVnRXhwKFwiXFxcXCRcIiArIHMubmFtZSArIFwiXFxcXCRcIiwgXCJtZ1wiKSwgcy52YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cdGdldFRpZGRsZXJJbmZvKHRpZGRsZXI6IFRpZGRsZXIpIHtcblx0XHR2YXIgdGl0bGUgPSB0aWRkbGVyLmZpZWxkcy50aXRsZSwgcmV2aXNpb24gPSB0aGlzLndpa2kuZXh0cmFjdFRpZGRsZXJEYXRhSXRlbShSRVZJU0lPTl9TVEFURV9USURETEVSLCB0aXRsZSksIGJhZyA9IHRoaXMud2lraS5leHRyYWN0VGlkZGxlckRhdGFJdGVtKEJBR19TVEFURV9USURETEVSLCB0aXRsZSk7XG5cdFx0aWYgKHJldmlzaW9uICYmIGJhZykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGl0bGU6IHRpdGxlLFxuXHRcdFx0XHRyZXZpc2lvbjogcmV2aXNpb24sXG5cdFx0XHRcdGJhZzogYmFnXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXHRnZXRUaWRkbGVyQmFnKHRpdGxlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oQkFHX1NUQVRFX1RJRERMRVIsIHRpdGxlKTtcblx0fVxuXHRnZXRUaWRkbGVyUmV2aXNpb24odGl0bGU6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLndpa2kuZXh0cmFjdFRpZGRsZXJEYXRhSXRlbShSRVZJU0lPTl9TVEFURV9USURETEVSLCB0aXRsZSk7XG5cdH1cblx0c2V0VGlkZGxlckluZm8odGl0bGU6IHN0cmluZywgcmV2aXNpb246IHN0cmluZywgYmFnOiBzdHJpbmcpIHtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChCQUdfU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIGJhZywgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChSRVZJU0lPTl9TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgcmV2aXNpb24sIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdH1cblx0cmVtb3ZlVGlkZGxlckluZm8odGl0bGU6IHN0cmluZykge1xuXHRcdHRoaXMud2lraS5zZXRUZXh0KEJBR19TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgdW5kZWZpbmVkLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHRcdHRoaXMud2lraS5zZXRUZXh0KFJFVklTSU9OX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCB1bmRlZmluZWQsIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdH1cblxuXHRodHRwUmVxdWVzdDxSVCBleHRlbmRzIFwidGV4dFwiIHwgXCJhcnJheWJ1ZmZlclwiIHwgXCJqc29uXCI+KG9wdGlvbnM6IHtcblx0XHQvKiogdXJsIHRvIHJldHJpZXZlIChtdXN0IG5vdCBjb250YWluIGA/YCBpZiBHRVQgb3IgSEVBRCkgKi9cblx0XHR1cmw6IHN0cmluZztcblx0XHQvKiogaGFzaG1hcCBvZiBoZWFkZXJzIHRvIHNlbmQgKi9cblx0XHRoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblx0XHQvKiogcmVxdWVzdCBtZXRob2Q6IEdFVCwgUFVULCBQT1NUIGV0YyAqL1xuXHRcdHR5cGU/OiBzdHJpbmc7XG5cdFx0LyoqIG9wdGlvbmFsIGZ1bmN0aW9uIGludm9rZWQgd2l0aCAobGVuZ3RoQ29tcHV0YWJsZSxsb2FkZWQsdG90YWwpICovXG5cdFx0cHJvZ3Jlc3M/OiAobGVuZ3RoQ29tcHV0YWJsZTogYm9vbGVhbiwgbG9hZGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWQ7XG5cdFx0LyoqIG5hbWUgb2YgdGhlIHByb3BlcnR5IHRvIHJldHVybiBhcyBmaXJzdCBhcmd1bWVudCBvZiBjYWxsYmFjayAqL1xuXHRcdHJldHVyblByb3A/OiBzdHJpbmc7XG5cdFx0cmVzcG9uc2VUeXBlPzogUlQ7XG5cdFx0dXNlRGVmYXVsdEhlYWRlcnM/OiBib29sZWFuO1xuXHRcdC8qKiB1cmxlbmNvZGVkIHN0cmluZyBvciBoYXNobWFwIG9mIGRhdGEgdG8gc2VuZC4gSWYgdHlwZSBpcyBHRVQgb3IgSEVBRCwgdGhpcyBpcyBhcHBlbmRlZCB0byB0aGUgVVJMIGFzIGEgcXVlcnkgc3RyaW5nICovXG5cdFx0ZGF0YT86IG9iamVjdCB8IHN0cmluZztcblx0fSkge1xuXHRcdHR5cGUgUmVzcG9uc2VFcnIgPSBbZmFsc2UsIGFueSwgdW5kZWZpbmVkXTtcblx0XHR0eXBlIFJlc3BvbnNlT2sgPSBbdHJ1ZSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRkYXRhOlxuXHRcdFx0XCJqc29uXCIgZXh0ZW5kcyBSVCA/IGFueSA6XG5cdFx0XHRcInRleHRcIiBleHRlbmRzIFJUID8gc3RyaW5nIDpcblx0XHRcdFwiYXJyYXlidWZmZXJcIiBleHRlbmRzIFJUID8gQXJyYXlCdWZmZXIgOlxuXHRcdFx0dW5rbm93bjtcblx0XHRcdGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz5cblx0XHR9XTtcblx0XHRyZXR1cm4gKG5ldyBQcm9taXNlPFJlc3BvbnNlRXJyIHwgUmVzcG9uc2VPaz4oKHJlc29sdmUpID0+IHtcblx0XHRcdCR0dy51dGlscy5odHRwUmVxdWVzdCh7XG5cdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdHJlc3BvbnNlVHlwZTogb3B0aW9ucy5yZXNwb25zZVR5cGUgPT09IFwianNvblwiID8gXCJ0ZXh0XCIgOiBvcHRpb25zLnJlc3BvbnNlVHlwZSxcblx0XHRcdFx0Y2FsbGJhY2s6IChlcnI6IGFueSwgZGF0YTogYW55LCByZXF1ZXN0OiBYTUxIdHRwUmVxdWVzdCkgPT4ge1xuXHRcdFx0XHRcdGlmIChlcnIpIHJldHVybiByZXNvbHZlKFtmYWxzZSwgZXJyIHx8IG5ldyBFcnJvcihcIlVua25vd24gZXJyb3JcIiksIHVuZGVmaW5lZF0pO1xuXG5cdFx0XHRcdFx0Ly8gQ3JlYXRlIGEgbWFwIG9mIGhlYWRlciBuYW1lcyB0byB2YWx1ZXNcblxuXHRcdFx0XHRcdGNvbnN0IGhlYWRlcnMgPSB7fSBhcyBhbnk7XG5cdFx0XHRcdFx0cmVxdWVzdC5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKT8udHJpbSgpLnNwbGl0KC9bXFxyXFxuXSsvKS5mb3JFYWNoKChsaW5lKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXJ0cyA9IGxpbmUuc3BsaXQoXCI6IFwiKTtcblx0XHRcdFx0XHRcdGNvbnN0IGhlYWRlciA9IHBhcnRzLnNoaWZ0KCk/LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IHBhcnRzLmpvaW4oXCI6IFwiKTtcblx0XHRcdFx0XHRcdGlmIChoZWFkZXIpIGhlYWRlcnNbaGVhZGVyXSA9IHZhbHVlO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdC8vIFJlc29sdmUgdGhlIHByb21pc2Ugd2l0aCB0aGUgcmVzcG9uc2UgZGF0YSBhbmQgaGVhZGVyc1xuXHRcdFx0XHRcdHJlc29sdmUoW3RydWUsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0XHRcdGRhdGE6IG9wdGlvbnMucmVzcG9uc2VUeXBlID09PSBcImpzb25cIiA/ICR0dy51dGlscy5wYXJzZUpTT05TYWZlKGRhdGEsICgpID0+IHVuZGVmaW5lZCkgOiBkYXRhLFxuXHRcdFx0XHRcdH1dKTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXHQvKlxuXHRHZXQgdGhlIGN1cnJlbnQgc3RhdHVzIG9mIHRoZSBzZXJ2ZXIgY29ubmVjdGlvblxuXHQqL1xuXHRhc3luYyBnZXRTdGF0dXMoY2FsbGJhY2s6IChcblx0XHRlcnI6IGFueSxcblx0XHRpc0xvZ2dlZEluPzogYm9vbGVhbixcblx0XHR1c2VybmFtZT86IHN0cmluZyxcblx0XHRpc1JlYWRPbmx5PzogYm9vbGVhbixcblx0XHRpc0Fub255bW91cz86IGJvb2xlYW4sXG5cdCkgPT4gdm9pZCkge1xuXHRcdGludGVyZmFjZSBVc2VyQXV0aFN0YXR1cyB7XG5cdFx0XHRpc0FkbWluOiBib29sZWFuO1xuXHRcdFx0dXNlcl9pZDogbnVtYmVyO1xuXHRcdFx0dXNlcm5hbWU6IHN0cmluZztcblx0XHRcdGlzTG9nZ2VkSW46IGJvb2xlYW47XG5cdFx0XHRpc1JlYWRPbmx5OiBib29sZWFuO1xuXHRcdFx0YWxsb3dBbm9uUmVhZHM6IGJvb2xlYW47XG5cdFx0XHRhbGxvd0Fub25Xcml0ZXM6IGJvb2xlYW47XG5cdFx0fVxuXG5cdFx0Y29uc3QgW29rLCBlcnJvciwgZGF0YV0gPSBhd2FpdCB0aGlzLmh0dHBSZXF1ZXN0KHtcblx0XHRcdHVybDogdGhpcy5ob3N0ICsgXCJyZWNpcGVzL1wiICsgdGhpcy5yZWNpcGUgKyBcIi9zdGF0dXNcIixcblx0XHRcdHR5cGU6IFwiR0VUXCIsXG5cdFx0XHRyZXNwb25zZVR5cGU6IFwianNvblwiLFxuXHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcIlgtUmVxdWVzdGVkLVdpdGhcIjogXCJUaWRkbHlXaWtpXCJcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0aWYgKCFvaykge1xuXHRcdFx0dGhpcy5sb2dnZXIubG9nKFwiRXJyb3IgZ2V0dGluZyBzdGF0dXNcIiwgZXJyb3IpO1xuXHRcdFx0aWYgKGNhbGxiYWNrKSBjYWxsYmFjayhlcnJvcik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8qKiBAdHlwZSB7UGFydGlhbDxVc2VyQXV0aFN0YXR1cz59ICovXG5cdFx0Y29uc3Qgc3RhdHVzID0gZGF0YS5kYXRhO1xuXHRcdGlmIChjYWxsYmFjaykge1xuXHRcdFx0Y2FsbGJhY2soXG5cdFx0XHRcdC8vIEVycm9yXG5cdFx0XHRcdG51bGwsXG5cdFx0XHRcdC8vIElzIGxvZ2dlZCBpblxuXHRcdFx0XHRzdGF0dXMuaXNMb2dnZWRJbiA/PyBmYWxzZSxcblx0XHRcdFx0Ly8gVXNlcm5hbWVcblx0XHRcdFx0c3RhdHVzLnVzZXJuYW1lID8/IFwiKGFub24pXCIsXG5cdFx0XHRcdC8vIElzIHJlYWQgb25seVxuXHRcdFx0XHRzdGF0dXMuaXNSZWFkT25seSA/PyB0cnVlLFxuXHRcdFx0XHQvLyBJcyBhbm9ueW1vdXNcblx0XHRcdFx0IXN0YXR1cy5pc0xvZ2dlZEluLFxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblx0Lypcblx0R2V0IGRldGFpbHMgb2YgY2hhbmdlZCB0aWRkbGVycyBmcm9tIHRoZSBzZXJ2ZXJcblx0Ki9cblx0Z2V0VXBkYXRlZFRpZGRsZXJzKHN5bmNlcjogU3luY2VyLCBjYWxsYmFjazogKGVycjogYW55LCBjaGFuZ2VzPzogeyBtb2RpZmljYXRpb25zOiBzdHJpbmdbXTsgZGVsZXRpb25zOiBzdHJpbmdbXSB9KSA9PiB2b2lkKSB7XG5cdFx0aWYgKCF0aGlzLnVzZVNlcnZlclNlbnRFdmVudHMpIHtcblx0XHRcdHRoaXMucG9sbFNlcnZlcih7XG5cdFx0XHRcdGNhbGxiYWNrOiBmdW5jdGlvbiAoZXJyLCBjaGFuZ2VzKSB7XG5cdFx0XHRcdFx0Y2FsbGJhY2sobnVsbCwgY2hhbmdlcyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHQvLyBEbyBub3RoaW5nIGlmIHRoZXJlJ3MgYWxyZWFkeSBhIGNvbm5lY3Rpb24gaW4gcHJvZ3Jlc3MuXG5cdFx0aWYgKHRoaXMuc2VydmVyVXBkYXRlQ29ubmVjdGlvblN0YXR1cyAhPT0gU0VSVkVSX05PVF9DT05ORUNURUQpIHtcblx0XHRcdHJldHVybiBjYWxsYmFjayhudWxsLCB7XG5cdFx0XHRcdG1vZGlmaWNhdGlvbnM6IFtdLFxuXHRcdFx0XHRkZWxldGlvbnM6IFtdXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Ly8gVHJ5IHRvIGNvbm5lY3QgYSBzZXJ2ZXIgc3RyZWFtXG5cdFx0dGhpcy5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9DT05ORUNUSU5HX1NTRSk7XG5cdFx0dGhpcy5jb25uZWN0U2VydmVyU3RyZWFtKHtcblx0XHRcdHN5bmNlcjogc3luY2VyLFxuXHRcdFx0b25lcnJvcjogZnVuY3Rpb24gKGVycikge1xuXHRcdFx0XHRzZWxmLmxvZ2dlci5sb2coXCJFcnJvciBjb25uZWN0aW5nIFNTRSBzdHJlYW1cIiwgZXJyKTtcblx0XHRcdFx0Ly8gSWYgdGhlIHN0cmVhbSBkaWRuJ3Qgd29yaywgdHJ5IHBvbGxpbmdcblx0XHRcdFx0c2VsZi5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9QT0xMSU5HKTtcblx0XHRcdFx0c2VsZi5wb2xsU2VydmVyKHtcblx0XHRcdFx0XHRjYWxsYmFjazogZnVuY3Rpb24gKGVyciwgY2hhbmdlcykge1xuXHRcdFx0XHRcdFx0c2VsZi5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9OT1RfQ09OTkVDVEVEKTtcblx0XHRcdFx0XHRcdGNhbGxiYWNrKG51bGwsIGNoYW5nZXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0b25vcGVuOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHNlbGYuc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhTRVJWRVJfQ09OTkVDVEVEX1NTRSk7XG5cdFx0XHRcdC8vIFRoZSBzeW5jZXIgaXMgZXhwZWN0aW5nIGEgY2FsbGJhY2sgYnV0IHdlIGRvbid0IGhhdmUgYW55IGRhdGEgdG8gc2VuZFxuXHRcdFx0XHRjYWxsYmFjayhudWxsLCB7XG5cdFx0XHRcdFx0bW9kaWZpY2F0aW9uczogW10sXG5cdFx0XHRcdFx0ZGVsZXRpb25zOiBbXVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHR9XG5cdC8qXG5cdEF0dGVtcHQgdG8gZXN0YWJsaXNoIGFuIFNTRSBzdHJlYW0gd2l0aCB0aGUgc2VydmVyIGFuZCB0cmFuc2ZlciB0aWRkbGVyIGNoYW5nZXMuIE9wdGlvbnMgaW5jbHVkZTpcbiAgXG5cdHN5bmNlcjogcmVmZXJlbmNlIHRvIHN5bmNlciBvYmplY3QgdXNlZCBmb3Igc3RvcmluZyBkYXRhXG5cdG9ub3BlbjogaW52b2tlZCB3aGVuIHRoZSBzdHJlYW0gaXMgc3VjY2Vzc2Z1bGx5IG9wZW5lZFxuXHRvbmVycm9yOiBpbnZva2VkIGlmIHRoZXJlIGlzIGFuIGVycm9yXG5cdCovXG5cdGNvbm5lY3RTZXJ2ZXJTdHJlYW0ob3B0aW9uczoge1xuXHRcdHN5bmNlcjogU3luY2VyO1xuXHRcdG9ub3BlbjogKGV2ZW50OiBFdmVudCkgPT4gdm9pZDtcblx0XHRvbmVycm9yOiAoZXZlbnQ6IEV2ZW50KSA9PiB2b2lkO1xuXHR9KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdGNvbnN0IGV2ZW50U291cmNlID0gbmV3IEV2ZW50U291cmNlKFwiL3JlY2lwZXMvXCIgKyB0aGlzLnJlY2lwZSArIFwiL2V2ZW50cz9sYXN0X2tub3duX3RpZGRsZXJfaWQ9XCIgKyB0aGlzLmxhc3Rfa25vd25fdGlkZGxlcl9pZCk7XG5cdFx0ZXZlbnRTb3VyY2Uub25lcnJvciA9IGZ1bmN0aW9uIChldmVudCkge1xuXHRcdFx0aWYgKG9wdGlvbnMub25lcnJvcikge1xuXHRcdFx0XHRvcHRpb25zLm9uZXJyb3IoZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZXZlbnRTb3VyY2Uub25vcGVuID0gZnVuY3Rpb24gKGV2ZW50KSB7XG5cdFx0XHRpZiAob3B0aW9ucy5vbm9wZW4pIHtcblx0XHRcdFx0b3B0aW9ucy5vbm9wZW4oZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZXZlbnRTb3VyY2UuYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCBmdW5jdGlvbiAoZXZlbnQpIHtcblxuXHRcdFx0Y29uc3QgZGF0YToge1xuXHRcdFx0XHR0aXRsZTogc3RyaW5nO1xuXHRcdFx0XHR0aWRkbGVyX2lkOiBudW1iZXI7XG5cdFx0XHRcdGlzX2RlbGV0ZWQ6IGJvb2xlYW47XG5cdFx0XHRcdGJhZ19uYW1lOiBzdHJpbmc7XG5cdFx0XHRcdHRpZGRsZXI6IGFueTtcblx0XHRcdH0gPSAkdHcudXRpbHMucGFyc2VKU09OU2FmZShldmVudC5kYXRhKTtcblx0XHRcdGlmICghZGF0YSkgcmV0dXJuO1xuXG5cdFx0XHRjb25zb2xlLmxvZyhcIlNTRSBkYXRhXCIsIGRhdGEpO1xuXHRcdFx0Ly8gVXBkYXRlIGxhc3Qgc2VlbiB0aWRkbGVyX2lkXG5cdFx0XHRpZiAoZGF0YS50aWRkbGVyX2lkID4gc2VsZi5sYXN0X2tub3duX3RpZGRsZXJfaWQpIHtcblx0XHRcdFx0c2VsZi5sYXN0X2tub3duX3RpZGRsZXJfaWQgPSBkYXRhLnRpZGRsZXJfaWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBSZWNvcmQgdGhlIGxhc3QgdXBkYXRlIHRvIHRoaXMgdGlkZGxlclxuXHRcdFx0c2VsZi5sYXN0UmVjb3JkZWRVcGRhdGVbZGF0YS50aXRsZV0gPSB7XG5cdFx0XHRcdHR5cGU6IGRhdGEuaXNfZGVsZXRlZCA/IFwiZGVsZXRpb25cIiA6IFwidXBkYXRlXCIsXG5cdFx0XHRcdHRpZGRsZXJfaWQ6IGRhdGEudGlkZGxlcl9pZFxuXHRcdFx0fTtcblx0XHRcdGNvbnNvbGUubG9nKGBPdXN0YW5kaW5nIHJlcXVlc3RzIGlzICR7SlNPTi5zdHJpbmdpZnkoc2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW2RhdGEudGl0bGVdKX1gKTtcblx0XHRcdC8vIFByb2Nlc3MgdGhlIHVwZGF0ZSBpZiB0aGUgdGlkZGxlciBpcyBub3QgdGhlIHN1YmplY3Qgb2YgYW4gb3V0c3RhbmRpbmcgcmVxdWVzdFxuXHRcdFx0aWYgKHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1tkYXRhLnRpdGxlXSkgcmV0dXJuO1xuXHRcdFx0aWYgKGRhdGEuaXNfZGVsZXRlZCkge1xuXHRcdFx0XHRzZWxmLnJlbW92ZVRpZGRsZXJJbmZvKGRhdGEudGl0bGUpO1xuXHRcdFx0XHRkZWxldGUgb3B0aW9ucy5zeW5jZXIudGlkZGxlckluZm9bZGF0YS50aXRsZV07XG5cdFx0XHRcdG9wdGlvbnMuc3luY2VyLmxvZ2dlci5sb2coXCJEZWxldGluZyB0aWRkbGVyIG1pc3NpbmcgZnJvbSBzZXJ2ZXI6XCIsIGRhdGEudGl0bGUpO1xuXHRcdFx0XHRvcHRpb25zLnN5bmNlci53aWtpLmRlbGV0ZVRpZGRsZXIoZGF0YS50aXRsZSk7XG5cdFx0XHRcdG9wdGlvbnMuc3luY2VyLnByb2Nlc3NUYXNrUXVldWUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhciByZXN1bHQgPSBzZWxmLmluY29taW5nVXBkYXRlc0ZpbHRlckZuLmNhbGwoc2VsZi53aWtpLCBzZWxmLndpa2kubWFrZVRpZGRsZXJJdGVyYXRvcihbZGF0YS50aXRsZV0pKTtcblx0XHRcdFx0aWYgKHJlc3VsdC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0c2VsZi5zZXRUaWRkbGVySW5mbyhkYXRhLnRpdGxlLCBkYXRhLnRpZGRsZXJfaWQudG9TdHJpbmcoKSwgZGF0YS5iYWdfbmFtZSk7XG5cdFx0XHRcdFx0b3B0aW9ucy5zeW5jZXIuc3RvcmVUaWRkbGVyKGRhdGEudGlkZGxlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXG5cdFx0fSk7XG5cdH1cblx0Lypcblx0UG9sbCB0aGUgc2VydmVyIGZvciBjaGFuZ2VzLiBPcHRpb25zIGluY2x1ZGU6XG4gIFxuXHRjYWxsYmFjazogaW52b2tlZCBvbiBjb21wbGV0aW9uIGFzIChlcnIsY2hhbmdlcylcblx0Ki9cblx0YXN5bmMgcG9sbFNlcnZlcihvcHRpb25zOiB7XG5cdFx0Y2FsbGJhY2s6IChlcnI6IGFueSwgY2hhbmdlcz86IHsgbW9kaWZpY2F0aW9uczogc3RyaW5nW107IGRlbGV0aW9uczogc3RyaW5nW10gfSkgPT4gdm9pZDtcblx0fSkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRjb25zdCBbb2ssIGVyciwgcmVzdWx0XSA9IGF3YWl0IHRoaXMuaHR0cFJlcXVlc3Qoe1xuXHRcdFx0dXJsOiB0aGlzLmhvc3QgKyBcInJlY2lwZXMvXCIgKyB0aGlzLnJlY2lwZSArIFwiL3RpZGRsZXJzLmpzb25cIixcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0bGFzdF9rbm93bl90aWRkbGVyX2lkOiB0aGlzLmxhc3Rfa25vd25fdGlkZGxlcl9pZCxcblx0XHRcdFx0aW5jbHVkZV9kZWxldGVkOiBcInRydWVcIlxuXHRcdFx0fSxcblx0XHRcdHJlc3BvbnNlVHlwZTogXCJqc29uXCIsXG5cdFx0fSk7XG5cblx0XHRpZiAoIW9rKSB7IHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGVycik7IH1cblx0XHRjb25zdCB7IGRhdGE6IHRpZGRsZXJJbmZvQXJyYXkgPSBbXSB9ID0gcmVzdWx0O1xuXG5cdFx0dmFyIG1vZGlmaWNhdGlvbnM6IHN0cmluZ1tdID0gW10sIGRlbGV0aW9uczogc3RyaW5nW10gPSBbXTtcblxuXHRcdCR0dy51dGlscy5lYWNoKHRpZGRsZXJJbmZvQXJyYXksXG5cdFx0XHQvKipcblx0XHRcdCAqIEBwYXJhbSB7eyB0aXRsZTogc3RyaW5nOyB0aWRkbGVyX2lkOiBudW1iZXI7IGlzX2RlbGV0ZWQ6IGJvb2xlYW47IGJhZ19uYW1lOiBzdHJpbmc7IH19IHRpZGRsZXJJbmZvIFxuXHRcdFx0ICovXG5cdFx0XHRmdW5jdGlvbiAodGlkZGxlckluZm8pIHtcblx0XHRcdFx0aWYgKHRpZGRsZXJJbmZvLnRpZGRsZXJfaWQgPiBzZWxmLmxhc3Rfa25vd25fdGlkZGxlcl9pZCkge1xuXHRcdFx0XHRcdHNlbGYubGFzdF9rbm93bl90aWRkbGVyX2lkID0gdGlkZGxlckluZm8udGlkZGxlcl9pZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGlkZGxlckluZm8uaXNfZGVsZXRlZCkge1xuXHRcdFx0XHRcdGRlbGV0aW9ucy5wdXNoKHRpZGRsZXJJbmZvLnRpdGxlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRtb2RpZmljYXRpb25zLnB1c2godGlkZGxlckluZm8udGl0bGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdC8vIEludm9rZSB0aGUgY2FsbGJhY2sgd2l0aCB0aGUgcmVzdWx0c1xuXHRcdG9wdGlvbnMuY2FsbGJhY2sobnVsbCwge1xuXHRcdFx0bW9kaWZpY2F0aW9uczogbW9kaWZpY2F0aW9ucyxcblx0XHRcdGRlbGV0aW9uczogZGVsZXRpb25zXG5cdFx0fSk7XG5cblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdC8vIElmIEJyb3dzd2VyIFN0b3JhZ2UgdGlkZGxlcnMgd2VyZSBjYWNoZWQgb24gcmVsb2FkaW5nIHRoZSB3aWtpLCBhZGQgdGhlbSBhZnRlciBzeW5jIGZyb20gc2VydmVyIGNvbXBsZXRlcyBpbiB0aGUgYWJvdmUgY2FsbGJhY2suXG5cdFx0XHRpZiAoJHR3LmJyb3dzZXJTdG9yYWdlICYmICR0dy5icm93c2VyU3RvcmFnZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHQkdHcuYnJvd3NlclN0b3JhZ2UuYWRkQ2FjaGVkVGlkZGxlcnMoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHQvKlxuXHRRdWV1ZSBhIGxvYWQgZm9yIGEgdGlkZGxlciBpZiB0aGVyZSBoYXMgYmVlbiBhbiB1cGRhdGUgZm9yIGl0IHNpbmNlIHRoZSBzcGVjaWZpZWQgcmV2aXNpb25cblx0Ki9cblx0Y2hlY2tMYXN0UmVjb3JkZWRVcGRhdGUodGl0bGU6IHN0cmluZywgcmV2aXNpb246IHN0cmluZykge1xuXHRcdHZhciBscnUgPSB0aGlzLmxhc3RSZWNvcmRlZFVwZGF0ZVt0aXRsZV07XG5cdFx0aWYgKGxydSkge1xuXHRcdFx0dmFyIG51bVJldmlzaW9uID0gJHR3LnV0aWxzLmdldEludChyZXZpc2lvbiwgMCk7XG5cdFx0XHRpZiAoIW51bVJldmlzaW9uKSB7XG5cdFx0XHRcdHRoaXMubG9nZ2VyLmxvZyhcIkVycm9yOiByZXZpc2lvbiBpcyBub3QgYSBudW1iZXJcIiwgcmV2aXNpb24pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zb2xlLmxvZyhgQ2hlY2tpbmcgZm9yIHVwZGF0ZXMgdG8gJHt0aXRsZX0gc2luY2UgJHtKU09OLnN0cmluZ2lmeShyZXZpc2lvbil9IGNvbXBhcmluZyB0byAke251bVJldmlzaW9ufWApO1xuXHRcdFx0aWYgKGxydS50aWRkbGVyX2lkID4gbnVtUmV2aXNpb24pIHtcblx0XHRcdFx0dGhpcy5zeW5jZXIgJiYgdGhpcy5zeW5jZXIuZW5xdWV1ZUxvYWRUaWRkbGVyKHRpdGxlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0Z2V0IHN5bmNlcigpIHtcblx0XHQvL0B0cy1leHBlY3QtZXJyb3Jcblx0XHRpZiAoJHR3LnN5bmNhZGFwdG9yID09PSB0aGlzKSByZXR1cm4gJHR3LnN5bmNlcjtcblx0fVxuXHQvKlxuXHRTYXZlIGEgdGlkZGxlciBhbmQgaW52b2tlIHRoZSBjYWxsYmFjayB3aXRoIChlcnIsYWRhcHRvckluZm8scmV2aXNpb24pXG5cdCovXG5cdGFzeW5jIHNhdmVUaWRkbGVyKFxuXHRcdHRpZGRsZXI6IFRpZGRsZXIsXG5cdFx0Y2FsbGJhY2s6IChlcnI6IGFueSwgYWRhcHRvckluZm8/OiB7IGJhZzogc3RyaW5nIH0sIHJldmlzaW9uPzogc3RyaW5nKSA9PiB2b2lkLFxuXHRcdG9wdGlvbnM/OiB7fVxuXHQpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXMsIHRpdGxlID0gdGlkZGxlci5maWVsZHMudGl0bGU7XG5cdFx0aWYgKHRoaXMuaXNSZWFkT25seSB8fCB0aXRsZS5zdWJzdHIoMCwgTVdDX1NUQVRFX1RJRERMRVJfUFJFRklYLmxlbmd0aCkgPT09IE1XQ19TVEFURV9USURETEVSX1BSRUZJWCkge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKG51bGwpO1xuXHRcdH1cblx0XHRzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdID0geyB0eXBlOiBcIlBVVFwiIH07XG5cdFx0Y29uc3QgW29rLCBlcnIsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLmh0dHBSZXF1ZXN0KHtcblx0XHRcdHVybDogdGhpcy5ob3N0ICsgXCJyZWNpcGVzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMucmVjaXBlKSArIFwiL3RpZGRsZXJzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRpdGxlKSxcblx0XHRcdHR5cGU6IFwiUFVUXCIsXG5cdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFwiQ29udGVudC10eXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiXG5cdFx0XHR9LFxuXHRcdFx0ZGF0YTogSlNPTi5zdHJpbmdpZnkodGlkZGxlci5nZXRGaWVsZFN0cmluZ3MoKSksXG5cdFx0XHRyZXNwb25zZVR5cGU6IFwianNvblwiLFxuXHRcdH0pO1xuXHRcdGRlbGV0ZSBzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdO1xuXHRcdGlmICghb2spIHJldHVybiBjYWxsYmFjayhlcnIpO1xuXHRcdGNvbnN0IHsgaGVhZGVycywgZGF0YSB9ID0gcmVzdWx0O1xuXG5cdFx0Ly9JZiBCcm93c2VyLVN0b3JhZ2UgcGx1Z2luIGlzIHByZXNlbnQsIHJlbW92ZSB0aWRkbGVyIGZyb20gbG9jYWwgc3RvcmFnZSBhZnRlciBzdWNjZXNzZnVsIHN5bmMgdG8gdGhlIHNlcnZlclxuXHRcdGlmICgkdHcuYnJvd3NlclN0b3JhZ2UgJiYgJHR3LmJyb3dzZXJTdG9yYWdlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHQkdHcuYnJvd3NlclN0b3JhZ2UucmVtb3ZlVGlkZGxlckZyb21Mb2NhbFN0b3JhZ2UodGl0bGUpO1xuXHRcdH1cblxuXHRcdC8vIFNhdmUgdGhlIGRldGFpbHMgb2YgdGhlIG5ldyByZXZpc2lvbiBvZiB0aGUgdGlkZGxlclxuXHRcdGNvbnN0IHJldmlzaW9uID0gZGF0YS50aWRkbGVyX2lkLCBiYWdfbmFtZSA9IGRhdGEuYmFnX25hbWU7XG5cdFx0Y29uc29sZS5sb2coYFNhdmVkICR7dGl0bGV9IHdpdGggcmV2aXNpb24gJHtyZXZpc2lvbn0gYW5kIGJhZyAke2JhZ19uYW1lfWApO1xuXHRcdC8vIElmIHRoZXJlIGhhcyBiZWVuIGEgbW9yZSByZWNlbnQgdXBkYXRlIGZyb20gdGhlIHNlcnZlciB0aGVuIGVucXVldWUgYSBsb2FkIG9mIHRoaXMgdGlkZGxlclxuXHRcdHNlbGYuY2hlY2tMYXN0UmVjb3JkZWRVcGRhdGUodGl0bGUsIHJldmlzaW9uKTtcblx0XHQvLyBJbnZva2UgdGhlIGNhbGxiYWNrXG5cdFx0c2VsZi5zZXRUaWRkbGVySW5mbyh0aXRsZSwgcmV2aXNpb24sIGJhZ19uYW1lKTtcblx0XHRjYWxsYmFjayhudWxsLCB7IGJhZzogYmFnX25hbWUgfSwgcmV2aXNpb24pO1xuXG5cdH1cblx0Lypcblx0TG9hZCBhIHRpZGRsZXIgYW5kIGludm9rZSB0aGUgY2FsbGJhY2sgd2l0aCAoZXJyLHRpZGRsZXJGaWVsZHMpXG5cblx0VGhlIHN5bmNlciBkb2VzIG5vdCBwYXNzIGl0c2VsZiBpbnRvIG9wdGlvbnMuXG5cdCovXG5cdGFzeW5jIGxvYWRUaWRkbGVyKHRpdGxlOiBzdHJpbmcsIGNhbGxiYWNrOiAoZXJyOiBhbnksIGZpZWxkcz86IGFueSkgPT4gdm9pZCwgb3B0aW9uczogYW55KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV0gPSB7IHR5cGU6IFwiR0VUXCIgfTtcblx0XHRjb25zdCBbb2ssIGVyciwgcmVzdWx0XSA9IGF3YWl0IHRoaXMuaHR0cFJlcXVlc3Qoe1xuXHRcdFx0dXJsOiB0aGlzLmhvc3QgKyBcInJlY2lwZXMvXCIgKyBlbmNvZGVVUklDb21wb25lbnQodGhpcy5yZWNpcGUpICsgXCIvdGlkZGxlcnMvXCIgKyBlbmNvZGVVUklDb21wb25lbnQodGl0bGUpLFxuXHRcdH0pO1xuXHRcdGRlbGV0ZSBzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdO1xuXHRcdGlmIChlcnIgPT09IDQwNCkge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKG51bGwsIG51bGwpO1xuXHRcdH0gZWxzZSBpZiAoIW9rKSB7XG5cdFx0XHRyZXR1cm4gY2FsbGJhY2soZXJyKTtcblx0XHR9XG5cdFx0Y29uc3QgeyBkYXRhLCBoZWFkZXJzIH0gPSByZXN1bHQ7XG5cdFx0Y29uc3QgcmV2aXNpb24gPSBoZWFkZXJzW1wieC1yZXZpc2lvbi1udW1iZXJcIl0sIGJhZ19uYW1lID0gaGVhZGVyc1tcIngtYmFnLW5hbWVcIl07XG5cdFx0Ly8gSWYgdGhlcmUgaGFzIGJlZW4gYSBtb3JlIHJlY2VudCB1cGRhdGUgZnJvbSB0aGUgc2VydmVyIHRoZW4gZW5xdWV1ZSBhIGxvYWQgb2YgdGhpcyB0aWRkbGVyXG5cdFx0c2VsZi5jaGVja0xhc3RSZWNvcmRlZFVwZGF0ZSh0aXRsZSwgcmV2aXNpb24pO1xuXHRcdC8vIEludm9rZSB0aGUgY2FsbGJhY2tcblx0XHRzZWxmLnNldFRpZGRsZXJJbmZvKHRpdGxlLCByZXZpc2lvbiwgYmFnX25hbWUpO1xuXHRcdGNhbGxiYWNrKG51bGwsICR0dy51dGlscy5wYXJzZUpTT05TYWZlKGRhdGEpKTtcblx0fVxuXHQvKlxuXHREZWxldGUgYSB0aWRkbGVyIGFuZCBpbnZva2UgdGhlIGNhbGxiYWNrIHdpdGggKGVycilcblx0b3B0aW9ucyBpbmNsdWRlOlxuXHR0aWRkbGVySW5mbzogdGhlIHN5bmNlcidzIHRpZGRsZXJJbmZvIGZvciB0aGlzIHRpZGRsZXJcblx0Ki9cblx0YXN5bmMgZGVsZXRlVGlkZGxlcih0aXRsZTogc3RyaW5nLCBjYWxsYmFjazogKGVycjogYW55LCBhZGFwdG9ySW5mbz86IGFueSkgPT4gdm9pZCwgb3B0aW9uczogYW55KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdGlmICh0aGlzLmlzUmVhZE9ubHkpIHsgcmV0dXJuIGNhbGxiYWNrKG51bGwpOyB9XG5cdFx0Ly8gSWYgd2UgZG9uJ3QgaGF2ZSBhIGJhZyBpdCBtZWFucyB0aGF0IHRoZSB0aWRkbGVyIGhhc24ndCBiZWVuIHNlZW4gYnkgdGhlIHNlcnZlciwgc28gd2UgZG9uJ3QgbmVlZCB0byBkZWxldGUgaXRcblx0XHQvLyB2YXIgYmFnID0gdGhpcy5nZXRUaWRkbGVyQmFnKHRpdGxlKTtcblx0XHQvLyBpZighYmFnKSB7IHJldHVybiBjYWxsYmFjayhudWxsLCBvcHRpb25zLnRpZGRsZXJJbmZvLmFkYXB0b3JJbmZvKTsgfVxuXHRcdHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV0gPSB7IHR5cGU6IFwiREVMRVRFXCIgfTtcblx0XHQvLyBJc3N1ZSBIVFRQIHJlcXVlc3QgdG8gZGVsZXRlIHRoZSB0aWRkbGVyXG5cdFx0Y29uc3QgW29rLCBlcnIsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLmh0dHBSZXF1ZXN0KHtcblx0XHRcdHVybDogdGhpcy5ob3N0ICsgXCJyZWNpcGVzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMucmVjaXBlKSArIFwiL3RpZGRsZXJzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRpdGxlKSxcblx0XHRcdHR5cGU6IFwiREVMRVRFXCIsXG5cdFx0fSk7XG5cdFx0ZGVsZXRlIHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV07XG5cdFx0aWYgKCFvaykgeyByZXR1cm4gY2FsbGJhY2soZXJyKTsgfVxuXHRcdGNvbnN0IHsgZGF0YSB9ID0gcmVzdWx0O1xuXHRcdGNvbnN0IHJldmlzaW9uID0gZGF0YS50aWRkbGVyX2lkLCBiYWdfbmFtZSA9IGRhdGEuYmFnX25hbWU7XG5cdFx0Ly8gSWYgdGhlcmUgaGFzIGJlZW4gYSBtb3JlIHJlY2VudCB1cGRhdGUgZnJvbSB0aGUgc2VydmVyIHRoZW4gZW5xdWV1ZSBhIGxvYWQgb2YgdGhpcyB0aWRkbGVyXG5cdFx0c2VsZi5jaGVja0xhc3RSZWNvcmRlZFVwZGF0ZSh0aXRsZSwgcmV2aXNpb24pO1xuXHRcdHNlbGYucmVtb3ZlVGlkZGxlckluZm8odGl0bGUpO1xuXHRcdC8vIEludm9rZSB0aGUgY2FsbGJhY2sgJiByZXR1cm4gbnVsbCBhZGFwdG9ySW5mb1xuXHRcdGNhbGxiYWNrKG51bGwsIG51bGwpO1xuXHR9XG59XG5cblxuaWYgKCR0dy5icm93c2VyICYmIGRvY3VtZW50LmxvY2F0aW9uLnByb3RvY29sLnN0YXJ0c1dpdGgoXCJodHRwXCIpKSB7XG5cdGV4cG9ydHMuYWRhcHRvckNsYXNzID0gTXVsdGlXaWtpQ2xpZW50QWRhcHRvcjtcbn1cbiJdfQ==