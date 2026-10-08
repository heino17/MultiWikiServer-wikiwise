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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmV3LW11bHRpd2lraWNsaWVudGFkYXB0b3IuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvbmV3LW11bHRpd2lraWNsaWVudGFkYXB0b3IudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7Ozs7Ozs7Ozs7Ozs7R0FnQkc7QUFFSCxrRUFBa0U7QUFDbEUsWUFBWSxDQUFDOzs7Ozs7Ozs7OztBQXVLYiw4RUFBOEU7QUFDOUUsWUFBWTtBQUNaLDhFQUE4RTtBQUU5RSxNQUFNLG1CQUFtQixHQUFHLGdDQUFnQyxDQUFDO0FBQzdELE1BQU0sb0JBQW9CLEdBQUcscUJBQXFCLENBQUM7QUFDbkQsTUFBTSxxQkFBcUIsR0FBRyxrQ0FBa0MsQ0FBQztBQUNqRSxNQUFNLG1CQUFtQixHQUFHLG1DQUFtQyxDQUFDO0FBQ2hFLE1BQU0sd0JBQXdCLEdBQUcsa0RBQWtELENBQUM7QUFDcEYsTUFBTSx3QkFBd0IsR0FBRywyQkFBMkIsQ0FBQztBQUM3RCxNQUFNLGlCQUFpQixHQUFHLHVDQUF1QyxDQUFDO0FBQ2xFLE1BQU0sc0JBQXNCLEdBQUcsNENBQTRDLENBQUM7QUE0QzVFOzs7NkVBRzZFO0FBQzdFLE1BQU0sWUFBYSxTQUFRLEtBQUs7SUFFL0IsWUFBWSxLQUFjO1FBQ3pCLEtBQUssQ0FBQyxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztRQUYvRCxtQkFBYyxHQUFHLElBQUksQ0FBQztRQUdyQixJQUFJLENBQUMsSUFBSSxHQUFHLGNBQWMsQ0FBQztJQUM1QixDQUFDO0NBQ0Q7QUFFRDtpRkFDaUY7QUFDakYsU0FBUyxjQUFjLENBQUMsT0FBZSxFQUFFLEtBQWM7SUFDdEQsT0FBTyxDQUFDLEtBQWtELGFBQWxELEtBQUssdUJBQUwsS0FBSyxDQUErQyxjQUFjO1FBQ3pFLENBQUMsQ0FBQyxJQUFJLFlBQVksQ0FB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a2ljbGllbnRhZGFwdG9yLmpzXG50eXBlOiBhcHBsaWNhdGlvbi9qYXZhc2NyaXB0XG5tb2R1bGUtdHlwZTogc3luY2FkYXB0b3JcblxuQSBzeW5jIGFkYXB0b3IgbW9kdWxlIGZvciBzeW5jaHJvbmlzaW5nIHdpdGggTXVsdGlXaWtpU2VydmVyLWNvbXBhdGlibGUgc2VydmVycy4gXG5cbkl0IGhhcyB0aHJlZSBrZXkgYXJlYXMgb2YgY29uY2VybjpcblxuKiBCYXNpYyBvcGVyYXRpb25zIGxpa2UgcHV0LCBnZXQsIGFuZCBkZWxldGUgYSB0aWRkbGVyIG9uIHRoZSBzZXJ2ZXJcbiogUmVhbCB0aW1lIHVwZGF0ZXMgZnJvbSB0aGUgc2VydmVyIChoYW5kbGVkIGJ5IFNTRSlcbiogQmFncyBhbmQgcmVjaXBlcywgd2hpY2ggYXJlIHVua25vd24gdG8gdGhlIHN5bmNlclxuXG5BIGtleSBhc3BlY3Qgb2YgdGhlIGRlc2lnbiBpcyB0aGF0IHRoZSBzeW5jZXIgbmV2ZXIgb3ZlcmxhcHMgYmFzaWMgc2VydmVyIG9wZXJhdGlvbnM7IGl0IHdhaXRzIGZvciB0aGVcbnByZXZpb3VzIG9wZXJhdGlvbiB0byBjb21wbGV0ZSBiZWZvcmUgc2VuZGluZyBhIG5ldyBvbmUuXG5cblxcKi9cblxuLy8gdGhlIGJsYW5rIGxpbmUgaXMgaW1wb3J0YW50LCBhbmQgc28gaXMgdGhlIGZvbGxvd2luZyB1c2Ugc3RyaWN0XG5cInVzZSBzdHJpY3RcIjtcblxuLy8gaW1wb3J0IHR5cGUgeyBTZXJ2ZXJFdmVudHNNYXAgfSBmcm9tICdAdGlkZGx5d2lraS9ldmVudHMnO1xuLy8gaW1wb3J0IHR5cGUgeyBab2RSb3V0ZSwgV2lraVN0YXR1c1JvdXRlcywgV2lraVJlY2lwZVJvdXRlcyB9IGZyb20gJ0B0aWRkbHl3aWtpL213cyc7XG4vLyBpbXBvcnQgdHlwZSB7IHpvZCB9IGZyb20gJ0B0aWRkbHl3aWtpL3NlcnZlcic7XG5pbXBvcnQgdHlwZSB7IFN5bmNlciwgVGlkZGxlciwgVGlkZGxlckZpZWxkcywgV2lraSB9IGZyb20gJ3RpZGRseXdpa2knO1xuXG4vLyBpbXBvcnQge30gZnJvbSBcIkB0aWRkbHl3aWtpL213cy1wcmlzbWFcIjtcbmRlY2xhcmUgZ2xvYmFsIHsgY29uc3QgZmZsYXRlOiB0eXBlb2YgaW1wb3J0KFwiLi9mZmxhdGVcIik7IH1cbmRlY2xhcmUgY29uc3Qgc2VsZjogbmV2ZXI7XG5kZWNsYXJlIGNvbnN0IHJlcXVpcmU6IChpZDogc3RyaW5nKSA9PiBhbnk7XG5cbmRlY2xhcmUgY2xhc3MgTG9nZ2VyIHtcblx0Y29uc3RydWN0b3IoY29tcG9uZW50TmFtZTogYW55LCBvcHRpb25zOiBhbnkpO1xuXHRjb21wb25lbnROYW1lOiBhbnk7XG5cdGNvbG91cjogYW55O1xuXHRlbmFibGU6IGFueTtcblx0c2F2ZTogYW55O1xuXHRzYXZlTGltaXQ6IGFueTtcblx0c2F2ZUJ1ZmZlckxvZ2dlcjogdGhpcztcblx0YnVmZmVyOiBzdHJpbmc7XG5cdGFsZXJ0Q291bnQ6IG51bWJlcjtcblx0c2V0U2F2ZUJ1ZmZlcihsb2dnZXI6IGFueSk6IHZvaWQ7XG5cdGxvZyguLi5hcmdzOiBhbnlbXSk6IGFueTtcblx0Z2V0QnVmZmVyKCk6IHN0cmluZztcblx0dGFibGUodmFsdWU6IGFueSk6IHZvaWQ7XG5cdGFsZXJ0KC4uLmFyZ3M6IGFueVtdKTogdm9pZDtcblx0Y2xlYXJBbGVydHMoKTogdm9pZDtcbn1cblxuZGVjbGFyZSBtb2R1bGUgJ3RpZGRseXdpa2knIHtcblx0ZXhwb3J0IGludGVyZmFjZSBTeW5jZXI8QUQ+IHtcblx0XHR3aWtpOiBXaWtpO1xuXHRcdGxvZ2dlcjogTG9nZ2VyO1xuXHRcdHRpZGRsZXJJbmZvOiBSZWNvcmQ8c3RyaW5nLCB7XG5cdFx0XHRjaGFuZ2VDb3VudDogbnVtYmVyLFxuXHRcdFx0YWRhcHRvckluZm86IEFELFxuXHRcdFx0cmV2aXNpb246IHN0cmluZyxcblx0XHRcdHRpbWVzdGFtcExhc3RTYXZlZDogRGF0ZVxuXHRcdH0+O1xuXHRcdGVucXVldWVMb2FkVGlkZGxlcih0aXRsZTogc3RyaW5nKTogdm9pZDtcblx0XHRzdG9yZVRpZGRsZXIodGlkZGxlcjogVGlkZGxlcik6IHZvaWQ7XG5cdFx0cHJvY2Vzc1Rhc2tRdWV1ZSgpOiB2b2lkO1xuXHRcdHN5bmNGcm9tU2VydmVyKCk6IHZvaWQ7XG5cdH1cblx0aW50ZXJmYWNlIElUaWRkbHlXaWtpIHtcblx0XHRicm93c2VyU3RvcmFnZTogYW55O1xuXHR9XG59XG5cbnR5cGUgU2VydmVyU3RhdHVzQ2FsbGJhY2sgPSAoXG5cdGVycjogYW55LFxuXHQvKiogXG5cdCAqICQ6L3N0YXR1cy9Jc0xvZ2dlZEluIG1vc3RseSBhcHBlYXJzIGFsb25nc2lkZSB0aGUgdXNlcm5hbWUgXG5cdCAqIG9yIG90aGVyIGxvZ2luLWNvbmRpdGlvbmFsIGJlaGF2aW9yLiBcblx0ICovXG5cdGlzTG9nZ2VkSW4/OiBib29sZWFuLFxuXHQvKipcblx0ICogJDovc3RhdHVzL1VzZXJOYW1lIGlzIHN0aWxsIHVzZWQgZm9yIHRoaW5ncyBsaWtlIGRyYWZ0cyBldmVuIGlmIHRoZSBcblx0ICogdXNlciBpc24ndCBsb2dnZWQgaW4sIGFsdGhvdWdoIHRoZSB1c2VybmFtZSBpcyBsZXNzIGxpa2VseSB0byBiZSBzaG93biBcblx0ICogdG8gdGhlIHVzZXIuIFxuXHQgKi9cblx0dXNlcm5hbWU/OiBzdHJpbmcsXG5cdC8qKiBcblx0ICogJDovc3RhdHVzL0lzUmVhZE9ubHkgcHV0cyB0aGUgVUkgaW4gcmVhZG9ubHkgbW9kZSwgXG5cdCAqIGJ1dCBkb2VzIG5vdCBwcmV2ZW50IGF1dG9tYXRpYyBjaGFuZ2VzIGZyb20gYXR0ZW1wdGluZyB0byBzYXZlLiBcblx0ICovXG5cdGlzUmVhZE9ubHk/OiBib29sZWFuLFxuXHQvKiogXG5cdCAqICQ6L3N0YXR1cy9Jc0Fub255bW91cyBkb2VzIG5vdCBhcHBlYXIgYW55d2hlcmUgaW4gdGhlIFRXNSByZXBvISBcblx0ICogU28gaXQgaGFzIG5vIGFwcGFyZW50IHB1cnBvc2UuIFxuXHQgKi9cblx0aXNBbm9ueW1vdXM/OiBib29sZWFuXG4pID0+IHZvaWRcblxuaW50ZXJmYWNlIFN5bmNBZGFwdG9yPEFEPiB7XG5cdG5hbWU/OiBzdHJpbmc7XG5cblx0aXNSZWFkeT8oKTogYm9vbGVhbjtcblxuXHRyZWdpc3RlclN5bmNlcj8oc3luY2VyOiBTeW5jZXI8QUQ+KTogdm9pZDtcblxuXHRnZXRTdGF0dXM/KFxuXHRcdGNiOiBTZXJ2ZXJTdGF0dXNDYWxsYmFja1xuXHQpOiB2b2lkO1xuXG5cdGdldFNraW5ueVRpZGRsZXJzPyhcblx0XHRjYjogKGVycjogYW55LCB0aWRkbGVyRmllbGRzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+W10pID0+IHZvaWRcblx0KTogdm9pZDtcblx0Z2V0VXBkYXRlZFRpZGRsZXJzPyhcblx0XHRzeW5jZXI6IFN5bmNlcjxBRD4sXG5cdFx0Y2I6IChcblx0XHRcdGVycjogYW55LFxuXHRcdFx0LyoqIEFycmF5cyBvZiB0aXRsZXMgdGhhdCBoYXZlIGJlZW4gbW9kaWZpZWQgb3IgZGVsZXRlZCAqL1xuXHRcdFx0dXBkYXRlcz86IHsgbW9kaWZpY2F0aW9uczogc3RyaW5nW10sIGRlbGV0aW9uczogc3RyaW5nW10gfVxuXHRcdCkgPT4gdm9pZFxuXHQpOiB2b2lkO1xuXG5cdC8qKiBcblx0ICogdXNlZCB0byBvdmVycmlkZSB0aGUgZGVmYXVsdCBTeW5jZXIgZ2V0VGlkZGxlclJldmlzaW9uIGJlaGF2aW9yXG5cdCAqIG9mIHJldHVybmluZyB0aGUgcmV2aXNpb24gZmllbGRcblx0ICogXG5cdCAqL1xuXHRnZXRUaWRkbGVyUmV2aXNpb24/KHRpdGxlOiBzdHJpbmcpOiBzdHJpbmc7XG5cdC8qKiBcblx0ICogdXNlZCB0byBnZXQgdGhlIGFkYXB0ZXIgaW5mbyBmcm9tIGEgdGlkZGxlciBpbiBzaXR1YXRpb25zXG5cdCAqIG90aGVyIHRoYW4gdGhlIHNhdmVUaWRkbGVyIGNhbGxiYWNrXG5cdCAqL1xuXHRnZXRUaWRkbGVySW5mbyh0aWRkbGVyOiBUaWRkbGVyKTogQUQgfCB1bmRlZmluZWQ7XG5cblx0c2F2ZVRpZGRsZXIoXG5cdFx0dGlkZGxlcjogYW55LFxuXHRcdGNiOiAoXG5cdFx0XHRlcnI6IGFueSxcblx0XHRcdGFkYXB0b3JJbmZvPzogQUQsXG5cdFx0XHRyZXZpc2lvbj86IHN0cmluZ1xuXHRcdCkgPT4gdm9pZCxcblx0XHRleHRyYTogeyB0aWRkbGVySW5mbzogU3luY2VyVGlkZGxlckluZm88QUQ+IH1cblx0KTogdm9pZDtcblxuXHRzYXZlVGlkZGxlcnM/KG9wdGlvbnM6IHtcblx0XHRzeW5jZXI6IFN5bmNlcjxBRD4sXG5cdFx0dGlkZGxlcnM6IFRpZGRsZXJbXSxcblx0XHRvbk5leHQ6ICh0aXRsZTogc3RyaW5nLCBhZGFwdG9ySW5mbzogYW55LCByZXZpc2lvbjogc3RyaW5nKSA9PiB2b2lkLFxuXHRcdG9uRG9uZTogKCkgPT4gdm9pZCxcblx0XHRvbkVycm9yOiAoZXJyOiBFcnJvcikgPT4gdm9pZFxuXHR9KTogdm9pZDtcblxuXHRsb2FkVGlkZGxlcnM/KG9wdGlvbnM6IHtcblx0XHRzeW5jZXI6IFN5bmNlcjxBRD4sXG5cdFx0dGl0bGVzOiBzdHJpbmdbXSxcblx0XHRvbk5leHQ6ICh0aWRkbGVyRmllbGRzOiBUaWRkbGVyRmllbGRzKSA9PiB2b2lkLFxuXHRcdG9uRG9uZTogKCkgPT4gdm9pZCxcblx0XHRvbkVycm9yOiAoZXJyOiBFcnJvcikgPT4gdm9pZFxuXHR9KTogdm9pZDtcblxuXHRkZWxldGVUaWRkbGVycz8ob3B0aW9uczoge1xuXHRcdHN5bmNlcjogU3luY2VyPEFEPixcblx0XHR0aXRsZXM6IHN0cmluZ1tdLFxuXHRcdG9uTmV4dDogKHRpdGxlOiBzdHJpbmcpID0+IHZvaWQsXG5cdFx0b25Eb25lOiAoKSA9PiB2b2lkLFxuXHRcdG9uRXJyb3I6IChlcnI6IEVycm9yKSA9PiB2b2lkXG5cdH0pOiB2b2lkO1xuXG5cdHNldExvZ2dlclNhdmVCdWZmZXI/OiAobG9nZ2VyRm9yU2F2aW5nOiBMb2dnZXIpID0+IHZvaWQ7XG5cdGRpc3BsYXlMb2dpblByb21wdD8oc3luY2VyOiBTeW5jZXI8QUQ+KTogdm9pZDtcblx0bG9naW4/KHVzZXJuYW1lOiBzdHJpbmcsIHBhc3N3b3JkOiBzdHJpbmcsIGNiOiAoZXJyOiBhbnkpID0+IHZvaWQpOiB2b2lkO1xuXHRsb2dvdXQ/KGNiOiAoZXJyOiBhbnkpID0+IHZvaWQpOiBhbnk7XG5cbn1cbmludGVyZmFjZSBTeW5jZXJUaWRkbGVySW5mbzxBRD4ge1xuXHQvKiogdGhpcyBjb21lcyBmcm9tIHRoZSB3aWtpIGNoYW5nZUNvdW50IHJlY29yZCAqL1xuXHRjaGFuZ2VDb3VudDogbnVtYmVyO1xuXHQvKiogQWRhcHRlciBpbmZvIHJldHVybmVkIGJ5IHRoZSBzeW5jIGFkYXB0ZXIgKi9cblx0YWRhcHRvckluZm86IEFEO1xuXHQvKiogUmV2aXNpb24gcmV0dXJuIGJ5IHRoZSBzeW5jIGFkYXB0ZXIgKi9cblx0cmV2aXNpb246IHN0cmluZztcblx0LyoqIFRpbWVzdGFtcCBzZXQgaW4gdGhlIGNhbGxiYWNrIG9mIHRoZSBwcmV2aW91cyBzYXZlICovXG5cdHRpbWVzdGFtcExhc3RTYXZlZDogRGF0ZTtcbn1cblxuZGVjbGFyZSBjb25zdCAkdHc6IGFueTtcblxuZGVjbGFyZSBjb25zdCBleHBvcnRzOiB7XG5cdGFkYXB0b3JDbGFzczogdHlwZW9mIE11bHRpV2lraUNsaWVudEFkYXB0b3I7XG59O1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIENvbnN0YW50c1xuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNvbnN0IENPTkZJR19IT1NUX1RJRERMRVIgPSBcIiQ6L2NvbmZpZy9tdWx0aXdpa2ljbGllbnQvaG9zdFwiO1xuY29uc3QgREVGQVVMVF9IT1NUX1RJRERMRVIgPSBcIiRwcm90b2NvbCQvLyRob3N0JC9cIjtcbmNvbnN0IENPTkZJR19SRUNJUEVfVElERExFUiA9IFwiJDovY29uZmlnL211bHRpd2lraWNsaWVudC9yZWNpcGVcIjtcbmNvbnN0IElTX0RFVl9NT0RFX1RJRERMRVIgPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC9kZXYtbW9kZVwiO1xuY29uc3QgTEFTVF9SRVZJU0lPTl9JRF9USURETEVSID0gXCIkOi9zdGF0ZS9tdWx0aXdpa2ljbGllbnQvcmVjaXBlL2xhc3RfcmV2aXNpb25faWRcIjtcbmNvbnN0IE1XQ19TVEFURV9USURETEVSX1BSRUZJWCA9IFwiJDovc3RhdGUvbXVsdGl3aWtpY2xpZW50L1wiO1xuY29uc3QgQkFHX1NUQVRFX1RJRERMRVIgPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC90aWRkbGVycy9iYWdcIjtcbmNvbnN0IFJFVklTSU9OX1NUQVRFX1RJRERMRVIgPSBcIiQ6L3N0YXRlL211bHRpd2lraWNsaWVudC90aWRkbGVycy9yZXZpc2lvblwiO1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIFR5cGVzXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuaW50ZXJmYWNlIE1XU0FkYXB0b3JJbmZvIHtcblx0YmFnOiBzdHJpbmc7XG5cdHJldmlzaW9uOiBzdHJpbmc7XG5cdHRpdGxlOiBzdHJpbmc7XG59XG5cbi8vIE9QQVFVRSAoUEFLRSkgY2xpZW50IHN1cmZhY2UgcHJvdmlkZWQgYnkgdGhlIGJ1bmRsZWQgbGlicmFyeSB0aWRkbGVyXG5pbnRlcmZhY2UgT3BhcXVlQ2xpZW50IHtcblx0cmVhZHk6IFByb21pc2U8dW5rbm93bj47XG5cdGNsaWVudDoge1xuXHRcdHN0YXJ0TG9naW4oYXJnczogeyBwYXNzd29yZDogc3RyaW5nIH0pOiB7IGNsaWVudExvZ2luU3RhdGU6IHVua25vd247IHN0YXJ0TG9naW5SZXF1ZXN0OiBzdHJpbmcgfTtcblx0XHRmaW5pc2hMb2dpbihhcmdzOiB7IGNsaWVudExvZ2luU3RhdGU6IHVua25vd247IGxvZ2luUmVzcG9uc2U6IHN0cmluZzsgcGFzc3dvcmQ6IHN0cmluZyB9KTpcblx0XHRcdHsgZmluaXNoTG9naW5SZXF1ZXN0OiBzdHJpbmc7IHNlc3Npb25LZXk6IHN0cmluZyB9IHwgbnVsbDtcblx0fTtcbn1cblxuLy8gU3RhdHVzIHJlc3BvbnNlIGZyb20gR0VUIC9yZWNpcGUvOmlkL3N0YXR1c1xuaW50ZXJmYWNlIFJlY2lwZVN0YXR1cyB7XG5cdGlzQWRtaW46IGJvb2xlYW47XG5cdHVzZXJfaWQ6IHN0cmluZztcblx0dXNlcm5hbWU6IHN0cmluZztcblx0aXNMb2dnZWRJbjogYm9vbGVhbjtcblx0dGVtcGxhdGU6IHsgdHlwZTogc3RyaW5nOyBkZWZpbml0aW9uOiB1bmtub3duOyBwYXJhbWV0ZXJzOiB1bmtub3duIH07XG5cdGJhZ3M6IHsgYmFnX2lkOiBzdHJpbmc7IGJhZ19uYW1lOiBzdHJpbmc7IGlzX3dyaXRhYmxlOiBib29sZWFuOyBwcmlvcml0eTogbnVtYmVyOyBjYW5Vc2VyV3JpdGU6IGJvb2xlYW47IGluZm86IHVua25vd24gfVtdO1xufVxuXG4vLyBUaWRkbGVySW5mbyBmcm9tIHJlc29sdmVyXG5pbnRlcmZhY2UgVGlkZGxlckluZm8ge1xuXHR0aXRsZTogc3RyaW5nO1xuXHR3cml0ZVRvOiBzdHJpbmcgfCBudWxsO1xuXHRyZWFkRnJvbTogc3RyaW5nIHwgbnVsbDtcblx0ZXhpc3RzSW46IHN0cmluZ1tdO1xuXHRjYW5Xcml0ZTogYm9vbGVhbjtcbn1cblxudHlwZSBCYXRjaE11dGF0aW9uUmVzdWx0ID0geyB0aXRsZTogc3RyaW5nOyBpbmZvOiBUaWRkbGVySW5mbzsgcmV2aXNpb24/OiBzdHJpbmcgfTtcbnR5cGUgQmF0Y2hSZWFkUmVzdWx0ID0geyBmaWVsZHM6IFJlY29yZDxzdHJpbmcsIGFueT4gJiB7IHRpdGxlOiBzdHJpbmcgfTsgaW5mbzogVGlkZGxlckluZm8gfSB8IG51bGw7XG5cbi8qKiBBIHJlcXVlc3QgdGhhdCBuZXZlciByZWFjaGVkIHRoZSBzZXJ2ZXI6IHRoZSBjb25uZWN0aW9uIGlzIGdvbmUsIHRoZVxuICogIHNlcnZlciBpcyB1bnJlYWNoYWJsZSwgdGhlIHJlcXVlc3Qgd2FzIGFib3J0ZWQgb3IgdGltZWQgb3V0LiBNYXJrZWQgc28gdGhhdFxuICogIHRoZSBzeW5jZXIgY2FuIHRlbGwgXCJuZXR3b3JrIGdvbmVcIiBmcm9tIFwic2VydmVyIGFuc3dlcmVkIHdpdGggYW4gZXJyb3JcIixcbiAqICB3aGljaCBpcyB3aGF0IGRlY2lkZXMgYmV0d2VlbiB0aGUgY29ubmVjdGlvbiBhbGVydCBhbmQgdGhlIG5vcm1hbCBvbmUuICovXG5jbGFzcyBOZXR3b3JrRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cdGlzTmV0d29ya0Vycm9yID0gdHJ1ZTtcblx0Y29uc3RydWN0b3IoY2F1c2U6IHVua25vd24pIHtcblx0XHRzdXBlcihjYXVzZSBpbnN0YW5jZW9mIEVycm9yID8gY2F1c2UubWVzc2FnZSA6IFN0cmluZyhjYXVzZSkpO1xuXHRcdHRoaXMubmFtZSA9IFwiTmV0d29ya0Vycm9yXCI7XG5cdH1cbn1cblxuLyoqIEEgcmVxdWVzdCBlcnJvciB0aGF0IGtlZXBzIHRoZSBkaXN0aW5jdGlvbjogYSBmYWlsZWQgcmVxdWVzdCB0aGF0IG5ldmVyXG4gKiAgcmVhY2hlZCB0aGUgc2VydmVyIHN0YXlzIGEgTmV0d29ya0Vycm9yLCBhbiBhbnN3ZXJlZCBvbmUgYmVjb21lcyBhbiBFcnJvci4gKi9cbmZ1bmN0aW9uIGFzUmVxdWVzdEVycm9yKG1lc3NhZ2U6IHN0cmluZywgY2F1c2U6IHVua25vd24pIHtcblx0cmV0dXJuIChjYXVzZSBhcyB7IGlzTmV0d29ya0Vycm9yPzogYm9vbGVhbiB9IHwgdW5kZWZpbmVkKT8uaXNOZXR3b3JrRXJyb3Jcblx0XHQ/IG5ldyBOZXR3b3JrRXJyb3IobmV3IEVycm9yKG1lc3NhZ2UpKVxuXHRcdDogbmV3IEVycm9yKG1lc3NhZ2UpO1xufVxuXG4vKiogaHR0cFJlcXVlc3QgYW5zd2VycyBpbnN0ZWFkIG9mIHJlamVjdGluZywgYW5kIGEgcmVxdWVzdCB0aGF0IG5ldmVyIHJlYWNoZWRcbiAqICB0aGUgc2VydmVyIGNvbWVzIGJhY2sgd2l0aCBzdGF0dXMgMDogdGhlIG5ldHdvcmsgaXMgZ29uZSwgbm90IHRoZSBzZXJ2ZXJcbiAqICBjb21wbGFpbmluZy4gRXZlcnkgb3RoZXIgc3RhdHVzIGlzIGEgcmVhbCBhbnN3ZXIgYW5kIHN0YXlzIGFuIEVycm9yLiAqL1xuZnVuY3Rpb24gcmVxdWVzdEZhaWx1cmUoc3RhdHVzOiBudW1iZXIsIHJlYXNvbjogc3RyaW5nIHwgbnVsbCkge1xuXHRyZXR1cm4gc3RhdHVzID09PSAwXG5cdFx0PyBuZXcgTmV0d29ya0Vycm9yKG5ldyBFcnJvcihcIlNlcnZlciB1bnJlYWNoYWJsZVwiKSlcblx0XHQ6IG5ldyBFcnJvcihgU2VydmVyIHJldHVybmVkICR7c3RhdHVzfTogJHtyZWFzb24gPz8gXCIobm8gcmVhc29uKVwifWApO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEFkYXB0b3Jcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5jbGFzcyBNdWx0aVdpa2lDbGllbnRBZGFwdG9yIGltcGxlbWVudHMgU3luY0FkYXB0b3I8TVdTQWRhcHRvckluZm8+IHtcblx0bmFtZSA9IFwibXVsdGl3aWtpY2xpZW50XCI7XG5cblx0cHJpdmF0ZSB3aWtpOiBXaWtpO1xuXHRwcml2YXRlIGhvc3Q6IHN0cmluZztcblx0cHJpdmF0ZSByZWNpcGU6IHN0cmluZztcblx0cHJpdmF0ZSBpc0Rldk1vZGU6IGJvb2xlYW47XG5cdHByaXZhdGUgbG9nZ2VyOiBMb2dnZXI7XG5cdHByaXZhdGUgc3luY2VyOiBTeW5jZXI8TVdTQWRhcHRvckluZm8+IHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSBpc0xvZ2dlZEluID0gZmFsc2U7XG5cdHByaXZhdGUgaXNSZWFkT25seSA9IHRydWU7XG5cdHByaXZhdGUgb2ZmbGluZSA9IGZhbHNlO1xuXHRwcml2YXRlIHVzZXJuYW1lID0gXCJcIjtcblx0ZXJyb3I6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgbGFzdFNlcSA9IFwiMFwiO1xuXHRwcml2YXRlIGluaXRpYWxMb2FkRG9uZSA9IGZhbHNlO1xuXHQvKiogdGl0bGUg4oaSIGJhZyBuYW1lLCBwb3B1bGF0ZWQgb24gbG9hZC9zYXZlICovXG5cdHByaXZhdGUgdGlkZGxlckJhZyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdC8qKiB0aXRsZSDihpIgcmV2aXNpb24sIHBvcHVsYXRlZCBvbiBzYXZlICovXG5cdHByaXZhdGUgdGlkZGxlclJldmlzaW9uID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblxuXHRjb25zdHJ1Y3RvcihvcHRpb25zOiB7IHdpa2k6IFdpa2kgfSkge1xuXHRcdHRoaXMud2lraSA9IG9wdGlvbnMud2lraTtcblx0XHR0aGlzLmhvc3QgPSB0aGlzLmdldEhvc3QoKTtcblx0XHR0aGlzLnJlY2lwZSA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChDT05GSUdfUkVDSVBFX1RJRERMRVIsIFwiXCIpITtcblx0XHR0aGlzLmlzRGV2TW9kZSA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChJU19ERVZfTU9ERV9USURETEVSKSA9PT0gXCJ5ZXNcIjtcblx0XHR0aGlzLmxhc3RTZXEgPSB0aGlzLndpa2kuZ2V0VGlkZGxlclRleHQoTEFTVF9SRVZJU0lPTl9JRF9USURETEVSLCBcIjBcIikhO1xuXHRcdHRoaXMuaW5pdGlhbExvYWREb25lID0gdGhpcy5sYXN0U2VxICE9PSBcIjBcIjtcblx0XHR0aGlzLmxvZ2dlciA9IG5ldyAkdHcudXRpbHMuTG9nZ2VyKFwiTXVsdGlXaWtpQ2xpZW50QWRhcHRvclwiKTtcblx0fVxuXG5cdGlzUmVhZHkoKSB7IHJldHVybiB0cnVlOyB9XG5cblx0c2V0TG9nZ2VyU2F2ZUJ1ZmZlcihsb2dnZXI6IExvZ2dlcikgeyB0aGlzLmxvZ2dlci5zZXRTYXZlQnVmZmVyKGxvZ2dlcik7IH1cblxuXHRyZWdpc3RlclN5bmNlcihzeW5jZXI6IFN5bmNlcjxNV1NBZGFwdG9ySW5mbz4pIHsgdGhpcy5zeW5jZXIgPSBzeW5jZXI7IH1cblxuXHRwcml2YXRlIGlzU3RhdGVUaWRkbGVyKHRpdGxlOiBzdHJpbmcpIHtcblx0XHRyZXR1cm4gdGl0bGUuc3RhcnRzV2l0aChNV0NfU1RBVEVfVElERExFUl9QUkVGSVgpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRUaWRkbGVySW5mbyh0aXRsZTogc3RyaW5nLCBiYWc6IHN0cmluZyB8IG51bGwsIHJldmlzaW9uPzogc3RyaW5nKSB7XG5cdFx0aWYgKGJhZykge1xuXHRcdFx0dGhpcy50aWRkbGVyQmFnLnNldCh0aXRsZSwgYmFnKTtcblx0XHRcdHRoaXMud2lraS5zZXRUZXh0KEJBR19TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgYmFnLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRpZGRsZXJCYWcuZGVsZXRlKHRpdGxlKTtcblx0XHRcdHRoaXMud2lraS5zZXRUZXh0KEJBR19TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgdW5kZWZpbmVkLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHRcdH1cblx0XHRpZiAocmV2aXNpb24pIHtcblx0XHRcdHRoaXMudGlkZGxlclJldmlzaW9uLnNldCh0aXRsZSwgcmV2aXNpb24pO1xuXHRcdFx0dGhpcy53aWtpLnNldFRleHQoUkVWSVNJT05fU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIHJldmlzaW9uLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY2xlYXJUaWRkbGVySW5mbyh0aXRsZTogc3RyaW5nKSB7XG5cdFx0dGhpcy50aWRkbGVyQmFnLmRlbGV0ZSh0aXRsZSk7XG5cdFx0dGhpcy50aWRkbGVyUmV2aXNpb24uZGVsZXRlKHRpdGxlKTtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChCQUdfU1RBVEVfVElERExFUiwgbnVsbCwgdGl0bGUsIHVuZGVmaW5lZCwgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0XHR0aGlzLndpa2kuc2V0VGV4dChSRVZJU0lPTl9TVEFURV9USURETEVSLCBudWxsLCB0aXRsZSwgdW5kZWZpbmVkLCB7IHN1cHByZXNzVGltZXN0YW1wOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRMYXN0U2VxKHNlcTogc3RyaW5nKSB7XG5cdFx0dGhpcy5sYXN0U2VxID0gc2VxO1xuXHRcdHRoaXMud2lraS5zZXRUZXh0KExBU1RfUkVWSVNJT05fSURfVElERExFUiwgbnVsbCwgXCJ0ZXh0XCIsIHNlcSwgeyBzdXBwcmVzc1RpbWVzdGFtcDogdHJ1ZSB9KTtcblx0fVxuXG5cdGdldFRpZGRsZXJSZXZpc2lvbih0aXRsZTogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMud2lraS5leHRyYWN0VGlkZGxlckRhdGFJdGVtKFJFVklTSU9OX1NUQVRFX1RJRERMRVIsIHRpdGxlKSA/PyBcIlwiO1xuXHR9XG5cblx0Z2V0VGlkZGxlckluZm8odGlkZGxlcjogVGlkZGxlcik6IE1XU0FkYXB0b3JJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCB0aXRsZSA9IHRpZGRsZXIuZmllbGRzLnRpdGxlIGFzIHN0cmluZztcblx0XHRjb25zdCBiYWcgPSB0aGlzLndpa2kuZXh0cmFjdFRpZGRsZXJEYXRhSXRlbShCQUdfU1RBVEVfVElERExFUiwgdGl0bGUpID8/IHRoaXMudGlkZGxlckJhZy5nZXQodGl0bGUpO1xuXHRcdGNvbnN0IHJldmlzaW9uID0gdGhpcy53aWtpLmV4dHJhY3RUaWRkbGVyRGF0YUl0ZW0oUkVWSVNJT05fU1RBVEVfVElERExFUiwgdGl0bGUpID8/IHRoaXMudGlkZGxlclJldmlzaW9uLmdldCh0aXRsZSk7XG5cdFx0cmV0dXJuIGJhZyAmJiByZXZpc2lvbiA/IHsgYmFnLCByZXZpc2lvbiwgdGl0bGUgfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SG9zdCgpIHtcblx0XHRsZXQgdGV4dCA9IHRoaXMud2lraS5nZXRUaWRkbGVyVGV4dChDT05GSUdfSE9TVF9USURETEVSLCBERUZBVUxUX0hPU1RfVElERExFUikhO1xuXHRcdFtcblx0XHRcdHsgbmFtZTogXCJwcm90b2NvbFwiLCB2YWx1ZTogZG9jdW1lbnQubG9jYXRpb24ucHJvdG9jb2wgfSxcblx0XHRcdHsgbmFtZTogXCJob3N0XCIsICAgICB2YWx1ZTogZG9jdW1lbnQubG9jYXRpb24uaG9zdCB9LFxuXHRcdFx0eyBuYW1lOiBcInBhdGhuYW1lXCIsIHZhbHVlOiBkb2N1bWVudC5sb2NhdGlvbi5wYXRobmFtZSB9LFxuXHRcdF0uZm9yRWFjaCgoeyBuYW1lLCB2YWx1ZSB9KSA9PiB7XG5cdFx0XHR0ZXh0ID0gJHR3LnV0aWxzLnJlcGxhY2VTdHJpbmcodGV4dCwgbmV3IFJlZ0V4cChcIlxcXFwkXCIgKyBuYW1lICsgXCJcXFxcJFwiLCBcIm1nXCIpLCB2YWx1ZSk7XG5cdFx0fSk7XG5cdFx0cmV0dXJuIHRleHQ7XG5cdH1cblxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vIFN0YXR1c1xuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0YXN5bmMgZ2V0U3RhdHVzKGNhbGxiYWNrOiBTZXJ2ZXJTdGF0dXNDYWxsYmFjaykge1xuXHRcdGNvbnN0IFtvaywgLCByZXN1bHRdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHsgbWV0aG9kOiBcIkdFVFwiLCB1cmw6IFwiL3N0YXR1c1wiIH0pO1xuXHRcdGlmICghb2sgJiYgcmVzdWx0Py5zdGF0dXMgPT09IDApIHtcblx0XHRcdHRoaXMub2ZmbGluZSA9IHRydWU7XG5cdFx0XHR0aGlzLmlzTG9nZ2VkSW4gPSBmYWxzZTtcblx0XHRcdHRoaXMuaXNSZWFkT25seSA9IHRydWU7XG5cdFx0XHR0aGlzLnVzZXJuYW1lID0gXCIob2ZmbGluZSlcIjtcblx0XHRcdHRoaXMuZXJyb3IgPSBcIlRoZSB3ZWJwYWdlIGlzIGZvcmJpZGRlbiBmcm9tIGNvbnRhY3RpbmcgdGhlIHNlcnZlci5cIjtcblx0XHR9IGVsc2UgaWYgKG9rKSB7XG5cdFx0XHRjb25zdCBzdGF0dXMgPSByZXN1bHQhLnJlc3BvbnNlSlNPTiBhcyBSZWNpcGVTdGF0dXM7XG5cdFx0XHR0aGlzLm9mZmxpbmUgPSBmYWxzZTtcblx0XHRcdHRoaXMuZXJyb3IgPSBudWxsO1xuXHRcdFx0dGhpcy5pc0xvZ2dlZEluID0gc3RhdHVzPy5pc0xvZ2dlZEluID8/IGZhbHNlO1xuXHRcdFx0dGhpcy51c2VybmFtZSA9IHN0YXR1cz8udXNlcm5hbWUgPz8gXCIoYW5vbilcIjtcblx0XHRcdHRoaXMuaXNSZWFkT25seSA9ICEoc3RhdHVzPy5iYWdzPy5zb21lKGIgPT4gYi5jYW5Vc2VyV3JpdGUpID8/IGZhbHNlKTtcblx0XHRcdHRoaXMud3JpdGVJc0FkbWluKHN0YXR1cyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZXJyb3IgPSBgU2VydmVyIGVycm9yICR7cmVzdWx0Py5zdGF0dXN9YDtcblx0XHR9XG5cdFx0Y2FsbGJhY2sodGhpcy5lcnJvciwgdGhpcy5pc0xvZ2dlZEluLCB0aGlzLnVzZXJuYW1lLCB0aGlzLmlzUmVhZE9ubHksIGZhbHNlKTtcblx0fVxuXG5cdC8qKiBUaGUgc3RhdHVzIHJlc3BvbnNlIGlzIHRoZSBvbmx5IHBsYWNlIHdoZXJlIHRoZSBjbGllbnQgbGVhcm5zIHdoZXRoZXIgdGhlXG5cdCAqICB1c2VyIGlzIGFuIGFkbWluLiBUaGUgc2hlbGwtdXBkYXRlIGJhbm5lciByZWFkcyB0aGlzIHRpZGRsZXIgdG8gZGVjaWRlXG5cdCAqICB3aG8gbWF5IGFjY2VwdCBhIG5ldyB0ZW1wbGF0ZSB2ZXJzaW9uLiAqL1xuXHRwcml2YXRlIHdyaXRlSXNBZG1pbihzdGF0dXM6IFJlY2lwZVN0YXR1cyB8IG51bGwpIHtcblx0XHR0aGlzLndpa2kuYWRkVGlkZGxlcih7XG5cdFx0XHR0aXRsZTogXCIkOi9zdGF0dXMvSXNBZG1pblwiLFxuXHRcdFx0dGV4dDogc3RhdHVzPy5pc0FkbWluID8gXCJ5ZXNcIiA6IFwibm9cIixcblx0XHR9KTtcblx0fVxuXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gTG9naW4gLyBMb2dvdXRcblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHQvLyBQZXJmb3JtcyBhbiBPUEFRVUUgKFBBS0UpIHBhc3N3b3JkIGxvZ2luIGFnYWluc3QgdGhlIE1XUyBzZXNzaW9uXG5cdC8vIGVuZHBvaW50cy4gT24gc3VjY2VzcyB0aGUgc2VydmVyIHNldHMgYSBzZXNzaW9uIGNvb2tpZSAocGF0aCBcIi9cIikgd2hpY2hcblx0Ly8gYXV0b21hdGljYWxseSBhdXRob3Jpc2VzIGFsbCBzdWJzZXF1ZW50IHNhbWUtb3JpZ2luIHJlcXVlc3RzLCBzbyB0aGVcblx0Ly8gd2lraSBiZWNvbWVzIHdyaXRhYmxlIHdpdGhvdXQgdmlzaXRpbmcgdGhlIC9sb2dpbiBwYWdlLlxuXG5cdGFzeW5jIGxvZ2luKHVzZXJuYW1lOiBzdHJpbmcsIHBhc3N3b3JkOiBzdHJpbmcsIGNiOiAoZXJyOiBhbnkpID0+IHZvaWQpIHtcblx0XHRjb25zdCBvcGFxdWUgPSByZXF1aXJlKFwiJDovcGx1Z2lucy9td3MvY2xpZW50L2xpYnJhcnkvb3BhcXVlXCIpIGFzIE9wYXF1ZUNsaWVudDtcblx0XHR0cnkge1xuXHRcdFx0aWYgKCF1c2VybmFtZSB8fCAhcGFzc3dvcmQpIHRocm93IG5ldyBFcnJvcihcIlVzZXJuYW1lIGFuZCBwYXNzd29yZCBhcmUgcmVxdWlyZWRcIik7XG5cdFx0XHRhd2FpdCBvcGFxdWUucmVhZHk7XG5cdFx0XHRjb25zdCB7IGNsaWVudExvZ2luU3RhdGUsIHN0YXJ0TG9naW5SZXF1ZXN0IH0gPSBvcGFxdWUuY2xpZW50LnN0YXJ0TG9naW4oeyBwYXNzd29yZCB9KTtcblx0XHRcdGNvbnN0IHIxID0gYXdhaXQgaHR0cFJlcXVlc3Qoe1xuXHRcdFx0XHRtZXRob2Q6IFwiUE9TVFwiLFxuXHRcdFx0XHR1cmw6IHRoaXMuaG9zdCArIFwibG9naW4vMVwiLFxuXHRcdFx0XHRyZXNwb25zZVR5cGU6IFwidGV4dFwiLFxuXHRcdFx0XHRyZXF1ZXN0Qm9keVN0cmluZzogSlNPTi5zdHJpbmdpZnkoeyB1c2VybmFtZSwgc3RhcnRMb2dpblJlcXVlc3QgfSksXG5cdFx0XHR9KTtcblx0XHRcdGlmIChyMS5zdGF0dXMgIT09IDIwMCkgdGhyb3cgbmV3IEVycm9yKFwiTG9naW4gZmFpbGVkOiBcIiArIHIxLnN0YXR1c1RleHQpO1xuXHRcdFx0Y29uc3QgeyBsb2dpblJlc3BvbnNlLCBsb2dpblNlc3Npb24gfSA9IEpTT04ucGFyc2UocjEucmVzcG9uc2UgYXMgc3RyaW5nKTtcblx0XHRcdGNvbnN0IGxvZ2luUmVzdWx0ID0gb3BhcXVlLmNsaWVudC5maW5pc2hMb2dpbih7IGNsaWVudExvZ2luU3RhdGUsIGxvZ2luUmVzcG9uc2UsIHBhc3N3b3JkIH0pO1xuXHRcdFx0aWYgKCFsb2dpblJlc3VsdCkgdGhyb3cgbmV3IEVycm9yKFwiTG9naW4gZmFpbGVkXCIpO1xuXHRcdFx0Y29uc3QgcjIgPSBhd2FpdCBodHRwUmVxdWVzdCh7XG5cdFx0XHRcdG1ldGhvZDogXCJQT1NUXCIsXG5cdFx0XHRcdHVybDogdGhpcy5ob3N0ICsgXCJsb2dpbi8yXCIsXG5cdFx0XHRcdHJlc3BvbnNlVHlwZTogXCJ0ZXh0XCIsXG5cdFx0XHRcdHJlcXVlc3RCb2R5U3RyaW5nOiBKU09OLnN0cmluZ2lmeSh7IGZpbmlzaExvZ2luUmVxdWVzdDogbG9naW5SZXN1bHQuZmluaXNoTG9naW5SZXF1ZXN0LCBsb2dpblNlc3Npb24gfSksXG5cdFx0XHR9KTtcblx0XHRcdGlmIChyMi5zdGF0dXMgIT09IDIwMCkgdGhyb3cgbmV3IEVycm9yKFwiTG9naW4gZmFpbGVkOiBcIiArIHIyLnN0YXR1c1RleHQpO1xuXHRcdFx0Y2IobnVsbCk7XG5cdFx0fSBjYXRjaCAoZTogYW55KSB7XG5cdFx0XHRjYihlKTtcblx0XHR9XG5cdH1cblxuXHRsb2dvdXQoY2I6IChlcnI6IGFueSkgPT4gdm9pZCkge1xuXHRcdGh0dHBSZXF1ZXN0KHtcblx0XHRcdG1ldGhvZDogXCJQT1NUXCIsXG5cdFx0XHR1cmw6IHRoaXMuaG9zdCArIFwibG9nb3V0XCIsXG5cdFx0XHRyZXNwb25zZVR5cGU6IFwidGV4dFwiLFxuXHRcdH0pLnRoZW4ocmVzdWx0ID0+IHtcblx0XHRcdGlmIChyZXN1bHQuc3RhdHVzID09PSAyMDAgfHwgcmVzdWx0LnN0YXR1cyA9PT0gMjA0KSB7XG5cdFx0XHRcdGNiKG51bGwpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y2IobmV3IEVycm9yKFwiTG9nb3V0IGZhaWxlZDogXCIgKyByZXN1bHQuc3RhdHVzVGV4dCkpO1xuXHRcdFx0fVxuXHRcdH0sIGUgPT4gY2IoZSkpO1xuXHR9XG5cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHQvLyBVcGRhdGUgcG9sbGluZ1xuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0YXN5bmMgZ2V0VXBkYXRlZFRpZGRsZXJzKFxuXHRcdF9zeW5jZXI6IFN5bmNlcjxNV1NBZGFwdG9ySW5mbz4sXG5cdFx0Y2FsbGJhY2s6IChlcnI6IGFueSwgdXBkYXRlcz86IHsgbW9kaWZpY2F0aW9uczogc3RyaW5nW107IGRlbGV0aW9uczogc3RyaW5nW10gfSkgPT4gdm9pZFxuXHQpIHtcblx0XHRpZiAodGhpcy5vZmZsaW5lKSByZXR1cm4gY2FsbGJhY2sobnVsbCk7XG5cdFx0dHJ5IHtcblx0XHRcdGlmICghdGhpcy5pbml0aWFsTG9hZERvbmUpIHtcblx0XHRcdFx0Ly8gRmV0Y2ggZnVsbCBsaXN0ICsgY3VycmVudCBsYXN0U2VxIGluIHBhcmFsbGVsIG9uIGZpcnN0IGxvYWRcblx0XHRcdFx0Y29uc3QgW1tsaXN0T2ssIGxpc3RFcnIsIGxpc3RSZXN1bHRdLCBbdXBkT2ssIHVwZEVyciwgdXBkUmVzdWx0XV0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0dGhpcy5yZWNpcGVSZXF1ZXN0KHsgbWV0aG9kOiBcIkdFVFwiLCB1cmw6IFwiL2xpc3QuanNvblwiIH0pLFxuXHRcdFx0XHRcdHRoaXMucmVjaXBlUmVxdWVzdCh7IG1ldGhvZDogXCJHRVRcIiwgdXJsOiBcIi91cGRhdGVzXCIsIHF1ZXJ5UGFyYW1zOiB7IHNpbmNlOiBcIjBcIiB9IH0pLFxuXHRcdFx0XHRdKTtcblx0XHRcdFx0aWYgKCFsaXN0T2spIHRocm93IGFzUmVxdWVzdEVycm9yKFwiRmFpbGVkIHRvIGZldGNoIHRpZGRsZXIgbGlzdFwiLCBsaXN0RXJyKTtcblx0XHRcdFx0aWYgKCF1cGRPaykgdGhyb3cgYXNSZXF1ZXN0RXJyb3IoXCJGYWlsZWQgdG8gZmV0Y2ggdXBkYXRlc1wiLCB1cGRFcnIpO1xuXHRcdFx0XHRjb25zdCBsaXN0ID0gbGlzdFJlc3VsdCEucmVzcG9uc2VKU09OIGFzIFRpZGRsZXJJbmZvW107XG5cdFx0XHRcdGNvbnN0IHVwZCA9IHVwZFJlc3VsdCEucmVzcG9uc2VKU09OIGFzIHsgbW9kaWZpY2F0aW9uczogc3RyaW5nW107IGRlbGV0aW9uczogc3RyaW5nW107IGxhc3RTZXE6IHN0cmluZyB9O1xuXHRcdFx0XHR0aGlzLnNldExhc3RTZXEodXBkLmxhc3RTZXEpO1xuXHRcdFx0XHR0aGlzLmluaXRpYWxMb2FkRG9uZSA9IHRydWU7XG5cdFx0XHRcdGNhbGxiYWNrKG51bGwsIHsgbW9kaWZpY2F0aW9uczogbGlzdC5tYXAodCA9PiB0LnRpdGxlKSwgZGVsZXRpb25zOiBbXSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IFtvaywgZXJyLCByZXN1bHRdID0gYXdhaXQgdGhpcy5yZWNpcGVSZXF1ZXN0KHtcblx0XHRcdFx0XHRtZXRob2Q6IFwiR0VUXCIsXG5cdFx0XHRcdFx0dXJsOiBcIi91cGRhdGVzXCIsXG5cdFx0XHRcdFx0cXVlcnlQYXJhbXM6IHsgc2luY2U6IHRoaXMubGFzdFNlcSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKCFvaykgdGhyb3cgYXNSZXF1ZXN0RXJyb3IoXCJGYWlsZWQgdG8gZmV0Y2ggdXBkYXRlc1wiLCBlcnIpO1xuXHRcdFx0XHRjb25zdCB1cGQgPSByZXN1bHQhLnJlc3BvbnNlSlNPTiBhcyB7IG1vZGlmaWNhdGlvbnM6IHN0cmluZ1tdOyBkZWxldGlvbnM6IHN0cmluZ1tdOyBsYXN0U2VxOiBzdHJpbmcgfTtcblx0XHRcdFx0dGhpcy5zZXRMYXN0U2VxKHVwZC5sYXN0U2VxKTtcblx0XHRcdFx0Y2FsbGJhY2sobnVsbCwgeyBtb2RpZmljYXRpb25zOiB1cGQubW9kaWZpY2F0aW9ucywgZGVsZXRpb25zOiB1cGQuZGVsZXRpb25zIH0pO1xuXHRcdFx0fVxuXHRcdH0gY2F0Y2ggKGU6IGFueSkge1xuXHRcdFx0Y2FsbGJhY2soZSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHQvLyBCYXRjaCBvcGVyYXRpb25zIChuZXcgQVBJKVxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0YXN5bmMgbG9hZFRpZGRsZXJzKG9wdGlvbnM6IHtcblx0XHRzeW5jZXI6IFN5bmNlcjxNV1NBZGFwdG9ySW5mbz47XG5cdFx0dGl0bGVzOiBzdHJpbmdbXTtcblx0XHRvbk5leHQ6IChmaWVsZHM6IFRpZGRsZXJGaWVsZHMpID0+IHZvaWQ7XG5cdFx0b25Eb25lOiAoKSA9PiB2b2lkO1xuXHRcdG9uRXJyb3I6IChlcnI6IEVycm9yKSA9PiB2b2lkO1xuXHR9KSB7XG5cdFx0Y29uc3QgeyB0aXRsZXMsIG9uTmV4dCwgb25Eb25lLCBvbkVycm9yIH0gPSBvcHRpb25zO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5iYXRjaE9wPEJhdGNoUmVhZFJlc3VsdFtdPihcInJlYWRcIiwgeyB0aXRsZXMgfSk7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgcmVzdWx0cykge1xuXHRcdFx0XHRpZiAoIWl0ZW0pIGNvbnRpbnVlO1xuXHRcdFx0XHR0aGlzLnNldFRpZGRsZXJJbmZvKGl0ZW0uZmllbGRzLnRpdGxlLCBpdGVtLmluZm8ucmVhZEZyb20sIHR5cGVvZiBpdGVtLmZpZWxkcy5yZXZpc2lvbiA9PT0gXCJzdHJpbmdcIiA/IGl0ZW0uZmllbGRzLnJldmlzaW9uIDogdW5kZWZpbmVkKTtcblx0XHRcdFx0b25OZXh0KGl0ZW0uZmllbGRzIGFzIFRpZGRsZXJGaWVsZHMpO1xuXHRcdFx0fVxuXHRcdFx0b25Eb25lKCk7XG5cdFx0fSBjYXRjaCAoZTogYW55KSB7IG9uRXJyb3IoZSk7IH1cblx0fVxuXG5cdGFzeW5jIHNhdmVUaWRkbGVycyhvcHRpb25zOiB7XG5cdFx0c3luY2VyOiBTeW5jZXI8TVdTQWRhcHRvckluZm8+O1xuXHRcdHRpZGRsZXJzOiBUaWRkbGVyW107XG5cdFx0b25OZXh0OiAodGl0bGU6IHN0cmluZywgYWRhcHRvckluZm86IE1XU0FkYXB0b3JJbmZvLCByZXZpc2lvbjogc3RyaW5nKSA9PiB2b2lkO1xuXHRcdG9uRG9uZTogKCkgPT4gdm9pZDtcblx0XHRvbkVycm9yOiAoZXJyOiBFcnJvcikgPT4gdm9pZDtcblx0fSkge1xuXHRcdGNvbnN0IHsgdGlkZGxlcnMsIG9uTmV4dCwgb25Eb25lLCBvbkVycm9yIH0gPSBvcHRpb25zO1xuXHRcdC8vIFRpZGRsZXJzIHRoYXQgYXJlIHJlYWQtb25seSBvbiB0aGUgc2VydmVyLCB0aGUgc2VydmVyLW1hbmFnZWQgc3Rvcnlcblx0XHQvLyBsaXN0IGFuZCBsb2NhbCBzdGF0ZSB0aWRkbGVycyBhcmUgbmV2ZXIgdXBsb2FkZWQ7IG1hcmsgdGhlbSBhcyBzYXZlZFxuXHRcdC8vIGxvY2FsbHkgc28gdGhlIHN5bmNlciBzdG9wcyByZXRyeWluZyAoYW5kIHN0YXlzIHF1aWV0IGZvciBhbm9uIHVzZXJzKS5cblx0XHRjb25zdCBtYXJrU2F2ZWRMb2NhbGx5ID0gKHRpZGRsZXI6IFRpZGRsZXIpID0+IHtcblx0XHRcdGNvbnN0IHRpdGxlID0gdGlkZGxlci5maWVsZHMudGl0bGUgYXMgc3RyaW5nO1xuXHRcdFx0dGhpcy5zZXRUaWRkbGVySW5mbyh0aXRsZSwgbnVsbCwgXCJcIik7XG5cdFx0XHRvbk5leHQodGl0bGUsIHsgYmFnOiBcIlwiLCByZXZpc2lvbjogXCJcIiwgdGl0bGUgfSwgXCJcIik7XG5cdFx0fTtcblx0XHRjb25zdCB0aWRkbGVyc1RvU2F2ZSA9IHRpZGRsZXJzLmZpbHRlcih0aWRkbGVyID0+IHtcblx0XHRcdGNvbnN0IHRpdGxlID0gdGlkZGxlci5maWVsZHMudGl0bGUgYXMgc3RyaW5nO1xuXHRcdFx0aWYgKHRoaXMuaXNSZWFkT25seSB8fCB0aXRsZSA9PT0gXCIkOi9TdG9yeUxpc3RcIiB8fCB0aGlzLmlzU3RhdGVUaWRkbGVyKHRpdGxlKSkge1xuXHRcdFx0XHRtYXJrU2F2ZWRMb2NhbGx5KHRpZGRsZXIpO1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KTtcblx0XHRpZiAoIXRpZGRsZXJzVG9TYXZlLmxlbmd0aCkgcmV0dXJuIG9uRG9uZSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgdGhpcy5iYXRjaE9wPEJhdGNoTXV0YXRpb25SZXN1bHRbXT4oXCJzYXZlXCIsIHtcblx0XHRcdFx0dGlkZGxlcnM6IHRpZGRsZXJzVG9TYXZlLm1hcCh0ID0+IHQuZ2V0RmllbGRTdHJpbmdzKCkpLFxuXHRcdFx0fSk7XG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgcmVzdWx0cykge1xuXHRcdFx0XHRjb25zdCBiYWcgPSBpdGVtLmluZm8ud3JpdGVUbyA/PyBpdGVtLmluZm8ucmVhZEZyb20gPz8gXCJcIjtcblx0XHRcdFx0dGhpcy5zZXRUaWRkbGVySW5mbyhpdGVtLnRpdGxlLCBiYWcgfHwgbnVsbCwgaXRlbS5yZXZpc2lvbiA/PyBcIlwiKTtcblx0XHRcdFx0aWYgKCR0dy5icm93c2VyU3RvcmFnZT8uaXNFbmFibGVkKCkpICR0dy5icm93c2VyU3RvcmFnZS5yZW1vdmVUaWRkbGVyRnJvbUxvY2FsU3RvcmFnZShpdGVtLnRpdGxlKTtcblx0XHRcdFx0b25OZXh0KGl0ZW0udGl0bGUsIHsgYmFnLCByZXZpc2lvbjogaXRlbS5yZXZpc2lvbiA/PyBcIlwiLCB0aXRsZTogaXRlbS50aXRsZSB9LCBpdGVtLnJldmlzaW9uID8/IFwiXCIpO1xuXHRcdFx0fVxuXHRcdFx0b25Eb25lKCk7XG5cdFx0fSBjYXRjaCAoZTogYW55KSB7IG9uRXJyb3IoZSk7IH1cblx0fVxuXG5cdGFzeW5jIGRlbGV0ZVRpZGRsZXJzKG9wdGlvbnM6IHtcblx0XHRzeW5jZXI6IFN5bmNlcjxNV1NBZGFwdG9ySW5mbz47XG5cdFx0dGl0bGVzOiBzdHJpbmdbXTtcblx0XHRvbk5leHQ6ICh0aXRsZTogc3RyaW5nKSA9PiB2b2lkO1xuXHRcdG9uRG9uZTogKCkgPT4gdm9pZDtcblx0XHRvbkVycm9yOiAoZXJyOiBFcnJvcikgPT4gdm9pZDtcblx0fSkge1xuXHRcdGNvbnN0IHsgdGl0bGVzLCBvbk5leHQsIG9uRG9uZSwgb25FcnJvciB9ID0gb3B0aW9ucztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuYmF0Y2hPcDxCYXRjaE11dGF0aW9uUmVzdWx0W10+KFwiZGVsZXRlXCIsIHsgdGl0bGVzIH0pO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIHJlc3VsdHMpIHtcblx0XHRcdFx0dGhpcy5jbGVhclRpZGRsZXJJbmZvKGl0ZW0udGl0bGUpO1xuXHRcdFx0XHRvbk5leHQoaXRlbS50aXRsZSk7XG5cdFx0XHR9XG5cdFx0XHRvbkRvbmUoKTtcblx0XHR9IGNhdGNoIChlOiBhbnkpIHsgb25FcnJvcihlKTsgfVxuXHR9XG5cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHQvLyBTaW5nbGUtdGlkZGxlciBvcGVyYXRpb25zIChmYWxsYmFjayBmb3Igb2xkZXIgc2VydmVyIHZlcnNpb25zKVxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0YXN5bmMgc2F2ZVRpZGRsZXIoXG5cdFx0dGlkZGxlcjogVGlkZGxlcixcblx0XHRjYWxsYmFjazogKGVycjogYW55LCBhZGFwdG9ySW5mbz86IE1XU0FkYXB0b3JJbmZvLCByZXZpc2lvbj86IHN0cmluZykgPT4gdm9pZFxuXHQpIHtcblx0XHRjb25zdCB0aXRsZSA9IHRpZGRsZXIuZmllbGRzLnRpdGxlIGFzIHN0cmluZztcblx0XHRpZiAodGl0bGUgPT09IFwiJDovU3RvcnlMaXN0XCIgfHwgdGhpcy5pc1JlYWRPbmx5IHx8IHRoaXMuaXNTdGF0ZVRpZGRsZXIodGl0bGUpKSByZXR1cm4gY2FsbGJhY2sobnVsbCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCB0aGlzLmJhdGNoT3A8QmF0Y2hNdXRhdGlvblJlc3VsdFtdPihcInNhdmVcIiwgeyB0aWRkbGVyczogW3RpZGRsZXIuZ2V0RmllbGRTdHJpbmdzKCldIH0pO1xuXHRcdFx0Y29uc3QgaXRlbSA9IHJlc3VsdHNbMF07XG5cdFx0XHRpZiAoIWl0ZW0pIHJldHVybiBjYWxsYmFjayhuZXcgRXJyb3IoXCJObyByZXN1bHQgcmV0dXJuZWRcIikpO1xuXHRcdFx0Y29uc3QgYmFnID0gaXRlbS5pbmZvLndyaXRlVG8gPz8gaXRlbS5pbmZvLnJlYWRGcm9tID8/IFwiXCI7XG5cdFx0XHR0aGlzLnNldFRpZGRsZXJJbmZvKHRpdGxlLCBiYWcgfHwgbnVsbCwgaXRlbS5yZXZpc2lvbiA/PyBcIlwiKTtcblx0XHRcdGlmICgkdHcuYnJvd3NlclN0b3JhZ2U/LmlzRW5hYmxlZCgpKSAkdHcuYnJvd3NlclN0b3JhZ2UucmVtb3ZlVGlkZGxlckZyb21Mb2NhbFN0b3JhZ2UodGl0bGUpO1xuXHRcdFx0Y2FsbGJhY2sobnVsbCwgeyBiYWcsIHJldmlzaW9uOiBpdGVtLnJldmlzaW9uID8/IFwiXCIsIHRpdGxlIH0sIGl0ZW0ucmV2aXNpb24gPz8gXCJcIik7XG5cdFx0fSBjYXRjaCAoZTogYW55KSB7IGNhbGxiYWNrKGUpOyB9XG5cdH1cblxuXHRhc3luYyBsb2FkVGlkZGxlcih0aXRsZTogc3RyaW5nLCBjYWxsYmFjazogKGVycjogYW55LCBmaWVsZHM/OiBhbnkpID0+IHZvaWQsIF9vcHRpb25zOiBhbnkpIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuYmF0Y2hPcDxCYXRjaFJlYWRSZXN1bHRbXT4oXCJyZWFkXCIsIHsgdGl0bGVzOiBbdGl0bGVdIH0pO1xuXHRcdFx0Y29uc3QgaXRlbSA9IHJlc3VsdHNbMF07XG5cdFx0XHRpZiAoIWl0ZW0pIHJldHVybiBjYWxsYmFjayhudWxsLCBudWxsKTtcblx0XHRcdHRoaXMuc2V0VGlkZGxlckluZm8odGl0bGUsIGl0ZW0uaW5mby5yZWFkRnJvbSwgdHlwZW9mIGl0ZW0uZmllbGRzLnJldmlzaW9uID09PSBcInN0cmluZ1wiID8gaXRlbS5maWVsZHMucmV2aXNpb24gOiB1bmRlZmluZWQpO1xuXHRcdFx0Y2FsbGJhY2sobnVsbCwgaXRlbS5maWVsZHMpO1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkgeyBjYWxsYmFjayhlKTsgfVxuXHR9XG5cblx0YXN5bmMgZGVsZXRlVGlkZGxlcih0aXRsZTogc3RyaW5nLCBjYWxsYmFjazogKGVycjogYW55LCBhZGFwdG9ySW5mbz86IGFueSkgPT4gdm9pZCwgX29wdGlvbnM6IGFueSkge1xuXHRcdGlmICh0aGlzLmlzUmVhZE9ubHkpIHJldHVybiBjYWxsYmFjayhudWxsKTtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IHRoaXMuYmF0Y2hPcDxCYXRjaE11dGF0aW9uUmVzdWx0W10+KFwiZGVsZXRlXCIsIHsgdGl0bGVzOiBbdGl0bGVdIH0pO1xuXHRcdFx0Y29uc3QgaXRlbSA9IHJlc3VsdHNbMF07XG5cdFx0XHRpZiAoIWl0ZW0pIHJldHVybiBjYWxsYmFjayhuZXcgRXJyb3IoXCJObyByZXN1bHQgcmV0dXJuZWRcIikpO1xuXHRcdFx0dGhpcy5jbGVhclRpZGRsZXJJbmZvKHRpdGxlKTtcblx0XHRcdGNhbGxiYWNrKG51bGwsIG51bGwpO1xuXHRcdH0gY2F0Y2ggKGU6IGFueSkgeyBjYWxsYmFjayhlKTsgfVxuXHR9XG5cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHQvLyBIVFRQIGhlbHBlcnNcblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgYXN5bmMgYmF0Y2hPcDxUPihvcDogc3RyaW5nLCBib2R5OiBSZWNvcmQ8c3RyaW5nLCBhbnk+KTogUHJvbWlzZTxUPiB7XG5cdFx0Y29uc3QgW29rLCBlcnIsIHJlc3VsdF0gPSBhd2FpdCB0aGlzLnJlY2lwZVJlcXVlc3Qoe1xuXHRcdFx0bWV0aG9kOiBcIlBVVFwiLFxuXHRcdFx0dXJsOiBcIi9iYXRjaC9cIiArIG9wLFxuXHRcdFx0cmVxdWVzdEJvZHlTdHJpbmc6IEpTT04uc3RyaW5naWZ5KGJvZHkpLFxuXHRcdFx0aGVhZGVyczogeyBcImNvbnRlbnQtdHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiB9LFxuXHRcdH0pO1xuXHRcdGlmICghb2spIHRocm93IGVycjtcblx0XHRpZiAoIXJlc3VsdCEucmVzcG9uc2VKU09OKSB0aHJvdyBuZXcgRXJyb3IoXCJObyByZXNwb25zZSBKU09OIGZyb20gYmF0Y2gvXCIgKyBvcCk7XG5cdFx0cmV0dXJuIHJlc3VsdCEucmVzcG9uc2VKU09OIGFzIFQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlY2lwZVJlcXVlc3Qob3B0aW9uczoge1xuXHRcdG1ldGhvZDogc3RyaW5nO1xuXHRcdHVybDogc3RyaW5nO1xuXHRcdGhlYWRlcnM/OiBIZWFkZXJzSW5pdDtcblx0XHRxdWVyeVBhcmFtcz86IFJlY29yZDxzdHJpbmcsIHN0cmluZz47XG5cdFx0cmVxdWVzdEJvZHlTdHJpbmc/OiBzdHJpbmc7XG5cdH0pIHtcblx0XHRpZiAoIW9wdGlvbnMudXJsLnN0YXJ0c1dpdGgoXCIvXCIpKSB0aHJvdyBuZXcgRXJyb3IoXCJVUkwgbXVzdCBzdGFydCB3aXRoIC9cIik7XG5cdFx0Y29uc3QgaXNEZXZNb2RlID0gdGhpcy5pc0Rldk1vZGU7XG5cdFx0cmV0dXJuIGh0dHBSZXF1ZXN0KHtcblx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRyZXNwb25zZVR5cGU6IFwiYmxvYlwiLFxuXHRcdFx0dXJsOiB0aGlzLmhvc3QgKyBcInJlY2lwZS9cIiArIGVuY29kZVVSSUNvbXBvbmVudCh0aGlzLnJlY2lwZSkgKyBvcHRpb25zLnVybCxcblx0XHR9KS50aGVuKGFzeW5jIGUgPT4ge1xuXHRcdFx0aWYgKCFlLm9rKSByZXR1cm4gW2ZhbHNlLCByZXF1ZXN0RmFpbHVyZShlLnN0YXR1cywgZS5oZWFkZXJzLmdldChcIngtcmVhc29uXCIpKSwgeyAuLi5lLCByZXNwb25zZUpTT046IHVuZGVmaW5lZCB9XSBhcyBjb25zdDtcblxuXHRcdFx0bGV0IHJlc3BvbnNlU3RyaW5nOiBzdHJpbmc7XG5cdFx0XHRpZiAoZS5oZWFkZXJzLmdldChcIngtZ3ppcC1zdHJlYW1cIikgPT09IFwieWVzXCIpIHtcblx0XHRcdFx0cmVzcG9uc2VTdHJpbmcgPSBhd2FpdCBuZXcgUHJvbWlzZTxzdHJpbmc+KChyZXNvbHZlKSA9PiB7XG5cdFx0XHRcdFx0bGV0IHMgPSBcIlwiO1xuXHRcdFx0XHRcdGNvbnN0IGd6ID0gbmV3IGZmbGF0ZS5Bc3luY0d1bnppcCgoZXJyLCBjaHVuaywgZmluYWwpID0+IHtcblx0XHRcdFx0XHRcdGlmIChlcnIpIHJldHVybjtcblx0XHRcdFx0XHRcdHMgKz0gZmZsYXRlLnN0ckZyb21VOChjaHVuayk7XG5cdFx0XHRcdFx0XHRpZiAoZmluYWwpIHJlc29sdmUocyk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0aWYgKGlzRGV2TW9kZSkgZ3oub25tZW1iZXIgPSBtID0+IGNvbnNvbGUubG9nKFwiZ3VuemlwIG1lbWJlclwiLCBtKTtcblx0XHRcdFx0XHRyZWFkQmxvYkFzQXJyYXlCdWZmZXIoZS5yZXNwb25zZSBhcyBCbG9iKS50aGVuKGJ1ZiA9PiB7XG5cdFx0XHRcdFx0XHRnei5wdXNoKG5ldyBVaW50OEFycmF5KGJ1ZikpO1xuXHRcdFx0XHRcdFx0Z3oucHVzaChuZXcgVWludDhBcnJheSgwKSwgdHJ1ZSk7XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzcG9uc2VTdHJpbmcgPSBmZmxhdGUuc3RyRnJvbVU4KG5ldyBVaW50OEFycmF5KGF3YWl0IHJlYWRCbG9iQXNBcnJheUJ1ZmZlcihlLnJlc3BvbnNlIGFzIEJsb2IpKSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBbdHJ1ZSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdC4uLmUsXG5cdFx0XHRcdHJlc3BvbnNlSlNPTjogZS5zdGF0dXMgPT09IDIwMCA/IHRyeVBhcnNlSlNPTihyZXNwb25zZVN0cmluZykgOiB1bmRlZmluZWQsXG5cdFx0XHR9XSBhcyBjb25zdDtcblx0XHR9LCBlID0+IFtmYWxzZSwgbmV3IE5ldHdvcmtFcnJvcihlKSwgdW5kZWZpbmVkXSBhcyBjb25zdCk7XG5cdH1cbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBVdGlsaXRpZXNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiB0cnlQYXJzZUpTT04oczogc3RyaW5nKSB7XG5cdHRyeSB7IHJldHVybiBKU09OLnBhcnNlKHMpOyB9IGNhdGNoIChlKSB7IGNvbnNvbGUuZXJyb3IoXCJKU09OIHBhcnNlIGVycm9yXCIsIGUpOyByZXR1cm4gdW5kZWZpbmVkOyB9XG59XG5cbnR5cGUgUGFyYW1zSW5wdXQgPSBVUkxTZWFyY2hQYXJhbXMgfCBbc3RyaW5nLCBzdHJpbmddW10gfCBvYmplY3QgfCBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cbmludGVyZmFjZSBIdHRwUmVxdWVzdE9wdGlvbnM8VFlQRSBleHRlbmRzIFwiYXJyYXlidWZmZXJcIiB8IFwiYmxvYlwiIHwgXCJ0ZXh0XCI+IHtcblx0bWV0aG9kOiBzdHJpbmc7XG5cdHVybDogc3RyaW5nO1xuXHRyZXNwb25zZVR5cGU6IFRZUEU7XG5cdGhlYWRlcnM/OiBIZWFkZXJzSW5pdDtcblx0cXVlcnlQYXJhbXM/OiBQYXJhbXNJbnB1dDtcblx0cmVxdWVzdEJvZHlTdHJpbmc/OiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGh0dHBSZXF1ZXN0PFRZUEUgZXh0ZW5kcyBcImFycmF5YnVmZmVyXCIgfCBcImJsb2JcIiB8IFwidGV4dFwiPihvcHRpb25zOiBIdHRwUmVxdWVzdE9wdGlvbnM8VFlQRT4pIHtcblx0cmV0dXJuIG5ldyBQcm9taXNlPHtcblx0XHRvazogYm9vbGVhbjsgc3RhdHVzOiBudW1iZXI7IHN0YXR1c1RleHQ6IHN0cmluZzsgaGVhZGVyczogSGVhZGVycztcblx0XHRyZXNwb25zZTogVFlQRSBleHRlbmRzIFwiYXJyYXlidWZmZXJcIiA/IEFycmF5QnVmZmVyIDogVFlQRSBleHRlbmRzIFwiYmxvYlwiID8gQmxvYiA6IHN0cmluZztcblx0fT4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdG9wdGlvbnMubWV0aG9kID0gb3B0aW9ucy5tZXRob2QudG9VcHBlckNhc2UoKTtcblx0XHRjb25zdCB1cmwgPSBuZXcgVVJMKG9wdGlvbnMudXJsLCBsb2NhdGlvbi5ocmVmKTtcblx0XHRwYXJhbXNJbnB1dChvcHRpb25zLnF1ZXJ5UGFyYW1zKS5mb3JFYWNoKCh2LCBrKSA9PiB1cmwuc2VhcmNoUGFyYW1zLmFwcGVuZChrLCB2KSk7XG5cdFx0Y29uc3QgaGVhZGVycyA9IG5ldyBIZWFkZXJzKG9wdGlvbnMuaGVhZGVycyB8fCB7fSk7XG5cdFx0Y29uc3QgcmVxdWVzdCA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuXHRcdHJlcXVlc3QucmVzcG9uc2VUeXBlID0gb3B0aW9ucy5yZXNwb25zZVR5cGU7XG5cdFx0cmVxdWVzdC5vcGVuKG9wdGlvbnMubWV0aG9kLCB1cmwsIHRydWUpO1xuXHRcdGlmICghaGVhZGVycy5oYXMoXCJjb250ZW50LXR5cGVcIikpIGhlYWRlcnMuc2V0KFwiY29udGVudC10eXBlXCIsIFwiYXBwbGljYXRpb24veC13d3ctZm9ybS11cmxlbmNvZGVkOyBjaGFyc2V0PVVURi04XCIpO1xuXHRcdGlmICghaGVhZGVycy5oYXMoXCJ4LXJlcXVlc3RlZC13aXRoXCIpKSBoZWFkZXJzLnNldChcIngtcmVxdWVzdGVkLXdpdGhcIiwgXCJUaWRkbHlXaWtpXCIpO1xuXHRcdGhlYWRlcnMuc2V0KFwiYWNjZXB0XCIsIFwiYXBwbGljYXRpb24vanNvblwiKTtcblx0XHRoZWFkZXJzLmZvckVhY2goKHYsIGspID0+IHJlcXVlc3Quc2V0UmVxdWVzdEhlYWRlcihrLCB2KSk7XG5cdFx0cmVxdWVzdC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG5cdFx0XHRpZiAodGhpcy5yZWFkeVN0YXRlICE9PSA0KSByZXR1cm47XG5cdFx0XHRjb25zdCBoID0gbmV3IEhlYWRlcnMoKTtcblx0XHRcdHJlcXVlc3QuZ2V0QWxsUmVzcG9uc2VIZWFkZXJzKCk/LnRyaW0oKS5zcGxpdCgvW1xcclxcbl0rLykuZm9yRWFjaChsaW5lID0+IHtcblx0XHRcdFx0Y29uc3QgcGFydHMgPSBsaW5lLnNwbGl0KFwiOiBcIik7XG5cdFx0XHRcdGNvbnN0IGtleSA9IHBhcnRzLnNoaWZ0KCk/LnRvTG93ZXJDYXNlKCk7XG5cdFx0XHRcdGlmIChrZXkpIGguYXBwZW5kKGtleSwgcGFydHMuam9pbihcIjogXCIpKTtcblx0XHRcdH0pO1xuXHRcdFx0cmVzb2x2ZSh7IG9rOiB0aGlzLnN0YXR1cyA+PSAyMDAgJiYgdGhpcy5zdGF0dXMgPCAzMDAsIHN0YXR1czogdGhpcy5zdGF0dXMsIHN0YXR1c1RleHQ6IHRoaXMuc3RhdHVzVGV4dCwgcmVzcG9uc2U6IHRoaXMucmVzcG9uc2UsIGhlYWRlcnM6IGggfSk7XG5cdFx0fTtcblx0XHRyZXF1ZXN0LnNlbmQob3B0aW9ucy5yZXF1ZXN0Qm9keVN0cmluZyk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHBhcmFtc0lucHV0KGlucHV0OiBQYXJhbXNJbnB1dCkge1xuXHRcdGlmICghaW5wdXQpIHJldHVybiBuZXcgVVJMU2VhcmNoUGFyYW1zKCk7XG5cdFx0aWYgKGlucHV0IGluc3RhbmNlb2YgVVJMU2VhcmNoUGFyYW1zKSByZXR1cm4gaW5wdXQ7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkoaW5wdXQpIHx8IHR5cGVvZiBpbnB1dCA9PT0gXCJzdHJpbmdcIikgcmV0dXJuIG5ldyBVUkxTZWFyY2hQYXJhbXMoaW5wdXQpO1xuXHRcdGNvbnN0IHBhcmFtcyA9IG5ldyBVUkxTZWFyY2hQYXJhbXMoKTtcblx0XHRmb3IgKGNvbnN0IGtleSBpbiBpbnB1dCkge1xuXHRcdFx0aWYgKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChpbnB1dCwga2V5KSkge1xuXHRcdFx0XHRwYXJhbXMuYXBwZW5kKGtleSwgKGlucHV0IGFzIFJlY29yZDxzdHJpbmcsIHN0cmluZz4pW2tleV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcGFyYW1zO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlYWRCbG9iQXNBcnJheUJ1ZmZlcihibG9iOiBCbG9iKSB7XG5cdHJldHVybiBuZXcgUHJvbWlzZTxBcnJheUJ1ZmZlcj4oKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGNvbnN0IHJlYWRlciA9IG5ldyBGaWxlUmVhZGVyKCk7XG5cdFx0cmVhZGVyLm9ubG9hZCA9ICgpID0+IHJlc29sdmUocmVhZGVyLnJlc3VsdCBhcyBBcnJheUJ1ZmZlcik7XG5cdFx0cmVhZGVyLm9uZXJyb3IgPSAoKSA9PiByZWplY3QobmV3IEVycm9yKFwiRXJyb3IgcmVhZGluZyBibG9iXCIpKTtcblx0XHRyZWFkZXIucmVhZEFzQXJyYXlCdWZmZXIoYmxvYik7XG5cdH0pO1xufVxuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEV4cG9ydFxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmlmICgkdHcuYnJvd3NlciAmJiBkb2N1bWVudC5sb2NhdGlvbi5wcm90b2NvbC5zdGFydHNXaXRoKFwiaHR0cFwiKSkge1xuXHRleHBvcnRzLmFkYXB0b3JDbGFzcyA9IE11bHRpV2lraUNsaWVudEFkYXB0b3I7XG59XG4iXX0=