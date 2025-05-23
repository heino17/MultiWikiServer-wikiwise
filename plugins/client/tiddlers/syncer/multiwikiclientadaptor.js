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
        this.last_known_revision_id = this.wiki.getTiddlerText("$:/state/multiwikiclient/recipe/last_revision_id", "0");
        this.outstandingRequests = Object.create(null); // Hashmap by title of outstanding request object: {type: "PUT"|"GET"|"DELETE"}
        this.lastRecordedUpdate = Object.create(null); // Hashmap by title of last recorded update via SSE: {type: "update"|"detetion", revision_id:}
        this.logger = new $tw.utils.Logger("MultiWikiClientAdaptor");
        this.isLoggedIn = false;
        this.isReadOnly = false;
        this.username = "";
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
    recipeRequest(options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!options.url.startsWith("/"))
                throw new Error("The url does not start with a slash");
            return yield httpRequest(Object.assign(Object.assign({}, options), { responseType: "text", url: this.host + "recipes/" + encodeURIComponent(this.recipe) + options.url })).then(result => {
                var _a;
                // in theory, 403 and 404 should result in further action, 
                // but in reality an error gets logged to console and that's it.
                if (!result.ok) {
                    throw new Error(`The server return a status code ${result.status} with the following reason: `
                        + `${(_a = result.headers.get("x-reason")) !== null && _a !== void 0 ? _a : "(no reason given)"}`);
                }
                else {
                    return result;
                }
            }).then(e => [true, void 0, Object.assign(Object.assign({}, e), { 
                    /** this is undefined if status is not 200 */
                    responseJSON: e.status === 200 ? tryParseJSON(e.response) : undefined })], e => [false, e, void 0]);
            function tryParseJSON(data) {
                try {
                    return JSON.parse(data);
                }
                catch (e) {
                    console.error("Error parsing JSON, returning undefined", e);
                    return undefined;
                }
            }
        });
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
    /*
    Get the current status of the server connection
    */
    getStatus(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            const [ok, error, data] = yield this.recipeRequest({
                key: "handleGetRecipeStatus",
                method: "GET",
                url: "/status",
            });
            if (!ok) {
                this.logger.log("Error getting status", error);
                if (callback)
                    callback(error);
                return;
            }
            const status = data.responseJSON;
            this.isReadOnly = (_a = status === null || status === void 0 ? void 0 : status.isReadOnly) !== null && _a !== void 0 ? _a : true;
            this.isLoggedIn = (_b = status === null || status === void 0 ? void 0 : status.isLoggedIn) !== null && _b !== void 0 ? _b : false;
            this.username = (_c = status === null || status === void 0 ? void 0 : status.username) !== null && _c !== void 0 ? _c : "(anon)";
            if (callback) {
                callback(
                // Error
                null, 
                // Is logged in
                this.isLoggedIn, 
                // Username
                this.username, 
                // Is read only
                this.isReadOnly, 
                // Is anonymous
                // no idea what this means, always return false
                false);
            }
        });
    }
    /*
    Get details of changed tiddlers from the server
    */
    getUpdatedTiddlers(syncer, callback) {
        if (!this.useServerSentEvents) {
            this.pollServer().then(changes => {
                callback(null, changes);
                setTimeout(() => {
                    // If Browswer Storage tiddlers were cached on reloading the wiki, add them after sync from server completes in the above callback.
                    if ($tw.browserStorage && $tw.browserStorage.isEnabled()) {
                        $tw.browserStorage.addCachedTiddlers();
                    }
                });
            }, err => {
                callback(err);
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
                return __awaiter(this, void 0, void 0, function* () {
                    self.logger.log("Error connecting SSE stream", err);
                    // If the stream didn't work, try polling
                    self.setUpdateConnectionStatus(SERVER_POLLING);
                    const changes = yield self.pollServer();
                    self.setUpdateConnectionStatus(SERVER_NOT_CONNECTED);
                    callback(null, changes);
                    setTimeout(() => {
                        // If Browswer Storage tiddlers were cached on reloading the wiki, add them after sync from server completes in the above callback.
                        if ($tw.browserStorage && $tw.browserStorage.isEnabled()) {
                            $tw.browserStorage.addCachedTiddlers();
                        }
                    });
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
        const eventSource = new EventSource("/recipes/" + this.recipe + "/events?last_known_revision_id=" + this.last_known_revision_id);
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
            // Update last seen revision_id
            if (data.revision_id > self.last_known_revision_id) {
                self.last_known_revision_id = data.revision_id;
            }
            // Record the last update to this tiddler
            self.lastRecordedUpdate[data.title] = {
                type: data.is_deleted ? "deletion" : "update",
                revision_id: data.revision_id
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
                    self.setTiddlerInfo(data.title, data.revision_id.toString(), data.bag_name);
                    options.syncer.storeTiddler(data.tiddler);
                }
            }
        });
    }
    pollServer() {
        return __awaiter(this, void 0, void 0, function* () {
            const [ok, err, result] = yield this.recipeRequest({
                key: "handleGetBagStates",
                url: "/bag-states",
                method: "GET",
                queryParams: {
                    include_deleted: "yes",
                }
            });
            if (!ok)
                throw err;
            const bags = result.responseJSON;
            if (!bags)
                return;
            bags.sort((a, b) => b.position - a.position);
            const modified = new Set(), deleted = new Set();
            const incomingTitles = new Set(bags.map(
            // get the titles in each layer that aren't deleted
            e => e.tiddlers.filter(f => !f.is_deleted).map(f => f.title)
            // and flatten them for Set
            ).flat());
            let last_revision = this.last_known_revision_id;
            bags.forEach(bag => {
                bag.tiddlers.forEach(tid => {
                    // if the revision is old, ignore, since deletions create a new revision
                    if (tid.revision_id <= this.last_known_revision_id)
                        return;
                    if (tid.revision_id > last_revision)
                        last_revision = tid.revision_id;
                    // check if this title still exists in any layer
                    if (incomingTitles.has(tid.title))
                        modified.add(tid.title);
                    else
                        deleted.add(tid.title);
                });
            });
            this.last_known_revision_id = last_revision;
            return {
                modifications: [...modified.keys()],
                deletions: [...deleted.keys()],
            };
        });
    }
    /*
    Queue a load for a tiddler if there has been an update for it since the specified revision
    */
    checkLastRecordedUpdate(title, revision) {
        var lru = this.lastRecordedUpdate[title];
        if (lru && lru.revision_id > revision) {
            console.log(`Checking for updates to ${title} since ${JSON.stringify(lru)} comparing to ${revision}`);
            this.syncer && this.syncer.enqueueLoadTiddler(title);
        }
    }
    get syncer() {
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
            // application/x-mws-tiddler
            // The .tid file format does not support field names with colons. 
            // Rather than trying to catch all the unsupported variations that may appear,
            // we'll just use JSON to send it across the wire, since that is the official fallback format anyway.
            // However, parsing a huge string value inside a JSON object is very slow,
            // so we split off the text field and send it after the other fields. 
            const fields = tiddler.getFieldStrings({});
            const text = fields.text;
            delete fields.text;
            let body = JSON.stringify(fields);
            if (tiddler.hasField("text")) {
                if (typeof text !== "string" && text)
                    return callback(new Error("Error saving tiddler " + fields.title + ": the text field is truthy but not a string"));
                body += `\n\n${text}`;
            }
            const [ok, err, result] = yield this.recipeRequest({
                key: "handleSaveRecipeTiddler",
                url: "/tiddlers/" + encodeURIComponent(title),
                method: "PUT",
                requestBodyString: body,
                headers: {
                    "content-type": "application/x-mws-tiddler"
                }
            });
            delete self.outstandingRequests[title];
            if (!ok)
                return callback(err);
            const data = result.responseJSON;
            if (!data)
                return callback(null); // a 2xx response without a body is unlikely
            //If Browser-Storage plugin is present, remove tiddler from local storage after successful sync to the server
            if ($tw.browserStorage && $tw.browserStorage.isEnabled()) {
                $tw.browserStorage.removeTiddlerFromLocalStorage(title);
            }
            // Save the details of the new revision of the tiddler
            const revision = data.revision_id, bag_name = data.bag_name;
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
            var _a, _b;
            var self = this;
            self.outstandingRequests[title] = { type: "GET" };
            const [ok, err, result] = yield this.recipeRequest({
                key: "handleGetRecipeTiddler",
                url: "/tiddlers/" + encodeURIComponent(title),
                method: "GET",
            });
            delete self.outstandingRequests[title];
            if (!ok)
                return callback(err);
            const { responseJSON: data, headers } = result;
            const revision = (_a = headers.get("x-revision-number")) !== null && _a !== void 0 ? _a : "", bag_name = (_b = headers.get("x-bag-name")) !== null && _b !== void 0 ? _b : "";
            if (!revision || !bag_name || !data)
                return callback(null, null);
            // If there has been a more recent update from the server then enqueue a load of this tiddler
            self.checkLastRecordedUpdate(title, revision);
            // Invoke the callback
            self.setTiddlerInfo(title, revision, bag_name);
            callback(null, data);
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
            const [ok, err, result] = yield this.recipeRequest({
                key: "handleDeleteRecipeTiddler",
                url: "/tiddlers/" + encodeURIComponent(title),
                method: "DELETE",
            });
            delete self.outstandingRequests[title];
            if (!ok)
                return callback(err);
            const { responseJSON: data } = result;
            if (!data)
                return callback(null);
            const revision = data.revision_id, bag_name = data.bag_name;
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
function httpRequest(options) {
    options.method = options.method.toUpperCase();
    if ((options.method === "GET" || options.method === "HEAD") && options.requestBodyString)
        throw new Error("requestBodyString must be falsy if method is GET or HEAD");
    function paramsInput(input) {
        if (!input)
            return new URLSearchParams();
        if (input instanceof URLSearchParams)
            return input;
        if (Array.isArray(input) || typeof input === "string")
            return new URLSearchParams(input);
        return new URLSearchParams(Object.entries(input));
    }
    function normalizeHeaders(headers) {
        [...headers.keys()].forEach(([k, v]) => {
            const k2 = k.toLowerCase();
            if (k2 !== k) {
                headers.getAll(k).forEach(e => {
                    headers.append(k2, e);
                });
                headers.delete(k);
                console.log(k, k2);
            }
        });
    }
    return new Promise((resolve) => {
        // if this throws sync'ly, the promise will reject.
        const url = new URL(options.url, location.href);
        const query = paramsInput(options.queryParams);
        query.forEach((v, k) => { url.searchParams.append(k, v); });
        console.log(url, query, options.queryParams, url.href);
        const headers = paramsInput(options.headers);
        normalizeHeaders(headers);
        const request = new XMLHttpRequest();
        request.responseType = options.responseType || "text";
        request.open(options.method, url, true);
        if (!headers.has("content-type"))
            headers.set("content-type", "application/x-www-form-urlencoded; charset=UTF-8");
        if (!headers.has("x-requested-with"))
            headers.set("x-requested-with", "TiddlyWiki");
        headers.set("accept", "application/json");
        headers.forEach((v, k) => {
            request.setRequestHeader(k, v);
        });
        request.onreadystatechange = function () {
            var _a;
            if (this.readyState !== 4)
                return;
            const headers = new URLSearchParams();
            (_a = request.getAllResponseHeaders()) === null || _a === void 0 ? void 0 : _a.trim().split(/[\r\n]+/).forEach((line) => {
                var _a;
                const parts = line.split(": ");
                const header = (_a = parts.shift()) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                const value = parts.join(": ");
                if (header)
                    headers.append(header, value);
            });
            resolve({
                ok: this.status >= 200 && this.status < 300,
                status: this.status,
                statusText: this.statusText,
                response: this.response,
                headers,
            });
        };
        if (options.progress)
            request.onprogress = options.progress;
        request.send(options.requestBodyString);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGl3aWtpY2xpZW50YWRhcHRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tdWx0aXdpa2ljbGllbnRhZGFwdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHO0FBRUgsa0VBQWtFO0FBQ2xFLFlBQVksQ0FBQzs7Ozs7Ozs7Ozs7QUF1SWIsSUFBSSxtQkFBbUIsR0FBRyxnQ0FBZ0MsRUFDekQsb0JBQW9CLEdBQUcscUJBQXFCLEVBQzVDLHdCQUF3QixHQUFHLDJCQUEyQixFQUN0RCxpQkFBaUIsR0FBRyx1Q0FBdUMsRUFDM0Qsc0JBQXNCLEdBQUcsNENBQTRDLEVBQ3JFLHdCQUF3QixHQUFHLHFDQUFxQyxFQUNoRSwrQkFBK0IsR0FBRyxtREFBbUQsRUFDckYsa0JBQWtCLEdBQUcsa0RBQWtELENBQUM7QUFFekUsSUFBSSxvQkFBb0IsR0FBRyxlQUFlLEVBQ3pDLHFCQUFxQixHQUFHLGdCQUFnQixFQUN4QyxvQkFBb0IsR0FBRyxlQUFlLEVBQ3RDLGNBQWMsR0FBRyxnQkFBZ0IsQ0FBQztBQU9uQyxNQUFNLHNCQUFzQjtJQWlCM0IsWUFBWSxPQUFzQjtRQUZsQyxTQUFJLEdBQUcsaUJBQWlCLENBQUM7UUFDakIsd0JBQW1CLEdBQUcsSUFBSSxDQUFDO1FBRWxDLElBQUksQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQztRQUN6QixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUMzQixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7UUFDM0UsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLEtBQUssS0FBSyxDQUFDO1FBQ2xGLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUMsSUFB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Q0FBQztnQkFDNUMsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDL0IsSUFBSSxNQUFNO29CQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzNDLENBQUMsQ0FBQyxDQUFDO1lBQ0gsT0FBTyxDQUFDO2dCQUNQLEVBQUUsRUFBRSxJQUFJLENBQUMsTUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLEdBQUc7Z0JBQzNDLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtnQkFDbkIsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVO2dCQUMzQixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7Z0JBQ3ZCLE9BQU87YUFDUCxDQUFDLENBQUM7UUFFSixDQUFDLENBQUM7UUFFRixJQUFJLE9BQU8sQ0FBQyxRQUFRO1lBQ25CLE9BQU8sQ0FBQyxVQUFVLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQztRQUV2QyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBR3pDLENBQUMsQ0FBQyxDQUFDO0FBRUosQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qXFxcbnRpdGxlOiAkOi9wbHVnaW5zL3RpZGRseXdpa2kvdGlkZGx5d2ViL3RpZGRseXdlYmFkYXB0b3IuanNcbnR5cGU6IGFwcGxpY2F0aW9uL2phdmFzY3JpcHRcbm1vZHVsZS10eXBlOiBzeW5jYWRhcHRvclxuXG5BIHN5bmMgYWRhcHRvciBtb2R1bGUgZm9yIHN5bmNocm9uaXNpbmcgd2l0aCBNdWx0aVdpa2lTZXJ2ZXItY29tcGF0aWJsZSBzZXJ2ZXJzLiBcblxuSXQgaGFzIHRocmVlIGtleSBhcmVhcyBvZiBjb25jZXJuOlxuXG4qIEJhc2ljIG9wZXJhdGlvbnMgbGlrZSBwdXQsIGdldCwgYW5kIGRlbGV0ZSBhIHRpZGRsZXIgb24gdGhlIHNlcnZlclxuKiBSZWFsIHRpbWUgdXBkYXRlcyBmcm9tIHRoZSBzZXJ2ZXIgKGhhbmRsZWQgYnkgU1NFKVxuKiBCYWdzIGFuZCByZWNpcGVzLCB3aGljaCBhcmUgdW5rbm93biB0byB0aGUgc3luY2VyXG5cbkEga2V5IGFzcGVjdCBvZiB0aGUgZGVzaWduIGlzIHRoYXQgdGhlIHN5bmNlciBuZXZlciBvdmVybGFwcyBiYXNpYyBzZXJ2ZXIgb3BlcmF0aW9uczsgaXQgd2FpdHMgZm9yIHRoZVxucHJldmlvdXMgb3BlcmF0aW9uIHRvIGNvbXBsZXRlIGJlZm9yZSBzZW5kaW5nIGEgbmV3IG9uZS5cblxuXFwqL1xuXG4vLyB0aGUgYmxhbmsgbGluZSBpcyBpbXBvcnRhbnQsIGFuZCBzbyBpcyB0aGUgZm9sbG93aW5nIHVzZSBzdHJpY3RcblwidXNlIHN0cmljdFwiO1xuXG5pbXBvcnQgdHlwZSB7IFN5bmNlciwgVGlkZGxlciwgSVRpZGRseVdpa2kgfSBmcm9tIFwidGlkZGx5d2lraVwiO1xuaW1wb3J0IHR5cGUgeyBUaWRkbGVyUm91dGVyIH0gZnJvbSBcIkB0aWRkbHl3aWtpL213cy9zcmMvcm91dGVzL21hbmFnZXJzL3JvdXRlci10aWRkbGVyc1wiO1xuaW1wb3J0IHR5cGUgeyBab2RSb3V0ZSB9IGZyb20gXCJAdGlkZGx5d2lraS9td3Mvc3JjL3JvdXRlclwiO1xuXG5cbmRlY2xhcmUgY2xhc3MgTG9nZ2VyIHtcblx0Y29uc3RydWN0b3IoY29tcG9uZW50TmFtZTogYW55LCBvcHRpb25zOiBhbnkpO1xuXHRjb21wb25lbnROYW1lOiBhbnk7XG5cdGNvbG91cjogYW55O1xuXHRlbmFibGU6IGFueTtcblx0c2F2ZTogYW55O1xuXHRzYXZlTGltaXQ6IGFueTtcblx0c2F2ZUJ1ZmZlckxvZ2dlcjogdGhpcztcblx0YnVmZmVyOiBzdHJpbmc7XG5cdGFsZXJ0Q291bnQ6IG51bWJlcjtcblx0c2V0U2F2ZUJ1ZmZlcihsb2dnZXI6IGFueSk6IHZvaWQ7XG5cdGxvZyguLi5hcmdzOiBhbnlbXSk6IGFueTtcblx0Z2V0QnVmZmVyKCk6IHN0cmluZztcblx0dGFibGUodmFsdWU6IGFueSk6IHZvaWQ7XG5cdGFsZXJ0KC4uLmFyZ3M6IGFueVtdKTogdm9pZDtcblx0Y2xlYXJBbGVydHMoKTogdm9pZDtcbn1cblxudHlwZSBUaWRkbGVyUm91dGVyUmVzcG9uc2UgPSB7XG5cdFtLIGluIGtleW9mIFRpZGRsZXJSb3V0ZXJdOiBUaWRkbGVyUm91dGVyW0tdIGV4dGVuZHMgWm9kUm91dGU8aW5mZXIgTSwgaW5mZXIgQiwgaW5mZXIgUCwgaW5mZXIgUSwgaW5mZXIgVCwgaW5mZXIgUj5cblx0PyB7IE06IE0sIEI6IEIsIFA6IFAsIFE6IFEsIFQ6IFQsIFI6IFIgfVxuXHQ6IG5ldmVyXG59XG5cbmRlY2xhcmUgbW9kdWxlICd0aWRkbHl3aWtpJyB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgU3luY2VyIHtcblx0XHR3aWtpOiBXaWtpO1xuXHRcdGxvZ2dlcjogTG9nZ2VyO1xuXHRcdHRpZGRsZXJJbmZvOiBSZWNvcmQ8c3RyaW5nLCB7IGJhZzogc3RyaW5nOyByZXZpc2lvbjogc3RyaW5nIH0+O1xuXHRcdGVucXVldWVMb2FkVGlkZGxlcih0aXRsZTogc3RyaW5nKTogdm9pZDtcblx0XHRzdG9yZVRpZGRsZXIodGlkZGxlcjogVGlkZGxlcik6IHZvaWQ7XG5cdFx0cHJvY2Vzc1Rhc2tRdWV1ZSgpOiB2b2lkO1xuXHR9XG5cdGludGVyZmFjZSBJVGlkZGx5V2lraSB7XG5cdFx0YnJvd3NlclN0b3JhZ2U6IGFueTtcblx0fVxufVxuXG50eXBlIFNlcnZlclN0YXR1c0NhbGxiYWNrID0gKFxuXHRlcnI6IGFueSxcblx0LyoqIFxuXHQgKiAkOi9zdGF0dXMvSXNMb2dnZWRJbiBtb3N0bHkgYXBwZWFycyBhbG9uZ3NpZGUgdGhlIHVzZXJuYW1lIFxuXHQgKiBvciBvdGhlciBsb2dpbi1jb25kaXRpb25hbCBiZWhhdmlvci4gXG5cdCAqL1xuXHRpc0xvZ2dlZEluPzogYm9vbGVhbixcblx0LyoqXG5cdCAqICQ6L3N0YXR1cy9Vc2VyTmFtZSBpcyBzdGlsbCB1c2VkIGZvciB0aGluZ3MgbGlrZSBkcmFmdHMgZXZlbiBpZiB0aGUgXG5cdCAqIHVzZXIgaXNuJ3QgbG9nZ2VkIGluLCBhbHRob3VnaCB0aGUgdXNlcm5hbWUgaXMgbGVzcyBsaWtlbHkgdG8gYmUgc2hvd24gXG5cdCAqIHRvIHRoZSB1c2VyLiBcblx0ICovXG5cdHVzZXJuYW1lPzogc3RyaW5nLFxuXHQvKiogXG5cdCAqICQ6L3N0YXR1cy9Jc1JlYWRPbmx5IHB1dHMgdGhlIFVJIGluIHJlYWRvbmx5IG1vZGUsIFxuXHQgKiBidXQgZG9lcyBub3QgcHJldmVudCBhdXRvbWF0aWMgY2hhbmdlcyBmcm9tIGF0dGVtcHRpbmcgdG8gc2F2ZS4gXG5cdCAqL1xuXHRpc1JlYWRPbmx5PzogYm9vbGVhbixcblx0LyoqIFxuXHQgKiAkOi9zdGF0dXMvSXNBbm9ueW1vdXMgZG9lcyBub3QgYXBwZWFyIGFueXdoZXJlIGluIHRoZSBUVzUgcmVwbyEgXG5cdCAqIFNvIGl0IGhhcyBubyBhcHBhcmVudCBwdXJwb3NlLiBcblx0ICovXG5cdGlzQW5vbnltb3VzPzogYm9vbGVhblxuKSA9PiB2b2lkXG5cbmludGVyZmFjZSBTeW5jQWRhcHRvcjxBRD4ge1xuXHRuYW1lPzogc3RyaW5nO1xuXG5cdGlzUmVhZHk/KCk6IGJvb2xlYW47XG5cblx0Z2V0U3RhdHVzPyhcblx0XHRjYjogU2VydmVyU3RhdHVzQ2FsbGJhY2tcblx0KTogdm9pZDtcblxuXHRnZXRTa2lubnlUaWRkbGVycz8oXG5cdFx0Y2I6IChlcnI6IGFueSwgdGlkZGxlckZpZWxkczogUmVjb3JkPHN0cmluZywgc3RyaW5nPltdKSA9PiB2b2lkXG5cdCk6IHZvaWQ7XG5cdGdldFVwZGF0ZWRUaWRkbGVycz8oXG5cdFx0c3luY2VyOiBTeW5jZXIsXG5cdFx0Y2I6IChcblx0XHRcdGVycjogYW55LFxuXHRcdFx0LyoqIEFycmF5cyBvZiB0aXRsZXMgdGhhdCBoYXZlIGJlZW4gbW9kaWZpZWQgb3IgZGVsZXRlZCAqL1xuXHRcdFx0dXBkYXRlcz86IHsgbW9kaWZpY2F0aW9uczogc3RyaW5nW10sIGRlbGV0aW9uczogc3RyaW5nW10gfVxuXHRcdCkgPT4gdm9pZFxuXHQpOiB2b2lkO1xuXG5cdC8qKiBcblx0ICogdXNlZCB0byBvdmVycmlkZSB0aGUgZGVmYXVsdCBTeW5jZXIgZ2V0VGlkZGxlclJldmlzaW9uIGJlaGF2aW9yXG5cdCAqIG9mIHJldHVybmluZyB0aGUgcmV2aXNpb24gZmllbGRcblx0ICogXG5cdCAqL1xuXHRnZXRUaWRkbGVyUmV2aXNpb24/KHRpdGxlOiBzdHJpbmcpOiBzdHJpbmc7XG5cdC8qKiBcblx0ICogdXNlZCB0byBnZXQgdGhlIGFkYXB0ZXIgaW5mbyBmcm9tIGEgdGlkZGxlciBpbiBzaXR1YXRpb25zXG5cdCAqIG90aGVyIHRoYW4gdGhlIHNhdmVUaWRkbGVyIGNhbGxiYWNrXG5cdCAqL1xuXHRnZXRUaWRkbGVySW5mbyh0aWRkbGVyOiBUaWRkbGVyKTogQUQgfCB1bmRlZmluZWQ7XG5cblx0c2F2ZVRpZGRsZXIoXG5cdFx0dGlkZGxlcjogYW55LFxuXHRcdGNiOiAoXG5cdFx0XHRlcnI6IGFueSxcblx0XHRcdGFkYXB0b3JJbmZvPzogQUQsXG5cdFx0XHRyZXZpc2lvbj86IHN0cmluZ1xuXHRcdCkgPT4gdm9pZCxcblx0XHRleHRyYTogeyB0aWRkbGVySW5mbzogU3luY2VyVGlkZGxlckluZm88QUQ+IH1cblx0KTogdm9pZDtcblxuXHRzZXRMb2dnZXJTYXZlQnVmZmVyPzogKGxvZ2dlckZvclNhdmluZzogTG9nZ2VyKSA9PiB2b2lkO1xuXHRkaXNwbGF5TG9naW5Qcm9tcHQ/KHN5bmNlcjogU3luY2VyKTogdm9pZDtcblx0bG9naW4/KHVzZXJuYW1lOiBzdHJpbmcsIHBhc3N3b3JkOiBzdHJpbmcsIGNiOiAoZXJyOiBhbnkpID0+IHZvaWQpOiB2b2lkO1xuXHRsb2dvdXQ/KGNiOiAoZXJyOiBhbnkpID0+IHZvaWQpOiBhbnk7XG59XG5pbnRlcmZhY2UgU3luY2VyVGlkZGxlckluZm88QUQ+IHtcblx0LyoqIHRoaXMgY29tZXMgZnJvbSB0aGUgd2lraSBjaGFuZ2VDb3VudCByZWNvcmQgKi9cblx0Y2hhbmdlQ291bnQ6IG51bWJlcjtcblx0LyoqIEFkYXB0ZXIgaW5mbyByZXR1cm5lZCBieSB0aGUgc3luYyBhZGFwdGVyICovXG5cdGFkYXB0b3JJbmZvOiBBRDtcblx0LyoqIFJldmlzaW9uIHJldHVybiBieSB0aGUgc3luYyBhZGFwdGVyICovXG5cdHJldmlzaW9uOiBzdHJpbmc7XG5cdC8qKiBUaW1lc3RhbXAgc2V0IGluIHRoZSBjYWxsYmFjayBvZiB0aGUgcHJldmlvdXMgc2F2ZSAqL1xuXHR0aW1lc3RhbXBMYXN0U2F2ZWQ6IERhdGU7XG59XG5cbmRlY2xhcmUgY29uc3QgJHR3OiBhbnk7XG5cbmRlY2xhcmUgY29uc3QgZXhwb3J0czoge1xuXHRhZGFwdG9yQ2xhc3M6IHR5cGVvZiBNdWx0aVdpa2lDbGllbnRBZGFwdG9yO1xufTtcblxudmFyIENPTkZJR19IT1NUX1RJRERMRVIgPSBcIiQ6L2NvbmZpZy9tdWx0aXdpa2ljbGllbnQvaG9zdFwiLFxuXHRERUZBVUxUX0hPU1RfVElERExFUiA9IFwiJHByb3RvY29sJC8vJGhvc3QkL1wiLFxuXHRNV0NfU1RBVEVfVElERExFUl9QUkVGSVggPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC9cIixcblx0QkFHX1NUQVRFX1RJRERMRVIgPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC90aWRkbGVycy9iYWdcIixcblx0UkVWSVNJT05fU1RBVEVfVElERExFUiA9IFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L3RpZGRsZXJzL3JldmlzaW9uXCIsXG5cdENPTk5FQ1RJT05fU1RBVEVfVElERExFUiA9IFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L2Nvbm5lY3Rpb25cIixcblx0SU5DT01JTkdfVVBEQVRFU19GSUxURVJfVElERExFUiA9IFwiJDovY29uZmlnL211bHRpd2lraWNsaWVudC9pbmNvbWluZy11cGRhdGVzLWZpbHRlclwiLFxuXHRFTkFCTEVfU1NFX1RJRERMRVIgPSBcIiQ6L2NvbmZpZy9tdWx0aXdpa2ljbGllbnQvdXNlLXNlcnZlci1zZW50LWV2ZW50c1wiO1xuXG52YXIgU0VSVkVSX05PVF9DT05ORUNURUQgPSBcIk5PVCBDT05ORUNURURcIixcblx0U0VSVkVSX0NPTk5FQ1RJTkdfU1NFID0gXCJDT05ORUNUSU5HIFNTRVwiLFxuXHRTRVJWRVJfQ09OTkVDVEVEX1NTRSA9IFwiQ09OTkVDVEVEIFNTRVwiLFxuXHRTRVJWRVJfUE9MTElORyA9IFwiU0VSVkVSIFBPTExJTkdcIjtcblxuaW50ZXJmYWNlIE1XU0FkYXB0b3JJbmZvIHtcblx0YmFnOiBzdHJpbmdcbn1cblxuXG5jbGFzcyBNdWx0aVdpa2lDbGllbnRBZGFwdG9yIGltcGxlbWVudHMgU3luY0FkYXB0b3I8TVdTQWRhcHRvckluZm8+IHtcblx0cHJpdmF0ZSB3aWtpO1xuXHRwcml2YXRlIGhvc3Q7XG5cdHByaXZhdGUgcmVjaXBlO1xuXHRwcml2YXRlIHVzZVNlcnZlclNlbnRFdmVudHM7XG5cdHByaXZhdGUgbGFzdF9rbm93bl9yZXZpc2lvbl9pZDtcblx0cHJpdmF0ZSBvdXRzdGFuZGluZ1JlcXVlc3RzO1xuXHRwcml2YXRlIGxhc3RSZWNvcmRlZFVwZGF0ZTtcblx0cHJpdmF0ZSBsb2dnZXI7XG5cdHByaXZhdGUgaXNMb2dnZWRJbjtcblx0cHJpdmF0ZSBpc1JlYWRPbmx5O1xuXHRwcml2YXRlIHVzZXJuYW1lO1xuXHRwcml2YXRlIGluY29taW5nVXBkYXRlc0ZpbHRlckZuO1xuXHRwcml2YXRlIHNlcnZlclVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMhOiBzdHJpbmc7XG5cblx0bmFtZSA9IFwibXVsdGl3aWtpY2xpZW50XCI7XG5cdHByaXZhdGUgc3VwcG9ydHNMYXp5TG9hZGluZyA9IHRydWU7XG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IHsgd2lraTogYW55IH0pIHtcblx0XHR0aGlzLndpa2kgPSBvcHRpb25zLndpa2k7XG5cdFx0dGhpcy5ob3N0ID0gdGhpcy5nZXRIb3N0KCk7XG5cdFx0dGhpcy5yZWNpcGUgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L3JlY2lwZVwiKTtcblx0XHR0aGlzLnVzZVNlcnZlclNlbnRFdmVudHMgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoRU5BQkxFX1NTRV9USURETEVSKSA9PT0gXCJ5ZXNcIjtcblx0XHR0aGlzLmxhc3Rfa25vd25fcmV2aXNpb25faWQgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvcmVjaXBlL2xhc3RfcmV2aXNpb25faWRcIiwgXCIwXCIpXG5cdFx0dGhpcy5vdXRzdGFuZGluZ1JlcXVlc3RzID0gT2JqZWN0LmNyZWF0ZShudWxsKTsgLy8gSGFzaG1hcCBieSB0aXRsZSBvZiBvdXRzdGFuZGluZyByZXF1ZXN0IG9iamVjdDoge3R5cGU6IFwiUFVUXCJ8XCJHRVRcInxcIkRFTEVURVwifVxuXHRcdHRoaXMubGFzdFJlY29yZGVkVXBkYXRlID0gT2JqZWN0LmNyZWF0ZShudWxsKTsgLy8gSGFzaG1hcCBieSB0aXRsZSBvZiBsYXN0IHJlY29yZGVkIHVwZGF0ZSB2aWEgU1NFOiB7dHlwZTogXCJ1cGRhdGVcInxcImRldGV0aW9uXCIsIHJldmlzaW9uX2lkOn1cblx0XHR0aGlzLmxvZ2dlciA9IG5ldyAkdHcudXRpbHMuTG9nZ2VyKFwiTXVsdGlXaWtpQ2xpZW50QWRhcHRvclwiKTtcblx0XHR0aGlzLmlzTG9nZ2VkSW4gPSBmYWxzZTtcblx0XHR0aGlzLmlzUmVhZE9ubHkgPSBmYWxzZTtcblx0XHR0aGlzLnVzZXJuYW1lID0gXCJcIjtcblx0XHQvLyBDb21waWxlIHRoZSBkaXJ0eSB0aWRkbGVyIGZpbHRlclxuXHRcdHRoaXMuaW5jb21pbmdVcGRhdGVzRmlsdGVyRm4gPSB0aGlzLndpa2kuY29tcGlsZUZpbHRlcih0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoSU5DT01JTkdfVVBEQVRFU19GSUxURVJfVElERExFUikpO1xuXHRcdHRoaXMuc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhTRVJWRVJfTk9UX0NPTk5FQ1RFRCk7XG5cdH1cblxuXHRwcml2YXRlIHNldFVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMoc3RhdHVzOiBzdHJpbmcpIHtcblx0XHR0aGlzLnNlcnZlclVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMgPSBzdGF0dXM7XG5cdFx0dGhpcy53aWtpLmFkZFRpZGRsZXIoe1xuXHRcdFx0dGl0bGU6IENPTk5FQ1RJT05fU1RBVEVfVElERExFUixcblx0XHRcdHRleHQ6IHN0YXR1c1xuXHRcdH0pO1xuXHR9XG5cdHNldExvZ2dlclNhdmVCdWZmZXIobG9nZ2VyRm9yU2F2aW5nOiBMb2dnZXIpIHtcblx0XHR0aGlzLmxvZ2dlci5zZXRTYXZlQnVmZmVyKGxvZ2dlckZvclNhdmluZyk7XG5cdH1cblx0aXNSZWFkeSgpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwcml2YXRlIGdldEhvc3QoKSB7XG5cdFx0dmFyIHRleHQgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoQ09ORklHX0hPU1RfVElERExFUiwgREVGQVVMVF9IT1NUX1RJRERMRVIpLCBzdWJzdGl0dXRpb25zID0gW1xuXHRcdFx0eyBuYW1lOiBcInByb3RvY29sXCIsIHZhbHVlOiBkb2N1bWVudC5sb2NhdGlvbi5wcm90b2NvbCB9LFxuXHRcdFx0eyBuYW1lOiBcImhvc3RcIiwgdmFsdWU6IGRvY3VtZW50LmxvY2F0aW9uLmhvc3QgfSxcblx0XHRcdHsgbmFtZTogXCJwYXRobmFtZVwiLCB2YWx1ZTogZG9jdW1lbnQubG9jYXRpb24ucGF0aG5hbWUgfVxuXHRcdF07XG5cdFx0Zm9yICh2YXIgdCA9IDA7IHQgPCBzdWJzdGl0dXRpb25zLmxlbmd0aDsgdCsrKSB7XG5cdFx0XHR2YXIgcyA9IHN1YnN0aXR1dGlvbnNbdF07XG5cdFx0XHR0ZXh0ID0gJHR3LnV0aWxzLnJlcGxhY2VTdHJpbmcodGV4dCwgbmV3IFJlZ0V4cChcIlxcXFwkXCIgKyBzLm5hbWUgKyBcIlxcXFwkXCIsIFwibWdcIiksIHMudmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGV4dDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVjaXBlUmVxdWVzdDxLRVkgZXh0ZW5kcyAoc3RyaW5nICYga2V5b2YgVGlkZGxlclJvdXRlclJlc3BvbnNlKT4oXG5cdFx0b3B0aW9uczogT21pdDxIdHRwUmVxdWVzdE9wdGlvbnM8XCJ0ZXh0XCI+LCBcInJlc3BvbnNlVHlwZVwiPiAmIHsga2V5OiBLRVkgfVxuXHQpIHtcblx0XHRpZiAoIW9wdGlvbnMudXJsLnN0YXJ0c1dpdGgoXCIvXCIpKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiVGhlIHVybCBkb2VzIG5vdCBzdGFydCB3aXRoIGEgc2xhc2hcIik7XG5cblx0XHRyZXR1cm4gYXdhaXQgaHR0cFJlcXVlc3Qoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdHJlc3BvbnNlVHlwZTogXCJ0ZXh0XCIsXG5cdFx0XHR1cmw6IHRoaXMuaG9zdCArIFwicmVjaXBlcy9cIiArIGVuY29kZVVSSUNvbXBvbmVudCh0aGlzLnJlY2lwZSkgKyBvcHRpb25zLnVybCxcblx0XHR9KS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHQvLyBpbiB0aGVvcnksIDQwMyBhbmQgNDA0IHNob3VsZCByZXN1bHQgaW4gZnVydGhlciBhY3Rpb24sIFxuXHRcdFx0Ly8gYnV0IGluIHJlYWxpdHkgYW4gZXJyb3IgZ2V0cyBsb2dnZWQgdG8gY29uc29sZSBhbmQgdGhhdCdzIGl0LlxuXHRcdFx0aWYgKCFyZXN1bHQub2spIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XHRcdGBUaGUgc2VydmVyIHJldHVybiBhIHN0YXR1cyBjb2RlICR7cmVzdWx0LnN0YXR1c30gd2l0aCB0aGUgZm9sbG93aW5nIHJlYXNvbjogYFxuXHRcdFx0XHRcdCsgYCR7cmVzdWx0LmhlYWRlcnMuZ2V0KFwieC1yZWFzb25cIikgPz8gXCIobm8gcmVhc29uIGdpdmVuKVwifWBcblx0XHRcdFx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fSkudGhlbihlID0+IFt0cnVlLCB2b2lkIDAsIHtcblx0XHRcdC4uLmUsXG5cdFx0XHQvKiogdGhpcyBpcyB1bmRlZmluZWQgaWYgc3RhdHVzIGlzIG5vdCAyMDAgKi9cblx0XHRcdHJlc3BvbnNlSlNPTjogZS5zdGF0dXMgPT09IDIwMCA/IHRyeVBhcnNlSlNPTihlLnJlc3BvbnNlKSBhcyBUaWRkbGVyUm91dGVyUmVzcG9uc2VbS0VZXVtcIlJcIl0gOiB1bmRlZmluZWRcblx0XHR9XSBhcyBjb25zdCwgZSA9PiBbZmFsc2UsIGUsIHZvaWQgMF0gYXMgY29uc3QpO1xuXG5cdFx0ZnVuY3Rpb24gdHJ5UGFyc2VKU09OKGRhdGE6IHN0cmluZykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIEpTT04ucGFyc2UoZGF0YSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoXCJFcnJvciBwYXJzaW5nIEpTT04sIHJldHVybmluZyB1bmRlZmluZWRcIiwgZSk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdH1cblxuXHRnZXRUaWRkbGVySW5mbyh0aWRkbGVyOiBUaWRkbGVyKSB7XG5cdFx0dmFyIHRpdGxlID0gdGlkZGxlci5maWVsZHMudGl0bGUsXG5cdFx0XHRyZXZpc2lvbiA9IHRoaXMud2lraS5leHRyYWN0VGlkZGxlckRhdGFJdGVtKFJFVklTSU9OX1NUQVRFX1RJRERMRVIsIHRpdGxlKSxcblx0XHRcdGJhZyA9IHRoaXMud2lraS5leHRyYWN0VGlkZGxlckRhdGFJdGVtKEJBR19TVEFURV9USURETEVSLCB0aXRsZSk7XG5cdFx0aWYgKHJldmlzaW9uICYmIGJhZykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGl0bGU6IHRpdGxlLFxuXHRcdFx0XHRyZXZpc2lvbjogcmV2aXNpb24sXG5cdFx0XHRcdGJhZzogYmFnXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXHRwcml2YXRlIGdldFRpZGRsZXJCYWcodGl0bGU6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLndpa2kuZXh0cmFjdFRpZGRsZXJEYXRhSXRlbShCQUdfU1RBVEVfVElERExFUiwgdGl0bGUpO1xuXHR9XG5cdGdldFRpZGRsZXJSZXZpc2lvbih0aXRsZTogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMud2lraS5leHRyYWN0VGlkZGxlckRhdGFJdGVtKFJFVklTSU9OX1NUQVRFX1RJRERMRVIsIHRpdGxlKTtcblx0fVxuXHRwcml2YXRlIHNldFRpZGRsZXJJbmZvKHRpdGxlOiBzdHJpbmcsIHJldmlzaW9uOiBzdHJpbmcsIGJhZzogc3RyaW5nKSB7XG5cdFx0dGhpcy53aWtpLnNldFRleHQoQkFHX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCBiYWcsIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdFx0dGhpcy53aWtpLnNldFRleHQoUkVWSVNJT05fU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIHJldmlzaW9uLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHR9XG5cdHByaXZhdGUgcmVtb3ZlVGlkZGxlckluZm8odGl0bGU6IHN0cmluZykge1xuXHRcdHRoaXMud2lraS5zZXRUZXh0KEJBR19TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgdW5kZWZpbmVkLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHRcdHRoaXMud2lraS5zZXRUZXh0KFJFVklTSU9OX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCB1bmRlZmluZWQsIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdH1cblxuXHQvKlxuXHRHZXQgdGhlIGN1cnJlbnQgc3RhdHVzIG9mIHRoZSBzZXJ2ZXIgY29ubmVjdGlvblxuXHQqL1xuXHRhc3luYyBnZXRTdGF0dXMoY2FsbGJhY2s6IFNlcnZlclN0YXR1c0NhbGxiYWNrKSB7XG5cblx0XHRjb25zdCBbb2ssIGVycm9yLCBkYXRhXSA9IGF3YWl0IHRoaXMucmVjaXBlUmVxdWVzdCh7XG5cdFx0XHRrZXk6IFwiaGFuZGxlR2V0UmVjaXBlU3RhdHVzXCIsXG5cdFx0XHRtZXRob2Q6IFwiR0VUXCIsXG5cdFx0XHR1cmw6IFwiL3N0YXR1c1wiLFxuXHRcdH0pO1xuXHRcdGlmICghb2spIHtcblx0XHRcdHRoaXMubG9nZ2VyLmxvZyhcIkVycm9yIGdldHRpbmcgc3RhdHVzXCIsIGVycm9yKTtcblx0XHRcdGlmIChjYWxsYmFjaykgY2FsbGJhY2soZXJyb3IpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdGF0dXMgPSBkYXRhLnJlc3BvbnNlSlNPTjtcblx0XHR0aGlzLmlzUmVhZE9ubHkgPSBzdGF0dXM/LmlzUmVhZE9ubHkgPz8gdHJ1ZTtcblx0XHR0aGlzLmlzTG9nZ2VkSW4gPSBzdGF0dXM/LmlzTG9nZ2VkSW4gPz8gZmFsc2U7XG5cdFx0dGhpcy51c2VybmFtZSA9IHN0YXR1cz8udXNlcm5hbWUgPz8gXCIoYW5vbilcIjtcblx0XHRpZiAoY2FsbGJhY2spIHtcblx0XHRcdGNhbGxiYWNrKFxuXHRcdFx0XHQvLyBFcnJvclxuXHRcdFx0XHRudWxsLFxuXHRcdFx0XHQvLyBJcyBsb2dnZWQgaW5cblx0XHRcdFx0dGhpcy5pc0xvZ2dlZEluLFxuXHRcdFx0XHQvLyBVc2VybmFtZVxuXHRcdFx0XHR0aGlzLnVzZXJuYW1lLFxuXHRcdFx0XHQvLyBJcyByZWFkIG9ubHlcblx0XHRcdFx0dGhpcy5pc1JlYWRPbmx5LFxuXHRcdFx0XHQvLyBJcyBhbm9ueW1vdXNcblx0XHRcdFx0Ly8gbm8gaWRlYSB3aGF0IHRoaXMgbWVhbnMsIGFsd2F5cyByZXR1cm4gZmFsc2Vcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXHQvKlxuXHRHZXQgZGV0YWlscyBvZiBjaGFuZ2VkIHRpZGRsZXJzIGZyb20gdGhlIHNlcnZlclxuXHQqL1xuXHRnZXRVcGRhdGVkVGlkZGxlcnMoc3luY2VyOiBTeW5jZXIsIGNhbGxiYWNrOiAoZXJyOiBhbnksIGNoYW5nZXM/OiB7IG1vZGlmaWNhdGlvbnM6IHN0cmluZ1tdOyBkZWxldGlvbnM6IHN0cmluZ1tdIH0pID0+IHZvaWQpIHtcblx0XHRpZiAoIXRoaXMudXNlU2VydmVyU2VudEV2ZW50cykge1xuXHRcdFx0dGhpcy5wb2xsU2VydmVyKCkudGhlbihjaGFuZ2VzID0+IHtcblx0XHRcdFx0Y2FsbGJhY2sobnVsbCwgY2hhbmdlcyk7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdC8vIElmIEJyb3dzd2VyIFN0b3JhZ2UgdGlkZGxlcnMgd2VyZSBjYWNoZWQgb24gcmVsb2FkaW5nIHRoZSB3aWtpLCBhZGQgdGhlbSBhZnRlciBzeW5jIGZyb20gc2VydmVyIGNvbXBsZXRlcyBpbiB0aGUgYWJvdmUgY2FsbGJhY2suXG5cdFx0XHRcdFx0aWYgKCR0dy5icm93c2VyU3RvcmFnZSAmJiAkdHcuYnJvd3NlclN0b3JhZ2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0XHRcdCR0dy5icm93c2VyU3RvcmFnZS5hZGRDYWNoZWRUaWRkbGVycygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9LCBlcnIgPT4ge1xuXHRcdFx0XHRjYWxsYmFjayhlcnIpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdC8vIERvIG5vdGhpbmcgaWYgdGhlcmUncyBhbHJlYWR5IGEgY29ubmVjdGlvbiBpbiBwcm9ncmVzcy5cblx0XHRpZiAodGhpcy5zZXJ2ZXJVcGRhdGVDb25uZWN0aW9uU3RhdHVzICE9PSBTRVJWRVJfTk9UX0NPTk5FQ1RFRCkge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKG51bGwsIHtcblx0XHRcdFx0bW9kaWZpY2F0aW9uczogW10sXG5cdFx0XHRcdGRlbGV0aW9uczogW11cblx0XHRcdH0pO1xuXHRcdH1cblx0XHQvLyBUcnkgdG8gY29ubmVjdCBhIHNlcnZlciBzdHJlYW1cblx0XHR0aGlzLnNldFVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMoU0VSVkVSX0NPTk5FQ1RJTkdfU1NFKTtcblx0XHR0aGlzLmNvbm5lY3RTZXJ2ZXJTdHJlYW0oe1xuXHRcdFx0c3luY2VyOiBzeW5jZXIsXG5cdFx0XHRvbmVycm9yOiBhc3luYyBmdW5jdGlvbiAoZXJyKSB7XG5cdFx0XHRcdHNlbGYubG9nZ2VyLmxvZyhcIkVycm9yIGNvbm5lY3RpbmcgU1NFIHN0cmVhbVwiLCBlcnIpO1xuXHRcdFx0XHQvLyBJZiB0aGUgc3RyZWFtIGRpZG4ndCB3b3JrLCB0cnkgcG9sbGluZ1xuXHRcdFx0XHRzZWxmLnNldFVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMoU0VSVkVSX1BPTExJTkcpO1xuXHRcdFx0XHRjb25zdCBjaGFuZ2VzID0gYXdhaXQgc2VsZi5wb2xsU2VydmVyKCk7XG5cdFx0XHRcdHNlbGYuc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhTRVJWRVJfTk9UX0NPTk5FQ1RFRCk7XG5cdFx0XHRcdGNhbGxiYWNrKG51bGwsIGNoYW5nZXMpO1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHQvLyBJZiBCcm93c3dlciBTdG9yYWdlIHRpZGRsZXJzIHdlcmUgY2FjaGVkIG9uIHJlbG9hZGluZyB0aGUgd2lraSwgYWRkIHRoZW0gYWZ0ZXIgc3luYyBmcm9tIHNlcnZlciBjb21wbGV0ZXMgaW4gdGhlIGFib3ZlIGNhbGxiYWNrLlxuXHRcdFx0XHRcdGlmICgkdHcuYnJvd3NlclN0b3JhZ2UgJiYgJHR3LmJyb3dzZXJTdG9yYWdlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0XHQkdHcuYnJvd3NlclN0b3JhZ2UuYWRkQ2FjaGVkVGlkZGxlcnMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdG9ub3BlbjogZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRzZWxmLnNldFVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMoU0VSVkVSX0NPTk5FQ1RFRF9TU0UpO1xuXHRcdFx0XHQvLyBUaGUgc3luY2VyIGlzIGV4cGVjdGluZyBhIGNhbGxiYWNrIGJ1dCB3ZSBkb24ndCBoYXZlIGFueSBkYXRhIHRvIHNlbmRcblx0XHRcdFx0Y2FsbGJhY2sobnVsbCwge1xuXHRcdFx0XHRcdG1vZGlmaWNhdGlvbnM6IFtdLFxuXHRcdFx0XHRcdGRlbGV0aW9uczogW11cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0fVxuXHQvKlxuXHRBdHRlbXB0IHRvIGVzdGFibGlzaCBhbiBTU0Ugc3RyZWFtIHdpdGggdGhlIHNlcnZlciBhbmQgdHJhbnNmZXIgdGlkZGxlciBjaGFuZ2VzLiBPcHRpb25zIGluY2x1ZGU6XG4gIFxuXHRzeW5jZXI6IHJlZmVyZW5jZSB0byBzeW5jZXIgb2JqZWN0IHVzZWQgZm9yIHN0b3JpbmcgZGF0YVxuXHRvbm9wZW46IGludm9rZWQgd2hlbiB0aGUgc3RyZWFtIGlzIHN1Y2Nlc3NmdWxseSBvcGVuZWRcblx0b25lcnJvcjogaW52b2tlZCBpZiB0aGVyZSBpcyBhbiBlcnJvclxuXHQqL1xuXHRwcml2YXRlIGNvbm5lY3RTZXJ2ZXJTdHJlYW0ob3B0aW9uczoge1xuXHRcdHN5bmNlcjogU3luY2VyO1xuXHRcdG9ub3BlbjogKGV2ZW50OiBFdmVudCkgPT4gdm9pZDtcblx0XHRvbmVycm9yOiAoZXZlbnQ6IEV2ZW50KSA9PiB2b2lkO1xuXHR9KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdGNvbnN0IGV2ZW50U291cmNlID0gbmV3IEV2ZW50U291cmNlKFwiL3JlY2lwZXMvXCIgKyB0aGlzLnJlY2lwZSArIFwiL2V2ZW50cz9sYXN0X2tub3duX3JldmlzaW9uX2lkPVwiICsgdGhpcy5sYXN0X2tub3duX3JldmlzaW9uX2lkKTtcblx0XHRldmVudFNvdXJjZS5vbmVycm9yID0gZnVuY3Rpb24gKGV2ZW50KSB7XG5cdFx0XHRpZiAob3B0aW9ucy5vbmVycm9yKSB7XG5cdFx0XHRcdG9wdGlvbnMub25lcnJvcihldmVudCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRldmVudFNvdXJjZS5vbm9wZW4gPSBmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHRcdGlmIChvcHRpb25zLm9ub3Blbikge1xuXHRcdFx0XHRvcHRpb25zLm9ub3BlbihldmVudCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRldmVudFNvdXJjZS5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIGZ1bmN0aW9uIChldmVudCkge1xuXG5cdFx0XHRjb25zdCBkYXRhOiB7XG5cdFx0XHRcdHRpdGxlOiBzdHJpbmc7XG5cdFx0XHRcdHJldmlzaW9uX2lkOiBudW1iZXI7XG5cdFx0XHRcdGlzX2RlbGV0ZWQ6IGJvb2xlYW47XG5cdFx0XHRcdGJhZ19uYW1lOiBzdHJpbmc7XG5cdFx0XHRcdHRpZGRsZXI6IGFueTtcblx0XHRcdH0gPSAkdHcudXRpbHMucGFyc2VKU09OU2FmZShldmVudC5kYXRhKTtcblx0XHRcdGlmICghZGF0YSkgcmV0dXJuO1xuXG5cdFx0XHRjb25zb2xlLmxvZyhcIlNTRSBkYXRhXCIsIGRhdGEpO1xuXHRcdFx0Ly8gVXBkYXRlIGxhc3Qgc2VlbiByZXZpc2lvbl9pZFxuXHRcdFx0aWYgKGRhdGEucmV2aXNpb25faWQgPiBzZWxmLmxhc3Rfa25vd25fcmV2aXNpb25faWQpIHtcblx0XHRcdFx0c2VsZi5sYXN0X2tub3duX3JldmlzaW9uX2lkID0gZGF0YS5yZXZpc2lvbl9pZDtcblx0XHRcdH1cblx0XHRcdC8vIFJlY29yZCB0aGUgbGFzdCB1cGRhdGUgdG8gdGhpcyB0aWRkbGVyXG5cdFx0XHRzZWxmLmxhc3RSZWNvcmRlZFVwZGF0ZVtkYXRhLnRpdGxlXSA9IHtcblx0XHRcdFx0dHlwZTogZGF0YS5pc19kZWxldGVkID8gXCJkZWxldGlvblwiIDogXCJ1cGRhdGVcIixcblx0XHRcdFx0cmV2aXNpb25faWQ6IGRhdGEucmV2aXNpb25faWRcblx0XHRcdH07XG5cdFx0XHRjb25zb2xlLmxvZyhgT3VzdGFuZGluZyByZXF1ZXN0cyBpcyAke0pTT04uc3RyaW5naWZ5KHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1tkYXRhLnRpdGxlXSl9YCk7XG5cdFx0XHQvLyBQcm9jZXNzIHRoZSB1cGRhdGUgaWYgdGhlIHRpZGRsZXIgaXMgbm90IHRoZSBzdWJqZWN0IG9mIGFuIG91dHN0YW5kaW5nIHJlcXVlc3Rcblx0XHRcdGlmIChzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbZGF0YS50aXRsZV0pIHJldHVybjtcblx0XHRcdGlmIChkYXRhLmlzX2RlbGV0ZWQpIHtcblx0XHRcdFx0c2VsZi5yZW1vdmVUaWRkbGVySW5mbyhkYXRhLnRpdGxlKTtcblx0XHRcdFx0ZGVsZXRlIG9wdGlvbnMuc3luY2VyLnRpZGRsZXJJbmZvW2RhdGEudGl0bGVdO1xuXHRcdFx0XHRvcHRpb25zLnN5bmNlci5sb2dnZXIubG9nKFwiRGVsZXRpbmcgdGlkZGxlciBtaXNzaW5nIGZyb20gc2VydmVyOlwiLCBkYXRhLnRpdGxlKTtcblx0XHRcdFx0b3B0aW9ucy5zeW5jZXIud2lraS5kZWxldGVUaWRkbGVyKGRhdGEudGl0bGUpO1xuXHRcdFx0XHRvcHRpb25zLnN5bmNlci5wcm9jZXNzVGFza1F1ZXVlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2YXIgcmVzdWx0ID0gc2VsZi5pbmNvbWluZ1VwZGF0ZXNGaWx0ZXJGbi5jYWxsKHNlbGYud2lraSwgc2VsZi53aWtpLm1ha2VUaWRkbGVySXRlcmF0b3IoW2RhdGEudGl0bGVdKSk7XG5cdFx0XHRcdGlmIChyZXN1bHQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHNlbGYuc2V0VGlkZGxlckluZm8oZGF0YS50aXRsZSwgZGF0YS5yZXZpc2lvbl9pZC50b1N0cmluZygpLCBkYXRhLmJhZ19uYW1lKTtcblx0XHRcdFx0XHRvcHRpb25zLnN5bmNlci5zdG9yZVRpZGRsZXIoZGF0YS50aWRkbGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cblx0XHR9KTtcblx0fVxuXHRwcml2YXRlIGFzeW5jIHBvbGxTZXJ2ZXIoKSB7XG5cdFx0dHlwZSB0PSAgVGlkZGxlclJvdXRlclJlc3BvbnNlW1wiaGFuZGxlR2V0QmFnU3RhdGVzXCJdXG5cdFx0Y29uc3QgW29rLCBlcnIsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3Qoe1xuXHRcdFx0a2V5OiBcImhhbmRsZUdldEJhZ1N0YXRlc1wiLFxuXHRcdFx0dXJsOiBcIi9iYWctc3RhdGVzXCIsXG5cdFx0XHRtZXRob2Q6IFwiR0VUXCIsXG5cdFx0XHRxdWVyeVBhcmFtczoge1xuXHRcdFx0XHRpbmNsdWRlX2RlbGV0ZWQ6IFwieWVzXCIsXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoIW9rKSB0aHJvdyBlcnI7XG5cblx0XHRjb25zdCBiYWdzID0gcmVzdWx0LnJlc3BvbnNlSlNPTjtcblxuXHRcdGlmICghYmFncykgcmV0dXJuO1xuXG5cdFx0YmFncy5zb3J0KChhLCBiKSA9PiBiLnBvc2l0aW9uIC0gYS5wb3NpdGlvbik7XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBuZXcgU2V0PHN0cmluZz4oKSxcblx0XHRcdGRlbGV0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdGNvbnN0IGluY29taW5nVGl0bGVzID0gbmV3IFNldDxzdHJpbmc+KGJhZ3MubWFwKFxuXHRcdFx0Ly8gZ2V0IHRoZSB0aXRsZXMgaW4gZWFjaCBsYXllciB0aGF0IGFyZW4ndCBkZWxldGVkXG5cdFx0XHRlID0+IGUudGlkZGxlcnMuZmlsdGVyKGYgPT4gIWYuaXNfZGVsZXRlZCkubWFwKGYgPT4gZi50aXRsZSlcblx0XHRcdC8vIGFuZCBmbGF0dGVuIHRoZW0gZm9yIFNldFxuXHRcdCkuZmxhdCgpKTtcblxuXHRcdGxldCBsYXN0X3JldmlzaW9uID0gdGhpcy5sYXN0X2tub3duX3JldmlzaW9uX2lkO1xuXG5cdFx0YmFncy5mb3JFYWNoKGJhZyA9PiB7XG5cdFx0XHRiYWcudGlkZGxlcnMuZm9yRWFjaCh0aWQgPT4ge1xuXHRcdFx0XHQvLyBpZiB0aGUgcmV2aXNpb24gaXMgb2xkLCBpZ25vcmUsIHNpbmNlIGRlbGV0aW9ucyBjcmVhdGUgYSBuZXcgcmV2aXNpb25cblx0XHRcdFx0aWYgKHRpZC5yZXZpc2lvbl9pZCA8PSB0aGlzLmxhc3Rfa25vd25fcmV2aXNpb25faWQpIHJldHVybjtcblx0XHRcdFx0aWYgKHRpZC5yZXZpc2lvbl9pZCA+IGxhc3RfcmV2aXNpb24pIGxhc3RfcmV2aXNpb24gPSB0aWQucmV2aXNpb25faWQ7XG5cdFx0XHRcdC8vIGNoZWNrIGlmIHRoaXMgdGl0bGUgc3RpbGwgZXhpc3RzIGluIGFueSBsYXllclxuXHRcdFx0XHRpZiAoaW5jb21pbmdUaXRsZXMuaGFzKHRpZC50aXRsZSkpXG5cdFx0XHRcdFx0bW9kaWZpZWQuYWRkKHRpZC50aXRsZSk7XG5cdFx0XHRcdGVsc2Vcblx0XHRcdFx0XHRkZWxldGVkLmFkZCh0aWQudGl0bGUpO1xuXHRcdFx0fSlcblx0XHR9KTtcblxuXHRcdHRoaXMubGFzdF9rbm93bl9yZXZpc2lvbl9pZCA9IGxhc3RfcmV2aXNpb247XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bW9kaWZpY2F0aW9uczogWy4uLm1vZGlmaWVkLmtleXMoKV0sXG5cdFx0XHRkZWxldGlvbnM6IFsuLi5kZWxldGVkLmtleXMoKV0sXG5cdFx0fVxuXG5cdH1cblxuXHQvKlxuXHRRdWV1ZSBhIGxvYWQgZm9yIGEgdGlkZGxlciBpZiB0aGVyZSBoYXMgYmVlbiBhbiB1cGRhdGUgZm9yIGl0IHNpbmNlIHRoZSBzcGVjaWZpZWQgcmV2aXNpb25cblx0Ki9cblx0cHJpdmF0ZSBjaGVja0xhc3RSZWNvcmRlZFVwZGF0ZSh0aXRsZTogc3RyaW5nLCByZXZpc2lvbjogc3RyaW5nKSB7XG5cdFx0dmFyIGxydSA9IHRoaXMubGFzdFJlY29yZGVkVXBkYXRlW3RpdGxlXTtcblx0XHRpZiAobHJ1ICYmIGxydS5yZXZpc2lvbl9pZCA+IHJldmlzaW9uKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhgQ2hlY2tpbmcgZm9yIHVwZGF0ZXMgdG8gJHt0aXRsZX0gc2luY2UgJHtKU09OLnN0cmluZ2lmeShscnUpfSBjb21wYXJpbmcgdG8gJHtyZXZpc2lvbn1gKTtcblx0XHRcdHRoaXMuc3luY2VyICYmIHRoaXMuc3luY2VyLmVucXVldWVMb2FkVGlkZGxlcih0aXRsZSk7XG5cdFx0fVxuXHR9XG5cdHByaXZhdGUgZ2V0IHN5bmNlcigpIHtcblx0XHRpZiAoJHR3LnN5bmNhZGFwdG9yID09PSB0aGlzKSByZXR1cm4gJHR3LnN5bmNlcjtcblx0fVxuXHQvKlxuXHRTYXZlIGEgdGlkZGxlciBhbmQgaW52b2tlIHRoZSBjYWxsYmFjayB3aXRoIChlcnIsYWRhcHRvckluZm8scmV2aXNpb24pXG5cdCovXG5cdGFzeW5jIHNhdmVUaWRkbGVyKFxuXHRcdHRpZGRsZXI6IFRpZGRsZXIsXG5cdFx0Y2FsbGJhY2s6IChcblx0XHRcdGVycjogYW55LFxuXHRcdFx0YWRhcHRvckluZm8/OiBNV1NBZGFwdG9ySW5mbyxcblx0XHRcdHJldmlzaW9uPzogc3RyaW5nXG5cdFx0KSA9PiB2b2lkLFxuXHRcdG9wdGlvbnM/OiB7fVxuXHQpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXMsIHRpdGxlID0gdGlkZGxlci5maWVsZHMudGl0bGUgYXMgc3RyaW5nO1xuXHRcdGlmICh0aGlzLmlzUmVhZE9ubHkgfHwgdGl0bGUuc3Vic3RyKDAsIE1XQ19TVEFURV9USURETEVSX1BSRUZJWC5sZW5ndGgpID09PSBNV0NfU1RBVEVfVElERExFUl9QUkVGSVgpIHtcblx0XHRcdHJldHVybiBjYWxsYmFjayhudWxsKTtcblx0XHR9XG5cdFx0c2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW3RpdGxlXSA9IHsgdHlwZTogXCJQVVRcIiB9O1xuXG5cdFx0Ly8gYXBwbGljYXRpb24veC1td3MtdGlkZGxlclxuXHRcdC8vIFRoZSAudGlkIGZpbGUgZm9ybWF0IGRvZXMgbm90IHN1cHBvcnQgZmllbGQgbmFtZXMgd2l0aCBjb2xvbnMuIFxuXHRcdC8vIFJhdGhlciB0aGFuIHRyeWluZyB0byBjYXRjaCBhbGwgdGhlIHVuc3VwcG9ydGVkIHZhcmlhdGlvbnMgdGhhdCBtYXkgYXBwZWFyLFxuXHRcdC8vIHdlJ2xsIGp1c3QgdXNlIEpTT04gdG8gc2VuZCBpdCBhY3Jvc3MgdGhlIHdpcmUsIHNpbmNlIHRoYXQgaXMgdGhlIG9mZmljaWFsIGZhbGxiYWNrIGZvcm1hdCBhbnl3YXkuXG5cdFx0Ly8gSG93ZXZlciwgcGFyc2luZyBhIGh1Z2Ugc3RyaW5nIHZhbHVlIGluc2lkZSBhIEpTT04gb2JqZWN0IGlzIHZlcnkgc2xvdyxcblx0XHQvLyBzbyB3ZSBzcGxpdCBvZmYgdGhlIHRleHQgZmllbGQgYW5kIHNlbmQgaXQgYWZ0ZXIgdGhlIG90aGVyIGZpZWxkcy4gXG5cblx0XHRjb25zdCBmaWVsZHMgPSB0aWRkbGVyLmdldEZpZWxkU3RyaW5ncyh7fSk7XG5cdFx0Y29uc3QgdGV4dCA9IGZpZWxkcy50ZXh0O1xuXHRcdGRlbGV0ZSBmaWVsZHMudGV4dDtcblx0XHRsZXQgYm9keSA9IEpTT04uc3RyaW5naWZ5KGZpZWxkcyk7XG5cblx0XHRpZiAodGlkZGxlci5oYXNGaWVsZChcInRleHRcIikpIHtcblx0XHRcdGlmICh0eXBlb2YgdGV4dCAhPT0gXCJzdHJpbmdcIiAmJiB0ZXh0KVxuXHRcdFx0XHRyZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKFwiRXJyb3Igc2F2aW5nIHRpZGRsZXIgXCIgKyBmaWVsZHMudGl0bGUgKyBcIjogdGhlIHRleHQgZmllbGQgaXMgdHJ1dGh5IGJ1dCBub3QgYSBzdHJpbmdcIikpO1xuXHRcdFx0Ym9keSArPSBgXFxuXFxuJHt0ZXh0fWBcblx0XHR9XG5cblx0XHR0eXBlIHQgPSBUaWRkbGVyUm91dGVyUmVzcG9uc2VbXCJoYW5kbGVTYXZlUmVjaXBlVGlkZGxlclwiXVxuXHRcdGNvbnN0IFtvaywgZXJyLCByZXN1bHRdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdGtleTogXCJoYW5kbGVTYXZlUmVjaXBlVGlkZGxlclwiLFxuXHRcdFx0dXJsOiBcIi90aWRkbGVycy9cIiArIGVuY29kZVVSSUNvbXBvbmVudCh0aXRsZSksXG5cdFx0XHRtZXRob2Q6IFwiUFVUXCIsXG5cdFx0XHRyZXF1ZXN0Qm9keVN0cmluZzogYm9keSxcblx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi94LW13cy10aWRkbGVyXCJcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGRlbGV0ZSBzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdO1xuXHRcdGlmICghb2spIHJldHVybiBjYWxsYmFjayhlcnIpO1xuXG5cdFx0Y29uc3QgZGF0YSA9IHJlc3VsdC5yZXNwb25zZUpTT047XG5cdFx0aWYgKCFkYXRhKSByZXR1cm4gY2FsbGJhY2sobnVsbCk7IC8vIGEgMnh4IHJlc3BvbnNlIHdpdGhvdXQgYSBib2R5IGlzIHVubGlrZWx5XG5cblx0XHQvL0lmIEJyb3dzZXItU3RvcmFnZSBwbHVnaW4gaXMgcHJlc2VudCwgcmVtb3ZlIHRpZGRsZXIgZnJvbSBsb2NhbCBzdG9yYWdlIGFmdGVyIHN1Y2Nlc3NmdWwgc3luYyB0byB0aGUgc2VydmVyXG5cdFx0aWYgKCR0dy5icm93c2VyU3RvcmFnZSAmJiAkdHcuYnJvd3NlclN0b3JhZ2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdCR0dy5icm93c2VyU3RvcmFnZS5yZW1vdmVUaWRkbGVyRnJvbUxvY2FsU3RvcmFnZSh0aXRsZSk7XG5cdFx0fVxuXG5cblx0XHQvLyBTYXZlIHRoZSBkZXRhaWxzIG9mIHRoZSBuZXcgcmV2aXNpb24gb2YgdGhlIHRpZGRsZXJcblx0XHRjb25zdCByZXZpc2lvbiA9IGRhdGEucmV2aXNpb25faWQsIGJhZ19uYW1lID0gZGF0YS5iYWdfbmFtZTtcblx0XHRjb25zb2xlLmxvZyhgU2F2ZWQgJHt0aXRsZX0gd2l0aCByZXZpc2lvbiAke3JldmlzaW9ufSBhbmQgYmFnICR7YmFnX25hbWV9YCk7XG5cdFx0Ly8gSWYgdGhlcmUgaGFzIGJlZW4gYSBtb3JlIHJlY2VudCB1cGRhdGUgZnJvbSB0aGUgc2VydmVyIHRoZW4gZW5xdWV1ZSBhIGxvYWQgb2YgdGhpcyB0aWRkbGVyXG5cdFx0c2VsZi5jaGVja0xhc3RSZWNvcmRlZFVwZGF0ZSh0aXRsZSwgcmV2aXNpb24pO1xuXHRcdC8vIEludm9rZSB0aGUgY2FsbGJhY2tcblx0XHRzZWxmLnNldFRpZGRsZXJJbmZvKHRpdGxlLCByZXZpc2lvbiwgYmFnX25hbWUpO1xuXHRcdGNhbGxiYWNrKG51bGwsIHsgYmFnOiBiYWdfbmFtZSB9LCByZXZpc2lvbik7XG5cblx0fVxuXHQvKlxuXHRMb2FkIGEgdGlkZGxlciBhbmQgaW52b2tlIHRoZSBjYWxsYmFjayB3aXRoIChlcnIsdGlkZGxlckZpZWxkcylcblxuXHRUaGUgc3luY2VyIGRvZXMgbm90IHBhc3MgaXRzZWxmIGludG8gb3B0aW9ucy5cblx0Ki9cblx0YXN5bmMgbG9hZFRpZGRsZXIodGl0bGU6IHN0cmluZywgY2FsbGJhY2s6IChlcnI6IGFueSwgZmllbGRzPzogYW55KSA9PiB2b2lkLCBvcHRpb25zOiBhbnkpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0c2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW3RpdGxlXSA9IHsgdHlwZTogXCJHRVRcIiB9O1xuXHRcdGNvbnN0IFtvaywgZXJyLCByZXN1bHRdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdGtleTogXCJoYW5kbGVHZXRSZWNpcGVUaWRkbGVyXCIsXG5cdFx0XHR1cmw6IFwiL3RpZGRsZXJzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRpdGxlKSxcblx0XHRcdG1ldGhvZDogXCJHRVRcIixcblx0XHR9KVxuXHRcdGRlbGV0ZSBzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdO1xuXHRcdGlmICghb2spIHJldHVybiBjYWxsYmFjayhlcnIpO1xuXG5cdFx0Y29uc3QgeyByZXNwb25zZUpTT046IGRhdGEsIGhlYWRlcnMgfSA9IHJlc3VsdDtcblx0XHRjb25zdCByZXZpc2lvbiA9IGhlYWRlcnMuZ2V0KFwieC1yZXZpc2lvbi1udW1iZXJcIikgPz8gXCJcIixcblx0XHRcdGJhZ19uYW1lID0gaGVhZGVycy5nZXQoXCJ4LWJhZy1uYW1lXCIpID8/IFwiXCI7XG5cblx0XHRpZiAoIXJldmlzaW9uIHx8ICFiYWdfbmFtZSB8fCAhZGF0YSkgcmV0dXJuIGNhbGxiYWNrKG51bGwsIG51bGwpO1xuXG5cdFx0Ly8gSWYgdGhlcmUgaGFzIGJlZW4gYSBtb3JlIHJlY2VudCB1cGRhdGUgZnJvbSB0aGUgc2VydmVyIHRoZW4gZW5xdWV1ZSBhIGxvYWQgb2YgdGhpcyB0aWRkbGVyXG5cdFx0c2VsZi5jaGVja0xhc3RSZWNvcmRlZFVwZGF0ZSh0aXRsZSwgcmV2aXNpb24pO1xuXHRcdC8vIEludm9rZSB0aGUgY2FsbGJhY2tcblx0XHRzZWxmLnNldFRpZGRsZXJJbmZvKHRpdGxlLCByZXZpc2lvbiwgYmFnX25hbWUpO1xuXHRcdGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuXHR9XG5cdC8qXG5cdERlbGV0ZSBhIHRpZGRsZXIgYW5kIGludm9rZSB0aGUgY2FsbGJhY2sgd2l0aCAoZXJyKVxuXHRvcHRpb25zIGluY2x1ZGU6XG5cdHRpZGRsZXJJbmZvOiB0aGUgc3luY2VyJ3MgdGlkZGxlckluZm8gZm9yIHRoaXMgdGlkZGxlclxuXHQqL1xuXHRhc3luYyBkZWxldGVUaWRkbGVyKHRpdGxlOiBzdHJpbmcsIGNhbGxiYWNrOiAoZXJyOiBhbnksIGFkYXB0b3JJbmZvPzogYW55KSA9PiB2b2lkLCBvcHRpb25zOiBhbnkpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0aWYgKHRoaXMuaXNSZWFkT25seSkgeyByZXR1cm4gY2FsbGJhY2sobnVsbCk7IH1cblx0XHQvLyBJZiB3ZSBkb24ndCBoYXZlIGEgYmFnIGl0IG1lYW5zIHRoYXQgdGhlIHRpZGRsZXIgaGFzbid0IGJlZW4gc2VlbiBieSB0aGUgc2VydmVyLCBzbyB3ZSBkb24ndCBuZWVkIHRvIGRlbGV0ZSBpdFxuXHRcdC8vIHZhciBiYWcgPSB0aGlzLmdldFRpZGRsZXJCYWcodGl0bGUpO1xuXHRcdC8vIGlmKCFiYWcpIHsgcmV0dXJuIGNhbGxiYWNrKG51bGwsIG9wdGlvbnMudGlkZGxlckluZm8uYWRhcHRvckluZm8pOyB9XG5cdFx0c2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW3RpdGxlXSA9IHsgdHlwZTogXCJERUxFVEVcIiB9O1xuXHRcdC8vIElzc3VlIEhUVFAgcmVxdWVzdCB0byBkZWxldGUgdGhlIHRpZGRsZXJcblx0XHRjb25zdCBbb2ssIGVyciwgcmVzdWx0XSA9IGF3YWl0IHRoaXMucmVjaXBlUmVxdWVzdCh7XG5cdFx0XHRrZXk6IFwiaGFuZGxlRGVsZXRlUmVjaXBlVGlkZGxlclwiLFxuXHRcdFx0dXJsOiBcIi90aWRkbGVycy9cIiArIGVuY29kZVVSSUNvbXBvbmVudCh0aXRsZSksXG5cdFx0XHRtZXRob2Q6IFwiREVMRVRFXCIsXG5cdFx0fSk7XG5cdFx0ZGVsZXRlIHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV07XG5cdFx0aWYgKCFvaykgcmV0dXJuIGNhbGxiYWNrKGVycik7XG5cdFx0Y29uc3QgeyByZXNwb25zZUpTT046IGRhdGEgfSA9IHJlc3VsdDtcblx0XHRpZiAoIWRhdGEpIHJldHVybiBjYWxsYmFjayhudWxsKTtcblxuXHRcdGNvbnN0IHJldmlzaW9uID0gZGF0YS5yZXZpc2lvbl9pZCwgYmFnX25hbWUgPSBkYXRhLmJhZ19uYW1lO1xuXHRcdC8vIElmIHRoZXJlIGhhcyBiZWVuIGEgbW9yZSByZWNlbnQgdXBkYXRlIGZyb20gdGhlIHNlcnZlciB0aGVuIGVucXVldWUgYSBsb2FkIG9mIHRoaXMgdGlkZGxlclxuXHRcdHNlbGYuY2hlY2tMYXN0UmVjb3JkZWRVcGRhdGUodGl0bGUsIHJldmlzaW9uKTtcblx0XHRzZWxmLnJlbW92ZVRpZGRsZXJJbmZvKHRpdGxlKTtcblx0XHQvLyBJbnZva2UgdGhlIGNhbGxiYWNrICYgcmV0dXJuIG51bGwgYWRhcHRvckluZm9cblx0XHRjYWxsYmFjayhudWxsLCBudWxsKTtcblx0fVxufVxuXG5cbmlmICgkdHcuYnJvd3NlciAmJiBkb2N1bWVudC5sb2NhdGlvbi5wcm90b2NvbC5zdGFydHNXaXRoKFwiaHR0cFwiKSkge1xuXHRleHBvcnRzLmFkYXB0b3JDbGFzcyA9IE11bHRpV2lraUNsaWVudEFkYXB0b3I7XG59XG5cbnR5cGUgUGFyYW1zSW5wdXQgPSBVUkxTZWFyY2hQYXJhbXMgfCBbc3RyaW5nLCBzdHJpbmddW10gfCBvYmplY3QgfCBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbmludGVyZmFjZSBIdHRwUmVxdWVzdE9wdGlvbnM8VFlQRSBleHRlbmRzIFwiYXJyYXlidWZmZXJcIiB8IFwiYmxvYlwiIHwgXCJ0ZXh0XCI+IHtcblx0LyoqIFRoZSByZXF1ZXN0IE1FVEhPRC4gTWF5YmUgYmUgYW55dGhpbmcgZXhjZXB0IENPTk5FQ1QsIFRSQUNFLCBvciBUUkFDSy4gICovXG5cdG1ldGhvZDogc3RyaW5nO1xuXHQvKiogVGhlIHVybCBtYXkgYWxzbyBjb250YWluIHF1ZXJ5IHBhcmFtcy4gKi9cblx0dXJsOiBzdHJpbmc7XG5cdC8qKiBUaGUgcmVzcG9uc2UgdHlwZXMgKi9cblx0cmVzcG9uc2VUeXBlOiBUWVBFO1xuXHRoZWFkZXJzPzogUGFyYW1zSW5wdXQ7XG5cdC8qKiBUaGlzIGlzIHBhcnNlZCBzZXBhcmF0ZWx5IGZyb20gdGhlIHVybCBhbmQgYXBwZW5kZWQgdG8gaXQuICovXG5cdHF1ZXJ5UGFyYW1zPzogUGFyYW1zSW5wdXQ7XG5cdC8qKiBcblx0ICogVGhlIHN0cmluZyB0byBzZW5kIGFzIHRoZSByZXF1ZXN0IGJvZHkuIE5vdCB2YWxpZCBmb3IgR0VUIGFuZCBIRUFELlxuXHQgKiBcblx0ICogRm9yIGBhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWRgLCB1c2UgYG5ldyBVUkxTZWFyY2hQYXJhbXMoKS50b1N0cmluZygpYC5cblx0ICogXG5cdCAqIEZvciBgYXBwbGljYXRpb24vanNvbmAsIHVzZSBgSlNPTi5zdHJpbmdpZnkoKWBcblx0ICovXG5cdHJlcXVlc3RCb2R5U3RyaW5nPzogc3RyaW5nO1xuXHRwcm9ncmVzcz86IChldmVudDogUHJvZ3Jlc3NFdmVudDxFdmVudFRhcmdldD4pID0+IHZvaWQ7XG59XG5cblxuZnVuY3Rpb24gaHR0cFJlcXVlc3Q8VFlQRSBleHRlbmRzIFwiYXJyYXlidWZmZXJcIiB8IFwiYmxvYlwiIHwgXCJ0ZXh0XCI+KG9wdGlvbnM6IEh0dHBSZXF1ZXN0T3B0aW9uczxUWVBFPikge1xuXG5cdG9wdGlvbnMubWV0aG9kID0gb3B0aW9ucy5tZXRob2QudG9VcHBlckNhc2UoKTtcblxuXHRpZiAoKG9wdGlvbnMubWV0aG9kID09PSBcIkdFVFwiIHx8IG9wdGlvbnMubWV0aG9kID09PSBcIkhFQURcIikgJiYgb3B0aW9ucy5yZXF1ZXN0Qm9keVN0cmluZylcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJyZXF1ZXN0Qm9keVN0cmluZyBtdXN0IGJlIGZhbHN5IGlmIG1ldGhvZCBpcyBHRVQgb3IgSEVBRFwiKTtcblxuXHRmdW5jdGlvbiBwYXJhbXNJbnB1dChpbnB1dDogUGFyYW1zSW5wdXQpIHtcblx0XHRpZiAoIWlucHV0KSByZXR1cm4gbmV3IFVSTFNlYXJjaFBhcmFtcygpO1xuXHRcdGlmIChpbnB1dCBpbnN0YW5jZW9mIFVSTFNlYXJjaFBhcmFtcykgcmV0dXJuIGlucHV0O1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGlucHV0KSB8fCB0eXBlb2YgaW5wdXQgPT09IFwic3RyaW5nXCIpIHJldHVybiBuZXcgVVJMU2VhcmNoUGFyYW1zKGlucHV0KTtcblx0XHRyZXR1cm4gbmV3IFVSTFNlYXJjaFBhcmFtcyhPYmplY3QuZW50cmllcyhpbnB1dCkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gbm9ybWFsaXplSGVhZGVycyhoZWFkZXJzOiBVUkxTZWFyY2hQYXJhbXMpIHtcblx0XHRbLi4uaGVhZGVycy5rZXlzKCldLmZvckVhY2goKFtrLCB2XSkgPT4ge1xuXHRcdFx0Y29uc3QgazIgPSBrLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRpZiAoazIgIT09IGspIHtcblx0XHRcdFx0aGVhZGVycy5nZXRBbGwoaykuZm9yRWFjaChlID0+IHtcblx0XHRcdFx0XHRoZWFkZXJzLmFwcGVuZChrMiwgZSk7XG5cdFx0XHRcdH0pXG5cdFx0XHRcdGhlYWRlcnMuZGVsZXRlKGspO1xuXHRcdFx0XHRjb25zb2xlLmxvZyhrLCBrMik7XG5cdFx0XHR9XG5cdFx0fSlcblx0fVxuXG5cdHJldHVybiBuZXcgUHJvbWlzZTx7XG5cdFx0LyoqIFNob3J0aGFuZCB0byBjaGVjayBpZiB0aGUgcmVzcG9uc2UgaXMgaW4gdGhlIDJ4eCByYW5nZS4gKi9cblx0XHRvazogYm9vbGVhbjtcblx0XHRzdGF0dXM6IG51bWJlcjtcblx0XHRzdGF0dXNUZXh0OiBzdHJpbmc7XG5cdFx0aGVhZGVyczogVVJMU2VhcmNoUGFyYW1zO1xuXHRcdHJlc3BvbnNlOlxuXHRcdFRZUEUgZXh0ZW5kcyBcImFycmF5YnVmZmVyXCIgPyBBcnJheUJ1ZmZlciA6XG5cdFx0VFlQRSBleHRlbmRzIFwiYmxvYlwiID8gQmxvYiA6XG5cdFx0VFlQRSBleHRlbmRzIFwidGV4dFwiID8gc3RyaW5nIDpcblx0XHRuZXZlcjtcblx0fT4oKHJlc29sdmUpID0+IHtcblx0XHQvLyBpZiB0aGlzIHRocm93cyBzeW5jJ2x5LCB0aGUgcHJvbWlzZSB3aWxsIHJlamVjdC5cblxuXHRcdGNvbnN0IHVybCA9IG5ldyBVUkwob3B0aW9ucy51cmwsIGxvY2F0aW9uLmhyZWYpO1xuXHRcdGNvbnN0IHF1ZXJ5ID0gcGFyYW1zSW5wdXQob3B0aW9ucy5xdWVyeVBhcmFtcyk7XG5cdFx0cXVlcnkuZm9yRWFjaCgodiwgaykgPT4geyB1cmwuc2VhcmNoUGFyYW1zLmFwcGVuZChrLCB2KTsgfSk7XG5cblx0XHRjb25zb2xlLmxvZyh1cmwsIHF1ZXJ5LCBvcHRpb25zLnF1ZXJ5UGFyYW1zLCB1cmwuaHJlZik7XG5cblx0XHRjb25zdCBoZWFkZXJzID0gcGFyYW1zSW5wdXQob3B0aW9ucy5oZWFkZXJzKTtcblx0XHRub3JtYWxpemVIZWFkZXJzKGhlYWRlcnMpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXHRcdHJlcXVlc3QucmVzcG9uc2VUeXBlID0gb3B0aW9ucy5yZXNwb25zZVR5cGUgfHwgXCJ0ZXh0XCI7XG5cblx0XHRyZXF1ZXN0Lm9wZW4ob3B0aW9ucy5tZXRob2QsIHVybCwgdHJ1ZSk7XG5cblxuXHRcdGlmICghaGVhZGVycy5oYXMoXCJjb250ZW50LXR5cGVcIikpXG5cdFx0XHRoZWFkZXJzLnNldChcImNvbnRlbnQtdHlwZVwiLCBcImFwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZDsgY2hhcnNldD1VVEYtOFwiKTtcblxuXHRcdGlmICghaGVhZGVycy5oYXMoXCJ4LXJlcXVlc3RlZC13aXRoXCIpKVxuXHRcdFx0aGVhZGVycy5zZXQoXCJ4LXJlcXVlc3RlZC13aXRoXCIsIFwiVGlkZGx5V2lraVwiKTtcblxuXHRcdGhlYWRlcnMuc2V0KFwiYWNjZXB0XCIsIFwiYXBwbGljYXRpb24vanNvblwiKTtcblxuXG5cdFx0aGVhZGVycy5mb3JFYWNoKCh2LCBrKSA9PiB7XG5cdFx0XHRyZXF1ZXN0LnNldFJlcXVlc3RIZWFkZXIoaywgdik7XG5cdFx0fSk7XG5cblxuXHRcdHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKHRoaXMucmVhZHlTdGF0ZSAhPT0gNCkgcmV0dXJuO1xuXG5cdFx0XHRjb25zdCBoZWFkZXJzID0gbmV3IFVSTFNlYXJjaFBhcmFtcygpO1xuXHRcdFx0cmVxdWVzdC5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKT8udHJpbSgpLnNwbGl0KC9bXFxyXFxuXSsvKS5mb3JFYWNoKChsaW5lKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHBhcnRzID0gbGluZS5zcGxpdChcIjogXCIpO1xuXHRcdFx0XHRjb25zdCBoZWFkZXIgPSBwYXJ0cy5zaGlmdCgpPy50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IHBhcnRzLmpvaW4oXCI6IFwiKTtcblx0XHRcdFx0aWYgKGhlYWRlcikgaGVhZGVycy5hcHBlbmQoaGVhZGVyLCB2YWx1ZSk7XG5cdFx0XHR9KTtcblx0XHRcdHJlc29sdmUoe1xuXHRcdFx0XHRvazogdGhpcy5zdGF0dXMgPj0gMjAwICYmIHRoaXMuc3RhdHVzIDwgMzAwLFxuXHRcdFx0XHRzdGF0dXM6IHRoaXMuc3RhdHVzLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiB0aGlzLnN0YXR1c1RleHQsXG5cdFx0XHRcdHJlc3BvbnNlOiB0aGlzLnJlc3BvbnNlLFxuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0fSk7XG5cblx0XHR9O1xuXG5cdFx0aWYgKG9wdGlvbnMucHJvZ3Jlc3MpXG5cdFx0XHRyZXF1ZXN0Lm9ucHJvZ3Jlc3MgPSBvcHRpb25zLnByb2dyZXNzO1xuXG5cdFx0cmVxdWVzdC5zZW5kKG9wdGlvbnMucmVxdWVzdEJvZHlTdHJpbmcpO1xuXG5cblx0fSk7XG5cbn1cblxuXG4iXX0=