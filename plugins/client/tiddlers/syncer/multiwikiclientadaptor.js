/*\
title: $:/plugins/mws/client/tiddlywebadaptor.js
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
var CONFIG_HOST_TIDDLER = "$:/config/multiwikiclient/host", DEFAULT_HOST_TIDDLER = "$protocol$//$host$/", MWC_STATE_TIDDLER_PREFIX = "$:/state/multiwikiclient/", BAG_STATE_TIDDLER = "$:/state/multiwikiclient/tiddlers/bag", REVISION_STATE_TIDDLER = "$:/state/multiwikiclient/tiddlers/revision", CONNECTION_STATE_TIDDLER = "$:/state/multiwikiclient/connection", INCOMING_UPDATES_FILTER_TIDDLER = "$:/config/multiwikiclient/incoming-updates-filter", ENABLE_SSE_TIDDLER = "$:/config/multiwikiclient/use-server-sent-events", IS_DEV_MODE_TIDDLER = `$:/state/multiwikiclient/dev-mode`, ENABLE_GZIP_STREAM_TIDDLER = `$:/state/multiwikiclient/gzip-stream`;
var SERVER_NOT_CONNECTED = "NOT CONNECTED", SERVER_CONNECTING_SSE = "CONNECTING SSE", SERVER_CONNECTED_SSE = "CONNECTED SSE", SERVER_POLLING = "SERVER POLLING";
class MultiWikiClientAdaptor {
    constructor(options) {
        this.name = "multiwikiclient";
        this.supportsLazyLoading = true;
        this.error = null;
        this.wiki = options.wiki;
        this.host = this.getHost();
        this.recipe = this.wiki.getTiddlerText("$:/config/multiwikiclient/recipe");
        this.useServerSentEvents = this.wiki.getTiddlerText(ENABLE_SSE_TIDDLER) === "yes";
        this.isDevMode = this.wiki.getTiddlerText(IS_DEV_MODE_TIDDLER) === "yes";
        this.useGzipStream = this.wiki.getTiddlerText(ENABLE_GZIP_STREAM_TIDDLER) === "yes";
        this.last_known_revision_id = this.wiki.getTiddlerText("$:/state/multiwikiclient/recipe/last_revision_id", "0");
        this.outstandingRequests = Object.create(null); // Hashmap by title of outstanding request object: {type: "PUT"|"GET"|"DELETE"}
        this.lastRecordedUpdate = Object.create(null); // Hashmap by title of last recorded update via SSE: {type: "update"|"detetion", revision_id:}
        this.logger = new $tw.utils.Logger("MultiWikiClientAdaptor");
        this.isLoggedIn = false;
        this.isReadOnly = false;
        this.offline = false;
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
    /**
     * This throws an error if the response status is not 2xx, but will still return the response alongside the error.
     *
     * So if the first parameter is false, the third parameter may still contain the response.
     */
    recipeRequest(options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!options.url.startsWith("/"))
                throw new Error("The url does not start with a slash");
            return yield httpRequest(Object.assign(Object.assign({}, options), { responseType: "blob", url: this.host + "wiki/" + encodeURIComponent(this.recipe) + options.url })).then((e) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                if (!e.ok)
                    return [
                        false, new Error(`The server return a status code ${e.status} with the following reason: `
                            + `${(_a = e.headers.get("x-reason")) !== null && _a !== void 0 ? _a : "(no reason given)"}`), e
                    ];
                let responseString = "";
                if (e.headers.get("x-gzip-stream") === "yes") {
                    // Browsers only decode the first stream, 
                    // so we cant use content-encoding or DecompressionStream
                    yield new Promise((resolve) => __awaiter(this, void 0, void 0, function* () {
                        const gunzip = new fflate.AsyncGunzip((err, chunk, final) => {
                            if (err)
                                return console.log(err);
                            responseString += fflate.strFromU8(chunk);
                            if (final)
                                resolve();
                        });
                        if (this.isDevMode)
                            gunzip.onmember = e => console.log("gunzip member", e);
                        gunzip.push(new Uint8Array(yield readBlobAsArrayBuffer(e.response)));
                        // this has to be on a separate line
                        gunzip.push(new Uint8Array(), true);
                    }));
                }
                else {
                    responseString = fflate.strFromU8(new Uint8Array(yield readBlobAsArrayBuffer(e.response)));
                }
                if (this.isDevMode)
                    console.log("gunzip result", responseString.length);
                return [true, void 0, Object.assign(Object.assign({}, e), { responseString, 
                        /** this is undefined if status is not 200 */
                        responseJSON: e.status === 200
                            ? tryParseJSON(responseString)
                            : undefined })];
            }), e => [false, e, void 0]);
            function tryParseJSON(data) {
                try {
                    return JSON.parse(data);
                }
                catch (e) {
                    console.error("Error parsing JSON, returning undefined", e);
                    // console.log(data);
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
            var _a, _b, _c, _d;
            const [ok, error, data] = yield this.recipeRequest({
                key: "handleGetRecipeStatus",
                method: "GET",
                url: "/status",
            });
            if (!ok && (data === null || data === void 0 ? void 0 : data.status) === 0) {
                this.error = "The webpage is forbidden from contacting the server.";
                this.isLoggedIn = false;
                this.isReadOnly = true;
                this.username = "(offline)";
                this.offline = true;
            }
            else if (ok) {
                this.error = null;
                const status = data.responseJSON;
                this.isReadOnly = (_a = status === null || status === void 0 ? void 0 : status.isReadOnly) !== null && _a !== void 0 ? _a : true;
                this.isLoggedIn = (_b = status === null || status === void 0 ? void 0 : status.isLoggedIn) !== null && _b !== void 0 ? _b : false;
                this.username = (_c = status === null || status === void 0 ? void 0 : status.username) !== null && _c !== void 0 ? _c : "(anon)";
                this.offline = false;
            }
            else {
                this.error = (_d = error.message) !== null && _d !== void 0 ? _d : `${error}`;
            }
            if (callback) {
                callback(
                // Error
                this.error, 
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
        if (this.offline)
            return callback(null);
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
                queryParams: Object.assign({ include_deleted: "yes" }, this.useGzipStream ? { gzip_stream: "yes" } : {})
            });
            if (!ok)
                throw err;
            const bags = result.responseJSON;
            if (!bags)
                throw new Error("no result returned");
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
            if (title === "$:/StoryList") {
                return callback(null);
            }
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
                key: "handleLoadRecipeTiddler",
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
    return new Promise((resolve, reject) => {
        // if this throws sync'ly, the promise will reject.
        options.method = options.method.toUpperCase();
        if ((options.method === "GET" || options.method === "HEAD") && options.requestBodyString)
            throw new Error("requestBodyString must be falsy if method is GET or HEAD");
        const url = new URL(options.url, location.href);
        const query = paramsInput(options.queryParams);
        query.forEach((v, k) => { url.searchParams.append(k, v); });
        const headers = paramsInput(options.headers);
        normalizeHeaders(headers);
        const request = new XMLHttpRequest();
        request.responseType = options.responseType || "text";
        try {
            request.open(options.method, url, true);
        }
        catch (e) {
            console.log(e, { e });
            throw e;
        }
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
        try {
            request.send(options.requestBodyString);
        }
        catch (e) {
            console.log(e, { e });
            throw e;
        }
    });
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
}
function readBlobAsArrayBuffer(blob) {
    const error = new Error("Error reading blob");
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve(reader.result);
        };
        reader.onerror = () => {
            reject(error);
        };
        reader.readAsArrayBuffer(blob);
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGl3aWtpY2xpZW50YWRhcHRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tdWx0aXdpa2ljbGllbnRhZGFwdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHO0FBRUgsa0VBQWtFO0FBQ2xFLFlBQVksQ0FBQzs7Ozs7Ozs7Ozs7QUEwSWIsSUFBSSxtQkFBbUIsR0FBRyxnQ0FBZ0MsRUFDekQsb0JBQW9CLEdBQUcscUJBQXFCLEVBQzVDLHdCQUF3QixHQUFHLDJCQUEyQixFQUN0RCxpQkFBaUIsR0FBRyx1Q0FBdUMsRUFDM0Qsc0JBQXNCLEdBQUcsNENBQTRDLEVBQ3JFLHdCQUF3QixHQUFHLHFDQUFxQyxFQUNoRSwrQkFBK0IsR0FBRyxtREFBbUQsRUFDckYsa0JBQWtCLEdBQUcsa0RBQWtELEVBQ3ZFLG1CQUFtQixHQUFHLG1DQUFtQyxFQUN6RCwwQkFBMEIsR0FBRyxzQ0FBc0MsQ0FBQztBQUdyRSxJQUFJLG9CQUFvQixHQUFHLGVBQWUsRUFDekMscUJBQXFCLEdBQUcsZ0JBQWdCLEVBQ3hDLG9CQUFvQixHQUFHLGVBQWUsRUFDdEMsY0FBYyxHQUFHLGdCQUFnQixDQUFDO0FBT25DLE1BQU0sc0JBQXNCO0lBb0IzQixZQUFZLE9BQXNCO1FBRmxDLFNBQUksR0FBRyxpQkFBaUIsQ0FBQztRQUNqQix3QkFBbUIsR0FBRyxJQUFJLENBQUM7UUFtSm5DLFVBQUssR0FBa0IsSUFBSSxDQUFDO1FBakozQixJQUFJLENBQUMsSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUM7UUFDekIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDM0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQzNFLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsSUFBSSxD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SSxVQUFVLEVBQUUsQ0FBQztRQUNoQyxNQUFNLENBQUMsTUFBTSxHQUFHLEdBQUcsRUFBRTtZQUNwQixPQUFPLENBQUMsTUFBTSxDQUFDLE1BQXFCLENBQUMsQ0FBQTtRQUN0QyxDQUFDLENBQUM7UUFDRixNQUFNLENBQUMsT0FBTyxHQUFHLEdBQUcsRUFBRTtZQUNyQixNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDZixDQUFDLENBQUM7UUFDRixNQUFNLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEMsQ0FBQyxDQUFDLENBQUM7QUFFSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLypcXFxudGl0bGU6ICQ6L3BsdWdpbnMvdGlkZGx5d2lraS90aWRkbHl3ZWIvdGlkZGx5d2ViYWRhcHRvci5qc1xudHlwZTogYXBwbGljYXRpb24vamF2YXNjcmlwdFxubW9kdWxlLXR5cGU6IHN5bmNhZGFwdG9yXG5cbkEgc3luYyBhZGFwdG9yIG1vZHVsZSBmb3Igc3luY2hyb25pc2luZyB3aXRoIE11bHRpV2lraVNlcnZlci1jb21wYXRpYmxlIHNlcnZlcnMuIFxuXG5JdCBoYXMgdGhyZWUga2V5IGFyZWFzIG9mIGNvbmNlcm46XG5cbiogQmFzaWMgb3BlcmF0aW9ucyBsaWtlIHB1dCwgZ2V0LCBhbmQgZGVsZXRlIGEgdGlkZGxlciBvbiB0aGUgc2VydmVyXG4qIFJlYWwgdGltZSB1cGRhdGVzIGZyb20gdGhlIHNlcnZlciAoaGFuZGxlZCBieSBTU0UpXG4qIEJhZ3MgYW5kIHJlY2lwZXMsIHdoaWNoIGFyZSB1bmtub3duIHRvIHRoZSBzeW5jZXJcblxuQSBrZXkgYXNwZWN0IG9mIHRoZSBkZXNpZ24gaXMgdGhhdCB0aGUgc3luY2VyIG5ldmVyIG92ZXJsYXBzIGJhc2ljIHNlcnZlciBvcGVyYXRpb25zOyBpdCB3YWl0cyBmb3IgdGhlXG5wcmV2aW91cyBvcGVyYXRpb24gdG8gY29tcGxldGUgYmVmb3JlIHNlbmRpbmcgYSBuZXcgb25lLlxuXG5cXCovXG5cbi8vIHRoZSBibGFuayBsaW5lIGlzIGltcG9ydGFudCwgYW5kIHNvIGlzIHRoZSBmb2xsb3dpbmcgdXNlIHN0cmljdFxuXCJ1c2Ugc3RyaWN0XCI7XG5cbmltcG9ydCB0eXBlIHsgU3luY2VyLCBUaWRkbGVyLCBJVGlkZGx5V2lraSB9IGZyb20gXCJ0aWRkbHl3aWtpXCI7XG5pbXBvcnQgdHlwZSB7IFdpa2lSb3V0ZXMgfSBmcm9tIFwiQHRpZGRseXdpa2kvbXdzL3NyYy9yb3V0ZXMvbWFuYWdlcnMvd2lraS1yb3V0ZXNcIjtcbmltcG9ydCB0eXBlIHsgWm9kUm91dGUgfSBmcm9tIFwiQHRpZGRseXdpa2kvbXdzL3NyYy91dGlsc1wiO1xuXG5kZWNsYXJlIGdsb2JhbCB7XG5cdGNvbnN0IGZmbGF0ZTogdHlwZW9mIGltcG9ydChcImZmbGF0ZVwiKTtcbn1cblxuZGVjbGFyZSBjbGFzcyBMb2dnZXIge1xuXHRjb25zdHJ1Y3Rvcihjb21wb25lbnROYW1lOiBhbnksIG9wdGlvbnM6IGFueSk7XG5cdGNvbXBvbmVudE5hbWU6IGFueTtcblx0Y29sb3VyOiBhbnk7XG5cdGVuYWJsZTogYW55O1xuXHRzYXZlOiBhbnk7XG5cdHNhdmVMaW1pdDogYW55O1xuXHRzYXZlQnVmZmVyTG9nZ2VyOiB0aGlzO1xuXHRidWZmZXI6IHN0cmluZztcblx0YWxlcnRDb3VudDogbnVtYmVyO1xuXHRzZXRTYXZlQnVmZmVyKGxvZ2dlcjogYW55KTogdm9pZDtcblx0bG9nKC4uLmFyZ3M6IGFueVtdKTogYW55O1xuXHRnZXRCdWZmZXIoKTogc3RyaW5nO1xuXHR0YWJsZSh2YWx1ZTogYW55KTogdm9pZDtcblx0YWxlcnQoLi4uYXJnczogYW55W10pOiB2b2lkO1xuXHRjbGVhckFsZXJ0cygpOiB2b2lkO1xufVxuXG50eXBlIFRpZGRsZXJSb3V0ZXJSZXNwb25zZSA9IHtcblx0W0sgaW4ga2V5b2YgV2lraVJvdXRlc106IFdpa2lSb3V0ZXNbS10gZXh0ZW5kcyBab2RSb3V0ZTxpbmZlciBNLCBpbmZlciBCLCBpbmZlciBQLCBpbmZlciBRLCBpbmZlciBULCBpbmZlciBSPlxuXHQ/IHsgTTogTSwgQjogQiwgUDogUCwgUTogUSwgVDogVCwgUjogUiB9XG5cdDogbmV2ZXJcbn1cblxuZGVjbGFyZSBtb2R1bGUgJ3RpZGRseXdpa2knIHtcblx0ZXhwb3J0IGludGVyZmFjZSBTeW5jZXIge1xuXHRcdHdpa2k6IFdpa2k7XG5cdFx0bG9nZ2VyOiBMb2dnZXI7XG5cdFx0dGlkZGxlckluZm86IFJlY29yZDxzdHJpbmcsIHsgYmFnOiBzdHJpbmc7IHJldmlzaW9uOiBzdHJpbmcgfT47XG5cdFx0ZW5xdWV1ZUxvYWRUaWRkbGVyKHRpdGxlOiBzdHJpbmcpOiB2b2lkO1xuXHRcdHN0b3JlVGlkZGxlcih0aWRkbGVyOiBUaWRkbGVyKTogdm9pZDtcblx0XHRwcm9jZXNzVGFza1F1ZXVlKCk6IHZvaWQ7XG5cdH1cblx0aW50ZXJmYWNlIElUaWRkbHlXaWtpIHtcblx0XHRicm93c2VyU3RvcmFnZTogYW55O1xuXHR9XG59XG5cbnR5cGUgU2VydmVyU3RhdHVzQ2FsbGJhY2sgPSAoXG5cdGVycjogYW55LFxuXHQvKiogXG5cdCAqICQ6L3N0YXR1cy9Jc0xvZ2dlZEluIG1vc3RseSBhcHBlYXJzIGFsb25nc2lkZSB0aGUgdXNlcm5hbWUgXG5cdCAqIG9yIG90aGVyIGxvZ2luLWNvbmRpdGlvbmFsIGJlaGF2aW9yLiBcblx0ICovXG5cdGlzTG9nZ2VkSW4/OiBib29sZWFuLFxuXHQvKipcblx0ICogJDovc3RhdHVzL1VzZXJOYW1lIGlzIHN0aWxsIHVzZWQgZm9yIHRoaW5ncyBsaWtlIGRyYWZ0cyBldmVuIGlmIHRoZSBcblx0ICogdXNlciBpc24ndCBsb2dnZWQgaW4sIGFsdGhvdWdoIHRoZSB1c2VybmFtZSBpcyBsZXNzIGxpa2VseSB0byBiZSBzaG93biBcblx0ICogdG8gdGhlIHVzZXIuIFxuXHQgKi9cblx0dXNlcm5hbWU/OiBzdHJpbmcsXG5cdC8qKiBcblx0ICogJDovc3RhdHVzL0lzUmVhZE9ubHkgcHV0cyB0aGUgVUkgaW4gcmVhZG9ubHkgbW9kZSwgXG5cdCAqIGJ1dCBkb2VzIG5vdCBwcmV2ZW50IGF1dG9tYXRpYyBjaGFuZ2VzIGZyb20gYXR0ZW1wdGluZyB0byBzYXZlLiBcblx0ICovXG5cdGlzUmVhZE9ubHk/OiBib29sZWFuLFxuXHQvKiogXG5cdCAqICQ6L3N0YXR1cy9Jc0Fub255bW91cyBkb2VzIG5vdCBhcHBlYXIgYW55d2hlcmUgaW4gdGhlIFRXNSByZXBvISBcblx0ICogU28gaXQgaGFzIG5vIGFwcGFyZW50IHB1cnBvc2UuIFxuXHQgKi9cblx0aXNBbm9ueW1vdXM/OiBib29sZWFuXG4pID0+IHZvaWRcblxuaW50ZXJmYWNlIFN5bmNBZGFwdG9yPEFEPiB7XG5cdG5hbWU/OiBzdHJpbmc7XG5cblx0aXNSZWFkeT8oKTogYm9vbGVhbjtcblxuXHRnZXRTdGF0dXM/KFxuXHRcdGNiOiBTZXJ2ZXJTdGF0dXNDYWxsYmFja1xuXHQpOiB2b2lkO1xuXG5cdGdldFNraW5ueVRpZGRsZXJzPyhcblx0XHRjYjogKGVycjogYW55LCB0aWRkbGVyRmllbGRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+W10pID0+IHZvaWRcblx0KTogdm9pZDtcblx0Z2V0VXBkYXRlZFRpZGRsZXJzPyhcblx0XHRzeW5jZXI6IFN5bmNlcixcblx0XHRjYjogKFxuXHRcdFx0ZXJyOiBhbnksXG5cdFx0XHQvKiogQXJyYXlzIG9mIHRpdGxlcyB0aGF0IGhhdmUgYmVlbiBtb2RpZmllZCBvciBkZWxldGVkICovXG5cdFx0XHR1cGRhdGVzPzogeyBtb2RpZmljYXRpb25zOiBzdHJpbmdbXSwgZGVsZXRpb25zOiBzdHJpbmdbXSB9XG5cdFx0KSA9PiB2b2lkXG5cdCk6IHZvaWQ7XG5cblx0LyoqIFxuXHQgKiB1c2VkIHRvIG92ZXJyaWRlIHRoZSBkZWZhdWx0IFN5bmNlciBnZXRUaWRkbGVyUmV2aXNpb24gYmVoYXZpb3Jcblx0ICogb2YgcmV0dXJuaW5nIHRoZSByZXZpc2lvbiBmaWVsZFxuXHQgKiBcblx0ICovXG5cdGdldFRpZGRsZXJSZXZpc2lvbj8odGl0bGU6IHN0cmluZyk6IHN0cmluZztcblx0LyoqIFxuXHQgKiB1c2VkIHRvIGdldCB0aGUgYWRhcHRlciBpbmZvIGZyb20gYSB0aWRkbGVyIGluIHNpdHVhdGlvbnNcblx0ICogb3RoZXIgdGhhbiB0aGUgc2F2ZVRpZGRsZXIgY2FsbGJhY2tcblx0ICovXG5cdGdldFRpZGRsZXJJbmZvKHRpZGRsZXI6IFRpZGRsZXIpOiBBRCB8IHVuZGVmaW5lZDtcblxuXHRzYXZlVGlkZGxlcihcblx0XHR0aWRkbGVyOiBhbnksXG5cdFx0Y2I6IChcblx0XHRcdGVycjogYW55LFxuXHRcdFx0YWRhcHRvckluZm8/OiBBRCxcblx0XHRcdHJldmlzaW9uPzogc3RyaW5nXG5cdFx0KSA9PiB2b2lkLFxuXHRcdGV4dHJhOiB7IHRpZGRsZXJJbmZvOiBTeW5jZXJUaWRkbGVySW5mbzxBRD4gfVxuXHQpOiB2b2lkO1xuXG5cdHNldExvZ2dlclNhdmVCdWZmZXI/OiAobG9nZ2VyRm9yU2F2aW5nOiBMb2dnZXIpID0+IHZvaWQ7XG5cdGRpc3BsYXlMb2dpblByb21wdD8oc3luY2VyOiBTeW5jZXIpOiB2b2lkO1xuXHRsb2dpbj8odXNlcm5hbWU6IHN0cmluZywgcGFzc3dvcmQ6IHN0cmluZywgY2I6IChlcnI6IGFueSkgPT4gdm9pZCk6IHZvaWQ7XG5cdGxvZ291dD8oY2I6IChlcnI6IGFueSkgPT4gdm9pZCk6IGFueTtcbn1cbmludGVyZmFjZSBTeW5jZXJUaWRkbGVySW5mbzxBRD4ge1xuXHQvKiogdGhpcyBjb21lcyBmcm9tIHRoZSB3aWtpIGNoYW5nZUNvdW50IHJlY29yZCAqL1xuXHRjaGFuZ2VDb3VudDogbnVtYmVyO1xuXHQvKiogQWRhcHRlciBpbmZvIHJldHVybmVkIGJ5IHRoZSBzeW5jIGFkYXB0ZXIgKi9cblx0YWRhcHRvckluZm86IEFEO1xuXHQvKiogUmV2aXNpb24gcmV0dXJuIGJ5IHRoZSBzeW5jIGFkYXB0ZXIgKi9cblx0cmV2aXNpb246IHN0cmluZztcblx0LyoqIFRpbWVzdGFtcCBzZXQgaW4gdGhlIGNhbGxiYWNrIG9mIHRoZSBwcmV2aW91cyBzYXZlICovXG5cdHRpbWVzdGFtcExhc3RTYXZlZDogRGF0ZTtcbn1cblxuZGVjbGFyZSBjb25zdCAkdHc6IGFueTtcblxuZGVjbGFyZSBjb25zdCBleHBvcnRzOiB7XG5cdGFkYXB0b3JDbGFzczogdHlwZW9mIE11bHRpV2lraUNsaWVudEFkYXB0b3I7XG59O1xuXG52YXIgQ09ORklHX0hPU1RfVElERExFUiA9IFwiJDovY29uZmlnL211bHRpd2lraWNsaWVudC9ob3N0XCIsXG5cdERFRkFVTFRfSE9TVF9USURETEVSID0gXCIkcHJvdG9jb2wkLy8kaG9zdCQvXCIsXG5cdE1XQ19TVEFURV9USURETEVSX1BSRUZJWCA9IFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L1wiLFxuXHRCQUdfU1RBVEVfVElERExFUiA9IFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L3RpZGRsZXJzL2JhZ1wiLFxuXHRSRVZJU0lPTl9TVEFURV9USURETEVSID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvdGlkZGxlcnMvcmV2aXNpb25cIixcblx0Q09OTkVDVElPTl9TVEFURV9USURETEVSID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvY29ubmVjdGlvblwiLFxuXHRJTkNPTUlOR19VUERBVEVTX0ZJTFRFUl9USURETEVSID0gXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L2luY29taW5nLXVwZGF0ZXMtZmlsdGVyXCIsXG5cdEVOQUJMRV9TU0VfVElERExFUiA9IFwiJDovY29uZmlnL211bHRpd2lraWNsaWVudC91c2Utc2VydmVyLXNlbnQtZXZlbnRzXCIsXG5cdElTX0RFVl9NT0RFX1RJRERMRVIgPSBgJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L2Rldi1tb2RlYCxcblx0RU5BQkxFX0daSVBfU1RSRUFNX1RJRERMRVIgPSBgJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L2d6aXAtc3RyZWFtYDtcblxuXG52YXIgU0VSVkVSX05PVF9DT05ORUNURUQgPSBcIk5PVCBDT05ORUNURURcIixcblx0U0VSVkVSX0NPTk5FQ1RJTkdfU1NFID0gXCJDT05ORUNUSU5HIFNTRVwiLFxuXHRTRVJWRVJfQ09OTkVDVEVEX1NTRSA9IFwiQ09OTkVDVEVEIFNTRVwiLFxuXHRTRVJWRVJfUE9MTElORyA9IFwiU0VSVkVSIFBPTExJTkdcIjtcblxuaW50ZXJmYWNlIE1XU0FkYXB0b3JJbmZvIHtcblx0YmFnOiBzdHJpbmdcbn1cblxuXG5jbGFzcyBNdWx0aVdpa2lDbGllbnRBZGFwdG9yIGltcGxlbWVudHMgU3luY0FkYXB0b3I8TVdTQWRhcHRvckluZm8+IHtcblx0cHJpdmF0ZSB3aWtpO1xuXHRwcml2YXRlIGhvc3Q7XG5cdHByaXZhdGUgcmVjaXBlO1xuXHRwcml2YXRlIHVzZVNlcnZlclNlbnRFdmVudHM7XG5cdHByaXZhdGUgbGFzdF9rbm93bl9yZXZpc2lvbl9pZDtcblx0cHJpdmF0ZSBvdXRzdGFuZGluZ1JlcXVlc3RzO1xuXHRwcml2YXRlIGxhc3RSZWNvcmRlZFVwZGF0ZTtcblx0cHJpdmF0ZSBsb2dnZXI7XG5cdHByaXZhdGUgaXNMb2dnZWRJbjtcblx0cHJpdmF0ZSBpc1JlYWRPbmx5O1xuXHRwcml2YXRlIG9mZmxpbmU7XG5cdHByaXZhdGUgdXNlcm5hbWU7XG5cdHByaXZhdGUgaW5jb21pbmdVcGRhdGVzRmlsdGVyRm47XG5cdHByaXZhdGUgc2VydmVyVXBkYXRlQ29ubmVjdGlvblN0YXR1cyE6IHN0cmluZztcblx0cHJpdmF0ZSBpc0Rldk1vZGU6IGJvb2xlYW47XG5cdHByaXZhdGUgdXNlR3ppcFN0cmVhbTogYm9vbGVhbjtcblxuXHRuYW1lID0gXCJtdWx0aXdpa2ljbGllbnRcIjtcblx0cHJpdmF0ZSBzdXBwb3J0c0xhenlMb2FkaW5nID0gdHJ1ZTtcblx0Y29uc3RydWN0b3Iob3B0aW9uczogeyB3aWtpOiBhbnkgfSkge1xuXHRcdHRoaXMud2lraSA9IG9wdGlvbnMud2lraTtcblx0XHR0aGlzLmhvc3QgPSB0aGlzLmdldEhvc3QoKTtcblx0XHR0aGlzLnJlY2lwZSA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChcIiQ6L2NvbmZpZy9tdWx0aXdpa2ljbGllbnQvcmVjaXBlXCIpO1xuXHRcdHRoaXMudXNlU2VydmVyU2VudEV2ZW50cyA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChFTkFCTEVfU1NFX1RJRERMRVIpID09PSBcInllc1wiO1xuXHRcdHRoaXMuaXNEZXZNb2RlID0gdGhpcy53aWtpLmdldFRpZGRsZXJUZXh0KElTX0RFVl9NT0RFX1RJRERMRVIpID09PSBcInllc1wiO1xuXHRcdHRoaXMudXNlR3ppcFN0cmVhbSA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChFTkFCTEVfR1pJUF9TVFJFQU1fVElERExFUikgPT09IFwieWVzXCI7XG5cdFx0dGhpcy5sYXN0X2tub3duX3JldmlzaW9uX2lkID0gdGhpcy53aWtpLmdldFRpZGRsZXJUZXh0KFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L3JlY2lwZS9sYXN0X3JldmlzaW9uX2lkXCIsIFwiMFwiKVxuXHRcdHRoaXMub3V0c3RhbmRpbmdSZXF1ZXN0cyA9IE9iamVjdC5jcmVhdGUobnVsbCk7IC8vIEhhc2htYXAgYnkgdGl0bGUgb2Ygb3V0c3RhbmRpbmcgcmVxdWVzdCBvYmplY3Q6IHt0eXBlOiBcIlBVVFwifFwiR0VUXCJ8XCJERUxFVEVcIn1cblx0XHR0aGlzLmxhc3RSZWNvcmRlZFVwZGF0ZSA9IE9iamVjdC5jcmVhdGUobnVsbCk7IC8vIEhhc2htYXAgYnkgdGl0bGUgb2YgbGFzdCByZWNvcmRlZCB1cGRhdGUgdmlhIFNTRToge3R5cGU6IFwidXBkYXRlXCJ8XCJkZXRldGlvblwiLCByZXZpc2lvbl9pZDp9XG5cdFx0dGhpcy5sb2dnZXIgPSBuZXcgJHR3LnV0aWxzLkxvZ2dlcihcIk11bHRpV2lraUNsaWVudEFkYXB0b3JcIik7XG5cdFx0dGhpcy5pc0xvZ2dlZEluID0gZmFsc2U7XG5cdFx0dGhpcy5pc1JlYWRPbmx5ID0gZmFsc2U7XG5cdFx0dGhpcy5vZmZsaW5lID0gZmFsc2U7XG5cdFx0dGhpcy51c2VybmFtZSA9IFwiXCI7XG5cdFx0Ly8gQ29tcGlsZSB0aGUgZGlydHkgdGlkZGxlciBmaWx0ZXJcblx0XHR0aGlzLmluY29taW5nVXBkYXRlc0ZpbHRlckZuID0gdGhpcy53aWtpLmNvbXBpbGVGaWx0ZXIodGhpcy53aWtpLmdldFRpZGRsZXJUZXh0KElOQ09NSU5HX1VQREFURVNfRklMVEVSX1RJRERMRVIpKTtcblx0XHR0aGlzLnNldFVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMoU0VSVkVSX05PVF9DT05ORUNURUQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKHN0YXR1czogc3RyaW5nKSB7XG5cdFx0dGhpcy5zZXJ2ZXJVcGRhdGVDb25uZWN0aW9uU3RhdHVzID0gc3RhdHVzO1xuXHRcdHRoaXMud2lraS5hZGRUaWRkbGVyKHtcblx0XHRcdHRpdGxlOiBDT05ORUNUSU9OX1NUQVRFX1RJRERMRVIsXG5cdFx0XHR0ZXh0OiBzdGF0dXNcblx0XHR9KTtcblx0fVxuXHRzZXRMb2dnZXJTYXZlQnVmZmVyKGxvZ2dlckZvclNhdmluZzogTG9nZ2VyKSB7XG5cdFx0dGhpcy5sb2dnZXIuc2V0U2F2ZUJ1ZmZlcihsb2dnZXJGb3JTYXZpbmcpO1xuXHR9XG5cdGlzUmVhZHkoKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHJpdmF0ZSBnZXRIb3N0KCkge1xuXHRcdHZhciB0ZXh0ID0gdGhpcy53aWtpLmdldFRpZGRsZXJUZXh0KENPTkZJR19IT1NUX1RJRERMRVIsIERFRkFVTFRfSE9TVF9USURETEVSKSwgc3Vic3RpdHV0aW9ucyA9IFtcblx0XHRcdHsgbmFtZTogXCJwcm90b2NvbFwiLCB2YWx1ZTogZG9jdW1lbnQubG9jYXRpb24ucHJvdG9jb2wgfSxcblx0XHRcdHsgbmFtZTogXCJob3N0XCIsIHZhbHVlOiBkb2N1bWVudC5sb2NhdGlvbi5ob3N0IH0sXG5cdFx0XHR7IG5hbWU6IFwicGF0aG5hbWVcIiwgdmFsdWU6IGRvY3VtZW50LmxvY2F0aW9uLnBhdGhuYW1lIH1cblx0XHRdO1xuXHRcdGZvciAodmFyIHQgPSAwOyB0IDwgc3Vic3RpdHV0aW9ucy5sZW5ndGg7IHQrKykge1xuXHRcdFx0dmFyIHMgPSBzdWJzdGl0dXRpb25zW3RdO1xuXHRcdFx0dGV4dCA9ICR0dy51dGlscy5yZXBsYWNlU3RyaW5nKHRleHQsIG5ldyBSZWdFeHAoXCJcXFxcJFwiICsgcy5uYW1lICsgXCJcXFxcJFwiLCBcIm1nXCIpLCBzLnZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRleHQ7XG5cdH1cblxuXHQvKiogXG5cdCAqIFRoaXMgdGhyb3dzIGFuIGVycm9yIGlmIHRoZSByZXNwb25zZSBzdGF0dXMgaXMgbm90IDJ4eCwgYnV0IHdpbGwgc3RpbGwgcmV0dXJuIHRoZSByZXNwb25zZSBhbG9uZ3NpZGUgdGhlIGVycm9yLlxuXHQgKiBcblx0ICogU28gaWYgdGhlIGZpcnN0IHBhcmFtZXRlciBpcyBmYWxzZSwgdGhlIHRoaXJkIHBhcmFtZXRlciBtYXkgc3RpbGwgY29udGFpbiB0aGUgcmVzcG9uc2UuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIHJlY2lwZVJlcXVlc3Q8S0VZIGV4dGVuZHMgKHN0cmluZyAmIGtleW9mIFRpZGRsZXJSb3V0ZXJSZXNwb25zZSk+KFxuXHRcdG9wdGlvbnM6IE9taXQ8SHR0cFJlcXVlc3RPcHRpb25zPFwiYXJyYXlidWZmZXJcIj4sIFwicmVzcG9uc2VUeXBlXCI+ICYgeyBrZXk6IEtFWSB9XG5cdCkge1xuXHRcdGlmICghb3B0aW9ucy51cmwuc3RhcnRzV2l0aChcIi9cIikpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJUaGUgdXJsIGRvZXMgbm90IHN0YXJ0IHdpdGggYSBzbGFzaFwiKTtcblxuXHRcdHJldHVybiBhd2FpdCBodHRwUmVxdWVzdCh7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0cmVzcG9uc2VUeXBlOiBcImJsb2JcIixcblx0XHRcdHVybDogdGhpcy5ob3N0ICsgXCJ3aWtpL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMucmVjaXBlKSArIG9wdGlvbnMudXJsLFxuXHRcdH0pLnRoZW4oYXN5bmMgZSA9PiB7XG5cdFx0XHRpZiAoIWUub2spIHJldHVybiBbXG5cdFx0XHRcdGZhbHNlLCBuZXcgRXJyb3IoXG5cdFx0XHRcdFx0YFRoZSBzZXJ2ZXIgcmV0dXJuIGEgc3RhdHVzIGNvZGUgJHtlLnN0YXR1c30gd2l0aCB0aGUgZm9sbG93aW5nIHJlYXNvbjogYFxuXHRcdFx0XHRcdCsgYCR7ZS5oZWFkZXJzLmdldChcIngtcmVhc29uXCIpID8/IFwiKG5vIHJlYXNvbiBnaXZlbilcIn1gXG5cdFx0XHRcdCksIGVcblx0XHRcdF0gYXMgY29uc3Q7XG5cdFx0XHRsZXQgcmVzcG9uc2VTdHJpbmc6IHN0cmluZyA9IFwiXCI7XG5cdFx0XHRpZiAoZS5oZWFkZXJzLmdldChcIngtZ3ppcC1zdHJlYW1cIikgPT09IFwieWVzXCIpIHtcblx0XHRcdFx0Ly8gQnJvd3NlcnMgb25seSBkZWNvZGUgdGhlIGZpcnN0IHN0cmVhbSwgXG5cdFx0XHRcdC8vIHNvIHdlIGNhbnQgdXNlIGNvbnRlbnQtZW5jb2Rpbmcgb3IgRGVjb21wcmVzc2lvblN0cmVhbVxuXG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KGFzeW5jIHJlc29sdmUgPT4ge1xuXG5cdFx0XHRcdFx0Y29uc3QgZ3VuemlwID0gbmV3IGZmbGF0ZS5Bc3luY0d1bnppcCgoZXJyLCBjaHVuaywgZmluYWwpID0+IHtcblx0XHRcdFx0XHRcdGlmIChlcnIpIHJldHVybiBjb25zb2xlLmxvZyhlcnIpO1xuXHRcdFx0XHRcdFx0cmVzcG9uc2VTdHJpbmcgKz0gZmZsYXRlLnN0ckZyb21VOChjaHVuayk7XG5cdFx0XHRcdFx0XHRpZiAoZmluYWwpIHJlc29sdmUoKTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGlmICh0aGlzLmlzRGV2TW9kZSkgZ3VuemlwLm9ubWVtYmVyID0gZSA9PiBjb25zb2xlLmxvZyhcImd1bnppcCBtZW1iZXJcIiwgZSk7XG5cblx0XHRcdFx0XHRndW56aXAucHVzaChuZXcgVWludDhBcnJheShhd2FpdCByZWFkQmxvYkFzQXJyYXlCdWZmZXIoZS5yZXNwb25zZSkpKTtcblx0XHRcdFx0XHQvLyB0aGlzIGhhcyB0byBiZSBvbiBhIHNlcGFyYXRlIGxpbmVcblx0XHRcdFx0XHRndW56aXAucHVzaChuZXcgVWludDhBcnJheSgpLCB0cnVlKTtcblxuXHRcdFx0XHR9KTtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzcG9uc2VTdHJpbmcgPSBmZmxhdGUuc3RyRnJvbVU4KG5ldyBVaW50OEFycmF5KGF3YWl0IHJlYWRCbG9iQXNBcnJheUJ1ZmZlcihlLnJlc3BvbnNlKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5pc0Rldk1vZGUpIGNvbnNvbGUubG9nKFwiZ3VuemlwIHJlc3VsdFwiLCByZXNwb25zZVN0cmluZy5sZW5ndGgpO1xuXG5cdFx0XHRyZXR1cm4gW3RydWUsIHZvaWQgMCwge1xuXHRcdFx0XHQuLi5lLFxuXHRcdFx0XHRyZXNwb25zZVN0cmluZyxcblx0XHRcdFx0LyoqIHRoaXMgaXMgdW5kZWZpbmVkIGlmIHN0YXR1cyBpcyBub3QgMjAwICovXG5cdFx0XHRcdHJlc3BvbnNlSlNPTjogZS5zdGF0dXMgPT09IDIwMFxuXHRcdFx0XHRcdD8gdHJ5UGFyc2VKU09OKHJlc3BvbnNlU3RyaW5nKSBhcyBUaWRkbGVyUm91dGVyUmVzcG9uc2VbS0VZXVtcIlJcIl1cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdH1dIGFzIGNvbnN0O1xuXHRcdH0sIGUgPT4gW2ZhbHNlLCBlLCB2b2lkIDBdIGFzIGNvbnN0KTtcblxuXHRcdGZ1bmN0aW9uIHRyeVBhcnNlSlNPTihkYXRhOiBzdHJpbmcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBKU09OLnBhcnNlKGRhdGEpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKFwiRXJyb3IgcGFyc2luZyBKU09OLCByZXR1cm5pbmcgdW5kZWZpbmVkXCIsIGUpO1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZyhkYXRhKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0fVxuXG5cdGdldFRpZGRsZXJJbmZvKHRpZGRsZXI6IFRpZGRsZXIpIHtcblx0XHR2YXIgdGl0bGUgPSB0aWRkbGVyLmZpZWxkcy50aXRsZSxcblx0XHRcdHJldmlzaW9uID0gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oUkVWSVNJT05fU1RBVEVfVElERExFUiwgdGl0bGUpLFxuXHRcdFx0YmFnID0gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oQkFHX1NUQVRFX1RJRERMRVIsIHRpdGxlKTtcblx0XHRpZiAocmV2aXNpb24gJiYgYmFnKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0aXRsZTogdGl0bGUsXG5cdFx0XHRcdHJldmlzaW9uOiByZXZpc2lvbixcblx0XHRcdFx0YmFnOiBiYWdcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cdHByaXZhdGUgZ2V0VGlkZGxlckJhZyh0aXRsZTogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMud2lraS5leHRyYWN0VGlkZGxlckRhdGFJdGVtKEJBR19TVEFURV9USURETEVSLCB0aXRsZSk7XG5cdH1cblx0Z2V0VGlkZGxlclJldmlzaW9uKHRpdGxlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oUkVWSVNJT05fU1RBVEVfVElERExFUiwgdGl0bGUpO1xuXHR9XG5cdHByaXZhdGUgc2V0VGlkZGxlckluZm8odGl0bGU6IHN0cmluZywgcmV2aXNpb246IHN0cmluZywgYmFnOiBzdHJpbmcpIHtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChCQUdfU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIGJhZywgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChSRVZJU0lPTl9TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgcmV2aXNpb24sIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdH1cblx0cHJpdmF0ZSByZW1vdmVUaWRkbGVySW5mbyh0aXRsZTogc3RyaW5nKSB7XG5cdFx0dGhpcy53aWtpLnNldFRleHQoQkFHX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCB1bmRlZmluZWQsIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdFx0dGhpcy53aWtpLnNldFRleHQoUkVWSVNJT05fU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIHVuZGVmaW5lZCwgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0fVxuXG5cdGVycm9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0Lypcblx0R2V0IHRoZSBjdXJyZW50IHN0YXR1cyBvZiB0aGUgc2VydmVyIGNvbm5lY3Rpb25cblx0Ki9cblx0YXN5bmMgZ2V0U3RhdHVzKGNhbGxiYWNrOiBTZXJ2ZXJTdGF0dXNDYWxsYmFjaykge1xuXG5cdFx0Y29uc3QgW29rLCBlcnJvciwgZGF0YV0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3Qoe1xuXHRcdFx0a2V5OiBcImhhbmRsZUdldFJlY2lwZVN0YXR1c1wiLFxuXHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdFx0dXJsOiBcIi9zdGF0dXNcIixcblx0XHR9KTtcblx0XHRpZiAoIW9rICYmIGRhdGE/LnN0YXR1cyA9PT0gMCkge1xuXHRcdFx0dGhpcy5lcnJvciA9IFwiVGhlIHdlYnBhZ2UgaXMgZm9yYmlkZGVuIGZyb20gY29udGFjdGluZyB0aGUgc2VydmVyLlwiXG5cdFx0XHR0aGlzLmlzTG9nZ2VkSW4gPSBmYWxzZTtcblx0XHRcdHRoaXMuaXNSZWFkT25seSA9IHRydWU7XG5cdFx0XHR0aGlzLnVzZXJuYW1lID0gXCIob2ZmbGluZSlcIjtcblx0XHRcdHRoaXMub2ZmbGluZSA9IHRydWU7XG5cdFx0fSBlbHNlIGlmIChvaykge1xuXHRcdFx0dGhpcy5lcnJvciA9IG51bGw7XG5cdFx0XHRjb25zdCBzdGF0dXMgPSBkYXRhLnJlc3BvbnNlSlNPTjtcblx0XHRcdHRoaXMuaXNSZWFkT25seSA9IHN0YXR1cz8uaXNSZWFkT25seSA/PyB0cnVlO1xuXHRcdFx0dGhpcy5pc0xvZ2dlZEluID0gc3RhdHVzPy5pc0xvZ2dlZEluID8/IGZhbHNlO1xuXHRcdFx0dGhpcy51c2VybmFtZSA9IHN0YXR1cz8udXNlcm5hbWUgPz8gXCIoYW5vbilcIjtcblx0XHRcdHRoaXMub2ZmbGluZSA9IGZhbHNlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVycm9yID0gZXJyb3IubWVzc2FnZSA/PyBgJHtlcnJvcn1gO1xuXHRcdH1cblx0XHRpZiAoY2FsbGJhY2spIHtcblx0XHRcdGNhbGxiYWNrKFxuXHRcdFx0XHQvLyBFcnJvclxuXHRcdFx0XHR0aGlzLmVycm9yLFxuXHRcdFx0XHQvLyBJcyBsb2dnZWQgaW5cblx0XHRcdFx0dGhpcy5pc0xvZ2dlZEluLFxuXHRcdFx0XHQvLyBVc2VybmFtZVxuXHRcdFx0XHR0aGlzLnVzZXJuYW1lLFxuXHRcdFx0XHQvLyBJcyByZWFkIG9ubHlcblx0XHRcdFx0dGhpcy5pc1JlYWRPbmx5LFxuXHRcdFx0XHQvLyBJcyBhbm9ueW1vdXNcblx0XHRcdFx0Ly8gbm8gaWRlYSB3aGF0IHRoaXMgbWVhbnMsIGFsd2F5cyByZXR1cm4gZmFsc2Vcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXHQvKlxuXHRHZXQgZGV0YWlscyBvZiBjaGFuZ2VkIHRpZGRsZXJzIGZyb20gdGhlIHNlcnZlclxuXHQqL1xuXHRnZXRVcGRhdGVkVGlkZGxlcnMoc3luY2VyOiBTeW5jZXIsIGNhbGxiYWNrOiAoZXJyOiBhbnksIGNoYW5nZXM/OiB7IG1vZGlmaWNhdGlvbnM6IHN0cmluZ1tdOyBkZWxldGlvbnM6IHN0cmluZ1tdIH0pID0+IHZvaWQpIHtcblx0XHRpZiAodGhpcy5vZmZsaW5lKSByZXR1cm4gY2FsbGJhY2sobnVsbCk7XG5cdFx0aWYgKCF0aGlzLnVzZVNlcnZlclNlbnRFdmVudHMpIHtcblx0XHRcdHRoaXMucG9sbFNlcnZlcigpLnRoZW4oY2hhbmdlcyA9PiB7XG5cdFx0XHRcdGNhbGxiYWNrKG51bGwsIGNoYW5nZXMpO1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHQvLyBJZiBCcm93c3dlciBTdG9yYWdlIHRpZGRsZXJzIHdlcmUgY2FjaGVkIG9uIHJlbG9hZGluZyB0aGUgd2lraSwgYWRkIHRoZW0gYWZ0ZXIgc3luYyBmcm9tIHNlcnZlciBjb21wbGV0ZXMgaW4gdGhlIGFib3ZlIGNhbGxiYWNrLlxuXHRcdFx0XHRcdGlmICgkdHcuYnJvd3NlclN0b3JhZ2UgJiYgJHR3LmJyb3dzZXJTdG9yYWdlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0XHQkdHcuYnJvd3NlclN0b3JhZ2UuYWRkQ2FjaGVkVGlkZGxlcnMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSwgZXJyID0+IHtcblx0XHRcdFx0Y2FsbGJhY2soZXJyKTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHQvLyBEbyBub3RoaW5nIGlmIHRoZXJlJ3MgYWxyZWFkeSBhIGNvbm5lY3Rpb24gaW4gcHJvZ3Jlc3MuXG5cdFx0aWYgKHRoaXMuc2VydmVyVXBkYXRlQ29ubmVjdGlvblN0YXR1cyAhPT0gU0VSVkVSX05PVF9DT05ORUNURUQpIHtcblx0XHRcdHJldHVybiBjYWxsYmFjayhudWxsLCB7XG5cdFx0XHRcdG1vZGlmaWNhdGlvbnM6IFtdLFxuXHRcdFx0XHRkZWxldGlvbnM6IFtdXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Ly8gVHJ5IHRvIGNvbm5lY3QgYSBzZXJ2ZXIgc3RyZWFtXG5cdFx0dGhpcy5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9DT05ORUNUSU5HX1NTRSk7XG5cdFx0dGhpcy5jb25uZWN0U2VydmVyU3RyZWFtKHtcblx0XHRcdHN5bmNlcjogc3luY2VyLFxuXHRcdFx0b25lcnJvcjogYXN5bmMgZnVuY3Rpb24gKGVycikge1xuXHRcdFx0XHRzZWxmLmxvZ2dlci5sb2coXCJFcnJvciBjb25uZWN0aW5nIFNTRSBzdHJlYW1cIiwgZXJyKTtcblx0XHRcdFx0Ly8gSWYgdGhlIHN0cmVhbSBkaWRuJ3Qgd29yaywgdHJ5IHBvbGxpbmdcblx0XHRcdFx0c2VsZi5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9QT0xMSU5HKTtcblx0XHRcdFx0Y29uc3QgY2hhbmdlcyA9IGF3YWl0IHNlbGYucG9sbFNlcnZlcigpO1xuXHRcdFx0XHRzZWxmLnNldFVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMoU0VSVkVSX05PVF9DT05ORUNURUQpO1xuXHRcdFx0XHRjYWxsYmFjayhudWxsLCBjaGFuZ2VzKTtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gSWYgQnJvd3N3ZXIgU3RvcmFnZSB0aWRkbGVycyB3ZXJlIGNhY2hlZCBvbiByZWxvYWRpbmcgdGhlIHdpa2ksIGFkZCB0aGVtIGFmdGVyIHN5bmMgZnJvbSBzZXJ2ZXIgY29tcGxldGVzIGluIHRoZSBhYm92ZSBjYWxsYmFjay5cblx0XHRcdFx0XHRpZiAoJHR3LmJyb3dzZXJTdG9yYWdlICYmICR0dy5icm93c2VyU3RvcmFnZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdFx0JHR3LmJyb3dzZXJTdG9yYWdlLmFkZENhY2hlZFRpZGRsZXJzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRvbm9wZW46IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0c2VsZi5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9DT05ORUNURURfU1NFKTtcblx0XHRcdFx0Ly8gVGhlIHN5bmNlciBpcyBleHBlY3RpbmcgYSBjYWxsYmFjayBidXQgd2UgZG9uJ3QgaGF2ZSBhbnkgZGF0YSB0byBzZW5kXG5cdFx0XHRcdGNhbGxiYWNrKG51bGwsIHtcblx0XHRcdFx0XHRtb2RpZmljYXRpb25zOiBbXSxcblx0XHRcdFx0XHRkZWxldGlvbnM6IFtdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdH1cblx0Lypcblx0QXR0ZW1wdCB0byBlc3RhYmxpc2ggYW4gU1NFIHN0cmVhbSB3aXRoIHRoZSBzZXJ2ZXIgYW5kIHRyYW5zZmVyIHRpZGRsZXIgY2hhbmdlcy4gT3B0aW9ucyBpbmNsdWRlOlxuICBcblx0c3luY2VyOiByZWZlcmVuY2UgdG8gc3luY2VyIG9iamVjdCB1c2VkIGZvciBzdG9yaW5nIGRhdGFcblx0b25vcGVuOiBpbnZva2VkIHdoZW4gdGhlIHN0cmVhbSBpcyBzdWNjZXNzZnVsbHkgb3BlbmVkXG5cdG9uZXJyb3I6IGludm9rZWQgaWYgdGhlcmUgaXMgYW4gZXJyb3Jcblx0Ki9cblx0cHJpdmF0ZSBjb25uZWN0U2VydmVyU3RyZWFtKG9wdGlvbnM6IHtcblx0XHRzeW5jZXI6IFN5bmNlcjtcblx0XHRvbm9wZW46IChldmVudDogRXZlbnQpID0+IHZvaWQ7XG5cdFx0b25lcnJvcjogKGV2ZW50OiBFdmVudCkgPT4gdm9pZDtcblx0fSkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRjb25zdCBldmVudFNvdXJjZSA9IG5ldyBFdmVudFNvdXJjZShcIi9yZWNpcGVzL1wiICsgdGhpcy5yZWNpcGUgKyBcIi9ldmVudHM/bGFzdF9rbm93bl9yZXZpc2lvbl9pZD1cIiArIHRoaXMubGFzdF9rbm93bl9yZXZpc2lvbl9pZCk7XG5cdFx0ZXZlbnRTb3VyY2Uub25lcnJvciA9IGZ1bmN0aW9uIChldmVudCkge1xuXHRcdFx0aWYgKG9wdGlvbnMub25lcnJvcikge1xuXHRcdFx0XHRvcHRpb25zLm9uZXJyb3IoZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZXZlbnRTb3VyY2Uub25vcGVuID0gZnVuY3Rpb24gKGV2ZW50KSB7XG5cdFx0XHRpZiAob3B0aW9ucy5vbm9wZW4pIHtcblx0XHRcdFx0b3B0aW9ucy5vbm9wZW4oZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZXZlbnRTb3VyY2UuYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCBmdW5jdGlvbiAoZXZlbnQpIHtcblxuXHRcdFx0Y29uc3QgZGF0YToge1xuXHRcdFx0XHR0aXRsZTogc3RyaW5nO1xuXHRcdFx0XHRyZXZpc2lvbl9pZDogbnVtYmVyO1xuXHRcdFx0XHRpc19kZWxldGVkOiBib29sZWFuO1xuXHRcdFx0XHRiYWdfbmFtZTogc3RyaW5nO1xuXHRcdFx0XHR0aWRkbGVyOiBhbnk7XG5cdFx0XHR9ID0gJHR3LnV0aWxzLnBhcnNlSlNPTlNhZmUoZXZlbnQuZGF0YSk7XG5cdFx0XHRpZiAoIWRhdGEpIHJldHVybjtcblxuXHRcdFx0Y29uc29sZS5sb2coXCJTU0UgZGF0YVwiLCBkYXRhKTtcblx0XHRcdC8vIFVwZGF0ZSBsYXN0IHNlZW4gcmV2aXNpb25faWRcblx0XHRcdGlmIChkYXRhLnJldmlzaW9uX2lkID4gc2VsZi5sYXN0X2tub3duX3JldmlzaW9uX2lkKSB7XG5cdFx0XHRcdHNlbGYubGFzdF9rbm93bl9yZXZpc2lvbl9pZCA9IGRhdGEucmV2aXNpb25faWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBSZWNvcmQgdGhlIGxhc3QgdXBkYXRlIHRvIHRoaXMgdGlkZGxlclxuXHRcdFx0c2VsZi5sYXN0UmVjb3JkZWRVcGRhdGVbZGF0YS50aXRsZV0gPSB7XG5cdFx0XHRcdHR5cGU6IGRhdGEuaXNfZGVsZXRlZCA/IFwiZGVsZXRpb25cIiA6IFwidXBkYXRlXCIsXG5cdFx0XHRcdHJldmlzaW9uX2lkOiBkYXRhLnJldmlzaW9uX2lkXG5cdFx0XHR9O1xuXHRcdFx0Y29uc29sZS5sb2coYE91c3RhbmRpbmcgcmVxdWVzdHMgaXMgJHtKU09OLnN0cmluZ2lmeShzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbZGF0YS50aXRsZV0pfWApO1xuXHRcdFx0Ly8gUHJvY2VzcyB0aGUgdXBkYXRlIGlmIHRoZSB0aWRkbGVyIGlzIG5vdCB0aGUgc3ViamVjdCBvZiBhbiBvdXRzdGFuZGluZyByZXF1ZXN0XG5cdFx0XHRpZiAoc2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW2RhdGEudGl0bGVdKSByZXR1cm47XG5cdFx0XHRpZiAoZGF0YS5pc19kZWxldGVkKSB7XG5cdFx0XHRcdHNlbGYucmVtb3ZlVGlkZGxlckluZm8oZGF0YS50aXRsZSk7XG5cdFx0XHRcdGRlbGV0ZSBvcHRpb25zLnN5bmNlci50aWRkbGVySW5mb1tkYXRhLnRpdGxlXTtcblx0XHRcdFx0b3B0aW9ucy5zeW5jZXIubG9nZ2VyLmxvZyhcIkRlbGV0aW5nIHRpZGRsZXIgbWlzc2luZyBmcm9tIHNlcnZlcjpcIiwgZGF0YS50aXRsZSk7XG5cdFx0XHRcdG9wdGlvbnMuc3luY2VyLndpa2kuZGVsZXRlVGlkZGxlcihkYXRhLnRpdGxlKTtcblx0XHRcdFx0b3B0aW9ucy5zeW5jZXIucHJvY2Vzc1Rhc2tRdWV1ZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmFyIHJlc3VsdCA9IHNlbGYuaW5jb21pbmdVcGRhdGVzRmlsdGVyRm4uY2FsbChzZWxmLndpa2ksIHNlbGYud2lraS5tYWtlVGlkZGxlckl0ZXJhdG9yKFtkYXRhLnRpdGxlXSkpO1xuXHRcdFx0XHRpZiAocmVzdWx0Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRzZWxmLnNldFRpZGRsZXJJbmZvKGRhdGEudGl0bGUsIGRhdGEucmV2aXNpb25faWQudG9TdHJpbmcoKSwgZGF0YS5iYWdfbmFtZSk7XG5cdFx0XHRcdFx0b3B0aW9ucy5zeW5jZXIuc3RvcmVUaWRkbGVyKGRhdGEudGlkZGxlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXG5cdFx0fSk7XG5cdH1cblx0cHJpdmF0ZSBhc3luYyBwb2xsU2VydmVyKCkge1xuXHRcdHR5cGUgdCA9IFRpZGRsZXJSb3V0ZXJSZXNwb25zZVtcImhhbmRsZUdldEJhZ1N0YXRlc1wiXVxuXHRcdGNvbnN0IFtvaywgZXJyLCByZXN1bHRdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdGtleTogXCJoYW5kbGVHZXRCYWdTdGF0ZXNcIixcblx0XHRcdHVybDogXCIvYmFnLXN0YXRlc1wiLFxuXHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdFx0cXVlcnlQYXJhbXM6IHtcblx0XHRcdFx0aW5jbHVkZV9kZWxldGVkOiBcInllc1wiLFxuXHRcdFx0XHQuLi50aGlzLnVzZUd6aXBTdHJlYW0gPyB7IGd6aXBfc3RyZWFtOiBcInllc1wiIH0gOiB7fSxcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICghb2spIHRocm93IGVycjtcblxuXHRcdGNvbnN0IGJhZ3MgPSByZXN1bHQucmVzcG9uc2VKU09OO1xuXG5cdFx0aWYgKCFiYWdzKSB0aHJvdyBuZXcgRXJyb3IoXCJubyByZXN1bHQgcmV0dXJuZWRcIik7XG5cblx0XHRiYWdzLnNvcnQoKGEsIGIpID0+IGIucG9zaXRpb24gLSBhLnBvc2l0aW9uKTtcblx0XHRjb25zdCBtb2RpZmllZCA9IG5ldyBTZXQ8c3RyaW5nPigpLFxuXHRcdFx0ZGVsZXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0Y29uc3QgaW5jb21pbmdUaXRsZXMgPSBuZXcgU2V0PHN0cmluZz4oYmFncy5tYXAoXG5cdFx0XHQvLyBnZXQgdGhlIHRpdGxlcyBpbiBlYWNoIGxheWVyIHRoYXQgYXJlbid0IGRlbGV0ZWRcblx0XHRcdGUgPT4gZS50aWRkbGVycy5maWx0ZXIoZiA9PiAhZi5pc19kZWxldGVkKS5tYXAoZiA9PiBmLnRpdGxlKVxuXHRcdFx0Ly8gYW5kIGZsYXR0ZW4gdGhlbSBmb3IgU2V0XG5cdFx0KS5mbGF0KCkpO1xuXG5cdFx0bGV0IGxhc3RfcmV2aXNpb24gPSB0aGlzLmxhc3Rfa25vd25fcmV2aXNpb25faWQ7XG5cblx0XHRiYWdzLmZvckVhY2goYmFnID0+IHtcblx0XHRcdGJhZy50aWRkbGVycy5mb3JFYWNoKHRpZCA9PiB7XG5cdFx0XHRcdC8vIGlmIHRoZSByZXZpc2lvbiBpcyBvbGQsIGlnbm9yZSwgc2luY2UgZGVsZXRpb25zIGNyZWF0ZSBhIG5ldyByZXZpc2lvblxuXHRcdFx0XHRpZiAodGlkLnJldmlzaW9uX2lkIDw9IHRoaXMubGFzdF9rbm93bl9yZXZpc2lvbl9pZCkgcmV0dXJuO1xuXHRcdFx0XHRpZiAodGlkLnJldmlzaW9uX2lkID4gbGFzdF9yZXZpc2lvbikgbGFzdF9yZXZpc2lvbiA9IHRpZC5yZXZpc2lvbl9pZDtcblx0XHRcdFx0Ly8gY2hlY2sgaWYgdGhpcyB0aXRsZSBzdGlsbCBleGlzdHMgaW4gYW55IGxheWVyXG5cdFx0XHRcdGlmIChpbmNvbWluZ1RpdGxlcy5oYXModGlkLnRpdGxlKSlcblx0XHRcdFx0XHRtb2RpZmllZC5hZGQodGlkLnRpdGxlKTtcblx0XHRcdFx0ZWxzZVxuXHRcdFx0XHRcdGRlbGV0ZWQuYWRkKHRpZC50aXRsZSk7XG5cdFx0XHR9KVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5sYXN0X2tub3duX3JldmlzaW9uX2lkID0gbGFzdF9yZXZpc2lvbjtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRtb2RpZmljYXRpb25zOiBbLi4ubW9kaWZpZWQua2V5cygpXSxcblx0XHRcdGRlbGV0aW9uczogWy4uLmRlbGV0ZWQua2V5cygpXSxcblx0XHR9XG5cblx0fVxuXG5cdC8qXG5cdFF1ZXVlIGEgbG9hZCBmb3IgYSB0aWRkbGVyIGlmIHRoZXJlIGhhcyBiZWVuIGFuIHVwZGF0ZSBmb3IgaXQgc2luY2UgdGhlIHNwZWNpZmllZCByZXZpc2lvblxuXHQqL1xuXHRwcml2YXRlIGNoZWNrTGFzdFJlY29yZGVkVXBkYXRlKHRpdGxlOiBzdHJpbmcsIHJldmlzaW9uOiBzdHJpbmcpIHtcblx0XHR2YXIgbHJ1ID0gdGhpcy5sYXN0UmVjb3JkZWRVcGRhdGVbdGl0bGVdO1xuXHRcdGlmIChscnUgJiYgbHJ1LnJldmlzaW9uX2lkID4gcmV2aXNpb24pIHtcblx0XHRcdGNvbnNvbGUubG9nKGBDaGVja2luZyBmb3IgdXBkYXRlcyB0byAke3RpdGxlfSBzaW5jZSAke0pTT04uc3RyaW5naWZ5KGxydSl9IGNvbXBhcmluZyB0byAke3JldmlzaW9ufWApO1xuXHRcdFx0dGhpcy5zeW5jZXIgJiYgdGhpcy5zeW5jZXIuZW5xdWV1ZUxvYWRUaWRkbGVyKHRpdGxlKTtcblx0XHR9XG5cdH1cblx0cHJpdmF0ZSBnZXQgc3luY2VyKCkge1xuXHRcdGlmICgkdHcuc3luY2FkYXB0b3IgPT09IHRoaXMpIHJldHVybiAkdHcuc3luY2VyO1xuXHR9XG5cdC8qXG5cdFNhdmUgYSB0aWRkbGVyIGFuZCBpbnZva2UgdGhlIGNhbGxiYWNrIHdpdGggKGVycixhZGFwdG9ySW5mbyxyZXZpc2lvbilcblx0Ki9cblx0YXN5bmMgc2F2ZVRpZGRsZXIoXG5cdFx0dGlkZGxlcjogVGlkZGxlcixcblx0XHRjYWxsYmFjazogKFxuXHRcdFx0ZXJyOiBhbnksXG5cdFx0XHRhZGFwdG9ySW5mbz86IE1XU0FkYXB0b3JJbmZvLFxuXHRcdFx0cmV2aXNpb24/OiBzdHJpbmdcblx0XHQpID0+IHZvaWQsXG5cdFx0b3B0aW9ucz86IHt9XG5cdCkge1xuXHRcdHZhciBzZWxmID0gdGhpcywgdGl0bGUgPSB0aWRkbGVyLmZpZWxkcy50aXRsZSBhcyBzdHJpbmc7XG5cdFx0aWYgKHRpdGxlID09PSBcIiQ6L1N0b3J5TGlzdFwiKSB7XG5cdFx0XHRyZXR1cm4gY2FsbGJhY2sobnVsbCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmlzUmVhZE9ubHkgfHwgdGl0bGUuc3Vic3RyKDAsIE1XQ19TVEFURV9USURETEVSX1BSRUZJWC5sZW5ndGgpID09PSBNV0NfU1RBVEVfVElERExFUl9QUkVGSVgpIHtcblx0XHRcdHJldHVybiBjYWxsYmFjayhudWxsKTtcblx0XHR9XG5cdFx0c2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW3RpdGxlXSA9IHsgdHlwZTogXCJQVVRcIiB9O1xuXG5cdFx0Ly8gYXBwbGljYXRpb24veC1td3MtdGlkZGxlclxuXHRcdC8vIFRoZSAudGlkIGZpbGUgZm9ybWF0IGRvZXMgbm90IHN1cHBvcnQgZmllbGQgbmFtZXMgd2l0aCBjb2xvbnMuIFxuXHRcdC8vIFJhdGhlciB0aGFuIHRyeWluZyB0byBjYXRjaCBhbGwgdGhlIHVuc3VwcG9ydGVkIHZhcmlhdGlvbnMgdGhhdCBtYXkgYXBwZWFyLFxuXHRcdC8vIHdlJ2xsIGp1c3QgdXNlIEpTT04gdG8gc2VuZCBpdCBhY3Jvc3MgdGhlIHdpcmUsIHNpbmNlIHRoYXQgaXMgdGhlIG9mZmljaWFsIGZhbGxiYWNrIGZvcm1hdCBhbnl3YXkuXG5cdFx0Ly8gSG93ZXZlciwgcGFyc2luZyBhIGh1Z2Ugc3RyaW5nIHZhbHVlIGluc2lkZSBhIEpTT04gb2JqZWN0IGlzIHZlcnkgc2xvdyxcblx0XHQvLyBzbyB3ZSBzcGxpdCBvZmYgdGhlIHRleHQgZmllbGQgYW5kIHNlbmQgaXQgYWZ0ZXIgdGhlIG90aGVyIGZpZWxkcy4gXG5cblx0XHRjb25zdCBmaWVsZHMgPSB0aWRkbGVyLmdldEZpZWxkU3RyaW5ncyh7fSk7XG5cdFx0Y29uc3QgdGV4dCA9IGZpZWxkcy50ZXh0O1xuXHRcdGRlbGV0ZSBmaWVsZHMudGV4dDtcblx0XHRsZXQgYm9keSA9IEpTT04uc3RyaW5naWZ5KGZpZWxkcyk7XG5cblx0XHRpZiAodGlkZGxlci5oYXNGaWVsZChcInRleHRcIikpIHtcblx0XHRcdGlmICh0eXBlb2YgdGV4dCAhPT0gXCJzdHJpbmdcIiAmJiB0ZXh0KVxuXHRcdFx0XHRyZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKFwiRXJyb3Igc2F2aW5nIHRpZGRsZXIgXCIgKyBmaWVsZHMudGl0bGUgKyBcIjogdGhlIHRleHQgZmllbGQgaXMgdHJ1dGh5IGJ1dCBub3QgYSBzdHJpbmdcIikpO1xuXHRcdFx0Ym9keSArPSBgXFxuXFxuJHt0ZXh0fWBcblx0XHR9XG5cblx0XHR0eXBlIHQgPSBUaWRkbGVyUm91dGVyUmVzcG9uc2VbXCJoYW5kbGVTYXZlUmVjaXBlVGlkZGxlclwiXVxuXHRcdGNvbnN0IFtvaywgZXJyLCByZXN1bHRdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdGtleTogXCJoYW5kbGVTYXZlUmVjaXBlVGlkZGxlclwiLFxuXHRcdFx0dXJsOiBcIi90aWRkbGVycy9cIiArIGVuY29kZVVSSUNvbXBvbmVudCh0aXRsZSksXG5cdFx0XHRtZXRob2Q6IFwiUFVUXCIsXG5cdFx0XHRyZXF1ZXN0Qm9keVN0cmluZzogYm9keSxcblx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi94LW13cy10aWRkbGVyXCJcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGRlbGV0ZSBzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdO1xuXHRcdGlmICghb2spIHJldHVybiBjYWxsYmFjayhlcnIpO1xuXG5cdFx0Y29uc3QgZGF0YSA9IHJlc3VsdC5yZXNwb25zZUpTT047XG5cdFx0aWYgKCFkYXRhKSByZXR1cm4gY2FsbGJhY2sobnVsbCk7IC8vIGEgMnh4IHJlc3BvbnNlIHdpdGhvdXQgYSBib2R5IGlzIHVubGlrZWx5XG5cblx0XHQvL0lmIEJyb3dzZXItU3RvcmFnZSBwbHVnaW4gaXMgcHJlc2VudCwgcmVtb3ZlIHRpZGRsZXIgZnJvbSBsb2NhbCBzdG9yYWdlIGFmdGVyIHN1Y2Nlc3NmdWwgc3luYyB0byB0aGUgc2VydmVyXG5cdFx0aWYgKCR0dy5icm93c2VyU3RvcmFnZSAmJiAkdHcuYnJvd3NlclN0b3JhZ2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdCR0dy5icm93c2VyU3RvcmFnZS5yZW1vdmVUaWRkbGVyRnJvbUxvY2FsU3RvcmFnZSh0aXRsZSk7XG5cdFx0fVxuXG5cblx0XHQvLyBTYXZlIHRoZSBkZXRhaWxzIG9mIHRoZSBuZXcgcmV2aXNpb24gb2YgdGhlIHRpZGRsZXJcblx0XHRjb25zdCByZXZpc2lvbiA9IGRhdGEucmV2aXNpb25faWQsIGJhZ19uYW1lID0gZGF0YS5iYWdfbmFtZTtcblx0XHRjb25zb2xlLmxvZyhgU2F2ZWQgJHt0aXRsZX0gd2l0aCByZXZpc2lvbiAke3JldmlzaW9ufSBhbmQgYmFnICR7YmFnX25hbWV9YCk7XG5cdFx0Ly8gSWYgdGhlcmUgaGFzIGJlZW4gYSBtb3JlIHJlY2VudCB1cGRhdGUgZnJvbSB0aGUgc2VydmVyIHRoZW4gZW5xdWV1ZSBhIGxvYWQgb2YgdGhpcyB0aWRkbGVyXG5cdFx0c2VsZi5jaGVja0xhc3RSZWNvcmRlZFVwZGF0ZSh0aXRsZSwgcmV2aXNpb24pO1xuXHRcdC8vIEludm9rZSB0aGUgY2FsbGJhY2tcblx0XHRzZWxmLnNldFRpZGRsZXJJbmZvKHRpdGxlLCByZXZpc2lvbiwgYmFnX25hbWUpO1xuXHRcdGNhbGxiYWNrKG51bGwsIHsgYmFnOiBiYWdfbmFtZSB9LCByZXZpc2lvbik7XG5cblx0fVxuXHQvKlxuXHRMb2FkIGEgdGlkZGxlciBhbmQgaW52b2tlIHRoZSBjYWxsYmFjayB3aXRoIChlcnIsdGlkZGxlckZpZWxkcylcblxuXHRUaGUgc3luY2VyIGRvZXMgbm90IHBhc3MgaXRzZWxmIGludG8gb3B0aW9ucy5cblx0Ki9cblx0YXN5bmMgbG9hZFRpZGRsZXIodGl0bGU6IHN0cmluZywgY2FsbGJhY2s6IChlcnI6IGFueSwgZmllbGRzPzogYW55KSA9PiB2b2lkLCBvcHRpb25zOiBhbnkpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0c2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW3RpdGxlXSA9IHsgdHlwZTogXCJHRVRcIiB9O1xuXHRcdGNvbnN0IFtvaywgZXJyLCByZXN1bHRdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdGtleTogXCJoYW5kbGVMb2FkUmVjaXBlVGlkZGxlclwiLFxuXHRcdFx0dXJsOiBcIi90aWRkbGVycy9cIiArIGVuY29kZVVSSUNvbXBvbmVudCh0aXRsZSksXG5cdFx0XHRtZXRob2Q6IFwiR0VUXCIsXG5cdFx0fSlcblx0XHRkZWxldGUgc2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW3RpdGxlXTtcblx0XHRpZiAoIW9rKSByZXR1cm4gY2FsbGJhY2soZXJyKTtcblxuXHRcdGNvbnN0IHsgcmVzcG9uc2VKU09OOiBkYXRhLCBoZWFkZXJzIH0gPSByZXN1bHQ7XG5cdFx0Y29uc3QgcmV2aXNpb24gPSBoZWFkZXJzLmdldChcIngtcmV2aXNpb24tbnVtYmVyXCIpID8/IFwiXCIsXG5cdFx0XHRiYWdfbmFtZSA9IGhlYWRlcnMuZ2V0KFwieC1iYWctbmFtZVwiKSA/PyBcIlwiO1xuXG5cdFx0aWYgKCFyZXZpc2lvbiB8fCAhYmFnX25hbWUgfHwgIWRhdGEpIHJldHVybiBjYWxsYmFjayhudWxsLCBudWxsKTtcblxuXHRcdC8vIElmIHRoZXJlIGhhcyBiZWVuIGEgbW9yZSByZWNlbnQgdXBkYXRlIGZyb20gdGhlIHNlcnZlciB0aGVuIGVucXVldWUgYSBsb2FkIG9mIHRoaXMgdGlkZGxlclxuXHRcdHNlbGYuY2hlY2tMYXN0UmVjb3JkZWRVcGRhdGUodGl0bGUsIHJldmlzaW9uKTtcblx0XHQvLyBJbnZva2UgdGhlIGNhbGxiYWNrXG5cdFx0c2VsZi5zZXRUaWRkbGVySW5mbyh0aXRsZSwgcmV2aXNpb24sIGJhZ19uYW1lKTtcblx0XHRjYWxsYmFjayhudWxsLCBkYXRhKTtcblx0fVxuXHQvKlxuXHREZWxldGUgYSB0aWRkbGVyIGFuZCBpbnZva2UgdGhlIGNhbGxiYWNrIHdpdGggKGVycilcblx0b3B0aW9ucyBpbmNsdWRlOlxuXHR0aWRkbGVySW5mbzogdGhlIHN5bmNlcidzIHRpZGRsZXJJbmZvIGZvciB0aGlzIHRpZGRsZXJcblx0Ki9cblx0YXN5bmMgZGVsZXRlVGlkZGxlcih0aXRsZTogc3RyaW5nLCBjYWxsYmFjazogKGVycjogYW55LCBhZGFwdG9ySW5mbz86IGFueSkgPT4gdm9pZCwgb3B0aW9uczogYW55KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdGlmICh0aGlzLmlzUmVhZE9ubHkpIHsgcmV0dXJuIGNhbGxiYWNrKG51bGwpOyB9XG5cdFx0Ly8gSWYgd2UgZG9uJ3QgaGF2ZSBhIGJhZyBpdCBtZWFucyB0aGF0IHRoZSB0aWRkbGVyIGhhc24ndCBiZWVuIHNlZW4gYnkgdGhlIHNlcnZlciwgc28gd2UgZG9uJ3QgbmVlZCB0byBkZWxldGUgaXRcblx0XHQvLyB2YXIgYmFnID0gdGhpcy5nZXRUaWRkbGVyQmFnKHRpdGxlKTtcblx0XHQvLyBpZighYmFnKSB7IHJldHVybiBjYWxsYmFjayhudWxsLCBvcHRpb25zLnRpZGRsZXJJbmZvLmFkYXB0b3JJbmZvKTsgfVxuXHRcdHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV0gPSB7IHR5cGU6IFwiREVMRVRFXCIgfTtcblx0XHQvLyBJc3N1ZSBIVFRQIHJlcXVlc3QgdG8gZGVsZXRlIHRoZSB0aWRkbGVyXG5cdFx0Y29uc3QgW29rLCBlcnIsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3Qoe1xuXHRcdFx0a2V5OiBcImhhbmRsZURlbGV0ZVJlY2lwZVRpZGRsZXJcIixcblx0XHRcdHVybDogXCIvdGlkZGxlcnMvXCIgKyBlbmNvZGVVUklDb21wb25lbnQodGl0bGUpLFxuXHRcdFx0bWV0aG9kOiBcIkRFTEVURVwiLFxuXHRcdH0pO1xuXHRcdGRlbGV0ZSBzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdO1xuXHRcdGlmICghb2spIHJldHVybiBjYWxsYmFjayhlcnIpO1xuXHRcdGNvbnN0IHsgcmVzcG9uc2VKU09OOiBkYXRhIH0gPSByZXN1bHQ7XG5cdFx0aWYgKCFkYXRhKSByZXR1cm4gY2FsbGJhY2sobnVsbCk7XG5cblx0XHRjb25zdCByZXZpc2lvbiA9IGRhdGEucmV2aXNpb25faWQsIGJhZ19uYW1lID0gZGF0YS5iYWdfbmFtZTtcblx0XHQvLyBJZiB0aGVyZSBoYXMgYmVlbiBhIG1vcmUgcmVjZW50IHVwZGF0ZSBmcm9tIHRoZSBzZXJ2ZXIgdGhlbiBlbnF1ZXVlIGEgbG9hZCBvZiB0aGlzIHRpZGRsZXJcblx0XHRzZWxmLmNoZWNrTGFzdFJlY29yZGVkVXBkYXRlKHRpdGxlLCByZXZpc2lvbik7XG5cdFx0c2VsZi5yZW1vdmVUaWRkbGVySW5mbyh0aXRsZSk7XG5cdFx0Ly8gSW52b2tlIHRoZSBjYWxsYmFjayAmIHJldHVybiBudWxsIGFkYXB0b3JJbmZvXG5cdFx0Y2FsbGJhY2sobnVsbCwgbnVsbCk7XG5cdH1cbn1cblxuXG5pZiAoJHR3LmJyb3dzZXIgJiYgZG9jdW1lbnQubG9jYXRpb24ucHJvdG9jb2wuc3RhcnRzV2l0aChcImh0dHBcIikpIHtcblx0ZXhwb3J0cy5hZGFwdG9yQ2xhc3MgPSBNdWx0aVdpa2lDbGllbnRBZGFwdG9yO1xufVxuXG50eXBlIFBhcmFtc0lucHV0ID0gVVJMU2VhcmNoUGFyYW1zIHwgW3N0cmluZywgc3RyaW5nXVtdIHwgb2JqZWN0IHwgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5pbnRlcmZhY2UgSHR0cFJlcXVlc3RPcHRpb25zPFRZUEUgZXh0ZW5kcyBcImFycmF5YnVmZmVyXCIgfCBcImJsb2JcIiB8IFwidGV4dFwiPiB7XG5cdC8qKiBUaGUgcmVxdWVzdCBNRVRIT0QuIE1heWJlIGJlIGFueXRoaW5nIGV4Y2VwdCBDT05ORUNULCBUUkFDRSwgb3IgVFJBQ0suICAqL1xuXHRtZXRob2Q6IHN0cmluZztcblx0LyoqIFRoZSB1cmwgbWF5IGFsc28gY29udGFpbiBxdWVyeSBwYXJhbXMuICovXG5cdHVybDogc3RyaW5nO1xuXHQvKiogVGhlIHJlc3BvbnNlIHR5cGVzICovXG5cdHJlc3BvbnNlVHlwZTogVFlQRTtcblx0aGVhZGVycz86IFBhcmFtc0lucHV0O1xuXHQvKiogVGhpcyBpcyBwYXJzZWQgc2VwYXJhdGVseSBmcm9tIHRoZSB1cmwgYW5kIGFwcGVuZGVkIHRvIGl0LiAqL1xuXHRxdWVyeVBhcmFtcz86IFBhcmFtc0lucHV0O1xuXHQvKiogXG5cdCAqIFRoZSBzdHJpbmcgdG8gc2VuZCBhcyB0aGUgcmVxdWVzdCBib2R5LiBOb3QgdmFsaWQgZm9yIEdFVCBhbmQgSEVBRC5cblx0ICogXG5cdCAqIEZvciBgYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkYCwgdXNlIGBuZXcgVVJMU2VhcmNoUGFyYW1zKCkudG9TdHJpbmcoKWAuXG5cdCAqIFxuXHQgKiBGb3IgYGFwcGxpY2F0aW9uL2pzb25gLCB1c2UgYEpTT04uc3RyaW5naWZ5KClgXG5cdCAqL1xuXHRyZXF1ZXN0Qm9keVN0cmluZz86IHN0cmluZztcblx0cHJvZ3Jlc3M/OiAoZXZlbnQ6IFByb2dyZXNzRXZlbnQ8RXZlbnRUYXJnZXQ+KSA9PiB2b2lkO1xufVxuXG5cbmZ1bmN0aW9uIGh0dHBSZXF1ZXN0PFRZUEUgZXh0ZW5kcyBcImFycmF5YnVmZmVyXCIgfCBcImJsb2JcIiB8IFwidGV4dFwiPihvcHRpb25zOiBIdHRwUmVxdWVzdE9wdGlvbnM8VFlQRT4pIHtcblxuXHRyZXR1cm4gbmV3IFByb21pc2U8e1xuXHRcdC8qKiBTaG9ydGhhbmQgdG8gY2hlY2sgaWYgdGhlIHJlc3BvbnNlIGlzIGluIHRoZSAyeHggcmFuZ2UuICovXG5cdFx0b2s6IGJvb2xlYW47XG5cdFx0c3RhdHVzOiBudW1iZXI7XG5cdFx0c3RhdHVzVGV4dDogc3RyaW5nO1xuXHRcdGhlYWRlcnM6IFVSTFNlYXJjaFBhcmFtcztcblx0XHRyZXNwb25zZTpcblx0XHRUWVBFIGV4dGVuZHMgXCJhcnJheWJ1ZmZlclwiID8gQXJyYXlCdWZmZXIgOlxuXHRcdFRZUEUgZXh0ZW5kcyBcImJsb2JcIiA/IEJsb2IgOlxuXHRcdFRZUEUgZXh0ZW5kcyBcInRleHRcIiA/IHN0cmluZyA6XG5cdFx0bmV2ZXI7XG5cdH0+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHQvLyBpZiB0aGlzIHRocm93cyBzeW5jJ2x5LCB0aGUgcHJvbWlzZSB3aWxsIHJlamVjdC5cblxuXHRcdG9wdGlvbnMubWV0aG9kID0gb3B0aW9ucy5tZXRob2QudG9VcHBlckNhc2UoKTtcblxuXHRcdGlmICgob3B0aW9ucy5tZXRob2QgPT09IFwiR0VUXCIgfHwgb3B0aW9ucy5tZXRob2QgPT09IFwiSEVBRFwiKSAmJiBvcHRpb25zLnJlcXVlc3RCb2R5U3RyaW5nKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwicmVxdWVzdEJvZHlTdHJpbmcgbXVzdCBiZSBmYWxzeSBpZiBtZXRob2QgaXMgR0VUIG9yIEhFQURcIik7XG5cblxuXHRcdGNvbnN0IHVybCA9IG5ldyBVUkwob3B0aW9ucy51cmwsIGxvY2F0aW9uLmhyZWYpO1xuXHRcdGNvbnN0IHF1ZXJ5ID0gcGFyYW1zSW5wdXQob3B0aW9ucy5xdWVyeVBhcmFtcyk7XG5cdFx0cXVlcnkuZm9yRWFjaCgodiwgaykgPT4geyB1cmwuc2VhcmNoUGFyYW1zLmFwcGVuZChrLCB2KTsgfSk7XG5cblx0XHRjb25zdCBoZWFkZXJzID0gcGFyYW1zSW5wdXQob3B0aW9ucy5oZWFkZXJzKTtcblx0XHRub3JtYWxpemVIZWFkZXJzKGhlYWRlcnMpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXHRcdHJlcXVlc3QucmVzcG9uc2VUeXBlID0gb3B0aW9ucy5yZXNwb25zZVR5cGUgfHwgXCJ0ZXh0XCI7XG5cblx0XHR0cnkge1xuXHRcdFx0cmVxdWVzdC5vcGVuKG9wdGlvbnMubWV0aG9kLCB1cmwsIHRydWUpO1xuXHRcdH0gY2F0Y2ggKGUpIHsgY29uc29sZS5sb2coZSwgeyBlIH0pOyB0aHJvdyBlOyB9XG5cblx0XHRpZiAoIWhlYWRlcnMuaGFzKFwiY29udGVudC10eXBlXCIpKVxuXHRcdFx0aGVhZGVycy5zZXQoXCJjb250ZW50LXR5cGVcIiwgXCJhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQ7IGNoYXJzZXQ9VVRGLThcIik7XG5cblx0XHRpZiAoIWhlYWRlcnMuaGFzKFwieC1yZXF1ZXN0ZWQtd2l0aFwiKSlcblx0XHRcdGhlYWRlcnMuc2V0KFwieC1yZXF1ZXN0ZWQtd2l0aFwiLCBcIlRpZGRseVdpa2lcIik7XG5cblx0XHRoZWFkZXJzLnNldChcImFjY2VwdFwiLCBcImFwcGxpY2F0aW9uL2pzb25cIik7XG5cblxuXHRcdGhlYWRlcnMuZm9yRWFjaCgodiwgaykgPT4ge1xuXHRcdFx0cmVxdWVzdC5zZXRSZXF1ZXN0SGVhZGVyKGssIHYpO1xuXHRcdH0pO1xuXG5cdFx0cmVxdWVzdC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHRpZiAodGhpcy5yZWFkeVN0YXRlICE9PSA0KSByZXR1cm47XG5cblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdFx0XHRyZXF1ZXN0LmdldEFsbFJlc3BvbnNlSGVhZGVycygpPy50cmltKCkuc3BsaXQoL1tcXHJcXG5dKy8pLmZvckVhY2goKGxpbmUpID0+IHtcblx0XHRcdFx0Y29uc3QgcGFydHMgPSBsaW5lLnNwbGl0KFwiOiBcIik7XG5cdFx0XHRcdGNvbnN0IGhlYWRlciA9IHBhcnRzLnNoaWZ0KCk/LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gcGFydHMuam9pbihcIjogXCIpO1xuXHRcdFx0XHRpZiAoaGVhZGVyKSBoZWFkZXJzLmFwcGVuZChoZWFkZXIsIHZhbHVlKTtcblx0XHRcdH0pO1xuXHRcdFx0cmVzb2x2ZSh7XG5cdFx0XHRcdG9rOiB0aGlzLnN0YXR1cyA+PSAyMDAgJiYgdGhpcy5zdGF0dXMgPCAzMDAsXG5cdFx0XHRcdHN0YXR1czogdGhpcy5zdGF0dXMsXG5cdFx0XHRcdHN0YXR1c1RleHQ6IHRoaXMuc3RhdHVzVGV4dCxcblx0XHRcdFx0cmVzcG9uc2U6IHRoaXMucmVzcG9uc2UsXG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHR9KTtcblxuXHRcdH07XG5cblx0XHRpZiAob3B0aW9ucy5wcm9ncmVzcylcblx0XHRcdHJlcXVlc3Qub25wcm9ncmVzcyA9IG9wdGlvbnMucHJvZ3Jlc3M7XG5cblx0XHR0cnkgeyByZXF1ZXN0LnNlbmQob3B0aW9ucy5yZXF1ZXN0Qm9keVN0cmluZyk7IH0gY2F0Y2ggKGUpIHsgY29uc29sZS5sb2coZSwgeyBlIH0pOyB0aHJvdyBlOyB9XG5cblxuXHR9KTtcblxuXG5cdGZ1bmN0aW9uIHBhcmFtc0lucHV0KGlucHV0OiBQYXJhbXNJbnB1dCkge1xuXHRcdGlmICghaW5wdXQpIHJldHVybiBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdFx0aWYgKGlucHV0IGluc3RhbmNlb2YgVVJMU2VhcmNoUGFyYW1zKSByZXR1cm4gaW5wdXQ7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoaW5wdXQpIHx8IHR5cGVvZiBpbnB1dCA9PT0gXCJzdHJpbmdcIikgcmV0dXJuIG5ldyBVUkxTZWFyY2hQYXJhbXMoaW5wdXQpO1xuXHRcdHJldHVybiBuZXcgVVJMU2VhcmNoUGFyYW1zKE9iamVjdC5lbnRyaWVzKGlucHV0KSk7XG5cdH1cblxuXHRmdW5jdGlvbiBub3JtYWxpemVIZWFkZXJzKGhlYWRlcnM6IFVSTFNlYXJjaFBhcmFtcykge1xuXHRcdFsuLi5oZWFkZXJzLmtleXMoKV0uZm9yRWFjaCgoW2ssIHZdKSA9PiB7XG5cdFx0XHRjb25zdCBrMiA9IGsudG9Mb3dlckNhc2UoKTtcblx0XHRcdGlmIChrMiAhPT0gaykge1xuXHRcdFx0XHRoZWFkZXJzLmdldEFsbChrKS5mb3JFYWNoKGUgPT4ge1xuXHRcdFx0XHRcdGhlYWRlcnMuYXBwZW5kKGsyLCBlKTtcblx0XHRcdFx0fSlcblx0XHRcdFx0aGVhZGVycy5kZWxldGUoayk7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGssIGsyKTtcblx0XHRcdH1cblx0XHR9KVxuXHR9XG5cbn1cblxuZnVuY3Rpb24gcmVhZEJsb2JBc0FycmF5QnVmZmVyKGJsb2I6IEJsb2IpIHtcblx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoXCJFcnJvciByZWFkaW5nIGJsb2JcIik7XG5cdHJldHVybiBuZXcgUHJvbWlzZTxBcnJheUJ1ZmZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKCk7XG5cdFx0cmVhZGVyLm9ubG9hZCA9ICgpID0+IHtcblx0XHRcdHJlc29sdmUocmVhZGVyLnJlc3VsdCBhcyBBcnJheUJ1ZmZlcilcblx0XHR9O1xuXHRcdHJlYWRlci5vbmVycm9yID0gKCkgPT4ge1xuXHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHR9O1xuXHRcdHJlYWRlci5yZWFkQXNBcnJheUJ1ZmZlcihibG9iKTtcblx0fSk7XG5cbn1cbiJdfQ==