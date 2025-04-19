/*\
title: $:/plugins/tiddlywiki/tiddlyweb/tiddlywebadaptor.js
type: application/javascript
module-type: syncadaptor

A sync adaptor module for synchronising with MultiWikiServer-compatible servers.

It has three key areas of concern:

* Basic operations like put, get, and delete a tiddler on the server
* Real time updates from the server (handled by SSE)
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
            // TODO: not using getFieldStringBlock because what happens if a field name has a colon in it?
            let body = JSON.stringify(tiddler.getFieldStrings({ exclude: ["text"] }));
            if (tiddler.hasField("text")) {
                if (typeof tiddler.fields.text !== "string" && tiddler.fields.text)
                    return callback(new Error("Error saving tiddler " + tiddler.fields.title + ": the text field is truthy but not a string"));
                body += `\n\n${tiddler.fields.text}`;
            }
            const [ok, err, result] = yield this.httpRequest({
                url: this.host + "recipes/" + encodeURIComponent(this.recipe) + "/tiddlers/" + encodeURIComponent(title),
                type: "PUT",
                headers: {
                    "Content-type": "application/x-mws-tiddler"
                },
                data: body,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGl3aWtpY2xpZW50YWRhcHRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tdWx0aXdpa2ljbGllbnRhZGFwdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHO0FBRUgsa0VBQWtFO0FBQ2xFLFlBQVksQ0FBQzs7Ozs7Ozs7Ozs7QUFzQmIsSUFBSSxtQkFBbUIsR0FBRyxnQ0FBZ0MsRUFDekQsb0JBQW9CLEdBQUcscUJBQXFCLEVBQzVDLHdCQUF3QixHQUFHLDJCQUEyQixFQUN0RCxpQkFBaUIsR0FBRyx1Q0FBdUMsRUFDM0Qsc0JBQXNCLEdBQUcsNENBQTRDLEVBQ3JFLHdCQUF3QixHQUFHLHFDQUFxQyxFQUNoRSwrQkFBK0IsR0FBRyxtREFBbUQsRUFDckYsa0JBQWtCLEdBQUcsa0RBQWtELENBQUM7QUFFekUsSUFBSSxvQkFBb0IsR0FBRyxlQUFlLEVBQ3pDLHFCQUFxQixHQUFHLGdCQUFnQixFQUN4QyxvQkFBb0IsR0FBRyxlQUFlLEVBQ3RDLGNBQWMsR0FBRyxnQkFBZ0IsQ0FBQztBQUVuQyxNQUFNLHNCQUFzQjtJQWlCM0IsWUFBWSxPQUFzQjtRQUZsQyxTQUFJLEdBQUcsaUJBQWlCLENBQUM7UUFDekIsd0JBQW1CLEdBQUcsSUFBSSxDQUFDO1FBRTFCLElBQUksQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQztRQUN6QixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUMzQixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7UUFDM0UsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLEtBQUssS0FBSyxDQUFDO1FBQ2xGLElBQUksQ0FBQyxxQkFBcUIsR0FBRyxHQUFHLENBQUMsS0FB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QUFJLEdBQUcsVUFBVSxHQUFHLGtCQUFrQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxZQUFZLEdBQUcsa0JBQWtCLENBQUMsS0FBSyxDQUFDO2dCQUN4RyxJQUFJLEVBQUUsUUFBUTthQUNkLENBQUMsQ0FBQztZQUNILE9BQU8sSUFBSSxDQUFDLG1CQUFtQixDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQ3ZDLElBQUksQ0FBQyxFQUFFLEVBQUUsQ0FBQztnQkFBQyxPQUFPLFFBQVEsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUFDLENBQUM7WUFDbEMsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLE1BQU0sQ0FBQztZQUN4QixNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsVUFBVSxFQUFFLFFBQVEsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDO1lBQzNELDZGQUE2RjtZQUM3RixJQUFJLENBQUMsdUJBQXVCLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1lBQzlDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUM5QixnREFBZ0Q7WUFDaEQsUUFBUSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN0QixDQUFDO0tBQUE7Q0FDRDtBQUdELElBQUksR0FBRyxDQUFDLE9BQU8sSUFBSSxRQUFRLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztJQUNsRSxPQUFPLENBQUMsWUFBWSxHQUFHLHNCQUFzQixDQUFDO0FBQy9DLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxcXG50aXRsZTogJDovcGx1Z2lucy90aWRkbHl3aWtpL3RpZGRseXdlYi90aWRkbHl3ZWJhZGFwdG9yLmpzXG50eXBlOiBhcHBsaWNhdGlvbi9qYXZhc2NyaXB0XG5tb2R1bGUtdHlwZTogc3luY2FkYXB0b3JcblxuQSBzeW5jIGFkYXB0b3IgbW9kdWxlIGZvciBzeW5jaHJvbmlzaW5nIHdpdGggTXVsdGlXaWtpU2VydmVyLWNvbXBhdGlibGUgc2VydmVycy4gXG5cbkl0IGhhcyB0aHJlZSBrZXkgYXJlYXMgb2YgY29uY2VybjpcblxuKiBCYXNpYyBvcGVyYXRpb25zIGxpa2UgcHV0LCBnZXQsIGFuZCBkZWxldGUgYSB0aWRkbGVyIG9uIHRoZSBzZXJ2ZXJcbiogUmVhbCB0aW1lIHVwZGF0ZXMgZnJvbSB0aGUgc2VydmVyIChoYW5kbGVkIGJ5IFNTRSlcbiogQmFncyBhbmQgcmVjaXBlcywgd2hpY2ggYXJlIHVua25vd24gdG8gdGhlIHN5bmNlclxuXG5BIGtleSBhc3BlY3Qgb2YgdGhlIGRlc2lnbiBpcyB0aGF0IHRoZSBzeW5jZXIgbmV2ZXIgb3ZlcmxhcHMgYmFzaWMgc2VydmVyIG9wZXJhdGlvbnM7IGl0IHdhaXRzIGZvciB0aGVcbnByZXZpb3VzIG9wZXJhdGlvbiB0byBjb21wbGV0ZSBiZWZvcmUgc2VuZGluZyBhIG5ldyBvbmUuXG5cblxcKi9cblxuLy8gdGhlIGJsYW5rIGxpbmUgaXMgaW1wb3J0YW50LCBhbmQgc28gaXMgdGhlIGZvbGxvd2luZyB1c2Ugc3RyaWN0XG5cInVzZSBzdHJpY3RcIjtcbmltcG9ydCB0eXBlIHsgTG9nZ2VyIH0gZnJvbSBcIiQ6L2NvcmUvbW9kdWxlcy91dGlscy9sb2dnZXIuanNcIjtcbmltcG9ydCB0eXBlIHsgU3luY2VyLCBUaWRkbGVyLCBJVGlkZGx5V2lraSB9IGZyb20gXCJ0aWRkbHl3aWtpXCI7XG5cbmRlY2xhcmUgbW9kdWxlICd0aWRkbHl3aWtpJyB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgU3luY2VyIHtcblx0XHR3aWtpOiBXaWtpO1xuXHRcdGxvZ2dlcjogTG9nZ2VyO1xuXHRcdHRpZGRsZXJJbmZvOiBSZWNvcmQ8c3RyaW5nLCB7IGJhZzogc3RyaW5nOyByZXZpc2lvbjogc3RyaW5nIH0+O1xuXHRcdGVucXVldWVMb2FkVGlkZGxlcih0aXRsZTogc3RyaW5nKTogdm9pZDtcblx0XHRzdG9yZVRpZGRsZXIodGlkZGxlcjogVGlkZGxlcik6IHZvaWQ7XG5cdFx0cHJvY2Vzc1Rhc2tRdWV1ZSgpOiB2b2lkO1xuXHR9XG5cdGludGVyZmFjZSBJVGlkZGx5V2lraSB7XG5cdFx0YnJvd3NlclN0b3JhZ2U6IGFueTtcblx0fVxufVxuXG5kZWNsYXJlIGNvbnN0IGV4cG9ydHM6IHtcblx0YWRhcHRvckNsYXNzOiB0eXBlb2YgTXVsdGlXaWtpQ2xpZW50QWRhcHRvcjtcbn07XG5cbnZhciBDT05GSUdfSE9TVF9USURETEVSID0gXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L2hvc3RcIixcblx0REVGQVVMVF9IT1NUX1RJRERMRVIgPSBcIiRwcm90b2NvbCQvLyRob3N0JC9cIixcblx0TVdDX1NUQVRFX1RJRERMRVJfUFJFRklYID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvXCIsXG5cdEJBR19TVEFURV9USURETEVSID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvdGlkZGxlcnMvYmFnXCIsXG5cdFJFVklTSU9OX1NUQVRFX1RJRERMRVIgPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC90aWRkbGVycy9yZXZpc2lvblwiLFxuXHRDT05ORUNUSU9OX1NUQVRFX1RJRERMRVIgPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC9jb25uZWN0aW9uXCIsXG5cdElOQ09NSU5HX1VQREFURVNfRklMVEVSX1RJRERMRVIgPSBcIiQ6L2NvbmZpZy9tdWx0aXdpa2ljbGllbnQvaW5jb21pbmctdXBkYXRlcy1maWx0ZXJcIixcblx0RU5BQkxFX1NTRV9USURETEVSID0gXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L3VzZS1zZXJ2ZXItc2VudC1ldmVudHNcIjtcblxudmFyIFNFUlZFUl9OT1RfQ09OTkVDVEVEID0gXCJOT1QgQ09OTkVDVEVEXCIsXG5cdFNFUlZFUl9DT05ORUNUSU5HX1NTRSA9IFwiQ09OTkVDVElORyBTU0VcIixcblx0U0VSVkVSX0NPTk5FQ1RFRF9TU0UgPSBcIkNPTk5FQ1RFRCBTU0VcIixcblx0U0VSVkVSX1BPTExJTkcgPSBcIlNFUlZFUiBQT0xMSU5HXCI7XG5cbmNsYXNzIE11bHRpV2lraUNsaWVudEFkYXB0b3Ige1xuXHR3aWtpO1xuXHRob3N0O1xuXHRyZWNpcGU7XG5cdHVzZVNlcnZlclNlbnRFdmVudHM7XG5cdGxhc3Rfa25vd25fdGlkZGxlcl9pZDtcblx0b3V0c3RhbmRpbmdSZXF1ZXN0cztcblx0bGFzdFJlY29yZGVkVXBkYXRlO1xuXHRsb2dnZXI7XG5cdGlzTG9nZ2VkSW47XG5cdGlzUmVhZE9ubHk7XG5cdGxvZ291dElzQXZhaWxhYmxlO1xuXHRpbmNvbWluZ1VwZGF0ZXNGaWx0ZXJGbjtcblx0c2VydmVyVXBkYXRlQ29ubmVjdGlvblN0YXR1cyE6IHN0cmluZztcblxuXHRuYW1lID0gXCJtdWx0aXdpa2ljbGllbnRcIjtcblx0c3VwcG9ydHNMYXp5TG9hZGluZyA9IHRydWU7XG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IHsgd2lraTogYW55IH0pIHtcblx0XHR0aGlzLndpa2kgPSBvcHRpb25zLndpa2k7XG5cdFx0dGhpcy5ob3N0ID0gdGhpcy5nZXRIb3N0KCk7XG5cdFx0dGhpcy5yZWNpcGUgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L3JlY2lwZVwiKTtcblx0XHR0aGlzLnVzZVNlcnZlclNlbnRFdmVudHMgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoRU5BQkxFX1NTRV9USURETEVSKSA9PT0gXCJ5ZXNcIjtcblx0XHR0aGlzLmxhc3Rfa25vd25fdGlkZGxlcl9pZCA9ICR0dy51dGlscy5wYXJzZU51bWJlcih0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvcmVjaXBlL2xhc3RfdGlkZGxlcl9pZFwiLCBcIjBcIikpO1xuXHRcdHRoaXMub3V0c3RhbmRpbmdSZXF1ZXN0cyA9IE9iamVjdC5jcmVhdGUobnVsbCk7IC8vIEhhc2htYXAgYnkgdGl0bGUgb2Ygb3V0c3RhbmRpbmcgcmVxdWVzdCBvYmplY3Q6IHt0eXBlOiBcIlBVVFwifFwiR0VUXCJ8XCJERUxFVEVcIn1cblx0XHR0aGlzLmxhc3RSZWNvcmRlZFVwZGF0ZSA9IE9iamVjdC5jcmVhdGUobnVsbCk7IC8vIEhhc2htYXAgYnkgdGl0bGUgb2YgbGFzdCByZWNvcmRlZCB1cGRhdGUgdmlhIFNTRToge3R5cGU6IFwidXBkYXRlXCJ8XCJkZXRldGlvblwiLCB0aWRkbGVyX2lkOn1cblx0XHR0aGlzLmxvZ2dlciA9IG5ldyAkdHcudXRpbHMuTG9nZ2VyKFwiTXVsdGlXaWtpQ2xpZW50QWRhcHRvclwiKTtcblx0XHR0aGlzLmlzTG9nZ2VkSW4gPSBmYWxzZTtcblx0XHR0aGlzLmlzUmVhZE9ubHkgPSBmYWxzZTtcblx0XHR0aGlzLmxvZ291dElzQXZhaWxhYmxlID0gdHJ1ZTtcblx0XHQvLyBDb21waWxlIHRoZSBkaXJ0eSB0aWRkbGVyIGZpbHRlclxuXHRcdHRoaXMuaW5jb21pbmdVcGRhdGVzRmlsdGVyRm4gPSB0aGlzLndpa2kuY29tcGlsZUZpbHRlcih0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoSU5DT01JTkdfVVBEQVRFU19GSUxURVJfVElERExFUikpO1xuXHRcdHRoaXMuc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhTRVJWRVJfTk9UX0NPTk5FQ1RFRCk7XG5cdH1cblxuXHRzZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKHN0YXR1czogc3RyaW5nKSB7XG5cdFx0dGhpcy5zZXJ2ZXJVcGRhdGVDb25uZWN0aW9uU3RhdHVzID0gc3RhdHVzO1xuXHRcdHRoaXMud2lraS5hZGRUaWRkbGVyKHtcblx0XHRcdHRpdGxlOiBDT05ORUNUSU9OX1NUQVRFX1RJRERMRVIsXG5cdFx0XHR0ZXh0OiBzdGF0dXNcblx0XHR9KTtcblx0fVxuXHRzZXRMb2dnZXJTYXZlQnVmZmVyKGxvZ2dlckZvclNhdmluZzogTG9nZ2VyKSB7XG5cdFx0dGhpcy5sb2dnZXIuc2V0U2F2ZUJ1ZmZlcihsb2dnZXJGb3JTYXZpbmcpO1xuXHR9XG5cdGlzUmVhZHkoKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0Z2V0SG9zdCgpIHtcblx0XHR2YXIgdGV4dCA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChDT05GSUdfSE9TVF9USURETEVSLCBERUZBVUxUX0hPU1RfVElERExFUiksIHN1YnN0aXR1dGlvbnMgPSBbXG5cdFx0XHR7IG5hbWU6IFwicHJvdG9jb2xcIiwgdmFsdWU6IGRvY3VtZW50LmxvY2F0aW9uLnByb3RvY29sIH0sXG5cdFx0XHR7IG5hbWU6IFwiaG9zdFwiLCB2YWx1ZTogZG9jdW1lbnQubG9jYXRpb24uaG9zdCB9LFxuXHRcdFx0eyBuYW1lOiBcInBhdGhuYW1lXCIsIHZhbHVlOiBkb2N1bWVudC5sb2NhdGlvbi5wYXRobmFtZSB9XG5cdFx0XTtcblx0XHRmb3IgKHZhciB0ID0gMDsgdCA8IHN1YnN0aXR1dGlvbnMubGVuZ3RoOyB0KyspIHtcblx0XHRcdHZhciBzID0gc3Vic3RpdHV0aW9uc1t0XTtcblx0XHRcdHRleHQgPSAkdHcudXRpbHMucmVwbGFjZVN0cmluZyh0ZXh0LCBuZXcgUmVnRXhwKFwiXFxcXCRcIiArIHMubmFtZSArIFwiXFxcXCRcIiwgXCJtZ1wiKSwgcy52YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cdGdldFRpZGRsZXJJbmZvKHRpZGRsZXI6IFRpZGRsZXIpIHtcblx0XHR2YXIgdGl0bGUgPSB0aWRkbGVyLmZpZWxkcy50aXRsZSwgcmV2aXNpb24gPSB0aGlzLndpa2kuZXh0cmFjdFRpZGRsZXJEYXRhSXRlbShSRVZJU0lPTl9TVEFURV9USURETEVSLCB0aXRsZSksIGJhZyA9IHRoaXMud2lraS5leHRyYWN0VGlkZGxlckRhdGFJdGVtKEJBR19TVEFURV9USURETEVSLCB0aXRsZSk7XG5cdFx0aWYgKHJldmlzaW9uICYmIGJhZykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGl0bGU6IHRpdGxlLFxuXHRcdFx0XHRyZXZpc2lvbjogcmV2aXNpb24sXG5cdFx0XHRcdGJhZzogYmFnXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXHRnZXRUaWRkbGVyQmFnKHRpdGxlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oQkFHX1NUQVRFX1RJRERMRVIsIHRpdGxlKTtcblx0fVxuXHRnZXRUaWRkbGVyUmV2aXNpb24odGl0bGU6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLndpa2kuZXh0cmFjdFRpZGRsZXJEYXRhSXRlbShSRVZJU0lPTl9TVEFURV9USURETEVSLCB0aXRsZSk7XG5cdH1cblx0c2V0VGlkZGxlckluZm8odGl0bGU6IHN0cmluZywgcmV2aXNpb246IHN0cmluZywgYmFnOiBzdHJpbmcpIHtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChCQUdfU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIGJhZywgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChSRVZJU0lPTl9TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgcmV2aXNpb24sIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdH1cblx0cmVtb3ZlVGlkZGxlckluZm8odGl0bGU6IHN0cmluZykge1xuXHRcdHRoaXMud2lraS5zZXRUZXh0KEJBR19TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgdW5kZWZpbmVkLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHRcdHRoaXMud2lraS5zZXRUZXh0KFJFVklTSU9OX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCB1bmRlZmluZWQsIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdH1cblxuXHRodHRwUmVxdWVzdDxSVCBleHRlbmRzIFwidGV4dFwiIHwgXCJhcnJheWJ1ZmZlclwiIHwgXCJqc29uXCI+KG9wdGlvbnM6IHtcblx0XHQvKiogdXJsIHRvIHJldHJpZXZlIChtdXN0IG5vdCBjb250YWluIGA/YCBpZiBHRVQgb3IgSEVBRCkgKi9cblx0XHR1cmw6IHN0cmluZztcblx0XHQvKiogaGFzaG1hcCBvZiBoZWFkZXJzIHRvIHNlbmQgKi9cblx0XHRoZWFkZXJzPzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblx0XHQvKiogcmVxdWVzdCBtZXRob2Q6IEdFVCwgUFVULCBQT1NUIGV0YyAqL1xuXHRcdHR5cGU/OiBzdHJpbmc7XG5cdFx0LyoqIG9wdGlvbmFsIGZ1bmN0aW9uIGludm9rZWQgd2l0aCAobGVuZ3RoQ29tcHV0YWJsZSxsb2FkZWQsdG90YWwpICovXG5cdFx0cHJvZ3Jlc3M/OiAobGVuZ3RoQ29tcHV0YWJsZTogYm9vbGVhbiwgbG9hZGVkOiBudW1iZXIsIHRvdGFsOiBudW1iZXIpID0+IHZvaWQ7XG5cdFx0LyoqIG5hbWUgb2YgdGhlIHByb3BlcnR5IHRvIHJldHVybiBhcyBmaXJzdCBhcmd1bWVudCBvZiBjYWxsYmFjayAqL1xuXHRcdHJldHVyblByb3A/OiBzdHJpbmc7XG5cdFx0cmVzcG9uc2VUeXBlPzogUlQ7XG5cdFx0dXNlRGVmYXVsdEhlYWRlcnM/OiBib29sZWFuO1xuXHRcdC8qKiB1cmxlbmNvZGVkIHN0cmluZyBvciBoYXNobWFwIG9mIGRhdGEgdG8gc2VuZC4gSWYgdHlwZSBpcyBHRVQgb3IgSEVBRCwgdGhpcyBpcyBhcHBlbmRlZCB0byB0aGUgVVJMIGFzIGEgcXVlcnkgc3RyaW5nICovXG5cdFx0ZGF0YT86IG9iamVjdCB8IHN0cmluZztcblx0fSkge1xuXHRcdHR5cGUgUmVzcG9uc2VFcnIgPSBbZmFsc2UsIGFueSwgdW5kZWZpbmVkXTtcblx0XHR0eXBlIFJlc3BvbnNlT2sgPSBbdHJ1ZSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRkYXRhOlxuXHRcdFx0XCJqc29uXCIgZXh0ZW5kcyBSVCA/IGFueSA6XG5cdFx0XHRcInRleHRcIiBleHRlbmRzIFJUID8gc3RyaW5nIDpcblx0XHRcdFwiYXJyYXlidWZmZXJcIiBleHRlbmRzIFJUID8gQXJyYXlCdWZmZXIgOlxuXHRcdFx0dW5rbm93bjtcblx0XHRcdGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz5cblx0XHR9XTtcblx0XHRyZXR1cm4gKG5ldyBQcm9taXNlPFJlc3BvbnNlRXJyIHwgUmVzcG9uc2VPaz4oKHJlc29sdmUpID0+IHtcblx0XHRcdCR0dy51dGlscy5odHRwUmVxdWVzdCh7XG5cdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdHJlc3BvbnNlVHlwZTogb3B0aW9ucy5yZXNwb25zZVR5cGUgPT09IFwianNvblwiID8gXCJ0ZXh0XCIgOiBvcHRpb25zLnJlc3BvbnNlVHlwZSxcblx0XHRcdFx0Y2FsbGJhY2s6IChlcnI6IGFueSwgZGF0YTogYW55LCByZXF1ZXN0OiBYTUxIdHRwUmVxdWVzdCkgPT4ge1xuXHRcdFx0XHRcdGlmIChlcnIpIHJldHVybiByZXNvbHZlKFtmYWxzZSwgZXJyIHx8IG5ldyBFcnJvcihcIlVua25vd24gZXJyb3JcIiksIHVuZGVmaW5lZF0pO1xuXG5cdFx0XHRcdFx0Ly8gQ3JlYXRlIGEgbWFwIG9mIGhlYWRlciBuYW1lcyB0byB2YWx1ZXNcblxuXHRcdFx0XHRcdGNvbnN0IGhlYWRlcnMgPSB7fSBhcyBhbnk7XG5cdFx0XHRcdFx0cmVxdWVzdC5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKT8udHJpbSgpLnNwbGl0KC9bXFxyXFxuXSsvKS5mb3JFYWNoKChsaW5lKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCBwYXJ0cyA9IGxpbmUuc3BsaXQoXCI6IFwiKTtcblx0XHRcdFx0XHRcdGNvbnN0IGhlYWRlciA9IHBhcnRzLnNoaWZ0KCk/LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IHBhcnRzLmpvaW4oXCI6IFwiKTtcblx0XHRcdFx0XHRcdGlmIChoZWFkZXIpIGhlYWRlcnNbaGVhZGVyXSA9IHZhbHVlO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdC8vIFJlc29sdmUgdGhlIHByb21pc2Ugd2l0aCB0aGUgcmVzcG9uc2UgZGF0YSBhbmQgaGVhZGVyc1xuXHRcdFx0XHRcdHJlc29sdmUoW3RydWUsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRcdFx0aGVhZGVycyxcblx0XHRcdFx0XHRcdGRhdGE6IG9wdGlvbnMucmVzcG9uc2VUeXBlID09PSBcImpzb25cIiA/ICR0dy51dGlscy5wYXJzZUpTT05TYWZlKGRhdGEsICgpID0+IHVuZGVmaW5lZCkgOiBkYXRhLFxuXHRcdFx0XHRcdH1dKTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0fVxuXHQvKlxuXHRHZXQgdGhlIGN1cnJlbnQgc3RhdHVzIG9mIHRoZSBzZXJ2ZXIgY29ubmVjdGlvblxuXHQqL1xuXHRhc3luYyBnZXRTdGF0dXMoY2FsbGJhY2s6IChcblx0XHRlcnI6IGFueSxcblx0XHRpc0xvZ2dlZEluPzogYm9vbGVhbixcblx0XHR1c2VybmFtZT86IHN0cmluZyxcblx0XHRpc1JlYWRPbmx5PzogYm9vbGVhbixcblx0XHRpc0Fub255bW91cz86IGJvb2xlYW4sXG5cdCkgPT4gdm9pZCkge1xuXHRcdGludGVyZmFjZSBVc2VyQXV0aFN0YXR1cyB7XG5cdFx0XHRpc0FkbWluOiBib29sZWFuO1xuXHRcdFx0dXNlcl9pZDogbnVtYmVyO1xuXHRcdFx0dXNlcm5hbWU6IHN0cmluZztcblx0XHRcdGlzTG9nZ2VkSW46IGJvb2xlYW47XG5cdFx0XHRpc1JlYWRPbmx5OiBib29sZWFuO1xuXHRcdFx0YWxsb3dBbm9uUmVhZHM6IGJvb2xlYW47XG5cdFx0XHRhbGxvd0Fub25Xcml0ZXM6IGJvb2xlYW47XG5cdFx0fVxuXG5cdFx0Y29uc3QgW29rLCBlcnJvciwgZGF0YV0gPSBhd2FpdCB0aGlzLmh0dHBSZXF1ZXN0KHtcblx0XHRcdHVybDogdGhpcy5ob3N0ICsgXCJyZWNpcGVzL1wiICsgdGhpcy5yZWNpcGUgKyBcIi9zdGF0dXNcIixcblx0XHRcdHR5cGU6IFwiR0VUXCIsXG5cdFx0XHRyZXNwb25zZVR5cGU6IFwianNvblwiLFxuXHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHQnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuXHRcdFx0XHRcIlgtUmVxdWVzdGVkLVdpdGhcIjogXCJUaWRkbHlXaWtpXCJcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0aWYgKCFvaykge1xuXHRcdFx0dGhpcy5sb2dnZXIubG9nKFwiRXJyb3IgZ2V0dGluZyBzdGF0dXNcIiwgZXJyb3IpO1xuXHRcdFx0aWYgKGNhbGxiYWNrKSBjYWxsYmFjayhlcnJvcik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8qKiBAdHlwZSB7UGFydGlhbDxVc2VyQXV0aFN0YXR1cz59ICovXG5cdFx0Y29uc3Qgc3RhdHVzID0gZGF0YS5kYXRhO1xuXHRcdGlmIChjYWxsYmFjaykge1xuXHRcdFx0Y2FsbGJhY2soXG5cdFx0XHRcdC8vIEVycm9yXG5cdFx0XHRcdG51bGwsXG5cdFx0XHRcdC8vIElzIGxvZ2dlZCBpblxuXHRcdFx0XHRzdGF0dXMuaXNMb2dnZWRJbiA/PyBmYWxzZSxcblx0XHRcdFx0Ly8gVXNlcm5hbWVcblx0XHRcdFx0c3RhdHVzLnVzZXJuYW1lID8/IFwiKGFub24pXCIsXG5cdFx0XHRcdC8vIElzIHJlYWQgb25seVxuXHRcdFx0XHRzdGF0dXMuaXNSZWFkT25seSA/PyB0cnVlLFxuXHRcdFx0XHQvLyBJcyBhbm9ueW1vdXNcblx0XHRcdFx0IXN0YXR1cy5pc0xvZ2dlZEluLFxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblx0Lypcblx0R2V0IGRldGFpbHMgb2YgY2hhbmdlZCB0aWRkbGVycyBmcm9tIHRoZSBzZXJ2ZXJcblx0Ki9cblx0Z2V0VXBkYXRlZFRpZGRsZXJzKHN5bmNlcjogU3luY2VyLCBjYWxsYmFjazogKGVycjogYW55LCBjaGFuZ2VzPzogeyBtb2RpZmljYXRpb25zOiBzdHJpbmdbXTsgZGVsZXRpb25zOiBzdHJpbmdbXSB9KSA9PiB2b2lkKSB7XG5cdFx0aWYgKCF0aGlzLnVzZVNlcnZlclNlbnRFdmVudHMpIHtcblx0XHRcdHRoaXMucG9sbFNlcnZlcih7XG5cdFx0XHRcdGNhbGxiYWNrOiBmdW5jdGlvbiAoZXJyLCBjaGFuZ2VzKSB7XG5cdFx0XHRcdFx0Y2FsbGJhY2sobnVsbCwgY2hhbmdlcyk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHQvLyBEbyBub3RoaW5nIGlmIHRoZXJlJ3MgYWxyZWFkeSBhIGNvbm5lY3Rpb24gaW4gcHJvZ3Jlc3MuXG5cdFx0aWYgKHRoaXMuc2VydmVyVXBkYXRlQ29ubmVjdGlvblN0YXR1cyAhPT0gU0VSVkVSX05PVF9DT05ORUNURUQpIHtcblx0XHRcdHJldHVybiBjYWxsYmFjayhudWxsLCB7XG5cdFx0XHRcdG1vZGlmaWNhdGlvbnM6IFtdLFxuXHRcdFx0XHRkZWxldGlvbnM6IFtdXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Ly8gVHJ5IHRvIGNvbm5lY3QgYSBzZXJ2ZXIgc3RyZWFtXG5cdFx0dGhpcy5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9DT05ORUNUSU5HX1NTRSk7XG5cdFx0dGhpcy5jb25uZWN0U2VydmVyU3RyZWFtKHtcblx0XHRcdHN5bmNlcjogc3luY2VyLFxuXHRcdFx0b25lcnJvcjogZnVuY3Rpb24gKGVycikge1xuXHRcdFx0XHRzZWxmLmxvZ2dlci5sb2coXCJFcnJvciBjb25uZWN0aW5nIFNTRSBzdHJlYW1cIiwgZXJyKTtcblx0XHRcdFx0Ly8gSWYgdGhlIHN0cmVhbSBkaWRuJ3Qgd29yaywgdHJ5IHBvbGxpbmdcblx0XHRcdFx0c2VsZi5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9QT0xMSU5HKTtcblx0XHRcdFx0c2VsZi5wb2xsU2VydmVyKHtcblx0XHRcdFx0XHRjYWxsYmFjazogZnVuY3Rpb24gKGVyciwgY2hhbmdlcykge1xuXHRcdFx0XHRcdFx0c2VsZi5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9OT1RfQ09OTkVDVEVEKTtcblx0XHRcdFx0XHRcdGNhbGxiYWNrKG51bGwsIGNoYW5nZXMpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0b25vcGVuOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHNlbGYuc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhTRVJWRVJfQ09OTkVDVEVEX1NTRSk7XG5cdFx0XHRcdC8vIFRoZSBzeW5jZXIgaXMgZXhwZWN0aW5nIGEgY2FsbGJhY2sgYnV0IHdlIGRvbid0IGhhdmUgYW55IGRhdGEgdG8gc2VuZFxuXHRcdFx0XHRjYWxsYmFjayhudWxsLCB7XG5cdFx0XHRcdFx0bW9kaWZpY2F0aW9uczogW10sXG5cdFx0XHRcdFx0ZGVsZXRpb25zOiBbXVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHR9XG5cdC8qXG5cdEF0dGVtcHQgdG8gZXN0YWJsaXNoIGFuIFNTRSBzdHJlYW0gd2l0aCB0aGUgc2VydmVyIGFuZCB0cmFuc2ZlciB0aWRkbGVyIGNoYW5nZXMuIE9wdGlvbnMgaW5jbHVkZTpcbiAgXG5cdHN5bmNlcjogcmVmZXJlbmNlIHRvIHN5bmNlciBvYmplY3QgdXNlZCBmb3Igc3RvcmluZyBkYXRhXG5cdG9ub3BlbjogaW52b2tlZCB3aGVuIHRoZSBzdHJlYW0gaXMgc3VjY2Vzc2Z1bGx5IG9wZW5lZFxuXHRvbmVycm9yOiBpbnZva2VkIGlmIHRoZXJlIGlzIGFuIGVycm9yXG5cdCovXG5cdGNvbm5lY3RTZXJ2ZXJTdHJlYW0ob3B0aW9uczoge1xuXHRcdHN5bmNlcjogU3luY2VyO1xuXHRcdG9ub3BlbjogKGV2ZW50OiBFdmVudCkgPT4gdm9pZDtcblx0XHRvbmVycm9yOiAoZXZlbnQ6IEV2ZW50KSA9PiB2b2lkO1xuXHR9KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdGNvbnN0IGV2ZW50U291cmNlID0gbmV3IEV2ZW50U291cmNlKFwiL3JlY2lwZXMvXCIgKyB0aGlzLnJlY2lwZSArIFwiL2V2ZW50cz9sYXN0X2tub3duX3RpZGRsZXJfaWQ9XCIgKyB0aGlzLmxhc3Rfa25vd25fdGlkZGxlcl9pZCk7XG5cdFx0ZXZlbnRTb3VyY2Uub25lcnJvciA9IGZ1bmN0aW9uIChldmVudCkge1xuXHRcdFx0aWYgKG9wdGlvbnMub25lcnJvcikge1xuXHRcdFx0XHRvcHRpb25zLm9uZXJyb3IoZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZXZlbnRTb3VyY2Uub25vcGVuID0gZnVuY3Rpb24gKGV2ZW50KSB7XG5cdFx0XHRpZiAob3B0aW9ucy5vbm9wZW4pIHtcblx0XHRcdFx0b3B0aW9ucy5vbm9wZW4oZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZXZlbnRTb3VyY2UuYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCBmdW5jdGlvbiAoZXZlbnQpIHtcblxuXHRcdFx0Y29uc3QgZGF0YToge1xuXHRcdFx0XHR0aXRsZTogc3RyaW5nO1xuXHRcdFx0XHR0aWRkbGVyX2lkOiBudW1iZXI7XG5cdFx0XHRcdGlzX2RlbGV0ZWQ6IGJvb2xlYW47XG5cdFx0XHRcdGJhZ19uYW1lOiBzdHJpbmc7XG5cdFx0XHRcdHRpZGRsZXI6IGFueTtcblx0XHRcdH0gPSAkdHcudXRpbHMucGFyc2VKU09OU2FmZShldmVudC5kYXRhKTtcblx0XHRcdGlmICghZGF0YSkgcmV0dXJuO1xuXG5cdFx0XHRjb25zb2xlLmxvZyhcIlNTRSBkYXRhXCIsIGRhdGEpO1xuXHRcdFx0Ly8gVXBkYXRlIGxhc3Qgc2VlbiB0aWRkbGVyX2lkXG5cdFx0XHRpZiAoZGF0YS50aWRkbGVyX2lkID4gc2VsZi5sYXN0X2tub3duX3RpZGRsZXJfaWQpIHtcblx0XHRcdFx0c2VsZi5sYXN0X2tub3duX3RpZGRsZXJfaWQgPSBkYXRhLnRpZGRsZXJfaWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBSZWNvcmQgdGhlIGxhc3QgdXBkYXRlIHRvIHRoaXMgdGlkZGxlclxuXHRcdFx0c2VsZi5sYXN0UmVjb3JkZWRVcGRhdGVbZGF0YS50aXRsZV0gPSB7XG5cdFx0XHRcdHR5cGU6IGRhdGEuaXNfZGVsZXRlZCA/IFwiZGVsZXRpb25cIiA6IFwidXBkYXRlXCIsXG5cdFx0XHRcdHRpZGRsZXJfaWQ6IGRhdGEudGlkZGxlcl9pZFxuXHRcdFx0fTtcblx0XHRcdGNvbnNvbGUubG9nKGBPdXN0YW5kaW5nIHJlcXVlc3RzIGlzICR7SlNPTi5zdHJpbmdpZnkoc2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW2RhdGEudGl0bGVdKX1gKTtcblx0XHRcdC8vIFByb2Nlc3MgdGhlIHVwZGF0ZSBpZiB0aGUgdGlkZGxlciBpcyBub3QgdGhlIHN1YmplY3Qgb2YgYW4gb3V0c3RhbmRpbmcgcmVxdWVzdFxuXHRcdFx0aWYgKHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1tkYXRhLnRpdGxlXSkgcmV0dXJuO1xuXHRcdFx0aWYgKGRhdGEuaXNfZGVsZXRlZCkge1xuXHRcdFx0XHRzZWxmLnJlbW92ZVRpZGRsZXJJbmZvKGRhdGEudGl0bGUpO1xuXHRcdFx0XHRkZWxldGUgb3B0aW9ucy5zeW5jZXIudGlkZGxlckluZm9bZGF0YS50aXRsZV07XG5cdFx0XHRcdG9wdGlvbnMuc3luY2VyLmxvZ2dlci5sb2coXCJEZWxldGluZyB0aWRkbGVyIG1pc3NpbmcgZnJvbSBzZXJ2ZXI6XCIsIGRhdGEudGl0bGUpO1xuXHRcdFx0XHRvcHRpb25zLnN5bmNlci53aWtpLmRlbGV0ZVRpZGRsZXIoZGF0YS50aXRsZSk7XG5cdFx0XHRcdG9wdGlvbnMuc3luY2VyLnByb2Nlc3NUYXNrUXVldWUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhciByZXN1bHQgPSBzZWxmLmluY29taW5nVXBkYXRlc0ZpbHRlckZuLmNhbGwoc2VsZi53aWtpLCBzZWxmLndpa2kubWFrZVRpZGRsZXJJdGVyYXRvcihbZGF0YS50aXRsZV0pKTtcblx0XHRcdFx0aWYgKHJlc3VsdC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0c2VsZi5zZXRUaWRkbGVySW5mbyhkYXRhLnRpdGxlLCBkYXRhLnRpZGRsZXJfaWQudG9TdHJpbmcoKSwgZGF0YS5iYWdfbmFtZSk7XG5cdFx0XHRcdFx0b3B0aW9ucy5zeW5jZXIuc3RvcmVUaWRkbGVyKGRhdGEudGlkZGxlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXG5cdFx0fSk7XG5cdH1cblx0Lypcblx0UG9sbCB0aGUgc2VydmVyIGZvciBjaGFuZ2VzLiBPcHRpb25zIGluY2x1ZGU6XG4gIFxuXHRjYWxsYmFjazogaW52b2tlZCBvbiBjb21wbGV0aW9uIGFzIChlcnIsY2hhbmdlcylcblx0Ki9cblx0YXN5bmMgcG9sbFNlcnZlcihvcHRpb25zOiB7XG5cdFx0Y2FsbGJhY2s6IChlcnI6IGFueSwgY2hhbmdlcz86IHsgbW9kaWZpY2F0aW9uczogc3RyaW5nW107IGRlbGV0aW9uczogc3RyaW5nW10gfSkgPT4gdm9pZDtcblx0fSkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRjb25zdCBbb2ssIGVyciwgcmVzdWx0XSA9IGF3YWl0IHRoaXMuaHR0cFJlcXVlc3Qoe1xuXHRcdFx0dXJsOiB0aGlzLmhvc3QgKyBcInJlY2lwZXMvXCIgKyB0aGlzLnJlY2lwZSArIFwiL3RpZGRsZXJzLmpzb25cIixcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0bGFzdF9rbm93bl90aWRkbGVyX2lkOiB0aGlzLmxhc3Rfa25vd25fdGlkZGxlcl9pZCxcblx0XHRcdFx0aW5jbHVkZV9kZWxldGVkOiBcInRydWVcIlxuXHRcdFx0fSxcblx0XHRcdHJlc3BvbnNlVHlwZTogXCJqc29uXCIsXG5cdFx0fSk7XG5cblx0XHRpZiAoIW9rKSB7IHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGVycik7IH1cblx0XHRjb25zdCB7IGRhdGE6IHRpZGRsZXJJbmZvQXJyYXkgPSBbXSB9ID0gcmVzdWx0O1xuXG5cdFx0dmFyIG1vZGlmaWNhdGlvbnM6IHN0cmluZ1tdID0gW10sIGRlbGV0aW9uczogc3RyaW5nW10gPSBbXTtcblxuXHRcdCR0dy51dGlscy5lYWNoKHRpZGRsZXJJbmZvQXJyYXksXG5cdFx0XHQvKipcblx0XHRcdCAqIEBwYXJhbSB7eyB0aXRsZTogc3RyaW5nOyB0aWRkbGVyX2lkOiBudW1iZXI7IGlzX2RlbGV0ZWQ6IGJvb2xlYW47IGJhZ19uYW1lOiBzdHJpbmc7IH19IHRpZGRsZXJJbmZvIFxuXHRcdFx0ICovXG5cdFx0XHRmdW5jdGlvbiAodGlkZGxlckluZm8pIHtcblx0XHRcdFx0aWYgKHRpZGRsZXJJbmZvLnRpZGRsZXJfaWQgPiBzZWxmLmxhc3Rfa25vd25fdGlkZGxlcl9pZCkge1xuXHRcdFx0XHRcdHNlbGYubGFzdF9rbm93bl90aWRkbGVyX2lkID0gdGlkZGxlckluZm8udGlkZGxlcl9pZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGlkZGxlckluZm8uaXNfZGVsZXRlZCkge1xuXHRcdFx0XHRcdGRlbGV0aW9ucy5wdXNoKHRpZGRsZXJJbmZvLnRpdGxlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRtb2RpZmljYXRpb25zLnB1c2godGlkZGxlckluZm8udGl0bGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdC8vIEludm9rZSB0aGUgY2FsbGJhY2sgd2l0aCB0aGUgcmVzdWx0c1xuXHRcdG9wdGlvbnMuY2FsbGJhY2sobnVsbCwge1xuXHRcdFx0bW9kaWZpY2F0aW9uczogbW9kaWZpY2F0aW9ucyxcblx0XHRcdGRlbGV0aW9uczogZGVsZXRpb25zXG5cdFx0fSk7XG5cblx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdC8vIElmIEJyb3dzd2VyIFN0b3JhZ2UgdGlkZGxlcnMgd2VyZSBjYWNoZWQgb24gcmVsb2FkaW5nIHRoZSB3aWtpLCBhZGQgdGhlbSBhZnRlciBzeW5jIGZyb20gc2VydmVyIGNvbXBsZXRlcyBpbiB0aGUgYWJvdmUgY2FsbGJhY2suXG5cdFx0XHRpZiAoJHR3LmJyb3dzZXJTdG9yYWdlICYmICR0dy5icm93c2VyU3RvcmFnZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHQkdHcuYnJvd3NlclN0b3JhZ2UuYWRkQ2FjaGVkVGlkZGxlcnMoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXHQvKlxuXHRRdWV1ZSBhIGxvYWQgZm9yIGEgdGlkZGxlciBpZiB0aGVyZSBoYXMgYmVlbiBhbiB1cGRhdGUgZm9yIGl0IHNpbmNlIHRoZSBzcGVjaWZpZWQgcmV2aXNpb25cblx0Ki9cblx0Y2hlY2tMYXN0UmVjb3JkZWRVcGRhdGUodGl0bGU6IHN0cmluZywgcmV2aXNpb246IHN0cmluZykge1xuXHRcdHZhciBscnUgPSB0aGlzLmxhc3RSZWNvcmRlZFVwZGF0ZVt0aXRsZV07XG5cdFx0aWYgKGxydSkge1xuXHRcdFx0dmFyIG51bVJldmlzaW9uID0gJHR3LnV0aWxzLmdldEludChyZXZpc2lvbiwgMCk7XG5cdFx0XHRpZiAoIW51bVJldmlzaW9uKSB7XG5cdFx0XHRcdHRoaXMubG9nZ2VyLmxvZyhcIkVycm9yOiByZXZpc2lvbiBpcyBub3QgYSBudW1iZXJcIiwgcmV2aXNpb24pO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zb2xlLmxvZyhgQ2hlY2tpbmcgZm9yIHVwZGF0ZXMgdG8gJHt0aXRsZX0gc2luY2UgJHtKU09OLnN0cmluZ2lmeShyZXZpc2lvbil9IGNvbXBhcmluZyB0byAke251bVJldmlzaW9ufWApO1xuXHRcdFx0aWYgKGxydS50aWRkbGVyX2lkID4gbnVtUmV2aXNpb24pIHtcblx0XHRcdFx0dGhpcy5zeW5jZXIgJiYgdGhpcy5zeW5jZXIuZW5xdWV1ZUxvYWRUaWRkbGVyKHRpdGxlKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0Z2V0IHN5bmNlcigpIHtcblx0XHQvL0B0cy1leHBlY3QtZXJyb3Jcblx0XHRpZiAoJHR3LnN5bmNhZGFwdG9yID09PSB0aGlzKSByZXR1cm4gJHR3LnN5bmNlcjtcblx0fVxuXHQvKlxuXHRTYXZlIGEgdGlkZGxlciBhbmQgaW52b2tlIHRoZSBjYWxsYmFjayB3aXRoIChlcnIsYWRhcHRvckluZm8scmV2aXNpb24pXG5cdCovXG5cdGFzeW5jIHNhdmVUaWRkbGVyKFxuXHRcdHRpZGRsZXI6IFRpZGRsZXIsXG5cdFx0Y2FsbGJhY2s6IChlcnI6IGFueSwgYWRhcHRvckluZm8/OiB7IGJhZzogc3RyaW5nIH0sIHJldmlzaW9uPzogc3RyaW5nKSA9PiB2b2lkLFxuXHRcdG9wdGlvbnM/OiB7fVxuXHQpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXMsIHRpdGxlID0gdGlkZGxlci5maWVsZHMudGl0bGU7XG5cdFx0aWYgKHRoaXMuaXNSZWFkT25seSB8fCB0aXRsZS5zdWJzdHIoMCwgTVdDX1NUQVRFX1RJRERMRVJfUFJFRklYLmxlbmd0aCkgPT09IE1XQ19TVEFURV9USURETEVSX1BSRUZJWCkge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKG51bGwpO1xuXHRcdH1cblx0XHRzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdID0geyB0eXBlOiBcIlBVVFwiIH07XG5cdFx0Ly8gVE9ETzogbm90IHVzaW5nIGdldEZpZWxkU3RyaW5nQmxvY2sgYmVjYXVzZSB3aGF0IGhhcHBlbnMgaWYgYSBmaWVsZCBuYW1lIGhhcyBhIGNvbG9uIGluIGl0P1xuXHRcdGxldCBib2R5ID0gSlNPTi5zdHJpbmdpZnkodGlkZGxlci5nZXRGaWVsZFN0cmluZ3MoeyBleGNsdWRlOiBbXCJ0ZXh0XCJdIH0pKTtcblx0XHRpZiAodGlkZGxlci5oYXNGaWVsZChcInRleHRcIikpIHtcblx0XHRcdGlmICh0eXBlb2YgdGlkZGxlci5maWVsZHMudGV4dCAhPT0gXCJzdHJpbmdcIiAmJiB0aWRkbGVyLmZpZWxkcy50ZXh0KVxuXHRcdFx0XHRyZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKFwiRXJyb3Igc2F2aW5nIHRpZGRsZXIgXCIgKyB0aWRkbGVyLmZpZWxkcy50aXRsZSArIFwiOiB0aGUgdGV4dCBmaWVsZCBpcyB0cnV0aHkgYnV0IG5vdCBhIHN0cmluZ1wiKSk7XG5cdFx0XHRib2R5ICs9IGBcXG5cXG4ke3RpZGRsZXIuZmllbGRzLnRleHR9YFxuXHRcdH1cblxuXHRcdGNvbnN0IFtvaywgZXJyLCByZXN1bHRdID0gYXdhaXQgdGhpcy5odHRwUmVxdWVzdCh7XG5cdFx0XHR1cmw6IHRoaXMuaG9zdCArIFwicmVjaXBlcy9cIiArIGVuY29kZVVSSUNvbXBvbmVudCh0aGlzLnJlY2lwZSkgKyBcIi90aWRkbGVycy9cIiArIGVuY29kZVVSSUNvbXBvbmVudCh0aXRsZSksXG5cdFx0XHR0eXBlOiBcIlBVVFwiLFxuXHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcIkNvbnRlbnQtdHlwZVwiOiBcImFwcGxpY2F0aW9uL3gtbXdzLXRpZGRsZXJcIlxuXHRcdFx0fSxcblx0XHRcdGRhdGE6IGJvZHksXG5cdFx0XHRyZXNwb25zZVR5cGU6IFwianNvblwiLFxuXHRcdH0pO1xuXHRcdGRlbGV0ZSBzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdO1xuXHRcdGlmICghb2spIHJldHVybiBjYWxsYmFjayhlcnIpO1xuXHRcdGNvbnN0IHsgaGVhZGVycywgZGF0YSB9ID0gcmVzdWx0O1xuXG5cdFx0Ly9JZiBCcm93c2VyLVN0b3JhZ2UgcGx1Z2luIGlzIHByZXNlbnQsIHJlbW92ZSB0aWRkbGVyIGZyb20gbG9jYWwgc3RvcmFnZSBhZnRlciBzdWNjZXNzZnVsIHN5bmMgdG8gdGhlIHNlcnZlclxuXHRcdGlmICgkdHcuYnJvd3NlclN0b3JhZ2UgJiYgJHR3LmJyb3dzZXJTdG9yYWdlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHQkdHcuYnJvd3NlclN0b3JhZ2UucmVtb3ZlVGlkZGxlckZyb21Mb2NhbFN0b3JhZ2UodGl0bGUpO1xuXHRcdH1cblxuXHRcdC8vIFNhdmUgdGhlIGRldGFpbHMgb2YgdGhlIG5ldyByZXZpc2lvbiBvZiB0aGUgdGlkZGxlclxuXHRcdGNvbnN0IHJldmlzaW9uID0gZGF0YS50aWRkbGVyX2lkLCBiYWdfbmFtZSA9IGRhdGEuYmFnX25hbWU7XG5cdFx0Y29uc29sZS5sb2coYFNhdmVkICR7dGl0bGV9IHdpdGggcmV2aXNpb24gJHtyZXZpc2lvbn0gYW5kIGJhZyAke2JhZ19uYW1lfWApO1xuXHRcdC8vIElmIHRoZXJlIGhhcyBiZWVuIGEgbW9yZSByZWNlbnQgdXBkYXRlIGZyb20gdGhlIHNlcnZlciB0aGVuIGVucXVldWUgYSBsb2FkIG9mIHRoaXMgdGlkZGxlclxuXHRcdHNlbGYuY2hlY2tMYXN0UmVjb3JkZWRVcGRhdGUodGl0bGUsIHJldmlzaW9uKTtcblx0XHQvLyBJbnZva2UgdGhlIGNhbGxiYWNrXG5cdFx0c2VsZi5zZXRUaWRkbGVySW5mbyh0aXRsZSwgcmV2aXNpb24sIGJhZ19uYW1lKTtcblx0XHRjYWxsYmFjayhudWxsLCB7IGJhZzogYmFnX25hbWUgfSwgcmV2aXNpb24pO1xuXG5cdH1cblx0Lypcblx0TG9hZCBhIHRpZGRsZXIgYW5kIGludm9rZSB0aGUgY2FsbGJhY2sgd2l0aCAoZXJyLHRpZGRsZXJGaWVsZHMpXG5cblx0VGhlIHN5bmNlciBkb2VzIG5vdCBwYXNzIGl0c2VsZiBpbnRvIG9wdGlvbnMuXG5cdCovXG5cdGFzeW5jIGxvYWRUaWRkbGVyKHRpdGxlOiBzdHJpbmcsIGNhbGxiYWNrOiAoZXJyOiBhbnksIGZpZWxkcz86IGFueSkgPT4gdm9pZCwgb3B0aW9uczogYW55KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV0gPSB7IHR5cGU6IFwiR0VUXCIgfTtcblx0XHRjb25zdCBbb2ssIGVyciwgcmVzdWx0XSA9IGF3YWl0IHRoaXMuaHR0cFJlcXVlc3Qoe1xuXHRcdFx0dXJsOiB0aGlzLmhvc3QgKyBcInJlY2lwZXMvXCIgKyBlbmNvZGVVUklDb21wb25lbnQodGhpcy5yZWNpcGUpICsgXCIvdGlkZGxlcnMvXCIgKyBlbmNvZGVVUklDb21wb25lbnQodGl0bGUpLFxuXHRcdH0pO1xuXHRcdGRlbGV0ZSBzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdO1xuXHRcdGlmIChlcnIgPT09IDQwNCkge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKG51bGwsIG51bGwpO1xuXHRcdH0gZWxzZSBpZiAoIW9rKSB7XG5cdFx0XHRyZXR1cm4gY2FsbGJhY2soZXJyKTtcblx0XHR9XG5cdFx0Y29uc3QgeyBkYXRhLCBoZWFkZXJzIH0gPSByZXN1bHQ7XG5cdFx0Y29uc3QgcmV2aXNpb24gPSBoZWFkZXJzW1wieC1yZXZpc2lvbi1udW1iZXJcIl0sIGJhZ19uYW1lID0gaGVhZGVyc1tcIngtYmFnLW5hbWVcIl07XG5cdFx0Ly8gSWYgdGhlcmUgaGFzIGJlZW4gYSBtb3JlIHJlY2VudCB1cGRhdGUgZnJvbSB0aGUgc2VydmVyIHRoZW4gZW5xdWV1ZSBhIGxvYWQgb2YgdGhpcyB0aWRkbGVyXG5cdFx0c2VsZi5jaGVja0xhc3RSZWNvcmRlZFVwZGF0ZSh0aXRsZSwgcmV2aXNpb24pO1xuXHRcdC8vIEludm9rZSB0aGUgY2FsbGJhY2tcblx0XHRzZWxmLnNldFRpZGRsZXJJbmZvKHRpdGxlLCByZXZpc2lvbiwgYmFnX25hbWUpO1xuXHRcdGNhbGxiYWNrKG51bGwsICR0dy51dGlscy5wYXJzZUpTT05TYWZlKGRhdGEpKTtcblx0fVxuXHQvKlxuXHREZWxldGUgYSB0aWRkbGVyIGFuZCBpbnZva2UgdGhlIGNhbGxiYWNrIHdpdGggKGVycilcblx0b3B0aW9ucyBpbmNsdWRlOlxuXHR0aWRkbGVySW5mbzogdGhlIHN5bmNlcidzIHRpZGRsZXJJbmZvIGZvciB0aGlzIHRpZGRsZXJcblx0Ki9cblx0YXN5bmMgZGVsZXRlVGlkZGxlcih0aXRsZTogc3RyaW5nLCBjYWxsYmFjazogKGVycjogYW55LCBhZGFwdG9ySW5mbz86IGFueSkgPT4gdm9pZCwgb3B0aW9uczogYW55KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdGlmICh0aGlzLmlzUmVhZE9ubHkpIHsgcmV0dXJuIGNhbGxiYWNrKG51bGwpOyB9XG5cdFx0Ly8gSWYgd2UgZG9uJ3QgaGF2ZSBhIGJhZyBpdCBtZWFucyB0aGF0IHRoZSB0aWRkbGVyIGhhc24ndCBiZWVuIHNlZW4gYnkgdGhlIHNlcnZlciwgc28gd2UgZG9uJ3QgbmVlZCB0byBkZWxldGUgaXRcblx0XHQvLyB2YXIgYmFnID0gdGhpcy5nZXRUaWRkbGVyQmFnKHRpdGxlKTtcblx0XHQvLyBpZighYmFnKSB7IHJldHVybiBjYWxsYmFjayhudWxsLCBvcHRpb25zLnRpZGRsZXJJbmZvLmFkYXB0b3JJbmZvKTsgfVxuXHRcdHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV0gPSB7IHR5cGU6IFwiREVMRVRFXCIgfTtcblx0XHQvLyBJc3N1ZSBIVFRQIHJlcXVlc3QgdG8gZGVsZXRlIHRoZSB0aWRkbGVyXG5cdFx0Y29uc3QgW29rLCBlcnIsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLmh0dHBSZXF1ZXN0KHtcblx0XHRcdHVybDogdGhpcy5ob3N0ICsgXCJyZWNpcGVzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMucmVjaXBlKSArIFwiL3RpZGRsZXJzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRpdGxlKSxcblx0XHRcdHR5cGU6IFwiREVMRVRFXCIsXG5cdFx0fSk7XG5cdFx0ZGVsZXRlIHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV07XG5cdFx0aWYgKCFvaykgeyByZXR1cm4gY2FsbGJhY2soZXJyKTsgfVxuXHRcdGNvbnN0IHsgZGF0YSB9ID0gcmVzdWx0O1xuXHRcdGNvbnN0IHJldmlzaW9uID0gZGF0YS50aWRkbGVyX2lkLCBiYWdfbmFtZSA9IGRhdGEuYmFnX25hbWU7XG5cdFx0Ly8gSWYgdGhlcmUgaGFzIGJlZW4gYSBtb3JlIHJlY2VudCB1cGRhdGUgZnJvbSB0aGUgc2VydmVyIHRoZW4gZW5xdWV1ZSBhIGxvYWQgb2YgdGhpcyB0aWRkbGVyXG5cdFx0c2VsZi5jaGVja0xhc3RSZWNvcmRlZFVwZGF0ZSh0aXRsZSwgcmV2aXNpb24pO1xuXHRcdHNlbGYucmVtb3ZlVGlkZGxlckluZm8odGl0bGUpO1xuXHRcdC8vIEludm9rZSB0aGUgY2FsbGJhY2sgJiByZXR1cm4gbnVsbCBhZGFwdG9ySW5mb1xuXHRcdGNhbGxiYWNrKG51bGwsIG51bGwpO1xuXHR9XG59XG5cblxuaWYgKCR0dy5icm93c2VyICYmIGRvY3VtZW50LmxvY2F0aW9uLnByb3RvY29sLnN0YXJ0c1dpdGgoXCJodHRwXCIpKSB7XG5cdGV4cG9ydHMuYWRhcHRvckNsYXNzID0gTXVsdGlXaWtpQ2xpZW50QWRhcHRvcjtcbn1cbiJdfQ==