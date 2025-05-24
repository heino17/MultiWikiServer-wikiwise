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
var CONFIG_HOST_TIDDLER = "$:/config/multiwikiclient/host", DEFAULT_HOST_TIDDLER = "$protocol$//$host$/", MWC_STATE_TIDDLER_PREFIX = "$:/state/multiwikiclient/", BAG_STATE_TIDDLER = "$:/state/multiwikiclient/tiddlers/bag", REVISION_STATE_TIDDLER = "$:/state/multiwikiclient/tiddlers/revision", CONNECTION_STATE_TIDDLER = "$:/state/multiwikiclient/connection", INCOMING_UPDATES_FILTER_TIDDLER = "$:/config/multiwikiclient/incoming-updates-filter", ENABLE_SSE_TIDDLER = "$:/config/multiwikiclient/use-server-sent-events", IS_DEV_MODE_TIDDLER = `$:/state/multiwikiclient/dev-mode`;
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
        this.last_known_revision_id = this.wiki.getTiddlerText("$:/state/multiwikiclient/recipe/last_revision_id", "0");
        this.outstandingRequests = Object.create(null); // Hashmap by title of outstanding request object: {type: "PUT"|"GET"|"DELETE"}
        this.lastRecordedUpdate = Object.create(null); // Hashmap by title of last recorded update via SSE: {type: "update"|"detetion", revision_id:}
        this.logger = new $tw.utils.Logger("MultiWikiClientAdaptor");
        this.useGzipStream = true;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibXVsdGl3aWtpY2xpZW50YWRhcHRvci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9tdWx0aXdpa2ljbGllbnRhZGFwdG9yLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7Ozs7Ozs7Ozs7O0dBZ0JHO0FBRUgsa0VBQWtFO0FBQ2xFLFlBQVksQ0FBQzs7Ozs7Ozs7Ozs7QUEwSWIsSUFBSSxtQkFBbUIsR0FBRyxnQ0FBZ0MsRUFDekQsb0JBQW9CLEdBQUcscUJBQXFCLEVBQzVDLHdCQUF3QixHQUFHLDJCQUEyQixFQUN0RCxpQkFBaUIsR0FBRyx1Q0FBdUMsRUFDM0Qsc0JBQXNCLEdBQUcsNENBQTRDLEVBQ3JFLHdCQUF3QixHQUFHLHFDQUFxQyxFQUNoRSwrQkFBK0IsR0FBRyxtREFBbUQsRUFDckYsa0JBQWtCLEdBQUcsa0RBQWtELEVBQ3ZFLG1CQUFtQixHQUFHLG1DQUFtQyxDQUFDO0FBRTNELElBQUksb0JBQW9CLEdBQUcsZUFBZSxFQUN6QyxxQkFBcUIsR0FBRyxnQkFBZ0IsRUFDeEMsb0JBQW9CLEdBQUcsZUFBZSxFQUN0QyxjQUFjLEdBQUcsZ0JBQWdCLENBQUM7QUFPbkMsTUFBTSxzQkFBc0I7SUFvQjNCLFlBQVksT0FBc0I7UUFGbEMsU0FBSSxHQUFHLGlCQUFpQixDQUFDO1FBQ2pCLHdCQUFtQixHQUFHLElBQUksQ0FBQztRQUVsQyxJQUFJLENBQUMsSUFBSSxHQUFHLE9BQU8sQ0FBQyxJQUFJLENBQUM7UUFDekIsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDM0IsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUFDO1FBQzNFLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLEtBQUssQ0FBQztRQUNsRixJQUFJLENB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SyxDQUFDLENBQUM7UUFDZixDQUFDLENBQUM7UUFDRixNQUFNLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEMsQ0FBQyxDQUFDLENBQUM7QUFFSixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLypcXFxudGl0bGU6ICQ6L3BsdWdpbnMvdGlkZGx5d2lraS90aWRkbHl3ZWIvdGlkZGx5d2ViYWRhcHRvci5qc1xudHlwZTogYXBwbGljYXRpb24vamF2YXNjcmlwdFxubW9kdWxlLXR5cGU6IHN5bmNhZGFwdG9yXG5cbkEgc3luYyBhZGFwdG9yIG1vZHVsZSBmb3Igc3luY2hyb25pc2luZyB3aXRoIE11bHRpV2lraVNlcnZlci1jb21wYXRpYmxlIHNlcnZlcnMuIFxuXG5JdCBoYXMgdGhyZWUga2V5IGFyZWFzIG9mIGNvbmNlcm46XG5cbiogQmFzaWMgb3BlcmF0aW9ucyBsaWtlIHB1dCwgZ2V0LCBhbmQgZGVsZXRlIGEgdGlkZGxlciBvbiB0aGUgc2VydmVyXG4qIFJlYWwgdGltZSB1cGRhdGVzIGZyb20gdGhlIHNlcnZlciAoaGFuZGxlZCBieSBTU0UpXG4qIEJhZ3MgYW5kIHJlY2lwZXMsIHdoaWNoIGFyZSB1bmtub3duIHRvIHRoZSBzeW5jZXJcblxuQSBrZXkgYXNwZWN0IG9mIHRoZSBkZXNpZ24gaXMgdGhhdCB0aGUgc3luY2VyIG5ldmVyIG92ZXJsYXBzIGJhc2ljIHNlcnZlciBvcGVyYXRpb25zOyBpdCB3YWl0cyBmb3IgdGhlXG5wcmV2aW91cyBvcGVyYXRpb24gdG8gY29tcGxldGUgYmVmb3JlIHNlbmRpbmcgYSBuZXcgb25lLlxuXG5cXCovXG5cbi8vIHRoZSBibGFuayBsaW5lIGlzIGltcG9ydGFudCwgYW5kIHNvIGlzIHRoZSBmb2xsb3dpbmcgdXNlIHN0cmljdFxuXCJ1c2Ugc3RyaWN0XCI7XG5cbmltcG9ydCB0eXBlIHsgU3luY2VyLCBUaWRkbGVyLCBJVGlkZGx5V2lraSB9IGZyb20gXCJ0aWRkbHl3aWtpXCI7XG5pbXBvcnQgdHlwZSB7IFRpZGRsZXJSb3V0ZXIgfSBmcm9tIFwiQHRpZGRseXdpa2kvbXdzL3NyYy9yb3V0ZXMvbWFuYWdlcnMvcm91dGVyLXRpZGRsZXJzXCI7XG5pbXBvcnQgdHlwZSB7IFpvZFJvdXRlIH0gZnJvbSBcIkB0aWRkbHl3aWtpL213cy9zcmMvcm91dGVyXCI7XG5cbmRlY2xhcmUgZ2xvYmFsIHtcblx0Y29uc3QgZmZsYXRlOiB0eXBlb2YgaW1wb3J0KFwiZmZsYXRlXCIpO1xufVxuXG5kZWNsYXJlIGNsYXNzIExvZ2dlciB7XG5cdGNvbnN0cnVjdG9yKGNvbXBvbmVudE5hbWU6IGFueSwgb3B0aW9uczogYW55KTtcblx0Y29tcG9uZW50TmFtZTogYW55O1xuXHRjb2xvdXI6IGFueTtcblx0ZW5hYmxlOiBhbnk7XG5cdHNhdmU6IGFueTtcblx0c2F2ZUxpbWl0OiBhbnk7XG5cdHNhdmVCdWZmZXJMb2dnZXI6IHRoaXM7XG5cdGJ1ZmZlcjogc3RyaW5nO1xuXHRhbGVydENvdW50OiBudW1iZXI7XG5cdHNldFNhdmVCdWZmZXIobG9nZ2VyOiBhbnkpOiB2b2lkO1xuXHRsb2coLi4uYXJnczogYW55W10pOiBhbnk7XG5cdGdldEJ1ZmZlcigpOiBzdHJpbmc7XG5cdHRhYmxlKHZhbHVlOiBhbnkpOiB2b2lkO1xuXHRhbGVydCguLi5hcmdzOiBhbnlbXSk6IHZvaWQ7XG5cdGNsZWFyQWxlcnRzKCk6IHZvaWQ7XG59XG5cbnR5cGUgVGlkZGxlclJvdXRlclJlc3BvbnNlID0ge1xuXHRbSyBpbiBrZXlvZiBUaWRkbGVyUm91dGVyXTogVGlkZGxlclJvdXRlcltLXSBleHRlbmRzIFpvZFJvdXRlPGluZmVyIE0sIGluZmVyIEIsIGluZmVyIFAsIGluZmVyIFEsIGluZmVyIFQsIGluZmVyIFI+XG5cdD8geyBNOiBNLCBCOiBCLCBQOiBQLCBROiBRLCBUOiBULCBSOiBSIH1cblx0OiBuZXZlclxufVxuXG5kZWNsYXJlIG1vZHVsZSAndGlkZGx5d2lraScge1xuXHRleHBvcnQgaW50ZXJmYWNlIFN5bmNlciB7XG5cdFx0d2lraTogV2lraTtcblx0XHRsb2dnZXI6IExvZ2dlcjtcblx0XHR0aWRkbGVySW5mbzogUmVjb3JkPHN0cmluZywgeyBiYWc6IHN0cmluZzsgcmV2aXNpb246IHN0cmluZyB9Pjtcblx0XHRlbnF1ZXVlTG9hZFRpZGRsZXIodGl0bGU6IHN0cmluZyk6IHZvaWQ7XG5cdFx0c3RvcmVUaWRkbGVyKHRpZGRsZXI6IFRpZGRsZXIpOiB2b2lkO1xuXHRcdHByb2Nlc3NUYXNrUXVldWUoKTogdm9pZDtcblx0fVxuXHRpbnRlcmZhY2UgSVRpZGRseVdpa2kge1xuXHRcdGJyb3dzZXJTdG9yYWdlOiBhbnk7XG5cdH1cbn1cblxudHlwZSBTZXJ2ZXJTdGF0dXNDYWxsYmFjayA9IChcblx0ZXJyOiBhbnksXG5cdC8qKiBcblx0ICogJDovc3RhdHVzL0lzTG9nZ2VkSW4gbW9zdGx5IGFwcGVhcnMgYWxvbmdzaWRlIHRoZSB1c2VybmFtZSBcblx0ICogb3Igb3RoZXIgbG9naW4tY29uZGl0aW9uYWwgYmVoYXZpb3IuIFxuXHQgKi9cblx0aXNMb2dnZWRJbj86IGJvb2xlYW4sXG5cdC8qKlxuXHQgKiAkOi9zdGF0dXMvVXNlck5hbWUgaXMgc3RpbGwgdXNlZCBmb3IgdGhpbmdzIGxpa2UgZHJhZnRzIGV2ZW4gaWYgdGhlIFxuXHQgKiB1c2VyIGlzbid0IGxvZ2dlZCBpbiwgYWx0aG91Z2ggdGhlIHVzZXJuYW1lIGlzIGxlc3MgbGlrZWx5IHRvIGJlIHNob3duIFxuXHQgKiB0byB0aGUgdXNlci4gXG5cdCAqL1xuXHR1c2VybmFtZT86IHN0cmluZyxcblx0LyoqIFxuXHQgKiAkOi9zdGF0dXMvSXNSZWFkT25seSBwdXRzIHRoZSBVSSBpbiByZWFkb25seSBtb2RlLCBcblx0ICogYnV0IGRvZXMgbm90IHByZXZlbnQgYXV0b21hdGljIGNoYW5nZXMgZnJvbSBhdHRlbXB0aW5nIHRvIHNhdmUuIFxuXHQgKi9cblx0aXNSZWFkT25seT86IGJvb2xlYW4sXG5cdC8qKiBcblx0ICogJDovc3RhdHVzL0lzQW5vbnltb3VzIGRvZXMgbm90IGFwcGVhciBhbnl3aGVyZSBpbiB0aGUgVFc1IHJlcG8hIFxuXHQgKiBTbyBpdCBoYXMgbm8gYXBwYXJlbnQgcHVycG9zZS4gXG5cdCAqL1xuXHRpc0Fub255bW91cz86IGJvb2xlYW5cbikgPT4gdm9pZFxuXG5pbnRlcmZhY2UgU3luY0FkYXB0b3I8QUQ+IHtcblx0bmFtZT86IHN0cmluZztcblxuXHRpc1JlYWR5PygpOiBib29sZWFuO1xuXG5cdGdldFN0YXR1cz8oXG5cdFx0Y2I6IFNlcnZlclN0YXR1c0NhbGxiYWNrXG5cdCk6IHZvaWQ7XG5cblx0Z2V0U2tpbm55VGlkZGxlcnM/KFxuXHRcdGNiOiAoZXJyOiBhbnksIHRpZGRsZXJGaWVsZHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz5bXSkgPT4gdm9pZFxuXHQpOiB2b2lkO1xuXHRnZXRVcGRhdGVkVGlkZGxlcnM/KFxuXHRcdHN5bmNlcjogU3luY2VyLFxuXHRcdGNiOiAoXG5cdFx0XHRlcnI6IGFueSxcblx0XHRcdC8qKiBBcnJheXMgb2YgdGl0bGVzIHRoYXQgaGF2ZSBiZWVuIG1vZGlmaWVkIG9yIGRlbGV0ZWQgKi9cblx0XHRcdHVwZGF0ZXM/OiB7IG1vZGlmaWNhdGlvbnM6IHN0cmluZ1tdLCBkZWxldGlvbnM6IHN0cmluZ1tdIH1cblx0XHQpID0+IHZvaWRcblx0KTogdm9pZDtcblxuXHQvKiogXG5cdCAqIHVzZWQgdG8gb3ZlcnJpZGUgdGhlIGRlZmF1bHQgU3luY2VyIGdldFRpZGRsZXJSZXZpc2lvbiBiZWhhdmlvclxuXHQgKiBvZiByZXR1cm5pbmcgdGhlIHJldmlzaW9uIGZpZWxkXG5cdCAqIFxuXHQgKi9cblx0Z2V0VGlkZGxlclJldmlzaW9uPyh0aXRsZTogc3RyaW5nKTogc3RyaW5nO1xuXHQvKiogXG5cdCAqIHVzZWQgdG8gZ2V0IHRoZSBhZGFwdGVyIGluZm8gZnJvbSBhIHRpZGRsZXIgaW4gc2l0dWF0aW9uc1xuXHQgKiBvdGhlciB0aGFuIHRoZSBzYXZlVGlkZGxlciBjYWxsYmFja1xuXHQgKi9cblx0Z2V0VGlkZGxlckluZm8odGlkZGxlcjogVGlkZGxlcik6IEFEIHwgdW5kZWZpbmVkO1xuXG5cdHNhdmVUaWRkbGVyKFxuXHRcdHRpZGRsZXI6IGFueSxcblx0XHRjYjogKFxuXHRcdFx0ZXJyOiBhbnksXG5cdFx0XHRhZGFwdG9ySW5mbz86IEFELFxuXHRcdFx0cmV2aXNpb24/OiBzdHJpbmdcblx0XHQpID0+IHZvaWQsXG5cdFx0ZXh0cmE6IHsgdGlkZGxlckluZm86IFN5bmNlclRpZGRsZXJJbmZvPEFEPiB9XG5cdCk6IHZvaWQ7XG5cblx0c2V0TG9nZ2VyU2F2ZUJ1ZmZlcj86IChsb2dnZXJGb3JTYXZpbmc6IExvZ2dlcikgPT4gdm9pZDtcblx0ZGlzcGxheUxvZ2luUHJvbXB0PyhzeW5jZXI6IFN5bmNlcik6IHZvaWQ7XG5cdGxvZ2luPyh1c2VybmFtZTogc3RyaW5nLCBwYXNzd29yZDogc3RyaW5nLCBjYjogKGVycjogYW55KSA9PiB2b2lkKTogdm9pZDtcblx0bG9nb3V0PyhjYjogKGVycjogYW55KSA9PiB2b2lkKTogYW55O1xufVxuaW50ZXJmYWNlIFN5bmNlclRpZGRsZXJJbmZvPEFEPiB7XG5cdC8qKiB0aGlzIGNvbWVzIGZyb20gdGhlIHdpa2kgY2hhbmdlQ291bnQgcmVjb3JkICovXG5cdGNoYW5nZUNvdW50OiBudW1iZXI7XG5cdC8qKiBBZGFwdGVyIGluZm8gcmV0dXJuZWQgYnkgdGhlIHN5bmMgYWRhcHRlciAqL1xuXHRhZGFwdG9ySW5mbzogQUQ7XG5cdC8qKiBSZXZpc2lvbiByZXR1cm4gYnkgdGhlIHN5bmMgYWRhcHRlciAqL1xuXHRyZXZpc2lvbjogc3RyaW5nO1xuXHQvKiogVGltZXN0YW1wIHNldCBpbiB0aGUgY2FsbGJhY2sgb2YgdGhlIHByZXZpb3VzIHNhdmUgKi9cblx0dGltZXN0YW1wTGFzdFNhdmVkOiBEYXRlO1xufVxuXG5kZWNsYXJlIGNvbnN0ICR0dzogYW55O1xuXG5kZWNsYXJlIGNvbnN0IGV4cG9ydHM6IHtcblx0YWRhcHRvckNsYXNzOiB0eXBlb2YgTXVsdGlXaWtpQ2xpZW50QWRhcHRvcjtcbn07XG5cbnZhciBDT05GSUdfSE9TVF9USURETEVSID0gXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L2hvc3RcIixcblx0REVGQVVMVF9IT1NUX1RJRERMRVIgPSBcIiRwcm90b2NvbCQvLyRob3N0JC9cIixcblx0TVdDX1NUQVRFX1RJRERMRVJfUFJFRklYID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvXCIsXG5cdEJBR19TVEFURV9USURETEVSID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvdGlkZGxlcnMvYmFnXCIsXG5cdFJFVklTSU9OX1NUQVRFX1RJRERMRVIgPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC90aWRkbGVycy9yZXZpc2lvblwiLFxuXHRDT05ORUNUSU9OX1NUQVRFX1RJRERMRVIgPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC9jb25uZWN0aW9uXCIsXG5cdElOQ09NSU5HX1VQREFURVNfRklMVEVSX1RJRERMRVIgPSBcIiQ6L2NvbmZpZy9tdWx0aXdpa2ljbGllbnQvaW5jb21pbmctdXBkYXRlcy1maWx0ZXJcIixcblx0RU5BQkxFX1NTRV9USURETEVSID0gXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L3VzZS1zZXJ2ZXItc2VudC1ldmVudHNcIixcblx0SVNfREVWX01PREVfVElERExFUiA9IGAkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvZGV2LW1vZGVgO1xuXG52YXIgU0VSVkVSX05PVF9DT05ORUNURUQgPSBcIk5PVCBDT05ORUNURURcIixcblx0U0VSVkVSX0NPTk5FQ1RJTkdfU1NFID0gXCJDT05ORUNUSU5HIFNTRVwiLFxuXHRTRVJWRVJfQ09OTkVDVEVEX1NTRSA9IFwiQ09OTkVDVEVEIFNTRVwiLFxuXHRTRVJWRVJfUE9MTElORyA9IFwiU0VSVkVSIFBPTExJTkdcIjtcblxuaW50ZXJmYWNlIE1XU0FkYXB0b3JJbmZvIHtcblx0YmFnOiBzdHJpbmdcbn1cblxuXG5jbGFzcyBNdWx0aVdpa2lDbGllbnRBZGFwdG9yIGltcGxlbWVudHMgU3luY0FkYXB0b3I8TVdTQWRhcHRvckluZm8+IHtcblx0cHJpdmF0ZSB3aWtpO1xuXHRwcml2YXRlIGhvc3Q7XG5cdHByaXZhdGUgcmVjaXBlO1xuXHRwcml2YXRlIHVzZVNlcnZlclNlbnRFdmVudHM7XG5cdHByaXZhdGUgbGFzdF9rbm93bl9yZXZpc2lvbl9pZDtcblx0cHJpdmF0ZSBvdXRzdGFuZGluZ1JlcXVlc3RzO1xuXHRwcml2YXRlIGxhc3RSZWNvcmRlZFVwZGF0ZTtcblx0cHJpdmF0ZSBsb2dnZXI7XG5cdHByaXZhdGUgaXNMb2dnZWRJbjtcblx0cHJpdmF0ZSBpc1JlYWRPbmx5O1xuXHRwcml2YXRlIG9mZmxpbmU7XG5cdHByaXZhdGUgdXNlcm5hbWU7XG5cdHByaXZhdGUgaW5jb21pbmdVcGRhdGVzRmlsdGVyRm47XG5cdHByaXZhdGUgc2VydmVyVXBkYXRlQ29ubmVjdGlvblN0YXR1cyE6IHN0cmluZztcblx0cHJpdmF0ZSBpc0Rldk1vZGU6IGJvb2xlYW47XG5cdHByaXZhdGUgdXNlR3ppcFN0cmVhbTogYm9vbGVhbjtcblxuXHRuYW1lID0gXCJtdWx0aXdpa2ljbGllbnRcIjtcblx0cHJpdmF0ZSBzdXBwb3J0c0xhenlMb2FkaW5nID0gdHJ1ZTtcblx0Y29uc3RydWN0b3Iob3B0aW9uczogeyB3aWtpOiBhbnkgfSkge1xuXHRcdHRoaXMud2lraSA9IG9wdGlvbnMud2lraTtcblx0XHR0aGlzLmhvc3QgPSB0aGlzLmdldEhvc3QoKTtcblx0XHR0aGlzLnJlY2lwZSA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChcIiQ6L2NvbmZpZy9tdWx0aXdpa2ljbGllbnQvcmVjaXBlXCIpO1xuXHRcdHRoaXMudXNlU2VydmVyU2VudEV2ZW50cyA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChFTkFCTEVfU1NFX1RJRERMRVIpID09PSBcInllc1wiO1xuXHRcdHRoaXMuaXNEZXZNb2RlID0gdGhpcy53aWtpLmdldFRpZGRsZXJUZXh0KElTX0RFVl9NT0RFX1RJRERMRVIpID09PSBcInllc1wiO1xuXHRcdHRoaXMubGFzdF9rbm93bl9yZXZpc2lvbl9pZCA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC9yZWNpcGUvbGFzdF9yZXZpc2lvbl9pZFwiLCBcIjBcIilcblx0XHR0aGlzLm91dHN0YW5kaW5nUmVxdWVzdHMgPSBPYmplY3QuY3JlYXRlKG51bGwpOyAvLyBIYXNobWFwIGJ5IHRpdGxlIG9mIG91dHN0YW5kaW5nIHJlcXVlc3Qgb2JqZWN0OiB7dHlwZTogXCJQVVRcInxcIkdFVFwifFwiREVMRVRFXCJ9XG5cdFx0dGhpcy5sYXN0UmVjb3JkZWRVcGRhdGUgPSBPYmplY3QuY3JlYXRlKG51bGwpOyAvLyBIYXNobWFwIGJ5IHRpdGxlIG9mIGxhc3QgcmVjb3JkZWQgdXBkYXRlIHZpYSBTU0U6IHt0eXBlOiBcInVwZGF0ZVwifFwiZGV0ZXRpb25cIiwgcmV2aXNpb25faWQ6fVxuXHRcdHRoaXMubG9nZ2VyID0gbmV3ICR0dy51dGlscy5Mb2dnZXIoXCJNdWx0aVdpa2lDbGllbnRBZGFwdG9yXCIpO1xuXHRcdHRoaXMudXNlR3ppcFN0cmVhbSA9IHRydWU7XG5cdFx0dGhpcy5pc0xvZ2dlZEluID0gZmFsc2U7XG5cdFx0dGhpcy5pc1JlYWRPbmx5ID0gZmFsc2U7XG5cdFx0dGhpcy5vZmZsaW5lID0gZmFsc2U7XG5cdFx0dGhpcy51c2VybmFtZSA9IFwiXCI7XG5cdFx0Ly8gQ29tcGlsZSB0aGUgZGlydHkgdGlkZGxlciBmaWx0ZXJcblx0XHR0aGlzLmluY29taW5nVXBkYXRlc0ZpbHRlckZuID0gdGhpcy53aWtpLmNvbXBpbGVGaWx0ZXIodGhpcy53aWtpLmdldFRpZGRsZXJUZXh0KElOQ09NSU5HX1VQREFURVNfRklMVEVSX1RJRERMRVIpKTtcblx0XHR0aGlzLnNldFVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMoU0VSVkVSX05PVF9DT05ORUNURUQpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRVcGRhdGVDb25uZWN0aW9uU3RhdHVzKHN0YXR1czogc3RyaW5nKSB7XG5cdFx0dGhpcy5zZXJ2ZXJVcGRhdGVDb25uZWN0aW9uU3RhdHVzID0gc3RhdHVzO1xuXHRcdHRoaXMud2lraS5hZGRUaWRkbGVyKHtcblx0XHRcdHRpdGxlOiBDT05ORUNUSU9OX1NUQVRFX1RJRERMRVIsXG5cdFx0XHR0ZXh0OiBzdGF0dXNcblx0XHR9KTtcblx0fVxuXHRzZXRMb2dnZXJTYXZlQnVmZmVyKGxvZ2dlckZvclNhdmluZzogTG9nZ2VyKSB7XG5cdFx0dGhpcy5sb2dnZXIuc2V0U2F2ZUJ1ZmZlcihsb2dnZXJGb3JTYXZpbmcpO1xuXHR9XG5cdGlzUmVhZHkoKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0cHJpdmF0ZSBnZXRIb3N0KCkge1xuXHRcdHZhciB0ZXh0ID0gdGhpcy53aWtpLmdldFRpZGRsZXJUZXh0KENPTkZJR19IT1NUX1RJRERMRVIsIERFRkFVTFRfSE9TVF9USURETEVSKSwgc3Vic3RpdHV0aW9ucyA9IFtcblx0XHRcdHsgbmFtZTogXCJwcm90b2NvbFwiLCB2YWx1ZTogZG9jdW1lbnQubG9jYXRpb24ucHJvdG9jb2wgfSxcblx0XHRcdHsgbmFtZTogXCJob3N0XCIsIHZhbHVlOiBkb2N1bWVudC5sb2NhdGlvbi5ob3N0IH0sXG5cdFx0XHR7IG5hbWU6IFwicGF0aG5hbWVcIiwgdmFsdWU6IGRvY3VtZW50LmxvY2F0aW9uLnBhdGhuYW1lIH1cblx0XHRdO1xuXHRcdGZvciAodmFyIHQgPSAwOyB0IDwgc3Vic3RpdHV0aW9ucy5sZW5ndGg7IHQrKykge1xuXHRcdFx0dmFyIHMgPSBzdWJzdGl0dXRpb25zW3RdO1xuXHRcdFx0dGV4dCA9ICR0dy51dGlscy5yZXBsYWNlU3RyaW5nKHRleHQsIG5ldyBSZWdFeHAoXCJcXFxcJFwiICsgcy5uYW1lICsgXCJcXFxcJFwiLCBcIm1nXCIpLCBzLnZhbHVlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRleHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlY2lwZVJlcXVlc3Q8S0VZIGV4dGVuZHMgKHN0cmluZyAmIGtleW9mIFRpZGRsZXJSb3V0ZXJSZXNwb25zZSk+KFxuXHRcdG9wdGlvbnM6IE9taXQ8SHR0cFJlcXVlc3RPcHRpb25zPFwiYXJyYXlidWZmZXJcIj4sIFwicmVzcG9uc2VUeXBlXCI+ICYgeyBrZXk6IEtFWSB9XG5cdCkge1xuXHRcdGlmICghb3B0aW9ucy51cmwuc3RhcnRzV2l0aChcIi9cIikpXG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoXCJUaGUgdXJsIGRvZXMgbm90IHN0YXJ0IHdpdGggYSBzbGFzaFwiKTtcblxuXHRcdHJldHVybiBhd2FpdCBodHRwUmVxdWVzdCh7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0cmVzcG9uc2VUeXBlOiBcImJsb2JcIixcblx0XHRcdHVybDogdGhpcy5ob3N0ICsgXCJyZWNpcGVzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRoaXMucmVjaXBlKSArIG9wdGlvbnMudXJsLFxuXHRcdH0pLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdC8vIGluIHRoZW9yeSwgNDAzIGFuZCA0MDQgc2hvdWxkIHJlc3VsdCBpbiBmdXJ0aGVyIGFjdGlvbiwgXG5cdFx0XHQvLyBidXQgaW4gcmVhbGl0eSBhbiBlcnJvciBnZXRzIGxvZ2dlZCB0byBjb25zb2xlIGFuZCB0aGF0J3MgaXQuXG5cdFx0XHRpZiAoIXJlc3VsdC5vaykge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoXG5cdFx0XHRcdFx0YFRoZSBzZXJ2ZXIgcmV0dXJuIGEgc3RhdHVzIGNvZGUgJHtyZXN1bHQuc3RhdHVzfSB3aXRoIHRoZSBmb2xsb3dpbmcgcmVhc29uOiBgXG5cdFx0XHRcdFx0KyBgJHtyZXN1bHQuaGVhZGVycy5nZXQoXCJ4LXJlYXNvblwiKSA/PyBcIihubyByZWFzb24gZ2l2ZW4pXCJ9YFxuXHRcdFx0XHQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH1cblx0XHR9KS50aGVuKGFzeW5jIGUgPT4ge1xuXHRcdFx0bGV0IHJlc3BvbnNlU3RyaW5nOiBzdHJpbmcgPSBcIlwiO1xuXHRcdFx0aWYgKGUuaGVhZGVycy5nZXQoXCJ4LWd6aXAtc3RyZWFtXCIpID09PSBcInllc1wiKSB7XG5cdFx0XHRcdC8vIEJyb3dzZXJzIG9ubHkgZGVjb2RlIHRoZSBmaXJzdCBzdHJlYW0sIFxuXHRcdFx0XHQvLyBzbyB3ZSBjYW50IHVzZSBjb250ZW50LWVuY29kaW5nIG9yIERlY29tcHJlc3Npb25TdHJlYW1cblxuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihhc3luYyByZXNvbHZlID0+IHtcblxuXHRcdFx0XHRcdGNvbnN0IGd1bnppcCA9IG5ldyBmZmxhdGUuQXN5bmNHdW56aXAoKGVyciwgY2h1bmssIGZpbmFsKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZXJyKSByZXR1cm4gY29uc29sZS5sb2coZXJyKTtcblx0XHRcdFx0XHRcdHJlc3BvbnNlU3RyaW5nICs9IGZmbGF0ZS5zdHJGcm9tVTgoY2h1bmspO1xuXHRcdFx0XHRcdFx0aWYgKGZpbmFsKSByZXNvbHZlKCk7XG5cdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRpZiAodGhpcy5pc0Rldk1vZGUpIGd1bnppcC5vbm1lbWJlciA9IGUgPT4gY29uc29sZS5sb2coXCJndW56aXAgbWVtYmVyXCIsIGUpO1xuXG5cdFx0XHRcdFx0Z3VuemlwLnB1c2gobmV3IFVpbnQ4QXJyYXkoYXdhaXQgcmVhZEJsb2JBc0FycmF5QnVmZmVyKGUucmVzcG9uc2UpKSk7XG5cdFx0XHRcdFx0Ly8gdGhpcyBoYXMgdG8gYmUgb24gYSBzZXBhcmF0ZSBsaW5lXG5cdFx0XHRcdFx0Z3VuemlwLnB1c2gobmV3IFVpbnQ4QXJyYXkoKSwgdHJ1ZSk7XG5cblx0XHRcdFx0fSk7XG5cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3BvbnNlU3RyaW5nID0gZmZsYXRlLnN0ckZyb21VOChuZXcgVWludDhBcnJheShhd2FpdCByZWFkQmxvYkFzQXJyYXlCdWZmZXIoZS5yZXNwb25zZSkpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuaXNEZXZNb2RlKSBjb25zb2xlLmxvZyhcImd1bnppcCByZXN1bHRcIiwgcmVzcG9uc2VTdHJpbmcubGVuZ3RoKTtcblxuXHRcdFx0cmV0dXJuIFt0cnVlLCB2b2lkIDAsIHtcblx0XHRcdFx0Li4uZSxcblx0XHRcdFx0cmVzcG9uc2VTdHJpbmcsXG5cdFx0XHRcdC8qKiB0aGlzIGlzIHVuZGVmaW5lZCBpZiBzdGF0dXMgaXMgbm90IDIwMCAqL1xuXHRcdFx0XHRyZXNwb25zZUpTT046IGUuc3RhdHVzID09PSAyMDBcblx0XHRcdFx0XHQ/IHRyeVBhcnNlSlNPTihyZXNwb25zZVN0cmluZykgYXMgVGlkZGxlclJvdXRlclJlc3BvbnNlW0tFWV1bXCJSXCJdXG5cdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHR9XSBhcyBjb25zdDtcblx0XHR9LCBlID0+IFtmYWxzZSwgZSwgdm9pZCAwXSBhcyBjb25zdCk7XG5cblx0XHRmdW5jdGlvbiB0cnlQYXJzZUpTT04oZGF0YTogc3RyaW5nKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gSlNPTi5wYXJzZShkYXRhKTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Y29uc29sZS5lcnJvcihcIkVycm9yIHBhcnNpbmcgSlNPTiwgcmV0dXJuaW5nIHVuZGVmaW5lZFwiLCBlKTtcblx0XHRcdFx0Ly8gY29uc29sZS5sb2coZGF0YSk7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdH1cblxuXHRnZXRUaWRkbGVySW5mbyh0aWRkbGVyOiBUaWRkbGVyKSB7XG5cdFx0dmFyIHRpdGxlID0gdGlkZGxlci5maWVsZHMudGl0bGUsXG5cdFx0XHRyZXZpc2lvbiA9IHRoaXMud2lraS5leHRyYWN0VGlkZGxlckRhdGFJdGVtKFJFVklTSU9OX1NUQVRFX1RJRERMRVIsIHRpdGxlKSxcblx0XHRcdGJhZyA9IHRoaXMud2lraS5leHRyYWN0VGlkZGxlckRhdGFJdGVtKEJBR19TVEFURV9USURETEVSLCB0aXRsZSk7XG5cdFx0aWYgKHJldmlzaW9uICYmIGJhZykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dGl0bGU6IHRpdGxlLFxuXHRcdFx0XHRyZXZpc2lvbjogcmV2aXNpb24sXG5cdFx0XHRcdGJhZzogYmFnXG5cdFx0XHR9O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXHRwcml2YXRlIGdldFRpZGRsZXJCYWcodGl0bGU6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLndpa2kuZXh0cmFjdFRpZGRsZXJEYXRhSXRlbShCQUdfU1RBVEVfVElERExFUiwgdGl0bGUpO1xuXHR9XG5cdGdldFRpZGRsZXJSZXZpc2lvbih0aXRsZTogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMud2lraS5leHRyYWN0VGlkZGxlckRhdGFJdGVtKFJFVklTSU9OX1NUQVRFX1RJRERMRVIsIHRpdGxlKTtcblx0fVxuXHRwcml2YXRlIHNldFRpZGRsZXJJbmZvKHRpdGxlOiBzdHJpbmcsIHJldmlzaW9uOiBzdHJpbmcsIGJhZzogc3RyaW5nKSB7XG5cdFx0dGhpcy53aWtpLnNldFRleHQoQkFHX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCBiYWcsIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdFx0dGhpcy53aWtpLnNldFRleHQoUkVWSVNJT05fU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIHJldmlzaW9uLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHR9XG5cdHByaXZhdGUgcmVtb3ZlVGlkZGxlckluZm8odGl0bGU6IHN0cmluZykge1xuXHRcdHRoaXMud2lraS5zZXRUZXh0KEJBR19TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgdW5kZWZpbmVkLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHRcdHRoaXMud2lraS5zZXRUZXh0KFJFVklTSU9OX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCB1bmRlZmluZWQsIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdH1cblxuXHQvKlxuXHRHZXQgdGhlIGN1cnJlbnQgc3RhdHVzIG9mIHRoZSBzZXJ2ZXIgY29ubmVjdGlvblxuXHQqL1xuXHRhc3luYyBnZXRTdGF0dXMoY2FsbGJhY2s6IFNlcnZlclN0YXR1c0NhbGxiYWNrKSB7XG5cblx0XHRjb25zdCBbb2ssIGVycm9yLCBkYXRhXSA9IGF3YWl0IHRoaXMucmVjaXBlUmVxdWVzdCh7XG5cdFx0XHRrZXk6IFwiaGFuZGxlR2V0UmVjaXBlU3RhdHVzXCIsXG5cdFx0XHRtZXRob2Q6IFwiR0VUXCIsXG5cdFx0XHR1cmw6IFwiL3N0YXR1c1wiLFxuXHRcdH0pO1xuXHRcdGlmICghb2spIHtcblx0XHRcdHRoaXMuaXNMb2dnZWRJbiA9IGZhbHNlO1xuXHRcdFx0dGhpcy5pc1JlYWRPbmx5ID0gdHJ1ZTtcblx0XHRcdHRoaXMudXNlcm5hbWUgPSBcIihvZmZsaW5lKVwiO1xuXHRcdFx0dGhpcy5vZmZsaW5lID0gdHJ1ZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc3RhdHVzID0gZGF0YS5yZXNwb25zZUpTT047XG5cdFx0XHR0aGlzLmlzUmVhZE9ubHkgPSBzdGF0dXM/LmlzUmVhZE9ubHkgPz8gdHJ1ZTtcblx0XHRcdHRoaXMuaXNMb2dnZWRJbiA9IHN0YXR1cz8uaXNMb2dnZWRJbiA/PyBmYWxzZTtcblx0XHRcdHRoaXMudXNlcm5hbWUgPSBzdGF0dXM/LnVzZXJuYW1lID8/IFwiKGFub24pXCI7XG5cdFx0XHR0aGlzLm9mZmxpbmUgPSBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKGNhbGxiYWNrKSB7XG5cdFx0XHRjYWxsYmFjayhcblx0XHRcdFx0Ly8gRXJyb3Jcblx0XHRcdFx0IW9rID8gZXJyb3IgOiBudWxsLFxuXHRcdFx0XHQvLyBJcyBsb2dnZWQgaW5cblx0XHRcdFx0dGhpcy5pc0xvZ2dlZEluLFxuXHRcdFx0XHQvLyBVc2VybmFtZVxuXHRcdFx0XHR0aGlzLnVzZXJuYW1lLFxuXHRcdFx0XHQvLyBJcyByZWFkIG9ubHlcblx0XHRcdFx0dGhpcy5pc1JlYWRPbmx5LFxuXHRcdFx0XHQvLyBJcyBhbm9ueW1vdXNcblx0XHRcdFx0Ly8gbm8gaWRlYSB3aGF0IHRoaXMgbWVhbnMsIGFsd2F5cyByZXR1cm4gZmFsc2Vcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXHQvKlxuXHRHZXQgZGV0YWlscyBvZiBjaGFuZ2VkIHRpZGRsZXJzIGZyb20gdGhlIHNlcnZlclxuXHQqL1xuXHRnZXRVcGRhdGVkVGlkZGxlcnMoc3luY2VyOiBTeW5jZXIsIGNhbGxiYWNrOiAoZXJyOiBhbnksIGNoYW5nZXM/OiB7IG1vZGlmaWNhdGlvbnM6IHN0cmluZ1tdOyBkZWxldGlvbnM6IHN0cmluZ1tdIH0pID0+IHZvaWQpIHtcblx0XHRpZih0aGlzLm9mZmxpbmUpIHJldHVybiBjYWxsYmFjayhudWxsKTtcblx0XHRpZiAoIXRoaXMudXNlU2VydmVyU2VudEV2ZW50cykge1xuXHRcdFx0dGhpcy5wb2xsU2VydmVyKCkudGhlbihjaGFuZ2VzID0+IHtcblx0XHRcdFx0Y2FsbGJhY2sobnVsbCwgY2hhbmdlcyk7XG5cdFx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdC8vIElmIEJyb3dzd2VyIFN0b3JhZ2UgdGlkZGxlcnMgd2VyZSBjYWNoZWQgb24gcmVsb2FkaW5nIHRoZSB3aWtpLCBhZGQgdGhlbSBhZnRlciBzeW5jIGZyb20gc2VydmVyIGNvbXBsZXRlcyBpbiB0aGUgYWJvdmUgY2FsbGJhY2suXG5cdFx0XHRcdFx0aWYgKCR0dy5icm93c2VyU3RvcmFnZSAmJiAkdHcuYnJvd3NlclN0b3JhZ2UuaXNFbmFibGVkKCkpIHtcblx0XHRcdFx0XHRcdCR0dy5icm93c2VyU3RvcmFnZS5hZGRDYWNoZWRUaWRkbGVycygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9LCBlcnIgPT4ge1xuXHRcdFx0XHRjYWxsYmFjayhlcnIpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdC8vIERvIG5vdGhpbmcgaWYgdGhlcmUncyBhbHJlYWR5IGEgY29ubmVjdGlvbiBpbiBwcm9ncmVzcy5cblx0XHRpZiAodGhpcy5zZXJ2ZXJVcGRhdGVDb25uZWN0aW9uU3RhdHVzICE9PSBTRVJWRVJfTk9UX0NPTk5FQ1RFRCkge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKG51bGwsIHtcblx0XHRcdFx0bW9kaWZpY2F0aW9uczogW10sXG5cdFx0XHRcdGRlbGV0aW9uczogW11cblx0XHRcdH0pO1xuXHRcdH1cblx0XHQvLyBUcnkgdG8gY29ubmVjdCBhIHNlcnZlciBzdHJlYW1cblx0XHR0aGlzLnNldFVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMoU0VSVkVSX0NPTk5FQ1RJTkdfU1NFKTtcblx0XHR0aGlzLmNvbm5lY3RTZXJ2ZXJTdHJlYW0oe1xuXHRcdFx0c3luY2VyOiBzeW5jZXIsXG5cdFx0XHRvbmVycm9yOiBhc3luYyBmdW5jdGlvbiAoZXJyKSB7XG5cdFx0XHRcdHNlbGYubG9nZ2VyLmxvZyhcIkVycm9yIGNvbm5lY3RpbmcgU1NFIHN0cmVhbVwiLCBlcnIpO1xuXHRcdFx0XHQvLyBJZiB0aGUgc3RyZWFtIGRpZG4ndCB3b3JrLCB0cnkgcG9sbGluZ1xuXHRcdFx0XHRzZWxmLnNldFVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMoU0VSVkVSX1BPTExJTkcpO1xuXHRcdFx0XHRjb25zdCBjaGFuZ2VzID0gYXdhaXQgc2VsZi5wb2xsU2VydmVyKCk7XG5cdFx0XHRcdHNlbGYuc2V0VXBkYXRlQ29ubmVjdGlvblN0YXR1cyhTRVJWRVJfTk9UX0NPTk5FQ1RFRCk7XG5cdFx0XHRcdGNhbGxiYWNrKG51bGwsIGNoYW5nZXMpO1xuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHQvLyBJZiBCcm93c3dlciBTdG9yYWdlIHRpZGRsZXJzIHdlcmUgY2FjaGVkIG9uIHJlbG9hZGluZyB0aGUgd2lraSwgYWRkIHRoZW0gYWZ0ZXIgc3luYyBmcm9tIHNlcnZlciBjb21wbGV0ZXMgaW4gdGhlIGFib3ZlIGNhbGxiYWNrLlxuXHRcdFx0XHRcdGlmICgkdHcuYnJvd3NlclN0b3JhZ2UgJiYgJHR3LmJyb3dzZXJTdG9yYWdlLmlzRW5hYmxlZCgpKSB7XG5cdFx0XHRcdFx0XHQkdHcuYnJvd3NlclN0b3JhZ2UuYWRkQ2FjaGVkVGlkZGxlcnMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdG9ub3BlbjogZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRzZWxmLnNldFVwZGF0ZUNvbm5lY3Rpb25TdGF0dXMoU0VSVkVSX0NPTk5FQ1RFRF9TU0UpO1xuXHRcdFx0XHQvLyBUaGUgc3luY2VyIGlzIGV4cGVjdGluZyBhIGNhbGxiYWNrIGJ1dCB3ZSBkb24ndCBoYXZlIGFueSBkYXRhIHRvIHNlbmRcblx0XHRcdFx0Y2FsbGJhY2sobnVsbCwge1xuXHRcdFx0XHRcdG1vZGlmaWNhdGlvbnM6IFtdLFxuXHRcdFx0XHRcdGRlbGV0aW9uczogW11cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0fVxuXHQvKlxuXHRBdHRlbXB0IHRvIGVzdGFibGlzaCBhbiBTU0Ugc3RyZWFtIHdpdGggdGhlIHNlcnZlciBhbmQgdHJhbnNmZXIgdGlkZGxlciBjaGFuZ2VzLiBPcHRpb25zIGluY2x1ZGU6XG4gIFxuXHRzeW5jZXI6IHJlZmVyZW5jZSB0byBzeW5jZXIgb2JqZWN0IHVzZWQgZm9yIHN0b3JpbmcgZGF0YVxuXHRvbm9wZW46IGludm9rZWQgd2hlbiB0aGUgc3RyZWFtIGlzIHN1Y2Nlc3NmdWxseSBvcGVuZWRcblx0b25lcnJvcjogaW52b2tlZCBpZiB0aGVyZSBpcyBhbiBlcnJvclxuXHQqL1xuXHRwcml2YXRlIGNvbm5lY3RTZXJ2ZXJTdHJlYW0ob3B0aW9uczoge1xuXHRcdHN5bmNlcjogU3luY2VyO1xuXHRcdG9ub3BlbjogKGV2ZW50OiBFdmVudCkgPT4gdm9pZDtcblx0XHRvbmVycm9yOiAoZXZlbnQ6IEV2ZW50KSA9PiB2b2lkO1xuXHR9KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzO1xuXHRcdGNvbnN0IGV2ZW50U291cmNlID0gbmV3IEV2ZW50U291cmNlKFwiL3JlY2lwZXMvXCIgKyB0aGlzLnJlY2lwZSArIFwiL2V2ZW50cz9sYXN0X2tub3duX3JldmlzaW9uX2lkPVwiICsgdGhpcy5sYXN0X2tub3duX3JldmlzaW9uX2lkKTtcblx0XHRldmVudFNvdXJjZS5vbmVycm9yID0gZnVuY3Rpb24gKGV2ZW50KSB7XG5cdFx0XHRpZiAob3B0aW9ucy5vbmVycm9yKSB7XG5cdFx0XHRcdG9wdGlvbnMub25lcnJvcihldmVudCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRldmVudFNvdXJjZS5vbm9wZW4gPSBmdW5jdGlvbiAoZXZlbnQpIHtcblx0XHRcdGlmIChvcHRpb25zLm9ub3Blbikge1xuXHRcdFx0XHRvcHRpb25zLm9ub3BlbihldmVudCk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRldmVudFNvdXJjZS5hZGRFdmVudExpc3RlbmVyKFwiY2hhbmdlXCIsIGZ1bmN0aW9uIChldmVudCkge1xuXG5cdFx0XHRjb25zdCBkYXRhOiB7XG5cdFx0XHRcdHRpdGxlOiBzdHJpbmc7XG5cdFx0XHRcdHJldmlzaW9uX2lkOiBudW1iZXI7XG5cdFx0XHRcdGlzX2RlbGV0ZWQ6IGJvb2xlYW47XG5cdFx0XHRcdGJhZ19uYW1lOiBzdHJpbmc7XG5cdFx0XHRcdHRpZGRsZXI6IGFueTtcblx0XHRcdH0gPSAkdHcudXRpbHMucGFyc2VKU09OU2FmZShldmVudC5kYXRhKTtcblx0XHRcdGlmICghZGF0YSkgcmV0dXJuO1xuXG5cdFx0XHRjb25zb2xlLmxvZyhcIlNTRSBkYXRhXCIsIGRhdGEpO1xuXHRcdFx0Ly8gVXBkYXRlIGxhc3Qgc2VlbiByZXZpc2lvbl9pZFxuXHRcdFx0aWYgKGRhdGEucmV2aXNpb25faWQgPiBzZWxmLmxhc3Rfa25vd25fcmV2aXNpb25faWQpIHtcblx0XHRcdFx0c2VsZi5sYXN0X2tub3duX3JldmlzaW9uX2lkID0gZGF0YS5yZXZpc2lvbl9pZDtcblx0XHRcdH1cblx0XHRcdC8vIFJlY29yZCB0aGUgbGFzdCB1cGRhdGUgdG8gdGhpcyB0aWRkbGVyXG5cdFx0XHRzZWxmLmxhc3RSZWNvcmRlZFVwZGF0ZVtkYXRhLnRpdGxlXSA9IHtcblx0XHRcdFx0dHlwZTogZGF0YS5pc19kZWxldGVkID8gXCJkZWxldGlvblwiIDogXCJ1cGRhdGVcIixcblx0XHRcdFx0cmV2aXNpb25faWQ6IGRhdGEucmV2aXNpb25faWRcblx0XHRcdH07XG5cdFx0XHRjb25zb2xlLmxvZyhgT3VzdGFuZGluZyByZXF1ZXN0cyBpcyAke0pTT04uc3RyaW5naWZ5KHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1tkYXRhLnRpdGxlXSl9YCk7XG5cdFx0XHQvLyBQcm9jZXNzIHRoZSB1cGRhdGUgaWYgdGhlIHRpZGRsZXIgaXMgbm90IHRoZSBzdWJqZWN0IG9mIGFuIG91dHN0YW5kaW5nIHJlcXVlc3Rcblx0XHRcdGlmIChzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbZGF0YS50aXRsZV0pIHJldHVybjtcblx0XHRcdGlmIChkYXRhLmlzX2RlbGV0ZWQpIHtcblx0XHRcdFx0c2VsZi5yZW1vdmVUaWRkbGVySW5mbyhkYXRhLnRpdGxlKTtcblx0XHRcdFx0ZGVsZXRlIG9wdGlvbnMuc3luY2VyLnRpZGRsZXJJbmZvW2RhdGEudGl0bGVdO1xuXHRcdFx0XHRvcHRpb25zLnN5bmNlci5sb2dnZXIubG9nKFwiRGVsZXRpbmcgdGlkZGxlciBtaXNzaW5nIGZyb20gc2VydmVyOlwiLCBkYXRhLnRpdGxlKTtcblx0XHRcdFx0b3B0aW9ucy5zeW5jZXIud2lraS5kZWxldGVUaWRkbGVyKGRhdGEudGl0bGUpO1xuXHRcdFx0XHRvcHRpb25zLnN5bmNlci5wcm9jZXNzVGFza1F1ZXVlKCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2YXIgcmVzdWx0ID0gc2VsZi5pbmNvbWluZ1VwZGF0ZXNGaWx0ZXJGbi5jYWxsKHNlbGYud2lraSwgc2VsZi53aWtpLm1ha2VUaWRkbGVySXRlcmF0b3IoW2RhdGEudGl0bGVdKSk7XG5cdFx0XHRcdGlmIChyZXN1bHQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHNlbGYuc2V0VGlkZGxlckluZm8oZGF0YS50aXRsZSwgZGF0YS5yZXZpc2lvbl9pZC50b1N0cmluZygpLCBkYXRhLmJhZ19uYW1lKTtcblx0XHRcdFx0XHRvcHRpb25zLnN5bmNlci5zdG9yZVRpZGRsZXIoZGF0YS50aWRkbGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cblx0XHR9KTtcblx0fVxuXHRwcml2YXRlIGFzeW5jIHBvbGxTZXJ2ZXIoKSB7XG5cdFx0dHlwZSB0ID0gVGlkZGxlclJvdXRlclJlc3BvbnNlW1wiaGFuZGxlR2V0QmFnU3RhdGVzXCJdXG5cdFx0Y29uc3QgW29rLCBlcnIsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3Qoe1xuXHRcdFx0a2V5OiBcImhhbmRsZUdldEJhZ1N0YXRlc1wiLFxuXHRcdFx0dXJsOiBcIi9iYWctc3RhdGVzXCIsXG5cdFx0XHRtZXRob2Q6IFwiR0VUXCIsXG5cdFx0XHRxdWVyeVBhcmFtczoge1xuXHRcdFx0XHRpbmNsdWRlX2RlbGV0ZWQ6IFwieWVzXCIsXG5cdFx0XHRcdC4uLnRoaXMudXNlR3ppcFN0cmVhbSA/IHsgZ3ppcF9zdHJlYW06IFwieWVzXCIgfSA6IHt9LFxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKCFvaykgdGhyb3cgZXJyO1xuXG5cdFx0Y29uc3QgYmFncyA9IHJlc3VsdC5yZXNwb25zZUpTT047XG5cblx0XHRpZiAoIWJhZ3MpIHRocm93IG5ldyBFcnJvcihcIm5vIHJlc3VsdCByZXR1cm5lZFwiKTtcblxuXHRcdGJhZ3Muc29ydCgoYSwgYikgPT4gYi5wb3NpdGlvbiAtIGEucG9zaXRpb24pO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gbmV3IFNldDxzdHJpbmc+KCksXG5cdFx0XHRkZWxldGVkID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHRjb25zdCBpbmNvbWluZ1RpdGxlcyA9IG5ldyBTZXQ8c3RyaW5nPihiYWdzLm1hcChcblx0XHRcdC8vIGdldCB0aGUgdGl0bGVzIGluIGVhY2ggbGF5ZXIgdGhhdCBhcmVuJ3QgZGVsZXRlZFxuXHRcdFx0ZSA9PiBlLnRpZGRsZXJzLmZpbHRlcihmID0+ICFmLmlzX2RlbGV0ZWQpLm1hcChmID0+IGYudGl0bGUpXG5cdFx0XHQvLyBhbmQgZmxhdHRlbiB0aGVtIGZvciBTZXRcblx0XHQpLmZsYXQoKSk7XG5cblx0XHRsZXQgbGFzdF9yZXZpc2lvbiA9IHRoaXMubGFzdF9rbm93bl9yZXZpc2lvbl9pZDtcblxuXHRcdGJhZ3MuZm9yRWFjaChiYWcgPT4ge1xuXHRcdFx0YmFnLnRpZGRsZXJzLmZvckVhY2godGlkID0+IHtcblx0XHRcdFx0Ly8gaWYgdGhlIHJldmlzaW9uIGlzIG9sZCwgaWdub3JlLCBzaW5jZSBkZWxldGlvbnMgY3JlYXRlIGEgbmV3IHJldmlzaW9uXG5cdFx0XHRcdGlmICh0aWQucmV2aXNpb25faWQgPD0gdGhpcy5sYXN0X2tub3duX3JldmlzaW9uX2lkKSByZXR1cm47XG5cdFx0XHRcdGlmICh0aWQucmV2aXNpb25faWQgPiBsYXN0X3JldmlzaW9uKSBsYXN0X3JldmlzaW9uID0gdGlkLnJldmlzaW9uX2lkO1xuXHRcdFx0XHQvLyBjaGVjayBpZiB0aGlzIHRpdGxlIHN0aWxsIGV4aXN0cyBpbiBhbnkgbGF5ZXJcblx0XHRcdFx0aWYgKGluY29taW5nVGl0bGVzLmhhcyh0aWQudGl0bGUpKVxuXHRcdFx0XHRcdG1vZGlmaWVkLmFkZCh0aWQudGl0bGUpO1xuXHRcdFx0XHRlbHNlXG5cdFx0XHRcdFx0ZGVsZXRlZC5hZGQodGlkLnRpdGxlKTtcblx0XHRcdH0pXG5cdFx0fSk7XG5cblx0XHR0aGlzLmxhc3Rfa25vd25fcmV2aXNpb25faWQgPSBsYXN0X3JldmlzaW9uO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG1vZGlmaWNhdGlvbnM6IFsuLi5tb2RpZmllZC5rZXlzKCldLFxuXHRcdFx0ZGVsZXRpb25zOiBbLi4uZGVsZXRlZC5rZXlzKCldLFxuXHRcdH1cblxuXHR9XG5cblx0Lypcblx0UXVldWUgYSBsb2FkIGZvciBhIHRpZGRsZXIgaWYgdGhlcmUgaGFzIGJlZW4gYW4gdXBkYXRlIGZvciBpdCBzaW5jZSB0aGUgc3BlY2lmaWVkIHJldmlzaW9uXG5cdCovXG5cdHByaXZhdGUgY2hlY2tMYXN0UmVjb3JkZWRVcGRhdGUodGl0bGU6IHN0cmluZywgcmV2aXNpb246IHN0cmluZykge1xuXHRcdHZhciBscnUgPSB0aGlzLmxhc3RSZWNvcmRlZFVwZGF0ZVt0aXRsZV07XG5cdFx0aWYgKGxydSAmJiBscnUucmV2aXNpb25faWQgPiByZXZpc2lvbikge1xuXHRcdFx0Y29uc29sZS5sb2coYENoZWNraW5nIGZvciB1cGRhdGVzIHRvICR7dGl0bGV9IHNpbmNlICR7SlNPTi5zdHJpbmdpZnkobHJ1KX0gY29tcGFyaW5nIHRvICR7cmV2aXNpb259YCk7XG5cdFx0XHR0aGlzLnN5bmNlciAmJiB0aGlzLnN5bmNlci5lbnF1ZXVlTG9hZFRpZGRsZXIodGl0bGUpO1xuXHRcdH1cblx0fVxuXHRwcml2YXRlIGdldCBzeW5jZXIoKSB7XG5cdFx0aWYgKCR0dy5zeW5jYWRhcHRvciA9PT0gdGhpcykgcmV0dXJuICR0dy5zeW5jZXI7XG5cdH1cblx0Lypcblx0U2F2ZSBhIHRpZGRsZXIgYW5kIGludm9rZSB0aGUgY2FsbGJhY2sgd2l0aCAoZXJyLGFkYXB0b3JJbmZvLHJldmlzaW9uKVxuXHQqL1xuXHRhc3luYyBzYXZlVGlkZGxlcihcblx0XHR0aWRkbGVyOiBUaWRkbGVyLFxuXHRcdGNhbGxiYWNrOiAoXG5cdFx0XHRlcnI6IGFueSxcblx0XHRcdGFkYXB0b3JJbmZvPzogTVdTQWRhcHRvckluZm8sXG5cdFx0XHRyZXZpc2lvbj86IHN0cmluZ1xuXHRcdCkgPT4gdm9pZCxcblx0XHRvcHRpb25zPzoge31cblx0KSB7XG5cdFx0dmFyIHNlbGYgPSB0aGlzLCB0aXRsZSA9IHRpZGRsZXIuZmllbGRzLnRpdGxlIGFzIHN0cmluZztcblx0XHRpZiAodGl0bGUgPT09IFwiJDovU3RvcnlMaXN0XCIpIHtcblx0XHRcdHJldHVybiBjYWxsYmFjayhudWxsKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuaXNSZWFkT25seSB8fCB0aXRsZS5zdWJzdHIoMCwgTVdDX1NUQVRFX1RJRERMRVJfUFJFRklYLmxlbmd0aCkgPT09IE1XQ19TVEFURV9USURETEVSX1BSRUZJWCkge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKG51bGwpO1xuXHRcdH1cblx0XHRzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdID0geyB0eXBlOiBcIlBVVFwiIH07XG5cblx0XHQvLyBhcHBsaWNhdGlvbi94LW13cy10aWRkbGVyXG5cdFx0Ly8gVGhlIC50aWQgZmlsZSBmb3JtYXQgZG9lcyBub3Qgc3VwcG9ydCBmaWVsZCBuYW1lcyB3aXRoIGNvbG9ucy4gXG5cdFx0Ly8gUmF0aGVyIHRoYW4gdHJ5aW5nIHRvIGNhdGNoIGFsbCB0aGUgdW5zdXBwb3J0ZWQgdmFyaWF0aW9ucyB0aGF0IG1heSBhcHBlYXIsXG5cdFx0Ly8gd2UnbGwganVzdCB1c2UgSlNPTiB0byBzZW5kIGl0IGFjcm9zcyB0aGUgd2lyZSwgc2luY2UgdGhhdCBpcyB0aGUgb2ZmaWNpYWwgZmFsbGJhY2sgZm9ybWF0IGFueXdheS5cblx0XHQvLyBIb3dldmVyLCBwYXJzaW5nIGEgaHVnZSBzdHJpbmcgdmFsdWUgaW5zaWRlIGEgSlNPTiBvYmplY3QgaXMgdmVyeSBzbG93LFxuXHRcdC8vIHNvIHdlIHNwbGl0IG9mZiB0aGUgdGV4dCBmaWVsZCBhbmQgc2VuZCBpdCBhZnRlciB0aGUgb3RoZXIgZmllbGRzLiBcblxuXHRcdGNvbnN0IGZpZWxkcyA9IHRpZGRsZXIuZ2V0RmllbGRTdHJpbmdzKHt9KTtcblx0XHRjb25zdCB0ZXh0ID0gZmllbGRzLnRleHQ7XG5cdFx0ZGVsZXRlIGZpZWxkcy50ZXh0O1xuXHRcdGxldCBib2R5ID0gSlNPTi5zdHJpbmdpZnkoZmllbGRzKTtcblxuXHRcdGlmICh0aWRkbGVyLmhhc0ZpZWxkKFwidGV4dFwiKSkge1xuXHRcdFx0aWYgKHR5cGVvZiB0ZXh0ICE9PSBcInN0cmluZ1wiICYmIHRleHQpXG5cdFx0XHRcdHJldHVybiBjYWxsYmFjayhuZXcgRXJyb3IoXCJFcnJvciBzYXZpbmcgdGlkZGxlciBcIiArIGZpZWxkcy50aXRsZSArIFwiOiB0aGUgdGV4dCBmaWVsZCBpcyB0cnV0aHkgYnV0IG5vdCBhIHN0cmluZ1wiKSk7XG5cdFx0XHRib2R5ICs9IGBcXG5cXG4ke3RleHR9YFxuXHRcdH1cblxuXHRcdHR5cGUgdCA9IFRpZGRsZXJSb3V0ZXJSZXNwb25zZVtcImhhbmRsZVNhdmVSZWNpcGVUaWRkbGVyXCJdXG5cdFx0Y29uc3QgW29rLCBlcnIsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3Qoe1xuXHRcdFx0a2V5OiBcImhhbmRsZVNhdmVSZWNpcGVUaWRkbGVyXCIsXG5cdFx0XHR1cmw6IFwiL3RpZGRsZXJzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRpdGxlKSxcblx0XHRcdG1ldGhvZDogXCJQVVRcIixcblx0XHRcdHJlcXVlc3RCb2R5U3RyaW5nOiBib2R5LFxuXHRcdFx0aGVhZGVyczoge1xuXHRcdFx0XHRcImNvbnRlbnQtdHlwZVwiOiBcImFwcGxpY2F0aW9uL3gtbXdzLXRpZGRsZXJcIlxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0ZGVsZXRlIHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV07XG5cdFx0aWYgKCFvaykgcmV0dXJuIGNhbGxiYWNrKGVycik7XG5cblx0XHRjb25zdCBkYXRhID0gcmVzdWx0LnJlc3BvbnNlSlNPTjtcblx0XHRpZiAoIWRhdGEpIHJldHVybiBjYWxsYmFjayhudWxsKTsgLy8gYSAyeHggcmVzcG9uc2Ugd2l0aG91dCBhIGJvZHkgaXMgdW5saWtlbHlcblxuXHRcdC8vSWYgQnJvd3Nlci1TdG9yYWdlIHBsdWdpbiBpcyBwcmVzZW50LCByZW1vdmUgdGlkZGxlciBmcm9tIGxvY2FsIHN0b3JhZ2UgYWZ0ZXIgc3VjY2Vzc2Z1bCBzeW5jIHRvIHRoZSBzZXJ2ZXJcblx0XHRpZiAoJHR3LmJyb3dzZXJTdG9yYWdlICYmICR0dy5icm93c2VyU3RvcmFnZS5pc0VuYWJsZWQoKSkge1xuXHRcdFx0JHR3LmJyb3dzZXJTdG9yYWdlLnJlbW92ZVRpZGRsZXJGcm9tTG9jYWxTdG9yYWdlKHRpdGxlKTtcblx0XHR9XG5cblxuXHRcdC8vIFNhdmUgdGhlIGRldGFpbHMgb2YgdGhlIG5ldyByZXZpc2lvbiBvZiB0aGUgdGlkZGxlclxuXHRcdGNvbnN0IHJldmlzaW9uID0gZGF0YS5yZXZpc2lvbl9pZCwgYmFnX25hbWUgPSBkYXRhLmJhZ19uYW1lO1xuXHRcdGNvbnNvbGUubG9nKGBTYXZlZCAke3RpdGxlfSB3aXRoIHJldmlzaW9uICR7cmV2aXNpb259IGFuZCBiYWcgJHtiYWdfbmFtZX1gKTtcblx0XHQvLyBJZiB0aGVyZSBoYXMgYmVlbiBhIG1vcmUgcmVjZW50IHVwZGF0ZSBmcm9tIHRoZSBzZXJ2ZXIgdGhlbiBlbnF1ZXVlIGEgbG9hZCBvZiB0aGlzIHRpZGRsZXJcblx0XHRzZWxmLmNoZWNrTGFzdFJlY29yZGVkVXBkYXRlKHRpdGxlLCByZXZpc2lvbik7XG5cdFx0Ly8gSW52b2tlIHRoZSBjYWxsYmFja1xuXHRcdHNlbGYuc2V0VGlkZGxlckluZm8odGl0bGUsIHJldmlzaW9uLCBiYWdfbmFtZSk7XG5cdFx0Y2FsbGJhY2sobnVsbCwgeyBiYWc6IGJhZ19uYW1lIH0sIHJldmlzaW9uKTtcblxuXHR9XG5cdC8qXG5cdExvYWQgYSB0aWRkbGVyIGFuZCBpbnZva2UgdGhlIGNhbGxiYWNrIHdpdGggKGVycix0aWRkbGVyRmllbGRzKVxuXG5cdFRoZSBzeW5jZXIgZG9lcyBub3QgcGFzcyBpdHNlbGYgaW50byBvcHRpb25zLlxuXHQqL1xuXHRhc3luYyBsb2FkVGlkZGxlcih0aXRsZTogc3RyaW5nLCBjYWxsYmFjazogKGVycjogYW55LCBmaWVsZHM/OiBhbnkpID0+IHZvaWQsIG9wdGlvbnM6IGFueSkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdID0geyB0eXBlOiBcIkdFVFwiIH07XG5cdFx0Y29uc3QgW29rLCBlcnIsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3Qoe1xuXHRcdFx0a2V5OiBcImhhbmRsZUdldFJlY2lwZVRpZGRsZXJcIixcblx0XHRcdHVybDogXCIvdGlkZGxlcnMvXCIgKyBlbmNvZGVVUklDb21wb25lbnQodGl0bGUpLFxuXHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdH0pXG5cdFx0ZGVsZXRlIHNlbGYub3V0c3RhbmRpbmdSZXF1ZXN0c1t0aXRsZV07XG5cdFx0aWYgKCFvaykgcmV0dXJuIGNhbGxiYWNrKGVycik7XG5cblx0XHRjb25zdCB7IHJlc3BvbnNlSlNPTjogZGF0YSwgaGVhZGVycyB9ID0gcmVzdWx0O1xuXHRcdGNvbnN0IHJldmlzaW9uID0gaGVhZGVycy5nZXQoXCJ4LXJldmlzaW9uLW51bWJlclwiKSA/PyBcIlwiLFxuXHRcdFx0YmFnX25hbWUgPSBoZWFkZXJzLmdldChcIngtYmFnLW5hbWVcIikgPz8gXCJcIjtcblxuXHRcdGlmICghcmV2aXNpb24gfHwgIWJhZ19uYW1lIHx8ICFkYXRhKSByZXR1cm4gY2FsbGJhY2sobnVsbCwgbnVsbCk7XG5cblx0XHQvLyBJZiB0aGVyZSBoYXMgYmVlbiBhIG1vcmUgcmVjZW50IHVwZGF0ZSBmcm9tIHRoZSBzZXJ2ZXIgdGhlbiBlbnF1ZXVlIGEgbG9hZCBvZiB0aGlzIHRpZGRsZXJcblx0XHRzZWxmLmNoZWNrTGFzdFJlY29yZGVkVXBkYXRlKHRpdGxlLCByZXZpc2lvbik7XG5cdFx0Ly8gSW52b2tlIHRoZSBjYWxsYmFja1xuXHRcdHNlbGYuc2V0VGlkZGxlckluZm8odGl0bGUsIHJldmlzaW9uLCBiYWdfbmFtZSk7XG5cdFx0Y2FsbGJhY2sobnVsbCwgZGF0YSk7XG5cdH1cblx0Lypcblx0RGVsZXRlIGEgdGlkZGxlciBhbmQgaW52b2tlIHRoZSBjYWxsYmFjayB3aXRoIChlcnIpXG5cdG9wdGlvbnMgaW5jbHVkZTpcblx0dGlkZGxlckluZm86IHRoZSBzeW5jZXIncyB0aWRkbGVySW5mbyBmb3IgdGhpcyB0aWRkbGVyXG5cdCovXG5cdGFzeW5jIGRlbGV0ZVRpZGRsZXIodGl0bGU6IHN0cmluZywgY2FsbGJhY2s6IChlcnI6IGFueSwgYWRhcHRvckluZm8/OiBhbnkpID0+IHZvaWQsIG9wdGlvbnM6IGFueSkge1xuXHRcdHZhciBzZWxmID0gdGhpcztcblx0XHRpZiAodGhpcy5pc1JlYWRPbmx5KSB7IHJldHVybiBjYWxsYmFjayhudWxsKTsgfVxuXHRcdC8vIElmIHdlIGRvbid0IGhhdmUgYSBiYWcgaXQgbWVhbnMgdGhhdCB0aGUgdGlkZGxlciBoYXNuJ3QgYmVlbiBzZWVuIGJ5IHRoZSBzZXJ2ZXIsIHNvIHdlIGRvbid0IG5lZWQgdG8gZGVsZXRlIGl0XG5cdFx0Ly8gdmFyIGJhZyA9IHRoaXMuZ2V0VGlkZGxlckJhZyh0aXRsZSk7XG5cdFx0Ly8gaWYoIWJhZykgeyByZXR1cm4gY2FsbGJhY2sobnVsbCwgb3B0aW9ucy50aWRkbGVySW5mby5hZGFwdG9ySW5mbyk7IH1cblx0XHRzZWxmLm91dHN0YW5kaW5nUmVxdWVzdHNbdGl0bGVdID0geyB0eXBlOiBcIkRFTEVURVwiIH07XG5cdFx0Ly8gSXNzdWUgSFRUUCByZXF1ZXN0IHRvIGRlbGV0ZSB0aGUgdGlkZGxlclxuXHRcdGNvbnN0IFtvaywgZXJyLCByZXN1bHRdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdGtleTogXCJoYW5kbGVEZWxldGVSZWNpcGVUaWRkbGVyXCIsXG5cdFx0XHR1cmw6IFwiL3RpZGRsZXJzL1wiICsgZW5jb2RlVVJJQ29tcG9uZW50KHRpdGxlKSxcblx0XHRcdG1ldGhvZDogXCJERUxFVEVcIixcblx0XHR9KTtcblx0XHRkZWxldGUgc2VsZi5vdXRzdGFuZGluZ1JlcXVlc3RzW3RpdGxlXTtcblx0XHRpZiAoIW9rKSByZXR1cm4gY2FsbGJhY2soZXJyKTtcblx0XHRjb25zdCB7IHJlc3BvbnNlSlNPTjogZGF0YSB9ID0gcmVzdWx0O1xuXHRcdGlmICghZGF0YSkgcmV0dXJuIGNhbGxiYWNrKG51bGwpO1xuXG5cdFx0Y29uc3QgcmV2aXNpb24gPSBkYXRhLnJldmlzaW9uX2lkLCBiYWdfbmFtZSA9IGRhdGEuYmFnX25hbWU7XG5cdFx0Ly8gSWYgdGhlcmUgaGFzIGJlZW4gYSBtb3JlIHJlY2VudCB1cGRhdGUgZnJvbSB0aGUgc2VydmVyIHRoZW4gZW5xdWV1ZSBhIGxvYWQgb2YgdGhpcyB0aWRkbGVyXG5cdFx0c2VsZi5jaGVja0xhc3RSZWNvcmRlZFVwZGF0ZSh0aXRsZSwgcmV2aXNpb24pO1xuXHRcdHNlbGYucmVtb3ZlVGlkZGxlckluZm8odGl0bGUpO1xuXHRcdC8vIEludm9rZSB0aGUgY2FsbGJhY2sgJiByZXR1cm4gbnVsbCBhZGFwdG9ySW5mb1xuXHRcdGNhbGxiYWNrKG51bGwsIG51bGwpO1xuXHR9XG59XG5cblxuaWYgKCR0dy5icm93c2VyICYmIGRvY3VtZW50LmxvY2F0aW9uLnByb3RvY29sLnN0YXJ0c1dpdGgoXCJodHRwXCIpKSB7XG5cdGV4cG9ydHMuYWRhcHRvckNsYXNzID0gTXVsdGlXaWtpQ2xpZW50QWRhcHRvcjtcbn1cblxudHlwZSBQYXJhbXNJbnB1dCA9IFVSTFNlYXJjaFBhcmFtcyB8IFtzdHJpbmcsIHN0cmluZ11bXSB8IG9iamVjdCB8IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuaW50ZXJmYWNlIEh0dHBSZXF1ZXN0T3B0aW9uczxUWVBFIGV4dGVuZHMgXCJhcnJheWJ1ZmZlclwiIHwgXCJibG9iXCIgfCBcInRleHRcIj4ge1xuXHQvKiogVGhlIHJlcXVlc3QgTUVUSE9ELiBNYXliZSBiZSBhbnl0aGluZyBleGNlcHQgQ09OTkVDVCwgVFJBQ0UsIG9yIFRSQUNLLiAgKi9cblx0bWV0aG9kOiBzdHJpbmc7XG5cdC8qKiBUaGUgdXJsIG1heSBhbHNvIGNvbnRhaW4gcXVlcnkgcGFyYW1zLiAqL1xuXHR1cmw6IHN0cmluZztcblx0LyoqIFRoZSByZXNwb25zZSB0eXBlcyAqL1xuXHRyZXNwb25zZVR5cGU6IFRZUEU7XG5cdGhlYWRlcnM/OiBQYXJhbXNJbnB1dDtcblx0LyoqIFRoaXMgaXMgcGFyc2VkIHNlcGFyYXRlbHkgZnJvbSB0aGUgdXJsIGFuZCBhcHBlbmRlZCB0byBpdC4gKi9cblx0cXVlcnlQYXJhbXM/OiBQYXJhbXNJbnB1dDtcblx0LyoqIFxuXHQgKiBUaGUgc3RyaW5nIHRvIHNlbmQgYXMgdGhlIHJlcXVlc3QgYm9keS4gTm90IHZhbGlkIGZvciBHRVQgYW5kIEhFQUQuXG5cdCAqIFxuXHQgKiBGb3IgYGFwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZGAsIHVzZSBgbmV3IFVSTFNlYXJjaFBhcmFtcygpLnRvU3RyaW5nKClgLlxuXHQgKiBcblx0ICogRm9yIGBhcHBsaWNhdGlvbi9qc29uYCwgdXNlIGBKU09OLnN0cmluZ2lmeSgpYFxuXHQgKi9cblx0cmVxdWVzdEJvZHlTdHJpbmc/OiBzdHJpbmc7XG5cdHByb2dyZXNzPzogKGV2ZW50OiBQcm9ncmVzc0V2ZW50PEV2ZW50VGFyZ2V0PikgPT4gdm9pZDtcbn1cblxuXG5mdW5jdGlvbiBodHRwUmVxdWVzdDxUWVBFIGV4dGVuZHMgXCJhcnJheWJ1ZmZlclwiIHwgXCJibG9iXCIgfCBcInRleHRcIj4ob3B0aW9uczogSHR0cFJlcXVlc3RPcHRpb25zPFRZUEU+KSB7XG5cblx0b3B0aW9ucy5tZXRob2QgPSBvcHRpb25zLm1ldGhvZC50b1VwcGVyQ2FzZSgpO1xuXG5cdGlmICgob3B0aW9ucy5tZXRob2QgPT09IFwiR0VUXCIgfHwgb3B0aW9ucy5tZXRob2QgPT09IFwiSEVBRFwiKSAmJiBvcHRpb25zLnJlcXVlc3RCb2R5U3RyaW5nKVxuXHRcdHRocm93IG5ldyBFcnJvcihcInJlcXVlc3RCb2R5U3RyaW5nIG11c3QgYmUgZmFsc3kgaWYgbWV0aG9kIGlzIEdFVCBvciBIRUFEXCIpO1xuXG5cdGZ1bmN0aW9uIHBhcmFtc0lucHV0KGlucHV0OiBQYXJhbXNJbnB1dCkge1xuXHRcdGlmICghaW5wdXQpIHJldHVybiBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdFx0aWYgKGlucHV0IGluc3RhbmNlb2YgVVJMU2VhcmNoUGFyYW1zKSByZXR1cm4gaW5wdXQ7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoaW5wdXQpIHx8IHR5cGVvZiBpbnB1dCA9PT0gXCJzdHJpbmdcIikgcmV0dXJuIG5ldyBVUkxTZWFyY2hQYXJhbXMoaW5wdXQpO1xuXHRcdHJldHVybiBuZXcgVVJMU2VhcmNoUGFyYW1zKE9iamVjdC5lbnRyaWVzKGlucHV0KSk7XG5cdH1cblxuXHRmdW5jdGlvbiBub3JtYWxpemVIZWFkZXJzKGhlYWRlcnM6IFVSTFNlYXJjaFBhcmFtcykge1xuXHRcdFsuLi5oZWFkZXJzLmtleXMoKV0uZm9yRWFjaCgoW2ssIHZdKSA9PiB7XG5cdFx0XHRjb25zdCBrMiA9IGsudG9Mb3dlckNhc2UoKTtcblx0XHRcdGlmIChrMiAhPT0gaykge1xuXHRcdFx0XHRoZWFkZXJzLmdldEFsbChrKS5mb3JFYWNoKGUgPT4ge1xuXHRcdFx0XHRcdGhlYWRlcnMuYXBwZW5kKGsyLCBlKTtcblx0XHRcdFx0fSlcblx0XHRcdFx0aGVhZGVycy5kZWxldGUoayk7XG5cdFx0XHRcdGNvbnNvbGUubG9nKGssIGsyKTtcblx0XHRcdH1cblx0XHR9KVxuXHR9XG5cblx0cmV0dXJuIG5ldyBQcm9taXNlPHtcblx0XHQvKiogU2hvcnRoYW5kIHRvIGNoZWNrIGlmIHRoZSByZXNwb25zZSBpcyBpbiB0aGUgMnh4IHJhbmdlLiAqL1xuXHRcdG9rOiBib29sZWFuO1xuXHRcdHN0YXR1czogbnVtYmVyO1xuXHRcdHN0YXR1c1RleHQ6IHN0cmluZztcblx0XHRoZWFkZXJzOiBVUkxTZWFyY2hQYXJhbXM7XG5cdFx0cmVzcG9uc2U6XG5cdFx0VFlQRSBleHRlbmRzIFwiYXJyYXlidWZmZXJcIiA/IEFycmF5QnVmZmVyIDpcblx0XHRUWVBFIGV4dGVuZHMgXCJibG9iXCIgPyBCbG9iIDpcblx0XHRUWVBFIGV4dGVuZHMgXCJ0ZXh0XCIgPyBzdHJpbmcgOlxuXHRcdG5ldmVyO1xuXHR9PigocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0Ly8gaWYgdGhpcyB0aHJvd3Mgc3luYydseSwgdGhlIHByb21pc2Ugd2lsbCByZWplY3QuXG5cblx0XHRjb25zdCB1cmwgPSBuZXcgVVJMKG9wdGlvbnMudXJsLCBsb2NhdGlvbi5ocmVmKTtcblx0XHRjb25zdCBxdWVyeSA9IHBhcmFtc0lucHV0KG9wdGlvbnMucXVlcnlQYXJhbXMpO1xuXHRcdHF1ZXJ5LmZvckVhY2goKHYsIGspID0+IHsgdXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoaywgdik7IH0pO1xuXG5cdFx0Y29uc3QgaGVhZGVycyA9IHBhcmFtc0lucHV0KG9wdGlvbnMuaGVhZGVycyk7XG5cdFx0bm9ybWFsaXplSGVhZGVycyhoZWFkZXJzKTtcblxuXHRcdGNvbnN0IHJlcXVlc3QgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblx0XHRyZXF1ZXN0LnJlc3BvbnNlVHlwZSA9IG9wdGlvbnMucmVzcG9uc2VUeXBlIHx8IFwidGV4dFwiO1xuXG5cdFx0dHJ5IHtcblx0XHRcdHJlcXVlc3Qub3BlbihvcHRpb25zLm1ldGhvZCwgdXJsLCB0cnVlKTtcblx0XHR9IGNhdGNoIChlKSB7IGNvbnNvbGUubG9nKGUsIHsgZSB9KTsgdGhyb3cgZTsgfVxuXG5cdFx0aWYgKCFoZWFkZXJzLmhhcyhcImNvbnRlbnQtdHlwZVwiKSlcblx0XHRcdGhlYWRlcnMuc2V0KFwiY29udGVudC10eXBlXCIsIFwiYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkOyBjaGFyc2V0PVVURi04XCIpO1xuXG5cdFx0aWYgKCFoZWFkZXJzLmhhcyhcIngtcmVxdWVzdGVkLXdpdGhcIikpXG5cdFx0XHRoZWFkZXJzLnNldChcIngtcmVxdWVzdGVkLXdpdGhcIiwgXCJUaWRkbHlXaWtpXCIpO1xuXG5cdFx0aGVhZGVycy5zZXQoXCJhY2NlcHRcIiwgXCJhcHBsaWNhdGlvbi9qc29uXCIpO1xuXG5cblx0XHRoZWFkZXJzLmZvckVhY2goKHYsIGspID0+IHtcblx0XHRcdHJlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcihrLCB2KTtcblx0XHR9KTtcblxuXHRcdC8vIHJlcXVlc3Qub25lcnJvciA9IChldmVudCkgPT4ge1xuXHRcdC8vIFx0Y29uc29sZS5sb2coZXZlbnQpO1xuXHRcdC8vIFx0Y29uc29sZS5sb2coKGV2ZW50IGFzIFByb2dyZXNzRXZlbnQ8WE1MSHR0cFJlcXVlc3Q+KSEudGFyZ2V0Py5zdGF0dXMpO1xuXHRcdC8vIH1cblxuXHRcdHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKHRoaXMucmVhZHlTdGF0ZSAhPT0gNCkgcmV0dXJuO1xuXG5cdFx0XHRjb25zdCBoZWFkZXJzID0gbmV3IFVSTFNlYXJjaFBhcmFtcygpO1xuXHRcdFx0cmVxdWVzdC5nZXRBbGxSZXNwb25zZUhlYWRlcnMoKT8udHJpbSgpLnNwbGl0KC9bXFxyXFxuXSsvKS5mb3JFYWNoKChsaW5lKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHBhcnRzID0gbGluZS5zcGxpdChcIjogXCIpO1xuXHRcdFx0XHRjb25zdCBoZWFkZXIgPSBwYXJ0cy5zaGlmdCgpPy50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IHBhcnRzLmpvaW4oXCI6IFwiKTtcblx0XHRcdFx0aWYgKGhlYWRlcikgaGVhZGVycy5hcHBlbmQoaGVhZGVyLCB2YWx1ZSk7XG5cdFx0XHR9KTtcblx0XHRcdHJlc29sdmUoe1xuXHRcdFx0XHRvazogdGhpcy5zdGF0dXMgPj0gMjAwICYmIHRoaXMuc3RhdHVzIDwgMzAwLFxuXHRcdFx0XHRzdGF0dXM6IHRoaXMuc3RhdHVzLFxuXHRcdFx0XHRzdGF0dXNUZXh0OiB0aGlzLnN0YXR1c1RleHQsXG5cdFx0XHRcdHJlc3BvbnNlOiB0aGlzLnJlc3BvbnNlLFxuXHRcdFx0XHRoZWFkZXJzLFxuXHRcdFx0fSk7XG5cblx0XHR9O1xuXG5cdFx0aWYgKG9wdGlvbnMucHJvZ3Jlc3MpXG5cdFx0XHRyZXF1ZXN0Lm9ucHJvZ3Jlc3MgPSBvcHRpb25zLnByb2dyZXNzO1xuXG5cdFx0dHJ5IHsgcmVxdWVzdC5zZW5kKG9wdGlvbnMucmVxdWVzdEJvZHlTdHJpbmcpOyB9IGNhdGNoIChlKSB7IGNvbnNvbGUubG9nKGUsIHsgZSB9KTsgdGhyb3cgZTsgfVxuXG5cblx0fSk7XG5cbn1cblxuZnVuY3Rpb24gcmVhZEJsb2JBc0FycmF5QnVmZmVyKGJsb2I6IEJsb2IpIHtcblx0Y29uc3QgZXJyb3IgPSBuZXcgRXJyb3IoXCJFcnJvciByZWFkaW5nIGJsb2JcIik7XG5cdHJldHVybiBuZXcgUHJvbWlzZTxBcnJheUJ1ZmZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKCk7XG5cdFx0cmVhZGVyLm9ubG9hZCA9ICgpID0+IHtcblx0XHRcdHJlc29sdmUocmVhZGVyLnJlc3VsdCBhcyBBcnJheUJ1ZmZlcilcblx0XHR9O1xuXHRcdHJlYWRlci5vbmVycm9yID0gKCkgPT4ge1xuXHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHR9O1xuXHRcdHJlYWRlci5yZWFkQXNBcnJheUJ1ZmZlcihibG9iKTtcblx0fSk7XG5cbn1cbiJdfQ==