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
            return yield httpRequest(Object.assign(Object.assign({}, options), { responseType: "blob", url: this.host + "wiki/" + encodeURIComponent(this.recipe) + options.url })).then(result => {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGl3aWtpY2xpZW50YWRhcHRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tdWx0aXdpa2ljbGllbnRhZGFwdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHO0FBRUgsa0VBQWtFO0FBQ2xFLFlBQVksQ0FBQzs7Ozs7Ozs7Ozs7QUEwSWIsSUFBSSxtQkFBbUIsR0FBRyxnQ0FBZ0MsRUFDekQsb0JBQW9CLEdBQUcscUJBQXFCLEVBQzVDLHdCQUF3QixHQUFHLDJCQUEyQixFQUN0RCxpQkFBaUIsR0FBRyx1Q0FBdUMsRUFDM0Qsc0JBQXNCLEdBQUcsNENBQTRDLEVBQ3JFLHdCQUF3QixHQUFHLHFDQUFxQyxFQUNoRSwrQkFBK0IsR0FBRyxtREFBbUQsRUFDckYsa0JBQWtCLEdBQUcsa0RBQWtELEVBQ3ZFLG1CQUFtQixHQUFHLG1DQUFtQyxFQUN6RCwwQkFBMEIsR0FBRyxzQ0FBc0MsQ0FBQztBQUdyRSxJQUFJLG9CQUFvQixHQUFHLGVBQWUsRUFDekMscUJBQXFCLEdBQUcsZ0JBQWdCLEVBQ3hDLG9CQUFvQixHQUFHLGVBQWUsRUFDdEMsY0FBYyxHQUFHLGdCQUFnQixDQUFDO0FBT25DLE1BQU0sc0JBQXNCO0lBb0IzQixZQUFZLE9BQXNCO1FBRmxDLFNBQUksR0FBRyxpQkFBaUIsQ0FBQztRQUNqQix3QkFBbUIsR0FBRyxJQUFJLENBQUM7UUFFbEMsSUFBSSxDQUFDLElBQUksR0FBRyxPQUFPLENBQUMsSUFBSSxDQUFDO1FBQ3pCLElBQUksQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQzNCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsa0NBQWtDLENBQUMsQ0FBQztRQUMzRSxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsS0FB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QTtRQUN0QyxDQUFDLENBQUM7UUFDRixNQUFNLENBQUMsT0FBTyxHQUFHLEdBQUcsRUFBRTtZQUNyQixNQUFNLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDZixDQUFDLENBQUM7UUFDRixNQUFNLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEMsQ0FBQyxDQUFDLENBQUM7QUFFSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLypcXFxudGl0bGU6ICQ6L3BsdWdpbnMvdGlkZGx5d2lraS90aWRkbHl3ZWIvdGlkZGx5d2ViYWRhcHRvci5qc1xudHlwZTogYXBwbGljYXRpb24vamF2YXNjcmlwdFxubW9kdWxlLXR5cGU6IHN5bmNhZGFwdG9yXG5cbkEgc3luYyBhZGFwdG9yIG1vZHVsZSBmb3Igc3luY2hyb25pc2luZyB3aXRoIE11bHRpV2lraVNlcnZlci1jb21wYXRpYmxlIHNlcnZlcnMuIFxuXG5JdCBoYXMgdGhyZWUga2V5IGFyZWFzIG9mIGNvbmNlcm46XG5cbiogQmFzaWMgb3BlcmF0aW9ucyBsaWtlIHB1dCwgZ2V0LCBhbmQgZGVsZXRlIGEgdGlkZGxlciBvbiB0aGUgc2VydmVyXG4qIFJlYWwgdGltZSB1cGRhdGVzIGZyb20gdGhlIHNlcnZlciAoaGFuZGxlZCBieSBTU0UpXG4qIEJhZ3MgYW5kIHJlY2lwZXMsIHdoaWNoIGFyZSB1bmtub3duIHRvIHRoZSBzeW5jZXJcblxuQSBrZXkgYXNwZWN0IG9mIHRoZSBkZXNpZ24gaXMgdGhhdCB0aGUgc3luY2VyIG5ldmVyIG92ZXJsYXBzIGJhc2ljIHNlcnZlciBvcGVyYXRpb25zOyBpdCB3YWl0cyBmb3IgdGhlXG5wcmV2aW91cyBvcGVyYXRpb24gdG8gY29tcGxldGUgYmVmb3JlIHNlbmRpbmcgYSBuZXcgb25lLlxuXG5cXCovXG5cbi8vIHRoZSBibGFuayBsaW5lIGlzIGltcG9ydGFudCwgYW5kIHNvIGlzIHRoZSBmb2xsb3dpbmcgdXNlIHN0cmljdFxuXCJ1c2Ugc3RyaWN0XCI7XG5cbmltcG9ydCB0eXBlIHsgU3luY2VyLCBUaWRkbGVyLCBJVGlkZGx5V2lraSB9IGZyb20gXCJ0aWRkbHl3aWtpXCI7XG5pbXBvcnQgdHlwZSB7IFRpZGRsZXJSb3V0ZXIgfSBmcm9tIFwiQHRpZGRseXdpa2kvbXdzL3NyYy9yb3V0ZXMvbWFuYWdlcnMvd2lraS1yb3V0ZXNcIjtcbmltcG9ydCB0eXBlIHsgWm9kUm91dGUgfSBmcm9tIFwiQHRpZGRseXdpa2kvbXdzL3NyYy9yb3V0ZXJcIjtcblxuZGVjbGFyZSBnbG9iYWwge1xuXHRjb25zdCBmZmxhdGU6IHR5cGVvZiBpbXBvcnQoXCJmZmxhdGVcIik7XG59XG5cbmRlY2xhcmUgY2xhc3MgTG9nZ2VyIHtcblx0Y29uc3RydWN0b3IoY29tcG9uZW50TmFtZTogYW55LCBvcHRpb25zOiBhbnkpO1xuXHRjb21wb25lbnROYW1lOiBhbnk7XG5cdGNvbG91cjogYW55O1xuXHRlbmFibGU6IGFueTtcblx0c2F2ZTogYW55O1xuXHRzYXZlTGltaXQ6IGFueTtcblx0c2F2ZUJ1ZmZlckxvZ2dlcjogdGhpcztcblx0YnVmZmVyOiBzdHJpbmc7XG5cdGFsZXJ0Q291bnQ6IG51bWJlcjtcblx0c2V0U2F2ZUJ1ZmZlcihsb2dnZXI6IGFueSk6IHZvaWQ7XG5cdGxvZyguLi5hcmdzOiBhbnlbXSk6IGFueTtcblx0Z2V0QnVmZmVyKCk6IHN0cmluZztcblx0dGFibGUodmFsdWU6IGFueSk6IHZvaWQ7XG5cdGFsZXJ0KC4uLmFyZ3M6IGFueVtdKTogdm9pZDtcblx0Y2xlYXJBbGVydHMoKTogdm9pZDtcbn1cblxudHlwZSBUaWRkbGVyUm91dGVyUmVzcG9uc2UgPSB7XG5cdFtLIGluIGtleW9mIFRpZGRsZXJSb3V0ZXJdOiBUaWRkbGVyUm91dGVyW0tdIGV4dGVuZHMgWm9kUm91dGU8aW5mZXIgTSwgaW5mZXIgQiwgaW5mZXIgUCwgaW5mZXIgUSwgaW5mZXIgVCwgaW5mZXIgUj5cblx0PyB7IE06IE0sIEI6IEIsIFA6IFAsIFE6IFEsIFQ6IFQsIFI6IFIgfVxuXHQ6IG5ldmVyXG59XG5cbmRlY2xhcmUgbW9kdWxlICd0aWRkbHl3aWtpJyB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgU3luY2VyIHtcblx0XHR3aWtpOiBXaWtpO1xuXHRcdGxvZ2dlcjogTG9nZ2VyO1xuXHRcdHRpZGRsZXJJbmZvOiBSZWNvcmQ8c3RyaW5nLCB7IGJhZzogc3RyaW5nOyByZXZpc2lvbjogc3RyaW5nIH0+O1xuXHRcdGVucXVldWVMb2FkVGlkZGxlcih0aXRsZTogc3RyaW5nKTogdm9pZDtcblx0XHRzdG9yZVRpZGRsZXIodGlkZGxlcjogVGlkZGxlcik6IHZvaWQ7XG5cdFx0cHJvY2Vzc1Rhc2tRdWV1ZSgpOiB2b2lkO1xuXHR9XG5cdGludGVyZmFjZSBJVGlkZGx5V2lraSB7XG5cdFx0YnJvd3NlclN0b3JhZ2U6IGFueTtcblx0fVxufVxuXG50eXBlIFNlcnZlclN0YXR1c0NhbGxiYWNrID0gKFxuXHRlcnI6IGFueSxcblx0LyoqIFxuXHQgKiAkOi9zdGF0dXMvSXNMb2dnZWRJbiBtb3N0bHkgYXBwZWFycyBhbG9uZ3NpZGUgdGhlIHVzZXJuYW1lIFxuXHQgKiBvciBvdGhlciBsb2dpbi1jb25kaXRpb25hbCBiZWhhdmlvci4gXG5cdCAqL1xuXHRpc0xvZ2dlZEluPzogYm9vbGVhbixcblx0LyoqXG5cdCAqICQ6L3N0YXR1cy9Vc2VyTmFtZSBpcyBzdGlsbCB1c2VkIGZvciB0aGluZ3MgbGlrZSBkcmFmdHMgZXZlbiBpZiB0aGUgXG5cdCAqIHVzZXIgaXNuJ3QgbG9nZ2VkIGluLCBhbHRob3VnaCB0aGUgdXNlcm5hbWUgaXMgbGVzcyBsaWtlbHkgdG8gYmUgc2hvd24gXG5cdCAqIHRvIHRoZSB1c2VyLiBcblx0ICovXG5cdHVzZXJuYW1lPzogc3RyaW5nLFxuXHQvKiogXG5cdCAqICQ6L3N0YXR1cy9Jc1JlYWRPbmx5IHB1dHMgdGhlIFVJIGluIHJlYWRvbmx5IG1vZGUsIFxuXHQgKiBidXQgZG9lcyBub3QgcHJldmVudCBhdXRvbWF0aWMgY2hhbmdlcyBmcm9tIGF0dGVtcHRpbmcgdG8gc2F2ZS4gXG5cdCAqL1xuXHRpc1JlYWRPbmx5PzogYm9vbGVhbixcblx0LyoqIFxuXHQgKiAkOi9zdGF0dXMvSXNBbm9ueW1vdXMgZG9lcyBub3QgYXBwZWFyIGFueXdoZXJlIGluIHRoZSBUVzUgcmVwbyEgXG5cdCAqIFNvIGl0IGhhcyBubyBhcHBhcmVudCBwdXJwb3NlLiBcblx0ICovXG5cdGlzQW5vbnltb3VzPzogYm9vbGVhblxuKSA9PiB2b2lkXG5cbmludGVyZmFjZSBTeW5jQWRhcHRvcjxBRD4ge1xuXHRuYW1lPzogc3RyaW5nO1xuXG5cdGlzUmVhZHk/KCk6IGJvb2xlYW47XG5cblx0Z2V0U3RhdHVzPyhcblx0XHRjYjogU2VydmVyU3RhdHVzQ2FsbGJhY2tcblx0KTogdm9pZDtcblxuXHRnZXRTa2lubnlUaWRkbGVycz8oXG5cdFx0Y2I6IChlcnI6IGFueSwgdGlkZGxlckZpZWxkczogUmVjb3JkPHN0cmluZywgc3RyaW5nPltdKSA9PiB2b2lkXG5cdCk6IHZvaWQ7XG5cdGdldFVwZGF0ZWRUaWRkbGVycz8oXG5cdFx0c3luY2VyOiBTeW5jZXIsXG5cdFx0Y2I6IChcblx0XHRcdGVycjogYW55LFxuXHRcdFx0LyoqIEFycmF5cyBvZiB0aXRsZXMgdGhhdCBoYXZlIGJlZW4gbW9kaWZpZWQgb3IgZGVsZXRlZCAqL1xuXHRcdFx0dXBkYXRlcz86IHsgbW9kaWZpY2F0aW9uczogc3RyaW5nW10sIGRlbGV0aW9uczogc3RyaW5nW10gfVxuXHRcdCkgPT4gdm9pZFxuXHQpOiB2b2lkO1xuXG5cdC8qKiBcblx0ICogdXNlZCB0byBvdmVycmlkZSB0aGUgZGVmYXVsdCBTeW5jZXIgZ2V0VGlkZGxlclJldmlzaW9uIGJlaGF2aW9yXG5cdCAqIG9mIHJldHVybmluZyB0aGUgcmV2aXNpb24gZmllbGRcblx0ICogXG5cdCAqL1xuXHRnZXRUaWRkbGVyUmV2aXNpb24/KHRpdGxlOiBzdHJpbmcpOiBzdHJpbmc7XG5cdC8qKiBcblx0ICogdXNlZCB0byBnZXQgdGhlIGFkYXB0ZXIgaW5mbyBmcm9tIGEgdGlkZGxlciBpbiBzaXR1YXRpb25zXG5cdCAqIG90aGVyIHRoYW4gdGhlIHNhdmVUaWRkbGVyIGNhbGxiYWNrXG5cdCAqL1xuXHRnZXRUaWRkbGVySW5mbyh0aWRkbGVyOiBUaWRkbGVyKTogQUQgfCB1bmRlZmluZWQ7XG5cblx0c2F2ZVRpZGRsZXIoXG5cdFx0dGlkZGxlcjogYW55LFxuXHRcdGNiOiAoXG5cdFx0XHRlcnI6IGFueSxcblx0XHRcdGFkYXB0b3JJbmZvPzogQUQsXG5cdFx0XHRyZXZpc2lvbj86IHN0cmluZ1xuXHRcdCkgPT4gdm9pZCxcblx0XHRleHRyYTogeyB0aWRkbGVySW5mbzogU3luY2VyVGlkZGxlckluZm88QUQ+IH1cblx0KTogdm9pZDtcblxuXHRzZXRMb2dnZXJTYXZlQnVmZmVyPzogKGxvZ2dlckZvclNhdmluZzogTG9nZ2VyKSA9PiB2b2lkO1xuXHRkaXNwbGF5TG9naW5Qcm9tcHQ/KHN5bmNlcjogU3luY2VyKTogdm9pZDtcblx0bG9naW4/KHVzZXJuYW1lOiBzdHJpbmcsIHBhc3N3b3JkOiBzdHJpbmcsIGNiOiAoZXJyOiBhbnkpID0+IHZvaWQpOiB2b2lkO1xuXHRsb2dvdXQ/KGNiOiAoZXJyOiBhbnkpID0+IHZvaWQpOiBhbnk7XG59XG5pbnRlcmZhY2UgU3luY2VyVGlkZGxlckluZm88QUQ+IHtcblx0LyoqIHRoaXMgY29tZXMgZnJvbSB0aGUgd2lraSBjaGFuZ2VDb3VudCByZWNvcmQgKi9cblx0Y2hhbmdlQ291bnQ6IG51bWJlcjtcblx0LyoqIEFkYXB0ZXIgaW5mbyByZXR1cm5lZCBieSB0aGUgc3luYyBhZGFwdGVyICovXG5cdGFkYXB0b3JJbmZvOiBBRDtcblx0LyoqIFJldmlzaW9uIHJldHVybiBieSB0aGUgc3luYyBhZGFwdGVyICovXG5cdHJldmlzaW9uOiBzdHJpbmc7XG5cdC8qKiBUaW1lc3RhbXAgc2V0IGluIHRoZSBjYWxsYmFjayBvZiB0aGUgcHJldmlvdXMgc2F2ZSAqL1xuXHR0aW1lc3RhbXBMYXN0U2F2ZWQ6IERhdGU7XG59XG5cbmRlY2xhcmUgY29uc3QgJHR3OiBhbnk7XG5cbmRlY2xhcmUgY29uc3QgZXhwb3J0czoge1xuXHRhZGFwdG9yQ2xhc3M6IHR5cGVvZiBNdWx0aVdpa2lDbGllbnRBZGFwdG9yO1xufTtcblxudmFyIENPTkZJR19IT1NUX1RJRERMRVIgPSBcIiQ6L2NvbmZpZy9tdWx0aXdpa2ljbGllbnQvaG9zdFwiLFxuXHRERUZBVUxUX0hPU1RfVElERExFUiA9IFwiJHByb3RvY29sJC8vJGhvc3QkL1wiLFxuXHRNV0NfU1RBVEVfVElERExFUl9QUkVGSVggPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC9cIixcblx0QkFHX1NUQVRFX1RJRERMRVIgPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC90aWRkbGVycy9iYWdcIixcblx0UkVWSVNJT05fU1RBVEVfVElERExFUiA9IFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L3RpZGRsZXJzL3JldmlzaW9uXCIsXG5cdENPTk5FQ1RJT05fU1RBVEVfVElERExFUiA9IFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L2Nvbm5lY3Rpb25cIixcblx0SU5DT01JTkdfVVBEQVRFU19GSUxURVJfVElERExFUiA9IFwiJDovY29uZmlnL211bHRpd2lraWNsaWVudC9pbmNvbWluZy11cGRhdGVzLWZpbHRlclwiLFxuXHRFTkFCTEVfU1NFX1RJRERMRVIgPSBcIiQ6L2NvbmZpZy9tdWx0aXdpa2ljbGllbnQvdXNlLXNlcnZlci1zZW50LWV2ZW50c1wiLFxuXHRJU19ERVZfTU9ERV9USURETEVSID0gYCQ6L3N0YXRlL211bHRpd2lraWNsaWVudC9kZXYtbW9kZWAsXG5cdEVOQUJMRV9HWklQX1NUUkVBTV9USURETEVSID0gYCQ6L3N0YXRlL211bHRpd2lraWNsaWVudC9nemlwLXN0cmVhbWA7XG5cblxudmFyIFNFUlZFUl9OT1RfQ09OTkVDVEVEID0gXCJOT1QgQ09OTkVDVEVEXCIsXG5cdFNFUlZFUl9DT05ORUNUSU5HX1NTRSA9IFwiQ09OTkVDVElORyBTU0VcIixcblx0U0VSVkVSX0NPTk5FQ1RFRF9TU0UgPSBcIkNPTk5FQ1RFRCBTU0VcIixcblx0U0VSVkVSX1BPTExJTkcgPSBcIlNFUlZFUiBQT0xMSU5HXCI7XG5cbmludGVyZmFjZSBNV1NBZGFwdG9ySW5mbyB7XG5cdGJhZzogc3RyaW5nXG59XG5cblxuY2xhc3MgTXVsdGlXaWtpQ2xpZW50QWRhcHRvciBpbXBsZW1lbnRzIFN5bmNBZGFwdG9yPE1XU0FkYXB0b3JJbmZvPiB7XG5cdHByaXZhdGUgd2lraTtcblx0cHJpdmF0ZSBob3N0O1xuXHRwcml2YXRlIHJlY2lwZTtcblx0cHJpdmF0ZSB1c2VTZXJ2ZXJTZW50RXZlbnRzO1xuXHRwcml2YXRlIGxhc3Rfa25vd25fcmV2aXNpb25faWQ7XG5cdHByaXZhdGUgb3V0c3RhbmRpbmdSZXF1ZXN0cztcblx0cHJpdmF0ZSBsYXN0UmVjb3JkZWRVcGRhdGU7XG5cdHByaXZhdGUgbG9nZ2VyO1xuXHRwcml2YXRlIGlzTG9nZ2VkSW47XG5cdHByaXZhdGUgaXNSZWFkT25seTtcblx0cHJpdmF0ZSBvZmZsaW5lO1xuXHRwcml2YXRlIHVzZXJuYW1lO1xuXHRwcml2YXRlIGluY29taW5nVXBkYXRlc0ZpbHRlckZuO1xuXHRwcml2YXRlIHNlcnZlclVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMhOiBzdHJpbmc7XG5cdHByaXZhdGUgaXNEZXZNb2RlOiBib29sZWFuO1xuXHRwcml2YXRlIHVzZUd6aXBTdHJlYW06IGJvb2xlYW47XG5cblx0bmFtZSA9IFwibXVsdGl3aWtpY2xpZW50XCI7XG5cdHByaXZhdGUgc3VwcG9ydHNMYXp5TG9hZGluZyA9IHRydWU7XG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IHsgd2lraTogYW55IH0pIHtcblx0XHR0aGlzLndpa2kgPSBvcHRpb25zLndpa2k7XG5cdFx0dGhpcy5ob3N0ID0gdGhpcy5nZXRIb3N0KCk7XG5cdFx0dGhpcy5yZWNpcGUgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L3JlY2lwZVwiKTtcblx0XHR0aGlzLnVzZVNlcnZlclNlbnRFdmVudHMgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoRU5BQkxFX1NTRV9USURETEVSKSA9PT0gXCJ5ZXNcIjtcblx0XHR0aGlzLmlzRGV2TW9kZSA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChJU19ERVZfTU9ERV9USURETEVSKSA9PT0gXCJ5ZXNcIjtcblx0XHR0aGlzLnVzZUd6aXBTdHJlYW0gPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoRU5BQkxFX0daSVBfU1RSRUFNX1RJRERMRVIpID09PSBcInllc1wiO1xuXHRcdHRoaXMubGFzdF9rbm93bl9yZXZpc2lvbl9pZCA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC9yZWNpcGUvbGFzdF9yZXZpc2lvbl9pZFwiLCBcIjBcIilcblx0XHR0aGlzLm91dHN0YW5kaW5nUmVxdWVzdHMgPSBPYmplY3QuY3JlYXRlKG51bGwpOyAvLyBIYXNobWFwIGJ5IHRpdGxlIG9mIG91dHN0YW5kaW5nIHJlcXVlc3Qgb2JqZWN0OiB7dHlwZTogXCJQVVRcInxcIkdFVFwifFwiREVMRVRFXCJ9XG5cdFx0dGhpcy5sYXN0UmVjb3JkZWRVcGRhdGUgPSBPYmplY3QuY3JlYXRlKG51bGwpOyAvLyBIYXNobWFwIGJ5IHRpdGxlIG9mIGxhc3QgcmVjb3JkZWQgdXBkYXRlIHZpYSBTU0U6IHt0eXBlOiBcInVwZGF0ZVwifFwiZGV0ZXRpb25cIiwgcmV2aXNpb25faWQ6fVxuXHRcdHRoaXMubG9nZ2VyID0gbmV3ICR0dy51dGlscy5Mb2dnZXIoXCJNdWx0aVdpa2lDbGllbnRBZGFwdG9yXCIpO1xuXHRcdHRoaXMuaXNMb2dnZWRJbiA9IGZhbHNlO1xuXHRcdHRoaXMuaXNSZWFkT25seSA9IGZhbHNlO1xuXHRcdHRoaXMub2ZmbGluZSA9IGZhbHNlO1xuXHRcdHRoaXMudXNlcm5hbWUgPSBcIlwiO1xuXHRcdC8vIENvbXBpbGUgdGhlIGRpcnR5IHRpZGRsZXIgZmlsdGVyXG5cdFx0dGhpcy5pbmNvbWluZ1VwZGF0ZXNGaWx0ZXJGbiA9IHRoaXMud2lraS5jb21waWxlRmlsdGVyKHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChJTkNPTUlOR19VUERBVEVTX0ZJTFRFUl9USURETEVSKSk7XG5cdFx0dGhpcy5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9OT1RfQ09OTkVDVEVEKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhzdGF0dXM6IHN0cmluZykge1xuXHRcdHRoaXMuc2VydmVyVXBkYXRlQ29ubmVjdGlvblN0YXR1cyA9IHN0YXR1cztcblx0XHR0aGlzLndpa2kuYWRkVGlkZGxlcih7XG5cdFx0XHR0aXRsZTogQ09OTkVDVElPTl9TVEFURV9USURETEVSLFxuXHRcdFx0dGV4dDogc3RhdHVzXG5cdFx0fSk7XG5cdH1cblx0c2V0TG9nZ2VyU2F2ZUJ1ZmZlcihsb2dnZXJGb3JTYXZpbmc6IExvZ2dlcikge1xuXHRcdHRoaXMubG9nZ2VyLnNldFNhdmVCdWZmZXIobG9nZ2VyRm9yU2F2aW5nKTtcblx0fVxuXHRpc1JlYWR5KCkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cdHByaXZhdGUgZ2V0SG9zdCgpIHtcblx0XHR2YXIgdGV4dCA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChDT05GSUdfSE9TVF9USURETEVSLCBERUZBVUxUX0hPU1RfVElERExFUiksIHN1YnN0aXR1dGlvbnMgPSBbXG5cdFx0XHR7IG5hbWU6IFwicHJvdG9jb2xcIiwgdmFsdWU6IGRvY3VtZW50LmxvY2F0aW9uLnByb3RvY29sIH0sXG5cdFx0XHR7IG5hbWU6IFwiaG9zdFwiLCB2YWx1ZTogZG9jdW1lbnQubG9jYXRpb24uaG9zdCB9LFxuXHRcdFx0eyBuYW1lOiBcInBhdGhuYW1lXCIsIHZhbHVlOiBkb2N1bWVudC5sb2NhdGlvbi5wYXRobmFtZSB9XG5cdFx0XTtcblx0XHRmb3IgKHZhciB0ID0gMDsgdCA8IHN1YnN0aXR1dGlvbnMubGVuZ3RoOyB0KyspIHtcblx0XHRcdHZhciBzID0gc3Vic3RpdHV0aW9uc1t0XTtcblx0XHRcdHRleHQgPSAkdHcudXRpbHMucmVwbGFjZVN0cmluZyh0ZXh0LCBuZXcgUmVnRXhwKFwiXFxcXCRcIiArIHMubmFtZSArIFwiXFxcXCRcIiwgXCJtZ1wiKSwgcy52YWx1ZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWNpcGVSZXF1ZXN0PEtFWSBleHRlbmRzIChzdHJpbmcgJiBrZXlvZiBUaWRkbGVyUm91dGVyUmVzcG9uc2UpPihcblx0XHRvcHRpb25zOiBPbWl0PEh0dHBSZXF1ZXN0T3B0aW9uczxcImFycmF5YnVmZmVyXCI+LCBcInJlc3BvbnNlVHlwZVwiPiAmIHsga2V5OiBLRVkgfVxuXHQpIHtcblx0XHRpZiAoIW9wdGlvbnMudXJsLnN0YXJ0c1dpdGgoXCIvXCIpKVxuXHRcdFx0dGhyb3cgbmV3IEVycm9yKFwiVGhlIHVybCBkb2VzIG5vdCBzdGFydCB3aXRoIGEgc2xhc2hcIik7XG5cblx0XHRyZXR1cm4gYXdhaXQgaHR0cFJlcXVlc3Qoe1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdHJlc3BvbnNlVHlwZTogXCJibG9iXCIsXG5cdFx0XHR1cmw6IHRoaXMuaG9zdCArIFwid2lraS9cIiArIGVuY29kZVVSSUNvbXBvbmVudCh0aGlzLnJlY2lwZSkgKyBvcHRpb25zLnVybCxcblx0XHR9KS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHQvLyBpbiB0aGVvcnksIDQwMyBhbmQgNDA0IHNob3VsZCByZXN1bHQgaW4gZnVydGhlciBhY3Rpb24sIFxuXHRcdFx0Ly8gYnV0IGluIHJlYWxpdHkgYW4gZXJyb3IgZ2V0cyBsb2dnZWQgdG8gY29uc29sZSBhbmQgdGhhdCdzIGl0LlxuXHRcdFx0aWYgKCFyZXN1bHQub2spIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKFxuXHRcdFx0XHRcdGBUaGUgc2VydmVyIHJldHVybiBhIHN0YXR1cyBjb2RlICR7cmVzdWx0LnN0YXR1c30gd2l0aCB0aGUgZm9sbG93aW5nIHJlYXNvbjogYFxuXHRcdFx0XHRcdCsgYCR7cmVzdWx0LmhlYWRlcnMuZ2V0KFwieC1yZWFzb25cIikgPz8gXCIobm8gcmVhc29uIGdpdmVuKVwifWBcblx0XHRcdFx0KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHR9XG5cdFx0fSkudGhlbihhc3luYyBlID0+IHtcblx0XHRcdGxldCByZXNwb25zZVN0cmluZzogc3RyaW5nID0gXCJcIjtcblx0XHRcdGlmIChlLmhlYWRlcnMuZ2V0KFwieC1nemlwLXN0cmVhbVwiKSA9PT0gXCJ5ZXNcIikge1xuXHRcdFx0XHQvLyBCcm93c2VycyBvbmx5IGRlY29kZSB0aGUgZmlyc3Qgc3RyZWFtLCBcblx0XHRcdFx0Ly8gc28gd2UgY2FudCB1c2UgY29udGVudC1lbmNvZGluZyBvciBEZWNvbXByZXNzaW9uU3RyZWFtXG5cblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oYXN5bmMgcmVzb2x2ZSA9PiB7XG5cblx0XHRcdFx0XHRjb25zdCBndW56aXAgPSBuZXcgZmZsYXRlLkFzeW5jR3VuemlwKChlcnIsIGNodW5rLCBmaW5hbCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKGVycikgcmV0dXJuIGNvbnNvbGUubG9nKGVycik7XG5cdFx0XHRcdFx0XHRyZXNwb25zZVN0cmluZyArPSBmZmxhdGUuc3RyRnJvbVU4KGNodW5rKTtcblx0XHRcdFx0XHRcdGlmIChmaW5hbCkgcmVzb2x2ZSgpO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0aWYgKHRoaXMuaXNEZXZNb2RlKSBndW56aXAub25tZW1iZXIgPSBlID0+IGNvbnNvbGUubG9nKFwiZ3VuemlwIG1lbWJlclwiLCBlKTtcblxuXHRcdFx0XHRcdGd1bnppcC5wdXNoKG5ldyBVaW50OEFycmF5KGF3YWl0IHJlYWRCbG9iQXNBcnJheUJ1ZmZlcihlLnJlc3BvbnNlKSkpO1xuXHRcdFx0XHRcdC8vIHRoaXMgaGFzIHRvIGJlIG9uIGEgc2VwYXJhdGUgbGluZVxuXHRcdFx0XHRcdGd1bnppcC5wdXNoKG5ldyBVaW50OEFycmF5KCksIHRydWUpO1xuXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXNwb25zZVN0cmluZyA9IGZmbGF0ZS5zdHJGcm9tVTgobmV3IFVpbnQ4QXJyYXkoYXdhaXQgcmVhZEJsb2JBc0FycmF5QnVmZmVyKGUucmVzcG9uc2UpKSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmlzRGV2TW9kZSkgY29uc29sZS5sb2coXCJndW56aXAgcmVzdWx0XCIsIHJlc3BvbnNlU3RyaW5nLmxlbmd0aCk7XG5cblx0XHRcdHJldHVybiBbdHJ1ZSwgdm9pZCAwLCB7XG5cdFx0XHRcdC4uLmUsXG5cdFx0XHRcdHJlc3BvbnNlU3RyaW5nLFxuXHRcdFx0XHQvKiogdGhpcyBpcyB1bmRlZmluZWQgaWYgc3RhdHVzIGlzIG5vdCAyMDAgKi9cblx0XHRcdFx0cmVzcG9uc2VKU09OOiBlLnN0YXR1cyA9PT0gMjAwXG5cdFx0XHRcdFx0PyB0cnlQYXJzZUpTT04ocmVzcG9uc2VTdHJpbmcpIGFzIFRpZGRsZXJSb3V0ZXJSZXNwb25zZVtLRVldW1wiUlwiXVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0fV0gYXMgY29uc3Q7XG5cdFx0fSwgZSA9PiBbZmFsc2UsIGUsIHZvaWQgMF0gYXMgY29uc3QpO1xuXG5cdFx0ZnVuY3Rpb24gdHJ5UGFyc2VKU09OKGRhdGE6IHN0cmluZykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0cmV0dXJuIEpTT04ucGFyc2UoZGF0YSk7XG5cdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdGNvbnNvbGUuZXJyb3IoXCJFcnJvciBwYXJzaW5nIEpTT04sIHJldHVybmluZyB1bmRlZmluZWRcIiwgZSk7XG5cdFx0XHRcdC8vIGNvbnNvbGUubG9nKGRhdGEpO1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH1cblxuXHR9XG5cblx0Z2V0VGlkZGxlckluZm8odGlkZGxlcjogVGlkZGxlcikge1xuXHRcdHZhciB0aXRsZSA9IHRpZGRsZXIuZmllbGRzLnRpdGxlLFxuXHRcdFx0cmV2aXNpb24gPSB0aGlzLndpa2kuZXh0cmFjdFRpZGRsZXJEYXRhSXRlbShSRVZJU0lPTl9TVEFURV9USURETEVSLCB0aXRsZSksXG5cdFx0XHRiYWcgPSB0aGlzLndpa2kuZXh0cmFjdFRpZGRsZXJEYXRhSXRlbShCQUdfU1RBVEVfVElERExFUiwgdGl0bGUpO1xuXHRcdGlmIChyZXZpc2lvbiAmJiBiYWcpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHRpdGxlOiB0aXRsZSxcblx0XHRcdFx0cmV2aXNpb246IHJldmlzaW9uLFxuXHRcdFx0XHRiYWc6IGJhZ1xuXHRcdFx0fTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblx0cHJpdmF0ZSBnZXRUaWRkbGVyQmFnKHRpdGxlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oQkFHX1NUQVRFX1RJRERMRVIsIHRpdGxlKTtcblx0fVxuXHRnZXRUaWRkbGVyUmV2aXNpb24odGl0bGU6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLndpa2kuZXh0cmFjdFRpZGRsZXJEYXRhSXRlbShSRVZJU0lPTl9TVEFURV9USURETEVSLCB0aXRsZSk7XG5cdH1cblx0cHJpdmF0ZSBzZXRUaWRkbGVySW5mbyh0aXRsZTogc3RyaW5nLCByZXZpc2lvbjogc3RyaW5nLCBiYWc6IHN0cmluZykge1xuXHRcdHRoaXMud2lraS5zZXRUZXh0KEJBR19TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgYmFnLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHRcdHRoaXMud2lraS5zZXRUZXh0KFJFVklTSU9OX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCByZXZpc2lvbiwgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0fVxuXHRwcml2YXRlIHJlbW92ZVRpZGRsZXJJbmZvKHRpdGxlOiBzdHJpbmcpIHtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChCQUdfU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIHVuZGVmaW5lZCwgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChSRVZJU0lPTl9TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgdW5kZWZpbmVkLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHR9XG5cblx0Lypcblx0R2V0IHRoZSBjdXJyZW50IHN0YXR1cyBvZiB0aGUgc2VydmVyIGNvbm5lY3Rpb25cblx0Ki9cblx0YXN5bmMgZ2V0U3RhdHVzKGNhbGxiYWNrOiBTZXJ2ZXJTdGF0dXNDYWxsYmFjaykge1xuXG5cdFx0Y29uc3QgW29rLCBlcnJvciwgZGF0YV0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3Qoe1xuXHRcdFx0a2V5OiBcImhhbmRsZUdldFJlY2lwZVN0YXR1c1wiLFxuXHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdFx0dXJsOiBcIi9zdGF0dXNcIixcblx0XHR9KTtcblx0XHRpZiAoIW9rKSB7XG5cdFx0XHR0aGlzLmlzTG9nZ2VkSW4gPSBmYWxzZTtcblx0XHRcdHRoaXMuaXNSZWFkT25seSA9IHRydWU7XG5cdFx0XHR0aGlzLnVzZXJuYW1lID0gXCIob2ZmbGluZSlcIjtcblx0XHRcdHRoaXMub2ZmbGluZSA9IHRydWU7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHN0YXR1cyA9IGRhdGEucmVzcG9uc2VKU09OO1xuXHRcdFx0dGhpcy5pc1JlYWRPbmx5ID0gc3RhdHVzPy5pc1JlYWRPbmx5ID8/IHRydWU7XG5cdFx0XHR0aGlzLmlzTG9nZ2VkSW4gPSBzdGF0dXM/LmlzTG9nZ2VkSW4gPz8gZmFsc2U7XG5cdFx0XHR0aGlzLnVzZXJuYW1lID0gc3RhdHVzPy51c2VybmFtZSA/PyBcIihhbm9uKVwiO1xuXHRcdFx0dGhpcy5vZmZsaW5lID0gZmFsc2U7XG5cdFx0fVxuXHRcdGlmIChjYWxsYmFjaykge1xuXHRcdFx0Y2FsbGJhY2soXG5cdFx0XHRcdC8vIEVycm9yXG5cdFx0XHRcdCFvayA/IGVycm9yIDogbnVsbCxcblx0XHRcdFx0Ly8gSXMgbG9nZ2VkIGluXG5cdFx0XHRcdHRoaXMuaXNMb2dnZWRJbixcblx0XHRcdFx0Ly8gVXNlcm5hbWVcblx0XHRcdFx0dGhpcy51c2VybmFtZSxcblx0XHRcdFx0Ly8gSXMgcmVhZCBvbmx5XG5cdFx0XHRcdHRoaXMuaXNSZWFkT25seSxcblx0XHRcdFx0Ly8gSXMgYW5vbnltb3VzXG5cdFx0XHRcdC8vIG5vIGlkZWEgd2hhdCB0aGlzIG1lYW5zLCBhbHdheXMgcmV0dXJuIGZhbHNlXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0KTtcblx0XHR9XG5cdH1cblx0Lypcblx0R2V0IGRldGFpbHMgb2YgY2hhbmdlZCB0aWRkbGVycyBmcm9tIHRoZSBzZXJ2ZXJcblx0Ki9cblx0Z2V0VXBkYXRlZFRpZGRsZXJzKHN5bmNlcjogU3luY2VyLCBjYWxsYmFjazogKGVycjogYW55LCBjaGFuZ2VzPzogeyBtb2RpZmljYXRpb25zOiBzdHJpbmdbXTsgZGVsZXRpb25zOiBzdHJpbmdbXSB9KSA9PiB2b2lkKSB7XG5cdFx0aWYodGhpcy5vZmZsaW5lKSByZXR1cm4gY2FsbGJhY2sobnVsbCk7XG5cdFx0aWYgKCF0aGlzLnVzZVNlcnZlclNlbnRFdmVudHMpIHtcblx0XHRcdHRoaXMucG9sbFNlcnZlcigpLnRoZW4oY2hhbmdlcyA9PiB7XG5cdFx0XHRcdGNhbGxiYWNrKG51bGwsIGNoYW5nZXMpO1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHQvLyBJZiBCcm93c3dlciBTdG9yYWdlIHRpZGRsZXJzIHdlcmUgY2FjaGVkIG9uIHJlbG9hZGluZyB0aGUgd2lraSwgYWRkIHRoZW0gYWZ0ZXIgc3luYyBmcm9tIHNlcnZlciBjb21wbGV0ZXMgaW4gdGhlIGFib3ZlIGNhbGxiYWNrLlxuXHRcdFx0XHRcdGlmICgkdHcuYnJvd3NlclN0b3JhZ2UgJiYgJHR3LmJyb3dzZXJTdG9yYWdlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0XHQkdHcuYnJvd3NlclN0b3JhZ2UuYWRkQ2FjaGVkVGlkZGxlcnMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSwgZXJyID0+IHtcblx0XHRcdFx0Y2FsbGJhY2soZXJyKTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHQvLyBEbyBub3RoaW5nIGlmIHRoZXJlJ3MgYWxyZWFkeSBhIGNvbm5lY3Rpb24gaW4gcHJvZ3Jlc3MuXG5cdFx0aWYgKHRoaXMuc2VydmVyVXBkYXRlQ29ubmVjdGlvblN0YXR1cyAhPT0gU0VSVkVSX05PVF9DT05ORUNURUQpIHtcblx0XHRcdHJldHVybiBjYWxsYmFjayhudWxsLCB7XG5cdFx0XHRcdG1vZGlmaWNhdGlvbnM6IFtdLFxuXHRcdFx0XHRkZWxldGlvbnM6IFtdXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Ly8gVHJ5IHRvIGNvbm5lY3QgYSBzZXJ2ZXIgc3RyZWFtXG5cdFx0dGhpcy5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9DT05ORUNUSU5HX1NTRSk7XG5cdFx0dGhpcy5jb25uZWN0U2VydmVyU3RyZWFtKHtcblx0XHRcdHN5bmNlcjogc3luY2VyLFxuXHRcdFx0b25lcnJvcjogYXN5bmMgZnVuY3Rpb24gKGVycikge1xuXHRcdFx0XHRzZWxmLmxvZ2dlci5sb2coXCJFcnJvciBjb25uZWN0aW5nIFNTRSBzdHJlYW1cIiwgZXJyKTtcblx0XHRcdFx0Ly8gSWYgdGhlIHN0cmVhbSBkaWRuJ3Qgd29yaywgdHJ5IHBvbGxpbmdcblx0XHRcdFx0c2VsZi5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9QT0xMSU5HKTtcblx0XHRcdFx0Y29uc3QgY2hhbmdlcyA9IGF3YWl0IHNlbGYucG9sbFNlcnZlcigpO1xuXHRcdFx0XHRzZWxmLnNldFVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMoU0VSVkVSX05PVF9DT05ORUNURUQpO1xuXHRcdFx0XHRjYWxsYmFjayhudWxsLCBjaGFuZ2VzKTtcblx0XHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdFx0Ly8gSWYgQnJvd3N3ZXIgU3RvcmFnZSB0aWRkbGVycyB3ZXJlIGNhY2hlZCBvbiByZWxvYWRpbmcgdGhlIHdpa2ksIGFkZCB0aGVtIGFmdGVyIHN5bmMgZnJvbSBzZXJ2ZXIgY29tcGxldGVzIGluIHRoZSBhYm92ZSBjYWxsYmFjay5cblx0XHRcdFx0XHRpZiAoJHR3LmJyb3dzZXJTdG9yYWdlICYmICR0dy5icm93c2VyU3RvcmFnZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0XHRcdFx0JHR3LmJyb3dzZXJTdG9yYWdlLmFkZENhY2hlZFRpZGRsZXJzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRvbm9wZW46IGZ1bmN0aW9uICgpIHtcblx0XHRcdFx0c2VsZi5zZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKFNFUlZFUl9DT05ORUNURURfU1NFKTtcblx0XHRcdFx0Ly8gVGhlIHN5bmNlciBpcyBleHBlY3RpbmcgYSBjYWxsYmFjayBidXQgd2UgZG9uJ3QgaGF2ZSBhbnkgZGF0YSB0byBzZW5kXG5cdFx0XHRcdGNhbGxiYWNrKG51bGwsIHtcblx0XHRcdFx0XHRtb2RpZmljYXRpb25zOiBbXSxcblx0XHRcdFx0XHRkZWxldGlvbnM6IFtdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdH1cblx0Lypcblx0QXR0ZW1wdCB0byBlc3RhYmxpc2ggYW4gU1NFIHN0cmVhbSB3aXRoIHRoZSBzZXJ2ZXIgYW5kIHRyYW5zZmVyIHRpZGRsZXIgY2hhbmdlcy4gT3B0aW9ucyBpbmNsdWRlOlxuICBcblx0c3luY2VyOiByZWZlcmVuY2UgdG8gc3luY2VyIG9iamVjdCB1c2VkIGZvciBzdG9yaW5nIGRhdGFcblx0b25vcGVuOiBpbnZva2VkIHdoZW4gdGhlIHN0cmVhbSBpcyBzdWNjZXNzZnVsbHkgb3BlbmVkXG5cdG9uZXJyb3I6IGludm9rZWQgaWYgdGhlcmUgaXMgYW4gZXJyb3Jcblx0Ki9cblx0cHJpdmF0ZSBjb25uZWN0U2VydmVyU3RyZWFtKG9wdGlvbnM6IHtcblx0XHRzeW5jZXI6IFN5bmNlcjtcblx0XHRvbm9wZW46IChldmVudDogRXZlbnQpID0+IHZvaWQ7XG5cdFx0b25lcnJvcjogKGV2ZW50OiBFdmVudCkgPT4gdm9pZDtcblx0fSkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRjb25zdCBldmVudFNvdXJjZSA9IG5ldyBFdmVudFNvdXJjZShcIi9yZWNpcGVzL1wiICsgdGhpcy5yZWNpcGUgKyBcIi9ldmVudHM/bGFzdF9rbm93bl9yZXZpc2lvbl9pZD1cIiArIHRoaXMubGFzdF9rbm93bl9yZXZpc2lvbl9pZCk7XG5cdFx0ZXZlbnRTb3VyY2Uub25lcnJvciA9IGZ1bmN0aW9uIChldmVudCkge1xuXHRcdFx0aWYgKG9wdGlvbnMub25lcnJvcikge1xuXHRcdFx0XHRvcHRpb25zLm9uZXJyb3IoZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZXZlbnRTb3VyY2Uub25vcGVuID0gZnVuY3Rpb24gKGV2ZW50KSB7XG5cdFx0XHRpZiAob3B0aW9ucy5vbm9wZW4pIHtcblx0XHRcdFx0b3B0aW9ucy5vbm9wZW4oZXZlbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0ZXZlbnRTb3VyY2UuYWRkRXZlbnRMaXN0ZW5lcihcImNoYW5nZVwiLCBmdW5jdGlvbiAoZXZlbnQpIHtcblxuXHRcdFx0Y29uc3QgZGF0YToge1xuXHRcdFx0XHR0aXRsZTogc3RyaW5nO1xuXHRcdFx0XHRyZXZpc2lvbl9pZDogbnVtYmVyO1xuXHRcdFx0XHRpc19kZWxldGVkOiBib29sZWFuO1xuXHRcdFx0XHRiYWdfbmFtZTogc3RyaW5nO1xuXHRcdFx0XHR0aWRkbGVyOiBhbnk7XG5cdFx0XHR9ID0gJHR3LnV0aWxzLnBhcnNlSlNPTlNhZmUoZXZlbnQuZGF0YSk7XG5cdFx0XHRpZiAoIWRhdGEpIHJldHVybjtcblxuXHRcdFx0Y29uc29sZS5sb2coXCJTU0UgZGF0YVwiLCBkYXRhKTtcblx0XHRcdC8vIFVwZGF0ZSBsYXN0IHNlZW4gcmV2aXNpb25faWRcblx0XHRcdGlmIChkYXRhLnJldmlzaW9uX2lkID4gc2VsZi5sYXN0X2tub3duX3JldmlzaW9uX2lkKSB7XG5cdFx0XHRcdHNlbGYubGFzdF9rbm93bl9yZXZpc2lvbl9pZCA9IGRhdGEucmV2aXNpb25faWQ7XG5cdFx0XHR9XG5cdFx0XHQvLyBSZWNvcmQgdGhlIGxhc3QgdXBkYXRlIHRvIHRoaXMgdGlkZGxlclxuXHRcdFx0c2VsZi5sYXN0UmVjb3JkZWRVcGRhdGVbZGF0YS50aXRsZV0gPSB7XG5cdFx0XHRcdHR5cGU6IGRhdGEuaXNfZGVsZXRlZCA/IFwiZGVsZXRpb25cIiA6IFwidXBkYXRlXCIsXG5cdFx0XHRcdHJldmlzaW9uX2lkOiBkYXRhLnJldmlzaW9uX2lkXG5cdFx0XHR9O1xuXHRcdFx0Y29uc29sZS5sb2coYE91c3RhbmRpbmcgcmVxdWVzdHMgaXMgJHtKU09OLnN0cmluZ2lmeShzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbZGF0YS50aXRsZV0pfWApO1xuXHRcdFx0Ly8gUHJvY2VzcyB0aGUgdXBkYXRlIGlmIHRoZSB0aWRkbGVyIGlzIG5vdCB0aGUgc3ViamVjdCBvZiBhbiBvdXRzdGFuZGluZyByZXF1ZXN0XG5cdFx0XHRpZiAoc2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW2RhdGEudGl0bGVdKSByZXR1cm47XG5cdFx0XHRpZiAoZGF0YS5pc19kZWxldGVkKSB7XG5cdFx0XHRcdHNlbGYucmVtb3ZlVGlkZGxlckluZm8oZGF0YS50aXRsZSk7XG5cdFx0XHRcdGRlbGV0ZSBvcHRpb25zLnN5bmNlci50aWRkbGVySW5mb1tkYXRhLnRpdGxlXTtcblx0XHRcdFx0b3B0aW9ucy5zeW5jZXIubG9nZ2VyLmxvZyhcIkRlbGV0aW5nIHRpZGRsZXIgbWlzc2luZyBmcm9tIHNlcnZlcjpcIiwgZGF0YS50aXRsZSk7XG5cdFx0XHRcdG9wdGlvbnMuc3luY2VyLndpa2kuZGVsZXRlVGlkZGxlcihkYXRhLnRpdGxlKTtcblx0XHRcdFx0b3B0aW9ucy5zeW5jZXIucHJvY2Vzc1Rhc2tRdWV1ZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dmFyIHJlc3VsdCA9IHNlbGYuaW5jb21pbmdVcGRhdGVzRmlsdGVyRm4uY2FsbChzZWxmLndpa2ksIHNlbGYud2lraS5tYWtlVGlkZGxlckl0ZXJhdG9yKFtkYXRhLnRpdGxlXSkpO1xuXHRcdFx0XHRpZiAocmVzdWx0Lmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRzZWxmLnNldFRpZGRsZXJJbmZvKGRhdGEudGl0bGUsIGRhdGEucmV2aXNpb25faWQudG9TdHJpbmcoKSwgZGF0YS5iYWdfbmFtZSk7XG5cdFx0XHRcdFx0b3B0aW9ucy5zeW5jZXIuc3RvcmVUaWRkbGVyKGRhdGEudGlkZGxlcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXG5cdFx0fSk7XG5cdH1cblx0cHJpdmF0ZSBhc3luYyBwb2xsU2VydmVyKCkge1xuXHRcdHR5cGUgdCA9IFRpZGRsZXJSb3V0ZXJSZXNwb25zZVtcImhhbmRsZUdldEJhZ1N0YXRlc1wiXVxuXHRcdGNvbnN0IFtvaywgZXJyLCByZXN1bHRdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdGtleTogXCJoYW5kbGVHZXRCYWdTdGF0ZXNcIixcblx0XHRcdHVybDogXCIvYmFnLXN0YXRlc1wiLFxuXHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdFx0cXVlcnlQYXJhbXM6IHtcblx0XHRcdFx0aW5jbHVkZV9kZWxldGVkOiBcInllc1wiLFxuXHRcdFx0XHQuLi50aGlzLnVzZUd6aXBTdHJlYW0gPyB7IGd6aXBfc3RyZWFtOiBcInllc1wiIH0gOiB7fSxcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmICghb2spIHRocm93IGVycjtcblxuXHRcdGNvbnN0IGJhZ3MgPSByZXN1bHQucmVzcG9uc2VKU09OO1xuXG5cdFx0aWYgKCFiYWdzKSB0aHJvdyBuZXcgRXJyb3IoXCJubyByZXN1bHQgcmV0dXJuZWRcIik7XG5cblx0XHRiYWdzLnNvcnQoKGEsIGIpID0+IGIucG9zaXRpb24gLSBhLnBvc2l0aW9uKTtcblx0XHRjb25zdCBtb2RpZmllZCA9IG5ldyBTZXQ8c3RyaW5nPigpLFxuXHRcdFx0ZGVsZXRlZCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdFx0Y29uc3QgaW5jb21pbmdUaXRsZXMgPSBuZXcgU2V0PHN0cmluZz4oYmFncy5tYXAoXG5cdFx0XHQvLyBnZXQgdGhlIHRpdGxlcyBpbiBlYWNoIGxheWVyIHRoYXQgYXJlbid0IGRlbGV0ZWRcblx0XHRcdGUgPT4gZS50aWRkbGVycy5maWx0ZXIoZiA9PiAhZi5pc19kZWxldGVkKS5tYXAoZiA9PiBmLnRpdGxlKVxuXHRcdFx0Ly8gYW5kIGZsYXR0ZW4gdGhlbSBmb3IgU2V0XG5cdFx0KS5mbGF0KCkpO1xuXG5cdFx0bGV0IGxhc3RfcmV2aXNpb24gPSB0aGlzLmxhc3Rfa25vd25fcmV2aXNpb25faWQ7XG5cblx0XHRiYWdzLmZvckVhY2goYmFnID0+IHtcblx0XHRcdGJhZy50aWRkbGVycy5mb3JFYWNoKHRpZCA9PiB7XG5cdFx0XHRcdC8vIGlmIHRoZSByZXZpc2lvbiBpcyBvbGQsIGlnbm9yZSwgc2luY2UgZGVsZXRpb25zIGNyZWF0ZSBhIG5ldyByZXZpc2lvblxuXHRcdFx0XHRpZiAodGlkLnJldmlzaW9uX2lkIDw9IHRoaXMubGFzdF9rbm93bl9yZXZpc2lvbl9pZCkgcmV0dXJuO1xuXHRcdFx0XHRpZiAodGlkLnJldmlzaW9uX2lkID4gbGFzdF9yZXZpc2lvbikgbGFzdF9yZXZpc2lvbiA9IHRpZC5yZXZpc2lvbl9pZDtcblx0XHRcdFx0Ly8gY2hlY2sgaWYgdGhpcyB0aXRsZSBzdGlsbCBleGlzdHMgaW4gYW55IGxheWVyXG5cdFx0XHRcdGlmIChpbmNvbWluZ1RpdGxlcy5oYXModGlkLnRpdGxlKSlcblx0XHRcdFx0XHRtb2RpZmllZC5hZGQodGlkLnRpdGxlKTtcblx0XHRcdFx0ZWxzZVxuXHRcdFx0XHRcdGRlbGV0ZWQuYWRkKHRpZC50aXRsZSk7XG5cdFx0XHR9KVxuXHRcdH0pO1xuXG5cdFx0dGhpcy5sYXN0X2tub3duX3JldmlzaW9uX2lkID0gbGFzdF9yZXZpc2lvbjtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRtb2RpZmljYXRpb25zOiBbLi4ubW9kaWZpZWQua2V5cygpXSxcblx0XHRcdGRlbGV0aW9uczogWy4uLmRlbGV0ZWQua2V5cygpXSxcblx0XHR9XG5cblx0fVxuXG5cdC8qXG5cdFF1ZXVlIGEgbG9hZCBmb3IgYSB0aWRkbGVyIGlmIHRoZXJlIGhhcyBiZWVuIGFuIHVwZGF0ZSBmb3IgaXQgc2luY2UgdGhlIHNwZWNpZmllZCByZXZpc2lvblxuXHQqL1xuXHRwcml2YXRlIGNoZWNrTGFzdFJlY29yZGVkVXBkYXRlKHRpdGxlOiBzdHJpbmcsIHJldmlzaW9uOiBzdHJpbmcpIHtcblx0XHR2YXIgbHJ1ID0gdGhpcy5sYXN0UmVjb3JkZWRVcGRhdGVbdGl0bGVdO1xuXHRcdGlmIChscnUgJiYgbHJ1LnJldmlzaW9uX2lkID4gcmV2aXNpb24pIHtcblx0XHRcdGNvbnNvbGUubG9nKGBDaGVja2luZyBmb3IgdXBkYXRlcyB0byAke3RpdGxlfSBzaW5jZSAke0pTT04uc3RyaW5naWZ5KGxydSl9IGNvbXBhcmluZyB0byAke3JldmlzaW9ufWApO1xuXHRcdFx0dGhpcy5zeW5jZXIgJiYgdGhpcy5zeW5jZXIuZW5xdWV1ZUxvYWRUaWRkbGVyKHRpdGxlKTtcblx0XHR9XG5cdH1cblx0cHJpdmF0ZSBnZXQgc3luY2VyKCkge1xuXHRcdGlmICgkdHcuc3luY2FkYXB0b3IgPT09IHRoaXMpIHJldHVybiAkdHcuc3luY2VyO1xuXHR9XG5cdC8qXG5cdFNhdmUgYSB0aWRkbGVyIGFuZCBpbnZva2UgdGhlIGNhbGxiYWNrIHdpdGggKGVycixhZGFwdG9ySW5mbyxyZXZpc2lvbilcblx0Ki9cblx0YXN5bmMgc2F2ZVRpZGRsZXIoXG5cdFx0dGlkZGxlcjogVGlkZGxlcixcblx0XHRjYWxsYmFjazogKFxuXHRcdFx0ZXJyOiBhbnksXG5cdFx0XHRhZGFwdG9ySW5mbz86IE1XU0FkYXB0b3JJbmZvLFxuXHRcdFx0cmV2aXNpb24/OiBzdHJpbmdcblx0XHQpID0+IHZvaWQsXG5cdFx0b3B0aW9ucz86IHt9XG5cdCkge1xuXHRcdHZhciBzZWxmID0gdGhpcywgdGl0bGUgPSB0aWRkbGVyLmZpZWxkcy50aXRsZSBhcyBzdHJpbmc7XG5cdFx0aWYgKHRpdGxlID09PSBcIiQ6L1N0b3J5TGlzdFwiKSB7XG5cdFx0XHRyZXR1cm4gY2FsbGJhY2sobnVsbCk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmlzUmVhZE9ubHkgfHwgdGl0bGUuc3Vic3RyKDAsIE1XQ19TVEFURV9USURETEVSX1BSRUZJWC5sZW5ndGgpID09PSBNV0NfU1RBVEVfVElERExFUl9QUkVGSVgpIHtcblx0XHRcdHJldHVybiBjYWxsYmFjayhudWxsKTtcblx0XHR9XG5cdFx0c2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW3RpdGxlXSA9IHsgdHlwZTogXCJQVVRcIiB9O1xuXG5cdFx0Ly8gYXBwbGljYXRpb24veC1td3MtdGlkZGxlclxuXHRcdC8vIFRoZSAudGlkIGZpbGUgZm9ybWF0IGRvZXMgbm90IHN1cHBvcnQgZmllbGQgbmFtZXMgd2l0aCBjb2xvbnMuIFxuXHRcdC8vIFJhdGhlciB0aGFuIHRyeWluZyB0byBjYXRjaCBhbGwgdGhlIHVuc3VwcG9ydGVkIHZhcmlhdGlvbnMgdGhhdCBtYXkgYXBwZWFyLFxuXHRcdC8vIHdlJ2xsIGp1c3QgdXNlIEpTT04gdG8gc2VuZCBpdCBhY3Jvc3MgdGhlIHdpcmUsIHNpbmNlIHRoYXQgaXMgdGhlIG9mZmljaWFsIGZhbGxiYWNrIGZvcm1hdCBhbnl3YXkuXG5cdFx0Ly8gSG93ZXZlciwgcGFyc2luZyBhIGh1Z2Ugc3RyaW5nIHZhbHVlIGluc2lkZSBhIEpTT04gb2JqZWN0IGlzIHZlcnkgc2xvdyxcblx0XHQvLyBzbyB3ZSBzcGxpdCBvZmYgdGhlIHRleHQgZmllbGQgYW5kIHNlbmQgaXQgYWZ0ZXIgdGhlIG90aGVyIGZpZWxkcy4gXG5cblx0XHRjb25zdCBmaWVsZHMgPSB0aWRkbGVyLmdldEZpZWxkU3RyaW5ncyh7fSk7XG5cdFx0Y29uc3QgdGV4dCA9IGZpZWxkcy50ZXh0O1xuXHRcdGRlbGV0ZSBmaWVsZHMudGV4dDtcblx0XHRsZXQgYm9keSA9IEpTT04uc3RyaW5naWZ5KGZpZWxkcyk7XG5cblx0XHRpZiAodGlkZGxlci5oYXNGaWVsZChcInRleHRcIikpIHtcblx0XHRcdGlmICh0eXBlb2YgdGV4dCAhPT0gXCJzdHJpbmdcIiAmJiB0ZXh0KVxuXHRcdFx0XHRyZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKFwiRXJyb3Igc2F2aW5nIHRpZGRsZXIgXCIgKyBmaWVsZHMudGl0bGUgKyBcIjogdGhlIHRleHQgZmllbGQgaXMgdHJ1dGh5IGJ1dCBub3QgYSBzdHJpbmdcIikpO1xuXHRcdFx0Ym9keSArPSBgXFxuXFxuJHt0ZXh0fWBcblx0XHR9XG5cblx0XHR0eXBlIHQgPSBUaWRkbGVyUm91dGVyUmVzcG9uc2VbXCJoYW5kbGVTYXZlUmVjaXBlVGlkZGxlclwiXVxuXHRcdGNvbnN0IFtvaywgZXJyLCByZXN1bHRdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdGtleTogXCJoYW5kbGVTYXZlUmVjaXBlVGlkZGxlclwiLFxuXHRcdFx0dXJsOiBcIi90aWRkbGVycy9cIiArIGVuY29kZVVSSUNvbXBvbmVudCh0aXRsZSksXG5cdFx0XHRtZXRob2Q6IFwiUFVUXCIsXG5cdFx0XHRyZXF1ZXN0Qm9keVN0cmluZzogYm9keSxcblx0XHRcdGhlYWRlcnM6IHtcblx0XHRcdFx0XCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi94LW13cy10aWRkbGVyXCJcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGRlbGV0ZSBzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdO1xuXHRcdGlmICghb2spIHJldHVybiBjYWxsYmFjayhlcnIpO1xuXG5cdFx0Y29uc3QgZGF0YSA9IHJlc3VsdC5yZXNwb25zZUpTT047XG5cdFx0aWYgKCFkYXRhKSByZXR1cm4gY2FsbGJhY2sobnVsbCk7IC8vIGEgMnh4IHJlc3BvbnNlIHdpdGhvdXQgYSBib2R5IGlzIHVubGlrZWx5XG5cblx0XHQvL0lmIEJyb3dzZXItU3RvcmFnZSBwbHVnaW4gaXMgcHJlc2VudCwgcmVtb3ZlIHRpZGRsZXIgZnJvbSBsb2NhbCBzdG9yYWdlIGFmdGVyIHN1Y2Nlc3NmdWwgc3luYyB0byB0aGUgc2VydmVyXG5cdFx0aWYgKCR0dy5icm93c2VyU3RvcmFnZSAmJiAkdHcuYnJvd3NlclN0b3JhZ2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdCR0dy5icm93c2VyU3RvcmFnZS5yZW1vdmVUaWRkbGVyRnJvbUxvY2FsU3RvcmFnZSh0aXRsZSk7XG5cdFx0fVxuXG5cblx0XHQvLyBTYXZlIHRoZSBkZXRhaWxzIG9mIHRoZSBuZXcgcmV2aXNpb24gb2YgdGhlIHRpZGRsZXJcblx0XHRjb25zdCByZXZpc2lvbiA9IGRhdGEucmV2aXNpb25faWQsIGJhZ19uYW1lID0gZGF0YS5iYWdfbmFtZTtcblx0XHRjb25zb2xlLmxvZyhgU2F2ZWQgJHt0aXRsZX0gd2l0aCByZXZpc2lvbiAke3JldmlzaW9ufSBhbmQgYmFnICR7YmFnX25hbWV9YCk7XG5cdFx0Ly8gSWYgdGhlcmUgaGFzIGJlZW4gYSBtb3JlIHJlY2VudCB1cGRhdGUgZnJvbSB0aGUgc2VydmVyIHRoZW4gZW5xdWV1ZSBhIGxvYWQgb2YgdGhpcyB0aWRkbGVyXG5cdFx0c2VsZi5jaGVja0xhc3RSZWNvcmRlZFVwZGF0ZSh0aXRsZSwgcmV2aXNpb24pO1xuXHRcdC8vIEludm9rZSB0aGUgY2FsbGJhY2tcblx0XHRzZWxmLnNldFRpZGRsZXJJbmZvKHRpdGxlLCByZXZpc2lvbiwgYmFnX25hbWUpO1xuXHRcdGNhbGxiYWNrKG51bGwsIHsgYmFnOiBiYWdfbmFtZSB9LCByZXZpc2lvbik7XG5cblx0fVxuXHQvKlxuXHRMb2FkIGEgdGlkZGxlciBhbmQgaW52b2tlIHRoZSBjYWxsYmFjayB3aXRoIChlcnIsdGlkZGxlckZpZWxkcylcblxuXHRUaGUgc3luY2VyIGRvZXMgbm90IHBhc3MgaXRzZWxmIGludG8gb3B0aW9ucy5cblx0Ki9cblx0YXN5bmMgbG9hZFRpZGRsZXIodGl0bGU6IHN0cmluZywgY2FsbGJhY2s6IChlcnI6IGFueSwgZmllbGRzPzogYW55KSA9PiB2b2lkLCBvcHRpb25zOiBhbnkpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0c2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW3RpdGxlXSA9IHsgdHlwZTogXCJHRVRcIiB9O1xuXHRcdGNvbnN0IFtvaywgZXJyLCByZXN1bHRdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdGtleTogXCJoYW5kbGVHZXRSZWNpcGVUaWRkbGVyXCIsXG5cdFx0XHR1cmw6IFwiL3RpZGRsZXJzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRpdGxlKSxcblx0XHRcdG1ldGhvZDogXCJHRVRcIixcblx0XHR9KVxuXHRcdGRlbGV0ZSBzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdO1xuXHRcdGlmICghb2spIHJldHVybiBjYWxsYmFjayhlcnIpO1xuXG5cdFx0Y29uc3QgeyByZXNwb25zZUpTT046IGRhdGEsIGhlYWRlcnMgfSA9IHJlc3VsdDtcblx0XHRjb25zdCByZXZpc2lvbiA9IGhlYWRlcnMuZ2V0KFwieC1yZXZpc2lvbi1udW1iZXJcIikgPz8gXCJcIixcblx0XHRcdGJhZ19uYW1lID0gaGVhZGVycy5nZXQoXCJ4LWJhZy1uYW1lXCIpID8/IFwiXCI7XG5cblx0XHRpZiAoIXJldmlzaW9uIHx8ICFiYWdfbmFtZSB8fCAhZGF0YSkgcmV0dXJuIGNhbGxiYWNrKG51bGwsIG51bGwpO1xuXG5cdFx0Ly8gSWYgdGhlcmUgaGFzIGJlZW4gYSBtb3JlIHJlY2VudCB1cGRhdGUgZnJvbSB0aGUgc2VydmVyIHRoZW4gZW5xdWV1ZSBhIGxvYWQgb2YgdGhpcyB0aWRkbGVyXG5cdFx0c2VsZi5jaGVja0xhc3RSZWNvcmRlZFVwZGF0ZSh0aXRsZSwgcmV2aXNpb24pO1xuXHRcdC8vIEludm9rZSB0aGUgY2FsbGJhY2tcblx0XHRzZWxmLnNldFRpZGRsZXJJbmZvKHRpdGxlLCByZXZpc2lvbiwgYmFnX25hbWUpO1xuXHRcdGNhbGxiYWNrKG51bGwsIGRhdGEpO1xuXHR9XG5cdC8qXG5cdERlbGV0ZSBhIHRpZGRsZXIgYW5kIGludm9rZSB0aGUgY2FsbGJhY2sgd2l0aCAoZXJyKVxuXHRvcHRpb25zIGluY2x1ZGU6XG5cdHRpZGRsZXJJbmZvOiB0aGUgc3luY2VyJ3MgdGlkZGxlckluZm8gZm9yIHRoaXMgdGlkZGxlclxuXHQqL1xuXHRhc3luYyBkZWxldGVUaWRkbGVyKHRpdGxlOiBzdHJpbmcsIGNhbGxiYWNrOiAoZXJyOiBhbnksIGFkYXB0b3JJbmZvPzogYW55KSA9PiB2b2lkLCBvcHRpb25zOiBhbnkpIHtcblx0XHR2YXIgc2VsZiA9IHRoaXM7XG5cdFx0aWYgKHRoaXMuaXNSZWFkT25seSkgeyByZXR1cm4gY2FsbGJhY2sobnVsbCk7IH1cblx0XHQvLyBJZiB3ZSBkb24ndCBoYXZlIGEgYmFnIGl0IG1lYW5zIHRoYXQgdGhlIHRpZGRsZXIgaGFzbid0IGJlZW4gc2VlbiBieSB0aGUgc2VydmVyLCBzbyB3ZSBkb24ndCBuZWVkIHRvIGRlbGV0ZSBpdFxuXHRcdC8vIHZhciBiYWcgPSB0aGlzLmdldFRpZGRsZXJCYWcodGl0bGUpO1xuXHRcdC8vIGlmKCFiYWcpIHsgcmV0dXJuIGNhbGxiYWNrKG51bGwsIG9wdGlvbnMudGlkZGxlckluZm8uYWRhcHRvckluZm8pOyB9XG5cdFx0c2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW3RpdGxlXSA9IHsgdHlwZTogXCJERUxFVEVcIiB9O1xuXHRcdC8vIElzc3VlIEhUVFAgcmVxdWVzdCB0byBkZWxldGUgdGhlIHRpZGRsZXJcblx0XHRjb25zdCBbb2ssIGVyciwgcmVzdWx0XSA9IGF3YWl0IHRoaXMucmVjaXBlUmVxdWVzdCh7XG5cdFx0XHRrZXk6IFwiaGFuZGxlRGVsZXRlUmVjaXBlVGlkZGxlclwiLFxuXHRcdFx0dXJsOiBcIi90aWRkbGVycy9cIiArIGVuY29kZVVSSUNvbXBvbmVudCh0aXRsZSksXG5cdFx0XHRtZXRob2Q6IFwiREVMRVRFXCIsXG5cdFx0fSk7XG5cdFx0ZGVsZXRlIHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV07XG5cdFx0aWYgKCFvaykgcmV0dXJuIGNhbGxiYWNrKGVycik7XG5cdFx0Y29uc3QgeyByZXNwb25zZUpTT046IGRhdGEgfSA9IHJlc3VsdDtcblx0XHRpZiAoIWRhdGEpIHJldHVybiBjYWxsYmFjayhudWxsKTtcblxuXHRcdGNvbnN0IHJldmlzaW9uID0gZGF0YS5yZXZpc2lvbl9pZCwgYmFnX25hbWUgPSBkYXRhLmJhZ19uYW1lO1xuXHRcdC8vIElmIHRoZXJlIGhhcyBiZWVuIGEgbW9yZSByZWNlbnQgdXBkYXRlIGZyb20gdGhlIHNlcnZlciB0aGVuIGVucXVldWUgYSBsb2FkIG9mIHRoaXMgdGlkZGxlclxuXHRcdHNlbGYuY2hlY2tMYXN0UmVjb3JkZWRVcGRhdGUodGl0bGUsIHJldmlzaW9uKTtcblx0XHRzZWxmLnJlbW92ZVRpZGRsZXJJbmZvKHRpdGxlKTtcblx0XHQvLyBJbnZva2UgdGhlIGNhbGxiYWNrICYgcmV0dXJuIG51bGwgYWRhcHRvckluZm9cblx0XHRjYWxsYmFjayhudWxsLCBudWxsKTtcblx0fVxufVxuXG5cbmlmICgkdHcuYnJvd3NlciAmJiBkb2N1bWVudC5sb2NhdGlvbi5wcm90b2NvbC5zdGFydHNXaXRoKFwiaHR0cFwiKSkge1xuXHRleHBvcnRzLmFkYXB0b3JDbGFzcyA9IE11bHRpV2lraUNsaWVudEFkYXB0b3I7XG59XG5cbnR5cGUgUGFyYW1zSW5wdXQgPSBVUkxTZWFyY2hQYXJhbXMgfCBbc3RyaW5nLCBzdHJpbmddW10gfCBvYmplY3QgfCBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbmludGVyZmFjZSBIdHRwUmVxdWVzdE9wdGlvbnM8VFlQRSBleHRlbmRzIFwiYXJyYXlidWZmZXJcIiB8IFwiYmxvYlwiIHwgXCJ0ZXh0XCI+IHtcblx0LyoqIFRoZSByZXF1ZXN0IE1FVEhPRC4gTWF5YmUgYmUgYW55dGhpbmcgZXhjZXB0IENPTk5FQ1QsIFRSQUNFLCBvciBUUkFDSy4gICovXG5cdG1ldGhvZDogc3RyaW5nO1xuXHQvKiogVGhlIHVybCBtYXkgYWxzbyBjb250YWluIHF1ZXJ5IHBhcmFtcy4gKi9cblx0dXJsOiBzdHJpbmc7XG5cdC8qKiBUaGUgcmVzcG9uc2UgdHlwZXMgKi9cblx0cmVzcG9uc2VUeXBlOiBUWVBFO1xuXHRoZWFkZXJzPzogUGFyYW1zSW5wdXQ7XG5cdC8qKiBUaGlzIGlzIHBhcnNlZCBzZXBhcmF0ZWx5IGZyb20gdGhlIHVybCBhbmQgYXBwZW5kZWQgdG8gaXQuICovXG5cdHF1ZXJ5UGFyYW1zPzogUGFyYW1zSW5wdXQ7XG5cdC8qKiBcblx0ICogVGhlIHN0cmluZyB0byBzZW5kIGFzIHRoZSByZXF1ZXN0IGJvZHkuIE5vdCB2YWxpZCBmb3IgR0VUIGFuZCBIRUFELlxuXHQgKiBcblx0ICogRm9yIGBhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWRgLCB1c2UgYG5ldyBVUkxTZWFyY2hQYXJhbXMoKS50b1N0cmluZygpYC5cblx0ICogXG5cdCAqIEZvciBgYXBwbGljYXRpb24vanNvbmAsIHVzZSBgSlNPTi5zdHJpbmdpZnkoKWBcblx0ICovXG5cdHJlcXVlc3RCb2R5U3RyaW5nPzogc3RyaW5nO1xuXHRwcm9ncmVzcz86IChldmVudDogUHJvZ3Jlc3NFdmVudDxFdmVudFRhcmdldD4pID0+IHZvaWQ7XG59XG5cblxuZnVuY3Rpb24gaHR0cFJlcXVlc3Q8VFlQRSBleHRlbmRzIFwiYXJyYXlidWZmZXJcIiB8IFwiYmxvYlwiIHwgXCJ0ZXh0XCI+KG9wdGlvbnM6IEh0dHBSZXF1ZXN0T3B0aW9uczxUWVBFPikge1xuXG5cdG9wdGlvbnMubWV0aG9kID0gb3B0aW9ucy5tZXRob2QudG9VcHBlckNhc2UoKTtcblxuXHRpZiAoKG9wdGlvbnMubWV0aG9kID09PSBcIkdFVFwiIHx8IG9wdGlvbnMubWV0aG9kID09PSBcIkhFQURcIikgJiYgb3B0aW9ucy5yZXF1ZXN0Qm9keVN0cmluZylcblx0XHR0aHJvdyBuZXcgRXJyb3IoXCJyZXF1ZXN0Qm9keVN0cmluZyBtdXN0IGJlIGZhbHN5IGlmIG1ldGhvZCBpcyBHRVQgb3IgSEVBRFwiKTtcblxuXHRmdW5jdGlvbiBwYXJhbXNJbnB1dChpbnB1dDogUGFyYW1zSW5wdXQpIHtcblx0XHRpZiAoIWlucHV0KSByZXR1cm4gbmV3IFVSTFNlYXJjaFBhcmFtcygpO1xuXHRcdGlmIChpbnB1dCBpbnN0YW5jZW9mIFVSTFNlYXJjaFBhcmFtcykgcmV0dXJuIGlucHV0O1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGlucHV0KSB8fCB0eXBlb2YgaW5wdXQgPT09IFwic3RyaW5nXCIpIHJldHVybiBuZXcgVVJMU2VhcmNoUGFyYW1zKGlucHV0KTtcblx0XHRyZXR1cm4gbmV3IFVSTFNlYXJjaFBhcmFtcyhPYmplY3QuZW50cmllcyhpbnB1dCkpO1xuXHR9XG5cblx0ZnVuY3Rpb24gbm9ybWFsaXplSGVhZGVycyhoZWFkZXJzOiBVUkxTZWFyY2hQYXJhbXMpIHtcblx0XHRbLi4uaGVhZGVycy5rZXlzKCldLmZvckVhY2goKFtrLCB2XSkgPT4ge1xuXHRcdFx0Y29uc3QgazIgPSBrLnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRpZiAoazIgIT09IGspIHtcblx0XHRcdFx0aGVhZGVycy5nZXRBbGwoaykuZm9yRWFjaChlID0+IHtcblx0XHRcdFx0XHRoZWFkZXJzLmFwcGVuZChrMiwgZSk7XG5cdFx0XHRcdH0pXG5cdFx0XHRcdGhlYWRlcnMuZGVsZXRlKGspO1xuXHRcdFx0XHRjb25zb2xlLmxvZyhrLCBrMik7XG5cdFx0XHR9XG5cdFx0fSlcblx0fVxuXG5cdHJldHVybiBuZXcgUHJvbWlzZTx7XG5cdFx0LyoqIFNob3J0aGFuZCB0byBjaGVjayBpZiB0aGUgcmVzcG9uc2UgaXMgaW4gdGhlIDJ4eCByYW5nZS4gKi9cblx0XHRvazogYm9vbGVhbjtcblx0XHRzdGF0dXM6IG51bWJlcjtcblx0XHRzdGF0dXNUZXh0OiBzdHJpbmc7XG5cdFx0aGVhZGVyczogVVJMU2VhcmNoUGFyYW1zO1xuXHRcdHJlc3BvbnNlOlxuXHRcdFRZUEUgZXh0ZW5kcyBcImFycmF5YnVmZmVyXCIgPyBBcnJheUJ1ZmZlciA6XG5cdFx0VFlQRSBleHRlbmRzIFwiYmxvYlwiID8gQmxvYiA6XG5cdFx0VFlQRSBleHRlbmRzIFwidGV4dFwiID8gc3RyaW5nIDpcblx0XHRuZXZlcjtcblx0fT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdC8vIGlmIHRoaXMgdGhyb3dzIHN5bmMnbHksIHRoZSBwcm9taXNlIHdpbGwgcmVqZWN0LlxuXG5cdFx0Y29uc3QgdXJsID0gbmV3IFVSTChvcHRpb25zLnVybCwgbG9jYXRpb24uaHJlZik7XG5cdFx0Y29uc3QgcXVlcnkgPSBwYXJhbXNJbnB1dChvcHRpb25zLnF1ZXJ5UGFyYW1zKTtcblx0XHRxdWVyeS5mb3JFYWNoKCh2LCBrKSA9PiB7IHVybC5zZWFyY2hQYXJhbXMuYXBwZW5kKGssIHYpOyB9KTtcblxuXHRcdGNvbnN0IGhlYWRlcnMgPSBwYXJhbXNJbnB1dChvcHRpb25zLmhlYWRlcnMpO1xuXHRcdG5vcm1hbGl6ZUhlYWRlcnMoaGVhZGVycyk7XG5cblx0XHRjb25zdCByZXF1ZXN0ID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG5cdFx0cmVxdWVzdC5yZXNwb25zZVR5cGUgPSBvcHRpb25zLnJlc3BvbnNlVHlwZSB8fCBcInRleHRcIjtcblxuXHRcdHRyeSB7XG5cdFx0XHRyZXF1ZXN0Lm9wZW4ob3B0aW9ucy5tZXRob2QsIHVybCwgdHJ1ZSk7XG5cdFx0fSBjYXRjaCAoZSkgeyBjb25zb2xlLmxvZyhlLCB7IGUgfSk7IHRocm93IGU7IH1cblxuXHRcdGlmICghaGVhZGVycy5oYXMoXCJjb250ZW50LXR5cGVcIikpXG5cdFx0XHRoZWFkZXJzLnNldChcImNvbnRlbnQtdHlwZVwiLCBcImFwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZDsgY2hhcnNldD1VVEYtOFwiKTtcblxuXHRcdGlmICghaGVhZGVycy5oYXMoXCJ4LXJlcXVlc3RlZC13aXRoXCIpKVxuXHRcdFx0aGVhZGVycy5zZXQoXCJ4LXJlcXVlc3RlZC13aXRoXCIsIFwiVGlkZGx5V2lraVwiKTtcblxuXHRcdGhlYWRlcnMuc2V0KFwiYWNjZXB0XCIsIFwiYXBwbGljYXRpb24vanNvblwiKTtcblxuXG5cdFx0aGVhZGVycy5mb3JFYWNoKCh2LCBrKSA9PiB7XG5cdFx0XHRyZXF1ZXN0LnNldFJlcXVlc3RIZWFkZXIoaywgdik7XG5cdFx0fSk7XG5cblx0XHQvLyByZXF1ZXN0Lm9uZXJyb3IgPSAoZXZlbnQpID0+IHtcblx0XHQvLyBcdGNvbnNvbGUubG9nKGV2ZW50KTtcblx0XHQvLyBcdGNvbnNvbGUubG9nKChldmVudCBhcyBQcm9ncmVzc0V2ZW50PFhNTEh0dHBSZXF1ZXN0PikhLnRhcmdldD8uc3RhdHVzKTtcblx0XHQvLyB9XG5cblx0XHRyZXF1ZXN0Lm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uICgpIHtcblx0XHRcdGlmICh0aGlzLnJlYWR5U3RhdGUgIT09IDQpIHJldHVybjtcblxuXHRcdFx0Y29uc3QgaGVhZGVycyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMoKTtcblx0XHRcdHJlcXVlc3QuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCk/LnRyaW0oKS5zcGxpdCgvW1xcclxcbl0rLykuZm9yRWFjaCgobGluZSkgPT4ge1xuXHRcdFx0XHRjb25zdCBwYXJ0cyA9IGxpbmUuc3BsaXQoXCI6IFwiKTtcblx0XHRcdFx0Y29uc3QgaGVhZGVyID0gcGFydHMuc2hpZnQoKT8udG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0Y29uc3QgdmFsdWUgPSBwYXJ0cy5qb2luKFwiOiBcIik7XG5cdFx0XHRcdGlmIChoZWFkZXIpIGhlYWRlcnMuYXBwZW5kKGhlYWRlciwgdmFsdWUpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXNvbHZlKHtcblx0XHRcdFx0b2s6IHRoaXMuc3RhdHVzID49IDIwMCAmJiB0aGlzLnN0YXR1cyA8IDMwMCxcblx0XHRcdFx0c3RhdHVzOiB0aGlzLnN0YXR1cyxcblx0XHRcdFx0c3RhdHVzVGV4dDogdGhpcy5zdGF0dXNUZXh0LFxuXHRcdFx0XHRyZXNwb25zZTogdGhpcy5yZXNwb25zZSxcblx0XHRcdFx0aGVhZGVycyxcblx0XHRcdH0pO1xuXG5cdFx0fTtcblxuXHRcdGlmIChvcHRpb25zLnByb2dyZXNzKVxuXHRcdFx0cmVxdWVzdC5vbnByb2dyZXNzID0gb3B0aW9ucy5wcm9ncmVzcztcblxuXHRcdHRyeSB7IHJlcXVlc3Quc2VuZChvcHRpb25zLnJlcXVlc3RCb2R5U3RyaW5nKTsgfSBjYXRjaCAoZSkgeyBjb25zb2xlLmxvZyhlLCB7IGUgfSk7IHRocm93IGU7IH1cblxuXG5cdH0pO1xuXG59XG5cbmZ1bmN0aW9uIHJlYWRCbG9iQXNBcnJheUJ1ZmZlcihibG9iOiBCbG9iKSB7XG5cdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKFwiRXJyb3IgcmVhZGluZyBibG9iXCIpO1xuXHRyZXR1cm4gbmV3IFByb21pc2U8QXJyYXlCdWZmZXI+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuXHRcdHJlYWRlci5vbmxvYWQgPSAoKSA9PiB7XG5cdFx0XHRyZXNvbHZlKHJlYWRlci5yZXN1bHQgYXMgQXJyYXlCdWZmZXIpXG5cdFx0fTtcblx0XHRyZWFkZXIub25lcnJvciA9ICgpID0+IHtcblx0XHRcdHJlamVjdChlcnJvcik7XG5cdFx0fTtcblx0XHRyZWFkZXIucmVhZEFzQXJyYXlCdWZmZXIoYmxvYik7XG5cdH0pO1xuXG59XG4iXX0=