/*\
title: $:/plugins/mws/client/new-multiwikiclientadaptor.js
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
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CONFIG_HOST_TIDDLER = "$:/config/multiwikiclient/host";
const DEFAULT_HOST_TIDDLER = "$protocol$//$host$/";
const CONFIG_RECIPE_TIDDLER = "$:/config/multiwikiclient/recipe";
const IS_DEV_MODE_TIDDLER = "$:/state/multiwikiclient/dev-mode";
const LAST_REVISION_ID_TIDDLER = "$:/state/multiwikiclient/recipe/last_revision_id";
const MWC_STATE_TIDDLER_PREFIX = "$:/state/multiwikiclient/";
const BAG_STATE_TIDDLER = "$:/state/multiwikiclient/tiddlers/bag";
const REVISION_STATE_TIDDLER = "$:/state/multiwikiclient/tiddlers/revision";
/** A request that never reached the server: the connection is gone, the
 *  server is unreachable, the request was aborted or timed out. Marked so that
 *  the syncer can tell "network gone" from "server answered with an error",
 *  which is what decides between the connection alert and the normal one. */
class NetworkError extends Error {
    constructor(cause) {
        super(cause instanceof Error ? cause.message : String(cause));
        this.isNetworkError = true;
        this.name = "NetworkError";
    }
}
/** A request error that keeps the distinction: a failed request that never
 *  reached the server stays a NetworkError, an answered one becomes an Error. */
function asRequestError(message, cause) {
    return (cause === null || cause === void 0 ? void 0 : cause.isNetworkError)
        ? new NetworkError(new Error(message))
        : new Error(message);
}
/** httpRequest answers instead of rejecting, and a request that never reached
 *  the server comes back with status 0: the network is gone, not the server
 *  complaining. Every other status is a real answer and stays an Error. */
