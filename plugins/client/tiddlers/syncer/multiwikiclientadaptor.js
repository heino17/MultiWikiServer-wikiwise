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
var CONFIG_HOST_TIDDLER = "$:/config/multiwikiclient/host", DEFAULT_HOST_TIDDLER = "$protocol$//$host$/", MWC_STATE_TIDDLER_PREFIX = "$:/state/multiwikiclient/", BAG_STATE_TIDDLER = "$:/state/multiwikiclient/tiddlers/bag", REVISION_STATE_TIDDLER = "$:/state/multiwikiclient/tiddlers/revision", CONNECTION_STATE_TIDDLER = "$:/state/multiwikiclient/connection", INCOMING_UPDATES_FILTER_TIDDLER = "$:/config/multiwikiclient/incoming-updates-filter", ENABLE_SSE_TIDDLER = "$:/config/multiwikiclient/use-server-sent-events", IS_DEV_MODE_TIDDLER = `$:/state/multiwikiclient/dev-mode`, ENABLE_GZIP_STREAM_TIDDLER = `$:/state/multiwikiclient/gzip-stream`;
var SERVER_NOT_CONNECTED = "NOT CONNECTED", SERVER_CONNECTING_SSE = "CONNECTING SSE", SERVER_CONNECTED_SSE = "CONNECTED SSE", SERVER_POLLING = "SERVER POLLING";
class MultiWikiClientAdaptor {
    constructor(options) {
        this.name = "multiwikiclient";
        this.supportsLazyLoading = true;
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
    recipeRequest(options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!options.url.startsWith("/"))
                throw new Error("The url does not start with a slash");
            return yield httpRequest(Object.assign(Object.assign({}, options), { responseType: "blob", url: this.host + "recipes/" + encodeURIComponent(this.recipe) + options.url })).then(result => {
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
            }).then((e) => __awaiter(this, void 0, void 0, function* () {
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
            var _a, _b, _c;
            const [ok, error, data] = yield this.recipeRequest({
                key: "handleGetRecipeStatus",
                method: "GET",
                url: "/status",
            });
            if (!ok) {
                this.isLoggedIn = false;
                this.isReadOnly = true;
                this.username = "(offline)";
                this.offline = true;
            }
            else {
                const status = data.responseJSON;
                this.isReadOnly = (_a = status === null || status === void 0 ? void 0 : status.isReadOnly) !== null && _a !== void 0 ? _a : true;
                this.isLoggedIn = (_b = status === null || status === void 0 ? void 0 : status.isLoggedIn) !== null && _b !== void 0 ? _b : false;
                this.username = (_c = status === null || status === void 0 ? void 0 : status.username) !== null && _c !== void 0 ? _c : "(anon)";
                this.offline = false;
            }
            if (callback) {
                callback(
                // Error
                !ok ? error : null, 
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
    return new Promise((resolve, reject) => {
        // if this throws sync'ly, the promise will reject.
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
        // request.onerror = (event) => {
        // 	console.log(event);
        // 	console.log((event as ProgressEvent<XMLHttpRequest>)!.target?.status);
        // }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGl3aWtpY2xpZW50YWRhcHRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tdWx0aXdpa2ljbGllbnRhZGFwdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHO0FBRUgsa0VBQWtFO0FBQ2xFLFlBQVksQ0FBQzs7Ozs7Ozs7Ozs7QUEwSWIsSUFBSSxtQkFBbUIsR0FBRyxnQ0FBZ0MsRUFDekQsb0JBQW9CLEdBQUcscUJBQXFCLEVBQzVDLHdCQUF3QixHQUFHLDJCQUEyQixFQUN0RCxpQkFBaUIsR0FBRyx1Q0FBdUMsRUFDM0Qsc0JBQXNCLEdBQUcsNENBQTRDLEVBQ3JFLHdCQUF3QixHQUFHLHFDQUFxQyxFQUNoRSwrQkFBK0IsR0FBRyxtREFBbUQsRUFDckYsa0JBQWtCLEdBQUcsa0RBQWtELEVBQ3ZFLG1CQUFtQixHQUFHLG1DQUFtQyxFQUN6RCwwQkFBMEIsR0FBRyxzQ0FBc0MsQ0FBQztBQUdyRSxJQUFJLG9CQUFvQixHQUFHLGVBQWUsRUFDekMscUJBQXFCLEdBQUcsZ0JBQWdCLEVBQ3hDLG9CQUFvQixHQUFHLGVBQWUsRUFDdEMsY0FBYyxHQUFHLGdCQUFnQixDQUFDO0FBT25DLE1BQU0sc0JBQXNCO0lBb0IzQixZQUFZLE9BQXNCO1FBRmxDLFNBQUksR0FBRyxpQkFBaUIsQ0FBQztRQUNqQix3QkFBbUIsR0FBRyxJQUFJLENBQUM7UUFFbEMsSUFBSSxDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzNCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsa0NBQWtDLENBQUMsQ0FBQztRQUMzRSxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsS0FB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QTtRQUN0QyxDQUFDLENBQUM7UUFDRixNQUFNLENBQUMsT0FBTyxHQUFHLEdBQUcsRUFBRTtZQUNyQixNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDZixDQUFDLENBQUM7UUFDRixNQUFNLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEMsQ0FBQyxDQUFDLENBQUM7QUFFSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLypcXFxudGl0bGU6ICQ6L3BsdWdpbnMvdGlkZGx5d2lraS90aWRkbHl3ZWIvdGlkZGx5d2ViYWRhcHRvci5qc1xudHlwZTogYXBwbGljYXRpb24vamF2YXNjcmlwdFxubW9kdWxlLXR5cGU6IHN5bmNhZGFwdG9yXG5cbkEgc3luYyBhZGFwdG9yIG1vZHVsZSBmb3Igc3luY2hyb25pc2luZyB3aXRoIE11bHRpV2lraVNlcnZlci1jb21wYXRpYmxlIHNlcnZlcnMuIFxuXG5JdCBoYXMgdGhyZWUga2V5IGFyZWFzIG9mIGNvbmNlcm46XG5cbiogQmFzaWMgb3BlcmF0aW9ucyBsaWtlIHB1dCwgZ2V0LCBhbmQgZGVsZXRlIGEgdGlkZGxlciBvbiB0aGUgc2VydmVyXG4qIFJlYWwgdGltZSB1cGRhdGVzIGZyb20gdGhlIHNlcnZlciAoaGFuZGxlZCBieSBTU0UpXG4qIEJhZ3MgYW5kIHJlY2lwZXMsIHdoaWNoIGFyZSB1bmtub3duIHRvIHRoZSBzeW5jZXJcblxuQSBrZXkgYXNwZWN0IG9mIHRoZSBkZXNpZ24gaXMgdGhhdCB0aGUgc3luY2VyIG5ldmVyIG92ZXJsYXBzIGJhc2ljIHNlcnZlciBvcGVyYXRpb25zOyBpdCB3YWl0cyBmb3IgdGhlXG5wcmV2aW91cyBvcGVyYXRpb24gdG8gY29tcGxldGUgYmVmb3JlIHNlbmRpbmcgYSBuZXcgb25lLlxuXG5cXCovXG5cbi8vIHRoZSBibGFuayBsaW5lIGlzIGltcG9ydGFudCwgYW5kIHNvIGlzIHRoZSBmb2xsb3dpbmcgdXNlIHN0cmljdFxuXCJ1c2Ugc3RyaWN0XCI7XG5cbmltcG9ydCB0eXBlIHsgU3luY2VyLCBUaWRkbGVyLCBJVGlkZGx5V2lraSB9IGZyb20gXCJ0aWRkbHl3aWtpXCI7XG5pbXBvcnQgdHlwZSB7IFRpZGRsZXJSb3V0ZXIgfSBmcm9tIFwiQHRpZGRseXdpa2kvbXdzL3NyYy9yb3V0ZXMvbWFuYWdlcnMvcm91dGVyLXRpZGRsZXJzXCI7XG5pbXBvcnQgdHlwZSB7IFpvZFJvdXRlIH0gZnJvbSBcIkB0aWRkbHl3aWtpL213cy9zcmMvcm91dGVyXCI7XG5cbmRlY2xhcmUgZ2xvYmFsIHtcblx0Y29uc3QgZmZsYXRlOiB0eXBlb2YgaW1wb3J0KFwiZmZsYXRlXCIpO1xufVxuXG5kZWNsYXJlIGNsYXNzIExvZ2dlciB7XG5cdGNvbnN0cnVjdG9yKGNvbXBvbmVudE5hbWU6IGFueSwgb3B0aW9uczogYW55KTtcblx0Y29tcG9uZW50TmFtZTogYW55O1xuXHRjb2xvdXI6IGFueTtcblx0ZW5hYmxlOiBhbnk7XG5cdHNhdmU6IGFueTtcblx0c2F2ZUxpbWl0OiBhbnk7XG5cdHNhdmVCdWZmZXJMb2dnZXI6IHRoaXM7XG5cdGJ1ZmZlcjogc3RyaW5nO1xuXHRhbGVydENvdW50OiBudW1iZXI7XG5cdHNldFNhdmVCdWZmZXIobG9nZ2VyOiBhbnkpOiB2b2lkO1xuXHRsb2coLi4uYXJnczogYW55W10pOiBhbnk7XG5cdGdldEJ1ZmZlcigpOiBzdHJpbmc7XG5cdHRhYmxlKHZhbHVlOiBhbnkpOiB2b2lkO1xuXHRhbGVydCguLi5hcmdzOiBhbnlbXSk6IHZvaWQ7XG5cdGNsZWFyQWxlcnRzKCk6IHZvaWQ7XG59XG5cbnR5cGUgVGlkZGxlclJvdXRlclJlc3BvbnNlID0ge1xuXHRbSyBpbiBrZXlvZiBUaWRkbGVyUm91dGVyXTogVGlkZGxlclJvdXRlcltLXSBleHRlbmRzIFpvZFJvdXRlPGluZmVyIE0sIGluZmVyIEIsIGluZmVyIFAsIGluZmVyIFEsIGluZmVyIFQsIGluZmVyIFI+XG5cdD8geyBNOiBNLCBCOiBCLCBQOiBQLCBROiBRLCBUOiBULCBSOiBSIH1cblx0OiBuZXZlclxufVxuXG5kZWNsYXJlIG1vZHVsZSAndGlkZGx5d2lraScge1xuXHRleHBvcnQgaW50ZXJmYWNlIFN5bmNlciB7XG5cdFx0d2lraTogV2lraTtcblx0XHRsb2dnZXI6IExvZ2dlcjtcblx0XHR0aWRkbGVySW5mbzogUmVjb3JkPHN0cmluZywgeyBiYWc6IHN0cmluZzsgcmV2aXNpb246IHN0cmluZyB9Pjtcblx0XHRlbnF1ZXVlTG9hZFRpZGRsZXIodGl0bGU6IHN0cmluZyk6IHZvaWQ7XG5cdFx0c3RvcmVUaWRkbGVyKHRpZGRsZXI6IFRpZGRsZXIpOiB2b2lkO1xuXHRcdHByb2Nlc3NUYXNrUXVldWUoKTogdm9pZDtcblx0fVxuXHRpbnRlcmZhY2UgSVRpZGRseVdpa2kge1xuXHRcdGJyb3dzZXJTdG9yYWdlOiBhbnk7XG5cdH1cbn1cblxudHlwZSBTZXJ2ZXJTdGF0dXNDYWxsYmFjayA9IChcblx0ZXJyOiBhbnksXG5cdC8qKiBcblx0ICogJDovc3RhdHVzL0lzTG9nZ2VkSW4gbW9zdGx5IGFwcGVhcnMgYWxvbmdzaWRlIHRoZSB1c2VybmFtZSBcblx0ICogb3Igb3RoZXIgbG9naW4tY29uZGl0aW9uYWwgYmVoYXZpb3IuIFxuXHQgKi9cblx0aXNMb2dnZWRJbj86IGJvb2xlYW4sXG5cdC8qKlxuXHQgKiAkOi9zdGF0dXMvVXNlck5hbWUgaXMgc3RpbGwgdXNlZCBmb3IgdGhpbmdzIGxpa2UgZHJhZnRzIGV2ZW4gaWYgdGhlIFxuXHQgKiB1c2VyIGlzbid0IGxvZ2dlZCBpbiwgYWx0aG91Z2ggdGhlIHVzZXJuYW1lIGlzIGxlc3MgbGlrZWx5IHRvIGJlIHNob3duIFxuXHQgKiB0byB0aGUgdXNlci4gXG5cdCAqL1xuXHR1c2VybmFtZT86IHN0cmluZyxcblx0LyoqIFxuXHQgKiAkOi9zdGF0dXMvSXNSZWFkT25seSBwdXRzIHRoZSBVSSBpbiByZWFkb25seSBtb2RlLCBcblx0ICogYnV0IGRvZXMgbm90IHByZXZlbnQgYXV0b21hdGljIGNoYW5nZXMgZnJvbSBhdHRlbXB0aW5nIHRvIHNhdmUuIFxuXHQgKi9cblx0aXNSZWFkT25seT86IGJvb2xlYW4sXG5cdC8qKiBcblx0ICogJDovc3RhdHVzL0lzQW5vbnltb3VzIGRvZXMgbm90IGFwcGVhciBhbnl3aGVyZSBpbiB0aGUgVFc1IHJlcG8hIFxuXHQgKiBTbyBpdCBoYXMgbm8gYXBwYXJlbnQgcHVycG9zZS4gXG5cdCAqL1xuXHRpc0Fub255bW91cz86IGJvb2xlYW5cbikgPT4gdm9pZFxuXG5pbnRlcmZhY2UgU3luY0FkYXB0b3I8QUQ+IHtcblx0bmFtZT86IHN0cmluZztcblxuXHRpc1JlYWR5PygpOiBib29sZWFuO1xuXG5cdGdldFN0YXR1cz8oXG5cdFx0Y2I6IFNlcnZlclN0YXR1c0NhbGxiYWNrXG5cdCk6IHZvaWQ7XG5cblx0Z2V0U2tpbm55VGlkZGxlcnM/KFxuXHRcdGNiOiAoZXJyOiBhbnksIHRpZGRsZXJGaWVsZHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz5bXSkgPT4gdm9pZFxuXHQpOiB2b2lkO1xuXHRnZXRVcGRhdGVkVGlkZGxlcnM/KFxuXHRcdHN5bmNlcjogU3luY2VyLFxuXHRcdGNiOiAoXG5cdFx0XHRlcnI6IGFueSxcblx0XHRcdC8qKiBBcnJheXMgb2YgdGl0bGVzIHRoYXQgaGF2ZSBiZWVuIG1vZGlmaWVkIG9yIGRlbGV0ZWQgKi9cblx0XHRcdHVwZGF0ZXM/OiB7IG1vZGlmaWNhdGlvbnM6IHN0cmluZ1tdLCBkZWxldGlvbnM6IHN0cmluZ1tdIH1cblx0XHQpID0+IHZvaWRcblx0KTogdm9pZDtcblxuXHQvKiogXG5cdCAqIHVzZWQgdG8gb3ZlcnJpZGUgdGhlIGRlZmF1bHQgU3luY2VyIGdldFRpZGRsZXJSZXZpc2lvbiBiZWhhdmlvclxuXHQgKiBvZiByZXR1cm5pbmcgdGhlIHJldmlzaW9uIGZpZWxkXG5cdCAqIFxuXHQgKi9cblx0Z2V0VGlkZGxlclJldmlzaW9uPyh0aXRsZTogc3RyaW5nKTogc3RyaW5nO1xuXHQvKiogXG5cdCAqIHVzZWQgdG8gZ2V0IHRoZSBhZGFwdGVyIGluZm8gZnJvbSBhIHRpZGRsZXIgaW4gc2l0dWF0aW9uc1xuXHQgKiBvdGhlciB0aGFuIHRoZSBzYXZlVGlkZGxlciBjYWxsYmFja1xuXHQgKi9cblx0Z2V0VGlkZGxlckluZm8odGlkZGxlcjogVGlkZGxlcik6IEFEIHwgdW5kZWZpbmVkO1xuXG5cdHNhdmVUaWRkbGVyKFxuXHRcdHRpZGRsZXI6IGFueSxcblx0XHRjYjogKFxuXHRcdFx0ZXJyOiBhbnksXG5cdFx0XHRhZGFwdG9ySW5mbz86IEFELFxuXHRcdFx0cmV2aXNpb24/OiBzdHJpbmdcblx0XHQpID0+IHZvaWQsXG5cdFx0ZXh0cmE6IHsgdGlkZGxlckluZm86IFN5bmNlclRpZGRsZXJJbmZvPEFEPiB9XG5cdCk6IHZvaWQ7XG5cblx0c2V0TG9nZ2VyU2F2ZUJ1ZmZlcj86IChsb2dnZXJGb3JTYXZpbmc6IExvZ2dlcikgPT4gdm9pZDtcblx0ZGlzcGxheUxvZ2luUHJvbXB0PyhzeW5jZXI6IFN5bmNlcik6IHZvaWQ7XG5cdGxvZ2luPyh1c2VybmFtZTogc3RyaW5nLCBwYXNzd29yZDogc3RyaW5nLCBjYjogKGVycjogYW55KSA9PiB2b2lkKTogdm9pZDtcblx0bG9nb3V0PyhjYjogKGVycjogYW55KSA9PiB2b2lkKTogYW55O1xufVxuaW50ZXJmYWNlIFN5bmNlclRpZGRsZXJJbmZvPEFEPiB7XG5cdC8qKiB0aGlzIGNvbWVzIGZyb20gdGhlIHdpa2kgY2hhbmdlQ291bnQgcmVjb3JkICovXG5cdGNoYW5nZUNvdW50OiBudW1iZXI7XG5cdC8qKiBBZGFwdGVyIGluZm8gcmV0dXJuZWQgYnkgdGhlIHN5bmMgYWRhcHRlciAqL1xuXHRhZGFwdG9ySW5mbzogQUQ7XG5cdC8qKiBSZXZpc2lvbiByZXR1cm4gYnkgdGhlIHN5bmMgYWRhcHRlciAqL1xuXHRyZXZpc2lvbjogc3RyaW5nO1xuXHQvKiogVGltZXN0YW1wIHNldCBpbiB0aGUgY2FsbGJhY2sgb2YgdGhlIHByZXZpb3VzIHNhdmUgKi9cblx0dGltZXN0YW1wTGFzdFNhdmVkOiBEYXRlO1xufVxuXG5kZWNsYXJlIGNvbnN0ICR0dzogYW55O1xuXG5kZWNsYXJlIGNvbnN0IGV4cG9ydHM6IHtcblx0YWRhcHRvckNsYXNzOiB0eXBlb2YgTXVsdGlXaWtpQ2xpZW50QWRhcHRvcjtcbn07XG5cbnZhciBDT05GSUdfSE9TVF9USURETEVSID0gXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L2hvc3RcIixcblx0REVGQVVMVF9IT1NUX1RJRERMRVIgPSBcIiRwcm90b2NvbCQvLyRob3N0JC9cIixcblx0TVdDX1NUQVRFX1RJRERMRVJfUFJFRklYID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvXCIsXG5cdEJBR19TVEFURV9USURETEVSID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvdGlkZGxlcnMvYmFnXCIsXG5cdFJFVklTSU9OX1NUQVRFX1RJRERMRVIgPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC90aWRkbGVycy9yZXZpc2lvblwiLFxuXHRDT05ORUNUSU9OX1NUQVRFX1RJRERMRVIgPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC9jb25uZWN0aW9uXCIsXG5cdElOQ09NSU5HX1VQREFURVNfRklMVEVSX1RJRERMRVIgPSBcIiQ6L2NvbmZpZy9tdWx0aXdpa2ljbGllbnQvaW5jb21pbmctdXBkYXRlcy1maWx0ZXJcIixcblx0RU5BQkxFX1NTRV9USURETEVSID0gXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L3VzZS1zZXJ2ZXItc2VudC1ldmVudHNcIixcblx0SVNfREVWX01PREVfVElERExFUiA9IGAkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvZGV2LW1vZGVgLFxuXHRFTkFCTEVfR1pJUF9TVFJFQU1fVElERExFUiA9IGAkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvZ3ppcC1zdHJlYW1gO1xuXG5cbnZhciBTRVJWRVJfTk9UX0NPTk5FQ1RFRCA9IFwiTk9UIENPTk5FQ1RFRFwiLFxuXHRTRVJWRVJfQ09OTkVDVElOR19TU0UgPSBcIkNPTk5FQ1RJTkcgU1NFXCIsXG5cdFNFUlZFUl9DT05ORUNURURfU1NFID0gXCJDT05ORUNURUQgU1NFXCIsXG5cdFNFUlZFUl9QT0xMSU5HID0gXCJTRVJWRVIgUE9MTElOR1wiO1xuXG5pbnRlcmZhY2UgTVdTQWRhcHRvckluZm8ge1xuXHRiYWc6IHN0cmluZ1xufVxuXG5cbmNsYXNzIE11bHRpV2lraUNsaWVudEFkYXB0b3IgaW1wbGVtZW50cyBTeW5jQWRhcHRvcjxNV1NBZGFwdG9ySW5mbz4ge1xuXHRwcml2YXRlIHdpa2k7XG5cdHByaXZhdGUgaG9zdDtcblx0cHJpdmF0ZSByZWNpcGU7XG5cdHByaXZhdGUgdXNlU2VydmVyU2VudEV2ZW50cztcblx0cHJpdmF0ZSBsYXN0X2tub3duX3JldmlzaW9uX2lkO1xuXHRwcml2YXRlIG91dHN0YW5kaW5nUmVxdWVzdHM7XG5cdHByaXZhdGUgbGFzdFJlY29yZGVkVXBkYXRlO1xuXHRwcml2YXRlIGxvZ2dlcjtcblx0cHJpdmF0ZSBpc0xvZ2dlZEluO1xuXHRwcml2YXRlIGlzUmVhZE9ubHk7XG5cdHByaXZhdGUgb2ZmbGluZTtcblx0cHJpdmF0ZSB1c2VybmFtZTtcblx0cHJpdmF0ZSBpbmNvbWluZ1VwZGF0ZXNGaWx0ZXJGbjtcblx0cHJpdmF0ZSBzZXJ2ZXJVcGRhdGVDb25uZWN0aW9uU3RhdHVzITogc3RyaW5nO1xuXHRwcml2YXRlIGlzRGV2TW9kZTogYm9vbGVhbjtcblx0cHJpdmF0ZSB1c2VHemlwU3RyZWFtOiBib29sZWFuO1xuXG5cdG5hbWUgPSBcIm11bHRpd2lraWNsaWVudFwiO1xuXHRwcml2YXRlIHN1cHBvcnRzTGF6eUxvYWRpbmcgPSB0cnVlO1xuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiB7IHdpa2k6IGFueSB9KSB7XG5cdFx0dGhpcy53aWtpID0gb3B0aW9ucy53aWtpO1xuXHRcdHRoaXMuaG9zdCA9IHRoaXMuZ2V0SG9zdCgpO1xuXHRcdHRoaXMucmVjaXBlID0gdGhpcy53aWtpLmdldFRpZGRsZXJUZXh0KFwiJDovY29uZmlnL211bHRpd2lraWNsaWVudC9yZWNpcGVcIik7XG5cdFx0dGhpcy51c2VTZXJ2ZXJTZW50RXZlbnRzID0gdGhpcy53aWtpLmdldFRpZGRsZXJUZXh0KEVOQUJMRV9TU0VfVElERExFUikgPT09IFwieWVzXCI7XG5cdFx0dGhpcy5pc0Rldk1vZGUgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoSVNfREVWX01PREVfVElERExFUikgPT09IFwieWVzXCI7XG5cdFx0dGhpcy51c2VHemlwU3RyZWFtID0gdGhpcy53aWtpLmdldFRpZGRsZXJUZXh0KEVOQUJMRV9HWklQX1NUUkVBTV9USURETEVSKSA9PT0gXCJ5ZXNcIjtcblx0XHR0aGlzLmxhc3Rfa25vd25fcmV2aXNpb25faWQgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvcmVjaXBlL2xhc3RfcmV2aXNpb25faWRcIiwgXCIwXCIpXG5cdFx0dGhpcy5vdXRzdGFuZGluZ1JlcXVlc3RzID0gT2JqZWN0LmNyZWF0ZShudWxsKTsgLy8gSGFzaG1hcCBieSB0aXRsZSBvZiBvdXRzdGFuZGluZyByZXF1ZXN0IG9iamVjdDoge3R5cGU6IFwiUFVUXCJ8XCJHRVRcInxcIkRFTEVURVwifVxuXHRcdHRoaXMubGFzdFJlY29yZGVkVXBkYXRlID0gT2JqZWN0LmNyZWF0ZShudWxsKTsgLy8gSGFzaG1hcCBieSB0aXRsZSBvZiBsYXN0IHJlY29yZGVkIHVwZGF0ZSB2aWEgU1NFOiB7dHlwZTogXCJ1cGRhdGVcInxcImRldGV0aW9uXCIsIHJldmlzaW9uX2lkOn1cblx0XHR0aGlzLmxvZ2dlciA9IG5ldyAkdHcudXRpbHMuTG9nZ2VyKFwiTXVsdGlXaWtpQ2xpZW50QWRhcHRvclwiKTtcblx0XHR0aGlzLmlzTG9nZ2VkSW4gPSBmYWxzZTtcblx0XHR0aGlzLmlzUmVhZE9ubHkgPSBmYWxzZTtcblx0XHR0aGlzLm9mZmxpbmUgPSBmYWxzZTtcblx0XHR0aGlzLnVzZXJuYW1lID0gXCJcIjtcblx0XHQvLyBDb21waWxlIHRoZSBkaXJ0eSB0aWRkbGVyIGZpbHRlclxuXHRcdHRoaXMuaW5jb21pbmdVcGRhdGVzRmlsdGVyRm4gPSB0aGlzLndpa2kuY29tcGlsZUZpbHRlcih0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoSU5DT01JTkdfVVBEQVRFU19GSUxURVJfVElERExFUikpO1xuXHRcdHRoaXMuc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhTRVJWRVJfTk9UX0NPTk5FQ1RFRCk7XG5cdH1cblxuXHRwcml2YXRlIHNldFVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMoc3RhdHVzOiBzdHJpbmcpIHtcblx0XHR0aGlzLnNlcnZlclVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMgPSBzdGF0dXM7XG5cdFx0dGhpcy53aWtpLmFkZFRpZGRsZXIoe1xuXHRcdFx0dGl0bGU6IENPTk5FQ1RJT05fU1RBVEVfVElERExFUixcblx0XHRcdHRleHQ6IHN0YXR1c1xuXHRcdH0pO1xuXHR9XG5cdHNldExvZ2dlclNhdmVCdWZmZXIobG9nZ2VyRm9yU2F2aW5nOiBMb2dnZXIpIHtcblx0XHR0aGlzLmxvZ2dlci5zZXRTYXZlQnVmZmVyKGxvZ2dlckZvclNhdmluZyk7XG5cdH1cblx0aXNSZWFkeSgpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRwcml2YXRlIGdldEhvc3QoKSB7XG5cdFx0dmFyIHRleHQgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoQ09ORklHX0hPU1RfVElERExFUiwgREVGQVVMVF9IT1NUX1RJRERMRVIpLCBzdWJzdGl0dXRpb25zID0gW1xuXHRcdFx0eyBuYW1lOiBcInByb3RvY29sXCIsIHZhbHVlOiBkb2N1bWVudC5sb2NhdGlvbi5wcm90b2NvbCB9LFxuXHRcdFx0eyBuYW1lOiBcImhvc3RcIiwgdmFsdWU6IGRvY3VtZW50LmxvY2F0aW9uLmhvc3QgfSxcblx0XHRcdHsgbmFtZTogXCJwYXRobmFtZVwiLCB2YWx1ZTogZG9jdW1lbnQubG9jYXRpb24ucGF0aG5hbWUgfVxuXHRcdF07XG5cdFx0Zm9yICh2YXIgdCA9IDA7IHQgPCBzdWJzdGl0dXRpb25zLmxlbmd0aDsgdCsrKSB7XG5cdFx0XHR2YXIgcyA9IHN1YnN0aXR1dGlvbnNbdF07XG5cdFx0XHR0ZXh0ID0gJHR3LnV0aWxzLnJlcGxhY2VTdHJpbmcodGV4dCwgbmV3IFJlZ0V4cChcIlxcXFwkXCIgKyBzLm5hbWUgKyBcIlxcXFwkXCIsIFwibWdcIiksIHMudmFsdWUpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGV4dDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVjaXBlUmVxdWVzdDxLRVkgZXh0ZW5kcyAoc3RyaW5nICYga2V5b2YgVGlkZGxlclJvdXRlclJlc3BvbnNlKT4oXG5cdFx0b3B0aW9uczogT21pdDxIdHRwUmVxdWVzdE9wdGlvbnM8XCJhcnJheWJ1ZmZlclwiPiwgXCJyZXNwb25zZVR5cGVcIj4gJiB7IGtleTogS0VZIH1cblx0KSB7XG5cdFx0aWYgKCFvcHRpb25zLnVybC5zdGFydHNXaXRoKFwiL1wiKSlcblx0XHRcdHRocm93IG5ldyBFcnJvcihcIlRoZSB1cmwgZG9lcyBub3Qgc3RhcnQgd2l0aCBhIHNsYXNoXCIpO1xuXG5cdFx0cmV0dXJuIGF3YWl0IGh0dHBSZXF1ZXN0KHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRyZXNwb25zZVR5cGU6IFwiYmxvYlwiLFxuXHRcdFx0dXJsOiB0aGlzLmhvc3QgKyBcInJlY2lwZXMvXCIgKyBlbmNvZGVVUklDb21wb25lbnQodGhpcy5yZWNpcGUpICsgb3B0aW9ucy51cmwsXG5cdFx0fSkudGhlbihyZXN1bHQgPT4ge1xuXHRcdFx0Ly8gaW4gdGhlb3J5LCA0MDMgYW5kIDQwNCBzaG91bGQgcmVzdWx0IGluIGZ1cnRoZXIgYWN0aW9uLCBcblx0XHRcdC8vIGJ1dCBpbiByZWFsaXR5IGFuIGVycm9yIGdldHMgbG9nZ2VkIHRvIGNvbnNvbGUgYW5kIHRoYXQncyBpdC5cblx0XHRcdGlmICghcmVzdWx0Lm9rKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihcblx0XHRcdFx0XHRgVGhlIHNlcnZlciByZXR1cm4gYSBzdGF0dXMgY29kZSAke3Jlc3VsdC5zdGF0dXN9IHdpdGggdGhlIGZvbGxvd2luZyByZWFzb246IGBcblx0XHRcdFx0XHQrIGAke3Jlc3VsdC5oZWFkZXJzLmdldChcIngtcmVhc29uXCIpID8/IFwiKG5vIHJlYXNvbiBnaXZlbilcIn1gXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0fVxuXHRcdH0pLnRoZW4oYXN5bmMgZSA9PiB7XG5cdFx0XHRsZXQgcmVzcG9uc2VTdHJpbmc6IHN0cmluZyA9IFwiXCI7XG5cdFx0XHRpZiAoZS5oZWFkZXJzLmdldChcIngtZ3ppcC1zdHJlYW1cIikgPT09IFwieWVzXCIpIHtcblx0XHRcdFx0Ly8gQnJvd3NlcnMgb25seSBkZWNvZGUgdGhlIGZpcnN0IHN0cmVhbSwgXG5cdFx0XHRcdC8vIHNvIHdlIGNhbnQgdXNlIGNvbnRlbnQtZW5jb2Rpbmcgb3IgRGVjb21wcmVzc2lvblN0cmVhbVxuXG5cdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KGFzeW5jIHJlc29sdmUgPT4ge1xuXG5cdFx0XHRcdFx0Y29uc3QgZ3VuemlwID0gbmV3IGZmbGF0ZS5Bc3luY0d1bnppcCgoZXJyLCBjaHVuaywgZmluYWwpID0+IHtcblx0XHRcdFx0XHRcdGlmIChlcnIpIHJldHVybiBjb25zb2xlLmxvZyhlcnIpO1xuXHRcdFx0XHRcdFx0cmVzcG9uc2VTdHJpbmcgKz0gZmZsYXRlLnN0ckZyb21VOChjaHVuayk7XG5cdFx0XHRcdFx0XHRpZiAoZmluYWwpIHJlc29sdmUoKTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGlmICh0aGlzLmlzRGV2TW9kZSkgZ3VuemlwLm9ubWVtYmVyID0gZSA9PiBjb25zb2xlLmxvZyhcImd1bnppcCBtZW1iZXJcIiwgZSk7XG5cblx0XHRcdFx0XHRndW56aXAucHVzaChuZXcgVWludDhBcnJheShhd2FpdCByZWFkQmxvYkFzQXJyYXlCdWZmZXIoZS5yZXNwb25zZSkpKTtcblx0XHRcdFx0XHQvLyB0aGlzIGhhcyB0byBiZSBvbiBhIHNlcGFyYXRlIGxpbmVcblx0XHRcdFx0XHRndW56aXAucHVzaChuZXcgVWludDhBcnJheSgpLCB0cnVlKTtcblxuXHRcdFx0XHR9KTtcblxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzcG9uc2VTdHJpbmcgPSBmZmxhdGUuc3RyRnJvbVU4KG5ldyBVaW50OEFycmF5KGF3YWl0IHJlYWRCbG9iQXNBcnJheUJ1ZmZlcihlLnJlc3BvbnNlKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5pc0Rldk1vZGUpIGNvbnNvbGUubG9nKFwiZ3VuemlwIHJlc3VsdFwiLCByZXNwb25zZVN0cmluZy5sZW5ndGgpO1xuXG5cdFx0XHRyZXR1cm4gW3RydWUsIHZvaWQgMCwge1xuXHRcdFx0XHQuLi5lLFxuXHRcdFx0XHRyZXNwb25zZVN0cmluZyxcblx0XHRcdFx0LyoqIHRoaXMgaXMgdW5kZWZpbmVkIGlmIHN0YXR1cyBpcyBub3QgMjAwICovXG5cdFx0XHRcdHJlc3BvbnNlSlNPTjogZS5zdGF0dXMgPT09IDIwMFxuXHRcdFx0XHRcdD8gdHJ5UGFyc2VKU09OKHJlc3BvbnNlU3RyaW5nKSBhcyBUaWRkbGVyUm91dGVyUmVzcG9uc2VbS0VZXVtcIlJcIl1cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdH1dIGFzIGNvbnN0O1xuXHRcdH0sIGUgPT4gW2ZhbHNlLCBlLCB2b2lkIDBdIGFzIGNvbnN0KTtcblxuXHRcdGZ1bmN0aW9uIHRyeVBhcnNlSlNPTihkYXRhOiBzdHJpbmcpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBKU09OLnBhcnNlKGRhdGEpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRjb25zb2xlLmVycm9yKFwiRXJyb3IgcGFyc2luZyBKU09OLCByZXR1cm5pbmcgdW5kZWZpbmVkXCIsIGUpO1xuXHRcdFx0XHQvLyBjb25zb2xlLmxvZyhkYXRhKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0fVxuXG5cdGdldFRpZGRsZXJJbmZvKHRpZGRsZXI6IFRpZGRsZXIpIHtcblx0XHR2YXIgdGl0bGUgPSB0aWRkbGVyLmZpZWxkcy50aXRsZSxcblx0XHRcdHJldmlzaW9uID0gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oUkVWSVNJT05fU1RBVEVfVElERExFUiwgdGl0bGUpLFxuXHRcdFx0YmFnID0gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oQkFHX1NUQVRFX1RJRERMRVIsIHRpdGxlKTtcblx0XHRpZiAocmV2aXNpb24gJiYgYmFnKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0aXRsZTogdGl0bGUsXG5cdFx0XHRcdHJldmlzaW9uOiByZXZpc2lvbixcblx0XHRcdFx0YmFnOiBiYWdcblx0XHRcdH07XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cdHByaXZhdGUgZ2V0VGlkZGxlckJhZyh0aXRsZTogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMud2lraS5leHRyYWN0VGlkZGxlckRhdGFJdGVtKEJBR19TVEFURV9USURETEVSLCB0aXRsZSk7XG5cdH1cblx0Z2V0VGlkZGxlclJldmlzaW9uKHRpdGxlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oUkVWSVNJT05fU1RBVEVfVElERExFUiwgdGl0bGUpO1xuXHR9XG5cdHByaXZhdGUgc2V0VGlkZGxlckluZm8odGl0bGU6IHN0cmluZywgcmV2aXNpb246IHN0cmluZywgYmFnOiBzdHJpbmcpIHtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChCQUdfU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIGJhZywgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChSRVZJU0lPTl9TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgcmV2aXNpb24sIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdH1cblx0cHJpdmF0ZSByZW1vdmVUaWRkbGVySW5mbyh0aXRsZTogc3RyaW5nKSB7XG5cdFx0dGhpcy53aWtpLnNldFRleHQoQkFHX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCB1bmRlZmluZWQsIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdFx0dGhpcy53aWtpLnNldFRleHQoUkVWSVNJT05fU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIHVuZGVmaW5lZCwgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0fVxuXG5cdC8qXG5cdEdldCB0aGUgY3VycmVudCBzdGF0dXMgb2YgdGhlIHNlcnZlciBjb25uZWN0aW9uXG5cdCovXG5cdGFzeW5jIGdldFN0YXR1cyhjYWxsYmFjazogU2VydmVyU3RhdHVzQ2FsbGJhY2spIHtcblxuXHRcdGNvbnN0IFtvaywgZXJyb3IsIGRhdGFdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdGtleTogXCJoYW5kbGVHZXRSZWNpcGVTdGF0dXNcIixcblx0XHRcdG1ldGhvZDogXCJHRVRcIixcblx0XHRcdHVybDogXCIvc3RhdHVzXCIsXG5cdFx0fSk7XG5cdFx0aWYgKCFvaykge1xuXHRcdFx0dGhpcy5pc0xvZ2dlZEluID0gZmFsc2U7XG5cdFx0XHR0aGlzLmlzUmVhZE9ubHkgPSB0cnVlO1xuXHRcdFx0dGhpcy51c2VybmFtZSA9IFwiKG9mZmxpbmUpXCI7XG5cdFx0XHR0aGlzLm9mZmxpbmUgPSB0cnVlO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBzdGF0dXMgPSBkYXRhLnJlc3BvbnNlSlNPTjtcblx0XHRcdHRoaXMuaXNSZWFkT25seSA9IHN0YXR1cz8uaXNSZWFkT25seSA/PyB0cnVlO1xuXHRcdFx0dGhpcy5pc0xvZ2dlZEluID0gc3RhdHVzPy5pc0xvZ2dlZEluID8/IGZhbHNlO1xuXHRcdFx0dGhpcy51c2VybmFtZSA9IHN0YXR1cz8udXNlcm5hbWUgPz8gXCIoYW5vbilcIjtcblx0XHRcdHRoaXMub2ZmbGluZSA9IGZhbHNlO1xuXHRcdH1cblx0XHRpZiAoY2FsbGJhY2spIHtcblx0XHRcdGNhbGxiYWNrKFxuXHRcdFx0XHQvLyBFcnJvclxuXHRcdFx0XHQhb2sgPyBlcnJvciA6IG51bGwsXG5cdFx0XHRcdC8vIElzIGxvZ2dlZCBpblxuXHRcdFx0XHR0aGlzLmlzTG9nZ2VkSW4sXG5cdFx0XHRcdC8vIFVzZXJuYW1lXG5cdFx0XHRcdHRoaXMudXNlcm5hbWUsXG5cdFx0XHRcdC8vIElzIHJlYWQgb25seVxuXHRcdFx0XHR0aGlzLmlzUmVhZE9ubHksXG5cdFx0XHRcdC8vIElzIGFub255bW91c1xuXHRcdFx0XHQvLyBubyBpZGVhIHdoYXQgdGhpcyBtZWFucywgYWx3YXlzIHJldHVybiBmYWxzZVxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdCk7XG5cdFx0fVxuXHR9XG5cdC8qXG5cdEdldCBkZXRhaWxzIG9mIGNoYW5nZWQgdGlkZGxlcnMgZnJvbSB0aGUgc2VydmVyXG5cdCovXG5cdGdldFVwZGF0ZWRUaWRkbGVycyhzeW5jZXI6IFN5bmNlciwgY2FsbGJhY2s6IChlcnI6IGFueSwgY2hhbmdlcz86IHsgbW9kaWZpY2F0aW9uczogc3RyaW5nW107IGRlbGV0aW9uczogc3RyaW5nW10gfSkgPT4gdm9pZCkge1xuXHRcdGlmKHRoaXMub2ZmbGluZSkgcmV0dXJuIGNhbGxiYWNrKG51bGwpO1xuXHRcdGlmICghdGhpcy51c2VTZXJ2ZXJTZW50RXZlbnRzKSB7XG5cdFx0XHR0aGlzLnBvbGxTZXJ2ZXIoKS50aGVuKGNoYW5nZXMgPT4ge1xuXHRcdFx0XHRjYWxsYmFjayhudWxsLCBjaGFuZ2VzKTtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gSWYgQnJvd3N3ZXIgU3RvcmFnZSB0aWRkbGVycyB3ZXJlIGNhY2hlZCBvbiByZWxvYWRpbmcgdGhlIHdpa2ksIGFkZCB0aGVtIGFmdGVyIHN5bmMgZnJvbSBzZXJ2ZXIgY29tcGxldGVzIGluIHRoZSBhYm92ZSBjYWxsYmFjay5cblx0XHRcdFx0XHRpZiAoJHR3LmJyb3dzZXJTdG9yYWdlICYmICR0dy5icm93c2VyU3RvcmFnZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdFx0JHR3LmJyb3dzZXJTdG9yYWdlLmFkZENhY2hlZFRpZGRsZXJzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sIGVyciA9PiB7XG5cdFx0XHRcdGNhbGxiYWNrKGVycik7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0Ly8gRG8gbm90aGluZyBpZiB0aGVyZSdzIGFscmVhZHkgYSBjb25uZWN0aW9uIGluIHByb2dyZXNzLlxuXHRcdGlmICh0aGlzLnNlcnZlclVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMgIT09IFNFUlZFUl9OT1RfQ09OTkVDVEVEKSB7XG5cdFx0XHRyZXR1cm4gY2FsbGJhY2sobnVsbCwge1xuXHRcdFx0XHRtb2RpZmljYXRpb25zOiBbXSxcblx0XHRcdFx0ZGVsZXRpb25zOiBbXVxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdC8vIFRyeSB0byBjb25uZWN0IGEgc2VydmVyIHN0cmVhbVxuXHRcdHRoaXMuc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhTRVJWRVJfQ09OTkVDVElOR19TU0UpO1xuXHRcdHRoaXMuY29ubmVjdFNlcnZlclN0cmVhbSh7XG5cdFx0XHRzeW5jZXI6IHN5bmNlcixcblx0XHRcdG9uZXJyb3I6IGFzeW5jIGZ1bmN0aW9uIChlcnIpIHtcblx0XHRcdFx0c2VsZi5sb2dnZXIubG9nKFwiRXJyb3IgY29ubmVjdGluZyBTU0Ugc3RyZWFtXCIsIGVycik7XG5cdFx0XHRcdC8vIElmIHRoZSBzdHJlYW0gZGlkbid0IHdvcmssIHRyeSBwb2xsaW5nXG5cdFx0XHRcdHNlbGYuc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhTRVJWRVJfUE9MTElORyk7XG5cdFx0XHRcdGNvbnN0IGNoYW5nZXMgPSBhd2FpdCBzZWxmLnBvbGxTZXJ2ZXIoKTtcblx0XHRcdFx0c2VsZi5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9OT1RfQ09OTkVDVEVEKTtcblx0XHRcdFx0Y2FsbGJhY2sobnVsbCwgY2hhbmdlcyk7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdC8vIElmIEJyb3dzd2VyIFN0b3JhZ2UgdGlkZGxlcnMgd2VyZSBjYWNoZWQgb24gcmVsb2FkaW5nIHRoZSB3aWtpLCBhZGQgdGhlbSBhZnRlciBzeW5jIGZyb20gc2VydmVyIGNvbXBsZXRlcyBpbiB0aGUgYWJvdmUgY2FsbGJhY2suXG5cdFx0XHRcdFx0aWYgKCR0dy5icm93c2VyU3RvcmFnZSAmJiAkdHcuYnJvd3NlclN0b3JhZ2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0XHRcdCR0dy5icm93c2VyU3RvcmFnZS5hZGRDYWNoZWRUaWRkbGVycygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0b25vcGVuOiBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdHNlbGYuc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhTRVJWRVJfQ09OTkVDVEVEX1NTRSk7XG5cdFx0XHRcdC8vIFRoZSBzeW5jZXIgaXMgZXhwZWN0aW5nIGEgY2FsbGJhY2sgYnV0IHdlIGRvbid0IGhhdmUgYW55IGRhdGEgdG8gc2VuZFxuXHRcdFx0XHRjYWxsYmFjayhudWxsLCB7XG5cdFx0XHRcdFx0bW9kaWZpY2F0aW9uczogW10sXG5cdFx0XHRcdFx0ZGVsZXRpb25zOiBbXVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHR9XG5cdC8qXG5cdEF0dGVtcHQgdG8gZXN0YWJsaXNoIGFuIFNTRSBzdHJlYW0gd2l0aCB0aGUgc2VydmVyIGFuZCB0cmFuc2ZlciB0aWRkbGVyIGNoYW5nZXMuIE9wdGlvbnMgaW5jbHVkZTpcbiAgXG5cdHN5bmNlcjogcmVmZXJlbmNlIHRvIHN5bmNlciBvYmplY3QgdXNlZCBmb3Igc3RvcmluZyBkYXRhXG5cdG9ub3BlbjogaW52b2tlZCB3aGVuIHRoZSBzdHJlYW0gaXMgc3VjY2Vzc2Z1bGx5IG9wZW5lZFxuXHRvbmVycm9yOiBpbnZva2VkIGlmIHRoZXJlIGlzIGFuIGVycm9yXG5cdCovXG5cdHByaXZhdGUgY29ubmVjdFNlcnZlclN0cmVhbShvcHRpb25zOiB7XG5cdFx0c3luY2VyOiBTeW5jZXI7XG5cdFx0b25vcGVuOiAoZXZlbnQ6IEV2ZW50KSA9PiB2b2lkO1xuXHRcdG9uZXJyb3I6IChldmVudDogRXZlbnQpID0+IHZvaWQ7XG5cdH0pIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0Y29uc3QgZXZlbnRTb3VyY2UgPSBuZXcgRXZlbnRTb3VyY2UoXCIvcmVjaXBlcy9cIiArIHRoaXMucmVjaXBlICsgXCIvZXZlbnRzP2xhc3Rfa25vd25fcmV2aXNpb25faWQ9XCIgKyB0aGlzLmxhc3Rfa25vd25fcmV2aXNpb25faWQpO1xuXHRcdGV2ZW50U291cmNlLm9uZXJyb3IgPSBmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHRcdGlmIChvcHRpb25zLm9uZXJyb3IpIHtcblx0XHRcdFx0b3B0aW9ucy5vbmVycm9yKGV2ZW50KTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGV2ZW50U291cmNlLm9ub3BlbiA9IGZ1bmN0aW9uIChldmVudCkge1xuXHRcdFx0aWYgKG9wdGlvbnMub25vcGVuKSB7XG5cdFx0XHRcdG9wdGlvbnMub25vcGVuKGV2ZW50KTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGV2ZW50U291cmNlLmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgZnVuY3Rpb24gKGV2ZW50KSB7XG5cblx0XHRcdGNvbnN0IGRhdGE6IHtcblx0XHRcdFx0dGl0bGU6IHN0cmluZztcblx0XHRcdFx0cmV2aXNpb25faWQ6IG51bWJlcjtcblx0XHRcdFx0aXNfZGVsZXRlZDogYm9vbGVhbjtcblx0XHRcdFx0YmFnX25hbWU6IHN0cmluZztcblx0XHRcdFx0dGlkZGxlcjogYW55O1xuXHRcdFx0fSA9ICR0dy51dGlscy5wYXJzZUpTT05TYWZlKGV2ZW50LmRhdGEpO1xuXHRcdFx0aWYgKCFkYXRhKSByZXR1cm47XG5cblx0XHRcdGNvbnNvbGUubG9nKFwiU1NFIGRhdGFcIiwgZGF0YSk7XG5cdFx0XHQvLyBVcGRhdGUgbGFzdCBzZWVuIHJldmlzaW9uX2lkXG5cdFx0XHRpZiAoZGF0YS5yZXZpc2lvbl9pZCA+IHNlbGYubGFzdF9rbm93bl9yZXZpc2lvbl9pZCkge1xuXHRcdFx0XHRzZWxmLmxhc3Rfa25vd25fcmV2aXNpb25faWQgPSBkYXRhLnJldmlzaW9uX2lkO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUmVjb3JkIHRoZSBsYXN0IHVwZGF0ZSB0byB0aGlzIHRpZGRsZXJcblx0XHRcdHNlbGYubGFzdFJlY29yZGVkVXBkYXRlW2RhdGEudGl0bGVdID0ge1xuXHRcdFx0XHR0eXBlOiBkYXRhLmlzX2RlbGV0ZWQgPyBcImRlbGV0aW9uXCIgOiBcInVwZGF0ZVwiLFxuXHRcdFx0XHRyZXZpc2lvbl9pZDogZGF0YS5yZXZpc2lvbl9pZFxuXHRcdFx0fTtcblx0XHRcdGNvbnNvbGUubG9nKGBPdXN0YW5kaW5nIHJlcXVlc3RzIGlzICR7SlNPTi5zdHJpbmdpZnkoc2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW2RhdGEudGl0bGVdKX1gKTtcblx0XHRcdC8vIFByb2Nlc3MgdGhlIHVwZGF0ZSBpZiB0aGUgdGlkZGxlciBpcyBub3QgdGhlIHN1YmplY3Qgb2YgYW4gb3V0c3RhbmRpbmcgcmVxdWVzdFxuXHRcdFx0aWYgKHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1tkYXRhLnRpdGxlXSkgcmV0dXJuO1xuXHRcdFx0aWYgKGRhdGEuaXNfZGVsZXRlZCkge1xuXHRcdFx0XHRzZWxmLnJlbW92ZVRpZGRsZXJJbmZvKGRhdGEudGl0bGUpO1xuXHRcdFx0XHRkZWxldGUgb3B0aW9ucy5zeW5jZXIudGlkZGxlckluZm9bZGF0YS50aXRsZV07XG5cdFx0XHRcdG9wdGlvbnMuc3luY2VyLmxvZ2dlci5sb2coXCJEZWxldGluZyB0aWRkbGVyIG1pc3NpbmcgZnJvbSBzZXJ2ZXI6XCIsIGRhdGEudGl0bGUpO1xuXHRcdFx0XHRvcHRpb25zLnN5bmNlci53aWtpLmRlbGV0ZVRpZGRsZXIoZGF0YS50aXRsZSk7XG5cdFx0XHRcdG9wdGlvbnMuc3luY2VyLnByb2Nlc3NUYXNrUXVldWUoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHZhciByZXN1bHQgPSBzZWxmLmluY29taW5nVXBkYXRlc0ZpbHRlckZuLmNhbGwoc2VsZi53aWtpLCBzZWxmLndpa2kubWFrZVRpZGRsZXJJdGVyYXRvcihbZGF0YS50aXRsZV0pKTtcblx0XHRcdFx0aWYgKHJlc3VsdC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0c2VsZi5zZXRUaWRkbGVySW5mbyhkYXRhLnRpdGxlLCBkYXRhLnJldmlzaW9uX2lkLnRvU3RyaW5nKCksIGRhdGEuYmFnX25hbWUpO1xuXHRcdFx0XHRcdG9wdGlvbnMuc3luY2VyLnN0b3JlVGlkZGxlcihkYXRhLnRpZGRsZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblxuXHRcdH0pO1xuXHR9XG5cdHByaXZhdGUgYXN5bmMgcG9sbFNlcnZlcigpIHtcblx0XHR0eXBlIHQgPSBUaWRkbGVyUm91dGVyUmVzcG9uc2VbXCJoYW5kbGVHZXRCYWdTdGF0ZXNcIl1cblx0XHRjb25zdCBbb2ssIGVyciwgcmVzdWx0XSA9IGF3YWl0IHRoaXMucmVjaXBlUmVxdWVzdCh7XG5cdFx0XHRrZXk6IFwiaGFuZGxlR2V0QmFnU3RhdGVzXCIsXG5cdFx0XHR1cmw6IFwiL2JhZy1zdGF0ZXNcIixcblx0XHRcdG1ldGhvZDogXCJHRVRcIixcblx0XHRcdHF1ZXJ5UGFyYW1zOiB7XG5cdFx0XHRcdGluY2x1ZGVfZGVsZXRlZDogXCJ5ZXNcIixcblx0XHRcdFx0Li4udGhpcy51c2VHemlwU3RyZWFtID8geyBnemlwX3N0cmVhbTogXCJ5ZXNcIiB9IDoge30sXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAoIW9rKSB0aHJvdyBlcnI7XG5cblx0XHRjb25zdCBiYWdzID0gcmVzdWx0LnJlc3BvbnNlSlNPTjtcblxuXHRcdGlmICghYmFncykgdGhyb3cgbmV3IEVycm9yKFwibm8gcmVzdWx0IHJldHVybmVkXCIpO1xuXG5cdFx0YmFncy5zb3J0KChhLCBiKSA9PiBiLnBvc2l0aW9uIC0gYS5wb3NpdGlvbik7XG5cdFx0Y29uc3QgbW9kaWZpZWQgPSBuZXcgU2V0PHN0cmluZz4oKSxcblx0XHRcdGRlbGV0ZWQgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdGNvbnN0IGluY29taW5nVGl0bGVzID0gbmV3IFNldDxzdHJpbmc+KGJhZ3MubWFwKFxuXHRcdFx0Ly8gZ2V0IHRoZSB0aXRsZXMgaW4gZWFjaCBsYXllciB0aGF0IGFyZW4ndCBkZWxldGVkXG5cdFx0XHRlID0+IGUudGlkZGxlcnMuZmlsdGVyKGYgPT4gIWYuaXNfZGVsZXRlZCkubWFwKGYgPT4gZi50aXRsZSlcblx0XHRcdC8vIGFuZCBmbGF0dGVuIHRoZW0gZm9yIFNldFxuXHRcdCkuZmxhdCgpKTtcblxuXHRcdGxldCBsYXN0X3JldmlzaW9uID0gdGhpcy5sYXN0X2tub3duX3JldmlzaW9uX2lkO1xuXG5cdFx0YmFncy5mb3JFYWNoKGJhZyA9PiB7XG5cdFx0XHRiYWcudGlkZGxlcnMuZm9yRWFjaCh0aWQgPT4ge1xuXHRcdFx0XHQvLyBpZiB0aGUgcmV2aXNpb24gaXMgb2xkLCBpZ25vcmUsIHNpbmNlIGRlbGV0aW9ucyBjcmVhdGUgYSBuZXcgcmV2aXNpb25cblx0XHRcdFx0aWYgKHRpZC5yZXZpc2lvbl9pZCA8PSB0aGlzLmxhc3Rfa25vd25fcmV2aXNpb25faWQpIHJldHVybjtcblx0XHRcdFx0aWYgKHRpZC5yZXZpc2lvbl9pZCA+IGxhc3RfcmV2aXNpb24pIGxhc3RfcmV2aXNpb24gPSB0aWQucmV2aXNpb25faWQ7XG5cdFx0XHRcdC8vIGNoZWNrIGlmIHRoaXMgdGl0bGUgc3RpbGwgZXhpc3RzIGluIGFueSBsYXllclxuXHRcdFx0XHRpZiAoaW5jb21pbmdUaXRsZXMuaGFzKHRpZC50aXRsZSkpXG5cdFx0XHRcdFx0bW9kaWZpZWQuYWRkKHRpZC50aXRsZSk7XG5cdFx0XHRcdGVsc2Vcblx0XHRcdFx0XHRkZWxldGVkLmFkZCh0aWQudGl0bGUpO1xuXHRcdFx0fSlcblx0XHR9KTtcblxuXHRcdHRoaXMubGFzdF9rbm93bl9yZXZpc2lvbl9pZCA9IGxhc3RfcmV2aXNpb247XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0bW9kaWZpY2F0aW9uczogWy4uLm1vZGlmaWVkLmtleXMoKV0sXG5cdFx0XHRkZWxldGlvbnM6IFsuLi5kZWxldGVkLmtleXMoKV0sXG5cdFx0fVxuXG5cdH1cblxuXHQvKlxuXHRRdWV1ZSBhIGxvYWQgZm9yIGEgdGlkZGxlciBpZiB0aGVyZSBoYXMgYmVlbiBhbiB1cGRhdGUgZm9yIGl0IHNpbmNlIHRoZSBzcGVjaWZpZWQgcmV2aXNpb25cblx0Ki9cblx0cHJpdmF0ZSBjaGVja0xhc3RSZWNvcmRlZFVwZGF0ZSh0aXRsZTogc3RyaW5nLCByZXZpc2lvbjogc3RyaW5nKSB7XG5cdFx0dmFyIGxydSA9IHRoaXMubGFzdFJlY29yZGVkVXBkYXRlW3RpdGxlXTtcblx0XHRpZiAobHJ1ICYmIGxydS5yZXZpc2lvbl9pZCA+IHJldmlzaW9uKSB7XG5cdFx0XHRjb25zb2xlLmxvZyhgQ2hlY2tpbmcgZm9yIHVwZGF0ZXMgdG8gJHt0aXRsZX0gc2luY2UgJHtKU09OLnN0cmluZ2lmeShscnUpfSBjb21wYXJpbmcgdG8gJHtyZXZpc2lvbn1gKTtcblx0XHRcdHRoaXMuc3luY2VyICYmIHRoaXMuc3luY2VyLmVucXVldWVMb2FkVGlkZGxlcih0aXRsZSk7XG5cdFx0fVxuXHR9XG5cdHByaXZhdGUgZ2V0IHN5bmNlcigpIHtcblx0XHRpZiAoJHR3LnN5bmNhZGFwdG9yID09PSB0aGlzKSByZXR1cm4gJHR3LnN5bmNlcjtcblx0fVxuXHQvKlxuXHRTYXZlIGEgdGlkZGxlciBhbmQgaW52b2tlIHRoZSBjYWxsYmFjayB3aXRoIChlcnIsYWRhcHRvckluZm8scmV2aXNpb24pXG5cdCovXG5cdGFzeW5jIHNhdmVUaWRkbGVyKFxuXHRcdHRpZGRsZXI6IFRpZGRsZXIsXG5cdFx0Y2FsbGJhY2s6IChcblx0XHRcdGVycjogYW55LFxuXHRcdFx0YWRhcHRvckluZm8/OiBNV1NBZGFwdG9ySW5mbyxcblx0XHRcdHJldmlzaW9uPzogc3RyaW5nXG5cdFx0KSA9PiB2b2lkLFxuXHRcdG9wdGlvbnM/OiB7fVxuXHQpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXMsIHRpdGxlID0gdGlkZGxlci5maWVsZHMudGl0bGUgYXMgc3RyaW5nO1xuXHRcdGlmICh0aXRsZSA9PT0gXCIkOi9TdG9yeUxpc3RcIikge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKG51bGwpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5pc1JlYWRPbmx5IHx8IHRpdGxlLnN1YnN0cigwLCBNV0NfU1RBVEVfVElERExFUl9QUkVGSVgubGVuZ3RoKSA9PT0gTVdDX1NUQVRFX1RJRERMRVJfUFJFRklYKSB7XG5cdFx0XHRyZXR1cm4gY2FsbGJhY2sobnVsbCk7XG5cdFx0fVxuXHRcdHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV0gPSB7IHR5cGU6IFwiUFVUXCIgfTtcblxuXHRcdC8vIGFwcGxpY2F0aW9uL3gtbXdzLXRpZGRsZXJcblx0XHQvLyBUaGUgLnRpZCBmaWxlIGZvcm1hdCBkb2VzIG5vdCBzdXBwb3J0IGZpZWxkIG5hbWVzIHdpdGggY29sb25zLiBcblx0XHQvLyBSYXRoZXIgdGhhbiB0cnlpbmcgdG8gY2F0Y2ggYWxsIHRoZSB1bnN1cHBvcnRlZCB2YXJpYXRpb25zIHRoYXQgbWF5IGFwcGVhcixcblx0XHQvLyB3ZSdsbCBqdXN0IHVzZSBKU09OIHRvIHNlbmQgaXQgYWNyb3NzIHRoZSB3aXJlLCBzaW5jZSB0aGF0IGlzIHRoZSBvZmZpY2lhbCBmYWxsYmFjayBmb3JtYXQgYW55d2F5LlxuXHRcdC8vIEhvd2V2ZXIsIHBhcnNpbmcgYSBodWdlIHN0cmluZyB2YWx1ZSBpbnNpZGUgYSBKU09OIG9iamVjdCBpcyB2ZXJ5IHNsb3csXG5cdFx0Ly8gc28gd2Ugc3BsaXQgb2ZmIHRoZSB0ZXh0IGZpZWxkIGFuZCBzZW5kIGl0IGFmdGVyIHRoZSBvdGhlciBmaWVsZHMuIFxuXG5cdFx0Y29uc3QgZmllbGRzID0gdGlkZGxlci5nZXRGaWVsZFN0cmluZ3Moe30pO1xuXHRcdGNvbnN0IHRleHQgPSBmaWVsZHMudGV4dDtcblx0XHRkZWxldGUgZmllbGRzLnRleHQ7XG5cdFx0bGV0IGJvZHkgPSBKU09OLnN0cmluZ2lmeShmaWVsZHMpO1xuXG5cdFx0aWYgKHRpZGRsZXIuaGFzRmllbGQoXCJ0ZXh0XCIpKSB7XG5cdFx0XHRpZiAodHlwZW9mIHRleHQgIT09IFwic3RyaW5nXCIgJiYgdGV4dClcblx0XHRcdFx0cmV0dXJuIGNhbGxiYWNrKG5ldyBFcnJvcihcIkVycm9yIHNhdmluZyB0aWRkbGVyIFwiICsgZmllbGRzLnRpdGxlICsgXCI6IHRoZSB0ZXh0IGZpZWxkIGlzIHRydXRoeSBidXQgbm90IGEgc3RyaW5nXCIpKTtcblx0XHRcdGJvZHkgKz0gYFxcblxcbiR7dGV4dH1gXG5cdFx0fVxuXG5cdFx0dHlwZSB0ID0gVGlkZGxlclJvdXRlclJlc3BvbnNlW1wiaGFuZGxlU2F2ZVJlY2lwZVRpZGRsZXJcIl1cblx0XHRjb25zdCBbb2ssIGVyciwgcmVzdWx0XSA9IGF3YWl0IHRoaXMucmVjaXBlUmVxdWVzdCh7XG5cdFx0XHRrZXk6IFwiaGFuZGxlU2F2ZVJlY2lwZVRpZGRsZXJcIixcblx0XHRcdHVybDogXCIvdGlkZGxlcnMvXCIgKyBlbmNvZGVVUklDb21wb25lbnQodGl0bGUpLFxuXHRcdFx0bWV0aG9kOiBcIlBVVFwiLFxuXHRcdFx0cmVxdWVzdEJvZHlTdHJpbmc6IGJvZHksXG5cdFx0XHRoZWFkZXJzOiB7XG5cdFx0XHRcdFwiY29udGVudC10eXBlXCI6IFwiYXBwbGljYXRpb24veC1td3MtdGlkZGxlclwiXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRkZWxldGUgc2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW3RpdGxlXTtcblx0XHRpZiAoIW9rKSByZXR1cm4gY2FsbGJhY2soZXJyKTtcblxuXHRcdGNvbnN0IGRhdGEgPSByZXN1bHQucmVzcG9uc2VKU09OO1xuXHRcdGlmICghZGF0YSkgcmV0dXJuIGNhbGxiYWNrKG51bGwpOyAvLyBhIDJ4eCByZXNwb25zZSB3aXRob3V0IGEgYm9keSBpcyB1bmxpa2VseVxuXG5cdFx0Ly9JZiBCcm93c2VyLVN0b3JhZ2UgcGx1Z2luIGlzIHByZXNlbnQsIHJlbW92ZSB0aWRkbGVyIGZyb20gbG9jYWwgc3RvcmFnZSBhZnRlciBzdWNjZXNzZnVsIHN5bmMgdG8gdGhlIHNlcnZlclxuXHRcdGlmICgkdHcuYnJvd3NlclN0b3JhZ2UgJiYgJHR3LmJyb3dzZXJTdG9yYWdlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHQkdHcuYnJvd3NlclN0b3JhZ2UucmVtb3ZlVGlkZGxlckZyb21Mb2NhbFN0b3JhZ2UodGl0bGUpO1xuXHRcdH1cblxuXG5cdFx0Ly8gU2F2ZSB0aGUgZGV0YWlscyBvZiB0aGUgbmV3IHJldmlzaW9uIG9mIHRoZSB0aWRkbGVyXG5cdFx0Y29uc3QgcmV2aXNpb24gPSBkYXRhLnJldmlzaW9uX2lkLCBiYWdfbmFtZSA9IGRhdGEuYmFnX25hbWU7XG5cdFx0Y29uc29sZS5sb2coYFNhdmVkICR7dGl0bGV9IHdpdGggcmV2aXNpb24gJHtyZXZpc2lvbn0gYW5kIGJhZyAke2JhZ19uYW1lfWApO1xuXHRcdC8vIElmIHRoZXJlIGhhcyBiZWVuIGEgbW9yZSByZWNlbnQgdXBkYXRlIGZyb20gdGhlIHNlcnZlciB0aGVuIGVucXVldWUgYSBsb2FkIG9mIHRoaXMgdGlkZGxlclxuXHRcdHNlbGYuY2hlY2tMYXN0UmVjb3JkZWRVcGRhdGUodGl0bGUsIHJldmlzaW9uKTtcblx0XHQvLyBJbnZva2UgdGhlIGNhbGxiYWNrXG5cdFx0c2VsZi5zZXRUaWRkbGVySW5mbyh0aXRsZSwgcmV2aXNpb24sIGJhZ19uYW1lKTtcblx0XHRjYWxsYmFjayhudWxsLCB7IGJhZzogYmFnX25hbWUgfSwgcmV2aXNpb24pO1xuXG5cdH1cblx0Lypcblx0TG9hZCBhIHRpZGRsZXIgYW5kIGludm9rZSB0aGUgY2FsbGJhY2sgd2l0aCAoZXJyLHRpZGRsZXJGaWVsZHMpXG5cblx0VGhlIHN5bmNlciBkb2VzIG5vdCBwYXNzIGl0c2VsZiBpbnRvIG9wdGlvbnMuXG5cdCovXG5cdGFzeW5jIGxvYWRUaWRkbGVyKHRpdGxlOiBzdHJpbmcsIGNhbGxiYWNrOiAoZXJyOiBhbnksIGZpZWxkcz86IGFueSkgPT4gdm9pZCwgb3B0aW9uczogYW55KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV0gPSB7IHR5cGU6IFwiR0VUXCIgfTtcblx0XHRjb25zdCBbb2ssIGVyciwgcmVzdWx0XSA9IGF3YWl0IHRoaXMucmVjaXBlUmVxdWVzdCh7XG5cdFx0XHRrZXk6IFwiaGFuZGxlR2V0UmVjaXBlVGlkZGxlclwiLFxuXHRcdFx0dXJsOiBcIi90aWRkbGVycy9cIiArIGVuY29kZVVSSUNvbXBvbmVudCh0aXRsZSksXG5cdFx0XHRtZXRob2Q6IFwiR0VUXCIsXG5cdFx0fSlcblx0XHRkZWxldGUgc2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW3RpdGxlXTtcblx0XHRpZiAoIW9rKSByZXR1cm4gY2FsbGJhY2soZXJyKTtcblxuXHRcdGNvbnN0IHsgcmVzcG9uc2VKU09OOiBkYXRhLCBoZWFkZXJzIH0gPSByZXN1bHQ7XG5cdFx0Y29uc3QgcmV2aXNpb24gPSBoZWFkZXJzLmdldChcIngtcmV2aXNpb24tbnVtYmVyXCIpID8/IFwiXCIsXG5cdFx0XHRiYWdfbmFtZSA9IGhlYWRlcnMuZ2V0KFwieC1iYWctbmFtZVwiKSA/PyBcIlwiO1xuXG5cdFx0aWYgKCFyZXZpc2lvbiB8fCAhYmFnX25hbWUgfHwgIWRhdGEpIHJldHVybiBjYWxsYmFjayhudWxsLCBudWxsKTtcblxuXHRcdC8vIElmIHRoZXJlIGhhcyBiZWVuIGEgbW9yZSByZWNlbnQgdXBkYXRlIGZyb20gdGhlIHNlcnZlciB0aGVuIGVucXVldWUgYSBsb2FkIG9mIHRoaXMgdGlkZGxlclxuXHRcdHNlbGYuY2hlY2tMYXN0UmVjb3JkZWRVcGRhdGUodGl0bGUsIHJldmlzaW9uKTtcblx0XHQvLyBJbnZva2UgdGhlIGNhbGxiYWNrXG5cdFx0c2VsZi5zZXRUaWRkbGVySW5mbyh0aXRsZSwgcmV2aXNpb24sIGJhZ19uYW1lKTtcblx0XHRjYWxsYmFjayhudWxsLCBkYXRhKTtcblx0fVxuXHQvKlxuXHREZWxldGUgYSB0aWRkbGVyIGFuZCBpbnZva2UgdGhlIGNhbGxiYWNrIHdpdGggKGVycilcblx0b3B0aW9ucyBpbmNsdWRlOlxuXHR0aWRkbGVySW5mbzogdGhlIHN5bmNlcidzIHRpZGRsZXJJbmZvIGZvciB0aGlzIHRpZGRsZXJcblx0Ki9cblx0YXN5bmMgZGVsZXRlVGlkZGxlcih0aXRsZTogc3RyaW5nLCBjYWxsYmFjazogKGVycjogYW55LCBhZGFwdG9ySW5mbz86IGFueSkgPT4gdm9pZCwgb3B0aW9uczogYW55KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdGlmICh0aGlzLmlzUmVhZE9ubHkpIHsgcmV0dXJuIGNhbGxiYWNrKG51bGwpOyB9XG5cdFx0Ly8gSWYgd2UgZG9uJ3QgaGF2ZSBhIGJhZyBpdCBtZWFucyB0aGF0IHRoZSB0aWRkbGVyIGhhc24ndCBiZWVuIHNlZW4gYnkgdGhlIHNlcnZlciwgc28gd2UgZG9uJ3QgbmVlZCB0byBkZWxldGUgaXRcblx0XHQvLyB2YXIgYmFnID0gdGhpcy5nZXRUaWRkbGVyQmFnKHRpdGxlKTtcblx0XHQvLyBpZighYmFnKSB7IHJldHVybiBjYWxsYmFjayhudWxsLCBvcHRpb25zLnRpZGRsZXJJbmZvLmFkYXB0b3JJbmZvKTsgfVxuXHRcdHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV0gPSB7IHR5cGU6IFwiREVMRVRFXCIgfTtcblx0XHQvLyBJc3N1ZSBIVFRQIHJlcXVlc3QgdG8gZGVsZXRlIHRoZSB0aWRkbGVyXG5cdFx0Y29uc3QgW29rLCBlcnIsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3Qoe1xuXHRcdFx0a2V5OiBcImhhbmRsZURlbGV0ZVJlY2lwZVRpZGRsZXJcIixcblx0XHRcdHVybDogXCIvdGlkZGxlcnMvXCIgKyBlbmNvZGVVUklDb21wb25lbnQodGl0bGUpLFxuXHRcdFx0bWV0aG9kOiBcIkRFTEVURVwiLFxuXHRcdH0pO1xuXHRcdGRlbGV0ZSBzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdO1xuXHRcdGlmICghb2spIHJldHVybiBjYWxsYmFjayhlcnIpO1xuXHRcdGNvbnN0IHsgcmVzcG9uc2VKU09OOiBkYXRhIH0gPSByZXN1bHQ7XG5cdFx0aWYgKCFkYXRhKSByZXR1cm4gY2FsbGJhY2sobnVsbCk7XG5cblx0XHRjb25zdCByZXZpc2lvbiA9IGRhdGEucmV2aXNpb25faWQsIGJhZ19uYW1lID0gZGF0YS5iYWdfbmFtZTtcblx0XHQvLyBJZiB0aGVyZSBoYXMgYmVlbiBhIG1vcmUgcmVjZW50IHVwZGF0ZSBmcm9tIHRoZSBzZXJ2ZXIgdGhlbiBlbnF1ZXVlIGEgbG9hZCBvZiB0aGlzIHRpZGRsZXJcblx0XHRzZWxmLmNoZWNrTGFzdFJlY29yZGVkVXBkYXRlKHRpdGxlLCByZXZpc2lvbik7XG5cdFx0c2VsZi5yZW1vdmVUaWRkbGVySW5mbyh0aXRsZSk7XG5cdFx0Ly8gSW52b2tlIHRoZSBjYWxsYmFjayAmIHJldHVybiBudWxsIGFkYXB0b3JJbmZvXG5cdFx0Y2FsbGJhY2sobnVsbCwgbnVsbCk7XG5cdH1cbn1cblxuXG5pZiAoJHR3LmJyb3dzZXIgJiYgZG9jdW1lbnQubG9jYXRpb24ucHJvdG9jb2wuc3RhcnRzV2l0aChcImh0dHBcIikpIHtcblx0ZXhwb3J0cy5hZGFwdG9yQ2xhc3MgPSBNdWx0aVdpa2lDbGllbnRBZGFwdG9yO1xufVxuXG50eXBlIFBhcmFtc0lucHV0ID0gVVJMU2VhcmNoUGFyYW1zIHwgW3N0cmluZywgc3RyaW5nXVtdIHwgb2JqZWN0IHwgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5pbnRlcmZhY2UgSHR0cFJlcXVlc3RPcHRpb25zPFRZUEUgZXh0ZW5kcyBcImFycmF5YnVmZmVyXCIgfCBcImJsb2JcIiB8IFwidGV4dFwiPiB7XG5cdC8qKiBUaGUgcmVxdWVzdCBNRVRIT0QuIE1heWJlIGJlIGFueXRoaW5nIGV4Y2VwdCBDT05ORUNULCBUUkFDRSwgb3IgVFJBQ0suICAqL1xuXHRtZXRob2Q6IHN0cmluZztcblx0LyoqIFRoZSB1cmwgbWF5IGFsc28gY29udGFpbiBxdWVyeSBwYXJhbXMuICovXG5cdHVybDogc3RyaW5nO1xuXHQvKiogVGhlIHJlc3BvbnNlIHR5cGVzICovXG5cdHJlc3BvbnNlVHlwZTogVFlQRTtcblx0aGVhZGVycz86IFBhcmFtc0lucHV0O1xuXHQvKiogVGhpcyBpcyBwYXJzZWQgc2VwYXJhdGVseSBmcm9tIHRoZSB1cmwgYW5kIGFwcGVuZGVkIHRvIGl0LiAqL1xuXHRxdWVyeVBhcmFtcz86IFBhcmFtc0lucHV0O1xuXHQvKiogXG5cdCAqIFRoZSBzdHJpbmcgdG8gc2VuZCBhcyB0aGUgcmVxdWVzdCBib2R5LiBOb3QgdmFsaWQgZm9yIEdFVCBhbmQgSEVBRC5cblx0ICogXG5cdCAqIEZvciBgYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkYCwgdXNlIGBuZXcgVVJMU2VhcmNoUGFyYW1zKCkudG9TdHJpbmcoKWAuXG5cdCAqIFxuXHQgKiBGb3IgYGFwcGxpY2F0aW9uL2pzb25gLCB1c2UgYEpTT04uc3RyaW5naWZ5KClgXG5cdCAqL1xuXHRyZXF1ZXN0Qm9keVN0cmluZz86IHN0cmluZztcblx0cHJvZ3Jlc3M/OiAoZXZlbnQ6IFByb2dyZXNzRXZlbnQ8RXZlbnRUYXJnZXQ+KSA9PiB2b2lkO1xufVxuXG5cbmZ1bmN0aW9uIGh0dHBSZXF1ZXN0PFRZUEUgZXh0ZW5kcyBcImFycmF5YnVmZmVyXCIgfCBcImJsb2JcIiB8IFwidGV4dFwiPihvcHRpb25zOiBIdHRwUmVxdWVzdE9wdGlvbnM8VFlQRT4pIHtcblxuXHRvcHRpb25zLm1ldGhvZCA9IG9wdGlvbnMubWV0aG9kLnRvVXBwZXJDYXNlKCk7XG5cblx0aWYgKChvcHRpb25zLm1ldGhvZCA9PT0gXCJHRVRcIiB8fCBvcHRpb25zLm1ldGhvZCA9PT0gXCJIRUFEXCIpICYmIG9wdGlvbnMucmVxdWVzdEJvZHlTdHJpbmcpXG5cdFx0dGhyb3cgbmV3IEVycm9yKFwicmVxdWVzdEJvZHlTdHJpbmcgbXVzdCBiZSBmYWxzeSBpZiBtZXRob2QgaXMgR0VUIG9yIEhFQURcIik7XG5cblx0ZnVuY3Rpb24gcGFyYW1zSW5wdXQoaW5wdXQ6IFBhcmFtc0lucHV0KSB7XG5cdFx0aWYgKCFpbnB1dCkgcmV0dXJuIG5ldyBVUkxTZWFyY2hQYXJhbXMoKTtcblx0XHRpZiAoaW5wdXQgaW5zdGFuY2VvZiBVUkxTZWFyY2hQYXJhbXMpIHJldHVybiBpbnB1dDtcblx0XHRpZiAoQXJyYXkuaXNBcnJheShpbnB1dCkgfHwgdHlwZW9mIGlucHV0ID09PSBcInN0cmluZ1wiKSByZXR1cm4gbmV3IFVSTFNlYXJjaFBhcmFtcyhpbnB1dCk7XG5cdFx0cmV0dXJuIG5ldyBVUkxTZWFyY2hQYXJhbXMoT2JqZWN0LmVudHJpZXMoaW5wdXQpKTtcblx0fVxuXG5cdGZ1bmN0aW9uIG5vcm1hbGl6ZUhlYWRlcnMoaGVhZGVyczogVVJMU2VhcmNoUGFyYW1zKSB7XG5cdFx0Wy4uLmhlYWRlcnMua2V5cygpXS5mb3JFYWNoKChbaywgdl0pID0+IHtcblx0XHRcdGNvbnN0IGsyID0gay50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0aWYgKGsyICE9PSBrKSB7XG5cdFx0XHRcdGhlYWRlcnMuZ2V0QWxsKGspLmZvckVhY2goZSA9PiB7XG5cdFx0XHRcdFx0aGVhZGVycy5hcHBlbmQoazIsIGUpO1xuXHRcdFx0XHR9KVxuXHRcdFx0XHRoZWFkZXJzLmRlbGV0ZShrKTtcblx0XHRcdFx0Y29uc29sZS5sb2coaywgazIpO1xuXHRcdFx0fVxuXHRcdH0pXG5cdH1cblxuXHRyZXR1cm4gbmV3IFByb21pc2U8e1xuXHRcdC8qKiBTaG9ydGhhbmQgdG8gY2hlY2sgaWYgdGhlIHJlc3BvbnNlIGlzIGluIHRoZSAyeHggcmFuZ2UuICovXG5cdFx0b2s6IGJvb2xlYW47XG5cdFx0c3RhdHVzOiBudW1iZXI7XG5cdFx0c3RhdHVzVGV4dDogc3RyaW5nO1xuXHRcdGhlYWRlcnM6IFVSTFNlYXJjaFBhcmFtcztcblx0XHRyZXNwb25zZTpcblx0XHRUWVBFIGV4dGVuZHMgXCJhcnJheWJ1ZmZlclwiID8gQXJyYXlCdWZmZXIgOlxuXHRcdFRZUEUgZXh0ZW5kcyBcImJsb2JcIiA/IEJsb2IgOlxuXHRcdFRZUEUgZXh0ZW5kcyBcInRleHRcIiA/IHN0cmluZyA6XG5cdFx0bmV2ZXI7XG5cdH0+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHQvLyBpZiB0aGlzIHRocm93cyBzeW5jJ2x5LCB0aGUgcHJvbWlzZSB3aWxsIHJlamVjdC5cblxuXHRcdGNvbnN0IHVybCA9IG5ldyBVUkwob3B0aW9ucy51cmwsIGxvY2F0aW9uLmhyZWYpO1xuXHRcdGNvbnN0IHF1ZXJ5ID0gcGFyYW1zSW5wdXQob3B0aW9ucy5xdWVyeVBhcmFtcyk7XG5cdFx0cXVlcnkuZm9yRWFjaCgodiwgaykgPT4geyB1cmwuc2VhcmNoUGFyYW1zLmFwcGVuZChrLCB2KTsgfSk7XG5cblx0XHRjb25zdCBoZWFkZXJzID0gcGFyYW1zSW5wdXQob3B0aW9ucy5oZWFkZXJzKTtcblx0XHRub3JtYWxpemVIZWFkZXJzKGhlYWRlcnMpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXHRcdHJlcXVlc3QucmVzcG9uc2VUeXBlID0gb3B0aW9ucy5yZXNwb25zZVR5cGUgfHwgXCJ0ZXh0XCI7XG5cblx0XHR0cnkge1xuXHRcdFx0cmVxdWVzdC5vcGVuKG9wdGlvbnMubWV0aG9kLCB1cmwsIHRydWUpO1xuXHRcdH0gY2F0Y2ggKGUpIHsgY29uc29sZS5sb2coZSwgeyBlIH0pOyB0aHJvdyBlOyB9XG5cblx0XHRpZiAoIWhlYWRlcnMuaGFzKFwiY29udGVudC10eXBlXCIpKVxuXHRcdFx0aGVhZGVycy5zZXQoXCJjb250ZW50LXR5cGVcIiwgXCJhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQ7IGNoYXJzZXQ9VVRGLThcIik7XG5cblx0XHRpZiAoIWhlYWRlcnMuaGFzKFwieC1yZXF1ZXN0ZWQtd2l0aFwiKSlcblx0XHRcdGhlYWRlcnMuc2V0KFwieC1yZXF1ZXN0ZWQtd2l0aFwiLCBcIlRpZGRseVdpa2lcIik7XG5cblx0XHRoZWFkZXJzLnNldChcImFjY2VwdFwiLCBcImFwcGxpY2F0aW9uL2pzb25cIik7XG5cblxuXHRcdGhlYWRlcnMuZm9yRWFjaCgodiwgaykgPT4ge1xuXHRcdFx0cmVxdWVzdC5zZXRSZXF1ZXN0SGVhZGVyKGssIHYpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gcmVxdWVzdC5vbmVycm9yID0gKGV2ZW50KSA9PiB7XG5cdFx0Ly8gXHRjb25zb2xlLmxvZyhldmVudCk7XG5cdFx0Ly8gXHRjb25zb2xlLmxvZygoZXZlbnQgYXMgUHJvZ3Jlc3NFdmVudDxYTUxIdHRwUmVxdWVzdD4pIS50YXJnZXQ/LnN0YXR1cyk7XG5cdFx0Ly8gfVxuXG5cdFx0cmVxdWVzdC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHRpZiAodGhpcy5yZWFkeVN0YXRlICE9PSA0KSByZXR1cm47XG5cblx0XHRcdGNvbnN0IGhlYWRlcnMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdFx0XHRyZXF1ZXN0LmdldEFsbFJlc3BvbnNlSGVhZGVycygpPy50cmltKCkuc3BsaXQoL1tcXHJcXG5dKy8pLmZvckVhY2goKGxpbmUpID0+IHtcblx0XHRcdFx0Y29uc3QgcGFydHMgPSBsaW5lLnNwbGl0KFwiOiBcIik7XG5cdFx0XHRcdGNvbnN0IGhlYWRlciA9IHBhcnRzLnNoaWZ0KCk/LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGNvbnN0IHZhbHVlID0gcGFydHMuam9pbihcIjogXCIpO1xuXHRcdFx0XHRpZiAoaGVhZGVyKSBoZWFkZXJzLmFwcGVuZChoZWFkZXIsIHZhbHVlKTtcblx0XHRcdH0pO1xuXHRcdFx0cmVzb2x2ZSh7XG5cdFx0XHRcdG9rOiB0aGlzLnN0YXR1cyA+PSAyMDAgJiYgdGhpcy5zdGF0dXMgPCAzMDAsXG5cdFx0XHRcdHN0YXR1czogdGhpcy5zdGF0dXMsXG5cdFx0XHRcdHN0YXR1c1RleHQ6IHRoaXMuc3RhdHVzVGV4dCxcblx0XHRcdFx0cmVzcG9uc2U6IHRoaXMucmVzcG9uc2UsXG5cdFx0XHRcdGhlYWRlcnMsXG5cdFx0XHR9KTtcblxuXHRcdH07XG5cblx0XHRpZiAob3B0aW9ucy5wcm9ncmVzcylcblx0XHRcdHJlcXVlc3Qub25wcm9ncmVzcyA9IG9wdGlvbnMucHJvZ3Jlc3M7XG5cblx0XHR0cnkgeyByZXF1ZXN0LnNlbmQob3B0aW9ucy5yZXF1ZXN0Qm9keVN0cmluZyk7IH0gY2F0Y2ggKGUpIHsgY29uc29sZS5sb2coZSwgeyBlIH0pOyB0aHJvdyBlOyB9XG5cblxuXHR9KTtcblxufVxuXG5mdW5jdGlvbiByZWFkQmxvYkFzQXJyYXlCdWZmZXIoYmxvYjogQmxvYikge1xuXHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcihcIkVycm9yIHJlYWRpbmcgYmxvYlwiKTtcblx0cmV0dXJuIG5ldyBQcm9taXNlPEFycmF5QnVmZmVyPigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Y29uc3QgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcblx0XHRyZWFkZXIub25sb2FkID0gKCkgPT4ge1xuXHRcdFx0cmVzb2x2ZShyZWFkZXIucmVzdWx0IGFzIEFycmF5QnVmZmVyKVxuXHRcdH07XG5cdFx0cmVhZGVyLm9uZXJyb3IgPSAoKSA9PiB7XG5cdFx0XHRyZWplY3QoZXJyb3IpO1xuXHRcdH07XG5cdFx0cmVhZGVyLnJlYWRBc0FycmF5QnVmZmVyKGJsb2IpO1xuXHR9KTtcblxufVxuIl19