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
                this.writeIsAdmin(status);
            }
            else {
                this.error = `Server error ${result === null || result === void 0 ? void 0 : result.status}`;
            }
            callback(this.error, this.isLoggedIn, this.username, this.isReadOnly, false);
        });
    }
    /** The status response is the only place where the client learns whether the
     *  user is an admin. The shell-update banner reads this tiddler to decide
     *  who may accept a new template version. */
    writeIsAdmin(status) {
        this.wiki.addTiddler({
            title: "$:/status/IsAdmin",
            text: (status === null || status === void 0 ? void 0 : status.isAdmin) ? "yes" : "no",
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
            var _a;
            const { titles, onNext, onDone, onError } = options;
            try {
                const results = yield this.batchOp("delete", { titles });
                for (let i = 0; i < results.length; i++) {
                    const item = results[i];
                    const title = (_a = item === null || item === void 0 ? void 0 : item.title) !== null && _a !== void 0 ? _a : titles[i];
                    if (!title)
                        continue;
                    this.clearTiddlerInfo(title);
                    onNext(title);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmV3LW11bHRpd2lraWNsaWVudGFkYXB0b3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbmV3LW11bHRpd2lraWNsaWVudGFkYXB0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7R0FnQkc7QUFFSCxrRUFBa0U7QUFDbEUsWUFBWSxDQUFDOzs7Ozs7Ozs7OztBQXVLYiw4RUFBOEU7QUFDOUUsWUFBWTtBQUNaLDhFQUE4RTtBQUU5RSxNQUFNLG1CQUFtQixHQUFHLGdDQUFnQyxDQUFDO0FBQzdELE1BQU0sb0JBQW9CLEdBQUcscUJBQXFCLENBQUM7QUFDbkQsTUFBTSxxQkFBcUIsR0FBRyxrQ0FBa0MsQ0FBQztBQUNqRSxNQUFNLG1CQUFtQixHQUFHLG1DQUFtQyxDQUFDO0FBQ2hFLE1BQU0sd0JBQXdCLEdBQUcsa0RBQWtELENBQUM7QUFDcEYsTUFBTSx3QkFBd0IsR0FBRywyQkFBMkIsQ0FBQztBQUM3RCxNQUFNLGlCQUFpQixHQUFHLHVDQUF1QyxDQUFDO0FBQ2xFLE1BQU0sc0JBQXNCLEdBQUcsNENBQTRDLENBQUM7QUE0QzVFOzs7NkVBRzZFO0FBQzdFLE1BQU0sWUFBYSxTQUFRLEtBQUs7SUFFL0IsWUFBWSxLQUFjO1FBQ3pCLEtBQUssQ0FBQyxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUYvRCxtQkFBYyxHQUFHLElBQUksQ0FBQztRQUdyQixJQUFJLENBQUMsSUFBSSxHQUFHLGNBQWMsQ0FBQztJQUM1QixDQUFDO0NBQ0Q7QUFFRDtpRkFDaUY7QUFDakYsU0FBUyxjQUFjLENBQUMsT0FBZSxFQUFFLEtBQWM7SUFDdEQsT0FBTyxDQUFDLEtBQWtELGFBQWxELEtBQUssdUJBQUwsS0FBSyxDQUErQyxjQUFjO1FBQ3pFLENBQUMsQ0FBQyxJQUFJLFlBQVksQ0FB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QUFJLEdBQUcsQ0FBQyxPQUFPLElBQUksUUFBUSxDQUFDLFFBQVEsQ0FBQyxRQUFRLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7SUFDbEUsT0FBTyxDQUFDLFlBQVksR0FBRyxzQkFBc0IsQ0FBQztBQUMvQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLypcXFxudGl0bGU6ICQ6L3BsdWdpbnMvbXdzL2NsaWVudC9uZXctbXVsdGl3aWtpY2xpZW50YWRhcHRvci5qc1xudHlwZTogYXBwbGljYXRpb24vamF2YXNjcmlwdFxubW9kdWxlLXR5cGU6IHN5bmNhZGFwdG9yXG5cbkEgc3luYyBhZGFwdG9yIG1vZHVsZSBmb3Igc3luY2hyb25pc2luZyB3aXRoIE11bHRpV2lraVNlcnZlci1jb21wYXRpYmxlIHNlcnZlcnMuIFxuXG5JdCBoYXMgdGhyZWUga2V5IGFyZWFzIG9mIGNvbmNlcm46XG5cbiogQmFzaWMgb3BlcmF0aW9ucyBsaWtlIHB1dCwgZ2V0LCBhbmQgZGVsZXRlIGEgdGlkZGxlciBvbiB0aGUgc2VydmVyXG4qIFJlYWwgdGltZSB1cGRhdGVzIGZyb20gdGhlIHNlcnZlciAoaGFuZGxlZCBieSBTU0UpXG4qIEJhZ3MgYW5kIHJlY2lwZXMsIHdoaWNoIGFyZSB1bmtub3duIHRvIHRoZSBzeW5jZXJcblxuQSBrZXkgYXNwZWN0IG9mIHRoZSBkZXNpZ24gaXMgdGhhdCB0aGUgc3luY2VyIG5ldmVyIG92ZXJsYXBzIGJhc2ljIHNlcnZlciBvcGVyYXRpb25zOyBpdCB3YWl0cyBmb3IgdGhlXG5wcmV2aW91cyBvcGVyYXRpb24gdG8gY29tcGxldGUgYmVmb3JlIHNlbmRpbmcgYSBuZXcgb25lLlxuXG5cXCovXG5cbi8vIHRoZSBibGFuayBsaW5lIGlzIGltcG9ydGFudCwgYW5kIHNvIGlzIHRoZSBmb2xsb3dpbmcgdXNlIHN0cmljdFxuXCJ1c2Ugc3RyaWN0XCI7XG5cbi8vIGltcG9ydCB0eXBlIHsgU2VydmVyRXZlbnRzTWFwIH0gZnJvbSAnQHRpZGRseXdpa2kvZXZlbnRzJztcbi8vIGltcG9ydCB0eXBlIHsgWm9kUm91dGUsIFdpa2lTdGF0dXNSb3V0ZXMsIFdpa2lSZWNpcGVSb3V0ZXMgfSBmcm9tICdAdGlkZGx5d2lraS9td3MnO1xuLy8gaW1wb3J0IHR5cGUgeyB6b2QgfSBmcm9tICdAdGlkZGx5d2lraS9zZXJ2ZXInO1xuaW1wb3J0IHR5cGUgeyBTeW5jZXIsIFRpZGRsZXIsIFRpZGRsZXJGaWVsZHMsIFdpa2kgfSBmcm9tICd0aWRkbHl3aWtpJztcblxuLy8gaW1wb3J0IHt9IGZyb20gXCJAdGlkZGx5d2lraS9td3MtcHJpc21hXCI7XG5kZWNsYXJlIGdsb2JhbCB7IGNvbnN0IGZmbGF0ZTogdHlwZW9mIGltcG9ydChcIi4vZmZsYXRlXCIpOyB9XG5kZWNsYXJlIGNvbnN0IHNlbGY6IG5ldmVyO1xuZGVjbGFyZSBjb25zdCByZXF1aXJlOiAoaWQ6IHN0cmluZykgPT4gYW55O1xuXG5kZWNsYXJlIGNsYXNzIExvZ2dlciB7XG5cdGNvbnN0cnVjdG9yKGNvbXBvbmVudE5hbWU6IGFueSwgb3B0aW9uczogYW55KTtcblx0Y29tcG9uZW50TmFtZTogYW55O1xuXHRjb2xvdXI6IGFueTtcblx0ZW5hYmxlOiBhbnk7XG5cdHNhdmU6IGFueTtcblx0c2F2ZUxpbWl0OiBhbnk7XG5cdHNhdmVCdWZmZXJMb2dnZXI6IHRoaXM7XG5cdGJ1ZmZlcjogc3RyaW5nO1xuXHRhbGVydENvdW50OiBudW1iZXI7XG5cdHNldFNhdmVCdWZmZXIobG9nZ2VyOiBhbnkpOiB2b2lkO1xuXHRsb2coLi4uYXJnczogYW55W10pOiBhbnk7XG5cdGdldEJ1ZmZlcigpOiBzdHJpbmc7XG5cdHRhYmxlKHZhbHVlOiBhbnkpOiB2b2lkO1xuXHRhbGVydCguLi5hcmdzOiBhbnlbXSk6IHZvaWQ7XG5cdGNsZWFyQWxlcnRzKCk6IHZvaWQ7XG59XG5cbmRlY2xhcmUgbW9kdWxlICd0aWRkbHl3aWtpJyB7XG5cdGV4cG9ydCBpbnRlcmZhY2UgU3luY2VyPEFEPiB7XG5cdFx0d2lraTogV2lraTtcblx0XHRsb2dnZXI6IExvZ2dlcjtcblx0XHR0aWRkbGVySW5mbzogUmVjb3JkPHN0cmluZywge1xuXHRcdFx0Y2hhbmdlQ291bnQ6IG51bWJlcixcblx0XHRcdGFkYXB0b3JJbmZvOiBBRCxcblx0XHRcdHJldmlzaW9uOiBzdHJpbmcsXG5cdFx0XHR0aW1lc3RhbXBMYXN0U2F2ZWQ6IERhdGVcblx0XHR9Pjtcblx0XHRlbnF1ZXVlTG9hZFRpZGRsZXIodGl0bGU6IHN0cmluZyk6IHZvaWQ7XG5cdFx0c3RvcmVUaWRkbGVyKHRpZGRsZXI6IFRpZGRsZXIpOiB2b2lkO1xuXHRcdHByb2Nlc3NUYXNrUXVldWUoKTogdm9pZDtcblx0XHRzeW5jRnJvbVNlcnZlcigpOiB2b2lkO1xuXHR9XG5cdGludGVyZmFjZSBJVGlkZGx5V2lraSB7XG5cdFx0YnJvd3NlclN0b3JhZ2U6IGFueTtcblx0fVxufVxuXG50eXBlIFNlcnZlclN0YXR1c0NhbGxiYWNrID0gKFxuXHRlcnI6IGFueSxcblx0LyoqIFxuXHQgKiAkOi9zdGF0dXMvSXNMb2dnZWRJbiBtb3N0bHkgYXBwZWFycyBhbG9uZ3NpZGUgdGhlIHVzZXJuYW1lIFxuXHQgKiBvciBvdGhlciBsb2dpbi1jb25kaXRpb25hbCBiZWhhdmlvci4gXG5cdCAqL1xuXHRpc0xvZ2dlZEluPzogYm9vbGVhbixcblx0LyoqXG5cdCAqICQ6L3N0YXR1cy9Vc2VyTmFtZSBpcyBzdGlsbCB1c2VkIGZvciB0aGluZ3MgbGlrZSBkcmFmdHMgZXZlbiBpZiB0aGUgXG5cdCAqIHVzZXIgaXNuJ3QgbG9nZ2VkIGluLCBhbHRob3VnaCB0aGUgdXNlcm5hbWUgaXMgbGVzcyBsaWtlbHkgdG8gYmUgc2hvd24gXG5cdCAqIHRvIHRoZSB1c2VyLiBcblx0ICovXG5cdHVzZXJuYW1lPzogc3RyaW5nLFxuXHQvKiogXG5cdCAqICQ6L3N0YXR1cy9Jc1JlYWRPbmx5IHB1dHMgdGhlIFVJIGluIHJlYWRvbmx5IG1vZGUsIFxuXHQgKiBidXQgZG9lcyBub3QgcHJldmVudCBhdXRvbWF0aWMgY2hhbmdlcyBmcm9tIGF0dGVtcHRpbmcgdG8gc2F2ZS4gXG5cdCAqL1xuXHRpc1JlYWRPbmx5PzogYm9vbGVhbixcblx0LyoqIFxuXHQgKiAkOi9zdGF0dXMvSXNBbm9ueW1vdXMgZG9lcyBub3QgYXBwZWFyIGFueXdoZXJlIGluIHRoZSBUVzUgcmVwbyEgXG5cdCAqIFNvIGl0IGhhcyBubyBhcHBhcmVudCBwdXJwb3NlLiBcblx0ICovXG5cdGlzQW5vbnltb3VzPzogYm9vbGVhblxuKSA9PiB2b2lkXG5cbmludGVyZmFjZSBTeW5jQWRhcHRvcjxBRD4ge1xuXHRuYW1lPzogc3RyaW5nO1xuXG5cdGlzUmVhZHk/KCk6IGJvb2xlYW47XG5cblx0cmVnaXN0ZXJTeW5jZXI/KHN5bmNlcjogU3luY2VyPEFEPik6IHZvaWQ7XG5cblx0Z2V0U3RhdHVzPyhcblx0XHRjYjogU2VydmVyU3RhdHVzQ2FsbGJhY2tcblx0KTogdm9pZDtcblxuXHRnZXRTa2lubnlUaWRkbGVycz8oXG5cdFx0Y2I6IChlcnI6IGFueSwgdGlkZGxlckZpZWxkczogUmVjb3JkPHN0cmluZywgc3RyaW5nPltdKSA9PiB2b2lkXG5cdCk6IHZvaWQ7XG5cdGdldFVwZGF0ZWRUaWRkbGVycz8oXG5cdFx0c3luY2VyOiBTeW5jZXI8QUQ+LFxuXHRcdGNiOiAoXG5cdFx0XHRlcnI6IGFueSxcblx0XHRcdC8qKiBBcnJheXMgb2YgdGl0bGVzIHRoYXQgaGF2ZSBiZWVuIG1vZGlmaWVkIG9yIGRlbGV0ZWQgKi9cblx0XHRcdHVwZGF0ZXM/OiB7IG1vZGlmaWNhdGlvbnM6IHN0cmluZ1tdLCBkZWxldGlvbnM6IHN0cmluZ1tdIH1cblx0XHQpID0+IHZvaWRcblx0KTogdm9pZDtcblxuXHQvKiogXG5cdCAqIHVzZWQgdG8gb3ZlcnJpZGUgdGhlIGRlZmF1bHQgU3luY2VyIGdldFRpZGRsZXJSZXZpc2lvbiBiZWhhdmlvclxuXHQgKiBvZiByZXR1cm5pbmcgdGhlIHJldmlzaW9uIGZpZWxkXG5cdCAqIFxuXHQgKi9cblx0Z2V0VGlkZGxlclJldmlzaW9uPyh0aXRsZTogc3RyaW5nKTogc3RyaW5nO1xuXHQvKiogXG5cdCAqIHVzZWQgdG8gZ2V0IHRoZSBhZGFwdGVyIGluZm8gZnJvbSBhIHRpZGRsZXIgaW4gc2l0dWF0aW9uc1xuXHQgKiBvdGhlciB0aGFuIHRoZSBzYXZlVGlkZGxlciBjYWxsYmFja1xuXHQgKi9cblx0Z2V0VGlkZGxlckluZm8odGlkZGxlcjogVGlkZGxlcik6IEFEIHwgdW5kZWZpbmVkO1xuXG5cdHNhdmVUaWRkbGVyKFxuXHRcdHRpZGRsZXI6IGFueSxcblx0XHRjYjogKFxuXHRcdFx0ZXJyOiBhbnksXG5cdFx0XHRhZGFwdG9ySW5mbz86IEFELFxuXHRcdFx0cmV2aXNpb24/OiBzdHJpbmdcblx0XHQpID0+IHZvaWQsXG5cdFx0ZXh0cmE6IHsgdGlkZGxlckluZm86IFN5bmNlclRpZGRsZXJJbmZvPEFEPiB9XG5cdCk6IHZvaWQ7XG5cblx0c2F2ZVRpZGRsZXJzPyhvcHRpb25zOiB7XG5cdFx0c3luY2VyOiBTeW5jZXI8QUQ+LFxuXHRcdHRpZGRsZXJzOiBUaWRkbGVyW10sXG5cdFx0b25OZXh0OiAodGl0bGU6IHN0cmluZywgYWRhcHRvckluZm86IGFueSwgcmV2aXNpb246IHN0cmluZykgPT4gdm9pZCxcblx0XHRvbkRvbmU6ICgpID0+IHZvaWQsXG5cdFx0b25FcnJvcjogKGVycjogRXJyb3IpID0+IHZvaWRcblx0fSk6IHZvaWQ7XG5cblx0bG9hZFRpZGRsZXJzPyhvcHRpb25zOiB7XG5cdFx0c3luY2VyOiBTeW5jZXI8QUQ+LFxuXHRcdHRpdGxlczogc3RyaW5nW10sXG5cdFx0b25OZXh0OiAodGlkZGxlckZpZWxkczogVGlkZGxlckZpZWxkcykgPT4gdm9pZCxcblx0XHRvbkRvbmU6ICgpID0+IHZvaWQsXG5cdFx0b25FcnJvcjogKGVycjogRXJyb3IpID0+IHZvaWRcblx0fSk6IHZvaWQ7XG5cblx0ZGVsZXRlVGlkZGxlcnM/KG9wdGlvbnM6IHtcblx0XHRzeW5jZXI6IFN5bmNlcjxBRD4sXG5cdFx0dGl0bGVzOiBzdHJpbmdbXSxcblx0XHRvbk5leHQ6ICh0aXRsZTogc3RyaW5nKSA9PiB2b2lkLFxuXHRcdG9uRG9uZTogKCkgPT4gdm9pZCxcblx0XHRvbkVycm9yOiAoZXJyOiBFcnJvcikgPT4gdm9pZFxuXHR9KTogdm9pZDtcblxuXHRzZXRMb2dnZXJTYXZlQnVmZmVyPzogKGxvZ2dlckZvclNhdmluZzogTG9nZ2VyKSA9PiB2b2lkO1xuXHRkaXNwbGF5TG9naW5Qcm9tcHQ/KHN5bmNlcjogU3luY2VyPEFEPik6IHZvaWQ7XG5cdGxvZ2luPyh1c2VybmFtZTogc3RyaW5nLCBwYXNzd29yZDogc3RyaW5nLCBjYjogKGVycjogYW55KSA9PiB2b2lkKTogdm9pZDtcblx0bG9nb3V0PyhjYjogKGVycjogYW55KSA9PiB2b2lkKTogYW55O1xuXG59XG5pbnRlcmZhY2UgU3luY2VyVGlkZGxlckluZm88QUQ+IHtcblx0LyoqIHRoaXMgY29tZXMgZnJvbSB0aGUgd2lraSBjaGFuZ2VDb3VudCByZWNvcmQgKi9cblx0Y2hhbmdlQ291bnQ6IG51bWJlcjtcblx0LyoqIEFkYXB0ZXIgaW5mbyByZXR1cm5lZCBieSB0aGUgc3luYyBhZGFwdGVyICovXG5cdGFkYXB0b3JJbmZvOiBBRDtcblx0LyoqIFJldmlzaW9uIHJldHVybiBieSB0aGUgc3luYyBhZGFwdGVyICovXG5cdHJldmlzaW9uOiBzdHJpbmc7XG5cdC8qKiBUaW1lc3RhbXAgc2V0IGluIHRoZSBjYWxsYmFjayBvZiB0aGUgcHJldmlvdXMgc2F2ZSAqL1xuXHR0aW1lc3RhbXBMYXN0U2F2ZWQ6IERhdGU7XG59XG5cbmRlY2xhcmUgY29uc3QgJHR3OiBhbnk7XG5cbmRlY2xhcmUgY29uc3QgZXhwb3J0czoge1xuXHRhZGFwdG9yQ2xhc3M6IHR5cGVvZiBNdWx0aVdpa2lDbGllbnRBZGFwdG9yO1xufTtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBDb25zdGFudHNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5jb25zdCBDT05GSUdfSE9TVF9USURETEVSID0gXCIkOi9jb25maWcvbXVsdGl3aWtpY2xpZW50L2hvc3RcIjtcbmNvbnN0IERFRkFVTFRfSE9TVF9USURETEVSID0gXCIkcHJvdG9jb2wkLy8kaG9zdCQvXCI7XG5jb25zdCBDT05GSUdfUkVDSVBFX1RJRERMRVIgPSBcIiQ6L2NvbmZpZy9tdWx0aXdpa2ljbGllbnQvcmVjaXBlXCI7XG5jb25zdCBJU19ERVZfTU9ERV9USURETEVSID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvZGV2LW1vZGVcIjtcbmNvbnN0IExBU1RfUkVWSVNJT05fSURfVElERExFUiA9IFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L3JlY2lwZS9sYXN0X3JldmlzaW9uX2lkXCI7XG5jb25zdCBNV0NfU1RBVEVfVElERExFUl9QUkVGSVggPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC9cIjtcbmNvbnN0IEJBR19TVEFURV9USURETEVSID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvdGlkZGxlcnMvYmFnXCI7XG5jb25zdCBSRVZJU0lPTl9TVEFURV9USURETEVSID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvdGlkZGxlcnMvcmV2aXNpb25cIjtcblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBUeXBlc1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmludGVyZmFjZSBNV1NBZGFwdG9ySW5mbyB7XG5cdGJhZzogc3RyaW5nO1xuXHRyZXZpc2lvbjogc3RyaW5nO1xuXHR0aXRsZTogc3RyaW5nO1xufVxuXG4vLyBPUEFRVUUgKFBBS0UpIGNsaWVudCBzdXJmYWNlIHByb3ZpZGVkIGJ5IHRoZSBidW5kbGVkIGxpYnJhcnkgdGlkZGxlclxuaW50ZXJmYWNlIE9wYXF1ZUNsaWVudCB7XG5cdHJlYWR5OiBQcm9taXNlPHVua25vd24+O1xuXHRjbGllbnQ6IHtcblx0XHRzdGFydExvZ2luKGFyZ3M6IHsgcGFzc3dvcmQ6IHN0cmluZyB9KTogeyBjbGllbnRMb2dpblN0YXRlOiB1bmtub3duOyBzdGFydExvZ2luUmVxdWVzdDogc3RyaW5nIH07XG5cdFx0ZmluaXNoTG9naW4oYXJnczogeyBjbGllbnRMb2dpblN0YXRlOiB1bmtub3duOyBsb2dpblJlc3BvbnNlOiBzdHJpbmc7IHBhc3N3b3JkOiBzdHJpbmcgfSk6XG5cdFx0XHR7IGZpbmlzaExvZ2luUmVxdWVzdDogc3RyaW5nOyBzZXNzaW9uS2V5OiBzdHJpbmcgfSB8IG51bGw7XG5cdH07XG59XG5cbi8vIFN0YXR1cyByZXNwb25zZSBmcm9tIEdFVCAvcmVjaXBlLzppZC9zdGF0dXNcbmludGVyZmFjZSBSZWNpcGVTdGF0dXMge1xuXHRpc0FkbWluOiBib29sZWFuO1xuXHR1c2VyX2lkOiBzdHJpbmc7XG5cdHVzZXJuYW1lOiBzdHJpbmc7XG5cdGlzTG9nZ2VkSW46IGJvb2xlYW47XG5cdHRlbXBsYXRlOiB7IHR5cGU6IHN0cmluZzsgZGVmaW5pdGlvbjogdW5rbm93bjsgcGFyYW1ldGVyczogdW5rbm93biB9O1xuXHRiYWdzOiB7IGJhZ19pZDogc3RyaW5nOyBiYWdfbmFtZTogc3RyaW5nOyBpc193cml0YWJsZTogYm9vbGVhbjsgcHJpb3JpdHk6IG51bWJlcjsgY2FuVXNlcldyaXRlOiBib29sZWFuOyBpbmZvOiB1bmtub3duIH1bXTtcbn1cblxuLy8gVGlkZGxlckluZm8gZnJvbSByZXNvbHZlclxuaW50ZXJmYWNlIFRpZGRsZXJJbmZvIHtcblx0dGl0bGU6IHN0cmluZztcblx0d3JpdGVUbzogc3RyaW5nIHwgbnVsbDtcblx0cmVhZEZyb206IHN0cmluZyB8IG51bGw7XG5cdGV4aXN0c0luOiBzdHJpbmdbXTtcblx0Y2FuV3JpdGU6IGJvb2xlYW47XG59XG5cbnR5cGUgQmF0Y2hNdXRhdGlvblJlc3VsdCA9IHsgdGl0bGU6IHN0cmluZzsgaW5mbzogVGlkZGxlckluZm87IHJldmlzaW9uPzogc3RyaW5nIH07XG50eXBlIEJhdGNoUmVhZFJlc3VsdCA9IHsgZmllbGRzOiBSZWNvcmQ8c3RyaW5nLCBhbnk+ICYgeyB0aXRsZTogc3RyaW5nIH07IGluZm86IFRpZGRsZXJJbmZvIH0gfCBudWxsO1xuXG4vKiogQSByZXF1ZXN0IHRoYXQgbmV2ZXIgcmVhY2hlZCB0aGUgc2VydmVyOiB0aGUgY29ubmVjdGlvbiBpcyBnb25lLCB0aGVcbiAqICBzZXJ2ZXIgaXMgdW5yZWFjaGFibGUsIHRoZSByZXF1ZXN0IHdhcyBhYm9ydGVkIG9yIHRpbWVkIG91dC4gTWFya2VkIHNvIHRoYXRcbiAqICB0aGUgc3luY2VyIGNhbiB0ZWxsIFwibmV0d29yayBnb25lXCIgZnJvbSBcInNlcnZlciBhbnN3ZXJlZCB3aXRoIGFuIGVycm9yXCIsXG4gKiAgd2hpY2ggaXMgd2hhdCBkZWNpZGVzIGJldHdlZW4gdGhlIGNvbm5lY3Rpb24gYWxlcnQgYW5kIHRoZSBub3JtYWwgb25lLiAqL1xuY2xhc3MgTmV0d29ya0Vycm9yIGV4dGVuZHMgRXJyb3Ige1xuXHRpc05ldHdvcmtFcnJvciA9IHRydWU7XG5cdGNvbnN0cnVjdG9yKGNhdXNlOiB1bmtub3duKSB7XG5cdFx0c3VwZXIoY2F1c2UgaW5zdGFuY2VvZiBFcnJvciA/IGNhdXNlLm1lc3NhZ2UgOiBTdHJpbmcoY2F1c2UpKTtcblx0XHR0aGlzLm5hbWUgPSBcIk5ldHdvcmtFcnJvclwiO1xuXHR9XG59XG5cbi8qKiBBIHJlcXVlc3QgZXJyb3IgdGhhdCBrZWVwcyB0aGUgZGlzdGluY3Rpb246IGEgZmFpbGVkIHJlcXVlc3QgdGhhdCBuZXZlclxuICogIHJlYWNoZWQgdGhlIHNlcnZlciBzdGF5cyBhIE5ldHdvcmtFcnJvciwgYW4gYW5zd2VyZWQgb25lIGJlY29tZXMgYW4gRXJyb3IuICovXG5mdW5jdGlvbiBhc1JlcXVlc3RFcnJvcihtZXNzYWdlOiBzdHJpbmcsIGNhdXNlOiB1bmtub3duKSB7XG5cdHJldHVybiAoY2F1c2UgYXMgeyBpc05ldHdvcmtFcnJvcj86IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCk/LmlzTmV0d29ya0Vycm9yXG5cdFx0PyBuZXcgTmV0d29ya0Vycm9yKG5ldyBFcnJvcihtZXNzYWdlKSlcblx0XHQ6IG5ldyBFcnJvcihtZXNzYWdlKTtcbn1cblxuLyoqIGh0dHBSZXF1ZXN0IGFuc3dlcnMgaW5zdGVhZCBvZiByZWplY3RpbmcsIGFuZCBhIHJlcXVlc3QgdGhhdCBuZXZlciByZWFjaGVkXG4gKiAgdGhlIHNlcnZlciBjb21lcyBiYWNrIHdpdGggc3RhdHVzIDA6IHRoZSBuZXR3b3JrIGlzIGdvbmUsIG5vdCB0aGUgc2VydmVyXG4gKiAgY29tcGxhaW5pbmcuIEV2ZXJ5IG90aGVyIHN0YXR1cyBpcyBhIHJlYWwgYW5zd2VyIGFuZCBzdGF5cyBhbiBFcnJvci4gKi9cbmZ1bmN0aW9uIHJlcXVlc3RGYWlsdXJlKHN0YXR1czogbnVtYmVyLCByZWFzb246IHN0cmluZyB8IG51bGwpIHtcblx0cmV0dXJuIHN0YXR1cyA9PT0gMFxuXHRcdD8gbmV3IE5ldHdvcmtFcnJvcihuZXcgRXJyb3IoXCJTZXJ2ZXIgdW5yZWFjaGFibGVcIikpXG5cdFx0OiBuZXcgRXJyb3IoYFNlcnZlciByZXR1cm5lZCAke3N0YXR1c306ICR7cmVhc29uID8/IFwiKG5vIHJlYXNvbilcIn1gKTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBBZGFwdG9yXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY2xhc3MgTXVsdGlXaWtpQ2xpZW50QWRhcHRvciBpbXBsZW1lbnRzIFN5bmNBZGFwdG9yPE1XU0FkYXB0b3JJbmZvPiB7XG5cdG5hbWUgPSBcIm11bHRpd2lraWNsaWVudFwiO1xuXG5cdHByaXZhdGUgd2lraTogV2lraTtcblx0cHJpdmF0ZSBob3N0OiBzdHJpbmc7XG5cdHByaXZhdGUgcmVjaXBlOiBzdHJpbmc7XG5cdHByaXZhdGUgaXNEZXZNb2RlOiBib29sZWFuO1xuXHRwcml2YXRlIGxvZ2dlcjogTG9nZ2VyO1xuXHRwcml2YXRlIHN5bmNlcjogU3luY2VyPE1XU0FkYXB0b3JJbmZvPiB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgaXNMb2dnZWRJbiA9IGZhbHNlO1xuXHRwcml2YXRlIGlzUmVhZE9ubHkgPSB0cnVlO1xuXHRwcml2YXRlIG9mZmxpbmUgPSBmYWxzZTtcblx0cHJpdmF0ZSB1c2VybmFtZSA9IFwiXCI7XG5cdGVycm9yOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblxuXHRwcml2YXRlIGxhc3RTZXEgPSBcIjBcIjtcblx0cHJpdmF0ZSBpbml0aWFsTG9hZERvbmUgPSBmYWxzZTtcblx0LyoqIHRpdGxlIOKGkiBiYWcgbmFtZSwgcG9wdWxhdGVkIG9uIGxvYWQvc2F2ZSAqL1xuXHRwcml2YXRlIHRpZGRsZXJCYWcgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHQvKiogdGl0bGUg4oaSIHJldmlzaW9uLCBwb3B1bGF0ZWQgb24gc2F2ZSAqL1xuXHRwcml2YXRlIHRpZGRsZXJSZXZpc2lvbiA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3Iob3B0aW9uczogeyB3aWtpOiBXaWtpIH0pIHtcblx0XHR0aGlzLndpa2kgPSBvcHRpb25zLndpa2k7XG5cdFx0dGhpcy5ob3N0ID0gdGhpcy5nZXRIb3N0KCk7XG5cdFx0dGhpcy5yZWNpcGUgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoQ09ORklHX1JFQ0lQRV9USURETEVSLCBcIlwiKSE7XG5cdFx0dGhpcy5pc0Rldk1vZGUgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoSVNfREVWX01PREVfVElERExFUikgPT09IFwieWVzXCI7XG5cdFx0dGhpcy5sYXN0U2VxID0gdGhpcy53aWtpLmdldFRpZGRsZXJUZXh0KExBU1RfUkVWSVNJT05fSURfVElERExFUiwgXCIwXCIpITtcblx0XHR0aGlzLmluaXRpYWxMb2FkRG9uZSA9IHRoaXMubGFzdFNlcSAhPT0gXCIwXCI7XG5cdFx0dGhpcy5sb2dnZXIgPSBuZXcgJHR3LnV0aWxzLkxvZ2dlcihcIk11bHRpV2lraUNsaWVudEFkYXB0b3JcIik7XG5cdH1cblxuXHRpc1JlYWR5KCkgeyByZXR1cm4gdHJ1ZTsgfVxuXG5cdHNldExvZ2dlclNhdmVCdWZmZXIobG9nZ2VyOiBMb2dnZXIpIHsgdGhpcy5sb2dnZXIuc2V0U2F2ZUJ1ZmZlcihsb2dnZXIpOyB9XG5cblx0cmVnaXN0ZXJTeW5jZXIoc3luY2VyOiBTeW5jZXI8TVdTQWRhcHRvckluZm8+KSB7IHRoaXMuc3luY2VyID0gc3luY2VyOyB9XG5cblx0cHJpdmF0ZSBpc1N0YXRlVGlkZGxlcih0aXRsZTogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRpdGxlLnN0YXJ0c1dpdGgoTVdDX1NUQVRFX1RJRERMRVJfUFJFRklYKTtcblx0fVxuXG5cdHByaXZhdGUgc2V0VGlkZGxlckluZm8odGl0bGU6IHN0cmluZywgYmFnOiBzdHJpbmcgfCBudWxsLCByZXZpc2lvbj86IHN0cmluZykge1xuXHRcdGlmIChiYWcpIHtcblx0XHRcdHRoaXMudGlkZGxlckJhZy5zZXQodGl0bGUsIGJhZyk7XG5cdFx0XHR0aGlzLndpa2kuc2V0VGV4dChCQUdfU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIGJhZywgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy50aWRkbGVyQmFnLmRlbGV0ZSh0aXRsZSk7XG5cdFx0XHR0aGlzLndpa2kuc2V0VGV4dChCQUdfU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIHVuZGVmaW5lZCwgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0XHR9XG5cdFx0aWYgKHJldmlzaW9uKSB7XG5cdFx0XHR0aGlzLnRpZGRsZXJSZXZpc2lvbi5zZXQodGl0bGUsIHJldmlzaW9uKTtcblx0XHRcdHRoaXMud2lraS5zZXRUZXh0KFJFVklTSU9OX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCByZXZpc2lvbiwgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNsZWFyVGlkZGxlckluZm8odGl0bGU6IHN0cmluZykge1xuXHRcdHRoaXMudGlkZGxlckJhZy5kZWxldGUodGl0bGUpO1xuXHRcdHRoaXMudGlkZGxlclJldmlzaW9uLmRlbGV0ZSh0aXRsZSk7XG5cdFx0dGhpcy53aWtpLnNldFRleHQoQkFHX1NUQVRFX1RJRERMRVIsIG51bGwsIHRpdGxlLCB1bmRlZmluZWQsIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdFx0dGhpcy53aWtpLnNldFRleHQoUkVWSVNJT05fU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIHVuZGVmaW5lZCwgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgc2V0TGFzdFNlcShzZXE6IHN0cmluZykge1xuXHRcdHRoaXMubGFzdFNlcSA9IHNlcTtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChMQVNUX1JFVklTSU9OX0lEX1RJRERMRVIsIG51bGwsIFwidGV4dFwiLCBzZXEsIHsgc3VwcHJlc3NUaW1lc3RhbXA6IHRydWUgfSk7XG5cdH1cblxuXHRnZXRUaWRkbGVyUmV2aXNpb24odGl0bGU6IHN0cmluZykge1xuXHRcdHJldHVybiB0aGlzLndpa2kuZXh0cmFjdFRpZGRsZXJEYXRhSXRlbShSRVZJU0lPTl9TVEFURV9USURETEVSLCB0aXRsZSkgPz8gXCJcIjtcblx0fVxuXG5cdGdldFRpZGRsZXJJbmZvKHRpZGRsZXI6IFRpZGRsZXIpOiBNV1NBZGFwdG9ySW5mbyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgdGl0bGUgPSB0aWRkbGVyLmZpZWxkcy50aXRsZSBhcyBzdHJpbmc7XG5cdFx0Y29uc3QgYmFnID0gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oQkFHX1NUQVRFX1RJRERMRVIsIHRpdGxlKSA/PyB0aGlzLnRpZGRsZXJCYWcuZ2V0KHRpdGxlKTtcblx0XHRjb25zdCByZXZpc2lvbiA9IHRoaXMud2lraS5leHRyYWN0VGlkZGxlckRhdGFJdGVtKFJFVklTSU9OX1NUQVRFX1RJRERMRVIsIHRpdGxlKSA/PyB0aGlzLnRpZGRsZXJSZXZpc2lvbi5nZXQodGl0bGUpO1xuXHRcdHJldHVybiBiYWcgJiYgcmV2aXNpb24gPyB7IGJhZywgcmV2aXNpb24sIHRpdGxlIH0gOiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldEhvc3QoKSB7XG5cdFx0bGV0IHRleHQgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoQ09ORklHX0hPU1RfVElERExFUiwgREVGQVVMVF9IT1NUX1RJRERMRVIpITtcblx0XHRbXG5cdFx0XHR7IG5hbWU6IFwicHJvdG9jb2xcIiwgdmFsdWU6IGRvY3VtZW50LmxvY2F0aW9uLnByb3RvY29sIH0sXG5cdFx0XHR7IG5hbWU6IFwiaG9zdFwiLCAgICAgdmFsdWU6IGRvY3VtZW50LmxvY2F0aW9uLmhvc3QgfSxcblx0XHRcdHsgbmFtZTogXCJwYXRobmFtZVwiLCB2YWx1ZTogZG9jdW1lbnQubG9jYXRpb24ucGF0aG5hbWUgfSxcblx0XHRdLmZvckVhY2goKHsgbmFtZSwgdmFsdWUgfSkgPT4ge1xuXHRcdFx0dGV4dCA9ICR0dy51dGlscy5yZXBsYWNlU3RyaW5nKHRleHQsIG5ldyBSZWdFeHAoXCJcXFxcJFwiICsgbmFtZSArIFwiXFxcXCRcIiwgXCJtZ1wiKSwgdmFsdWUpO1xuXHRcdH0pO1xuXHRcdHJldHVybiB0ZXh0O1xuXHR9XG5cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHQvLyBTdGF0dXNcblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGFzeW5jIGdldFN0YXR1cyhjYWxsYmFjazogU2VydmVyU3RhdHVzQ2FsbGJhY2spIHtcblx0XHRjb25zdCBbb2ssICwgcmVzdWx0XSA9IGF3YWl0IHRoaXMucmVjaXBlUmVxdWVzdCh7IG1ldGhvZDogXCJHRVRcIiwgdXJsOiBcIi9zdGF0dXNcIiB9KTtcblx0XHRpZiAoIW9rICYmIHJlc3VsdD8uc3RhdHVzID09PSAwKSB7XG5cdFx0XHR0aGlzLm9mZmxpbmUgPSB0cnVlO1xuXHRcdFx0dGhpcy5pc0xvZ2dlZEluID0gZmFsc2U7XG5cdFx0XHR0aGlzLmlzUmVhZE9ubHkgPSB0cnVlO1xuXHRcdFx0dGhpcy51c2VybmFtZSA9IFwiKG9mZmxpbmUpXCI7XG5cdFx0XHR0aGlzLmVycm9yID0gXCJUaGUgd2VicGFnZSBpcyBmb3JiaWRkZW4gZnJvbSBjb250YWN0aW5nIHRoZSBzZXJ2ZXIuXCI7XG5cdFx0fSBlbHNlIGlmIChvaykge1xuXHRcdFx0Y29uc3Qgc3RhdHVzID0gcmVzdWx0IS5yZXNwb25zZUpTT04gYXMgUmVjaXBlU3RhdHVzO1xuXHRcdFx0dGhpcy5vZmZsaW5lID0gZmFsc2U7XG5cdFx0XHR0aGlzLmVycm9yID0gbnVsbDtcblx0XHRcdHRoaXMuaXNMb2dnZWRJbiA9IHN0YXR1cz8uaXNMb2dnZWRJbiA/PyBmYWxzZTtcblx0XHRcdHRoaXMudXNlcm5hbWUgPSBzdGF0dXM/LnVzZXJuYW1lID8/IFwiKGFub24pXCI7XG5cdFx0XHR0aGlzLmlzUmVhZE9ubHkgPSAhKHN0YXR1cz8uYmFncz8uc29tZShiID0+IGIuY2FuVXNlcldyaXRlKSA/PyBmYWxzZSk7XG5cdFx0XHR0aGlzLndyaXRlSXNBZG1pbihzdGF0dXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmVycm9yID0gYFNlcnZlciBlcnJvciAke3Jlc3VsdD8uc3RhdHVzfWA7XG5cdFx0fVxuXHRcdGNhbGxiYWNrKHRoaXMuZXJyb3IsIHRoaXMuaXNMb2dnZWRJbiwgdGhpcy51c2VybmFtZSwgdGhpcy5pc1JlYWRPbmx5LCBmYWxzZSk7XG5cdH1cblxuXHQvKiogVGhlIHN0YXR1cyByZXNwb25zZSBpcyB0aGUgb25seSBwbGFjZSB3aGVyZSB0aGUgY2xpZW50IGxlYXJucyB3aGV0aGVyIHRoZVxuXHQgKiAgdXNlciBpcyBhbiBhZG1pbi4gVGhlIHNoZWxsLXVwZGF0ZSBiYW5uZXIgcmVhZHMgdGhpcyB0aWRkbGVyIHRvIGRlY2lkZVxuXHQgKiAgd2hvIG1heSBhY2NlcHQgYSBuZXcgdGVtcGxhdGUgdmVyc2lvbi4gKi9cblx0cHJpdmF0ZSB3cml0ZUlzQWRtaW4oc3RhdHVzOiBSZWNpcGVTdGF0dXMgfCBudWxsKSB7XG5cdFx0dGhpcy53aWtpLmFkZFRpZGRsZXIoe1xuXHRcdFx0dGl0bGU6IFwiJDovc3RhdHVzL0lzQWRtaW5cIixcblx0XHRcdHRleHQ6IHN0YXR1cz8uaXNBZG1pbiA/IFwieWVzXCIgOiBcIm5vXCIsXG5cdFx0fSk7XG5cdH1cblxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vIExvZ2luIC8gTG9nb3V0XG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gUGVyZm9ybXMgYW4gT1BBUVVFIChQQUtFKSBwYXNzd29yZCBsb2dpbiBhZ2FpbnN0IHRoZSBNV1Mgc2Vzc2lvblxuXHQvLyBlbmRwb2ludHMuIE9uIHN1Y2Nlc3MgdGhlIHNlcnZlciBzZXRzIGEgc2Vzc2lvbiBjb29raWUgKHBhdGggXCIvXCIpIHdoaWNoXG5cdC8vIGF1dG9tYXRpY2FsbHkgYXV0aG9yaXNlcyBhbGwgc3Vic2VxdWVudCBzYW1lLW9yaWdpbiByZXF1ZXN0cywgc28gdGhlXG5cdC8vIHdpa2kgYmVjb21lcyB3cml0YWJsZSB3aXRob3V0IHZpc2l0aW5nIHRoZSAvbG9naW4gcGFnZS5cblxuXHRhc3luYyBsb2dpbih1c2VybmFtZTogc3RyaW5nLCBwYXNzd29yZDogc3RyaW5nLCBjYjogKGVycjogYW55KSA9PiB2b2lkKSB7XG5cdFx0Y29uc3Qgb3BhcXVlID0gcmVxdWlyZShcIiQ6L3BsdWdpbnMvbXdzL2NsaWVudC9saWJyYXJ5L29wYXF1ZVwiKSBhcyBPcGFxdWVDbGllbnQ7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghdXNlcm5hbWUgfHwgIXBhc3N3b3JkKSB0aHJvdyBuZXcgRXJyb3IoXCJVc2VybmFtZSBhbmQgcGFzc3dvcmQgYXJlIHJlcXVpcmVkXCIpO1xuXHRcdFx0YXdhaXQgb3BhcXVlLnJlYWR5O1xuXHRcdFx0Y29uc3QgeyBjbGllbnRMb2dpblN0YXRlLCBzdGFydExvZ2luUmVxdWVzdCB9ID0gb3BhcXVlLmNsaWVudC5zdGFydExvZ2luKHsgcGFzc3dvcmQgfSk7XG5cdFx0XHRjb25zdCByMSA9IGF3YWl0IGh0dHBSZXF1ZXN0KHtcblx0XHRcdFx0bWV0aG9kOiBcIlBPU1RcIixcblx0XHRcdFx0dXJsOiB0aGlzLmhvc3QgKyBcImxvZ2luLzFcIixcblx0XHRcdFx0cmVzcG9uc2VUeXBlOiBcInRleHRcIixcblx0XHRcdFx0cmVxdWVzdEJvZHlTdHJpbmc6IEpTT04uc3RyaW5naWZ5KHsgdXNlcm5hbWUsIHN0YXJ0TG9naW5SZXF1ZXN0IH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAocjEuc3RhdHVzICE9PSAyMDApIHRocm93IG5ldyBFcnJvcihcIkxvZ2luIGZhaWxlZDogXCIgKyByMS5zdGF0dXNUZXh0KTtcblx0XHRcdGNvbnN0IHsgbG9naW5SZXNwb25zZSwgbG9naW5TZXNzaW9uIH0gPSBKU09OLnBhcnNlKHIxLnJlc3BvbnNlIGFzIHN0cmluZyk7XG5cdFx0XHRjb25zdCBsb2dpblJlc3VsdCA9IG9wYXF1ZS5jbGllbnQuZmluaXNoTG9naW4oeyBjbGllbnRMb2dpblN0YXRlLCBsb2dpblJlc3BvbnNlLCBwYXNzd29yZCB9KTtcblx0XHRcdGlmICghbG9naW5SZXN1bHQpIHRocm93IG5ldyBFcnJvcihcIkxvZ2luIGZhaWxlZFwiKTtcblx0XHRcdGNvbnN0IHIyID0gYXdhaXQgaHR0cFJlcXVlc3Qoe1xuXHRcdFx0XHRtZXRob2Q6IFwiUE9TVFwiLFxuXHRcdFx0XHR1cmw6IHRoaXMuaG9zdCArIFwibG9naW4vMlwiLFxuXHRcdFx0XHRyZXNwb25zZVR5cGU6IFwidGV4dFwiLFxuXHRcdFx0XHRyZXF1ZXN0Qm9keVN0cmluZzogSlNPTi5zdHJpbmdpZnkoeyBmaW5pc2hMb2dpblJlcXVlc3Q6IGxvZ2luUmVzdWx0LmZpbmlzaExvZ2luUmVxdWVzdCwgbG9naW5TZXNzaW9uIH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAocjIuc3RhdHVzICE9PSAyMDApIHRocm93IG5ldyBFcnJvcihcIkxvZ2luIGZhaWxlZDogXCIgKyByMi5zdGF0dXNUZXh0KTtcblx0XHRcdGNiKG51bGwpO1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkge1xuXHRcdFx0Y2IoZSk7XG5cdFx0fVxuXHR9XG5cblx0bG9nb3V0KGNiOiAoZXJyOiBhbnkpID0+IHZvaWQpIHtcblx0XHRodHRwUmVxdWVzdCh7XG5cdFx0XHRtZXRob2Q6IFwiUE9TVFwiLFxuXHRcdFx0dXJsOiB0aGlzLmhvc3QgKyBcImxvZ291dFwiLFxuXHRcdFx0cmVzcG9uc2VUeXBlOiBcInRleHRcIixcblx0XHR9KS50aGVuKHJlc3VsdCA9PiB7XG5cdFx0XHRpZiAocmVzdWx0LnN0YXR1cyA9PT0gMjAwIHx8IHJlc3VsdC5zdGF0dXMgPT09IDIwNCkge1xuXHRcdFx0XHRjYihudWxsKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNiKG5ldyBFcnJvcihcIkxvZ291dCBmYWlsZWQ6IFwiICsgcmVzdWx0LnN0YXR1c1RleHQpKTtcblx0XHRcdH1cblx0XHR9LCBlID0+IGNiKGUpKTtcblx0fVxuXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gVXBkYXRlIHBvbGxpbmdcblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGFzeW5jIGdldFVwZGF0ZWRUaWRkbGVycyhcblx0XHRfc3luY2VyOiBTeW5jZXI8TVdTQWRhcHRvckluZm8+LFxuXHRcdGNhbGxiYWNrOiAoZXJyOiBhbnksIHVwZGF0ZXM/OiB7IG1vZGlmaWNhdGlvbnM6IHN0cmluZ1tdOyBkZWxldGlvbnM6IHN0cmluZ1tdIH0pID0+IHZvaWRcblx0KSB7XG5cdFx0aWYgKHRoaXMub2ZmbGluZSkgcmV0dXJuIGNhbGxiYWNrKG51bGwpO1xuXHRcdHRyeSB7XG5cdFx0XHRpZiAoIXRoaXMuaW5pdGlhbExvYWREb25lKSB7XG5cdFx0XHRcdC8vIEZldGNoIGZ1bGwgbGlzdCArIGN1cnJlbnQgbGFzdFNlcSBpbiBwYXJhbGxlbCBvbiBmaXJzdCBsb2FkXG5cdFx0XHRcdGNvbnN0IFtbbGlzdE9rLCBsaXN0RXJyLCBsaXN0UmVzdWx0XSwgW3VwZE9rLCB1cGRFcnIsIHVwZFJlc3VsdF1dID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdHRoaXMucmVjaXBlUmVxdWVzdCh7IG1ldGhvZDogXCJHRVRcIiwgdXJsOiBcIi9saXN0Lmpzb25cIiB9KSxcblx0XHRcdFx0XHR0aGlzLnJlY2lwZVJlcXVlc3QoeyBtZXRob2Q6IFwiR0VUXCIsIHVybDogXCIvdXBkYXRlc1wiLCBxdWVyeVBhcmFtczogeyBzaW5jZTogXCIwXCIgfSB9KSxcblx0XHRcdFx0XSk7XG5cdFx0XHRcdGlmICghbGlzdE9rKSB0aHJvdyBhc1JlcXVlc3RFcnJvcihcIkZhaWxlZCB0byBmZXRjaCB0aWRkbGVyIGxpc3RcIiwgbGlzdEVycik7XG5cdFx0XHRcdGlmICghdXBkT2spIHRocm93IGFzUmVxdWVzdEVycm9yKFwiRmFpbGVkIHRvIGZldGNoIHVwZGF0ZXNcIiwgdXBkRXJyKTtcblx0XHRcdFx0Y29uc3QgbGlzdCA9IGxpc3RSZXN1bHQhLnJlc3BvbnNlSlNPTiBhcyBUaWRkbGVySW5mb1tdO1xuXHRcdFx0XHRjb25zdCB1cGQgPSB1cGRSZXN1bHQhLnJlc3BvbnNlSlNPTiBhcyB7IG1vZGlmaWNhdGlvbnM6IHN0cmluZ1tdOyBkZWxldGlvbnM6IHN0cmluZ1tdOyBsYXN0U2VxOiBzdHJpbmcgfTtcblx0XHRcdFx0dGhpcy5zZXRMYXN0U2VxKHVwZC5sYXN0U2VxKTtcblx0XHRcdFx0dGhpcy5pbml0aWFsTG9hZERvbmUgPSB0cnVlO1xuXHRcdFx0XHRjYWxsYmFjayhudWxsLCB7IG1vZGlmaWNhdGlvbnM6IGxpc3QubWFwKHQgPT4gdC50aXRsZSksIGRlbGV0aW9uczogW10gfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBbb2ssIGVyciwgcmVzdWx0XSA9IGF3YWl0IHRoaXMucmVjaXBlUmVxdWVzdCh7XG5cdFx0XHRcdFx0bWV0aG9kOiBcIkdFVFwiLFxuXHRcdFx0XHRcdHVybDogXCIvdXBkYXRlc1wiLFxuXHRcdFx0XHRcdHF1ZXJ5UGFyYW1zOiB7IHNpbmNlOiB0aGlzLmxhc3RTZXEgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmICghb2spIHRocm93IGFzUmVxdWVzdEVycm9yKFwiRmFpbGVkIHRvIGZldGNoIHVwZGF0ZXNcIiwgZXJyKTtcblx0XHRcdFx0Y29uc3QgdXBkID0gcmVzdWx0IS5yZXNwb25zZUpTT04gYXMgeyBtb2RpZmljYXRpb25zOiBzdHJpbmdbXTsgZGVsZXRpb25zOiBzdHJpbmdbXTsgbGFzdFNlcTogc3RyaW5nIH07XG5cdFx0XHRcdHRoaXMuc2V0TGFzdFNlcSh1cGQubGFzdFNlcSk7XG5cdFx0XHRcdGNhbGxiYWNrKG51bGwsIHsgbW9kaWZpY2F0aW9uczogdXBkLm1vZGlmaWNhdGlvbnMsIGRlbGV0aW9uczogdXBkLmRlbGV0aW9ucyB9KTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlOiBhbnkpIHtcblx0XHRcdGNhbGxiYWNrKGUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gQmF0Y2ggb3BlcmF0aW9ucyAobmV3IEFQSSlcblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGFzeW5jIGxvYWRUaWRkbGVycyhvcHRpb25zOiB7XG5cdFx0c3luY2VyOiBTeW5jZXI8TVdTQWRhcHRvckluZm8+O1xuXHRcdHRpdGxlczogc3RyaW5nW107XG5cdFx0b25OZXh0OiAoZmllbGRzOiBUaWRkbGVyRmllbGRzKSA9PiB2b2lkO1xuXHRcdG9uRG9uZTogKCkgPT4gdm9pZDtcblx0XHRvbkVycm9yOiAoZXJyOiBFcnJvcikgPT4gdm9pZDtcblx0fSkge1xuXHRcdGNvbnN0IHsgdGl0bGVzLCBvbk5leHQsIG9uRG9uZSwgb25FcnJvciB9ID0gb3B0aW9ucztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuYmF0Y2hPcDxCYXRjaFJlYWRSZXN1bHRbXT4oXCJyZWFkXCIsIHsgdGl0bGVzIH0pO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHJlc3VsdHMpIHtcblx0XHRcdFx0aWYgKCFpdGVtKSBjb250aW51ZTtcblx0XHRcdFx0dGhpcy5zZXRUaWRkbGVySW5mbyhpdGVtLmZpZWxkcy50aXRsZSwgaXRlbS5pbmZvLnJlYWRGcm9tLCB0eXBlb2YgaXRlbS5maWVsZHMucmV2aXNpb24gPT09IFwic3RyaW5nXCIgPyBpdGVtLmZpZWxkcy5yZXZpc2lvbiA6IHVuZGVmaW5lZCk7XG5cdFx0XHRcdG9uTmV4dChpdGVtLmZpZWxkcyBhcyBUaWRkbGVyRmllbGRzKTtcblx0XHRcdH1cblx0XHRcdG9uRG9uZSgpO1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkgeyBvbkVycm9yKGUpOyB9XG5cdH1cblxuXHRhc3luYyBzYXZlVGlkZGxlcnMob3B0aW9uczoge1xuXHRcdHN5bmNlcjogU3luY2VyPE1XU0FkYXB0b3JJbmZvPjtcblx0XHR0aWRkbGVyczogVGlkZGxlcltdO1xuXHRcdG9uTmV4dDogKHRpdGxlOiBzdHJpbmcsIGFkYXB0b3JJbmZvOiBNV1NBZGFwdG9ySW5mbywgcmV2aXNpb246IHN0cmluZykgPT4gdm9pZDtcblx0XHRvbkRvbmU6ICgpID0+IHZvaWQ7XG5cdFx0b25FcnJvcjogKGVycjogRXJyb3IpID0+IHZvaWQ7XG5cdH0pIHtcblx0XHRjb25zdCB7IHRpZGRsZXJzLCBvbk5leHQsIG9uRG9uZSwgb25FcnJvciB9ID0gb3B0aW9ucztcblx0XHQvLyBUaWRkbGVycyB0aGF0IGFyZSByZWFkLW9ubHkgb24gdGhlIHNlcnZlciwgdGhlIHNlcnZlci1tYW5hZ2VkIHN0b3J5XG5cdFx0Ly8gbGlzdCBhbmQgbG9jYWwgc3RhdGUgdGlkZGxlcnMgYXJlIG5ldmVyIHVwbG9hZGVkOyBtYXJrIHRoZW0gYXMgc2F2ZWRcblx0XHQvLyBsb2NhbGx5IHNvIHRoZSBzeW5jZXIgc3RvcHMgcmV0cnlpbmcgKGFuZCBzdGF5cyBxdWlldCBmb3IgYW5vbiB1c2VycykuXG5cdFx0Y29uc3QgbWFya1NhdmVkTG9jYWxseSA9ICh0aWRkbGVyOiBUaWRkbGVyKSA9PiB7XG5cdFx0XHRjb25zdCB0aXRsZSA9IHRpZGRsZXIuZmllbGRzLnRpdGxlIGFzIHN0cmluZztcblx0XHRcdHRoaXMuc2V0VGlkZGxlckluZm8odGl0bGUsIG51bGwsIFwiXCIpO1xuXHRcdFx0b25OZXh0KHRpdGxlLCB7IGJhZzogXCJcIiwgcmV2aXNpb246IFwiXCIsIHRpdGxlIH0sIFwiXCIpO1xuXHRcdH07XG5cdFx0Y29uc3QgdGlkZGxlcnNUb1NhdmUgPSB0aWRkbGVycy5maWx0ZXIodGlkZGxlciA9PiB7XG5cdFx0XHRjb25zdCB0aXRsZSA9IHRpZGRsZXIuZmllbGRzLnRpdGxlIGFzIHN0cmluZztcblx0XHRcdGlmICh0aGlzLmlzUmVhZE9ubHkgfHwgdGl0bGUgPT09IFwiJDovU3RvcnlMaXN0XCIgfHwgdGhpcy5pc1N0YXRlVGlkZGxlcih0aXRsZSkpIHtcblx0XHRcdFx0bWFya1NhdmVkTG9jYWxseSh0aWRkbGVyKTtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fSk7XG5cdFx0aWYgKCF0aWRkbGVyc1RvU2F2ZS5sZW5ndGgpIHJldHVybiBvbkRvbmUoKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuYmF0Y2hPcDxCYXRjaE11dGF0aW9uUmVzdWx0W10+KFwic2F2ZVwiLCB7XG5cdFx0XHRcdHRpZGRsZXJzOiB0aWRkbGVyc1RvU2F2ZS5tYXAodCA9PiB0LmdldEZpZWxkU3RyaW5ncygpKSxcblx0XHRcdH0pO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHJlc3VsdHMpIHtcblx0XHRcdFx0Y29uc3QgYmFnID0gaXRlbS5pbmZvLndyaXRlVG8gPz8gaXRlbS5pbmZvLnJlYWRGcm9tID8/IFwiXCI7XG5cdFx0XHRcdHRoaXMuc2V0VGlkZGxlckluZm8oaXRlbS50aXRsZSwgYmFnIHx8IG51bGwsIGl0ZW0ucmV2aXNpb24gPz8gXCJcIik7XG5cdFx0XHRcdGlmICgkdHcuYnJvd3NlclN0b3JhZ2U/LmlzRW5hYmxlZCgpKSAkdHcuYnJvd3NlclN0b3JhZ2UucmVtb3ZlVGlkZGxlckZyb21Mb2NhbFN0b3JhZ2UoaXRlbS50aXRsZSk7XG5cdFx0XHRcdG9uTmV4dChpdGVtLnRpdGxlLCB7IGJhZywgcmV2aXNpb246IGl0ZW0ucmV2aXNpb24gPz8gXCJcIiwgdGl0bGU6IGl0ZW0udGl0bGUgfSwgaXRlbS5yZXZpc2lvbiA/PyBcIlwiKTtcblx0XHRcdH1cblx0XHRcdG9uRG9uZSgpO1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkgeyBvbkVycm9yKGUpOyB9XG5cdH1cblxuXHRhc3luYyBkZWxldGVUaWRkbGVycyhvcHRpb25zOiB7XG5cdFx0c3luY2VyOiBTeW5jZXI8TVdTQWRhcHRvckluZm8+O1xuXHRcdHRpdGxlczogc3RyaW5nW107XG5cdFx0b25OZXh0OiAodGl0bGU6IHN0cmluZykgPT4gdm9pZDtcblx0XHRvbkRvbmU6ICgpID0+IHZvaWQ7XG5cdFx0b25FcnJvcjogKGVycjogRXJyb3IpID0+IHZvaWQ7XG5cdH0pIHtcblx0XHRjb25zdCB7IHRpdGxlcywgb25OZXh0LCBvbkRvbmUsIG9uRXJyb3IgfSA9IG9wdGlvbnM7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmJhdGNoT3A8QmF0Y2hNdXRhdGlvblJlc3VsdFtdPihcImRlbGV0ZVwiLCB7IHRpdGxlcyB9KTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgcmVzdWx0cy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBpdGVtID0gcmVzdWx0c1tpXTtcblx0XHRcdFx0Y29uc3QgdGl0bGUgPSBpdGVtPy50aXRsZSA/PyB0aXRsZXNbaV07XG5cdFx0XHRcdGlmICghdGl0bGUpIGNvbnRpbnVlO1xuXHRcdFx0XHR0aGlzLmNsZWFyVGlkZGxlckluZm8odGl0bGUpO1xuXHRcdFx0XHRvbk5leHQodGl0bGUpO1xuXHRcdFx0fVxuXHRcdFx0b25Eb25lKCk7XG5cdFx0fSBjYXRjaCAoZTogYW55KSB7IG9uRXJyb3IoZSk7IH1cblx0fVxuXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gU2luZ2xlLXRpZGRsZXIgb3BlcmF0aW9ucyAoZmFsbGJhY2sgZm9yIG9sZGVyIHNlcnZlciB2ZXJzaW9ucylcblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGFzeW5jIHNhdmVUaWRkbGVyKFxuXHRcdHRpZGRsZXI6IFRpZGRsZXIsXG5cdFx0Y2FsbGJhY2s6IChlcnI6IGFueSwgYWRhcHRvckluZm8/OiBNV1NBZGFwdG9ySW5mbywgcmV2aXNpb24/OiBzdHJpbmcpID0+IHZvaWRcblx0KSB7XG5cdFx0Y29uc3QgdGl0bGUgPSB0aWRkbGVyLmZpZWxkcy50aXRsZSBhcyBzdHJpbmc7XG5cdFx0aWYgKHRpdGxlID09PSBcIiQ6L1N0b3J5TGlzdFwiIHx8IHRoaXMuaXNSZWFkT25seSB8fCB0aGlzLmlzU3RhdGVUaWRkbGVyKHRpdGxlKSkgcmV0dXJuIGNhbGxiYWNrKG51bGwpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5iYXRjaE9wPEJhdGNoTXV0YXRpb25SZXN1bHRbXT4oXCJzYXZlXCIsIHsgdGlkZGxlcnM6IFt0aWRkbGVyLmdldEZpZWxkU3RyaW5ncygpXSB9KTtcblx0XHRcdGNvbnN0IGl0ZW0gPSByZXN1bHRzWzBdO1xuXHRcdFx0aWYgKCFpdGVtKSByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKFwiTm8gcmVzdWx0IHJldHVybmVkXCIpKTtcblx0XHRcdGNvbnN0IGJhZyA9IGl0ZW0uaW5mby53cml0ZVRvID8/IGl0ZW0uaW5mby5yZWFkRnJvbSA/PyBcIlwiO1xuXHRcdFx0dGhpcy5zZXRUaWRkbGVySW5mbyh0aXRsZSwgYmFnIHx8IG51bGwsIGl0ZW0ucmV2aXNpb24gPz8gXCJcIik7XG5cdFx0XHRpZiAoJHR3LmJyb3dzZXJTdG9yYWdlPy5pc0VuYWJsZWQoKSkgJHR3LmJyb3dzZXJTdG9yYWdlLnJlbW92ZVRpZGRsZXJGcm9tTG9jYWxTdG9yYWdlKHRpdGxlKTtcblx0XHRcdGNhbGxiYWNrKG51bGwsIHsgYmFnLCByZXZpc2lvbjogaXRlbS5yZXZpc2lvbiA/PyBcIlwiLCB0aXRsZSB9LCBpdGVtLnJldmlzaW9uID8/IFwiXCIpO1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkgeyBjYWxsYmFjayhlKTsgfVxuXHR9XG5cblx0YXN5bmMgbG9hZFRpZGRsZXIodGl0bGU6IHN0cmluZywgY2FsbGJhY2s6IChlcnI6IGFueSwgZmllbGRzPzogYW55KSA9PiB2b2lkLCBfb3B0aW9uczogYW55KSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmJhdGNoT3A8QmF0Y2hSZWFkUmVzdWx0W10+KFwicmVhZFwiLCB7IHRpdGxlczogW3RpdGxlXSB9KTtcblx0XHRcdGNvbnN0IGl0ZW0gPSByZXN1bHRzWzBdO1xuXHRcdFx0aWYgKCFpdGVtKSByZXR1cm4gY2FsbGJhY2sobnVsbCwgbnVsbCk7XG5cdFx0XHR0aGlzLnNldFRpZGRsZXJJbmZvKHRpdGxlLCBpdGVtLmluZm8ucmVhZEZyb20sIHR5cGVvZiBpdGVtLmZpZWxkcy5yZXZpc2lvbiA9PT0gXCJzdHJpbmdcIiA/IGl0ZW0uZmllbGRzLnJldmlzaW9uIDogdW5kZWZpbmVkKTtcblx0XHRcdGNhbGxiYWNrKG51bGwsIGl0ZW0uZmllbGRzKTtcblx0XHR9IGNhdGNoIChlOiBhbnkpIHsgY2FsbGJhY2soZSk7IH1cblx0fVxuXG5cdGFzeW5jIGRlbGV0ZVRpZGRsZXIodGl0bGU6IHN0cmluZywgY2FsbGJhY2s6IChlcnI6IGFueSwgYWRhcHRvckluZm8/OiBhbnkpID0+IHZvaWQsIF9vcHRpb25zOiBhbnkpIHtcblx0XHRpZiAodGhpcy5pc1JlYWRPbmx5KSByZXR1cm4gY2FsbGJhY2sobnVsbCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmJhdGNoT3A8QmF0Y2hNdXRhdGlvblJlc3VsdFtdPihcImRlbGV0ZVwiLCB7IHRpdGxlczogW3RpdGxlXSB9KTtcblx0XHRcdGNvbnN0IGl0ZW0gPSByZXN1bHRzWzBdO1xuXHRcdFx0aWYgKCFpdGVtKSByZXR1cm4gY2FsbGJhY2sobmV3IEVycm9yKFwiTm8gcmVzdWx0IHJldHVybmVkXCIpKTtcblx0XHRcdHRoaXMuY2xlYXJUaWRkbGVySW5mbyh0aXRsZSk7XG5cdFx0XHRjYWxsYmFjayhudWxsLCBudWxsKTtcblx0XHR9IGNhdGNoIChlOiBhbnkpIHsgY2FsbGJhY2soZSk7IH1cblx0fVxuXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gSFRUUCBoZWxwZXJzXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIGFzeW5jIGJhdGNoT3A8VD4ob3A6IHN0cmluZywgYm9keTogUmVjb3JkPHN0cmluZywgYW55Pik6IFByb21pc2U8VD4ge1xuXHRcdGNvbnN0IFtvaywgZXJyLCByZXN1bHRdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdG1ldGhvZDogXCJQVVRcIixcblx0XHRcdHVybDogXCIvYmF0Y2gvXCIgKyBvcCxcblx0XHRcdHJlcXVlc3RCb2R5U3RyaW5nOiBKU09OLnN0cmluZ2lmeShib2R5KSxcblx0XHRcdGhlYWRlcnM6IHsgXCJjb250ZW50LXR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcblx0XHR9KTtcblx0XHRpZiAoIW9rKSB0aHJvdyBlcnI7XG5cdFx0aWYgKCFyZXN1bHQhLnJlc3BvbnNlSlNPTikgdGhyb3cgbmV3IEVycm9yKFwiTm8gcmVzcG9uc2UgSlNPTiBmcm9tIGJhdGNoL1wiICsgb3ApO1xuXHRcdHJldHVybiByZXN1bHQhLnJlc3BvbnNlSlNPTiBhcyBUO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWNpcGVSZXF1ZXN0KG9wdGlvbnM6IHtcblx0XHRtZXRob2Q6IHN0cmluZztcblx0XHR1cmw6IHN0cmluZztcblx0XHRoZWFkZXJzPzogSGVhZGVyc0luaXQ7XG5cdFx0cXVlcnlQYXJhbXM/OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHRcdHJlcXVlc3RCb2R5U3RyaW5nPzogc3RyaW5nO1xuXHR9KSB7XG5cdFx0aWYgKCFvcHRpb25zLnVybC5zdGFydHNXaXRoKFwiL1wiKSkgdGhyb3cgbmV3IEVycm9yKFwiVVJMIG11c3Qgc3RhcnQgd2l0aCAvXCIpO1xuXHRcdGNvbnN0IGlzRGV2TW9kZSA9IHRoaXMuaXNEZXZNb2RlO1xuXHRcdHJldHVybiBodHRwUmVxdWVzdCh7XG5cdFx0XHQuLi5vcHRpb25zLFxuXHRcdFx0cmVzcG9uc2VUeXBlOiBcImJsb2JcIixcblx0XHRcdHVybDogdGhpcy5ob3N0ICsgXCJyZWNpcGUvXCIgKyBlbmNvZGVVUklDb21wb25lbnQodGhpcy5yZWNpcGUpICsgb3B0aW9ucy51cmwsXG5cdFx0fSkudGhlbihhc3luYyBlID0+IHtcblx0XHRcdGlmICghZS5vaykgcmV0dXJuIFtmYWxzZSwgcmVxdWVzdEZhaWx1cmUoZS5zdGF0dXMsIGUuaGVhZGVycy5nZXQoXCJ4LXJlYXNvblwiKSksIHsgLi4uZSwgcmVzcG9uc2VKU09OOiB1bmRlZmluZWQgfV0gYXMgY29uc3Q7XG5cblx0XHRcdGxldCByZXNwb25zZVN0cmluZzogc3RyaW5nO1xuXHRcdFx0aWYgKGUuaGVhZGVycy5nZXQoXCJ4LWd6aXAtc3RyZWFtXCIpID09PSBcInllc1wiKSB7XG5cdFx0XHRcdHJlc3BvbnNlU3RyaW5nID0gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0XHRcdGxldCBzID0gXCJcIjtcblx0XHRcdFx0XHRjb25zdCBneiA9IG5ldyBmZmxhdGUuQXN5bmNHdW56aXAoKGVyciwgY2h1bmssIGZpbmFsKSA9PiB7XG5cdFx0XHRcdFx0XHRpZiAoZXJyKSByZXR1cm47XG5cdFx0XHRcdFx0XHRzICs9IGZmbGF0ZS5zdHJGcm9tVTgoY2h1bmspO1xuXHRcdFx0XHRcdFx0aWYgKGZpbmFsKSByZXNvbHZlKHMpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdGlmIChpc0Rldk1vZGUpIGd6Lm9ubWVtYmVyID0gbSA9PiBjb25zb2xlLmxvZyhcImd1bnppcCBtZW1iZXJcIiwgbSk7XG5cdFx0XHRcdFx0cmVhZEJsb2JBc0FycmF5QnVmZmVyKGUucmVzcG9uc2UgYXMgQmxvYikudGhlbihidWYgPT4ge1xuXHRcdFx0XHRcdFx0Z3oucHVzaChuZXcgVWludDhBcnJheShidWYpKTtcblx0XHRcdFx0XHRcdGd6LnB1c2gobmV3IFVpbnQ4QXJyYXkoMCksIHRydWUpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlc3BvbnNlU3RyaW5nID0gZmZsYXRlLnN0ckZyb21VOChuZXcgVWludDhBcnJheShhd2FpdCByZWFkQmxvYkFzQXJyYXlCdWZmZXIoZS5yZXNwb25zZSBhcyBCbG9iKSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gW3RydWUsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHQuLi5lLFxuXHRcdFx0XHRyZXNwb25zZUpTT046IGUuc3RhdHVzID09PSAyMDAgPyB0cnlQYXJzZUpTT04ocmVzcG9uc2VTdHJpbmcpIDogdW5kZWZpbmVkLFxuXHRcdFx0fV0gYXMgY29uc3Q7XG5cdFx0fSwgZSA9PiBbZmFsc2UsIG5ldyBOZXR3b3JrRXJyb3IoZSksIHVuZGVmaW5lZF0gYXMgY29uc3QpO1xuXHR9XG59XG5cbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuLy8gVXRpbGl0aWVzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gdHJ5UGFyc2VKU09OKHM6IHN0cmluZykge1xuXHR0cnkgeyByZXR1cm4gSlNPTi5wYXJzZShzKTsgfSBjYXRjaCAoZSkgeyBjb25zb2xlLmVycm9yKFwiSlNPTiBwYXJzZSBlcnJvclwiLCBlKTsgcmV0dXJuIHVuZGVmaW5lZDsgfVxufVxuXG50eXBlIFBhcmFtc0lucHV0ID0gVVJMU2VhcmNoUGFyYW1zIHwgW3N0cmluZywgc3RyaW5nXVtdIHwgb2JqZWN0IHwgc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5pbnRlcmZhY2UgSHR0cFJlcXVlc3RPcHRpb25zPFRZUEUgZXh0ZW5kcyBcImFycmF5YnVmZmVyXCIgfCBcImJsb2JcIiB8IFwidGV4dFwiPiB7XG5cdG1ldGhvZDogc3RyaW5nO1xuXHR1cmw6IHN0cmluZztcblx0cmVzcG9uc2VUeXBlOiBUWVBFO1xuXHRoZWFkZXJzPzogSGVhZGVyc0luaXQ7XG5cdHF1ZXJ5UGFyYW1zPzogUGFyYW1zSW5wdXQ7XG5cdHJlcXVlc3RCb2R5U3RyaW5nPzogc3RyaW5nO1xufVxuXG5mdW5jdGlvbiBodHRwUmVxdWVzdDxUWVBFIGV4dGVuZHMgXCJhcnJheWJ1ZmZlclwiIHwgXCJibG9iXCIgfCBcInRleHRcIj4ob3B0aW9uczogSHR0cFJlcXVlc3RPcHRpb25zPFRZUEU+KSB7XG5cdHJldHVybiBuZXcgUHJvbWlzZTx7XG5cdFx0b2s6IGJvb2xlYW47IHN0YXR1czogbnVtYmVyOyBzdGF0dXNUZXh0OiBzdHJpbmc7IGhlYWRlcnM6IEhlYWRlcnM7XG5cdFx0cmVzcG9uc2U6IFRZUEUgZXh0ZW5kcyBcImFycmF5YnVmZmVyXCIgPyBBcnJheUJ1ZmZlciA6IFRZUEUgZXh0ZW5kcyBcImJsb2JcIiA/IEJsb2IgOiBzdHJpbmc7XG5cdH0+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRvcHRpb25zLm1ldGhvZCA9IG9wdGlvbnMubWV0aG9kLnRvVXBwZXJDYXNlKCk7XG5cdFx0Y29uc3QgdXJsID0gbmV3IFVSTChvcHRpb25zLnVybCwgbG9jYXRpb24uaHJlZik7XG5cdFx0cGFyYW1zSW5wdXQob3B0aW9ucy5xdWVyeVBhcmFtcykuZm9yRWFjaCgodiwgaykgPT4gdXJsLnNlYXJjaFBhcmFtcy5hcHBlbmQoaywgdikpO1xuXHRcdGNvbnN0IGhlYWRlcnMgPSBuZXcgSGVhZGVycyhvcHRpb25zLmhlYWRlcnMgfHwge30pO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcblx0XHRyZXF1ZXN0LnJlc3BvbnNlVHlwZSA9IG9wdGlvbnMucmVzcG9uc2VUeXBlO1xuXHRcdHJlcXVlc3Qub3BlbihvcHRpb25zLm1ldGhvZCwgdXJsLCB0cnVlKTtcblx0XHRpZiAoIWhlYWRlcnMuaGFzKFwiY29udGVudC10eXBlXCIpKSBoZWFkZXJzLnNldChcImNvbnRlbnQtdHlwZVwiLCBcImFwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZDsgY2hhcnNldD1VVEYtOFwiKTtcblx0XHRpZiAoIWhlYWRlcnMuaGFzKFwieC1yZXF1ZXN0ZWQtd2l0aFwiKSkgaGVhZGVycy5zZXQoXCJ4LXJlcXVlc3RlZC13aXRoXCIsIFwiVGlkZGx5V2lraVwiKTtcblx0XHRoZWFkZXJzLnNldChcImFjY2VwdFwiLCBcImFwcGxpY2F0aW9uL2pzb25cIik7XG5cdFx0aGVhZGVycy5mb3JFYWNoKCh2LCBrKSA9PiByZXF1ZXN0LnNldFJlcXVlc3RIZWFkZXIoaywgdikpO1xuXHRcdHJlcXVlc3Qub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuXHRcdFx0aWYgKHRoaXMucmVhZHlTdGF0ZSAhPT0gNCkgcmV0dXJuO1xuXHRcdFx0Y29uc3QgaCA9IG5ldyBIZWFkZXJzKCk7XG5cdFx0XHRyZXF1ZXN0LmdldEFsbFJlc3BvbnNlSGVhZGVycygpPy50cmltKCkuc3BsaXQoL1tcXHJcXG5dKy8pLmZvckVhY2gobGluZSA9PiB7XG5cdFx0XHRcdGNvbnN0IHBhcnRzID0gbGluZS5zcGxpdChcIjogXCIpO1xuXHRcdFx0XHRjb25zdCBrZXkgPSBwYXJ0cy5zaGlmdCgpPy50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRpZiAoa2V5KSBoLmFwcGVuZChrZXksIHBhcnRzLmpvaW4oXCI6IFwiKSk7XG5cdFx0XHR9KTtcblx0XHRcdHJlc29sdmUoeyBvazogdGhpcy5zdGF0dXMgPj0gMjAwICYmIHRoaXMuc3RhdHVzIDwgMzAwLCBzdGF0dXM6IHRoaXMuc3RhdHVzLCBzdGF0dXNUZXh0OiB0aGlzLnN0YXR1c1RleHQsIHJlc3BvbnNlOiB0aGlzLnJlc3BvbnNlLCBoZWFkZXJzOiBoIH0pO1xuXHRcdH07XG5cdFx0cmVxdWVzdC5zZW5kKG9wdGlvbnMucmVxdWVzdEJvZHlTdHJpbmcpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBwYXJhbXNJbnB1dChpbnB1dDogUGFyYW1zSW5wdXQpIHtcblx0XHRpZiAoIWlucHV0KSByZXR1cm4gbmV3IFVSTFNlYXJjaFBhcmFtcygpO1xuXHRcdGlmIChpbnB1dCBpbnN0YW5jZW9mIFVSTFNlYXJjaFBhcmFtcykgcmV0dXJuIGlucHV0O1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGlucHV0KSB8fCB0eXBlb2YgaW5wdXQgPT09IFwic3RyaW5nXCIpIHJldHVybiBuZXcgVVJMU2VhcmNoUGFyYW1zKGlucHV0KTtcblx0XHRjb25zdCBwYXJhbXMgPSBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdFx0Zm9yIChjb25zdCBrZXkgaW4gaW5wdXQpIHtcblx0XHRcdGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoaW5wdXQsIGtleSkpIHtcblx0XHRcdFx0cGFyYW1zLmFwcGVuZChrZXksIChpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KVtrZXldKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHBhcmFtcztcblx0fVxufVxuXG5mdW5jdGlvbiByZWFkQmxvYkFzQXJyYXlCdWZmZXIoYmxvYjogQmxvYikge1xuXHRyZXR1cm4gbmV3IFByb21pc2U8QXJyYXlCdWZmZXI+KChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRjb25zdCByZWFkZXIgPSBuZXcgRmlsZVJlYWRlcigpO1xuXHRcdHJlYWRlci5vbmxvYWQgPSAoKSA9PiByZXNvbHZlKHJlYWRlci5yZXN1bHQgYXMgQXJyYXlCdWZmZXIpO1xuXHRcdHJlYWRlci5vbmVycm9yID0gKCkgPT4gcmVqZWN0KG5ldyBFcnJvcihcIkVycm9yIHJlYWRpbmcgYmxvYlwiKSk7XG5cdFx0cmVhZGVyLnJlYWRBc0FycmF5QnVmZmVyKGJsb2IpO1xuXHR9KTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBFeHBvcnRcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pZiAoJHR3LmJyb3dzZXIgJiYgZG9jdW1lbnQubG9jYXRpb24ucHJvdG9jb2wuc3RhcnRzV2l0aChcImh0dHBcIikpIHtcblx0ZXhwb3J0cy5hZGFwdG9yQ2xhc3MgPSBNdWx0aVdpa2lDbGllbnRBZGFwdG9yO1xufVxuIl19