function requestFailure(status, reason) {
    return status === 0
        ? new NetworkError(new Error("Server unreachable"))
        : new Error(`Server returned ${status}: ${reason !== null && reason !== void 0 ? reason : "(no reason)"}`);
}
// ---------------------------------------------------------------------------
// Adaptor
// ---------------------------------------------------------------------------
class MultiWikiClientAdaptor {
    constructor(options) {
        this.name = "multiwikiclient";
        this.syncer = null;
        this.isLoggedIn = false;
        this.isReadOnly = true;
        this.offline = false;
        this.username = "";
        this.error = null;
        this.lastSeq = "0";
        this.initialLoadDone = false;
        /** title → bag name, populated on load/save */
        this.tiddlerBag = new Map();
        /** title → revision, populated on save */
        this.tiddlerRevision = new Map();
        this.wiki = options.wiki;
        this.host = this.getHost();
        this.recipe = this.wiki.getTiddlerText(CONFIG_RECIPE_TIDDLER, "");
        this.isDevMode = this.wiki.getTiddlerText(IS_DEV_MODE_TIDDLER) === "yes";
        this.lastSeq = this.wiki.getTiddlerText(LAST_REVISION_ID_TIDDLER, "0");
        this.initialLoadDone = this.lastSeq !== "0";
        this.logger = new $tw.utils.Logger("MultiWikiClientAdaptor");
    }
    isReady() { return true; }
    setLoggerSaveBuffer(logger) { this.logger.setSaveBuffer(logger); }
    registerSyncer(syncer) { this.syncer = syncer; }
    isStateTiddler(title) {
        return title.startsWith(MWC_STATE_TIDDLER_PREFIX);
    }
    setTiddlerInfo(title, bag, revision) {
        if (bag) {
            this.tiddlerBag.set(title, bag);
            this.wiki.setText(BAG_STATE_TIDDLER, null, title, bag, { suppressTimestamp: true });
        }
        else {
            this.tiddlerBag.delete(title);
            this.wiki.setText(BAG_STATE_TIDDLER, null, title, undefined, { suppressTimestamp: true });
        }
        if (revision) {
            this.tiddlerRevision.set(title, revision);
            this.wiki.setText(REVISION_STATE_TIDDLER, null, title, revision, { suppressTimestamp: true });
        }
    }
    clearTiddlerInfo(title) {
        this.tiddlerBag.delete(title);
        this.tiddlerRevision.delete(title);
        this.wiki.setText(BAG_STATE_TIDDLER, null, title, undefined, { suppressTimestamp: true });
        this.wiki.setText(REVISION_STATE_TIDDLER, null, title, undefined, { suppressTimestamp: true });
    }
    setLastSeq(seq) {
        this.lastSeq = seq;
        this.wiki.setText(LAST_REVISION_ID_TIDDLER, null, "text", seq, { suppressTimestamp: true });
    }
    getTiddlerRevision(title) {
        var _a;
        return (_a = this.wiki.extractTiddlerDataItem(REVISION_STATE_TIDDLER, title)) !== null && _a !== void 0 ? _a : "";
    }
    getTiddlerInfo(tiddler) {
        var _a, _b;
        const title = tiddler.fields.title;
        const bag = (_a = this.wiki.extractTiddlerDataItem(BAG_STATE_TIDDLER, title)) !== null && _a !== void 0 ? _a : this.tiddlerBag.get(title);
        const revision = (_b = this.wiki.extractTiddlerDataItem(REVISION_STATE_TIDDLER, title)) !== null && _b !== void 0 ? _b : this.tiddlerRevision.get(title);
        return bag && revision ? { bag, revision, title } : undefined;
    }
    getHost() {
        let text = this.wiki.getTiddlerText(CONFIG_HOST_TIDDLER, DEFAULT_HOST_TIDDLER);
        [
            { name: "protocol", value: document.location.protocol },
            { name: "host", value: document.location.host },
            { name: "pathname", value: document.location.pathname },
        ].forEach(({ name, value }) => {
            text = $tw.utils.replaceString(text, new RegExp("\\$" + name + "\\$", "mg"), value);
        });
        return text;
    }
    // -------------------------------------------------------------------------
    // Status
    // -------------------------------------------------------------------------
    getStatus(callback) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            const [ok, , result] = yield this.recipeRequest({ method: "GET", url: "/status" });
            if (!ok && (result === null || result === void 0 ? void 0 : result.status) === 0) {
                this.offline = true;
                this.isLoggedIn = false;
                this.isReadOnly = true;
                this.username = "(offline)";
                this.error = "The webpage is forbidden from contacting the server.";
            }
            else if (ok) {
                const status = result.responseJSON;
                this.offline = false;
                this.error = null;
                this.isLoggedIn = (_a = status === null || status === void 0 ? void 0 : status.isLoggedIn) !== null && _a !== void 0 ? _a : false;
                this.username = (_b = status === null || status === void 0 ? void 0 : status.username) !== null && _b !== void 0 ? _b : "(anon)";
                this.isReadOnly = !((_d = (_c = status === null || status === void 0 ? void 0 : status.bags) === null || _c === void 0 ? void 0 : _c.some(b => b.canUserWrite)) !== null && _d !== void 0 ? _d : false);
            }
            else {
                this.error = `Server error ${result === null || result === void 0 ? void 0 : result.status}`;
            }
            callback(this.error, this.isLoggedIn, this.username, this.isReadOnly, false);
        });
    }
    // -------------------------------------------------------------------------
    // Login / Logout
    // -------------------------------------------------------------------------
    // Performs an OPAQUE (PAKE) password login against the MWS session
    // endpoints. On success the server sets a session cookie (path "/") which
    // automatically authorises all subsequent same-origin requests, so the
    // wiki becomes writable without visiting the /login page.
    login(username, password, cb) {
        return __awaiter(this, void 0, void 0, function* () {
            const opaque = require("$:/plugins/mws/client/library/opaque");
            try {
                if (!username || !password)
                    throw new Error("Username and password are required");
                yield opaque.ready;
                const { clientLoginState, startLoginRequest } = opaque.client.startLogin({ password });
                const r1 = yield httpRequest({
                    method: "POST",
                    url: this.host + "login/1",
                    responseType: "text",
                    requestBodyString: JSON.stringify({ username, startLoginRequest }),
                });
                if (r1.status !== 200)
                    throw new Error("Login failed: " + r1.statusText);
                const { loginResponse, loginSession } = JSON.parse(r1.response);
                const loginResult = opaque.client.finishLogin({ clientLoginState, loginResponse, password });
                if (!loginResult)
                    throw new Error("Login failed");
                const r2 = yield httpRequest({
                    method: "POST",
                    url: this.host + "login/2",
                    responseType: "text",
                    requestBodyString: JSON.stringify({ finishLoginRequest: loginResult.finishLoginRequest, loginSession }),
                });
                if (r2.status !== 200)
                    throw new Error("Login failed: " + r2.statusText);
                cb(null);
            }
            catch (e) {
                cb(e);
            }
        });
    }
    logout(cb) {
        httpRequest({
            method: "POST",
            url: this.host + "logout",
            responseType: "text",
        }).then(result => {
            if (result.status === 200 || result.status === 204) {
                cb(null);
            }
            else {
                cb(new Error("Logout failed: " + result.statusText));
            }
        }, e => cb(e));
    }
    // -------------------------------------------------------------------------
    // Update polling
    // -------------------------------------------------------------------------
    getUpdatedTiddlers(_syncer, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.offline)
                return callback(null);
            try {
                if (!this.initialLoadDone) {
                    // Fetch full list + current lastSeq in parallel on first load
                    const [[listOk, listErr, listResult], [updOk, updErr, updResult]] = yield Promise.all([
                        this.recipeRequest({ method: "GET", url: "/list.json" }),
                        this.recipeRequest({ method: "GET", url: "/updates", queryParams: { since: "0" } }),
                    ]);
                    if (!listOk)
                        throw asRequestError("Failed to fetch tiddler list", listErr);
                    if (!updOk)
                        throw asRequestError("Failed to fetch updates", updErr);
                    const list = listResult.responseJSON;
                    const upd = updResult.responseJSON;
                    this.setLastSeq(upd.lastSeq);
                    this.initialLoadDone = true;
                    callback(null, { modifications: list.map(t => t.title), deletions: [] });
                }
                else {
                    const [ok, err, result] = yield this.recipeRequest({
                        method: "GET",
                        url: "/updates",
                        queryParams: { since: this.lastSeq },
                    });
                    if (!ok)
                        throw asRequestError("Failed to fetch updates", err);
                    const upd = result.responseJSON;
                    this.setLastSeq(upd.lastSeq);
                    callback(null, { modifications: upd.modifications, deletions: upd.deletions });
                }
            }
            catch (e) {
                callback(e);
            }
        });
    }
    // -------------------------------------------------------------------------
    // Batch operations (new API)
    // -------------------------------------------------------------------------
    loadTiddlers(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const { titles, onNext, onDone, onError } = options;
            try {
                const results = yield this.batchOp("read", { titles });
                for (const item of results) {
                    if (!item)
                        continue;
                    this.setTiddlerInfo(item.fields.title, item.info.readFrom, typeof item.fields.revision === "string" ? item.fields.revision : undefined);
                    onNext(item.fields);
                }
                onDone();
            }
            catch (e) {
                onError(e);
            }
        });
    }
    saveTiddlers(options) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            const { tiddlers, onNext, onDone, onError } = options;
            // Tiddlers that are read-only on the server, the server-managed story
            // list and local state tiddlers are never uploaded; mark them as saved
            // locally so the syncer stops retrying (and stays quiet for anon users).
            const markSavedLocally = (tiddler) => {
                const title = tiddler.fields.title;
                this.setTiddlerInfo(title, null, "");
                onNext(title, { bag: "", revision: "", title }, "");
            };
            const tiddlersToSave = tiddlers.filter(tiddler => {
                const title = tiddler.fields.title;
                if (this.isReadOnly || title === "$:/StoryList" || this.isStateTiddler(title)) {
                    markSavedLocally(tiddler);
                    return false;
                }
                return true;
            });
            if (!tiddlersToSave.length)
                return onDone();
            try {
                const results = yield this.batchOp("save", {
                    tiddlers: tiddlersToSave.map(t => t.getFieldStrings()),
                });
                for (const item of results) {
                    const bag = (_b = (_a = item.info.writeTo) !== null && _a !== void 0 ? _a : item.info.readFrom) !== null && _b !== void 0 ? _b : "";
                    this.setTiddlerInfo(item.title, bag || null, (_c = item.revision) !== null && _c !== void 0 ? _c : "");
                    if ((_d = $tw.browserStorage) === null || _d === void 0 ? void 0 : _d.isEnabled())
                        $tw.browserStorage.removeTiddlerFromLocalStorage(item.title);
                    onNext(item.title, { bag, revision: (_e = item.revision) !== null && _e !== void 0 ? _e : "", title: item.title }, (_f = item.revision) !== null && _f !== void 0 ? _f : "");
                }
                onDone();
            }
            catch (e) {
                onError(e);
            }
        });
    }
    deleteTiddlers(options) {
        return __awaiter(this, void 0, void 0, function* () {
            const { titles, onNext, onDone, onError } = options;
            try {
                const results = yield this.batchOp("delete", { titles });
                for (const item of results) {
                    this.clearTiddlerInfo(item.title);
                    onNext(item.title);
                }
                onDone();
            }
            catch (e) {
                onError(e);
            }
        });
    }
    // -------------------------------------------------------------------------
    // Single-tiddler operations (fallback for older server versions)
    // -------------------------------------------------------------------------
    saveTiddler(tiddler, callback) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e, _f;
            const title = tiddler.fields.title;
            if (title === "$:/StoryList" || this.isReadOnly || this.isStateTiddler(title))
                return callback(null);
            try {
                const results = yield this.batchOp("save", { tiddlers: [tiddler.getFieldStrings()] });
                const item = results[0];
                if (!item)
                    return callback(new Error("No result returned"));
                const bag = (_b = (_a = item.info.writeTo) !== null && _a !== void 0 ? _a : item.info.readFrom) !== null && _b !== void 0 ? _b : "";
                this.setTiddlerInfo(title, bag || null, (_c = item.revision) !== null && _c !== void 0 ? _c : "");
                if ((_d = $tw.browserStorage) === null || _d === void 0 ? void 0 : _d.isEnabled())
                    $tw.browserStorage.removeTiddlerFromLocalStorage(title);
                callback(null, { bag, revision: (_e = item.revision) !== null && _e !== void 0 ? _e : "", title }, (_f = item.revision) !== null && _f !== void 0 ? _f : "");
            }
            catch (e) {
                callback(e);
            }
        });
    }
    loadTiddler(title, callback, _options) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const results = yield this.batchOp("read", { titles: [title] });
                const item = results[0];
                if (!item)
                    return callback(null, null);
                this.setTiddlerInfo(title, item.info.readFrom, typeof item.fields.revision === "string" ? item.fields.revision : undefined);
                callback(null, item.fields);
            }
            catch (e) {
                callback(e);
            }
        });
    }
    deleteTiddler(title, callback, _options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.isReadOnly)
                return callback(null);
            try {
                const results = yield this.batchOp("delete", { titles: [title] });
                const item = results[0];
                if (!item)
                    return callback(new Error("No result returned"));
                this.clearTiddlerInfo(title);
                callback(null, null);
            }
            catch (e) {
                callback(e);
            }
        });
    }
    // -------------------------------------------------------------------------
    // HTTP helpers
    // -------------------------------------------------------------------------
    batchOp(op, body) {
        return __awaiter(this, void 0, void 0, function* () {
            const [ok, err, result] = yield this.recipeRequest({
                method: "PUT",
                url: "/batch/" + op,
                requestBodyString: JSON.stringify(body),
                headers: { "content-type": "application/json" },
            });
            if (!ok)
                throw err;
            if (!result.responseJSON)
                throw new Error("No response JSON from batch/" + op);
            return result.responseJSON;
        });
    }
    recipeRequest(options) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!options.url.startsWith("/"))
                throw new Error("URL must start with /");
            const isDevMode = this.isDevMode;
            return httpRequest(Object.assign(Object.assign({}, options), { responseType: "blob", url: this.host + "recipe/" + encodeURIComponent(this.recipe) + options.url })).then((e) => __awaiter(this, void 0, void 0, function* () {
                if (!e.ok)
                    return [false, requestFailure(e.status, e.headers.get("x-reason")), Object.assign(Object.assign({}, e), { responseJSON: undefined })];
                let responseString;
                if (e.headers.get("x-gzip-stream") === "yes") {
                    responseString = yield new Promise((resolve) => {
                        let s = "";
                        const gz = new fflate.AsyncGunzip((err, chunk, final) => {
                            if (err)
                                return;
                            s += fflate.strFromU8(chunk);
                            if (final)
                                resolve(s);
                        });
                        if (isDevMode)
                            gz.onmember = m => console.log("gunzip member", m);
                        readBlobAsArrayBuffer(e.response).then(buf => {
                            gz.push(new Uint8Array(buf));
                            gz.push(new Uint8Array(0), true);
                        });
                    });
                }
                else {
                    responseString = fflate.strFromU8(new Uint8Array(yield readBlobAsArrayBuffer(e.response)));
                }
                return [true, undefined, Object.assign(Object.assign({}, e), { responseJSON: e.status === 200 ? tryParseJSON(responseString) : undefined })];
            }), e => [false, new NetworkError(e), undefined]);
        });
    }
}
// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function tryParseJSON(s) {
    try {
        return JSON.parse(s);
    }
    catch (e) {
        console.error("JSON parse error", e);
        return undefined;
    }
}
function httpRequest(options) {
    return new Promise((resolve, reject) => {
        options.method = options.method.toUpperCase();
        const url = new URL(options.url, location.href);
        paramsInput(options.queryParams).forEach((v, k) => url.searchParams.append(k, v));
        const headers = new Headers(options.headers || {});
        const request = new XMLHttpRequest();
        request.responseType = options.responseType;
        request.open(options.method, url, true);
        if (!headers.has("content-type"))
            headers.set("content-type", "application/x-www-form-urlencoded; charset=UTF-8");
        if (!headers.has("x-requested-with"))
            headers.set("x-requested-with", "TiddlyWiki");
        headers.set("accept", "application/json");
        headers.forEach((v, k) => request.setRequestHeader(k, v));
        request.onreadystatechange = function () {
            var _a;
            if (this.readyState !== 4)
                return;
            const h = new Headers();
            (_a = request.getAllResponseHeaders()) === null || _a === void 0 ? void 0 : _a.trim().split(/[\r\n]+/).forEach(line => {
                var _a;
                const parts = line.split(": ");
                const key = (_a = parts.shift()) === null || _a === void 0 ? void 0 : _a.toLowerCase();
                if (key)
                    h.append(key, parts.join(": "));
            });
            resolve({ ok: this.status >= 200 && this.status < 300, status: this.status, statusText: this.statusText, response: this.response, headers: h });
        };
        request.send(options.requestBodyString);
    });
    function paramsInput(input) {
        if (!input)
            return new URLSearchParams();
        if (input instanceof URLSearchParams)
            return input;
        if (Array.isArray(input) || typeof input === "string")
            return new URLSearchParams(input);
        const params = new URLSearchParams();
        for (const key in input) {
            if (Object.prototype.hasOwnProperty.call(input, key)) {
                params.append(key, input[key]);
            }
        }
        return params;
    }
}
function readBlobAsArrayBuffer(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error("Error reading blob"));
        reader.readAsArrayBuffer(blob);
    });
}
// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
if ($tw.browser && document.location.protocol.startsWith("http")) {
    exports.adaptorClass = MultiWikiClientAdaptor;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmV3LW11bHRpd2lraWNsaWVudGFkYXB0b3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbmV3LW11bHRpd2lraWNsaWVudGFkYXB0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7R0FnQkc7QUFFSCxrRUFBa0U7QUFDbEUsWUFBWSxDQUFDOzs7Ozs7Ozs7OztBQXVLYiw4RUFBOEU7QUFDOUUsWUFBWTtBQUNaLDhFQUE4RTtBQUU5RSxNQUFNLG1CQUFtQixHQUFHLGdDQUFnQyxDQUFDO0FBQzdELE1BQU0sb0JBQW9CLEdBQUcscUJBQXFCLENBQUM7QUFDbkQsTUFBTSxxQkFBcUIsR0FBRyxrQ0FBa0MsQ0FBQztBQUNqRSxNQUFNLG1CQUFtQixHQUFHLG1DQUFtQyxDQUFDO0FBQ2hFLE1BQU0sd0JBQXdCLEdBQUcsa0RBQWtELENBQUM7QUFDcEYsTUFBTSx3QkFBd0IsR0FBRywyQkFBMkIsQ0FBQztBQUM3RCxNQUFNLGlCQUFpQixHQUFHLHVDQUF1QyxDQUFDO0FBQ2xFLE1BQU0sc0JBQXNCLEdBQUcsNENBQTRDLENBQUM7QUE0QzVFOzs7NkVBRzZFO0FBQzdFLE1BQU0sWUFBYSxTQUFRLEtBQUs7SUFFL0IsWUFBWSxLQUFjO1FBQ3pCLEtBQUssQ0FBQyxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUYvRCxtQkFBYyxHQUFHLElBQUksQ0FBQztRQUdyQixJQUFJLENBQUMsSUFBSSxHQUFHLGNBQWMsQ0FBQztJQUM1QixDQUFDO0NBQ0Q7QUFFRDtpRkFDaUY7QUFDakYsU0FBUyxjQUFjLENBQUMsT0FBZSxFQUFFLEtBQWM7SUFDdEQsT0FBTyxDQUFDLEtBQWtELGFBQWxELEtBQUssdUJBQUwsS0FBSyxDQUErQyxjQUFjO1FBQ3pFLENBQUMsQ0FBQyxJQUFJLFlBQVksQ0FB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RCxPQUFPLE1BQU0sQ0FBQztJQUNmLENBQUM7QUFDRixDQUFDO0FBRUQsU0FBUyxxQkFBcUIsQ0FBQyxJQUFVO0lBQ3hDLE9BQU8sSUFBSSxPQUFPLENBQWMsQ0FBQyxPQUFPLEVBQUUsTUFBTSxFQUFFLEVBQUU7UUFDbkQsTUFBTSxNQUFNLEdBQUcsSUFBSSxVQUFVLEVBQUUsQ0FBQztRQUNoQyxNQUFNLENBQUMsTUFBTSxHQUFHLEdBQUcsRUFBRSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsTUFBcUIsQ0FBQyxDQUFDO1FBQzVELE1BQU0sQ0FBQyxPQUFPLEdBQUcsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxDQUFDLG9CQUFvQixDQUFDLENBQUMsQ0FBQztRQUMvRCxNQUFNLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDaEMsQ0FBQyxDQUFDLENBQUM7QUFDSixDQUFDO0FBRUQsOEVBQThFO0FBQzlFLFNBQVM7QUFDVCw4RUFBOEU7QUFFOUUsSUFBSSxHQUFHLENBQUMsT0FBTyxJQUFJLFFBQVEsQ0FBQyxRQUFRLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsRUFBRSxDQUFDO0lBQ2xFLE9BQU8sQ0FBQyxZQUFZLEdBQUcsc0JBQXNCLENBQUM7QUFDL0MsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qXFxcbnRpdGxlOiAkOi9wbHVnaW5zL213cy9jbGllbnQvbmV3LW11bHRpd2lraWNsaWVudGFkYXB0b3IuanNcbnR5cGU6IGFwcGxpY2F0aW9uL2phdmFzY3JpcHRcbm1vZHVsZS10eXBlOiBzeW5jYWRhcHRvclxuXG5BIHN5bmMgYWRhcHRvciBtb2R1bGUgZm9yIHN5bmNocm9uaXNpbmcgd2l0aCBNdWx0aVdpa2lTZXJ2ZXItY29tcGF0aWJsZSBzZXJ2ZXJzLiBcblxuSXQgaGFzIHRocmVlIGtleSBhcmVhcyBvZiBjb25jZXJuOlxuXG4qIEJhc2ljIG9wZXJhdGlvbnMgbGlrZSBwdXQsIGdldCwgYW5kIGRlbGV0ZSBhIHRpZGRsZXIgb24gdGhlIHNlcnZlclxuKiBSZWFsIHRpbWUgdXBkYXRlcyBmcm9tIHRoZSBzZXJ2ZXIgKGhhbmRsZWQgYnkgU1NFKVxuKiBCYWdzIGFuZCByZWNpcGVzLCB3aGljaCBhcmUgdW5rbm93biB0byB0aGUgc3luY2VyXG5cbkEga2V5IGFzcGVjdCBvZiB0aGUgZGVzaWduIGlzIHRoYXQgdGhlIHN5bmNlciBuZXZlciBvdmVybGFwcyBiYXNpYyBzZXJ2ZXIgb3BlcmF0aW9uczsgaXQgd2FpdHMgZm9yIHRoZVxucHJldmlvdXMgb3BlcmF0aW9uIHRvIGNvbXBsZXRlIGJlZm9yZSBzZW5kaW5nIGEgbmV3IG9uZS5cblxuXFwqL1xuXG4vLyB0aGUgYmxhbmsgbGluZSBpcyBpbXBvcnRhbnQsIGFuZCBzbyBpcyB0aGUgZm9sbG93aW5nIHVzZSBzdHJpY3RcblwidXNlIHN0cmljdFwiO1xuXG4vLyBpbXBvcnQgdHlwZSB7IFNlcnZlckV2ZW50c01hcCB9IGZyb20gJ0B0aWRkbHl3aWtpL2V2ZW50cyc7XG4vLyBpbXBvcnQgdHlwZSB7IFpvZFJvdXRlLCBXaWtpU3RhdHVzUm91dGVzLCBXaWtpUmVjaXBlUm91dGVzIH0gZnJvbSAnQHRpZGRseXdpa2kvbXdzJztcbi8vIGltcG9ydCB0eXBlIHsgem9kIH0gZnJvbSAnQHRpZGRseXdpa2kvc2VydmVyJztcbmltcG9ydCB0eXBlIHsgU3luY2VyLCBUaWRkbGVyLCBUaWRkbGVyRmllbGRzLCBXaWtpIH0gZnJvbSAndGlkZGx5d2lraSc7XG5cbi8vIGltcG9ydCB7fSBmcm9tIFwiQHRpZGRseXdpa2kvbXdzLXByaXNtYVwiO1xuZGVjbGFyZSBnbG9iYWwgeyBjb25zdCBmZmxhdGU6IHR5cGVvZiBpbXBvcnQoXCIuL2ZmbGF0ZVwiKTsgfVxuZGVjbGFyZSBjb25zdCBzZWxmOiBuZXZlcjtcbmRlY2xhcmUgY29uc3QgcmVxdWlyZTogKGlkOiBzdHJpbmcpID0+IGFueTtcblxuZGVjbGFyZSBjbGFzcyBMb2dnZXIge1xuXHRjb25zdHJ1Y3Rvcihjb21wb25lbnROYW1lOiBhbnksIG9wdGlvbnM6IGFueSk7XG5cdGNvbXBvbmVudE5hbWU6IGFueTtcblx0Y29sb3VyOiBhbnk7XG5cdGVuYWJsZTogYW55O1xuXHRzYXZlOiBhbnk7XG5cdHNhdmVMaW1pdDogYW55O1xuXHRzYXZlQnVmZmVyTG9nZ2VyOiB0aGlzO1xuXHRidWZmZXI6IHN0cmluZztcblx0YWxlcnRDb3VudDogbnVtYmVyO1xuXHRzZXRTYXZlQnVmZmVyKGxvZ2dlcjogYW55KTogdm9pZDtcblx0bG9nKC4uLmFyZ3M6IGFueVtdKTogYW55O1xuXHRnZXRCdWZmZXIoKTogc3RyaW5nO1xuXHR0YWJsZSh2YWx1ZTogYW55KTogdm9pZDtcblx0YWxlcnQoLi4uYXJnczogYW55W10pOiB2b2lkO1xuXHRjbGVhckFsZXJ0cygpOiB2b2lkO1xufVxuXG5kZWNsYXJlIG1vZHVsZSAndGlkZGx5d2lraScge1xuXHRleHBvcnQgaW50ZXJmYWNlIFN5bmNlcjxBRD4ge1xuXHRcdHdpa2k6IFdpa2k7XG5cdFx0bG9nZ2VyOiBMb2dnZXI7XG5cdFx0dGlkZGxlckluZm86IFJlY29yZDxzdHJpbmcsIHtcblx0XHRcdGNoYW5nZUNvdW50OiBudW1iZXIsXG5cdFx0XHRhZGFwdG9ySW5mbzogQUQsXG5cdFx0XHRyZXZpc2lvbjogc3RyaW5nLFxuXHRcdFx0dGltZXN0YW1wTGFzdFNhdmVkOiBEYXRlXG5cdFx0fT47XG5cdFx0ZW5xdWV1ZUxvYWRUaWRkbGVyKHRpdGxlOiBzdHJpbmcpOiB2b2lkO1xuXHRcdHN0b3JlVGlkZGxlcih0aWRkbGVyOiBUaWRkbGVyKTogdm9pZDtcblx0XHRwcm9jZXNzVGFza1F1ZXVlKCk6IHZvaWQ7XG5cdFx0c3luY0Zyb21TZXJ2ZXIoKTogdm9pZDtcblx0fVxuXHRpbnRlcmZhY2UgSVRpZGRseVdpa2kge1xuXHRcdGJyb3dzZXJTdG9yYWdlOiBhbnk7XG5cdH1cbn1cblxudHlwZSBTZXJ2ZXJTdGF0dXNDYWxsYmFjayA9IChcblx0ZXJyOiBhbnksXG5cdC8qKiBcblx0ICogJDovc3RhdHVzL0lzTG9nZ2VkSW4gbW9zdGx5IGFwcGVhcnMgYWxvbmdzaWRlIHRoZSB1c2VybmFtZSBcblx0ICogb3Igb3RoZXIgbG9naW4tY29uZGl0aW9uYWwgYmVoYXZpb3IuIFxuXHQgKi9cblx0aXNMb2dnZWRJbj86IGJvb2xlYW4sXG5cdC8qKlxuXHQgKiAkOi9zdGF0dXMvVXNlck5hbWUgaXMgc3RpbGwgdXNlZCBmb3IgdGhpbmdzIGxpa2UgZHJhZnRzIGV2ZW4gaWYgdGhlIFxuXHQgKiB1c2VyIGlzbid0IGxvZ2dlZCBpbiwgYWx0aG91Z2ggdGhlIHVzZXJuYW1lIGlzIGxlc3MgbGlrZWx5IHRvIGJlIHNob3duIFxuXHQgKiB0byB0aGUgdXNlci4gXG5cdCAqL1xuXHR1c2VybmFtZT86IHN0cmluZyxcblx0LyoqIFxuXHQgKiAkOi9zdGF0dXMvSXNSZWFkT25seSBwdXRzIHRoZSBVSSBpbiByZWFkb25seSBtb2RlLCBcblx0ICogYnV0IGRvZXMgbm90IHByZXZlbnQgYXV0b21hdGljIGNoYW5nZXMgZnJvbSBhdHRlbXB0aW5nIHRvIHNhdmUuIFxuXHQgKi9cblx0aXNSZWFkT25seT86IGJvb2xlYW4sXG5cdC8qKiBcblx0ICogJDovc3RhdHVzL0lzQW5vbnltb3VzIGRvZXMgbm90IGFwcGVhciBhbnl3aGVyZSBpbiB0aGUgVFc1IHJlcG8hIFxuXHQgKiBTbyBpdCBoYXMgbm8gYXBwYXJlbnQgcHVycG9zZS4gXG5cdCAqL1xuXHRpc0Fub255bW91cz86IGJvb2xlYW5cbikgPT4gdm9pZFxuXG5pbnRlcmZhY2UgU3luY0FkYXB0b3I8QUQ+IHtcblx0bmFtZT86IHN0cmluZztcblxuXHRpc1JlYWR5PygpOiBib29sZWFuO1xuXG5cdHJlZ2lzdGVyU3luY2VyPyhzeW5jZXI6IFN5bmNlcjxBRD4pOiB2b2lkO1xuXG5cdGdldFN0YXR1cz8oXG5cdFx0Y2I6IFNlcnZlclN0YXR1c0NhbGxiYWNrXG5cdCk6IHZvaWQ7XG5cblx0Z2V0U2tpbm55VGlkZGxlcnM/KFxuXHRcdGNiOiAoZXJyOiBhbnksIHRpZGRsZXJGaWVsZHM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz5bXSkgPT4gdm9pZFxuXHQpOiB2b2lkO1xuXHRnZXRVcGRhdGVkVGlkZGxlcnM/KFxuXHRcdHN5bmNlcjogU3luY2VyPEFEPixcblx0XHRjYjogKFxuXHRcdFx0ZXJyOiBhbnksXG5cdFx0XHQvKiogQXJyYXlzIG9mIHRpdGxlcyB0aGF0IGhhdmUgYmVlbiBtb2RpZmllZCBvciBkZWxldGVkICovXG5cdFx0XHR1cGRhdGVzPzogeyBtb2RpZmljYXRpb25zOiBzdHJpbmdbXSwgZGVsZXRpb25zOiBzdHJpbmdbXSB9XG5cdFx0KSA9PiB2b2lkXG5cdCk6IHZvaWQ7XG5cblx0LyoqIFxuXHQgKiB1c2VkIHRvIG92ZXJyaWRlIHRoZSBkZWZhdWx0IFN5bmNlciBnZXRUaWRkbGVyUmV2aXNpb24gYmVoYXZpb3Jcblx0ICogb2YgcmV0dXJuaW5nIHRoZSByZXZpc2lvbiBmaWVsZFxuXHQgKiBcblx0ICovXG5cdGdldFRpZGRsZXJSZXZpc2lvbj8odGl0bGU6IHN0cmluZyk6IHN0cmluZztcblx0LyoqIFxuXHQgKiB1c2VkIHRvIGdldCB0aGUgYWRhcHRlciBpbmZvIGZyb20gYSB0aWRkbGVyIGluIHNpdHVhdGlvbnNcblx0ICogb3RoZXIgdGhhbiB0aGUgc2F2ZVRpZGRsZXIgY2FsbGJhY2tcblx0ICovXG5cdGdldFRpZGRsZXJJbmZvKHRpZGRsZXI6IFRpZGRsZXIpOiBBRCB8IHVuZGVmaW5lZDtcblxuXHRzYXZlVGlkZGxlcihcblx0XHR0aWRkbGVyOiBhbnksXG5cdFx0Y2I6IChcblx0XHRcdGVycjogYW55LFxuXHRcdFx0YWRhcHRvckluZm8/OiBBRCxcblx0XHRcdHJldmlzaW9uPzogc3RyaW5nXG5cdFx0KSA9PiB2b2lkLFxuXHRcdGV4dHJhOiB7IHRpZGRsZXJJbmZvOiBTeW5jZXJUaWRkbGVySW5mbzxBRD4gfVxuXHQpOiB2b2lkO1xuXG5cdHNhdmVUaWRkbGVycz8ob3B0aW9uczoge1xuXHRcdHN5bmNlcjogU3luY2VyPEFEPixcblx0XHR0aWRkbGVyczogVGlkZGxlcltdLFxuXHRcdG9uTmV4dDogKHRpdGxlOiBzdHJpbmcsIGFkYXB0b3JJbmZvOiBhbnksIHJldmlzaW9uOiBzdHJpbmcpID0+IHZvaWQsXG5cdFx0b25Eb25lOiAoKSA9PiB2b2lkLFxuXHRcdG9uRXJyb3I6IChlcnI6IEVycm9yKSA9PiB2b2lkXG5cdH0pOiB2b2lkO1xuXG5cdGxvYWRUaWRkbGVycz8ob3B0aW9uczoge1xuXHRcdHN5bmNlcjogU3luY2VyPEFEPixcblx0XHR0aXRsZXM6IHN0cmluZ1tdLFxuXHRcdG9uTmV4dDogKHRpZGRsZXJGaWVsZHM6IFRpZGRsZXJGaWVsZHMpID0+IHZvaWQsXG5cdFx0b25Eb25lOiAoKSA9PiB2b2lkLFxuXHRcdG9uRXJyb3I6IChlcnI6IEVycm9yKSA9PiB2b2lkXG5cdH0pOiB2b2lkO1xuXG5cdGRlbGV0ZVRpZGRsZXJzPyhvcHRpb25zOiB7XG5cdFx0c3luY2VyOiBTeW5jZXI8QUQ+LFxuXHRcdHRpdGxlczogc3RyaW5nW10sXG5cdFx0b25OZXh0OiAodGl0bGU6IHN0cmluZykgPT4gdm9pZCxcblx0XHRvbkRvbmU6ICgpID0+IHZvaWQsXG5cdFx0b25FcnJvcjogKGVycjogRXJyb3IpID0+IHZvaWRcblx0fSk6IHZvaWQ7XG5cblx0c2V0TG9nZ2VyU2F2ZUJ1ZmZlcj86IChsb2dnZXJGb3JTYXZpbmc6IExvZ2dlcikgPT4gdm9pZDtcblx0ZGlzcGxheUxvZ2luUHJvbXB0PyhzeW5jZXI6IFN5bmNlcjxBRD4pOiB2b2lkO1xuXHRsb2dpbj8odXNlcm5hbWU6IHN0cmluZywgcGFzc3dvcmQ6IHN0cmluZywgY2I6IChlcnI6IGFueSkgPT4gdm9pZCk6IHZvaWQ7XG5cdGxvZ291dD8oY2I6IChlcnI6IGFueSkgPT4gdm9pZCk6IGFueTtcblxufVxuaW50ZXJmYWNlIFN5bmNlclRpZGRsZXJJbmZvPEFEPiB7XG5cdC8qKiB0aGlzIGNvbWVzIGZyb20gdGhlIHdpa2kgY2hhbmdlQ291bnQgcmVjb3JkICovXG5cdGNoYW5nZUNvdW50OiBudW1iZXI7XG5cdC8qKiBBZGFwdGVyIGluZm8gcmV0dXJuZWQgYnkgdGhlIHN5bmMgYWRhcHRlciAqL1xuXHRhZGFwdG9ySW5mbzogQUQ7XG5cdC8qKiBSZXZpc2lvbiByZXR1cm4gYnkgdGhlIHN5bmMgYWRhcHRlciAqL1xuXHRyZXZpc2lvbjogc3RyaW5nO1xuXHQvKiogVGltZXN0YW1wIHNldCBpbiB0aGUgY2FsbGJhY2sgb2YgdGhlIHByZXZpb3VzIHNhdmUgKi9cblx0dGltZXN0YW1wTGFzdFNhdmVkOiBEYXRlO1xufVxuXG5kZWNsYXJlIGNvbnN0ICR0dzogYW55O1xuXG5kZWNsYXJlIGNvbnN0IGV4cG9ydHM6IHtcblx0YWRhcHRvckNsYXNzOiB0eXBlb2YgTXVsdGlXaWtpQ2xpZW50QWRhcHRvcjtcbn07XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gQ29uc3RhbnRzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY29uc3QgQ09ORklHX0hPU1RfVElERExFUiA9IFwiJDovY29uZmlnL211bHRpd2lraWNsaWVudC9ob3N0XCI7XG5jb25zdCBERUZBVUxUX0hPU1RfVElERExFUiA9IFwiJHByb3RvY29sJC8vJGhvc3QkL1wiO1xuY29uc3QgQ09ORklHX1JFQ0lQRV9USURETEVSID0gXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L3JlY2lwZVwiO1xuY29uc3QgSVNfREVWX01PREVfVElERExFUiA9IFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L2Rldi1tb2RlXCI7XG5jb25zdCBMQVNUX1JFVklTSU9OX0lEX1RJRERMRVIgPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC9yZWNpcGUvbGFzdF9yZXZpc2lvbl9pZFwiO1xuY29uc3QgTVdDX1NUQVRFX1RJRERMRVJfUFJFRklYID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvXCI7XG5jb25zdCBCQUdfU1RBVEVfVElERExFUiA9IFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L3RpZGRsZXJzL2JhZ1wiO1xuY29uc3QgUkVWSVNJT05fU1RBVEVfVElERExFUiA9IFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L3RpZGRsZXJzL3JldmlzaW9uXCI7XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gVHlwZXNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pbnRlcmZhY2UgTVdTQWRhcHRvckluZm8ge1xuXHRiYWc6IHN0cmluZztcblx0cmV2aXNpb246IHN0cmluZztcblx0dGl0bGU6IHN0cmluZztcbn1cblxuLy8gT1BBUVVFIChQQUtFKSBjbGllbnQgc3VyZmFjZSBwcm92aWRlZCBieSB0aGUgYnVuZGxlZCBsaWJyYXJ5IHRpZGRsZXJcbmludGVyZmFjZSBPcGFxdWVDbGllbnQge1xuXHRyZWFkeTogUHJvbWlzZTx1bmtub3duPjtcblx0Y2xpZW50OiB7XG5cdFx0c3RhcnRMb2dpbihhcmdzOiB7IHBhc3N3b3JkOiBzdHJpbmcgfSk6IHsgY2xpZW50TG9naW5TdGF0ZTogdW5rbm93bjsgc3RhcnRMb2dpblJlcXVlc3Q6IHN0cmluZyB9O1xuXHRcdGZpbmlzaExvZ2luKGFyZ3M6IHsgY2xpZW50TG9naW5TdGF0ZTogdW5rbm93bjsgbG9naW5SZXNwb25zZTogc3RyaW5nOyBwYXNzd29yZDogc3RyaW5nIH0pOlxuXHRcdFx0eyBmaW5pc2hMb2dpblJlcXVlc3Q6IHN0cmluZzsgc2Vzc2lvbktleTogc3RyaW5nIH0gfCBudWxsO1xuXHR9O1xufVxuXG4vLyBTdGF0dXMgcmVzcG9uc2UgZnJvbSBHRVQgL3JlY2lwZS86aWQvc3RhdHVzXG5pbnRlcmZhY2UgUmVjaXBlU3RhdHVzIHtcblx0aXNBZG1pbjogYm9vbGVhbjtcblx0dXNlcl9pZDogc3RyaW5nO1xuXHR1c2VybmFtZTogc3RyaW5nO1xuXHRpc0xvZ2dlZEluOiBib29sZWFuO1xuXHR0ZW1wbGF0ZTogeyB0eXBlOiBzdHJpbmc7IGRlZmluaXRpb246IHVua25vd247IHBhcmFtZXRlcnM6IHVua25vd24gfTtcblx0YmFnczogeyBiYWdfaWQ6IHN0cmluZzsgYmFnX25hbWU6IHN0cmluZzsgaXNfd3JpdGFibGU6IGJvb2xlYW47IHByaW9yaXR5OiBudW1iZXI7IGNhblVzZXJXcml0ZTogYm9vbGVhbjsgaW5mbzogdW5rbm93biB9W107XG59XG5cbi8vIFRpZGRsZXJJbmZvIGZyb20gcmVzb2x2ZXJcbmludGVyZmFjZSBUaWRkbGVySW5mbyB7XG5cdHRpdGxlOiBzdHJpbmc7XG5cdHdyaXRlVG86IHN0cmluZyB8IG51bGw7XG5cdHJlYWRGcm9tOiBzdHJpbmcgfCBudWxsO1xuXHRleGlzdHNJbjogc3RyaW5nW107XG5cdGNhbldyaXRlOiBib29sZWFuO1xufVxuXG50eXBlIEJhdGNoTXV0YXRpb25SZXN1bHQgPSB7IHRpdGxlOiBzdHJpbmc7IGluZm86IFRpZGRsZXJJbmZvOyByZXZpc2lvbj86IHN0cmluZyB9O1xudHlwZSBCYXRjaFJlYWRSZXN1bHQgPSB7IGZpZWxkczogUmVjb3JkPHN0cmluZywgYW55PiAmIHsgdGl0bGU6IHN0cmluZyB9OyBpbmZvOiBUaWRkbGVySW5mbyB9IHwgbnVsbDtcblxuLyoqIEEgcmVxdWVzdCB0aGF0IG5ldmVyIHJlYWNoZWQgdGhlIHNlcnZlcjogdGhlIGNvbm5lY3Rpb24gaXMgZ29uZSwgdGhlXG4gKiAgc2VydmVyIGlzIHVucmVhY2hhYmxlLCB0aGUgcmVxdWVzdCB3YXMgYWJvcnRlZCBvciB0aW1lZCBvdXQuIE1hcmtlZCBzbyB0aGF0XG4gKiAgdGhlIHN5bmNlciBjYW4gdGVsbCBcIm5ldHdvcmsgZ29uZVwiIGZyb20gXCJzZXJ2ZXIgYW5zd2VyZWQgd2l0aCBhbiBlcnJvclwiLFxuICogIHdoaWNoIGlzIHdoYXQgZGVjaWRlcyBiZXR3ZWVuIHRoZSBjb25uZWN0aW9uIGFsZXJ0IGFuZCB0aGUgbm9ybWFsIG9uZS4gKi9cbmNsYXNzIE5ldHdvcmtFcnJvciBleHRlbmRzIEVycm9yIHtcblx0aXNOZXR3b3JrRXJyb3IgPSB0cnVlO1xuXHRjb25zdHJ1Y3RvcihjYXVzZTogdW5rbm93bikge1xuXHRcdHN1cGVyKGNhdXNlIGluc3RhbmNlb2YgRXJyb3IgPyBjYXVzZS5tZXNzYWdlIDogU3RyaW5nKGNhdXNlKSk7XG5cdFx0dGhpcy5uYW1lID0gXCJOZXR3b3JrRXJyb3JcIjtcblx0fVxufVxuXG4vKiogQSByZXF1ZXN0IGVycm9yIHRoYXQga2VlcHMgdGhlIGRpc3RpbmN0aW9uOiBhIGZhaWxlZCByZXF1ZXN0IHRoYXQgbmV2ZXJcbiAqICByZWFjaGVkIHRoZSBzZXJ2ZXIgc3RheXMgYSBOZXR3b3JrRXJyb3IsIGFuIGFuc3dlcmVkIG9uZSBiZWNvbWVzIGFuIEVycm9yLiAqL1xuZnVuY3Rpb24gYXNSZXF1ZXN0RXJyb3IobWVzc2FnZTogc3RyaW5nLCBjYXVzZTogdW5rbm93bikge1xuXHRyZXR1cm4gKGNhdXNlIGFzIHsgaXNOZXR3b3JrRXJyb3I/OiBib29sZWFuIH0gfCB1bmRlZmluZWQpPy5pc05ldHdvcmtFcnJvclxuXHRcdD8gbmV3IE5ldHdvcmtFcnJvcihuZXcgRXJyb3IobWVzc2FnZSkpXG5cdFx0OiBuZXcgRXJyb3IobWVzc2FnZSk7XG59XG5cbi8qKiBodHRwUmVxdWVzdCBhbnN3ZXJzIGluc3RlYWQgb2YgcmVqZWN0aW5nLCBhbmQgYSByZXF1ZXN0IHRoYXQgbmV2ZXIgcmVhY2hlZFxuICogIHRoZSBzZXJ2ZXIgY29tZXMgYmFjayB3aXRoIHN0YXR1cyAwOiB0aGUgbmV0d29yayBpcyBnb25lLCBub3QgdGhlIHNlcnZlclxuICogIGNvbXBsYWluaW5nLiBFdmVyeSBvdGhlciBzdGF0dXMgaXMgYSByZWFsIGFuc3dlciBhbmQgc3RheXMgYW4gRXJyb3IuICovXG5mdW5jdGlvbiByZXF1ZXN0RmFpbHVyZShzdGF0dXM6IG51bWJlciwgcmVhc29uOiBzdHJpbmcgfCBudWxsKSB7XG5cdHJldHVybiBzdGF0dXMgPT09IDBcblx0XHQ/IG5ldyBOZXR3b3JrRXJyb3IobmV3IEVycm9yKFwiU2VydmVyIHVucmVhY2hhYmxlXCIpKVxuXHRcdDogbmV3IEVycm9yKGBTZXJ2ZXIgcmV0dXJuZWQgJHtzdGF0dXN9OiAke3JlYXNvbiA/PyBcIihubyByZWFzb24pXCJ9YCk7XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gQWRhcHRvclxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNsYXNzIE11bHRpV2lraUNsaWVudEFkYXB0b3IgaW1wbGVtZW50cyBTeW5jQWRhcHRvcjxNV1NBZGFwdG9ySW5mbz4ge1xuXHRuYW1lID0gXCJtdWx0aXdpa2ljbGllbnRcIjtcblxuXHRwcml2YXRlIHdpa2k6IFdpa2k7XG5cdHByaXZhdGUgaG9zdDogc3RyaW5nO1xuXHRwcml2YXRlIHJlY2lwZTogc3RyaW5nO1xuXHRwcml2YXRlIGlzRGV2TW9kZTogYm9vbGVhbjtcblx0cHJpdmF0ZSBsb2dnZXI6IExvZ2dlcjtcblx0cHJpdmF0ZSBzeW5jZXI6IFN5bmNlcjxNV1NBZGFwdG9ySW5mbz4gfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIGlzTG9nZ2VkSW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBpc1JlYWRPbmx5ID0gdHJ1ZTtcblx0cHJpdmF0ZSBvZmZsaW5lID0gZmFsc2U7XG5cdHByaXZhdGUgdXNlcm5hbWUgPSBcIlwiO1xuXHRlcnJvcjogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSBsYXN0U2VxID0gXCIwXCI7XG5cdHByaXZhdGUgaW5pdGlhbExvYWREb25lID0gZmFsc2U7XG5cdC8qKiB0aXRsZSDihpIgYmFnIG5hbWUsIHBvcHVsYXRlZCBvbiBsb2FkL3NhdmUgKi9cblx0cHJpdmF0ZSB0aWRkbGVyQmFnID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0LyoqIHRpdGxlIOKGkiByZXZpc2lvbiwgcG9wdWxhdGVkIG9uIHNhdmUgKi9cblx0cHJpdmF0ZSB0aWRkbGVyUmV2aXNpb24gPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKG9wdGlvbnM6IHsgd2lraTogV2lraSB9KSB7XG5cdFx0dGhpcy53aWtpID0gb3B0aW9ucy53aWtpO1xuXHRcdHRoaXMuaG9zdCA9IHRoaXMuZ2V0SG9zdCgpO1xuXHRcdHRoaXMucmVjaXBlID0gdGhpcy53aWtpLmdldFRpZGRsZXJUZXh0KENPTkZJR19SRUNJUEVfVElERExFUiwgXCJcIikhO1xuXHRcdHRoaXMuaXNEZXZNb2RlID0gdGhpcy53aWtpLmdldFRpZGRsZXJUZXh0KElTX0RFVl9NT0RFX1RJRERMRVIpID09PSBcInllc1wiO1xuXHRcdHRoaXMubGFzdFNlcSA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChMQVNUX1JFVklTSU9OX0lEX1RJRERMRVIsIFwiMFwiKSE7XG5cdFx0dGhpcy5pbml0aWFsTG9hZERvbmUgPSB0aGlzLmxhc3RTZXEgIT09IFwiMFwiO1xuXHRcdHRoaXMubG9nZ2VyID0gbmV3ICR0dy51dGlscy5Mb2dnZXIoXCJNdWx0aVdpa2lDbGllbnRBZGFwdG9yXCIpO1xuXHR9XG5cblx0aXNSZWFkeSgpIHsgcmV0dXJuIHRydWU7IH1cblxuXHRzZXRMb2dnZXJTYXZlQnVmZmVyKGxvZ2dlcjogTG9nZ2VyKSB7IHRoaXMubG9nZ2VyLnNldFNhdmVCdWZmZXIobG9nZ2VyKTsgfVxuXG5cdHJlZ2lzdGVyU3luY2VyKHN5bmNlcjogU3luY2VyPE1XU0FkYXB0b3JJbmZvPikgeyB0aGlzLnN5bmNlciA9IHN5bmNlcjsgfVxuXG5cdHByaXZhdGUgaXNTdGF0ZVRpZGRsZXIodGl0bGU6IHN0cmluZykge1xuXHRcdHJldHVybiB0aXRsZS5zdGFydHNXaXRoKE1XQ19TVEFURV9USURETEVSX1BSRUZJWCk7XG5cdH1cblxuXHRwcml2YXRlIHNldFRpZGRsZXJJbmZvKHRpdGxlOiBzdHJpbmcsIGJhZzogc3RyaW5nIHwgbnVsbCwgcmV2aXNpb24/OiBzdHJpbmcpIHtcblx0XHRpZiAoYmFnKSB7XG5cdFx0XHR0aGlzLnRpZGRsZXJCYWcuc2V0KHRpdGxlLCBiYWcpO1xuXHRcdFx0dGhpcy53aWtpLnNldFRleHQoQkFHX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCBiYWcsIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudGlkZGxlckJhZy5kZWxldGUodGl0bGUpO1xuXHRcdFx0dGhpcy53aWtpLnNldFRleHQoQkFHX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCB1bmRlZmluZWQsIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdFx0fVxuXHRcdGlmIChyZXZpc2lvbikge1xuXHRcdFx0dGhpcy50aWRkbGVyUmV2aXNpb24uc2V0KHRpdGxlLCByZXZpc2lvbik7XG5cdFx0XHR0aGlzLndpa2kuc2V0VGV4dChSRVZJU0lPTl9TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgcmV2aXNpb24sIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjbGVhclRpZGRsZXJJbmZvKHRpdGxlOiBzdHJpbmcpIHtcblx0XHR0aGlzLnRpZGRsZXJCYWcuZGVsZXRlKHRpdGxlKTtcblx0XHR0aGlzLnRpZGRsZXJSZXZpc2lvbi5kZWxldGUodGl0bGUpO1xuXHRcdHRoaXMud2lraS5zZXRUZXh0KEJBR19TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgdW5kZWZpbmVkLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHRcdHRoaXMud2lraS5zZXRUZXh0KFJFVklTSU9OX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCB1bmRlZmluZWQsIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIHNldExhc3RTZXEoc2VxOiBzdHJpbmcpIHtcblx0XHR0aGlzLmxhc3RTZXEgPSBzZXE7XG5cdFx0dGhpcy53aWtpLnNldFRleHQoTEFTVF9SRVZJU0lPTl9JRF9USURETEVSLCBudWxsLCBcInRleHRcIiwgc2VxLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHR9XG5cblx0Z2V0VGlkZGxlclJldmlzaW9uKHRpdGxlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oUkVWSVNJT05fU1RBVEVfVElERExFUiwgdGl0bGUpID8/IFwiXCI7XG5cdH1cblxuXHRnZXRUaWRkbGVySW5mbyh0aWRkbGVyOiBUaWRkbGVyKTogTVdTQWRhcHRvckluZm8gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHRpdGxlID0gdGlkZGxlci5maWVsZHMudGl0bGUgYXMgc3RyaW5nO1xuXHRcdGNvbnN0IGJhZyA9IHRoaXMud2lraS5leHRyYWN0VGlkZGxlckRhdGFJdGVtKEJBR19TVEFURV9USURETEVSLCB0aXRsZSkgPz8gdGhpcy50aWRkbGVyQmFnLmdldCh0aXRsZSk7XG5cdFx0Y29uc3QgcmV2aXNpb24gPSB0aGlzLndpa2kuZXh0cmFjdFRpZGRsZXJEYXRhSXRlbShSRVZJU0lPTl9TVEFURV9USURETEVSLCB0aXRsZSkgPz8gdGhpcy50aWRkbGVyUmV2aXNpb24uZ2V0KHRpdGxlKTtcblx0XHRyZXR1cm4gYmFnICYmIHJldmlzaW9uID8geyBiYWcsIHJldmlzaW9uLCB0aXRsZSB9IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRIb3N0KCkge1xuXHRcdGxldCB0ZXh0ID0gdGhpcy53aWtpLmdldFRpZGRsZXJUZXh0KENPTkZJR19IT1NUX1RJRERMRVIsIERFRkFVTFRfSE9TVF9USURETEVSKSE7XG5cdFx0W1xuXHRcdFx0eyBuYW1lOiBcInByb3RvY29sXCIsIHZhbHVlOiBkb2N1bWVudC5sb2NhdGlvbi5wcm90b2NvbCB9LFxuXHRcdFx0eyBuYW1lOiBcImhvc3RcIiwgICAgIHZhbHVlOiBkb2N1bWVudC5sb2NhdGlvbi5ob3N0IH0sXG5cdFx0XHR7IG5hbWU6IFwicGF0aG5hbWVcIiwgdmFsdWU6IGRvY3VtZW50LmxvY2F0aW9uLnBhdGhuYW1lIH0sXG5cdFx0XS5mb3JFYWNoKCh7IG5hbWUsIHZhbHVlIH0pID0+IHtcblx0XHRcdHRleHQgPSAkdHcudXRpbHMucmVwbGFjZVN0cmluZyh0ZXh0LCBuZXcgUmVnRXhwKFwiXFxcXCRcIiArIG5hbWUgKyBcIlxcXFwkXCIsIFwibWdcIiksIHZhbHVlKTtcblx0XHR9KTtcblx0XHRyZXR1cm4gdGV4dDtcblx0fVxuXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gU3RhdHVzXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRhc3luYyBnZXRTdGF0dXMoY2FsbGJhY2s6IFNlcnZlclN0YXR1c0NhbGxiYWNrKSB7XG5cdFx0Y29uc3QgW29rLCAsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3QoeyBtZXRob2Q6IFwiR0VUXCIsIHVybDogXCIvc3RhdHVzXCIgfSk7XG5cdFx0aWYgKCFvayAmJiByZXN1bHQ/LnN0YXR1cyA9PT0gMCkge1xuXHRcdFx0dGhpcy5vZmZsaW5lID0gdHJ1ZTtcblx0XHRcdHRoaXMuaXNMb2dnZWRJbiA9IGZhbHNlO1xuXHRcdFx0dGhpcy5pc1JlYWRPbmx5ID0gdHJ1ZTtcblx0XHRcdHRoaXMudXNlcm5hbWUgPSBcIihvZmZsaW5lKVwiO1xuXHRcdFx0dGhpcy5lcnJvciA9IFwiVGhlIHdlYnBhZ2UgaXMgZm9yYmlkZGVuIGZyb20gY29udGFjdGluZyB0aGUgc2VydmVyLlwiO1xuXHRcdH0gZWxzZSBpZiAob2spIHtcblx0XHRcdGNvbnN0IHN0YXR1cyA9IHJlc3VsdCEucmVzcG9uc2VKU09OIGFzIFJlY2lwZVN0YXR1cztcblx0XHRcdHRoaXMub2ZmbGluZSA9IGZhbHNlO1xuXHRcdFx0dGhpcy5lcnJvciA9IG51bGw7XG5cdFx0XHR0aGlzLmlzTG9nZ2VkSW4gPSBzdGF0dXM/LmlzTG9nZ2VkSW4gPz8gZmFsc2U7XG5cdFx0XHR0aGlzLnVzZXJuYW1lID0gc3RhdHVzPy51c2VybmFtZSA/PyBcIihhbm9uKVwiO1xuXHRcdFx0dGhpcy5pc1JlYWRPbmx5ID0gIShzdGF0dXM/LmJhZ3M/LnNvbWUoYiA9PiBiLmNhblVzZXJXcml0ZSkgPz8gZmFsc2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVycm9yID0gYFNlcnZlciBlcnJvciAke3Jlc3VsdD8uc3RhdHVzfWA7XG5cdFx0fVxuXHRcdGNhbGxiYWNrKHRoaXMuZXJyb3IsIHRoaXMuaXNMb2dnZWRJbiwgdGhpcy51c2VybmFtZSwgdGhpcy5pc1JlYWRPbmx5LCBmYWxzZSk7XG5cdH1cblxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vIExvZ2luIC8gTG9nb3V0XG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gUGVyZm9ybXMgYW4gT1BBUVVFIChQQUtFKSBwYXNzd29yZCBsb2dpbiBhZ2FpbnN0IHRoZSBNV1Mgc2Vzc2lvblxuXHQvLyBlbmRwb2ludHMuIE9uIHN1Y2Nlc3MgdGhlIHNlcnZlciBzZXRzIGEgc2Vzc2lvbiBjb29raWUgKHBhdGggXCIvXCIpIHdoaWNoXG5cdC8vIGF1dG9tYXRpY2FsbHkgYXV0aG9yaXNlcyBhbGwgc3Vic2VxdWVudCBzYW1lLW9yaWdpbiByZXF1ZXN0cywgc28gdGhlXG5cdC8vIHdpa2kgYmVjb21lcyB3cml0YWJsZSB3aXRob3V0IHZpc2l0aW5nIHRoZSAvbG9naW4gcGFnZS5cblxuXHRhc3luYyBsb2dpbih1c2VybmFtZTogc3RyaW5nLCBwYXNzd29yZDogc3RyaW5nLCBjYjogKGVycjogYW55KSA9PiB2b2lkKSB7XG5cdFx0Y29uc3Qgb3BhcXVlID0gcmVxdWlyZShcIiQ6L3BsdWdpbnMvbXdzL2NsaWVudC9saWJyYXJ5L29wYXF1ZVwiKSBhcyBPcGFxdWVDbGllbnQ7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghdXNlcm5hbWUgfHwgIXBhc3N3b3JkKSB0aHJvdyBuZXcgRXJyb3IoXCJVc2VybmFtZSBhbmQgcGFzc3dvcmQgYXJlIHJlcXVpcmVkXCIpO1xuXHRcdFx0YXdhaXQgb3BhcXVlLnJlYWR5O1xuXHRcdFx0Y29uc3QgeyBjbGllbnRMb2dpblN0YXRlLCBzdGFydExvZ2luUmVxdWVzdCB9ID0gb3BhcXVlLmNsaWVudC5zdGFydExvZ2luKHsgcGFzc3dvcmQgfSk7XG5cdFx0XHRjb25zdCByMSA9IGF3YWl0IGh0dHBSZXF1ZXN0KHtcblx0XHRcdFx0bWV0aG9kOiBcIlBPU1RcIixcblx0XHRcdFx0dXJsOiB0aGlzLmhvc3QgKyBcImxvZ2luLzFcIixcblx0XHRcdFx0cmVzcG9uc2VUeXBlOiBcInRleHRcIixcblx0XHRcdFx0cmVxdWVzdEJvZHlTdHJpbmc6IEpTT04uc3RyaW5naWZ5KHsgdXNlcm5hbWUsIHN0YXJ0TG9naW5SZXF1ZXN0IH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAocjEuc3RhdHVzICE9PSAyMDApIHRocm93IG5ldyBFcnJvcihcIkxvZ2luIGZhaWxlZDogXCIgKyByMS5zdGF0dXNUZXh0KTtcblx0XHRcdGNvbnN0IHsgbG9naW5SZXNwb25zZSwgbG9naW5TZXNzaW9uIH0gPSBKU09OLnBhcnNlKHIxLnJlc3BvbnNlIGFzIHN0cmluZyk7XG5cdFx0XHRjb25zdCBsb2dpblJlc3VsdCA9IG9wYXF1ZS5jbGllbnQuZmluaXNoTG9naW4oeyBjbGllbnRMb2dpblN0YXRlLCBsb2dpblJlc3BvbnNlLCBwYXNzd29yZCB9KTtcblx0XHRcdGlmICghbG9naW5SZXN1bHQpIHRocm93IG5ldyBFcnJvcihcIkxvZ2luIGZhaWxlZFwiKTtcblx0XHRcdGNvbnN0IHIyID0gYXdhaXQgaHR0cFJlcXVlc3Qoe1xuXHRcdFx0XHRtZXRob2Q6IFwiUE9TVFwiLFxuXHRcdFx0XHR1cmw6IHRoaXMuaG9zdCArIFwibG9naW4vMlwiLFxuXHRcdFx0XHRyZXNwb25zZVR5cGU6IFwidGV4dFwiLFxuXHRcdFx0XHRyZXF1ZXN0Qm9keVN0cmluZzogSlNPTi5zdHJpbmdpZnkoeyBmaW5pc2hMb2dpblJlcXVlc3Q6IGxvZ2luUmVzdWx0LmZpbmlzaExvZ2luUmVxdWVzdCwgbG9naW5TZXNzaW9uIH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAocjIuc3RhdHVzICE9PSAyMDApIHRocm93IG5ldyBFcnJvcihcIkxvZ2luIGZhaWxlZDogXCIgKyByMi5zdGF0dXNUZXh0KTtcblx0XHRcdGNiKG51bGwpO1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkge1xuXHRcdFx0Y2IoZSk7XG5cdFx0fVxuXHR9XG5cblx0bG9nb3V0KGNiOiAoZXJyOiBhbnkpID0+IHZvaWQpIHtcblx0XHRodHRwUmVxdWVzdCh7XG5cdFx0XHRtZXRob2Q6IFwiUE9TVFwiLFxuXHRcdFx0dXJsOiB0aGlzLmhvc3QgKyBcImxvZ291dFwiLFxuXHRcdFx0cmVzcG9uc2VUeXBlOiBcInRleHRcIixcblx0XHR9KS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gMjAwIHx8IHJlc3VsdC5zdGF0dXMgPT09IDIwNCkge1xuXHRcdFx0XHRjYihudWxsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNiKG5ldyBFcnJvcihcIkxvZ291dCBmYWlsZWQ6IFwiICsgcmVzdWx0LnN0YXR1c1RleHQpKTtcblx0XHRcdH1cblx0XHR9LCBlID0+IGNiKGUpKTtcblx0fVxuXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gVXBkYXRlIHBvbGxpbmdcblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGFzeW5jIGdldFVwZGF0ZWRUaWRkbGVycyhcblx0XHRfc3luY2VyOiBTeW5jZXI8TVdTQWRhcHRvckluZm8+LFxuXHRcdGNhbGxiYWNrOiAoZXJyOiBhbnksIHVwZGF0ZXM/OiB7IG1vZGlmaWNhdGlvbnM6IHN0cmluZ1tdOyBkZWxldGlvbnM6IHN0cmluZ1tdIH0pID0+IHZvaWRcblx0KSB7XG5cdFx0aWYgKHRoaXMub2ZmbGluZSkgcmV0dXJuIGNhbGxiYWNrKG51bGwpO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIXRoaXMuaW5pdGlhbExvYWREb25lKSB7XG5cdFx0XHRcdC8vIEZldGNoIGZ1bGwgbGlzdCArIGN1cnJlbnQgbGFzdFNlcSBpbiBwYXJhbGxlbCBvbiBmaXJzdCBsb2FkXG5cdFx0XHRcdGNvbnN0IFtbbGlzdE9rLCBsaXN0RXJyLCBsaXN0UmVzdWx0XSwgW3VwZE9rLCB1cGRFcnIsIHVwZFJlc3VsdF1dID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdHRoaXMucmVjaXBlUmVxdWVzdCh7IG1ldGhvZDogXCJHRVRcIiwgdXJsOiBcIi9saXN0Lmpzb25cIiB9KSxcblx0XHRcdFx0XHR0aGlzLnJlY2lwZVJlcXVlc3QoeyBtZXRob2Q6IFwiR0VUXCIsIHVybDogXCIvdXBkYXRlc1wiLCBxdWVyeVBhcmFtczogeyBzaW5jZTogXCIwXCIgfSB9KSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGlmICghbGlzdE9rKSB0aHJvdyBhc1JlcXVlc3RFcnJvcihcIkZhaWxlZCB0byBmZXRjaCB0aWRkbGVyIGxpc3RcIiwgbGlzdEVycik7XG5cdFx0XHRcdGlmICghdXBkT2spIHRocm93IGFzUmVxdWVzdEVycm9yKFwiRmFpbGVkIHRvIGZldGNoIHVwZGF0ZXNcIiwgdXBkRXJyKTtcblx0XHRcdFx0Y29uc3QgbGlzdCA9IGxpc3RSZXN1bHQhLnJlc3BvbnNlSlNPTiBhcyBUaWRkbGVySW5mb1tdO1xuXHRcdFx0XHRjb25zdCB1cGQgPSB1cGRSZXN1bHQhLnJlc3BvbnNlSlNPTiBhcyB7IG1vZGlmaWNhdGlvbnM6IHN0cmluZ1tdOyBkZWxldGlvbnM6IHN0cmluZ1tdOyBsYXN0U2VxOiBzdHJpbmcgfTtcblx0XHRcdFx0dGhpcy5zZXRMYXN0U2VxKHVwZC5sYXN0U2VxKTtcblx0XHRcdFx0dGhpcy5pbml0aWFsTG9hZERvbmUgPSB0cnVlO1xuXHRcdFx0XHRjYWxsYmFjayhudWxsLCB7IG1vZGlmaWNhdGlvbnM6IGxpc3QubWFwKHQgPT4gdC50aXRsZSksIGRlbGV0aW9uczogW10gfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBbb2ssIGVyciwgcmVzdWx0XSA9IGF3YWl0IHRoaXMucmVjaXBlUmVxdWVzdCh7XG5cdFx0XHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdFx0XHRcdHVybDogXCIvdXBkYXRlc1wiLFxuXHRcdFx0XHRcdHF1ZXJ5UGFyYW1zOiB7IHNpbmNlOiB0aGlzLmxhc3RTZXEgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghb2spIHRocm93IGFzUmVxdWVzdEVycm9yKFwiRmFpbGVkIHRvIGZldGNoIHVwZGF0ZXNcIiwgZXJyKTtcblx0XHRcdFx0Y29uc3QgdXBkID0gcmVzdWx0IS5yZXNwb25zZUpTT04gYXMgeyBtb2RpZmljYXRpb25zOiBzdHJpbmdbXTsgZGVsZXRpb25zOiBzdHJpbmdbXTsgbGFzdFNlcTogc3RyaW5nIH07XG5cdFx0XHRcdHRoaXMuc2V0TGFzdFNlcSh1cGQubGFzdFNlcSk7XG5cdFx0XHRcdGNhbGxiYWNrKG51bGwsIHsgbW9kaWZpY2F0aW9uczogdXBkLm1vZGlmaWNhdGlvbnMsIGRlbGV0aW9uczogdXBkLmRlbGV0aW9ucyB9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlOiBhbnkpIHtcblx0XHRcdGNhbGxiYWNrKGUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gQmF0Y2ggb3BlcmF0aW9ucyAobmV3IEFQSSlcblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGFzeW5jIGxvYWRUaWRkbGVycyhvcHRpb25zOiB7XG5cdFx0c3luY2VyOiBTeW5jZXI8TVdTQWRhcHRvckluZm8+O1xuXHRcdHRpdGxlczogc3RyaW5nW107XG5cdFx0b25OZXh0OiAoZmllbGRzOiBUaWRkbGVyRmllbGRzKSA9PiB2b2lkO1xuXHRcdG9uRG9uZTogKCkgPT4gdm9pZDtcblx0XHRvbkVycm9yOiAoZXJyOiBFcnJvcikgPT4gdm9pZDtcblx0fSkge1xuXHRcdGNvbnN0IHsgdGl0bGVzLCBvbk5leHQsIG9uRG9uZSwgb25FcnJvciB9ID0gb3B0aW9ucztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuYmF0Y2hPcDxCYXRjaFJlYWRSZXN1bHRbXT4oXCJyZWFkXCIsIHsgdGl0bGVzIH0pO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHJlc3VsdHMpIHtcblx0XHRcdFx0aWYgKCFpdGVtKSBjb250aW51ZTtcblx0XHRcdFx0dGhpcy5zZXRUaWRkbGVySW5mbyhpdGVtLmZpZWxkcy50aXRsZSwgaXRlbS5pbmZvLnJlYWRGcm9tLCB0eXBlb2YgaXRlbS5maWVsZHMucmV2aXNpb24gPT09IFwic3RyaW5nXCIgPyBpdGVtLmZpZWxkcy5yZXZpc2lvbiA6IHVuZGVmaW5lZCk7XG5cdFx0XHRcdG9uTmV4dChpdGVtLmZpZWxkcyBhcyBUaWRkbGVyRmllbGRzKTtcblx0XHRcdH1cblx0XHRcdG9uRG9uZSgpO1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkgeyBvbkVycm9yKGUpOyB9XG5cdH1cblxuXHRhc3luYyBzYXZlVGlkZGxlcnMob3B0aW9uczoge1xuXHRcdHN5bmNlcjogU3luY2VyPE1XU0FkYXB0b3JJbmZvPjtcblx0XHR0aWRkbGVyczogVGlkZGxlcltdO1xuXHRcdG9uTmV4dDogKHRpdGxlOiBzdHJpbmcsIGFkYXB0b3JJbmZvOiBNV1NBZGFwdG9ySW5mbywgcmV2aXNpb246IHN0cmluZykgPT4gdm9pZDtcblx0XHRvbkRvbmU6ICgpID0+IHZvaWQ7XG5cdFx0b25FcnJvcjogKGVycjogRXJyb3IpID0+IHZvaWQ7XG5cdH0pIHtcblx0XHRjb25zdCB7IHRpZGRsZXJzLCBvbk5leHQsIG9uRG9uZSwgb25FcnJvciB9ID0gb3B0aW9ucztcblx0XHQvLyBUaWRkbGVycyB0aGF0IGFyZSByZWFkLW9ubHkgb24gdGhlIHNlcnZlciwgdGhlIHNlcnZlci1tYW5hZ2VkIHN0b3J5XG5cdFx0Ly8gbGlzdCBhbmQgbG9jYWwgc3RhdGUgdGlkZGxlcnMgYXJlIG5ldmVyIHVwbG9hZGVkOyBtYXJrIHRoZW0gYXMgc2F2ZWRcblx0XHQvLyBsb2NhbGx5IHNvIHRoZSBzeW5jZXIgc3RvcHMgcmV0cnlpbmcgKGFuZCBzdGF5cyBxdWlldCBmb3IgYW5vbiB1c2VycykuXG5cdFx0Y29uc3QgbWFya1NhdmVkTG9jYWxseSA9ICh0aWRkbGVyOiBUaWRkbGVyKSA9PiB7XG5cdFx0XHRjb25zdCB0aXRsZSA9IHRpZGRsZXIuZmllbGRzLnRpdGxlIGFzIHN0cmluZztcblx0XHRcdHRoaXMuc2V0VGlkZGxlckluZm8odGl0bGUsIG51bGwsIFwiXCIpO1xuXHRcdFx0b25OZXh0KHRpdGxlLCB7IGJhZzogXCJcIiwgcmV2aXNpb246IFwiXCIsIHRpdGxlIH0sIFwiXCIpO1xuXHRcdH07XG5cdFx0Y29uc3QgdGlkZGxlcnNUb1NhdmUgPSB0aWRkbGVycy5maWx0ZXIodGlkZGxlciA9PiB7XG5cdFx0XHRjb25zdCB0aXRsZSA9IHRpZGRsZXIuZmllbGRzLnRpdGxlIGFzIHN0cmluZztcblx0XHRcdGlmICh0aGlzLmlzUmVhZE9ubHkgfHwgdGl0bGUgPT09IFwiJDovU3RvcnlMaXN0XCIgfHwgdGhpcy5pc1N0YXRlVGlkZGxlcih0aXRsZSkpIHtcblx0XHRcdFx0bWFya1NhdmVkTG9jYWxseSh0aWRkbGVyKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cdFx0aWYgKCF0aWRkbGVyc1RvU2F2ZS5sZW5ndGgpIHJldHVybiBvbkRvbmUoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuYmF0Y2hPcDxCYXRjaE11dGF0aW9uUmVzdWx0W10+KFwic2F2ZVwiLCB7XG5cdFx0XHRcdHRpZGRsZXJzOiB0aWRkbGVyc1RvU2F2ZS5tYXAodCA9PiB0LmdldEZpZWxkU3RyaW5ncygpKSxcblx0XHRcdH0pO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHJlc3VsdHMpIHtcblx0XHRcdFx0Y29uc3QgYmFnID0gaXRlbS5pbmZvLndyaXRlVG8gPz8gaXRlbS5pbmZvLnJlYWRGcm9tID8/IFwiXCI7XG5cdFx0XHRcdHRoaXMuc2V0VGlkZGxlckluZm8oaXRlbS50aXRsZSwgYmFnIHx8IG51bGwsIGl0ZW0ucmV2aXNpb24gPz8gXCJcIik7XG5cdFx0XHRcdGlmICgkdHcuYnJvd3NlclN0b3JhZ2U/LmlzRW5hYmxlZCgpKSAkdHcuYnJvd3NlclN0b3JhZ2UucmVtb3ZlVGlkZGxlckZyb21Mb2NhbFN0b3JhZ2UoaXRlbS50aXRsZSk7XG5cdFx0XHRcdG9uTmV4dChpdGVtLnRpdGxlLCB7IGJhZywgcmV2aXNpb246IGl0ZW0ucmV2aXNpb24gPz8gXCJcIiwgdGl0bGU6IGl0ZW0udGl0bGUgfSwgaXRlbS5yZXZpc2lvbiA/PyBcIlwiKTtcblx0XHRcdH1cblx0XHRcdG9uRG9uZSgpO1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkgeyBvbkVycm9yKGUpOyB9XG5cdH1cblxuXHRhc3luYyBkZWxldGVUaWRkbGVycyhvcHRpb25zOiB7XG5cdFx0c3luY2VyOiBTeW5jZXI8TVdTQWRhcHRvckluZm8+O1xuXHRcdHRpdGxlczogc3RyaW5nW107XG5cdFx0b25OZXh0OiAodGl0bGU6IHN0cmluZykgPT4gdm9pZDtcblx0XHRvbkRvbmU6ICgpID0+IHZvaWQ7XG5cdFx0b25FcnJvcjogKGVycjogRXJyb3IpID0+IHZvaWQ7XG5cdH0pIHtcblx0XHRjb25zdCB7IHRpdGxlcywgb25OZXh0LCBvbkRvbmUsIG9uRXJyb3IgfSA9IG9wdGlvbnM7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmJhdGNoT3A8QmF0Y2hNdXRhdGlvblJlc3VsdFtdPihcImRlbGV0ZVwiLCB7IHRpdGxlcyB9KTtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiByZXN1bHRzKSB7XG5cdFx0XHRcdHRoaXMuY2xlYXJUaWRkbGVySW5mbyhpdGVtLnRpdGxlKTtcblx0XHRcdFx0b25OZXh0KGl0ZW0udGl0bGUpO1xuXHRcdFx0fVxuXHRcdFx0b25Eb25lKCk7XG5cdFx0fSBjYXRjaCAoZTogYW55KSB7IG9uRXJyb3IoZSk7IH1cblx0fVxuXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gU2luZ2xlLXRpZGRsZXIgb3BlcmF0aW9ucyAoZmFsbGJhY2sgZm9yIG9sZGVyIHNlcnZlciB2ZXJzaW9ucylcblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGFzeW5jIHNhdmVUaWRkbGVyKFxuXHRcdHRpZGRsZXI6IFRpZGRsZXIsXG5cdFx0Y2FsbGJhY2s6IChlcnI6IGFueSwgYWRhcHRvckluZm8/OiBNV1NBZGFwdG9ySW5mbywgcmV2aXNpb24/OiBzdHJpbmcpID0+IHZvaWRcblx0KSB7XG5cdFx0Y29uc3QgdGl0bGUgPSB0aWRkbGVyLmZpZWxkcy50aXRsZSBhcyBzdHJpbmc7XG5cdFx0aWYgKHRpdGxlID09PSBcIiQ6L1N0b3J5TGlzdFwiIHx8IHRoaXMuaXNSZWFkT25seSB8fCB0aGlzLmlzU3RhdGVUaWRkbGVyKHRpdGxlKSkgcmV0dXJuIGNhbGxiYWNrKG51bGwpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5iYXRjaE9wPEJhdGNoTXV0YXRpb25SZXN1bHRbXT4oXCJzYXZlXCIsIHsgdGlkZGxlcnM6IFt0aWRkbGVyLmdldEZpZWxkU3RyaW5ncygpXSB9KTtcblx0XHRcdGNvbnN0IGl0ZW0gPSByZXN1bHRzWzBdO1xuXHRcdFx0aWYgKCFpdGVtKSByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKFwiTm8gcmVzdWx0IHJldHVybmVkXCIpKTtcblx0XHRcdGNvbnN0IGJhZyA9IGl0ZW0uaW5mby53cml0ZVRvID8/IGl0ZW0uaW5mby5yZWFkRnJvbSA/PyBcIlwiO1xuXHRcdFx0dGhpcy5zZXRUaWRkbGVySW5mbyh0aXRsZSwgYmFnIHx8IG51bGwsIGl0ZW0ucmV2aXNpb24gPz8gXCJcIik7XG5cdFx0XHRpZiAoJHR3LmJyb3dzZXJTdG9yYWdlPy5pc0VuYWJsZWQoKSkgJHR3LmJyb3dzZXJTdG9yYWdlLnJlbW92ZVRpZGRsZXJGcm9tTG9jYWxTdG9yYWdlKHRpdGxlKTtcblx0XHRcdGNhbGxiYWNrKG51bGwsIHsgYmFnLCByZXZpc2lvbjogaXRlbS5yZXZpc2lvbiA/PyBcIlwiLCB0aXRsZSB9LCBpdGVtLnJldmlzaW9uID8/IFwiXCIpO1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkgeyBjYWxsYmFjayhlKTsgfVxuXHR9XG5cblx0YXN5bmMgbG9hZFRpZGRsZXIodGl0bGU6IHN0cmluZywgY2FsbGJhY2s6IChlcnI6IGFueSwgZmllbGRzPzogYW55KSA9PiB2b2lkLCBfb3B0aW9uczogYW55KSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmJhdGNoT3A8QmF0Y2hSZWFkUmVzdWx0W10+KFwicmVhZFwiLCB7IHRpdGxlczogW3RpdGxlXSB9KTtcblx0XHRcdGNvbnN0IGl0ZW0gPSByZXN1bHRzWzBdO1xuXHRcdFx0aWYgKCFpdGVtKSByZXR1cm4gY2FsbGJhY2sobnVsbCwgbnVsbCk7XG5cdFx0XHR0aGlzLnNldFRpZGRsZXJJbmZvKHRpdGxlLCBpdGVtLmluZm8ucmVhZEZyb20sIHR5cGVvZiBpdGVtLmZpZWxkcy5yZXZpc2lvbiA9PT0gXCJzdHJpbmdcIiA/IGl0ZW0uZmllbGRzLnJldmlzaW9uIDogdW5kZWZpbmVkKTtcblx0XHRcdGNhbGxiYWNrKG51bGwsIGl0ZW0uZmllbGRzKTtcblx0XHR9IGNhdGNoIChlOiBhbnkpIHsgY2FsbGJhY2soZSk7IH1cblx0fVxuXG5cdGFzeW5jIGRlbGV0ZVRpZGRsZXIodGl0bGU6IHN0cmluZywgY2FsbGJhY2s6IChlcnI6IGFueSwgYWRhcHRvckluZm8/OiBhbnkpID0+IHZvaWQsIF9vcHRpb25zOiBhbnkpIHtcblx0XHRpZiAodGhpcy5pc1JlYWRPbmx5KSByZXR1cm4gY2FsbGJhY2sobnVsbCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmJhdGNoT3A8QmF0Y2hNdXRhdGlvblJlc3VsdFtdPihcImRlbGV0ZVwiLCB7IHRpdGxlczogW3RpdGxlXSB9KTtcblx0XHRcdGNvbnN0IGl0ZW0gPSByZXN1bHRzWzBdO1xuXHRcdFx0aWYgKCFpdGVtKSByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKFwiTm8gcmVzdWx0IHJldHVybmVkXCIpKTtcblx0XHRcdHRoaXMuY2xlYXJUaWRkbGVySW5mbyh0aXRsZSk7XG5cdFx0XHRjYWxsYmFjayhudWxsLCBudWxsKTtcblx0XHR9IGNhdGNoIChlOiBhbnkpIHsgY2FsbGJhY2soZSk7IH1cblx0fVxuXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gSFRUUCBoZWxwZXJzXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIGFzeW5jIGJhdGNoT3A8VD4ob3A6IHN0cmluZywgYm9keTogUmVjb3JkPHN0cmluZywgYW55Pik6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IFtvaywgZXJyLCByZXN1bHRdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdG1ldGhvZDogXCJQVVRcIixcblx0XHRcdHVybDogXCIvYmF0Y2gvXCIgKyBvcCxcblx0XHRcdHJlcXVlc3RCb2R5U3RyaW5nOiBKU09OLnN0cmluZ2lmeShib2R5KSxcblx0XHRcdGhlYWRlcnM6IHsgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcblx0XHR9KTtcblx0XHRpZiAoIW9rKSB0aHJvdyBlcnI7XG5cdFx0aWYgKCFyZXN1bHQhLnJlc3BvbnNlSlNPTikgdGhyb3cgbmV3IEVycm9yKFwiTm8gcmVzcG9uc2UgSlNPTiBmcm9tIGJhdGNoL1wiICsgb3ApO1xuXHRcdHJldHVybiByZXN1bHQhLnJlc3BvbnNlSlNPTiBhcyBUO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWNpcGVSZXF1ZXN0KG9wdGlvbnM6IHtcblx0XHRtZXRob2Q6IHN0cmluZztcblx0XHR1cmw6IHN0cmluZztcblx0XHRoZWFkZXJzPzogSGVhZGVyc0luaXQ7XG5cdFx0cXVlcnlQYXJhbXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHRcdHJlcXVlc3RCb2R5U3RyaW5nPzogc3RyaW5nO1xuXHR9KSB7XG5cdFx0aWYgKCFvcHRpb25zLnVybC5zdGFydHNXaXRoKFwiL1wiKSkgdGhyb3cgbmV3IEVycm9yKFwiVVJMIG11c3Qgc3RhcnQgd2l0aCAvXCIpO1xuXHRcdGNvbnN0IGlzRGV2TW9kZSA9IHRoaXMuaXNEZXZNb2RlO1xuXHRcdHJldHVybiBodHRwUmVxdWVzdCh7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0cmVzcG9uc2VUeXBlOiBcImJsb2JcIixcblx0XHRcdHVybDogdGhpcy5ob3N0ICsgXCJyZWNpcGUvXCIgKyBlbmNvZGVVUklDb21wb25lbnQodGhpcy5yZWNpcGUpICsgb3B0aW9ucy51cmwsXG5cdFx0fSkudGhlbihhc3luYyBlID0+IHtcblx0XHRcdGlmICghZS5vaykgcmV0dXJuIFtmYWxzZSwgcmVxdWVzdEZhaWx1cmUoZS5zdGF0dXMsIGUuaGVhZGVycy5nZXQoXCJ4LXJlYXNvblwiKSksIHsgLi4uZSwgcmVzcG9uc2VKU09OOiB1bmRlZmluZWQgfV0gYXMgY29uc3Q7XG5cblx0XHRcdGxldCByZXNwb25zZVN0cmluZzogc3RyaW5nO1xuXHRcdFx0aWYgKGUuaGVhZGVycy5nZXQoXCJ4LWd6aXAtc3RyZWFtXCIpID09PSBcInllc1wiKSB7XG5cdFx0XHRcdHJlc3BvbnNlU3RyaW5nID0gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0XHRcdGxldCBzID0gXCJcIjtcblx0XHRcdFx0XHRjb25zdCBneiA9IG5ldyBmZmxhdGUuQXN5bmNHdW56aXAoKGVyciwgY2h1bmssIGZpbmFsKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZXJyKSByZXR1cm47XG5cdFx0XHRcdFx0XHRzICs9IGZmbGF0ZS5zdHJGcm9tVTgoY2h1bmspO1xuXHRcdFx0XHRcdFx0aWYgKGZpbmFsKSByZXNvbHZlKHMpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmIChpc0Rldk1vZGUpIGd6Lm9ubWVtYmVyID0gbSA9PiBjb25zb2xlLmxvZyhcImd1bnppcCBtZW1iZXJcIiwgbSk7XG5cdFx0XHRcdFx0cmVhZEJsb2JBc0FycmF5QnVmZmVyKGUucmVzcG9uc2UgYXMgQmxvYikudGhlbihidWYgPT4ge1xuXHRcdFx0XHRcdFx0Z3oucHVzaChuZXcgVWludDhBcnJheShidWYpKTtcblx0XHRcdFx0XHRcdGd6LnB1c2gobmV3IFVpbnQ4QXJyYXkoMCksIHRydWUpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3BvbnNlU3RyaW5nID0gZmZsYXRlLnN0ckZyb21VOChuZXcgVWludDhBcnJheShhd2FpdCByZWFkQmxvYkFzQXJyYXlCdWZmZXIoZS5yZXNwb25zZSBhcyBCbG9iKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gW3RydWUsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHQuLi5lLFxuXHRcdFx0XHRyZXNwb25zZUpTT046IGUuc3RhdHVzID09PSAyMDAgPyB0cnlQYXJzZUpTT04ocmVzcG9uc2VTdHJpbmcpIDogdW5kZWZpbmVkLFxuXHRcdFx0fV0gYXMgY29uc3Q7XG5cdFx0fSwgZSA9PiBbZmFsc2UsIG5ldyBOZXR3b3JrRXJyb3IoZSksIHVuZGVmaW5lZF0gYXMgY29uc3QpO1xuXHR9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gVXRpbGl0aWVzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gdHJ5UGFyc2VKU09OKHM6IHN0cmluZykge1xuXHR0cnkgeyByZXR1cm4gSlNPTi5wYXJzZShzKTsgfSBjYXRjaCAoZSkgeyBjb25zb2xlLmVycm9yKFwiSlNPTiBwYXJzZSBlcnJvclwiLCBlKTsgcmV0dXJuIHVuZGVmaW5lZDsgfVxufVxuXG50eXBlIFBhcmFtc0lucHV0ID0gVVJMU2VhcmNoUGFyYW1zIHwgW3N0cmluZywgc3RyaW5nXVtdIHwgb2JqZWN0IHwgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5pbnRlcmZhY2UgSHR0cFJlcXVlc3RPcHRpb25zPFRZUEUgZXh0ZW5kcyBcImFycmF5YnVmZmVyXCIgfCBcImJsb2JcIiB8IFwidGV4dFwiPiB7XG5cdG1ldGhvZDogc3RyaW5nO1xuXHR1cmw6IHN0cmluZztcblx0cmVzcG9uc2VUeXBlOiBUWVBFO1xuXHRoZWFkZXJzPzogSGVhZGVyc0luaXQ7XG5cdHF1ZXJ5UGFyYW1zPzogUGFyYW1zSW5wdXQ7XG5cdHJlcXVlc3RCb2R5U3RyaW5nPzogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBodHRwUmVxdWVzdDxUWVBFIGV4dGVuZHMgXCJhcnJheWJ1ZmZlclwiIHwgXCJibG9iXCIgfCBcInRleHRcIj4ob3B0aW9uczogSHR0cFJlcXVlc3RPcHRpb25zPFRZUEU+KSB7XG5cdHJldHVybiBuZXcgUHJvbWlzZTx7XG5cdFx0b2s6IGJvb2xlYW47IHN0YXR1czogbnVtYmVyOyBzdGF0dXNUZXh0OiBzdHJpbmc7IGhlYWRlcnM6IEhlYWRlcnM7XG5cdFx0cmVzcG9uc2U6IFRZUEUgZXh0ZW5kcyBcImFycmF5YnVmZmVyXCIgPyBBcnJheUJ1ZmZlciA6IFRZUEUgZXh0ZW5kcyBcImJsb2JcIiA/IEJsb2IgOiBzdHJpbmc7XG5cdH0+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRvcHRpb25zLm1ldGhvZCA9IG9wdGlvbnMubWV0aG9kLnRvVXBwZXJDYXNlKCk7XG5cdFx0Y29uc3QgdXJsID0gbmV3IFVSTChvcHRpb25zLnVybCwgbG9jYXRpb24uaHJlZik7XG5cdFx0cGFyYW1zSW5wdXQob3B0aW9ucy5xdWVyeVBhcmFtcykuZm9yRWFjaCgodiwgaykgPT4gdXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoaywgdikpO1xuXHRcdGNvbnN0IGhlYWRlcnMgPSBuZXcgSGVhZGVycyhvcHRpb25zLmhlYWRlcnMgfHwge30pO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblx0XHRyZXF1ZXN0LnJlc3BvbnNlVHlwZSA9IG9wdGlvbnMucmVzcG9uc2VUeXBlO1xuXHRcdHJlcXVlc3Qub3BlbihvcHRpb25zLm1ldGhvZCwgdXJsLCB0cnVlKTtcblx0XHRpZiAoIWhlYWRlcnMuaGFzKFwiY29udGVudC10eXBlXCIpKSBoZWFkZXJzLnNldChcImNvbnRlbnQtdHlwZVwiLCBcImFwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZDsgY2hhcnNldD1VVEYtOFwiKTtcblx0XHRpZiAoIWhlYWRlcnMuaGFzKFwieC1yZXF1ZXN0ZWQtd2l0aFwiKSkgaGVhZGVycy5zZXQoXCJ4LXJlcXVlc3RlZC13aXRoXCIsIFwiVGlkZGx5V2lraVwiKTtcblx0XHRoZWFkZXJzLnNldChcImFjY2VwdFwiLCBcImFwcGxpY2F0aW9uL2pzb25cIik7XG5cdFx0aGVhZGVycy5mb3JFYWNoKCh2LCBrKSA9PiByZXF1ZXN0LnNldFJlcXVlc3RIZWFkZXIoaywgdikpO1xuXHRcdHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKHRoaXMucmVhZHlTdGF0ZSAhPT0gNCkgcmV0dXJuO1xuXHRcdFx0Y29uc3QgaCA9IG5ldyBIZWFkZXJzKCk7XG5cdFx0XHRyZXF1ZXN0LmdldEFsbFJlc3BvbnNlSGVhZGVycygpPy50cmltKCkuc3BsaXQoL1tcXHJcXG5dKy8pLmZvckVhY2gobGluZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHBhcnRzID0gbGluZS5zcGxpdChcIjogXCIpO1xuXHRcdFx0XHRjb25zdCBrZXkgPSBwYXJ0cy5zaGlmdCgpPy50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRpZiAoa2V5KSBoLmFwcGVuZChrZXksIHBhcnRzLmpvaW4oXCI6IFwiKSk7XG5cdFx0XHR9KTtcblx0XHRcdHJlc29sdmUoeyBvazogdGhpcy5zdGF0dXMgPj0gMjAwICYmIHRoaXMuc3RhdHVzIDwgMzAwLCBzdGF0dXM6IHRoaXMuc3RhdHVzLCBzdGF0dXNUZXh0OiB0aGlzLnN0YXR1c1RleHQsIHJlc3BvbnNlOiB0aGlzLnJlc3BvbnNlLCBoZWFkZXJzOiBoIH0pO1xuXHRcdH07XG5cdFx0cmVxdWVzdC5zZW5kKG9wdGlvbnMucmVxdWVzdEJvZHlTdHJpbmcpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBwYXJhbXNJbnB1dChpbnB1dDogUGFyYW1zSW5wdXQpIHtcblx0XHRpZiAoIWlucHV0KSByZXR1cm4gbmV3IFVSTFNlYXJjaFBhcmFtcygpO1xuXHRcdGlmIChpbnB1dCBpbnN0YW5jZW9mIFVSTFNlYXJjaFBhcmFtcykgcmV0dXJuIGlucHV0O1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGlucHV0KSB8fCB0eXBlb2YgaW5wdXQgPT09IFwic3RyaW5nXCIpIHJldHVybiBuZXcgVVJMU2VhcmNoUGFyYW1zKGlucHV0KTtcblx0XHRjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdFx0Zm9yIChjb25zdCBrZXkgaW4gaW5wdXQpIHtcblx0XHRcdGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoaW5wdXQsIGtleSkpIHtcblx0XHRcdFx0cGFyYW1zLmFwcGVuZChrZXksIChpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KVtrZXldKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHBhcmFtcztcblx0fVxufVxuXG5mdW5jdGlvbiByZWFkQmxvYkFzQXJyYXlCdWZmZXIoYmxvYjogQmxvYikge1xuXHRyZXR1cm4gbmV3IFByb21pc2U8QXJyYXlCdWZmZXI+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuXHRcdHJlYWRlci5vbmxvYWQgPSAoKSA9PiByZXNvbHZlKHJlYWRlci5yZXN1bHQgYXMgQXJyYXlCdWZmZXIpO1xuXHRcdHJlYWRlci5vbmVycm9yID0gKCkgPT4gcmVqZWN0KG5ldyBFcnJvcihcIkVycm9yIHJlYWRpbmcgYmxvYlwiKSk7XG5cdFx0cmVhZGVyLnJlYWRBc0FycmF5QnVmZmVyKGJsb2IpO1xuXHR9KTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBFeHBvcnRcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pZiAoJHR3LmJyb3dzZXIgJiYgZG9jdW1lbnQubG9jYXRpb24ucHJvdG9jb2wuc3RhcnRzV2l0aChcImh0dHBcIikpIHtcblx0ZXhwb3J0cy5hZGFwdG9yQ2xhc3MgPSBNdWx0aVdpa2lDbGllbnRBZGFwdG9yO1xufVxuIl19