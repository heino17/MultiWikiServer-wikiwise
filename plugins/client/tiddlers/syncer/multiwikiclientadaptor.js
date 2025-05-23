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
            return yield httpRequest(Object.assign(Object.assign({}, options), { responseType: "arraybuffer", url: this.host + "recipes/" + encodeURIComponent(this.recipe) + options.url })).then(result => {
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
            }).then(e => {
                let responseString = "";
                if (e.headers.get("x-gzip-stream") === "yes") {
                    const gunzip = new fflate.Gunzip((chunk) => {
                        responseString += fflate.strFromU8(chunk);
                    });
                    gunzip.push(new Uint8Array(e.response));
                }
                else {
                    responseString = fflate.strFromU8(new Uint8Array(e.response));
                }
                return [true, void 0, Object.assign(Object.assign({}, e), { responseString, 
                        /** this is undefined if status is not 200 */
                        responseJSON: e.status === 200
                            ? tryParseJSON(responseString)
                            : undefined })];
            }, e => [false, e, void 0]);
            function tryParseJSON(data) {
                try {
                    return JSON.parse(data);
                }
                catch (e) {
                    console.error("Error parsing JSON, returning undefined", e);
                    console.log(data);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGl3aWtpY2xpZW50YWRhcHRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tdWx0aXdpa2ljbGllbnRhZGFwdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHO0FBRUgsa0VBQWtFO0FBQ2xFLFlBQVksQ0FBQzs7Ozs7Ozs7Ozs7QUEwSWIsSUFBSSxtQkFBbUIsR0FBRyxnQ0FBZ0MsRUFDekQsb0JBQW9CLEdBQUcscUJBQXFCLEVBQzVDLHdCQUF3QixHQUFHLDJCQUEyQixFQUN0RCxpQkFBaUIsR0FBRyx1Q0FBdUMsRUFDM0Qsc0JBQXNCLEdBQUcsNENBQTRDLEVBQ3JFLHdCQUF3QixHQUFHLHFDQUFxQyxFQUNoRSwrQkFBK0IsR0FBRyxtREFBbUQsRUFDckYsa0JBQWtCLEdBQUcsa0RBQWtELENBQUM7QUFFekUsSUFBSSxvQkFBb0IsR0FBRyxlQUFlLEVBQ3pDLHFCQUFxQixHQUFHLGdCQUFnQixFQUN4QyxvQkFBb0IsR0FBRyxlQUFlLEVBQ3RDLGNBQWMsR0FBRyxnQkFBZ0IsQ0FBQztBQU9uQyxNQUFNLHNCQUFzQjtJQWlCM0IsWUFBWSxPQUFzQjtRQUZsQyxTQUFJLEdBQUcsaUJBQWlCLENBQUM7UUFDakIsd0JBQW1CLEdBQUcsSUFBSSxDQUFDO1FBRWxDLElBQUksQ0FBQyxJQUFJLEdBQUcsT0FBTyxDQUFDLElBQUksQ0FBQztRQUN6QixJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUMzQixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLGtDQUFrQyxDQUFDLENBQUM7UUFDM0UsSUFBSSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLEtBQUssS0FBSyxDQUFDO1FBQ2xGLElBQUksQ0FBQyxzQkFBc0IsR0FBRyxJQUFJLENBQUMs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O1lBQ25CLE9BQU8sQ0FBQyxVQUFVLEdBQUcsT0FBTyxDQUFDLFFBQVEsQ0FBQztRQUV2QyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0lBR3pDLENBQUMsQ0FBQyxDQUFDO0FBRUosQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qXFxcbnRpdGxlOiAkOi9wbHVnaW5zL3RpZGRseXdpa2kvdGlkZGx5d2ViL3RpZGRseXdlYmFkYXB0b3IuanNcbnR5cGU6IGFwcGxpY2F0aW9uL2phdmFzY3JpcHRcbm1vZHVsZS10eXBlOiBzeW5jYWRhcHRvclxuXG5BIHN5bmMgYWRhcHRvciBtb2R1bGUgZm9yIHN5bmNocm9uaXNpbmcgd2l0aCBNdWx0aVdpa2lTZXJ2ZXItY29tcGF0aWJsZSBzZXJ2ZXJzLiBcblxuSXQgaGFzIHRocmVlIGtleSBhcmVhcyBvZiBjb25jZXJuOlxuXG4qIEJhc2ljIG9wZXJhdGlvbnMgbGlrZSBwdXQsIGdldCwgYW5kIGRlbGV0ZSBhIHRpZGRsZXIgb24gdGhlIHNlcnZlclxuKiBSZWFsIHRpbWUgdXBkYXRlcyBmcm9tIHRoZSBzZXJ2ZXIgKGhhbmRsZWQgYnkgU1NFKVxuKiBCYWdzIGFuZCByZWNpcGVzLCB3aGljaCBhcmUgdW5rbm93biB0byB0aGUgc3luY2VyXG5cbkEga2V5IGFzcGVjdCBvZiB0aGUgZGVzaWduIGlzIHRoYXQgdGhlIHN5bmNlciBuZXZlciBvdmVybGFwcyBiYXNpYyBzZXJ2ZXIgb3BlcmF0aW9uczsgaXQgd2FpdHMgZm9yIHRoZVxucHJldmlvdXMgb3BlcmF0aW9uIHRvIGNvbXBsZXRlIGJlZm9yZSBzZW5kaW5nIGEgbmV3IG9uZS5cblxuXFwqL1xuXG4vLyB0aGUgYmxhbmsgbGluZSBpcyBpbXBvcnRhbnQsIGFuZCBzbyBpcyB0aGUgZm9sbG93aW5nIHVzZSBzdHJpY3RcblwidXNlIHN0cmljdFwiO1xuXG5pbXBvcnQgdHlwZSB7IFN5bmNlciwgVGlkZGxlciwgSVRpZGRseVdpa2kgfSBmcm9tIFwidGlkZGx5d2lraVwiO1xuaW1wb3J0IHR5cGUgeyBUaWRkbGVyUm91dGVyIH0gZnJvbSBcIkB0aWRkbHl3aWtpL213cy9zcmMvcm91dGVzL21hbmFnZXJzL3JvdXRlci10aWRkbGVyc1wiO1xuaW1wb3J0IHR5cGUgeyBab2RSb3V0ZSB9IGZyb20gXCJAdGlkZGx5d2lraS9td3Mvc3JjL3JvdXRlclwiO1xuXG5kZWNsYXJlIGdsb2JhbCB7XG5cdGNvbnN0IGZmbGF0ZTogdHlwZW9mIGltcG9ydChcImZmbGF0ZVwiKTtcbn1cblxuZGVjbGFyZSBjbGFzcyBMb2dnZXIge1xuXHRjb25zdHJ1Y3Rvcihjb21wb25lbnROYW1lOiBhbnksIG9wdGlvbnM6IGFueSk7XG5cdGNvbXBvbmVudE5hbWU6IGFueTtcblx0Y29sb3VyOiBhbnk7XG5cdGVuYWJsZTogYW55O1xuXHRzYXZlOiBhbnk7XG5cdHNhdmVMaW1pdDogYW55O1xuXHRzYXZlQnVmZmVyTG9nZ2VyOiB0aGlzO1xuXHRidWZmZXI6IHN0cmluZztcblx0YWxlcnRDb3VudDogbnVtYmVyO1xuXHRzZXRTYXZlQnVmZmVyKGxvZ2dlcjogYW55KTogdm9pZDtcblx0bG9nKC4uLmFyZ3M6IGFueVtdKTogYW55O1xuXHRnZXRCdWZmZXIoKTogc3RyaW5nO1xuXHR0YWJsZSh2YWx1ZTogYW55KTogdm9pZDtcblx0YWxlcnQoLi4uYXJnczogYW55W10pOiB2b2lkO1xuXHRjbGVhckFsZXJ0cygpOiB2b2lkO1xufVxuXG50eXBlIFRpZGRsZXJSb3V0ZXJSZXNwb25zZSA9IHtcblx0W0sgaW4ga2V5b2YgVGlkZGxlclJvdXRlcl06IFRpZGRsZXJSb3V0ZXJbS10gZXh0ZW5kcyBab2RSb3V0ZTxpbmZlciBNLCBpbmZlciBCLCBpbmZlciBQLCBpbmZlciBRLCBpbmZlciBULCBpbmZlciBSPlxuXHQ/IHsgTTogTSwgQjogQiwgUDogUCwgUTogUSwgVDogVCwgUjogUiB9XG5cdDogbmV2ZXJcbn1cblxuZGVjbGFyZSBtb2R1bGUgJ3RpZGRseXdpa2knIHtcblx0ZXhwb3J0IGludGVyZmFjZSBTeW5jZXIge1xuXHRcdHdpa2k6IFdpa2k7XG5cdFx0bG9nZ2VyOiBMb2dnZXI7XG5cdFx0dGlkZGxlckluZm86IFJlY29yZDxzdHJpbmcsIHsgYmFnOiBzdHJpbmc7IHJldmlzaW9uOiBzdHJpbmcgfT47XG5cdFx0ZW5xdWV1ZUxvYWRUaWRkbGVyKHRpdGxlOiBzdHJpbmcpOiB2b2lkO1xuXHRcdHN0b3JlVGlkZGxlcih0aWRkbGVyOiBUaWRkbGVyKTogdm9pZDtcblx0XHRwcm9jZXNzVGFza1F1ZXVlKCk6IHZvaWQ7XG5cdH1cblx0aW50ZXJmYWNlIElUaWRkbHlXaWtpIHtcblx0XHRicm93c2VyU3RvcmFnZTogYW55O1xuXHR9XG59XG5cbnR5cGUgU2VydmVyU3RhdHVzQ2FsbGJhY2sgPSAoXG5cdGVycjogYW55LFxuXHQvKiogXG5cdCAqICQ6L3N0YXR1cy9Jc0xvZ2dlZEluIG1vc3RseSBhcHBlYXJzIGFsb25nc2lkZSB0aGUgdXNlcm5hbWUgXG5cdCAqIG9yIG90aGVyIGxvZ2luLWNvbmRpdGlvbmFsIGJlaGF2aW9yLiBcblx0ICovXG5cdGlzTG9nZ2VkSW4/OiBib29sZWFuLFxuXHQvKipcblx0ICogJDovc3RhdHVzL1VzZXJOYW1lIGlzIHN0aWxsIHVzZWQgZm9yIHRoaW5ncyBsaWtlIGRyYWZ0cyBldmVuIGlmIHRoZSBcblx0ICogdXNlciBpc24ndCBsb2dnZWQgaW4sIGFsdGhvdWdoIHRoZSB1c2VybmFtZSBpcyBsZXNzIGxpa2VseSB0byBiZSBzaG93biBcblx0ICogdG8gdGhlIHVzZXIuIFxuXHQgKi9cblx0dXNlcm5hbWU/OiBzdHJpbmcsXG5cdC8qKiBcblx0ICogJDovc3RhdHVzL0lzUmVhZE9ubHkgcHV0cyB0aGUgVUkgaW4gcmVhZG9ubHkgbW9kZSwgXG5cdCAqIGJ1dCBkb2VzIG5vdCBwcmV2ZW50IGF1dG9tYXRpYyBjaGFuZ2VzIGZyb20gYXR0ZW1wdGluZyB0byBzYXZlLiBcblx0ICovXG5cdGlzUmVhZE9ubHk/OiBib29sZWFuLFxuXHQvKiogXG5cdCAqICQ6L3N0YXR1cy9Jc0Fub255bW91cyBkb2VzIG5vdCBhcHBlYXIgYW55d2hlcmUgaW4gdGhlIFRXNSByZXBvISBcblx0ICogU28gaXQgaGFzIG5vIGFwcGFyZW50IHB1cnBvc2UuIFxuXHQgKi9cblx0aXNBbm9ueW1vdXM/OiBib29sZWFuXG4pID0+IHZvaWRcblxuaW50ZXJmYWNlIFN5bmNBZGFwdG9yPEFEPiB7XG5cdG5hbWU/OiBzdHJpbmc7XG5cblx0aXNSZWFkeT8oKTogYm9vbGVhbjtcblxuXHRnZXRTdGF0dXM/KFxuXHRcdGNiOiBTZXJ2ZXJTdGF0dXNDYWxsYmFja1xuXHQpOiB2b2lkO1xuXG5cdGdldFNraW5ueVRpZGRsZXJzPyhcblx0XHRjYjogKGVycjogYW55LCB0aWRkbGVyRmllbGRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+W10pID0+IHZvaWRcblx0KTogdm9pZDtcblx0Z2V0VXBkYXRlZFRpZGRsZXJzPyhcblx0XHRzeW5jZXI6IFN5bmNlcixcblx0XHRjYjogKFxuXHRcdFx0ZXJyOiBhbnksXG5cdFx0XHQvKiogQXJyYXlzIG9mIHRpdGxlcyB0aGF0IGhhdmUgYmVlbiBtb2RpZmllZCBvciBkZWxldGVkICovXG5cdFx0XHR1cGRhdGVzPzogeyBtb2RpZmljYXRpb25zOiBzdHJpbmdbXSwgZGVsZXRpb25zOiBzdHJpbmdbXSB9XG5cdFx0KSA9PiB2b2lkXG5cdCk6IHZvaWQ7XG5cblx0LyoqIFxuXHQgKiB1c2VkIHRvIG92ZXJyaWRlIHRoZSBkZWZhdWx0IFN5bmNlciBnZXRUaWRkbGVyUmV2aXNpb24gYmVoYXZpb3Jcblx0ICogb2YgcmV0dXJuaW5nIHRoZSByZXZpc2lvbiBmaWVsZFxuXHQgKiBcblx0ICovXG5cdGdldFRpZGRsZXJSZXZpc2lvbj8odGl0bGU6IHN0cmluZyk6IHN0cmluZztcblx0LyoqIFxuXHQgKiB1c2VkIHRvIGdldCB0aGUgYWRhcHRlciBpbmZvIGZyb20gYSB0aWRkbGVyIGluIHNpdHVhdGlvbnNcblx0ICogb3RoZXIgdGhhbiB0aGUgc2F2ZVRpZGRsZXIgY2FsbGJhY2tcblx0ICovXG5cdGdldFRpZGRsZXJJbmZvKHRpZGRsZXI6IFRpZGRsZXIpOiBBRCB8IHVuZGVmaW5lZDtcblxuXHRzYXZlVGlkZGxlcihcblx0XHR0aWRkbGVyOiBhbnksXG5cdFx0Y2I6IChcblx0XHRcdGVycjogYW55LFxuXHRcdFx0YWRhcHRvckluZm8/OiBBRCxcblx0XHRcdHJldmlzaW9uPzogc3RyaW5nXG5cdFx0KSA9PiB2b2lkLFxuXHRcdGV4dHJhOiB7IHRpZGRsZXJJbmZvOiBTeW5jZXJUaWRkbGVySW5mbzxBRD4gfVxuXHQpOiB2b2lkO1xuXG5cdHNldExvZ2dlclNhdmVCdWZmZXI/OiAobG9nZ2VyRm9yU2F2aW5nOiBMb2dnZXIpID0+IHZvaWQ7XG5cdGRpc3BsYXlMb2dpblByb21wdD8oc3luY2VyOiBTeW5jZXIpOiB2b2lkO1xuXHRsb2dpbj8odXNlcm5hbWU6IHN0cmluZywgcGFzc3dvcmQ6IHN0cmluZywgY2I6IChlcnI6IGFueSkgPT4gdm9pZCk6IHZvaWQ7XG5cdGxvZ291dD8oY2I6IChlcnI6IGFueSkgPT4gdm9pZCk6IGFueTtcbn1cbmludGVyZmFjZSBTeW5jZXJUaWRkbGVySW5mbzxBRD4ge1xuXHQvKiogdGhpcyBjb21lcyBmcm9tIHRoZSB3aWtpIGNoYW5nZUNvdW50IHJlY29yZCAqL1xuXHRjaGFuZ2VDb3VudDogbnVtYmVyO1xuXHQvKiogQWRhcHRlciBpbmZvIHJldHVybmVkIGJ5IHRoZSBzeW5jIGFkYXB0ZXIgKi9cblx0YWRhcHRvckluZm86IEFEO1xuXHQvKiogUmV2aXNpb24gcmV0dXJuIGJ5IHRoZSBzeW5jIGFkYXB0ZXIgKi9cblx0cmV2aXNpb246IHN0cmluZztcblx0LyoqIFRpbWVzdGFtcCBzZXQgaW4gdGhlIGNhbGxiYWNrIG9mIHRoZSBwcmV2aW91cyBzYXZlICovXG5cdHRpbWVzdGFtcExhc3RTYXZlZDogRGF0ZTtcbn1cblxuZGVjbGFyZSBjb25zdCAkdHc6IGFueTtcblxuZGVjbGFyZSBjb25zdCBleHBvcnRzOiB7XG5cdGFkYXB0b3JDbGFzczogdHlwZW9mIE11bHRpV2lraUNsaWVudEFkYXB0b3I7XG59O1xuXG52YXIgQ09ORklHX0hPU1RfVElERExFUiA9IFwiJDovY29uZmlnL211bHRpd2lraWNsaWVudC9ob3N0XCIsXG5cdERFRkFVTFRfSE9TVF9USURETEVSID0gXCIkcHJvdG9jb2wkLy8kaG9zdCQvXCIsXG5cdE1XQ19TVEFURV9USURETEVSX1BSRUZJWCA9IFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L1wiLFxuXHRCQUdfU1RBVEVfVElERExFUiA9IFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L3RpZGRsZXJzL2JhZ1wiLFxuXHRSRVZJU0lPTl9TVEFURV9USURETEVSID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvdGlkZGxlcnMvcmV2aXNpb25cIixcblx0Q09OTkVDVElPTl9TVEFURV9USURETEVSID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvY29ubmVjdGlvblwiLFxuXHRJTkNPTUlOR19VUERBVEVTX0ZJTFRFUl9USURETEVSID0gXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L2luY29taW5nLXVwZGF0ZXMtZmlsdGVyXCIsXG5cdEVOQUJMRV9TU0VfVElERExFUiA9IFwiJDovY29uZmlnL211bHRpd2lraWNsaWVudC91c2Utc2VydmVyLXNlbnQtZXZlbnRzXCI7XG5cbnZhciBTRVJWRVJfTk9UX0NPTk5FQ1RFRCA9IFwiTk9UIENPTk5FQ1RFRFwiLFxuXHRTRVJWRVJfQ09OTkVDVElOR19TU0UgPSBcIkNPTk5FQ1RJTkcgU1NFXCIsXG5cdFNFUlZFUl9DT05ORUNURURfU1NFID0gXCJDT05ORUNURUQgU1NFXCIsXG5cdFNFUlZFUl9QT0xMSU5HID0gXCJTRVJWRVIgUE9MTElOR1wiO1xuXG5pbnRlcmZhY2UgTVdTQWRhcHRvckluZm8ge1xuXHRiYWc6IHN0cmluZ1xufVxuXG5cbmNsYXNzIE11bHRpV2lraUNsaWVudEFkYXB0b3IgaW1wbGVtZW50cyBTeW5jQWRhcHRvcjxNV1NBZGFwdG9ySW5mbz4ge1xuXHRwcml2YXRlIHdpa2k7XG5cdHByaXZhdGUgaG9zdDtcblx0cHJpdmF0ZSByZWNpcGU7XG5cdHByaXZhdGUgdXNlU2VydmVyU2VudEV2ZW50cztcblx0cHJpdmF0ZSBsYXN0X2tub3duX3JldmlzaW9uX2lkO1xuXHRwcml2YXRlIG91dHN0YW5kaW5nUmVxdWVzdHM7XG5cdHByaXZhdGUgbGFzdFJlY29yZGVkVXBkYXRlO1xuXHRwcml2YXRlIGxvZ2dlcjtcblx0cHJpdmF0ZSBpc0xvZ2dlZEluO1xuXHRwcml2YXRlIGlzUmVhZE9ubHk7XG5cdHByaXZhdGUgdXNlcm5hbWU7XG5cdHByaXZhdGUgaW5jb21pbmdVcGRhdGVzRmlsdGVyRm47XG5cdHByaXZhdGUgc2VydmVyVXBkYXRlQ29ubmVjdGlvblN0YXR1cyE6IHN0cmluZztcblxuXHRuYW1lID0gXCJtdWx0aXdpa2ljbGllbnRcIjtcblx0cHJpdmF0ZSBzdXBwb3J0c0xhenlMb2FkaW5nID0gdHJ1ZTtcblx0Y29uc3RydWN0b3Iob3B0aW9uczogeyB3aWtpOiBhbnkgfSkge1xuXHRcdHRoaXMud2lraSA9IG9wdGlvbnMud2lraTtcblx0XHR0aGlzLmhvc3QgPSB0aGlzLmdldEhvc3QoKTtcblx0XHR0aGlzLnJlY2lwZSA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChcIiQ6L2NvbmZpZy9tdWx0aXdpa2ljbGllbnQvcmVjaXBlXCIpO1xuXHRcdHRoaXMudXNlU2VydmVyU2VudEV2ZW50cyA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChFTkFCTEVfU1NFX1RJRERMRVIpID09PSBcInllc1wiO1xuXHRcdHRoaXMubGFzdF9rbm93bl9yZXZpc2lvbl9pZCA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC9yZWNpcGUvbGFzdF9yZXZpc2lvbl9pZFwiLCBcIjBcIilcblx0XHR0aGlzLm91dHN0YW5kaW5nUmVxdWVzdHMgPSBPYmplY3QuY3JlYXRlKG51bGwpOyAvLyBIYXNobWFwIGJ5IHRpdGxlIG9mIG91dHN0YW5kaW5nIHJlcXVlc3Qgb2JqZWN0OiB7dHlwZTogXCJQVVRcInxcIkdFVFwifFwiREVMRVRFXCJ9XG5cdFx0dGhpcy5sYXN0UmVjb3JkZWRVcGRhdGUgPSBPYmplY3QuY3JlYXRlKG51bGwpOyAvLyBIYXNobWFwIGJ5IHRpdGxlIG9mIGxhc3QgcmVjb3JkZWQgdXBkYXRlIHZpYSBTU0U6IHt0eXBlOiBcInVwZGF0ZVwifFwiZGV0ZXRpb25cIiwgcmV2aXNpb25faWQ6fVxuXHRcdHRoaXMubG9nZ2VyID0gbmV3ICR0dy51dGlscy5Mb2dnZXIoXCJNdWx0aVdpa2lDbGllbnRBZGFwdG9yXCIpO1xuXHRcdHRoaXMuaXNMb2dnZWRJbiA9IGZhbHNlO1xuXHRcdHRoaXMuaXNSZWFkT25seSA9IGZhbHNlO1xuXHRcdHRoaXMudXNlcm5hbWUgPSBcIlwiO1xuXHRcdC8vIENvbXBpbGUgdGhlIGRpcnR5IHRpZGRsZXIgZmlsdGVyXG5cdFx0dGhpcy5pbmNvbWluZ1VwZGF0ZXNGaWx0ZXJGbiA9IHRoaXMud2lraS5jb21waWxlRmlsdGVyKHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChJTkNPTUlOR19VUERBVEVTX0ZJTFRFUl9USURETEVSKSk7XG5cdFx0dGhpcy5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9OT1RfQ09OTkVDVEVEKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhzdGF0dXM6IHN0cmluZykge1xuXHRcdHRoaXMuc2VydmVyVXBkYXRlQ29ubmVjdGlvblN0YXR1cyA9IHN0YXR1cztcblx0XHR0aGlzLndpa2kuYWRkVGlkZGxlcih7XG5cdFx0XHR0aXRsZTogQ09OTkVDVElPTl9TVEFURV9USURETEVSLFxuXHRcdFx0dGV4dDogc3RhdHVzXG5cdFx0fSk7XG5cdH1cblx0c2V0TG9nZ2VyU2F2ZUJ1ZmZlcihsb2dnZXJGb3JTYXZpbmc6IExvZ2dlcikge1xuXHRcdHRoaXMubG9nZ2VyLnNldFNhdmVCdWZmZXIobG9nZ2VyRm9yU2F2aW5nKTtcblx0fVxuXHRpc1JlYWR5KCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHByaXZhdGUgZ2V0SG9zdCgpIHtcblx0XHR2YXIgdGV4dCA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChDT05GSUdfSE9TVF9USURETEVSLCBERUZBVUxUX0hPU1RfVElERExFUiksIHN1YnN0aXR1dGlvbnMgPSBbXG5cdFx0XHR7IG5hbWU6IFwicHJvdG9jb2xcIiwgdmFsdWU6IGRvY3VtZW50LmxvY2F0aW9uLnByb3RvY29sIH0sXG5cdFx0XHR7IG5hbWU6IFwiaG9zdFwiLCB2YWx1ZTogZG9jdW1lbnQubG9jYXRpb24uaG9zdCB9LFxuXHRcdFx0eyBuYW1lOiBcInBhdGhuYW1lXCIsIHZhbHVlOiBkb2N1bWVudC5sb2NhdGlvbi5wYXRobmFtZSB9XG5cdFx0XTtcblx0XHRmb3IgKHZhciB0ID0gMDsgdCA8IHN1YnN0aXR1dGlvbnMubGVuZ3RoOyB0KyspIHtcblx0XHRcdHZhciBzID0gc3Vic3RpdHV0aW9uc1t0XTtcblx0XHRcdHRleHQgPSAkdHcudXRpbHMucmVwbGFjZVN0cmluZyh0ZXh0LCBuZXcgUmVnRXhwKFwiXFxcXCRcIiArIHMubmFtZSArIFwiXFxcXCRcIiwgXCJtZ1wiKSwgcy52YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWNpcGVSZXF1ZXN0PEtFWSBleHRlbmRzIChzdHJpbmcgJiBrZXlvZiBUaWRkbGVyUm91dGVyUmVzcG9uc2UpPihcblx0XHRvcHRpb25zOiBPbWl0PEh0dHBSZXF1ZXN0T3B0aW9uczxcImFycmF5YnVmZmVyXCI+LCBcInJlc3BvbnNlVHlwZVwiPiAmIHsga2V5OiBLRVkgfVxuXHQpIHtcblx0XHRpZiAoIW9wdGlvbnMudXJsLnN0YXJ0c1dpdGgoXCIvXCIpKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiVGhlIHVybCBkb2VzIG5vdCBzdGFydCB3aXRoIGEgc2xhc2hcIik7XG5cblx0XHRyZXR1cm4gYXdhaXQgaHR0cFJlcXVlc3Qoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdHJlc3BvbnNlVHlwZTogXCJhcnJheWJ1ZmZlclwiLFxuXHRcdFx0dXJsOiB0aGlzLmhvc3QgKyBcInJlY2lwZXMvXCIgKyBlbmNvZGVVUklDb21wb25lbnQodGhpcy5yZWNpcGUpICsgb3B0aW9ucy51cmwsXG5cdFx0fSkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0Ly8gaW4gdGhlb3J5LCA0MDMgYW5kIDQwNCBzaG91bGQgcmVzdWx0IGluIGZ1cnRoZXIgYWN0aW9uLCBcblx0XHRcdC8vIGJ1dCBpbiByZWFsaXR5IGFuIGVycm9yIGdldHMgbG9nZ2VkIHRvIGNvbnNvbGUgYW5kIHRoYXQncyBpdC5cblx0XHRcdGlmICghcmVzdWx0Lm9rKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFx0XHRgVGhlIHNlcnZlciByZXR1cm4gYSBzdGF0dXMgY29kZSAke3Jlc3VsdC5zdGF0dXN9IHdpdGggdGhlIGZvbGxvd2luZyByZWFzb246IGBcblx0XHRcdFx0XHQrIGAke3Jlc3VsdC5oZWFkZXJzLmdldChcIngtcmVhc29uXCIpID8/IFwiKG5vIHJlYXNvbiBnaXZlbilcIn1gXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH0pLnRoZW4oZSA9PiB7XG5cdFx0XHRsZXQgcmVzcG9uc2VTdHJpbmc6IHN0cmluZyA9IFwiXCI7XG5cdFx0XHRpZiAoZS5oZWFkZXJzLmdldChcIngtZ3ppcC1zdHJlYW1cIikgPT09IFwieWVzXCIpIHtcblx0XHRcdFx0Y29uc3QgZ3VuemlwID0gbmV3IGZmbGF0ZS5HdW56aXAoKGNodW5rKSA9PiB7XG5cdFx0XHRcdFx0cmVzcG9uc2VTdHJpbmcgKz0gZmZsYXRlLnN0ckZyb21VOChjaHVuayk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRndW56aXAucHVzaChuZXcgVWludDhBcnJheShlLnJlc3BvbnNlKSlcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3BvbnNlU3RyaW5nID0gZmZsYXRlLnN0ckZyb21VOChcblx0XHRcdFx0XHRuZXcgVWludDhBcnJheShlLnJlc3BvbnNlKVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gW3RydWUsIHZvaWQgMCwge1xuXHRcdFx0XHQuLi5lLFxuXHRcdFx0XHRyZXNwb25zZVN0cmluZyxcblx0XHRcdFx0LyoqIHRoaXMgaXMgdW5kZWZpbmVkIGlmIHN0YXR1cyBpcyBub3QgMjAwICovXG5cdFx0XHRcdHJlc3BvbnNlSlNPTjogZS5zdGF0dXMgPT09IDIwMFxuXHRcdFx0XHRcdD8gdHJ5UGFyc2VKU09OKHJlc3BvbnNlU3RyaW5nKSBhcyBUaWRkbGVyUm91dGVyUmVzcG9uc2VbS0VZXVtcIlJcIl1cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdH1dIGFzIGNvbnN0O1xuXHRcdH0sIGUgPT4gW2ZhbHNlLCBlLCB2b2lkIDBdIGFzIGNvbnN0KTtcblxuXHRcdGZ1bmN0aW9uIHRyeVBhcnNlSlNPTihkYXRhOiBzdHJpbmcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBKU09OLnBhcnNlKGRhdGEpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKFwiRXJyb3IgcGFyc2luZyBKU09OLCByZXR1cm5pbmcgdW5kZWZpbmVkXCIsIGUpO1xuXHRcdFx0XHRjb25zb2xlLmxvZyhkYXRhKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0fVxuXG5cdGdldFRpZGRsZXJJbmZvKHRpZGRsZXI6IFRpZGRsZXIpIHtcblx0XHR2YXIgdGl0bGUgPSB0aWRkbGVyLmZpZWxkcy50aXRsZSxcblx0XHRcdHJldmlzaW9uID0gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oUkVWSVNJT05fU1RBVEVfVElERExFUiwgdGl0bGUpLFxuXHRcdFx0YmFnID0gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oQkFHX1NUQVRFX1RJRERMRVIsIHRpdGxlKTtcblx0XHRpZiAocmV2aXNpb24gJiYgYmFnKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0aXRsZTogdGl0bGUsXG5cdFx0XHRcdHJldmlzaW9uOiByZXZpc2lvbixcblx0XHRcdFx0YmFnOiBiYWdcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cdHByaXZhdGUgZ2V0VGlkZGxlckJhZyh0aXRsZTogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMud2lraS5leHRyYWN0VGlkZGxlckRhdGFJdGVtKEJBR19TVEFURV9USURETEVSLCB0aXRsZSk7XG5cdH1cblx0Z2V0VGlkZGxlclJldmlzaW9uKHRpdGxlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oUkVWSVNJT05fU1RBVEVfVElERExFUiwgdGl0bGUpO1xuXHR9XG5cdHByaXZhdGUgc2V0VGlkZGxlckluZm8odGl0bGU6IHN0cmluZywgcmV2aXNpb246IHN0cmluZywgYmFnOiBzdHJpbmcpIHtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChCQUdfU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIGJhZywgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChSRVZJU0lPTl9TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgcmV2aXNpb24sIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdH1cblx0cHJpdmF0ZSByZW1vdmVUaWRkbGVySW5mbyh0aXRsZTogc3RyaW5nKSB7XG5cdFx0dGhpcy53aWtpLnNldFRleHQoQkFHX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCB1bmRlZmluZWQsIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdFx0dGhpcy53aWtpLnNldFRleHQoUkVWSVNJT05fU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIHVuZGVmaW5lZCwgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0fVxuXG5cdC8qXG5cdEdldCB0aGUgY3VycmVudCBzdGF0dXMgb2YgdGhlIHNlcnZlciBjb25uZWN0aW9uXG5cdCovXG5cdGFzeW5jIGdldFN0YXR1cyhjYWxsYmFjazogU2VydmVyU3RhdHVzQ2FsbGJhY2spIHtcblxuXHRcdGNvbnN0IFtvaywgZXJyb3IsIGRhdGFdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdGtleTogXCJoYW5kbGVHZXRSZWNpcGVTdGF0dXNcIixcblx0XHRcdG1ldGhvZDogXCJHRVRcIixcblx0XHRcdHVybDogXCIvc3RhdHVzXCIsXG5cdFx0fSk7XG5cdFx0aWYgKCFvaykge1xuXHRcdFx0dGhpcy5sb2dnZXIubG9nKFwiRXJyb3IgZ2V0dGluZyBzdGF0dXNcIiwgZXJyb3IpO1xuXHRcdFx0aWYgKGNhbGxiYWNrKSBjYWxsYmFjayhlcnJvcik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXR1cyA9IGRhdGEucmVzcG9uc2VKU09OO1xuXHRcdHRoaXMuaXNSZWFkT25seSA9IHN0YXR1cz8uaXNSZWFkT25seSA/PyB0cnVlO1xuXHRcdHRoaXMuaXNMb2dnZWRJbiA9IHN0YXR1cz8uaXNMb2dnZWRJbiA/PyBmYWxzZTtcblx0XHR0aGlzLnVzZXJuYW1lID0gc3RhdHVzPy51c2VybmFtZSA/PyBcIihhbm9uKVwiO1xuXHRcdGlmIChjYWxsYmFjaykge1xuXHRcdFx0Y2FsbGJhY2soXG5cdFx0XHRcdC8vIEVycm9yXG5cdFx0XHRcdG51bGwsXG5cdFx0XHRcdC8vIElzIGxvZ2dlZCBpblxuXHRcdFx0XHR0aGlzLmlzTG9nZ2VkSW4sXG5cdFx0XHRcdC8vIFVzZXJuYW1lXG5cdFx0XHRcdHRoaXMudXNlcm5hbWUsXG5cdFx0XHRcdC8vIElzIHJlYWQgb25seVxuXHRcdFx0XHR0aGlzLmlzUmVhZE9ubHksXG5cdFx0XHRcdC8vIElzIGFub255bW91c1xuXHRcdFx0XHQvLyBubyBpZGVhIHdoYXQgdGhpcyBtZWFucywgYWx3YXlzIHJldHVybiBmYWxzZVxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cdC8qXG5cdEdldCBkZXRhaWxzIG9mIGNoYW5nZWQgdGlkZGxlcnMgZnJvbSB0aGUgc2VydmVyXG5cdCovXG5cdGdldFVwZGF0ZWRUaWRkbGVycyhzeW5jZXI6IFN5bmNlciwgY2FsbGJhY2s6IChlcnI6IGFueSwgY2hhbmdlcz86IHsgbW9kaWZpY2F0aW9uczogc3RyaW5nW107IGRlbGV0aW9uczogc3RyaW5nW10gfSkgPT4gdm9pZCkge1xuXHRcdGlmICghdGhpcy51c2VTZXJ2ZXJTZW50RXZlbnRzKSB7XG5cdFx0XHR0aGlzLnBvbGxTZXJ2ZXIoKS50aGVuKGNoYW5nZXMgPT4ge1xuXHRcdFx0XHRjYWxsYmFjayhudWxsLCBjaGFuZ2VzKTtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gSWYgQnJvd3N3ZXIgU3RvcmFnZSB0aWRkbGVycyB3ZXJlIGNhY2hlZCBvbiByZWxvYWRpbmcgdGhlIHdpa2ksIGFkZCB0aGVtIGFmdGVyIHN5bmMgZnJvbSBzZXJ2ZXIgY29tcGxldGVzIGluIHRoZSBhYm92ZSBjYWxsYmFjay5cblx0XHRcdFx0XHRpZiAoJHR3LmJyb3dzZXJTdG9yYWdlICYmICR0dy5icm93c2VyU3RvcmFnZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdFx0JHR3LmJyb3dzZXJTdG9yYWdlLmFkZENhY2hlZFRpZGRsZXJzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sIGVyciA9PiB7XG5cdFx0XHRcdGNhbGxiYWNrKGVycik7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0Ly8gRG8gbm90aGluZyBpZiB0aGVyZSdzIGFscmVhZHkgYSBjb25uZWN0aW9uIGluIHByb2dyZXNzLlxuXHRcdGlmICh0aGlzLnNlcnZlclVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMgIT09IFNFUlZFUl9OT1RfQ09OTkVDVEVEKSB7XG5cdFx0XHRyZXR1cm4gY2FsbGJhY2sobnVsbCwge1xuXHRcdFx0XHRtb2RpZmljYXRpb25zOiBbXSxcblx0XHRcdFx0ZGVsZXRpb25zOiBbXVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdC8vIFRyeSB0byBjb25uZWN0IGEgc2VydmVyIHN0cmVhbVxuXHRcdHRoaXMuc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhTRVJWRVJfQ09OTkVDVElOR19TU0UpO1xuXHRcdHRoaXMuY29ubmVjdFNlcnZlclN0cmVhbSh7XG5cdFx0XHRzeW5jZXI6IHN5bmNlcixcblx0XHRcdG9uZXJyb3I6IGFzeW5jIGZ1bmN0aW9uIChlcnIpIHtcblx0XHRcdFx0c2VsZi5sb2dnZXIubG9nKFwiRXJyb3IgY29ubmVjdGluZyBTU0Ugc3RyZWFtXCIsIGVycik7XG5cdFx0XHRcdC8vIElmIHRoZSBzdHJlYW0gZGlkbid0IHdvcmssIHRyeSBwb2xsaW5nXG5cdFx0XHRcdHNlbGYuc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhTRVJWRVJfUE9MTElORyk7XG5cdFx0XHRcdGNvbnN0IGNoYW5nZXMgPSBhd2FpdCBzZWxmLnBvbGxTZXJ2ZXIoKTtcblx0XHRcdFx0c2VsZi5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9OT1RfQ09OTkVDVEVEKTtcblx0XHRcdFx0Y2FsbGJhY2sobnVsbCwgY2hhbmdlcyk7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdC8vIElmIEJyb3dzd2VyIFN0b3JhZ2UgdGlkZGxlcnMgd2VyZSBjYWNoZWQgb24gcmVsb2FkaW5nIHRoZSB3aWtpLCBhZGQgdGhlbSBhZnRlciBzeW5jIGZyb20gc2VydmVyIGNvbXBsZXRlcyBpbiB0aGUgYWJvdmUgY2FsbGJhY2suXG5cdFx0XHRcdFx0aWYgKCR0dy5icm93c2VyU3RvcmFnZSAmJiAkdHcuYnJvd3NlclN0b3JhZ2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0XHRcdCR0dy5icm93c2VyU3RvcmFnZS5hZGRDYWNoZWRUaWRkbGVycygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0b25vcGVuOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHNlbGYuc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhTRVJWRVJfQ09OTkVDVEVEX1NTRSk7XG5cdFx0XHRcdC8vIFRoZSBzeW5jZXIgaXMgZXhwZWN0aW5nIGEgY2FsbGJhY2sgYnV0IHdlIGRvbid0IGhhdmUgYW55IGRhdGEgdG8gc2VuZFxuXHRcdFx0XHRjYWxsYmFjayhudWxsLCB7XG5cdFx0XHRcdFx0bW9kaWZpY2F0aW9uczogW10sXG5cdFx0XHRcdFx0ZGVsZXRpb25zOiBbXVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHR9XG5cdC8qXG5cdEF0dGVtcHQgdG8gZXN0YWJsaXNoIGFuIFNTRSBzdHJlYW0gd2l0aCB0aGUgc2VydmVyIGFuZCB0cmFuc2ZlciB0aWRkbGVyIGNoYW5nZXMuIE9wdGlvbnMgaW5jbHVkZTpcbiAgXG5cdHN5bmNlcjogcmVmZXJlbmNlIHRvIHN5bmNlciBvYmplY3QgdXNlZCBmb3Igc3RvcmluZyBkYXRhXG5cdG9ub3BlbjogaW52b2tlZCB3aGVuIHRoZSBzdHJlYW0gaXMgc3VjY2Vzc2Z1bGx5IG9wZW5lZFxuXHRvbmVycm9yOiBpbnZva2VkIGlmIHRoZXJlIGlzIGFuIGVycm9yXG5cdCovXG5cdHByaXZhdGUgY29ubmVjdFNlcnZlclN0cmVhbShvcHRpb25zOiB7XG5cdFx0c3luY2VyOiBTeW5jZXI7XG5cdFx0b25vcGVuOiAoZXZlbnQ6IEV2ZW50KSA9PiB2b2lkO1xuXHRcdG9uZXJyb3I6IChldmVudDogRXZlbnQpID0+IHZvaWQ7XG5cdH0pIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0Y29uc3QgZXZlbnRTb3VyY2UgPSBuZXcgRXZlbnRTb3VyY2UoXCIvcmVjaXBlcy9cIiArIHRoaXMucmVjaXBlICsgXCIvZXZlbnRzP2xhc3Rfa25vd25fcmV2aXNpb25faWQ9XCIgKyB0aGlzLmxhc3Rfa25vd25fcmV2aXNpb25faWQpO1xuXHRcdGV2ZW50U291cmNlLm9uZXJyb3IgPSBmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHRcdGlmIChvcHRpb25zLm9uZXJyb3IpIHtcblx0XHRcdFx0b3B0aW9ucy5vbmVycm9yKGV2ZW50KTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGV2ZW50U291cmNlLm9ub3BlbiA9IGZ1bmN0aW9uIChldmVudCkge1xuXHRcdFx0aWYgKG9wdGlvbnMub25vcGVuKSB7XG5cdFx0XHRcdG9wdGlvbnMub25vcGVuKGV2ZW50KTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGV2ZW50U291cmNlLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgZnVuY3Rpb24gKGV2ZW50KSB7XG5cblx0XHRcdGNvbnN0IGRhdGE6IHtcblx0XHRcdFx0dGl0bGU6IHN0cmluZztcblx0XHRcdFx0cmV2aXNpb25faWQ6IG51bWJlcjtcblx0XHRcdFx0aXNfZGVsZXRlZDogYm9vbGVhbjtcblx0XHRcdFx0YmFnX25hbWU6IHN0cmluZztcblx0XHRcdFx0dGlkZGxlcjogYW55O1xuXHRcdFx0fSA9ICR0dy51dGlscy5wYXJzZUpTT05TYWZlKGV2ZW50LmRhdGEpO1xuXHRcdFx0aWYgKCFkYXRhKSByZXR1cm47XG5cblx0XHRcdGNvbnNvbGUubG9nKFwiU1NFIGRhdGFcIiwgZGF0YSk7XG5cdFx0XHQvLyBVcGRhdGUgbGFzdCBzZWVuIHJldmlzaW9uX2lkXG5cdFx0XHRpZiAoZGF0YS5yZXZpc2lvbl9pZCA+IHNlbGYubGFzdF9rbm93bl9yZXZpc2lvbl9pZCkge1xuXHRcdFx0XHRzZWxmLmxhc3Rfa25vd25fcmV2aXNpb25faWQgPSBkYXRhLnJldmlzaW9uX2lkO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUmVjb3JkIHRoZSBsYXN0IHVwZGF0ZSB0byB0aGlzIHRpZGRsZXJcblx0XHRcdHNlbGYubGFzdFJlY29yZGVkVXBkYXRlW2RhdGEudGl0bGVdID0ge1xuXHRcdFx0XHR0eXBlOiBkYXRhLmlzX2RlbGV0ZWQgPyBcImRlbGV0aW9uXCIgOiBcInVwZGF0ZVwiLFxuXHRcdFx0XHRyZXZpc2lvbl9pZDogZGF0YS5yZXZpc2lvbl9pZFxuXHRcdFx0fTtcblx0XHRcdGNvbnNvbGUubG9nKGBPdXN0YW5kaW5nIHJlcXVlc3RzIGlzICR7SlNPTi5zdHJpbmdpZnkoc2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW2RhdGEudGl0bGVdKX1gKTtcblx0XHRcdC8vIFByb2Nlc3MgdGhlIHVwZGF0ZSBpZiB0aGUgdGlkZGxlciBpcyBub3QgdGhlIHN1YmplY3Qgb2YgYW4gb3V0c3RhbmRpbmcgcmVxdWVzdFxuXHRcdFx0aWYgKHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1tkYXRhLnRpdGxlXSkgcmV0dXJuO1xuXHRcdFx0aWYgKGRhdGEuaXNfZGVsZXRlZCkge1xuXHRcdFx0XHRzZWxmLnJlbW92ZVRpZGRsZXJJbmZvKGRhdGEudGl0bGUpO1xuXHRcdFx0XHRkZWxldGUgb3B0aW9ucy5zeW5jZXIudGlkZGxlckluZm9bZGF0YS50aXRsZV07XG5cdFx0XHRcdG9wdGlvbnMuc3luY2VyLmxvZ2dlci5sb2coXCJEZWxldGluZyB0aWRkbGVyIG1pc3NpbmcgZnJvbSBzZXJ2ZXI6XCIsIGRhdGEudGl0bGUpO1xuXHRcdFx0XHRvcHRpb25zLnN5bmNlci53aWtpLmRlbGV0ZVRpZGRsZXIoZGF0YS50aXRsZSk7XG5cdFx0XHRcdG9wdGlvbnMuc3luY2VyLnByb2Nlc3NUYXNrUXVldWUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhciByZXN1bHQgPSBzZWxmLmluY29taW5nVXBkYXRlc0ZpbHRlckZuLmNhbGwoc2VsZi53aWtpLCBzZWxmLndpa2kubWFrZVRpZGRsZXJJdGVyYXRvcihbZGF0YS50aXRsZV0pKTtcblx0XHRcdFx0aWYgKHJlc3VsdC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0c2VsZi5zZXRUaWRkbGVySW5mbyhkYXRhLnRpdGxlLCBkYXRhLnJldmlzaW9uX2lkLnRvU3RyaW5nKCksIGRhdGEuYmFnX25hbWUpO1xuXHRcdFx0XHRcdG9wdGlvbnMuc3luY2VyLnN0b3JlVGlkZGxlcihkYXRhLnRpZGRsZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblxuXHRcdH0pO1xuXHR9XG5cdHByaXZhdGUgYXN5bmMgcG9sbFNlcnZlcigpIHtcblx0XHR0eXBlIHQgPSBUaWRkbGVyUm91dGVyUmVzcG9uc2VbXCJoYW5kbGVHZXRCYWdTdGF0ZXNcIl1cblx0XHRjb25zdCBbb2ssIGVyciwgcmVzdWx0XSA9IGF3YWl0IHRoaXMucmVjaXBlUmVxdWVzdCh7XG5cdFx0XHRrZXk6IFwiaGFuZGxlR2V0QmFnU3RhdGVzXCIsXG5cdFx0XHR1cmw6IFwiL2JhZy1zdGF0ZXNcIixcblx0XHRcdG1ldGhvZDogXCJHRVRcIixcblx0XHRcdHF1ZXJ5UGFyYW1zOiB7XG5cdFx0XHRcdGluY2x1ZGVfZGVsZXRlZDogXCJ5ZXNcIixcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICghb2spIHRocm93IGVycjtcblxuXHRcdGNvbnN0IGJhZ3MgPSByZXN1bHQucmVzcG9uc2VKU09OO1xuXG5cdFx0aWYgKCFiYWdzKSByZXR1cm47XG5cblx0XHRiYWdzLnNvcnQoKGEsIGIpID0+IGIucG9zaXRpb24gLSBhLnBvc2l0aW9uKTtcblx0XHRjb25zdCBtb2RpZmllZCA9IG5ldyBTZXQ8c3RyaW5nPigpLFxuXHRcdFx0ZGVsZXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0Y29uc3QgaW5jb21pbmdUaXRsZXMgPSBuZXcgU2V0PHN0cmluZz4oYmFncy5tYXAoXG5cdFx0XHQvLyBnZXQgdGhlIHRpdGxlcyBpbiBlYWNoIGxheWVyIHRoYXQgYXJlbid0IGRlbGV0ZWRcblx0XHRcdGUgPT4gZS50aWRkbGVycy5maWx0ZXIoZiA9PiAhZi5pc19kZWxldGVkKS5tYXAoZiA9PiBmLnRpdGxlKVxuXHRcdFx0Ly8gYW5kIGZsYXR0ZW4gdGhlbSBmb3IgU2V0XG5cdFx0KS5mbGF0KCkpO1xuXG5cdFx0bGV0IGxhc3RfcmV2aXNpb24gPSB0aGlzLmxhc3Rfa25vd25fcmV2aXNpb25faWQ7XG5cblx0XHRiYWdzLmZvckVhY2goYmFnID0+IHtcblx0XHRcdGJhZy50aWRkbGVycy5mb3JFYWNoKHRpZCA9PiB7XG5cdFx0XHRcdC8vIGlmIHRoZSByZXZpc2lvbiBpcyBvbGQsIGlnbm9yZSwgc2luY2UgZGVsZXRpb25zIGNyZWF0ZSBhIG5ldyByZXZpc2lvblxuXHRcdFx0XHRpZiAodGlkLnJldmlzaW9uX2lkIDw9IHRoaXMubGFzdF9rbm93bl9yZXZpc2lvbl9pZCkgcmV0dXJuO1xuXHRcdFx0XHRpZiAodGlkLnJldmlzaW9uX2lkID4gbGFzdF9yZXZpc2lvbikgbGFzdF9yZXZpc2lvbiA9IHRpZC5yZXZpc2lvbl9pZDtcblx0XHRcdFx0Ly8gY2hlY2sgaWYgdGhpcyB0aXRsZSBzdGlsbCBleGlzdHMgaW4gYW55IGxheWVyXG5cdFx0XHRcdGlmIChpbmNvbWluZ1RpdGxlcy5oYXModGlkLnRpdGxlKSlcblx0XHRcdFx0XHRtb2RpZmllZC5hZGQodGlkLnRpdGxlKTtcblx0XHRcdFx0ZWxzZVxuXHRcdFx0XHRcdGRlbGV0ZWQuYWRkKHRpZC50aXRsZSk7XG5cdFx0XHR9KVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5sYXN0X2tub3duX3JldmlzaW9uX2lkID0gbGFzdF9yZXZpc2lvbjtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRtb2RpZmljYXRpb25zOiBbLi4ubW9kaWZpZWQua2V5cygpXSxcblx0XHRcdGRlbGV0aW9uczogWy4uLmRlbGV0ZWQua2V5cygpXSxcblx0XHR9XG5cblx0fVxuXG5cdC8qXG5cdFF1ZXVlIGEgbG9hZCBmb3IgYSB0aWRkbGVyIGlmIHRoZXJlIGhhcyBiZWVuIGFuIHVwZGF0ZSBmb3IgaXQgc2luY2UgdGhlIHNwZWNpZmllZCByZXZpc2lvblxuXHQqL1xuXHRwcml2YXRlIGNoZWNrTGFzdFJlY29yZGVkVXBkYXRlKHRpdGxlOiBzdHJpbmcsIHJldmlzaW9uOiBzdHJpbmcpIHtcblx0XHR2YXIgbHJ1ID0gdGhpcy5sYXN0UmVjb3JkZWRVcGRhdGVbdGl0bGVdO1xuXHRcdGlmIChscnUgJiYgbHJ1LnJldmlzaW9uX2lkID4gcmV2aXNpb24pIHtcblx0XHRcdGNvbnNvbGUubG9nKGBDaGVja2luZyBmb3IgdXBkYXRlcyB0byAke3RpdGxlfSBzaW5jZSAke0pTT04uc3RyaW5naWZ5KGxydSl9IGNvbXBhcmluZyB0byAke3JldmlzaW9ufWApO1xuXHRcdFx0dGhpcy5zeW5jZXIgJiYgdGhpcy5zeW5jZXIuZW5xdWV1ZUxvYWRUaWRkbGVyKHRpdGxlKTtcblx0XHR9XG5cdH1cblx0cHJpdmF0ZSBnZXQgc3luY2VyKCkge1xuXHRcdGlmICgkdHcuc3luY2FkYXB0b3IgPT09IHRoaXMpIHJldHVybiAkdHcuc3luY2VyO1xuXHR9XG5cdC8qXG5cdFNhdmUgYSB0aWRkbGVyIGFuZCBpbnZva2UgdGhlIGNhbGxiYWNrIHdpdGggKGVycixhZGFwdG9ySW5mbyxyZXZpc2lvbilcblx0Ki9cblx0YXN5bmMgc2F2ZVRpZGRsZXIoXG5cdFx0dGlkZGxlcjogVGlkZGxlcixcblx0XHRjYWxsYmFjazogKFxuXHRcdFx0ZXJyOiBhbnksXG5cdFx0XHRhZGFwdG9ySW5mbz86IE1XU0FkYXB0b3JJbmZvLFxuXHRcdFx0cmV2aXNpb24/OiBzdHJpbmdcblx0XHQpID0+IHZvaWQsXG5cdFx0b3B0aW9ucz86IHt9XG5cdCkge1xuXHRcdHZhciBzZWxmID0gdGhpcywgdGl0bGUgPSB0aWRkbGVyLmZpZWxkcy50aXRsZSBhcyBzdHJpbmc7XG5cdFx0aWYgKHRoaXMuaXNSZWFkT25seSB8fCB0aXRsZS5zdWJzdHIoMCwgTVdDX1NUQVRFX1RJRERMRVJfUFJFRklYLmxlbmd0aCkgPT09IE1XQ19TVEFURV9USURETEVSX1BSRUZJWCkge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKG51bGwpO1xuXHRcdH1cblx0XHRzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdID0geyB0eXBlOiBcIlBVVFwiIH07XG5cblx0XHQvLyBhcHBsaWNhdGlvbi94LW13cy10aWRkbGVyXG5cdFx0Ly8gVGhlIC50aWQgZmlsZSBmb3JtYXQgZG9lcyBub3Qgc3VwcG9ydCBmaWVsZCBuYW1lcyB3aXRoIGNvbG9ucy4gXG5cdFx0Ly8gUmF0aGVyIHRoYW4gdHJ5aW5nIHRvIGNhdGNoIGFsbCB0aGUgdW5zdXBwb3J0ZWQgdmFyaWF0aW9ucyB0aGF0IG1heSBhcHBlYXIsXG5cdFx0Ly8gd2UnbGwganVzdCB1c2UgSlNPTiB0byBzZW5kIGl0IGFjcm9zcyB0aGUgd2lyZSwgc2luY2UgdGhhdCBpcyB0aGUgb2ZmaWNpYWwgZmFsbGJhY2sgZm9ybWF0IGFueXdheS5cblx0XHQvLyBIb3dldmVyLCBwYXJzaW5nIGEgaHVnZSBzdHJpbmcgdmFsdWUgaW5zaWRlIGEgSlNPTiBvYmplY3QgaXMgdmVyeSBzbG93LFxuXHRcdC8vIHNvIHdlIHNwbGl0IG9mZiB0aGUgdGV4dCBmaWVsZCBhbmQgc2VuZCBpdCBhZnRlciB0aGUgb3RoZXIgZmllbGRzLiBcblxuXHRcdGNvbnN0IGZpZWxkcyA9IHRpZGRsZXIuZ2V0RmllbGRTdHJpbmdzKHt9KTtcblx0XHRjb25zdCB0ZXh0ID0gZmllbGRzLnRleHQ7XG5cdFx0ZGVsZXRlIGZpZWxkcy50ZXh0O1xuXHRcdGxldCBib2R5ID0gSlNPTi5zdHJpbmdpZnkoZmllbGRzKTtcblxuXHRcdGlmICh0aWRkbGVyLmhhc0ZpZWxkKFwidGV4dFwiKSkge1xuXHRcdFx0aWYgKHR5cGVvZiB0ZXh0ICE9PSBcInN0cmluZ1wiICYmIHRleHQpXG5cdFx0XHRcdHJldHVybiBjYWxsYmFjayhuZXcgRXJyb3IoXCJFcnJvciBzYXZpbmcgdGlkZGxlciBcIiArIGZpZWxkcy50aXRsZSArIFwiOiB0aGUgdGV4dCBmaWVsZCBpcyB0cnV0aHkgYnV0IG5vdCBhIHN0cmluZ1wiKSk7XG5cdFx0XHRib2R5ICs9IGBcXG5cXG4ke3RleHR9YFxuXHRcdH1cblxuXHRcdHR5cGUgdCA9IFRpZGRsZXJSb3V0ZXJSZXNwb25zZVtcImhhbmRsZVNhdmVSZWNpcGVUaWRkbGVyXCJdXG5cdFx0Y29uc3QgW29rLCBlcnIsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3Qoe1xuXHRcdFx0a2V5OiBcImhhbmRsZVNhdmVSZWNpcGVUaWRkbGVyXCIsXG5cdFx0XHR1cmw6IFwiL3RpZGRsZXJzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRpdGxlKSxcblx0XHRcdG1ldGhvZDogXCJQVVRcIixcblx0XHRcdHJlcXVlc3RCb2R5U3RyaW5nOiBib2R5LFxuXHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcImNvbnRlbnQtdHlwZVwiOiBcImFwcGxpY2F0aW9uL3gtbXdzLXRpZGRsZXJcIlxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0ZGVsZXRlIHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV07XG5cdFx0aWYgKCFvaykgcmV0dXJuIGNhbGxiYWNrKGVycik7XG5cblx0XHRjb25zdCBkYXRhID0gcmVzdWx0LnJlc3BvbnNlSlNPTjtcblx0XHRpZiAoIWRhdGEpIHJldHVybiBjYWxsYmFjayhudWxsKTsgLy8gYSAyeHggcmVzcG9uc2Ugd2l0aG91dCBhIGJvZHkgaXMgdW5saWtlbHlcblxuXHRcdC8vSWYgQnJvd3Nlci1TdG9yYWdlIHBsdWdpbiBpcyBwcmVzZW50LCByZW1vdmUgdGlkZGxlciBmcm9tIGxvY2FsIHN0b3JhZ2UgYWZ0ZXIgc3VjY2Vzc2Z1bCBzeW5jIHRvIHRoZSBzZXJ2ZXJcblx0XHRpZiAoJHR3LmJyb3dzZXJTdG9yYWdlICYmICR0dy5icm93c2VyU3RvcmFnZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0JHR3LmJyb3dzZXJTdG9yYWdlLnJlbW92ZVRpZGRsZXJGcm9tTG9jYWxTdG9yYWdlKHRpdGxlKTtcblx0XHR9XG5cblxuXHRcdC8vIFNhdmUgdGhlIGRldGFpbHMgb2YgdGhlIG5ldyByZXZpc2lvbiBvZiB0aGUgdGlkZGxlclxuXHRcdGNvbnN0IHJldmlzaW9uID0gZGF0YS5yZXZpc2lvbl9pZCwgYmFnX25hbWUgPSBkYXRhLmJhZ19uYW1lO1xuXHRcdGNvbnNvbGUubG9nKGBTYXZlZCAke3RpdGxlfSB3aXRoIHJldmlzaW9uICR7cmV2aXNpb259IGFuZCBiYWcgJHtiYWdfbmFtZX1gKTtcblx0XHQvLyBJZiB0aGVyZSBoYXMgYmVlbiBhIG1vcmUgcmVjZW50IHVwZGF0ZSBmcm9tIHRoZSBzZXJ2ZXIgdGhlbiBlbnF1ZXVlIGEgbG9hZCBvZiB0aGlzIHRpZGRsZXJcblx0XHRzZWxmLmNoZWNrTGFzdFJlY29yZGVkVXBkYXRlKHRpdGxlLCByZXZpc2lvbik7XG5cdFx0Ly8gSW52b2tlIHRoZSBjYWxsYmFja1xuXHRcdHNlbGYuc2V0VGlkZGxlckluZm8odGl0bGUsIHJldmlzaW9uLCBiYWdfbmFtZSk7XG5cdFx0Y2FsbGJhY2sobnVsbCwgeyBiYWc6IGJhZ19uYW1lIH0sIHJldmlzaW9uKTtcblxuXHR9XG5cdC8qXG5cdExvYWQgYSB0aWRkbGVyIGFuZCBpbnZva2UgdGhlIGNhbGxiYWNrIHdpdGggKGVycix0aWRkbGVyRmllbGRzKVxuXG5cdFRoZSBzeW5jZXIgZG9lcyBub3QgcGFzcyBpdHNlbGYgaW50byBvcHRpb25zLlxuXHQqL1xuXHRhc3luYyBsb2FkVGlkZGxlcih0aXRsZTogc3RyaW5nLCBjYWxsYmFjazogKGVycjogYW55LCBmaWVsZHM/OiBhbnkpID0+IHZvaWQsIG9wdGlvbnM6IGFueSkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdID0geyB0eXBlOiBcIkdFVFwiIH07XG5cdFx0Y29uc3QgW29rLCBlcnIsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3Qoe1xuXHRcdFx0a2V5OiBcImhhbmRsZUdldFJlY2lwZVRpZGRsZXJcIixcblx0XHRcdHVybDogXCIvdGlkZGxlcnMvXCIgKyBlbmNvZGVVUklDb21wb25lbnQodGl0bGUpLFxuXHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdH0pXG5cdFx0ZGVsZXRlIHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV07XG5cdFx0aWYgKCFvaykgcmV0dXJuIGNhbGxiYWNrKGVycik7XG5cblx0XHRjb25zdCB7IHJlc3BvbnNlSlNPTjogZGF0YSwgaGVhZGVycyB9ID0gcmVzdWx0O1xuXHRcdGNvbnN0IHJldmlzaW9uID0gaGVhZGVycy5nZXQoXCJ4LXJldmlzaW9uLW51bWJlclwiKSA/PyBcIlwiLFxuXHRcdFx0YmFnX25hbWUgPSBoZWFkZXJzLmdldChcIngtYmFnLW5hbWVcIikgPz8gXCJcIjtcblxuXHRcdGlmICghcmV2aXNpb24gfHwgIWJhZ19uYW1lIHx8ICFkYXRhKSByZXR1cm4gY2FsbGJhY2sobnVsbCwgbnVsbCk7XG5cblx0XHQvLyBJZiB0aGVyZSBoYXMgYmVlbiBhIG1vcmUgcmVjZW50IHVwZGF0ZSBmcm9tIHRoZSBzZXJ2ZXIgdGhlbiBlbnF1ZXVlIGEgbG9hZCBvZiB0aGlzIHRpZGRsZXJcblx0XHRzZWxmLmNoZWNrTGFzdFJlY29yZGVkVXBkYXRlKHRpdGxlLCByZXZpc2lvbik7XG5cdFx0Ly8gSW52b2tlIHRoZSBjYWxsYmFja1xuXHRcdHNlbGYuc2V0VGlkZGxlckluZm8odGl0bGUsIHJldmlzaW9uLCBiYWdfbmFtZSk7XG5cdFx0Y2FsbGJhY2sobnVsbCwgZGF0YSk7XG5cdH1cblx0Lypcblx0RGVsZXRlIGEgdGlkZGxlciBhbmQgaW52b2tlIHRoZSBjYWxsYmFjayB3aXRoIChlcnIpXG5cdG9wdGlvbnMgaW5jbHVkZTpcblx0dGlkZGxlckluZm86IHRoZSBzeW5jZXIncyB0aWRkbGVySW5mbyBmb3IgdGhpcyB0aWRkbGVyXG5cdCovXG5cdGFzeW5jIGRlbGV0ZVRpZGRsZXIodGl0bGU6IHN0cmluZywgY2FsbGJhY2s6IChlcnI6IGFueSwgYWRhcHRvckluZm8/OiBhbnkpID0+IHZvaWQsIG9wdGlvbnM6IGFueSkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRpZiAodGhpcy5pc1JlYWRPbmx5KSB7IHJldHVybiBjYWxsYmFjayhudWxsKTsgfVxuXHRcdC8vIElmIHdlIGRvbid0IGhhdmUgYSBiYWcgaXQgbWVhbnMgdGhhdCB0aGUgdGlkZGxlciBoYXNuJ3QgYmVlbiBzZWVuIGJ5IHRoZSBzZXJ2ZXIsIHNvIHdlIGRvbid0IG5lZWQgdG8gZGVsZXRlIGl0XG5cdFx0Ly8gdmFyIGJhZyA9IHRoaXMuZ2V0VGlkZGxlckJhZyh0aXRsZSk7XG5cdFx0Ly8gaWYoIWJhZykgeyByZXR1cm4gY2FsbGJhY2sobnVsbCwgb3B0aW9ucy50aWRkbGVySW5mby5hZGFwdG9ySW5mbyk7IH1cblx0XHRzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdID0geyB0eXBlOiBcIkRFTEVURVwiIH07XG5cdFx0Ly8gSXNzdWUgSFRUUCByZXF1ZXN0IHRvIGRlbGV0ZSB0aGUgdGlkZGxlclxuXHRcdGNvbnN0IFtvaywgZXJyLCByZXN1bHRdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdGtleTogXCJoYW5kbGVEZWxldGVSZWNpcGVUaWRkbGVyXCIsXG5cdFx0XHR1cmw6IFwiL3RpZGRsZXJzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRpdGxlKSxcblx0XHRcdG1ldGhvZDogXCJERUxFVEVcIixcblx0XHR9KTtcblx0XHRkZWxldGUgc2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW3RpdGxlXTtcblx0XHRpZiAoIW9rKSByZXR1cm4gY2FsbGJhY2soZXJyKTtcblx0XHRjb25zdCB7IHJlc3BvbnNlSlNPTjogZGF0YSB9ID0gcmVzdWx0O1xuXHRcdGlmICghZGF0YSkgcmV0dXJuIGNhbGxiYWNrKG51bGwpO1xuXG5cdFx0Y29uc3QgcmV2aXNpb24gPSBkYXRhLnJldmlzaW9uX2lkLCBiYWdfbmFtZSA9IGRhdGEuYmFnX25hbWU7XG5cdFx0Ly8gSWYgdGhlcmUgaGFzIGJlZW4gYSBtb3JlIHJlY2VudCB1cGRhdGUgZnJvbSB0aGUgc2VydmVyIHRoZW4gZW5xdWV1ZSBhIGxvYWQgb2YgdGhpcyB0aWRkbGVyXG5cdFx0c2VsZi5jaGVja0xhc3RSZWNvcmRlZFVwZGF0ZSh0aXRsZSwgcmV2aXNpb24pO1xuXHRcdHNlbGYucmVtb3ZlVGlkZGxlckluZm8odGl0bGUpO1xuXHRcdC8vIEludm9rZSB0aGUgY2FsbGJhY2sgJiByZXR1cm4gbnVsbCBhZGFwdG9ySW5mb1xuXHRcdGNhbGxiYWNrKG51bGwsIG51bGwpO1xuXHR9XG59XG5cblxuaWYgKCR0dy5icm93c2VyICYmIGRvY3VtZW50LmxvY2F0aW9uLnByb3RvY29sLnN0YXJ0c1dpdGgoXCJodHRwXCIpKSB7XG5cdGV4cG9ydHMuYWRhcHRvckNsYXNzID0gTXVsdGlXaWtpQ2xpZW50QWRhcHRvcjtcbn1cblxudHlwZSBQYXJhbXNJbnB1dCA9IFVSTFNlYXJjaFBhcmFtcyB8IFtzdHJpbmcsIHN0cmluZ11bXSB8IG9iamVjdCB8IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuaW50ZXJmYWNlIEh0dHBSZXF1ZXN0T3B0aW9uczxUWVBFIGV4dGVuZHMgXCJhcnJheWJ1ZmZlclwiIHwgXCJibG9iXCIgfCBcInRleHRcIj4ge1xuXHQvKiogVGhlIHJlcXVlc3QgTUVUSE9ELiBNYXliZSBiZSBhbnl0aGluZyBleGNlcHQgQ09OTkVDVCwgVFJBQ0UsIG9yIFRSQUNLLiAgKi9cblx0bWV0aG9kOiBzdHJpbmc7XG5cdC8qKiBUaGUgdXJsIG1heSBhbHNvIGNvbnRhaW4gcXVlcnkgcGFyYW1zLiAqL1xuXHR1cmw6IHN0cmluZztcblx0LyoqIFRoZSByZXNwb25zZSB0eXBlcyAqL1xuXHRyZXNwb25zZVR5cGU6IFRZUEU7XG5cdGhlYWRlcnM/OiBQYXJhbXNJbnB1dDtcblx0LyoqIFRoaXMgaXMgcGFyc2VkIHNlcGFyYXRlbHkgZnJvbSB0aGUgdXJsIGFuZCBhcHBlbmRlZCB0byBpdC4gKi9cblx0cXVlcnlQYXJhbXM/OiBQYXJhbXNJbnB1dDtcblx0LyoqIFxuXHQgKiBUaGUgc3RyaW5nIHRvIHNlbmQgYXMgdGhlIHJlcXVlc3QgYm9keS4gTm90IHZhbGlkIGZvciBHRVQgYW5kIEhFQUQuXG5cdCAqIFxuXHQgKiBGb3IgYGFwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZGAsIHVzZSBgbmV3IFVSTFNlYXJjaFBhcmFtcygpLnRvU3RyaW5nKClgLlxuXHQgKiBcblx0ICogRm9yIGBhcHBsaWNhdGlvbi9qc29uYCwgdXNlIGBKU09OLnN0cmluZ2lmeSgpYFxuXHQgKi9cblx0cmVxdWVzdEJvZHlTdHJpbmc/OiBzdHJpbmc7XG5cdHByb2dyZXNzPzogKGV2ZW50OiBQcm9ncmVzc0V2ZW50PEV2ZW50VGFyZ2V0PikgPT4gdm9pZDtcbn1cblxuXG5mdW5jdGlvbiBodHRwUmVxdWVzdDxUWVBFIGV4dGVuZHMgXCJhcnJheWJ1ZmZlclwiIHwgXCJibG9iXCIgfCBcInRleHRcIj4ob3B0aW9uczogSHR0cFJlcXVlc3RPcHRpb25zPFRZUEU+KSB7XG5cblx0b3B0aW9ucy5tZXRob2QgPSBvcHRpb25zLm1ldGhvZC50b1VwcGVyQ2FzZSgpO1xuXG5cdGlmICgob3B0aW9ucy5tZXRob2QgPT09IFwiR0VUXCIgfHwgb3B0aW9ucy5tZXRob2QgPT09IFwiSEVBRFwiKSAmJiBvcHRpb25zLnJlcXVlc3RCb2R5U3RyaW5nKVxuXHRcdHRocm93IG5ldyBFcnJvcihcInJlcXVlc3RCb2R5U3RyaW5nIG11c3QgYmUgZmFsc3kgaWYgbWV0aG9kIGlzIEdFVCBvciBIRUFEXCIpO1xuXG5cdGZ1bmN0aW9uIHBhcmFtc0lucHV0KGlucHV0OiBQYXJhbXNJbnB1dCkge1xuXHRcdGlmICghaW5wdXQpIHJldHVybiBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdFx0aWYgKGlucHV0IGluc3RhbmNlb2YgVVJMU2VhcmNoUGFyYW1zKSByZXR1cm4gaW5wdXQ7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoaW5wdXQpIHx8IHR5cGVvZiBpbnB1dCA9PT0gXCJzdHJpbmdcIikgcmV0dXJuIG5ldyBVUkxTZWFyY2hQYXJhbXMoaW5wdXQpO1xuXHRcdHJldHVybiBuZXcgVVJMU2VhcmNoUGFyYW1zKE9iamVjdC5lbnRyaWVzKGlucHV0KSk7XG5cdH1cblxuXHRmdW5jdGlvbiBub3JtYWxpemVIZWFkZXJzKGhlYWRlcnM6IFVSTFNlYXJjaFBhcmFtcykge1xuXHRcdFsuLi5oZWFkZXJzLmtleXMoKV0uZm9yRWFjaCgoW2ssIHZdKSA9PiB7XG5cdFx0XHRjb25zdCBrMiA9IGsudG9Mb3dlckNhc2UoKTtcblx0XHRcdGlmIChrMiAhPT0gaykge1xuXHRcdFx0XHRoZWFkZXJzLmdldEFsbChrKS5mb3JFYWNoKGUgPT4ge1xuXHRcdFx0XHRcdGhlYWRlcnMuYXBwZW5kKGsyLCBlKTtcblx0XHRcdFx0fSlcblx0XHRcdFx0aGVhZGVycy5kZWxldGUoayk7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGssIGsyKTtcblx0XHRcdH1cblx0XHR9KVxuXHR9XG5cblx0cmV0dXJuIG5ldyBQcm9taXNlPHtcblx0XHQvKiogU2hvcnRoYW5kIHRvIGNoZWNrIGlmIHRoZSByZXNwb25zZSBpcyBpbiB0aGUgMnh4IHJhbmdlLiAqL1xuXHRcdG9rOiBib29sZWFuO1xuXHRcdHN0YXR1czogbnVtYmVyO1xuXHRcdHN0YXR1c1RleHQ6IHN0cmluZztcblx0XHRoZWFkZXJzOiBVUkxTZWFyY2hQYXJhbXM7XG5cdFx0cmVzcG9uc2U6XG5cdFx0VFlQRSBleHRlbmRzIFwiYXJyYXlidWZmZXJcIiA/IEFycmF5QnVmZmVyIDpcblx0XHRUWVBFIGV4dGVuZHMgXCJibG9iXCIgPyBCbG9iIDpcblx0XHRUWVBFIGV4dGVuZHMgXCJ0ZXh0XCIgPyBzdHJpbmcgOlxuXHRcdG5ldmVyO1xuXHR9PigocmVzb2x2ZSkgPT4ge1xuXHRcdC8vIGlmIHRoaXMgdGhyb3dzIHN5bmMnbHksIHRoZSBwcm9taXNlIHdpbGwgcmVqZWN0LlxuXG5cdFx0Y29uc3QgdXJsID0gbmV3IFVSTChvcHRpb25zLnVybCwgbG9jYXRpb24uaHJlZik7XG5cdFx0Y29uc3QgcXVlcnkgPSBwYXJhbXNJbnB1dChvcHRpb25zLnF1ZXJ5UGFyYW1zKTtcblx0XHRxdWVyeS5mb3JFYWNoKCh2LCBrKSA9PiB7IHVybC5zZWFyY2hQYXJhbXMuYXBwZW5kKGssIHYpOyB9KTtcblxuXHRcdGNvbnNvbGUubG9nKHVybCwgcXVlcnksIG9wdGlvbnMucXVlcnlQYXJhbXMsIHVybC5ocmVmKTtcblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBwYXJhbXNJbnB1dChvcHRpb25zLmhlYWRlcnMpO1xuXHRcdG5vcm1hbGl6ZUhlYWRlcnMoaGVhZGVycyk7XG5cblx0XHRjb25zdCByZXF1ZXN0ID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG5cdFx0cmVxdWVzdC5yZXNwb25zZVR5cGUgPSBvcHRpb25zLnJlc3BvbnNlVHlwZSB8fCBcInRleHRcIjtcblxuXHRcdHJlcXVlc3Qub3BlbihvcHRpb25zLm1ldGhvZCwgdXJsLCB0cnVlKTtcblxuXG5cdFx0aWYgKCFoZWFkZXJzLmhhcyhcImNvbnRlbnQtdHlwZVwiKSlcblx0XHRcdGhlYWRlcnMuc2V0KFwiY29udGVudC10eXBlXCIsIFwiYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkOyBjaGFyc2V0PVVURi04XCIpO1xuXG5cdFx0aWYgKCFoZWFkZXJzLmhhcyhcIngtcmVxdWVzdGVkLXdpdGhcIikpXG5cdFx0XHRoZWFkZXJzLnNldChcIngtcmVxdWVzdGVkLXdpdGhcIiwgXCJUaWRkbHlXaWtpXCIpO1xuXG5cdFx0aGVhZGVycy5zZXQoXCJhY2NlcHRcIiwgXCJhcHBsaWNhdGlvbi9qc29uXCIpO1xuXG5cblx0XHRoZWFkZXJzLmZvckVhY2goKHYsIGspID0+IHtcblx0XHRcdHJlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcihrLCB2KTtcblx0XHR9KTtcblxuXG5cdFx0cmVxdWVzdC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHRpZiAodGhpcy5yZWFkeVN0YXRlICE9PSA0KSByZXR1cm47XG5cblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdFx0XHRyZXF1ZXN0LmdldEFsbFJlc3BvbnNlSGVhZGVycygpPy50cmltKCkuc3BsaXQoL1tcXHJcXG5dKy8pLmZvckVhY2goKGxpbmUpID0+IHtcblx0XHRcdFx0Y29uc3QgcGFydHMgPSBsaW5lLnNwbGl0KFwiOiBcIik7XG5cdFx0XHRcdGNvbnN0IGhlYWRlciA9IHBhcnRzLnNoaWZ0KCk/LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gcGFydHMuam9pbihcIjogXCIpO1xuXHRcdFx0XHRpZiAoaGVhZGVyKSBoZWFkZXJzLmFwcGVuZChoZWFkZXIsIHZhbHVlKTtcblx0XHRcdH0pO1xuXHRcdFx0cmVzb2x2ZSh7XG5cdFx0XHRcdG9rOiB0aGlzLnN0YXR1cyA+PSAyMDAgJiYgdGhpcy5zdGF0dXMgPCAzMDAsXG5cdFx0XHRcdHN0YXR1czogdGhpcy5zdGF0dXMsXG5cdFx0XHRcdHN0YXR1c1RleHQ6IHRoaXMuc3RhdHVzVGV4dCxcblx0XHRcdFx0cmVzcG9uc2U6IHRoaXMucmVzcG9uc2UsXG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHR9KTtcblxuXHRcdH07XG5cblx0XHRpZiAob3B0aW9ucy5wcm9ncmVzcylcblx0XHRcdHJlcXVlc3Qub25wcm9ncmVzcyA9IG9wdGlvbnMucHJvZ3Jlc3M7XG5cblx0XHRyZXF1ZXN0LnNlbmQob3B0aW9ucy5yZXF1ZXN0Qm9keVN0cmluZyk7XG5cblxuXHR9KTtcblxufVxuXG5cbiJdfQ==