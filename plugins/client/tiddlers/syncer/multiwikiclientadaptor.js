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
                    last_known_revision_id: this.last_known_revision_id,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGl3aWtpY2xpZW50YWRhcHRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9tdWx0aXdpa2ljbGllbnRhZGFwdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHO0FBRUgsa0VBQWtFO0FBQ2xFLFlBQVksQ0FBQzs7Ozs7Ozs7Ozs7QUF1SWIsSUFBSSxtQkFBbUIsR0FBRyxnQ0FBZ0MsRUFDekQsb0JBQW9CLEdBQUcscUJBQXFCLEVBQzVDLHdCQUF3QixHQUFHLDJCQUEyQixFQUN0RCxpQkFBaUIsR0FBRyx1Q0FBdUMsRUFDM0Qsc0JBQXNCLEdBQUcsNENBQTRDLEVBQ3JFLHdCQUF3QixHQUFHLHFDQUFxQyxFQUNoRSwrQkFBK0IsR0FBRyxtREFBbUQsRUFDckYsa0JBQWtCLEdBQUcsa0RBQWtELENBQUM7QUFFekUsSUFBSSxvQkFBb0IsR0FBRyxlQUFlLEVBQ3pDLHFCQUFxQixHQUFHLGdCQUFnQixFQUN4QyxvQkFBb0IsR0FBRyxlQUFlLEVBQ3RDLGNBQWMsR0FBRyxnQkFBZ0IsQ0FBQztBQU9uQyxNQUFNLHNCQUFzQjtJQWlCM0IsWUFBWSxPQUFzQjtRQUZsQyxTQUFJLEdBQUcsaUJBQWlCLENBQUM7UUFDakIsd0JBQW1CLEdBQUcsSUFBSSxDQUFDO1FBRWxDLElBQUksQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQztRQUN6QixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUMzQixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7UUFDM0UsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLEtBQUssS0FBSyxDQUFDO1FBQ2xGLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUMsSUFB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S0FBSyxDQUFDLEtBQUssRUFBRSwwQ0FBRSxXQUFXLEVBQUUsQ0FBQztnQkFDNUMsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztnQkFDL0IsSUFBSSxNQUFNO29CQUFFLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO1lBQzNDLENBQUMsQ0FBQyxDQUFDO1lBQ0gsT0FBTyxDQUFDO2dCQUNQLEVBQUUsRUFBRSxJQUFJLENBQUMsTUFBTSxJQUFJLEdBQUcsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLEdBQUc7Z0JBQzNDLE1BQU0sRUFBRSxJQUFJLENBQUMsTUFBTTtnQkFDbkIsVUFBVSxFQUFFLElBQUksQ0FBQyxVQUFVO2dCQUMzQixRQUFRLEVBQUUsSUFBSSxDQUFDLFFBQVE7Z0JBQ3ZCLE9BQU87YUFDUCxDQUFDLENBQUM7UUFFSixDQUFDLENBQUM7UUFFRixJQUFJLE9BQU8sQ0FBQyxRQUFRO1lBQ25CLE9BQU8sQ0FBQyxVQUFVLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQztRQUV2QyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBR3pDLENBQUMsQ0FBQyxDQUFDO0FBRUosQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qXFxcbnRpdGxlOiAkOi9wbHVnaW5zL3RpZGRseXdpa2kvdGlkZGx5d2ViL3RpZGRseXdlYmFkYXB0b3IuanNcbnR5cGU6IGFwcGxpY2F0aW9uL2phdmFzY3JpcHRcbm1vZHVsZS10eXBlOiBzeW5jYWRhcHRvclxuXG5BIHN5bmMgYWRhcHRvciBtb2R1bGUgZm9yIHN5bmNocm9uaXNpbmcgd2l0aCBNdWx0aVdpa2lTZXJ2ZXItY29tcGF0aWJsZSBzZXJ2ZXJzLiBcblxuSXQgaGFzIHRocmVlIGtleSBhcmVhcyBvZiBjb25jZXJuOlxuXG4qIEJhc2ljIG9wZXJhdGlvbnMgbGlrZSBwdXQsIGdldCwgYW5kIGRlbGV0ZSBhIHRpZGRsZXIgb24gdGhlIHNlcnZlclxuKiBSZWFsIHRpbWUgdXBkYXRlcyBmcm9tIHRoZSBzZXJ2ZXIgKGhhbmRsZWQgYnkgU1NFKVxuKiBCYWdzIGFuZCByZWNpcGVzLCB3aGljaCBhcmUgdW5rbm93biB0byB0aGUgc3luY2VyXG5cbkEga2V5IGFzcGVjdCBvZiB0aGUgZGVzaWduIGlzIHRoYXQgdGhlIHN5bmNlciBuZXZlciBvdmVybGFwcyBiYXNpYyBzZXJ2ZXIgb3BlcmF0aW9uczsgaXQgd2FpdHMgZm9yIHRoZVxucHJldmlvdXMgb3BlcmF0aW9uIHRvIGNvbXBsZXRlIGJlZm9yZSBzZW5kaW5nIGEgbmV3IG9uZS5cblxuXFwqL1xuXG4vLyB0aGUgYmxhbmsgbGluZSBpcyBpbXBvcnRhbnQsIGFuZCBzbyBpcyB0aGUgZm9sbG93aW5nIHVzZSBzdHJpY3RcblwidXNlIHN0cmljdFwiO1xuXG5pbXBvcnQgdHlwZSB7IFN5bmNlciwgVGlkZGxlciwgSVRpZGRseVdpa2kgfSBmcm9tIFwidGlkZGx5d2lraVwiO1xuaW1wb3J0IHR5cGUgeyBUaWRkbGVyUm91dGVyIH0gZnJvbSBcIkB0aWRkbHl3aWtpL213cy9zcmMvcm91dGVzL21hbmFnZXJzL3JvdXRlci10aWRkbGVyc1wiO1xuaW1wb3J0IHR5cGUgeyBab2RSb3V0ZSB9IGZyb20gXCJAdGlkZGx5d2lraS9td3Mvc3JjL3JvdXRlclwiO1xuXG5cbmRlY2xhcmUgY2xhc3MgTG9nZ2VyIHtcblx0Y29uc3RydWN0b3IoY29tcG9uZW50TmFtZTogYW55LCBvcHRpb25zOiBhbnkpO1xuXHRjb21wb25lbnROYW1lOiBhbnk7XG5cdGNvbG91cjogYW55O1xuXHRlbmFibGU6IGFueTtcblx0c2F2ZTogYW55O1xuXHRzYXZlTGltaXQ6IGFueTtcblx0c2F2ZUJ1ZmZlckxvZ2dlcjogdGhpcztcblx0YnVmZmVyOiBzdHJpbmc7XG5cdGFsZXJ0Q291bnQ6IG51bWJlcjtcblx0c2V0U2F2ZUJ1ZmZlcihsb2dnZXI6IGFueSk6IHZvaWQ7XG5cdGxvZyguLi5hcmdzOiBhbnlbXSk6IGFueTtcblx0Z2V0QnVmZmVyKCk6IHN0cmluZztcblx0dGFibGUodmFsdWU6IGFueSk6IHZvaWQ7XG5cdGFsZXJ0KC4uLmFyZ3M6IGFueVtdKTogdm9pZDtcblx0Y2xlYXJBbGVydHMoKTogdm9pZDtcbn1cblxudHlwZSBUaWRkbGVyUm91dGVyUmVzcG9uc2UgPSB7XG5cdFtLIGluIGtleW9mIFRpZGRsZXJSb3V0ZXJdOiBUaWRkbGVyUm91dGVyW0tdIGV4dGVuZHMgWm9kUm91dGU8aW5mZXIgTSwgaW5mZXIgQiwgaW5mZXIgUCwgaW5mZXIgVCwgaW5mZXIgUj5cblx0PyB7IE06IE0sIEI6IEIsIFA6IFAsIFQ6IFQsIFI6IFIgfVxuXHQ6IG5ldmVyXG59XG5cbmRlY2xhcmUgbW9kdWxlICd0aWRkbHl3aWtpJyB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgU3luY2VyIHtcblx0XHR3aWtpOiBXaWtpO1xuXHRcdGxvZ2dlcjogTG9nZ2VyO1xuXHRcdHRpZGRsZXJJbmZvOiBSZWNvcmQ8c3RyaW5nLCB7IGJhZzogc3RyaW5nOyByZXZpc2lvbjogc3RyaW5nIH0+O1xuXHRcdGVucXVldWVMb2FkVGlkZGxlcih0aXRsZTogc3RyaW5nKTogdm9pZDtcblx0XHRzdG9yZVRpZGRsZXIodGlkZGxlcjogVGlkZGxlcik6IHZvaWQ7XG5cdFx0cHJvY2Vzc1Rhc2tRdWV1ZSgpOiB2b2lkO1xuXHR9XG5cdGludGVyZmFjZSBJVGlkZGx5V2lraSB7XG5cdFx0YnJvd3NlclN0b3JhZ2U6IGFueTtcblx0fVxufVxuXG50eXBlIFNlcnZlclN0YXR1c0NhbGxiYWNrID0gKFxuXHRlcnI6IGFueSxcblx0LyoqIFxuXHQgKiAkOi9zdGF0dXMvSXNMb2dnZWRJbiBtb3N0bHkgYXBwZWFycyBhbG9uZ3NpZGUgdGhlIHVzZXJuYW1lIFxuXHQgKiBvciBvdGhlciBsb2dpbi1jb25kaXRpb25hbCBiZWhhdmlvci4gXG5cdCAqL1xuXHRpc0xvZ2dlZEluPzogYm9vbGVhbixcblx0LyoqXG5cdCAqICQ6L3N0YXR1cy9Vc2VyTmFtZSBpcyBzdGlsbCB1c2VkIGZvciB0aGluZ3MgbGlrZSBkcmFmdHMgZXZlbiBpZiB0aGUgXG5cdCAqIHVzZXIgaXNuJ3QgbG9nZ2VkIGluLCBhbHRob3VnaCB0aGUgdXNlcm5hbWUgaXMgbGVzcyBsaWtlbHkgdG8gYmUgc2hvd24gXG5cdCAqIHRvIHRoZSB1c2VyLiBcblx0ICovXG5cdHVzZXJuYW1lPzogc3RyaW5nLFxuXHQvKiogXG5cdCAqICQ6L3N0YXR1cy9Jc1JlYWRPbmx5IHB1dHMgdGhlIFVJIGluIHJlYWRvbmx5IG1vZGUsIFxuXHQgKiBidXQgZG9lcyBub3QgcHJldmVudCBhdXRvbWF0aWMgY2hhbmdlcyBmcm9tIGF0dGVtcHRpbmcgdG8gc2F2ZS4gXG5cdCAqL1xuXHRpc1JlYWRPbmx5PzogYm9vbGVhbixcblx0LyoqIFxuXHQgKiAkOi9zdGF0dXMvSXNBbm9ueW1vdXMgZG9lcyBub3QgYXBwZWFyIGFueXdoZXJlIGluIHRoZSBUVzUgcmVwbyEgXG5cdCAqIFNvIGl0IGhhcyBubyBhcHBhcmVudCBwdXJwb3NlLiBcblx0ICovXG5cdGlzQW5vbnltb3VzPzogYm9vbGVhblxuKSA9PiB2b2lkXG5cbmludGVyZmFjZSBTeW5jQWRhcHRvcjxBRD4ge1xuXHRuYW1lPzogc3RyaW5nO1xuXG5cdGlzUmVhZHk/KCk6IGJvb2xlYW47XG5cblx0Z2V0U3RhdHVzPyhcblx0XHRjYjogU2VydmVyU3RhdHVzQ2FsbGJhY2tcblx0KTogdm9pZDtcblxuXHRnZXRTa2lubnlUaWRkbGVycz8oXG5cdFx0Y2I6IChlcnI6IGFueSwgdGlkZGxlckZpZWxkczogUmVjb3JkPHN0cmluZywgc3RyaW5nPltdKSA9PiB2b2lkXG5cdCk6IHZvaWQ7XG5cdGdldFVwZGF0ZWRUaWRkbGVycz8oXG5cdFx0c3luY2VyOiBTeW5jZXIsXG5cdFx0Y2I6IChcblx0XHRcdGVycjogYW55LFxuXHRcdFx0LyoqIEFycmF5cyBvZiB0aXRsZXMgdGhhdCBoYXZlIGJlZW4gbW9kaWZpZWQgb3IgZGVsZXRlZCAqL1xuXHRcdFx0dXBkYXRlcz86IHsgbW9kaWZpY2F0aW9uczogc3RyaW5nW10sIGRlbGV0aW9uczogc3RyaW5nW10gfVxuXHRcdCkgPT4gdm9pZFxuXHQpOiB2b2lkO1xuXG5cdC8qKiBcblx0ICogdXNlZCB0byBvdmVycmlkZSB0aGUgZGVmYXVsdCBTeW5jZXIgZ2V0VGlkZGxlclJldmlzaW9uIGJlaGF2aW9yXG5cdCAqIG9mIHJldHVybmluZyB0aGUgcmV2aXNpb24gZmllbGRcblx0ICogXG5cdCAqL1xuXHRnZXRUaWRkbGVyUmV2aXNpb24/KHRpdGxlOiBzdHJpbmcpOiBzdHJpbmc7XG5cdC8qKiBcblx0ICogdXNlZCB0byBnZXQgdGhlIGFkYXB0ZXIgaW5mbyBmcm9tIGEgdGlkZGxlciBpbiBzaXR1YXRpb25zXG5cdCAqIG90aGVyIHRoYW4gdGhlIHNhdmVUaWRkbGVyIGNhbGxiYWNrXG5cdCAqL1xuXHRnZXRUaWRkbGVySW5mbyh0aWRkbGVyOiBUaWRkbGVyKTogQUQgfCB1bmRlZmluZWQ7XG5cblx0c2F2ZVRpZGRsZXIoXG5cdFx0dGlkZGxlcjogYW55LFxuXHRcdGNiOiAoXG5cdFx0XHRlcnI6IGFueSxcblx0XHRcdGFkYXB0b3JJbmZvPzogQUQsXG5cdFx0XHRyZXZpc2lvbj86IHN0cmluZ1xuXHRcdCkgPT4gdm9pZCxcblx0XHRleHRyYTogeyB0aWRkbGVySW5mbzogU3luY2VyVGlkZGxlckluZm88QUQ+IH1cblx0KTogdm9pZDtcblxuXHRzZXRMb2dnZXJTYXZlQnVmZmVyPzogKGxvZ2dlckZvclNhdmluZzogTG9nZ2VyKSA9PiB2b2lkO1xuXHRkaXNwbGF5TG9naW5Qcm9tcHQ/KHN5bmNlcjogU3luY2VyKTogdm9pZDtcblx0bG9naW4/KHVzZXJuYW1lOiBzdHJpbmcsIHBhc3N3b3JkOiBzdHJpbmcsIGNiOiAoZXJyOiBhbnkpID0+IHZvaWQpOiB2b2lkO1xuXHRsb2dvdXQ/KGNiOiAoZXJyOiBhbnkpID0+IHZvaWQpOiBhbnk7XG59XG5pbnRlcmZhY2UgU3luY2VyVGlkZGxlckluZm88QUQ+IHtcblx0LyoqIHRoaXMgY29tZXMgZnJvbSB0aGUgd2lraSBjaGFuZ2VDb3VudCByZWNvcmQgKi9cblx0Y2hhbmdlQ291bnQ6IG51bWJlcjtcblx0LyoqIEFkYXB0ZXIgaW5mbyByZXR1cm5lZCBieSB0aGUgc3luYyBhZGFwdGVyICovXG5cdGFkYXB0b3JJbmZvOiBBRDtcblx0LyoqIFJldmlzaW9uIHJldHVybiBieSB0aGUgc3luYyBhZGFwdGVyICovXG5cdHJldmlzaW9uOiBzdHJpbmc7XG5cdC8qKiBUaW1lc3RhbXAgc2V0IGluIHRoZSBjYWxsYmFjayBvZiB0aGUgcHJldmlvdXMgc2F2ZSAqL1xuXHR0aW1lc3RhbXBMYXN0U2F2ZWQ6IERhdGU7XG59XG5cbmRlY2xhcmUgY29uc3QgJHR3OiBhbnk7XG5cbmRlY2xhcmUgY29uc3QgZXhwb3J0czoge1xuXHRhZGFwdG9yQ2xhc3M6IHR5cGVvZiBNdWx0aVdpa2lDbGllbnRBZGFwdG9yO1xufTtcblxudmFyIENPTkZJR19IT1NUX1RJRERMRVIgPSBcIiQ6L2NvbmZpZy9tdWx0aXdpa2ljbGllbnQvaG9zdFwiLFxuXHRERUZBVUxUX0hPU1RfVElERExFUiA9IFwiJHByb3RvY29sJC8vJGhvc3QkL1wiLFxuXHRNV0NfU1RBVEVfVElERExFUl9QUkVGSVggPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC9cIixcblx0QkFHX1NUQVRFX1RJRERMRVIgPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC90aWRkbGVycy9iYWdcIixcblx0UkVWSVNJT05fU1RBVEVfVElERExFUiA9IFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L3RpZGRsZXJzL3JldmlzaW9uXCIsXG5cdENPTk5FQ1RJT05fU1RBVEVfVElERExFUiA9IFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L2Nvbm5lY3Rpb25cIixcblx0SU5DT01JTkdfVVBEQVRFU19GSUxURVJfVElERExFUiA9IFwiJDovY29uZmlnL211bHRpd2lraWNsaWVudC9pbmNvbWluZy11cGRhdGVzLWZpbHRlclwiLFxuXHRFTkFCTEVfU1NFX1RJRERMRVIgPSBcIiQ6L2NvbmZpZy9tdWx0aXdpa2ljbGllbnQvdXNlLXNlcnZlci1zZW50LWV2ZW50c1wiO1xuXG52YXIgU0VSVkVSX05PVF9DT05ORUNURUQgPSBcIk5PVCBDT05ORUNURURcIixcblx0U0VSVkVSX0NPTk5FQ1RJTkdfU1NFID0gXCJDT05ORUNUSU5HIFNTRVwiLFxuXHRTRVJWRVJfQ09OTkVDVEVEX1NTRSA9IFwiQ09OTkVDVEVEIFNTRVwiLFxuXHRTRVJWRVJfUE9MTElORyA9IFwiU0VSVkVSIFBPTExJTkdcIjtcblxuaW50ZXJmYWNlIE1XU0FkYXB0b3JJbmZvIHtcblx0YmFnOiBzdHJpbmdcbn1cblxuXG5jbGFzcyBNdWx0aVdpa2lDbGllbnRBZGFwdG9yIGltcGxlbWVudHMgU3luY0FkYXB0b3I8TVdTQWRhcHRvckluZm8+IHtcblx0cHJpdmF0ZSB3aWtpO1xuXHRwcml2YXRlIGhvc3Q7XG5cdHByaXZhdGUgcmVjaXBlO1xuXHRwcml2YXRlIHVzZVNlcnZlclNlbnRFdmVudHM7XG5cdHByaXZhdGUgbGFzdF9rbm93bl9yZXZpc2lvbl9pZDtcblx0cHJpdmF0ZSBvdXRzdGFuZGluZ1JlcXVlc3RzO1xuXHRwcml2YXRlIGxhc3RSZWNvcmRlZFVwZGF0ZTtcblx0cHJpdmF0ZSBsb2dnZXI7XG5cdHByaXZhdGUgaXNMb2dnZWRJbjtcblx0cHJpdmF0ZSBpc1JlYWRPbmx5O1xuXHRwcml2YXRlIHVzZXJuYW1lO1xuXHRwcml2YXRlIGluY29taW5nVXBkYXRlc0ZpbHRlckZuO1xuXHRwcml2YXRlIHNlcnZlclVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMhOiBzdHJpbmc7XG5cblx0bmFtZSA9IFwibXVsdGl3aWtpY2xpZW50XCI7XG5cdHByaXZhdGUgc3VwcG9ydHNMYXp5TG9hZGluZyA9IHRydWU7XG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IHsgd2lraTogYW55IH0pIHtcblx0XHR0aGlzLndpa2kgPSBvcHRpb25zLndpa2k7XG5cdFx0dGhpcy5ob3N0ID0gdGhpcy5nZXRIb3N0KCk7XG5cdFx0dGhpcy5yZWNpcGUgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L3JlY2lwZVwiKTtcblx0XHR0aGlzLnVzZVNlcnZlclNlbnRFdmVudHMgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoRU5BQkxFX1NTRV9USURETEVSKSA9PT0gXCJ5ZXNcIjtcblx0XHR0aGlzLmxhc3Rfa25vd25fcmV2aXNpb25faWQgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvcmVjaXBlL2xhc3RfcmV2aXNpb25faWRcIiwgXCIwXCIpXG5cdFx0dGhpcy5vdXRzdGFuZGluZ1JlcXVlc3RzID0gT2JqZWN0LmNyZWF0ZShudWxsKTsgLy8gSGFzaG1hcCBieSB0aXRsZSBvZiBvdXRzdGFuZGluZyByZXF1ZXN0IG9iamVjdDoge3R5cGU6IFwiUFVUXCJ8XCJHRVRcInxcIkRFTEVURVwifVxuXHRcdHRoaXMubGFzdFJlY29yZGVkVXBkYXRlID0gT2JqZWN0LmNyZWF0ZShudWxsKTsgLy8gSGFzaG1hcCBieSB0aXRsZSBvZiBsYXN0IHJlY29yZGVkIHVwZGF0ZSB2aWEgU1NFOiB7dHlwZTogXCJ1cGRhdGVcInxcImRldGV0aW9uXCIsIHJldmlzaW9uX2lkOn1cblx0XHR0aGlzLmxvZ2dlciA9IG5ldyAkdHcudXRpbHMuTG9nZ2VyKFwiTXVsdGlXaWtpQ2xpZW50QWRhcHRvclwiKTtcblx0XHR0aGlzLmlzTG9nZ2VkSW4gPSBmYWxzZTtcblx0XHR0aGlzLmlzUmVhZE9ubHkgPSBmYWxzZTtcblx0XHR0aGlzLnVzZXJuYW1lID0gXCJcIjtcblx0XHQvLyBDb21waWxlIHRoZSBkaXJ0eSB0aWRkbGVyIGZpbHRlclxuXHRcdHRoaXMuaW5jb21pbmdVcGRhdGVzRmlsdGVyRm4gPSB0aGlzLndpa2kuY29tcGlsZUZpbHRlcih0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoSU5DT01JTkdfVVBEQVRFU19GSUxURVJfVElERExFUikpO1xuXHRcdHRoaXMuc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhTRVJWRVJfTk9UX0NPTk5FQ1RFRCk7XG5cdH1cblxuXHRwcml2YXRlIHNldFVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMoc3RhdHVzOiBzdHJpbmcpIHtcblx0XHR0aGlzLnNlcnZlclVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMgPSBzdGF0dXM7XG5cdFx0dGhpcy53aWtpLmFkZFRpZGRsZXIoe1xuXHRcdFx0dGl0bGU6IENPTk5FQ1RJT05fU1RBVEVfVElERExFUixcblx0XHRcdHRleHQ6IHN0YXR1c1xuXHRcdH0pO1xuXHR9XG5cdHByaXZhdGUgc2V0TG9nZ2VyU2F2ZUJ1ZmZlcihsb2dnZXJGb3JTYXZpbmc6IExvZ2dlcikge1xuXHRcdHRoaXMubG9nZ2VyLnNldFNhdmVCdWZmZXIobG9nZ2VyRm9yU2F2aW5nKTtcblx0fVxuXHRpc1JlYWR5KCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHByaXZhdGUgZ2V0SG9zdCgpIHtcblx0XHR2YXIgdGV4dCA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChDT05GSUdfSE9TVF9USURETEVSLCBERUZBVUxUX0hPU1RfVElERExFUiksIHN1YnN0aXR1dGlvbnMgPSBbXG5cdFx0XHR7IG5hbWU6IFwicHJvdG9jb2xcIiwgdmFsdWU6IGRvY3VtZW50LmxvY2F0aW9uLnByb3RvY29sIH0sXG5cdFx0XHR7IG5hbWU6IFwiaG9zdFwiLCB2YWx1ZTogZG9jdW1lbnQubG9jYXRpb24uaG9zdCB9LFxuXHRcdFx0eyBuYW1lOiBcInBhdGhuYW1lXCIsIHZhbHVlOiBkb2N1bWVudC5sb2NhdGlvbi5wYXRobmFtZSB9XG5cdFx0XTtcblx0XHRmb3IgKHZhciB0ID0gMDsgdCA8IHN1YnN0aXR1dGlvbnMubGVuZ3RoOyB0KyspIHtcblx0XHRcdHZhciBzID0gc3Vic3RpdHV0aW9uc1t0XTtcblx0XHRcdHRleHQgPSAkdHcudXRpbHMucmVwbGFjZVN0cmluZyh0ZXh0LCBuZXcgUmVnRXhwKFwiXFxcXCRcIiArIHMubmFtZSArIFwiXFxcXCRcIiwgXCJtZ1wiKSwgcy52YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWNpcGVSZXF1ZXN0PEtFWSBleHRlbmRzIChzdHJpbmcgJiBrZXlvZiBUaWRkbGVyUm91dGVyUmVzcG9uc2UpPihcblx0XHRvcHRpb25zOiBPbWl0PEh0dHBSZXF1ZXN0T3B0aW9uczxcInRleHRcIj4sIFwicmVzcG9uc2VUeXBlXCI+ICYgeyBrZXk6IEtFWSB9XG5cdCkge1xuXHRcdGlmICghb3B0aW9ucy51cmwuc3RhcnRzV2l0aChcIi9cIikpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJUaGUgdXJsIGRvZXMgbm90IHN0YXJ0IHdpdGggYSBzbGFzaFwiKTtcblxuXHRcdHJldHVybiBhd2FpdCBodHRwUmVxdWVzdCh7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0cmVzcG9uc2VUeXBlOiBcInRleHRcIixcblx0XHRcdHVybDogdGhpcy5ob3N0ICsgXCJyZWNpcGVzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMucmVjaXBlKSArIG9wdGlvbnMudXJsLFxuXHRcdH0pLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdC8vIGluIHRoZW9yeSwgNDAzIGFuZCA0MDQgc2hvdWxkIHJlc3VsdCBpbiBmdXJ0aGVyIGFjdGlvbiwgXG5cdFx0XHQvLyBidXQgaW4gcmVhbGl0eSBhbiBlcnJvciBnZXRzIGxvZ2dlZCB0byBjb25zb2xlIGFuZCB0aGF0J3MgaXQuXG5cdFx0XHRpZiAoIXJlc3VsdC5vaykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdFx0YFRoZSBzZXJ2ZXIgcmV0dXJuIGEgc3RhdHVzIGNvZGUgJHtyZXN1bHQuc3RhdHVzfSB3aXRoIHRoZSBmb2xsb3dpbmcgcmVhc29uOiBgXG5cdFx0XHRcdFx0KyBgJHtyZXN1bHQuaGVhZGVycy5nZXQoXCJ4LXJlYXNvblwiKSA/PyBcIihubyByZWFzb24gZ2l2ZW4pXCJ9YFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9KS50aGVuKGUgPT4gW3RydWUsIHZvaWQgMCwge1xuXHRcdFx0Li4uZSxcblx0XHRcdC8qKiB0aGlzIGlzIHVuZGVmaW5lZCBpZiBzdGF0dXMgaXMgbm90IDIwMCAqL1xuXHRcdFx0cmVzcG9uc2VKU09OOiBlLnN0YXR1cyA9PT0gMjAwID8gdHJ5UGFyc2VKU09OKGUucmVzcG9uc2UpIGFzIFRpZGRsZXJSb3V0ZXJSZXNwb25zZVtLRVldW1wiUlwiXSA6IHVuZGVmaW5lZFxuXHRcdH1dIGFzIGNvbnN0LCBlID0+IFtmYWxzZSwgZSwgdm9pZCAwXSBhcyBjb25zdCk7XG5cblx0XHRmdW5jdGlvbiB0cnlQYXJzZUpTT04oZGF0YTogc3RyaW5nKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShkYXRhKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcihcIkVycm9yIHBhcnNpbmcgSlNPTiwgcmV0dXJuaW5nIHVuZGVmaW5lZFwiLCBlKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0fVxuXG5cdGdldFRpZGRsZXJJbmZvKHRpZGRsZXI6IFRpZGRsZXIpIHtcblx0XHR2YXIgdGl0bGUgPSB0aWRkbGVyLmZpZWxkcy50aXRsZSxcblx0XHRcdHJldmlzaW9uID0gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oUkVWSVNJT05fU1RBVEVfVElERExFUiwgdGl0bGUpLFxuXHRcdFx0YmFnID0gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oQkFHX1NUQVRFX1RJRERMRVIsIHRpdGxlKTtcblx0XHRpZiAocmV2aXNpb24gJiYgYmFnKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0aXRsZTogdGl0bGUsXG5cdFx0XHRcdHJldmlzaW9uOiByZXZpc2lvbixcblx0XHRcdFx0YmFnOiBiYWdcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cdHByaXZhdGUgZ2V0VGlkZGxlckJhZyh0aXRsZTogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMud2lraS5leHRyYWN0VGlkZGxlckRhdGFJdGVtKEJBR19TVEFURV9USURETEVSLCB0aXRsZSk7XG5cdH1cdFxuXHRnZXRUaWRkbGVyUmV2aXNpb24odGl0bGU6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLndpa2kuZXh0cmFjdFRpZGRsZXJEYXRhSXRlbShSRVZJU0lPTl9TVEFURV9USURETEVSLCB0aXRsZSk7XG5cdH1cblx0cHJpdmF0ZSBzZXRUaWRkbGVySW5mbyh0aXRsZTogc3RyaW5nLCByZXZpc2lvbjogc3RyaW5nLCBiYWc6IHN0cmluZykge1xuXHRcdHRoaXMud2lraS5zZXRUZXh0KEJBR19TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgYmFnLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHRcdHRoaXMud2lraS5zZXRUZXh0KFJFVklTSU9OX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCByZXZpc2lvbiwgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0fVxuXHRwcml2YXRlIHJlbW92ZVRpZGRsZXJJbmZvKHRpdGxlOiBzdHJpbmcpIHtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChCQUdfU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIHVuZGVmaW5lZCwgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChSRVZJU0lPTl9TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgdW5kZWZpbmVkLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHR9XG5cblx0Lypcblx0R2V0IHRoZSBjdXJyZW50IHN0YXR1cyBvZiB0aGUgc2VydmVyIGNvbm5lY3Rpb25cblx0Ki9cblx0YXN5bmMgZ2V0U3RhdHVzKGNhbGxiYWNrOiBTZXJ2ZXJTdGF0dXNDYWxsYmFjaykge1xuXG5cdFx0Y29uc3QgW29rLCBlcnJvciwgZGF0YV0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3Qoe1xuXHRcdFx0a2V5OiBcImhhbmRsZUdldFJlY2lwZVN0YXR1c1wiLFxuXHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdFx0dXJsOiBcIi9zdGF0dXNcIixcblx0XHR9KTtcblx0XHRpZiAoIW9rKSB7XG5cdFx0XHR0aGlzLmxvZ2dlci5sb2coXCJFcnJvciBnZXR0aW5nIHN0YXR1c1wiLCBlcnJvcik7XG5cdFx0XHRpZiAoY2FsbGJhY2spIGNhbGxiYWNrKGVycm9yKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhdHVzID0gZGF0YS5yZXNwb25zZUpTT047XG5cdFx0dGhpcy5pc1JlYWRPbmx5ID0gc3RhdHVzPy5pc1JlYWRPbmx5ID8/IHRydWU7XG5cdFx0dGhpcy5pc0xvZ2dlZEluID0gc3RhdHVzPy5pc0xvZ2dlZEluID8/IGZhbHNlO1xuXHRcdHRoaXMudXNlcm5hbWUgPSBzdGF0dXM/LnVzZXJuYW1lID8/IFwiKGFub24pXCI7XG5cdFx0aWYgKGNhbGxiYWNrKSB7XG5cdFx0XHRjYWxsYmFjayhcblx0XHRcdFx0Ly8gRXJyb3Jcblx0XHRcdFx0bnVsbCxcblx0XHRcdFx0Ly8gSXMgbG9nZ2VkIGluXG5cdFx0XHRcdHRoaXMuaXNMb2dnZWRJbixcblx0XHRcdFx0Ly8gVXNlcm5hbWVcblx0XHRcdFx0dGhpcy51c2VybmFtZSxcblx0XHRcdFx0Ly8gSXMgcmVhZCBvbmx5XG5cdFx0XHRcdHRoaXMuaXNSZWFkT25seSxcblx0XHRcdFx0Ly8gSXMgYW5vbnltb3VzXG5cdFx0XHRcdC8vIG5vIGlkZWEgd2hhdCB0aGlzIG1lYW5zLCBhbHdheXMgcmV0dXJuIGZhbHNlXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblx0Lypcblx0R2V0IGRldGFpbHMgb2YgY2hhbmdlZCB0aWRkbGVycyBmcm9tIHRoZSBzZXJ2ZXJcblx0Ki9cblx0Z2V0VXBkYXRlZFRpZGRsZXJzKHN5bmNlcjogU3luY2VyLCBjYWxsYmFjazogKGVycjogYW55LCBjaGFuZ2VzPzogeyBtb2RpZmljYXRpb25zOiBzdHJpbmdbXTsgZGVsZXRpb25zOiBzdHJpbmdbXSB9KSA9PiB2b2lkKSB7XG5cdFx0aWYgKCF0aGlzLnVzZVNlcnZlclNlbnRFdmVudHMpIHtcblx0XHRcdHRoaXMucG9sbFNlcnZlcigpLnRoZW4oY2hhbmdlcyA9PiB7XG5cdFx0XHRcdGNhbGxiYWNrKG51bGwsIGNoYW5nZXMpO1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHQvLyBJZiBCcm93c3dlciBTdG9yYWdlIHRpZGRsZXJzIHdlcmUgY2FjaGVkIG9uIHJlbG9hZGluZyB0aGUgd2lraSwgYWRkIHRoZW0gYWZ0ZXIgc3luYyBmcm9tIHNlcnZlciBjb21wbGV0ZXMgaW4gdGhlIGFib3ZlIGNhbGxiYWNrLlxuXHRcdFx0XHRcdGlmICgkdHcuYnJvd3NlclN0b3JhZ2UgJiYgJHR3LmJyb3dzZXJTdG9yYWdlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0XHQkdHcuYnJvd3NlclN0b3JhZ2UuYWRkQ2FjaGVkVGlkZGxlcnMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSwgZXJyID0+IHtcblx0XHRcdFx0Y2FsbGJhY2soZXJyKTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHQvLyBEbyBub3RoaW5nIGlmIHRoZXJlJ3MgYWxyZWFkeSBhIGNvbm5lY3Rpb24gaW4gcHJvZ3Jlc3MuXG5cdFx0aWYgKHRoaXMuc2VydmVyVXBkYXRlQ29ubmVjdGlvblN0YXR1cyAhPT0gU0VSVkVSX05PVF9DT05ORUNURUQpIHtcblx0XHRcdHJldHVybiBjYWxsYmFjayhudWxsLCB7XG5cdFx0XHRcdG1vZGlmaWNhdGlvbnM6IFtdLFxuXHRcdFx0XHRkZWxldGlvbnM6IFtdXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Ly8gVHJ5IHRvIGNvbm5lY3QgYSBzZXJ2ZXIgc3RyZWFtXG5cdFx0dGhpcy5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9DT05ORUNUSU5HX1NTRSk7XG5cdFx0dGhpcy5jb25uZWN0U2VydmVyU3RyZWFtKHtcblx0XHRcdHN5bmNlcjogc3luY2VyLFxuXHRcdFx0b25lcnJvcjogYXN5bmMgZnVuY3Rpb24gKGVycikge1xuXHRcdFx0XHRzZWxmLmxvZ2dlci5sb2coXCJFcnJvciBjb25uZWN0aW5nIFNTRSBzdHJlYW1cIiwgZXJyKTtcblx0XHRcdFx0Ly8gSWYgdGhlIHN0cmVhbSBkaWRuJ3Qgd29yaywgdHJ5IHBvbGxpbmdcblx0XHRcdFx0c2VsZi5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9QT0xMSU5HKTtcblx0XHRcdFx0Y29uc3QgY2hhbmdlcyA9IGF3YWl0IHNlbGYucG9sbFNlcnZlcigpO1xuXHRcdFx0XHRzZWxmLnNldFVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMoU0VSVkVSX05PVF9DT05ORUNURUQpO1xuXHRcdFx0XHRjYWxsYmFjayhudWxsLCBjaGFuZ2VzKTtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gSWYgQnJvd3N3ZXIgU3RvcmFnZSB0aWRkbGVycyB3ZXJlIGNhY2hlZCBvbiByZWxvYWRpbmcgdGhlIHdpa2ksIGFkZCB0aGVtIGFmdGVyIHN5bmMgZnJvbSBzZXJ2ZXIgY29tcGxldGVzIGluIHRoZSBhYm92ZSBjYWxsYmFjay5cblx0XHRcdFx0XHRpZiAoJHR3LmJyb3dzZXJTdG9yYWdlICYmICR0dy5icm93c2VyU3RvcmFnZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdFx0JHR3LmJyb3dzZXJTdG9yYWdlLmFkZENhY2hlZFRpZGRsZXJzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRvbm9wZW46IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0c2VsZi5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9DT05ORUNURURfU1NFKTtcblx0XHRcdFx0Ly8gVGhlIHN5bmNlciBpcyBleHBlY3RpbmcgYSBjYWxsYmFjayBidXQgd2UgZG9uJ3QgaGF2ZSBhbnkgZGF0YSB0byBzZW5kXG5cdFx0XHRcdGNhbGxiYWNrKG51bGwsIHtcblx0XHRcdFx0XHRtb2RpZmljYXRpb25zOiBbXSxcblx0XHRcdFx0XHRkZWxldGlvbnM6IFtdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdH1cblx0Lypcblx0QXR0ZW1wdCB0byBlc3RhYmxpc2ggYW4gU1NFIHN0cmVhbSB3aXRoIHRoZSBzZXJ2ZXIgYW5kIHRyYW5zZmVyIHRpZGRsZXIgY2hhbmdlcy4gT3B0aW9ucyBpbmNsdWRlOlxuICBcblx0c3luY2VyOiByZWZlcmVuY2UgdG8gc3luY2VyIG9iamVjdCB1c2VkIGZvciBzdG9yaW5nIGRhdGFcblx0b25vcGVuOiBpbnZva2VkIHdoZW4gdGhlIHN0cmVhbSBpcyBzdWNjZXNzZnVsbHkgb3BlbmVkXG5cdG9uZXJyb3I6IGludm9rZWQgaWYgdGhlcmUgaXMgYW4gZXJyb3Jcblx0Ki9cblx0cHJpdmF0ZSBjb25uZWN0U2VydmVyU3RyZWFtKG9wdGlvbnM6IHtcblx0XHRzeW5jZXI6IFN5bmNlcjtcblx0XHRvbm9wZW46IChldmVudDogRXZlbnQpID0+IHZvaWQ7XG5cdFx0b25lcnJvcjogKGV2ZW50OiBFdmVudCkgPT4gdm9pZDtcblx0fSkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRjb25zdCBldmVudFNvdXJjZSA9IG5ldyBFdmVudFNvdXJjZShcIi9yZWNpcGVzL1wiICsgdGhpcy5yZWNpcGUgKyBcIi9ldmVudHM/bGFzdF9rbm93bl9yZXZpc2lvbl9pZD1cIiArIHRoaXMubGFzdF9rbm93bl9yZXZpc2lvbl9pZCk7XG5cdFx0ZXZlbnRTb3VyY2Uub25lcnJvciA9IGZ1bmN0aW9uIChldmVudCkge1xuXHRcdFx0aWYgKG9wdGlvbnMub25lcnJvcikge1xuXHRcdFx0XHRvcHRpb25zLm9uZXJyb3IoZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZXZlbnRTb3VyY2Uub25vcGVuID0gZnVuY3Rpb24gKGV2ZW50KSB7XG5cdFx0XHRpZiAob3B0aW9ucy5vbm9wZW4pIHtcblx0XHRcdFx0b3B0aW9ucy5vbm9wZW4oZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZXZlbnRTb3VyY2UuYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCBmdW5jdGlvbiAoZXZlbnQpIHtcblxuXHRcdFx0Y29uc3QgZGF0YToge1xuXHRcdFx0XHR0aXRsZTogc3RyaW5nO1xuXHRcdFx0XHRyZXZpc2lvbl9pZDogbnVtYmVyO1xuXHRcdFx0XHRpc19kZWxldGVkOiBib29sZWFuO1xuXHRcdFx0XHRiYWdfbmFtZTogc3RyaW5nO1xuXHRcdFx0XHR0aWRkbGVyOiBhbnk7XG5cdFx0XHR9ID0gJHR3LnV0aWxzLnBhcnNlSlNPTlNhZmUoZXZlbnQuZGF0YSk7XG5cdFx0XHRpZiAoIWRhdGEpIHJldHVybjtcblxuXHRcdFx0Y29uc29sZS5sb2coXCJTU0UgZGF0YVwiLCBkYXRhKTtcblx0XHRcdC8vIFVwZGF0ZSBsYXN0IHNlZW4gcmV2aXNpb25faWRcblx0XHRcdGlmIChkYXRhLnJldmlzaW9uX2lkID4gc2VsZi5sYXN0X2tub3duX3JldmlzaW9uX2lkKSB7XG5cdFx0XHRcdHNlbGYubGFzdF9rbm93bl9yZXZpc2lvbl9pZCA9IGRhdGEucmV2aXNpb25faWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBSZWNvcmQgdGhlIGxhc3QgdXBkYXRlIHRvIHRoaXMgdGlkZGxlclxuXHRcdFx0c2VsZi5sYXN0UmVjb3JkZWRVcGRhdGVbZGF0YS50aXRsZV0gPSB7XG5cdFx0XHRcdHR5cGU6IGRhdGEuaXNfZGVsZXRlZCA/IFwiZGVsZXRpb25cIiA6IFwidXBkYXRlXCIsXG5cdFx0XHRcdHJldmlzaW9uX2lkOiBkYXRhLnJldmlzaW9uX2lkXG5cdFx0XHR9O1xuXHRcdFx0Y29uc29sZS5sb2coYE91c3RhbmRpbmcgcmVxdWVzdHMgaXMgJHtKU09OLnN0cmluZ2lmeShzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbZGF0YS50aXRsZV0pfWApO1xuXHRcdFx0Ly8gUHJvY2VzcyB0aGUgdXBkYXRlIGlmIHRoZSB0aWRkbGVyIGlzIG5vdCB0aGUgc3ViamVjdCBvZiBhbiBvdXRzdGFuZGluZyByZXF1ZXN0XG5cdFx0XHRpZiAoc2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW2RhdGEudGl0bGVdKSByZXR1cm47XG5cdFx0XHRpZiAoZGF0YS5pc19kZWxldGVkKSB7XG5cdFx0XHRcdHNlbGYucmVtb3ZlVGlkZGxlckluZm8oZGF0YS50aXRsZSk7XG5cdFx0XHRcdGRlbGV0ZSBvcHRpb25zLnN5bmNlci50aWRkbGVySW5mb1tkYXRhLnRpdGxlXTtcblx0XHRcdFx0b3B0aW9ucy5zeW5jZXIubG9nZ2VyLmxvZyhcIkRlbGV0aW5nIHRpZGRsZXIgbWlzc2luZyBmcm9tIHNlcnZlcjpcIiwgZGF0YS50aXRsZSk7XG5cdFx0XHRcdG9wdGlvbnMuc3luY2VyLndpa2kuZGVsZXRlVGlkZGxlcihkYXRhLnRpdGxlKTtcblx0XHRcdFx0b3B0aW9ucy5zeW5jZXIucHJvY2Vzc1Rhc2tRdWV1ZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmFyIHJlc3VsdCA9IHNlbGYuaW5jb21pbmdVcGRhdGVzRmlsdGVyRm4uY2FsbChzZWxmLndpa2ksIHNlbGYud2lraS5tYWtlVGlkZGxlckl0ZXJhdG9yKFtkYXRhLnRpdGxlXSkpO1xuXHRcdFx0XHRpZiAocmVzdWx0Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRzZWxmLnNldFRpZGRsZXJJbmZvKGRhdGEudGl0bGUsIGRhdGEucmV2aXNpb25faWQudG9TdHJpbmcoKSwgZGF0YS5iYWdfbmFtZSk7XG5cdFx0XHRcdFx0b3B0aW9ucy5zeW5jZXIuc3RvcmVUaWRkbGVyKGRhdGEudGlkZGxlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXG5cdFx0fSk7XG5cdH1cblx0cHJpdmF0ZSBhc3luYyBwb2xsU2VydmVyKCkge1xuXG5cdFx0Y29uc3QgW29rLCBlcnIsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3Qoe1xuXHRcdFx0a2V5OiBcImhhbmRsZUdldEJhZ1N0YXRlc1wiLFxuXHRcdFx0dXJsOiBcIi9iYWctc3RhdGVzXCIsXG5cdFx0XHRtZXRob2Q6IFwiR0VUXCIsXG5cdFx0XHRxdWVyeVBhcmFtczoge1xuXHRcdFx0XHRpbmNsdWRlX2RlbGV0ZWQ6IFwieWVzXCIsXG5cdFx0XHRcdGxhc3Rfa25vd25fcmV2aXNpb25faWQ6IHRoaXMubGFzdF9rbm93bl9yZXZpc2lvbl9pZCxcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICghb2spIHRocm93IGVycjtcblxuXHRcdGNvbnN0IGJhZ3MgPSByZXN1bHQucmVzcG9uc2VKU09OO1xuXG5cdFx0aWYgKCFiYWdzKSByZXR1cm47XG5cblx0XHRiYWdzLnNvcnQoKGEsIGIpID0+IGIucG9zaXRpb24gLSBhLnBvc2l0aW9uKTtcblx0XHRjb25zdCBtb2RpZmllZCA9IG5ldyBTZXQ8c3RyaW5nPigpLFxuXHRcdFx0ZGVsZXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0Y29uc3QgaW5jb21pbmdUaXRsZXMgPSBuZXcgU2V0PHN0cmluZz4oYmFncy5tYXAoXG5cdFx0XHQvLyBnZXQgdGhlIHRpdGxlcyBpbiBlYWNoIGxheWVyIHRoYXQgYXJlbid0IGRlbGV0ZWRcblx0XHRcdGUgPT4gZS50aWRkbGVycy5maWx0ZXIoZiA9PiAhZi5pc19kZWxldGVkKS5tYXAoZiA9PiBmLnRpdGxlKVxuXHRcdFx0Ly8gYW5kIGZsYXR0ZW4gdGhlbSBmb3IgU2V0XG5cdFx0KS5mbGF0KCkpO1xuXG5cdFx0bGV0IGxhc3RfcmV2aXNpb24gPSB0aGlzLmxhc3Rfa25vd25fcmV2aXNpb25faWQ7XG5cblx0XHRiYWdzLmZvckVhY2goYmFnID0+IHtcblx0XHRcdGJhZy50aWRkbGVycy5mb3JFYWNoKHRpZCA9PiB7XG5cdFx0XHRcdC8vIGlmIHRoZSByZXZpc2lvbiBpcyBvbGQsIGlnbm9yZSwgc2luY2UgZGVsZXRpb25zIGNyZWF0ZSBhIG5ldyByZXZpc2lvblxuXHRcdFx0XHRpZiAodGlkLnJldmlzaW9uX2lkIDw9IHRoaXMubGFzdF9rbm93bl9yZXZpc2lvbl9pZCkgcmV0dXJuO1xuXHRcdFx0XHRpZiAodGlkLnJldmlzaW9uX2lkID4gbGFzdF9yZXZpc2lvbikgbGFzdF9yZXZpc2lvbiA9IHRpZC5yZXZpc2lvbl9pZDtcblx0XHRcdFx0Ly8gY2hlY2sgaWYgdGhpcyB0aXRsZSBzdGlsbCBleGlzdHMgaW4gYW55IGxheWVyXG5cdFx0XHRcdGlmIChpbmNvbWluZ1RpdGxlcy5oYXModGlkLnRpdGxlKSlcblx0XHRcdFx0XHRtb2RpZmllZC5hZGQodGlkLnRpdGxlKTtcblx0XHRcdFx0ZWxzZVxuXHRcdFx0XHRcdGRlbGV0ZWQuYWRkKHRpZC50aXRsZSk7XG5cdFx0XHR9KVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5sYXN0X2tub3duX3JldmlzaW9uX2lkID0gbGFzdF9yZXZpc2lvbjtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRtb2RpZmljYXRpb25zOiBbLi4ubW9kaWZpZWQua2V5cygpXSxcblx0XHRcdGRlbGV0aW9uczogWy4uLmRlbGV0ZWQua2V5cygpXSxcblx0XHR9XG5cblx0fVxuXG5cdC8qXG5cdFF1ZXVlIGEgbG9hZCBmb3IgYSB0aWRkbGVyIGlmIHRoZXJlIGhhcyBiZWVuIGFuIHVwZGF0ZSBmb3IgaXQgc2luY2UgdGhlIHNwZWNpZmllZCByZXZpc2lvblxuXHQqL1xuXHRwcml2YXRlIGNoZWNrTGFzdFJlY29yZGVkVXBkYXRlKHRpdGxlOiBzdHJpbmcsIHJldmlzaW9uOiBzdHJpbmcpIHtcblx0XHR2YXIgbHJ1ID0gdGhpcy5sYXN0UmVjb3JkZWRVcGRhdGVbdGl0bGVdO1xuXHRcdGlmIChscnUgJiYgbHJ1LnJldmlzaW9uX2lkID4gcmV2aXNpb24pIHtcblx0XHRcdGNvbnNvbGUubG9nKGBDaGVja2luZyBmb3IgdXBkYXRlcyB0byAke3RpdGxlfSBzaW5jZSAke0pTT04uc3RyaW5naWZ5KGxydSl9IGNvbXBhcmluZyB0byAke3JldmlzaW9ufWApO1xuXHRcdFx0dGhpcy5zeW5jZXIgJiYgdGhpcy5zeW5jZXIuZW5xdWV1ZUxvYWRUaWRkbGVyKHRpdGxlKTtcblx0XHR9XG5cdH1cblx0cHJpdmF0ZSBnZXQgc3luY2VyKCkge1xuXHRcdGlmICgkdHcuc3luY2FkYXB0b3IgPT09IHRoaXMpIHJldHVybiAkdHcuc3luY2VyO1xuXHR9XG5cdC8qXG5cdFNhdmUgYSB0aWRkbGVyIGFuZCBpbnZva2UgdGhlIGNhbGxiYWNrIHdpdGggKGVycixhZGFwdG9ySW5mbyxyZXZpc2lvbilcblx0Ki9cblx0YXN5bmMgc2F2ZVRpZGRsZXIoXG5cdFx0dGlkZGxlcjogVGlkZGxlcixcblx0XHRjYWxsYmFjazogKFxuXHRcdFx0ZXJyOiBhbnksXG5cdFx0XHRhZGFwdG9ySW5mbz86IE1XU0FkYXB0b3JJbmZvLFxuXHRcdFx0cmV2aXNpb24/OiBzdHJpbmdcblx0XHQpID0+IHZvaWQsXG5cdFx0b3B0aW9ucz86IHt9XG5cdCkge1xuXHRcdHZhciBzZWxmID0gdGhpcywgdGl0bGUgPSB0aWRkbGVyLmZpZWxkcy50aXRsZSBhcyBzdHJpbmc7XG5cdFx0aWYgKHRoaXMuaXNSZWFkT25seSB8fCB0aXRsZS5zdWJzdHIoMCwgTVdDX1NUQVRFX1RJRERMRVJfUFJFRklYLmxlbmd0aCkgPT09IE1XQ19TVEFURV9USURETEVSX1BSRUZJWCkge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKG51bGwpO1xuXHRcdH1cblx0XHRzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdID0geyB0eXBlOiBcIlBVVFwiIH07XG5cblx0XHQvLyBhcHBsaWNhdGlvbi94LW13cy10aWRkbGVyXG5cdFx0Ly8gVGhlIC50aWQgZmlsZSBmb3JtYXQgZG9lcyBub3Qgc3VwcG9ydCBmaWVsZCBuYW1lcyB3aXRoIGNvbG9ucy4gXG5cdFx0Ly8gUmF0aGVyIHRoYW4gdHJ5aW5nIHRvIGNhdGNoIGFsbCB0aGUgdW5zdXBwb3J0ZWQgdmFyaWF0aW9ucyB0aGF0IG1heSBhcHBlYXIsXG5cdFx0Ly8gd2UnbGwganVzdCB1c2UgSlNPTiB0byBzZW5kIGl0IGFjcm9zcyB0aGUgd2lyZSwgc2luY2UgdGhhdCBpcyB0aGUgb2ZmaWNpYWwgZmFsbGJhY2sgZm9ybWF0IGFueXdheS5cblx0XHQvLyBIb3dldmVyLCBwYXJzaW5nIGEgaHVnZSBzdHJpbmcgdmFsdWUgaW5zaWRlIGEgSlNPTiBvYmplY3QgaXMgdmVyeSBzbG93LFxuXHRcdC8vIHNvIHdlIHNwbGl0IG9mZiB0aGUgdGV4dCBmaWVsZCBhbmQgc2VuZCBpdCBhZnRlciB0aGUgb3RoZXIgZmllbGRzLiBcblxuXHRcdGNvbnN0IGZpZWxkcyA9IHRpZGRsZXIuZ2V0RmllbGRTdHJpbmdzKHt9KTtcblx0XHRjb25zdCB0ZXh0ID0gZmllbGRzLnRleHQ7XG5cdFx0ZGVsZXRlIGZpZWxkcy50ZXh0O1xuXHRcdGxldCBib2R5ID0gSlNPTi5zdHJpbmdpZnkoZmllbGRzKTtcblxuXHRcdGlmICh0aWRkbGVyLmhhc0ZpZWxkKFwidGV4dFwiKSkge1xuXHRcdFx0aWYgKHR5cGVvZiB0ZXh0ICE9PSBcInN0cmluZ1wiICYmIHRleHQpXG5cdFx0XHRcdHJldHVybiBjYWxsYmFjayhuZXcgRXJyb3IoXCJFcnJvciBzYXZpbmcgdGlkZGxlciBcIiArIGZpZWxkcy50aXRsZSArIFwiOiB0aGUgdGV4dCBmaWVsZCBpcyB0cnV0aHkgYnV0IG5vdCBhIHN0cmluZ1wiKSk7XG5cdFx0XHRib2R5ICs9IGBcXG5cXG4ke3RleHR9YFxuXHRcdH1cblxuXHRcdHR5cGUgdCA9IFRpZGRsZXJSb3V0ZXJSZXNwb25zZVtcImhhbmRsZVNhdmVSZWNpcGVUaWRkbGVyXCJdXG5cdFx0Y29uc3QgW29rLCBlcnIsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3Qoe1xuXHRcdFx0a2V5OiBcImhhbmRsZVNhdmVSZWNpcGVUaWRkbGVyXCIsXG5cdFx0XHR1cmw6IFwiL3RpZGRsZXJzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRpdGxlKSxcblx0XHRcdG1ldGhvZDogXCJQVVRcIixcblx0XHRcdHJlcXVlc3RCb2R5U3RyaW5nOiBib2R5LFxuXHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcImNvbnRlbnQtdHlwZVwiOiBcImFwcGxpY2F0aW9uL3gtbXdzLXRpZGRsZXJcIlxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0ZGVsZXRlIHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV07XG5cdFx0aWYgKCFvaykgcmV0dXJuIGNhbGxiYWNrKGVycik7XG5cblx0XHRjb25zdCBkYXRhID0gcmVzdWx0LnJlc3BvbnNlSlNPTjtcblx0XHRpZiAoIWRhdGEpIHJldHVybiBjYWxsYmFjayhudWxsKTsgLy8gYSAyeHggcmVzcG9uc2Ugd2l0aG91dCBhIGJvZHkgaXMgdW5saWtlbHlcblxuXHRcdC8vSWYgQnJvd3Nlci1TdG9yYWdlIHBsdWdpbiBpcyBwcmVzZW50LCByZW1vdmUgdGlkZGxlciBmcm9tIGxvY2FsIHN0b3JhZ2UgYWZ0ZXIgc3VjY2Vzc2Z1bCBzeW5jIHRvIHRoZSBzZXJ2ZXJcblx0XHRpZiAoJHR3LmJyb3dzZXJTdG9yYWdlICYmICR0dy5icm93c2VyU3RvcmFnZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0JHR3LmJyb3dzZXJTdG9yYWdlLnJlbW92ZVRpZGRsZXJGcm9tTG9jYWxTdG9yYWdlKHRpdGxlKTtcblx0XHR9XG5cblxuXHRcdC8vIFNhdmUgdGhlIGRldGFpbHMgb2YgdGhlIG5ldyByZXZpc2lvbiBvZiB0aGUgdGlkZGxlclxuXHRcdGNvbnN0IHJldmlzaW9uID0gZGF0YS5yZXZpc2lvbl9pZCwgYmFnX25hbWUgPSBkYXRhLmJhZ19uYW1lO1xuXHRcdGNvbnNvbGUubG9nKGBTYXZlZCAke3RpdGxlfSB3aXRoIHJldmlzaW9uICR7cmV2aXNpb259IGFuZCBiYWcgJHtiYWdfbmFtZX1gKTtcblx0XHQvLyBJZiB0aGVyZSBoYXMgYmVlbiBhIG1vcmUgcmVjZW50IHVwZGF0ZSBmcm9tIHRoZSBzZXJ2ZXIgdGhlbiBlbnF1ZXVlIGEgbG9hZCBvZiB0aGlzIHRpZGRsZXJcblx0XHRzZWxmLmNoZWNrTGFzdFJlY29yZGVkVXBkYXRlKHRpdGxlLCByZXZpc2lvbik7XG5cdFx0Ly8gSW52b2tlIHRoZSBjYWxsYmFja1xuXHRcdHNlbGYuc2V0VGlkZGxlckluZm8odGl0bGUsIHJldmlzaW9uLCBiYWdfbmFtZSk7XG5cdFx0Y2FsbGJhY2sobnVsbCwgeyBiYWc6IGJhZ19uYW1lIH0sIHJldmlzaW9uKTtcblxuXHR9XG5cdC8qXG5cdExvYWQgYSB0aWRkbGVyIGFuZCBpbnZva2UgdGhlIGNhbGxiYWNrIHdpdGggKGVycix0aWRkbGVyRmllbGRzKVxuXG5cdFRoZSBzeW5jZXIgZG9lcyBub3QgcGFzcyBpdHNlbGYgaW50byBvcHRpb25zLlxuXHQqL1xuXHRhc3luYyBsb2FkVGlkZGxlcih0aXRsZTogc3RyaW5nLCBjYWxsYmFjazogKGVycjogYW55LCBmaWVsZHM/OiBhbnkpID0+IHZvaWQsIG9wdGlvbnM6IGFueSkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdID0geyB0eXBlOiBcIkdFVFwiIH07XG5cdFx0Y29uc3QgW29rLCBlcnIsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3Qoe1xuXHRcdFx0a2V5OiBcImhhbmRsZUdldFJlY2lwZVRpZGRsZXJcIixcblx0XHRcdHVybDogXCIvdGlkZGxlcnMvXCIgKyBlbmNvZGVVUklDb21wb25lbnQodGl0bGUpLFxuXHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdH0pXG5cdFx0ZGVsZXRlIHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV07XG5cdFx0aWYgKCFvaykgcmV0dXJuIGNhbGxiYWNrKGVycik7XG5cblx0XHRjb25zdCB7IHJlc3BvbnNlSlNPTjogZGF0YSwgaGVhZGVycyB9ID0gcmVzdWx0O1xuXHRcdGNvbnN0IHJldmlzaW9uID0gaGVhZGVycy5nZXQoXCJ4LXJldmlzaW9uLW51bWJlclwiKSA/PyBcIlwiLFxuXHRcdFx0YmFnX25hbWUgPSBoZWFkZXJzLmdldChcIngtYmFnLW5hbWVcIikgPz8gXCJcIjtcblxuXHRcdGlmICghcmV2aXNpb24gfHwgIWJhZ19uYW1lIHx8ICFkYXRhKSByZXR1cm4gY2FsbGJhY2sobnVsbCwgbnVsbCk7XG5cblx0XHQvLyBJZiB0aGVyZSBoYXMgYmVlbiBhIG1vcmUgcmVjZW50IHVwZGF0ZSBmcm9tIHRoZSBzZXJ2ZXIgdGhlbiBlbnF1ZXVlIGEgbG9hZCBvZiB0aGlzIHRpZGRsZXJcblx0XHRzZWxmLmNoZWNrTGFzdFJlY29yZGVkVXBkYXRlKHRpdGxlLCByZXZpc2lvbik7XG5cdFx0Ly8gSW52b2tlIHRoZSBjYWxsYmFja1xuXHRcdHNlbGYuc2V0VGlkZGxlckluZm8odGl0bGUsIHJldmlzaW9uLCBiYWdfbmFtZSk7XG5cdFx0Y2FsbGJhY2sobnVsbCwgZGF0YSk7XG5cdH1cblx0Lypcblx0RGVsZXRlIGEgdGlkZGxlciBhbmQgaW52b2tlIHRoZSBjYWxsYmFjayB3aXRoIChlcnIpXG5cdG9wdGlvbnMgaW5jbHVkZTpcblx0dGlkZGxlckluZm86IHRoZSBzeW5jZXIncyB0aWRkbGVySW5mbyBmb3IgdGhpcyB0aWRkbGVyXG5cdCovXG5cdGFzeW5jIGRlbGV0ZVRpZGRsZXIodGl0bGU6IHN0cmluZywgY2FsbGJhY2s6IChlcnI6IGFueSwgYWRhcHRvckluZm8/OiBhbnkpID0+IHZvaWQsIG9wdGlvbnM6IGFueSkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRpZiAodGhpcy5pc1JlYWRPbmx5KSB7IHJldHVybiBjYWxsYmFjayhudWxsKTsgfVxuXHRcdC8vIElmIHdlIGRvbid0IGhhdmUgYSBiYWcgaXQgbWVhbnMgdGhhdCB0aGUgdGlkZGxlciBoYXNuJ3QgYmVlbiBzZWVuIGJ5IHRoZSBzZXJ2ZXIsIHNvIHdlIGRvbid0IG5lZWQgdG8gZGVsZXRlIGl0XG5cdFx0Ly8gdmFyIGJhZyA9IHRoaXMuZ2V0VGlkZGxlckJhZyh0aXRsZSk7XG5cdFx0Ly8gaWYoIWJhZykgeyByZXR1cm4gY2FsbGJhY2sobnVsbCwgb3B0aW9ucy50aWRkbGVySW5mby5hZGFwdG9ySW5mbyk7IH1cblx0XHRzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdID0geyB0eXBlOiBcIkRFTEVURVwiIH07XG5cdFx0Ly8gSXNzdWUgSFRUUCByZXF1ZXN0IHRvIGRlbGV0ZSB0aGUgdGlkZGxlclxuXHRcdGNvbnN0IFtvaywgZXJyLCByZXN1bHRdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdGtleTogXCJoYW5kbGVEZWxldGVSZWNpcGVUaWRkbGVyXCIsXG5cdFx0XHR1cmw6IFwiL3RpZGRsZXJzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRpdGxlKSxcblx0XHRcdG1ldGhvZDogXCJERUxFVEVcIixcblx0XHR9KTtcblx0XHRkZWxldGUgc2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW3RpdGxlXTtcblx0XHRpZiAoIW9rKSByZXR1cm4gY2FsbGJhY2soZXJyKTtcblx0XHRjb25zdCB7IHJlc3BvbnNlSlNPTjogZGF0YSB9ID0gcmVzdWx0O1xuXHRcdGlmICghZGF0YSkgcmV0dXJuIGNhbGxiYWNrKG51bGwpO1xuXG5cdFx0Y29uc3QgcmV2aXNpb24gPSBkYXRhLnJldmlzaW9uX2lkLCBiYWdfbmFtZSA9IGRhdGEuYmFnX25hbWU7XG5cdFx0Ly8gSWYgdGhlcmUgaGFzIGJlZW4gYSBtb3JlIHJlY2VudCB1cGRhdGUgZnJvbSB0aGUgc2VydmVyIHRoZW4gZW5xdWV1ZSBhIGxvYWQgb2YgdGhpcyB0aWRkbGVyXG5cdFx0c2VsZi5jaGVja0xhc3RSZWNvcmRlZFVwZGF0ZSh0aXRsZSwgcmV2aXNpb24pO1xuXHRcdHNlbGYucmVtb3ZlVGlkZGxlckluZm8odGl0bGUpO1xuXHRcdC8vIEludm9rZSB0aGUgY2FsbGJhY2sgJiByZXR1cm4gbnVsbCBhZGFwdG9ySW5mb1xuXHRcdGNhbGxiYWNrKG51bGwsIG51bGwpO1xuXHR9XG59XG5cblxuaWYgKCR0dy5icm93c2VyICYmIGRvY3VtZW50LmxvY2F0aW9uLnByb3RvY29sLnN0YXJ0c1dpdGgoXCJodHRwXCIpKSB7XG5cdGV4cG9ydHMuYWRhcHRvckNsYXNzID0gTXVsdGlXaWtpQ2xpZW50QWRhcHRvcjtcbn1cblxudHlwZSBQYXJhbXNJbnB1dCA9IFVSTFNlYXJjaFBhcmFtcyB8IFtzdHJpbmcsIHN0cmluZ11bXSB8IG9iamVjdCB8IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuaW50ZXJmYWNlIEh0dHBSZXF1ZXN0T3B0aW9uczxUWVBFIGV4dGVuZHMgXCJhcnJheWJ1ZmZlclwiIHwgXCJibG9iXCIgfCBcInRleHRcIj4ge1xuXHQvKiogVGhlIHJlcXVlc3QgTUVUSE9ELiBNYXliZSBiZSBhbnl0aGluZyBleGNlcHQgQ09OTkVDVCwgVFJBQ0UsIG9yIFRSQUNLLiAgKi9cblx0bWV0aG9kOiBzdHJpbmc7XG5cdC8qKiBUaGUgdXJsIG1heSBhbHNvIGNvbnRhaW4gcXVlcnkgcGFyYW1zLiAqL1xuXHR1cmw6IHN0cmluZztcblx0LyoqIFRoZSByZXNwb25zZSB0eXBlcyAqL1xuXHRyZXNwb25zZVR5cGU6IFRZUEU7XG5cdGhlYWRlcnM/OiBQYXJhbXNJbnB1dDtcblx0LyoqIFRoaXMgaXMgcGFyc2VkIHNlcGFyYXRlbHkgZnJvbSB0aGUgdXJsIGFuZCBhcHBlbmRlZCB0byBpdC4gKi9cblx0cXVlcnlQYXJhbXM/OiBQYXJhbXNJbnB1dDtcblx0LyoqIFxuXHQgKiBUaGUgc3RyaW5nIHRvIHNlbmQgYXMgdGhlIHJlcXVlc3QgYm9keS4gTm90IHZhbGlkIGZvciBHRVQgYW5kIEhFQUQuXG5cdCAqIFxuXHQgKiBGb3IgYGFwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZGAsIHVzZSBgbmV3IFVSTFNlYXJjaFBhcmFtcygpLnRvU3RyaW5nKClgLlxuXHQgKiBcblx0ICogRm9yIGBhcHBsaWNhdGlvbi9qc29uYCwgdXNlIGBKU09OLnN0cmluZ2lmeSgpYFxuXHQgKi9cblx0cmVxdWVzdEJvZHlTdHJpbmc/OiBzdHJpbmc7XG5cdHByb2dyZXNzPzogKGV2ZW50OiBQcm9ncmVzc0V2ZW50PEV2ZW50VGFyZ2V0PikgPT4gdm9pZDtcbn1cblxuXG5mdW5jdGlvbiBodHRwUmVxdWVzdDxUWVBFIGV4dGVuZHMgXCJhcnJheWJ1ZmZlclwiIHwgXCJibG9iXCIgfCBcInRleHRcIj4ob3B0aW9uczogSHR0cFJlcXVlc3RPcHRpb25zPFRZUEU+KSB7XG5cblx0b3B0aW9ucy5tZXRob2QgPSBvcHRpb25zLm1ldGhvZC50b1VwcGVyQ2FzZSgpO1xuXG5cdGlmICgob3B0aW9ucy5tZXRob2QgPT09IFwiR0VUXCIgfHwgb3B0aW9ucy5tZXRob2QgPT09IFwiSEVBRFwiKSAmJiBvcHRpb25zLnJlcXVlc3RCb2R5U3RyaW5nKVxuXHRcdHRocm93IG5ldyBFcnJvcihcInJlcXVlc3RCb2R5U3RyaW5nIG11c3QgYmUgZmFsc3kgaWYgbWV0aG9kIGlzIEdFVCBvciBIRUFEXCIpO1xuXG5cdGZ1bmN0aW9uIHBhcmFtc0lucHV0KGlucHV0OiBQYXJhbXNJbnB1dCkge1xuXHRcdGlmICghaW5wdXQpIHJldHVybiBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdFx0aWYgKGlucHV0IGluc3RhbmNlb2YgVVJMU2VhcmNoUGFyYW1zKSByZXR1cm4gaW5wdXQ7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoaW5wdXQpIHx8IHR5cGVvZiBpbnB1dCA9PT0gXCJzdHJpbmdcIikgcmV0dXJuIG5ldyBVUkxTZWFyY2hQYXJhbXMoaW5wdXQpO1xuXHRcdHJldHVybiBuZXcgVVJMU2VhcmNoUGFyYW1zKE9iamVjdC5lbnRyaWVzKGlucHV0KSk7XG5cdH1cblxuXHRmdW5jdGlvbiBub3JtYWxpemVIZWFkZXJzKGhlYWRlcnM6IFVSTFNlYXJjaFBhcmFtcykge1xuXHRcdFsuLi5oZWFkZXJzLmtleXMoKV0uZm9yRWFjaCgoW2ssIHZdKSA9PiB7XG5cdFx0XHRjb25zdCBrMiA9IGsudG9Mb3dlckNhc2UoKTtcblx0XHRcdGlmIChrMiAhPT0gaykge1xuXHRcdFx0XHRoZWFkZXJzLmdldEFsbChrKS5mb3JFYWNoKGUgPT4ge1xuXHRcdFx0XHRcdGhlYWRlcnMuYXBwZW5kKGsyLCBlKTtcblx0XHRcdFx0fSlcblx0XHRcdFx0aGVhZGVycy5kZWxldGUoayk7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGssIGsyKTtcblx0XHRcdH1cblx0XHR9KVxuXHR9XG5cblx0cmV0dXJuIG5ldyBQcm9taXNlPHtcblx0XHQvKiogU2hvcnRoYW5kIHRvIGNoZWNrIGlmIHRoZSByZXNwb25zZSBpcyBpbiB0aGUgMnh4IHJhbmdlLiAqL1xuXHRcdG9rOiBib29sZWFuO1xuXHRcdHN0YXR1czogbnVtYmVyO1xuXHRcdHN0YXR1c1RleHQ6IHN0cmluZztcblx0XHRoZWFkZXJzOiBVUkxTZWFyY2hQYXJhbXM7XG5cdFx0cmVzcG9uc2U6XG5cdFx0VFlQRSBleHRlbmRzIFwiYXJyYXlidWZmZXJcIiA/IEFycmF5QnVmZmVyIDpcblx0XHRUWVBFIGV4dGVuZHMgXCJibG9iXCIgPyBCbG9iIDpcblx0XHRUWVBFIGV4dGVuZHMgXCJ0ZXh0XCIgPyBzdHJpbmcgOlxuXHRcdG5ldmVyO1xuXHR9PigocmVzb2x2ZSkgPT4ge1xuXHRcdC8vIGlmIHRoaXMgdGhyb3dzIHN5bmMnbHksIHRoZSBwcm9taXNlIHdpbGwgcmVqZWN0LlxuXG5cdFx0Y29uc3QgdXJsID0gbmV3IFVSTChvcHRpb25zLnVybCwgbG9jYXRpb24uaHJlZik7XG5cdFx0Y29uc3QgcXVlcnkgPSBwYXJhbXNJbnB1dChvcHRpb25zLnF1ZXJ5UGFyYW1zKTtcblx0XHRxdWVyeS5mb3JFYWNoKCh2LCBrKSA9PiB7IHVybC5zZWFyY2hQYXJhbXMuYXBwZW5kKGssIHYpOyB9KTtcblxuXHRcdGNvbnNvbGUubG9nKHVybCwgcXVlcnksIG9wdGlvbnMucXVlcnlQYXJhbXMsIHVybC5ocmVmKTtcblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBwYXJhbXNJbnB1dChvcHRpb25zLmhlYWRlcnMpO1xuXHRcdG5vcm1hbGl6ZUhlYWRlcnMoaGVhZGVycyk7XG5cblx0XHRjb25zdCByZXF1ZXN0ID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG5cdFx0cmVxdWVzdC5yZXNwb25zZVR5cGUgPSBvcHRpb25zLnJlc3BvbnNlVHlwZSB8fCBcInRleHRcIjtcblxuXHRcdHJlcXVlc3Qub3BlbihvcHRpb25zLm1ldGhvZCwgdXJsLCB0cnVlKTtcblxuXG5cdFx0aWYgKCFoZWFkZXJzLmhhcyhcImNvbnRlbnQtdHlwZVwiKSlcblx0XHRcdGhlYWRlcnMuc2V0KFwiY29udGVudC10eXBlXCIsIFwiYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkOyBjaGFyc2V0PVVURi04XCIpO1xuXG5cdFx0aWYgKCFoZWFkZXJzLmhhcyhcIngtcmVxdWVzdGVkLXdpdGhcIikpXG5cdFx0XHRoZWFkZXJzLnNldChcIngtcmVxdWVzdGVkLXdpdGhcIiwgXCJUaWRkbHlXaWtpXCIpO1xuXG5cdFx0aGVhZGVycy5zZXQoXCJhY2NlcHRcIiwgXCJhcHBsaWNhdGlvbi9qc29uXCIpO1xuXG5cblx0XHRoZWFkZXJzLmZvckVhY2goKHYsIGspID0+IHtcblx0XHRcdHJlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcihrLCB2KTtcblx0XHR9KTtcblxuXG5cdFx0cmVxdWVzdC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHRpZiAodGhpcy5yZWFkeVN0YXRlICE9PSA0KSByZXR1cm47XG5cblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdFx0XHRyZXF1ZXN0LmdldEFsbFJlc3BvbnNlSGVhZGVycygpPy50cmltKCkuc3BsaXQoL1tcXHJcXG5dKy8pLmZvckVhY2goKGxpbmUpID0+IHtcblx0XHRcdFx0Y29uc3QgcGFydHMgPSBsaW5lLnNwbGl0KFwiOiBcIik7XG5cdFx0XHRcdGNvbnN0IGhlYWRlciA9IHBhcnRzLnNoaWZ0KCk/LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gcGFydHMuam9pbihcIjogXCIpO1xuXHRcdFx0XHRpZiAoaGVhZGVyKSBoZWFkZXJzLmFwcGVuZChoZWFkZXIsIHZhbHVlKTtcblx0XHRcdH0pO1xuXHRcdFx0cmVzb2x2ZSh7XG5cdFx0XHRcdG9rOiB0aGlzLnN0YXR1cyA+PSAyMDAgJiYgdGhpcy5zdGF0dXMgPCAzMDAsXG5cdFx0XHRcdHN0YXR1czogdGhpcy5zdGF0dXMsXG5cdFx0XHRcdHN0YXR1c1RleHQ6IHRoaXMuc3RhdHVzVGV4dCxcblx0XHRcdFx0cmVzcG9uc2U6IHRoaXMucmVzcG9uc2UsXG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHR9KTtcblxuXHRcdH07XG5cblx0XHRpZiAob3B0aW9ucy5wcm9ncmVzcylcblx0XHRcdHJlcXVlc3Qub25wcm9ncmVzcyA9IG9wdGlvbnMucHJvZ3Jlc3M7XG5cblx0XHRyZXF1ZXN0LnNlbmQob3B0aW9ucy5yZXF1ZXN0Qm9keVN0cmluZyk7XG5cblxuXHR9KTtcblxufVxuXG5cbiJdfQ==