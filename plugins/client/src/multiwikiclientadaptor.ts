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

import type { Syncer, Tiddler, ITiddlyWiki } from "tiddlywiki";
import type { TiddlerRouter } from "@tiddlywiki/mws/src/routes/managers/router-tiddlers";
import type { ZodRoute } from "@tiddlywiki/mws/src/router";


declare class Logger {
	constructor(componentName: any, options: any);
	componentName: any;
	colour: any;
	enable: any;
	save: any;
	saveLimit: any;
	saveBufferLogger: this;
	buffer: string;
	alertCount: number;
	setSaveBuffer(logger: any): void;
	log(...args: any[]): any;
	getBuffer(): string;
	table(value: any): void;
	alert(...args: any[]): void;
	clearAlerts(): void;
}

type TiddlerRouterResponse = {
	[K in keyof TiddlerRouter]: TiddlerRouter[K] extends ZodRoute<infer M, infer B, infer P, infer T, infer R>
	? { M: M, B: B, P: P, T: T, R: R }
	: never
}

declare module 'tiddlywiki' {
	export interface Syncer {
		wiki: Wiki;
		logger: Logger;
		tiddlerInfo: Record<string, { bag: string; revision: string }>;
		enqueueLoadTiddler(title: string): void;
		storeTiddler(tiddler: Tiddler): void;
		processTaskQueue(): void;
	}
	interface ITiddlyWiki {
		browserStorage: any;
	}
}

type ServerStatusCallback = (
	err: any,
	/** 
	 * $:/status/IsLoggedIn mostly appears alongside the username 
	 * or other login-conditional behavior. 
	 */
	isLoggedIn?: boolean,
	/**
	 * $:/status/UserName is still used for things like drafts even if the 
	 * user isn't logged in, although the username is less likely to be shown 
	 * to the user. 
	 */
	username?: string,
	/** 
	 * $:/status/IsReadOnly puts the UI in readonly mode, 
	 * but does not prevent automatic changes from attempting to save. 
	 */
	isReadOnly?: boolean,
	/** 
	 * $:/status/IsAnonymous does not appear anywhere in the TW5 repo! 
	 * So it has no apparent purpose. 
	 */
	isAnonymous?: boolean
) => void

interface SyncAdaptor<AD> {
	name?: string;

	isReady?(): boolean;

	getStatus?(
		cb: ServerStatusCallback
	): void;

	getSkinnyTiddlers?(
		cb: (err: any, tiddlerFields: Record<string, string>[]) => void
	): void;
	getUpdatedTiddlers?(
		syncer: Syncer,
		cb: (
			err: any,
			/** Arrays of titles that have been modified or deleted */
			updates?: { modifications: string[], deletions: string[] }
		) => void
	): void;

	/** 
	 * used to override the default Syncer getTiddlerRevision behavior
	 * of returning the revision field
	 * 
	 */
	getTiddlerRevision?(title: string): string;
	/** 
	 * used to get the adapter info from a tiddler in situations
	 * other than the saveTiddler callback
	 */
	getTiddlerInfo(tiddler: Tiddler): AD | undefined;

	saveTiddler(
		tiddler: any,
		cb: (
			err: any,
			adaptorInfo?: AD,
			revision?: string
		) => void,
		extra: { tiddlerInfo: SyncerTiddlerInfo<AD> }
	): void;

	setLoggerSaveBuffer?: (loggerForSaving: Logger) => void;
	displayLoginPrompt?(syncer: Syncer): void;
	login?(username: string, password: string, cb: (err: any) => void): void;
	logout?(cb: (err: any) => void): any;
}
interface SyncerTiddlerInfo<AD> {
	/** this comes from the wiki changeCount record */
	changeCount: number;
	/** Adapter info returned by the sync adapter */
	adaptorInfo: AD;
	/** Revision return by the sync adapter */
	revision: string;
	/** Timestamp set in the callback of the previous save */
	timestampLastSaved: Date;
}

declare const $tw: any;

declare const exports: {
	adaptorClass: typeof MultiWikiClientAdaptor;
};

var CONFIG_HOST_TIDDLER = "$:/config/multiwikiclient/host",
	DEFAULT_HOST_TIDDLER = "$protocol$//$host$/",
	MWC_STATE_TIDDLER_PREFIX = "$:/state/multiwikiclient/",
	BAG_STATE_TIDDLER = "$:/state/multiwikiclient/tiddlers/bag",
	REVISION_STATE_TIDDLER = "$:/state/multiwikiclient/tiddlers/revision",
	CONNECTION_STATE_TIDDLER = "$:/state/multiwikiclient/connection",
	INCOMING_UPDATES_FILTER_TIDDLER = "$:/config/multiwikiclient/incoming-updates-filter",
	ENABLE_SSE_TIDDLER = "$:/config/multiwikiclient/use-server-sent-events";

var SERVER_NOT_CONNECTED = "NOT CONNECTED",
	SERVER_CONNECTING_SSE = "CONNECTING SSE",
	SERVER_CONNECTED_SSE = "CONNECTED SSE",
	SERVER_POLLING = "SERVER POLLING";

interface MWSAdaptorInfo {
	bag: string
}


class MultiWikiClientAdaptor implements SyncAdaptor<MWSAdaptorInfo> {
	private wiki;
	private host;
	private recipe;
	private useServerSentEvents;
	private last_known_revision_id;
	private outstandingRequests;
	private lastRecordedUpdate;
	private logger;
	private isLoggedIn;
	private isReadOnly;
	private username;
	private incomingUpdatesFilterFn;
	private serverUpdateConnectionStatus!: string;

	name = "multiwikiclient";
	private supportsLazyLoading = true;
	constructor(options: { wiki: any }) {
		this.wiki = options.wiki;
		this.host = this.getHost();
		this.recipe = this.wiki.getTiddlerText("$:/config/multiwikiclient/recipe");
		this.useServerSentEvents = this.wiki.getTiddlerText(ENABLE_SSE_TIDDLER) === "yes";
		this.last_known_revision_id = this.wiki.getTiddlerText("$:/state/multiwikiclient/recipe/last_revision_id", "0")
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

	private setUpdateConnectionStatus(status: string) {
		this.serverUpdateConnectionStatus = status;
		this.wiki.addTiddler({
			title: CONNECTION_STATE_TIDDLER,
			text: status
		});
	}
	private setLoggerSaveBuffer(loggerForSaving: Logger) {
		this.logger.setSaveBuffer(loggerForSaving);
	}
	isReady() {
		return true;
	}
	private getHost() {
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

	private async recipeRequest<KEY extends (string & keyof TiddlerRouterResponse)>(
		options: Omit<HttpRequestOptions<"text">, "responseType"> & { key: KEY }
	) {
		if (!options.url.startsWith("/"))
			throw new Error("The url does not start with a slash");

		return await httpRequest({
			...options,
			responseType: "text",
			url: this.host + "recipes/" + encodeURIComponent(this.recipe) + options.url,
		}).then(result => {
			// in theory, 403 and 404 should result in further action, 
			// but in reality an error gets logged to console and that's it.
			if (!result.ok) {
				throw new Error(
					`The server return a status code ${result.status} with the following reason: `
					+ `${result.headers.get("x-reason") ?? "(no reason given)"}`
				);
			} else {
				return result;
			}
		}).then(e => [true, void 0, {
			...e,
			/** this is undefined if status is not 200 */
			responseJSON: e.status === 200 ? tryParseJSON(e.response) as TiddlerRouterResponse[KEY]["R"] : undefined
		}] as const, e => [false, e, void 0] as const);

		function tryParseJSON(data: string) {
			try {
				return JSON.parse(data);
			} catch (e) {
				console.error("Error parsing JSON, returning undefined", e);
				return undefined;
			}
		}

	}

	getTiddlerInfo(tiddler: Tiddler) {
		var title = tiddler.fields.title,
			revision = this.wiki.extractTiddlerDataItem(REVISION_STATE_TIDDLER, title),
			bag = this.wiki.extractTiddlerDataItem(BAG_STATE_TIDDLER, title);
		if (revision && bag) {
			return {
				title: title,
				revision: revision,
				bag: bag
			};
		} else {
			return undefined;
		}
	}
	private getTiddlerBag(title: string) {
		return this.wiki.extractTiddlerDataItem(BAG_STATE_TIDDLER, title);
	}	
	getTiddlerRevision(title: string) {
		return this.wiki.extractTiddlerDataItem(REVISION_STATE_TIDDLER, title);
	}
	private setTiddlerInfo(title: string, revision: string, bag: string) {
		this.wiki.setText(BAG_STATE_TIDDLER, null, title, bag, { suppressTimestamp: true });
		this.wiki.setText(REVISION_STATE_TIDDLER, null, title, revision, { suppressTimestamp: true });
	}
	private removeTiddlerInfo(title: string) {
		this.wiki.setText(BAG_STATE_TIDDLER, null, title, undefined, { suppressTimestamp: true });
		this.wiki.setText(REVISION_STATE_TIDDLER, null, title, undefined, { suppressTimestamp: true });
	}

	/*
	Get the current status of the server connection
	*/
	async getStatus(callback: ServerStatusCallback) {

		const [ok, error, data] = await this.recipeRequest({
			key: "handleGetRecipeStatus",
			method: "GET",
			url: "/status",
		});
		if (!ok) {
			this.logger.log("Error getting status", error);
			if (callback) callback(error);
			return;
		}
		const status = data.responseJSON;
		this.isReadOnly = status?.isReadOnly ?? true;
		this.isLoggedIn = status?.isLoggedIn ?? false;
		this.username = status?.username ?? "(anon)";
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
				false,
			);
		}
	}
	/*
	Get details of changed tiddlers from the server
	*/
	getUpdatedTiddlers(syncer: Syncer, callback: (err: any, changes?: { modifications: string[]; deletions: string[] }) => void) {
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
			onerror: async function (err) {
				self.logger.log("Error connecting SSE stream", err);
				// If the stream didn't work, try polling
				self.setUpdateConnectionStatus(SERVER_POLLING);
				const changes = await self.pollServer();
				self.setUpdateConnectionStatus(SERVER_NOT_CONNECTED);
				callback(null, changes);
				setTimeout(() => {
					// If Browswer Storage tiddlers were cached on reloading the wiki, add them after sync from server completes in the above callback.
					if ($tw.browserStorage && $tw.browserStorage.isEnabled()) {
						$tw.browserStorage.addCachedTiddlers();
					}
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
	private connectServerStream(options: {
		syncer: Syncer;
		onopen: (event: Event) => void;
		onerror: (event: Event) => void;
	}) {
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

			const data: {
				title: string;
				revision_id: number;
				is_deleted: boolean;
				bag_name: string;
				tiddler: any;
			} = $tw.utils.parseJSONSafe(event.data);
			if (!data) return;

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
			if (self.outstandingRequests[data.title]) return;
			if (data.is_deleted) {
				self.removeTiddlerInfo(data.title);
				delete options.syncer.tiddlerInfo[data.title];
				options.syncer.logger.log("Deleting tiddler missing from server:", data.title);
				options.syncer.wiki.deleteTiddler(data.title);
				options.syncer.processTaskQueue();
			} else {
				var result = self.incomingUpdatesFilterFn.call(self.wiki, self.wiki.makeTiddlerIterator([data.title]));
				if (result.length > 0) {
					self.setTiddlerInfo(data.title, data.revision_id.toString(), data.bag_name);
					options.syncer.storeTiddler(data.tiddler);
				}
			}


		});
	}
	private async pollServer() {

		const [ok, err, result] = await this.recipeRequest({
			key: "handleGetBagStates",
			url: "/bag-states",
			method: "GET",
			queryParams: {
				include_deleted: "yes",
				last_known_revision_id: this.last_known_revision_id,
			}
		});

		if (!ok) throw err;

		const bags = result.responseJSON;

		if (!bags) return;

		bags.sort((a, b) => b.position - a.position);
		const modified = new Set<string>(),
			deleted = new Set<string>();

		const incomingTitles = new Set<string>(bags.map(
			// get the titles in each layer that aren't deleted
			e => e.tiddlers.filter(f => !f.is_deleted).map(f => f.title)
			// and flatten them for Set
		).flat());

		let last_revision = this.last_known_revision_id;

		bags.forEach(bag => {
			bag.tiddlers.forEach(tid => {
				// if the revision is old, ignore, since deletions create a new revision
				if (tid.revision_id <= this.last_known_revision_id) return;
				if (tid.revision_id > last_revision) last_revision = tid.revision_id;
				// check if this title still exists in any layer
				if (incomingTitles.has(tid.title))
					modified.add(tid.title);
				else
					deleted.add(tid.title);
			})
		});

		this.last_known_revision_id = last_revision;

		return {
			modifications: [...modified.keys()],
			deletions: [...deleted.keys()],
		}

	}

	/*
	Queue a load for a tiddler if there has been an update for it since the specified revision
	*/
	private checkLastRecordedUpdate(title: string, revision: string) {
		var lru = this.lastRecordedUpdate[title];
		if (lru && lru.revision_id > revision) {
			console.log(`Checking for updates to ${title} since ${JSON.stringify(lru)} comparing to ${revision}`);
			this.syncer && this.syncer.enqueueLoadTiddler(title);
		}
	}
	private get syncer() {
		if ($tw.syncadaptor === this) return $tw.syncer;
	}
	/*
	Save a tiddler and invoke the callback with (err,adaptorInfo,revision)
	*/
	async saveTiddler(
		tiddler: Tiddler,
		callback: (
			err: any,
			adaptorInfo?: MWSAdaptorInfo,
			revision?: string
		) => void,
		options?: {}
	) {
		var self = this, title = tiddler.fields.title as string;
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
			body += `\n\n${text}`
		}

		type t = TiddlerRouterResponse["handleSaveRecipeTiddler"]
		const [ok, err, result] = await this.recipeRequest({
			key: "handleSaveRecipeTiddler",
			url: "/tiddlers/" + encodeURIComponent(title),
			method: "PUT",
			requestBodyString: body,
			headers: {
				"content-type": "application/x-mws-tiddler"
			}
		});

		delete self.outstandingRequests[title];
		if (!ok) return callback(err);

		const data = result.responseJSON;
		if (!data) return callback(null); // a 2xx response without a body is unlikely

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

	}
	/*
	Load a tiddler and invoke the callback with (err,tiddlerFields)

	The syncer does not pass itself into options.
	*/
	async loadTiddler(title: string, callback: (err: any, fields?: any) => void, options: any) {
		var self = this;
		self.outstandingRequests[title] = { type: "GET" };
		const [ok, err, result] = await this.recipeRequest({
			key: "handleGetRecipeTiddler",
			url: "/tiddlers/" + encodeURIComponent(title),
			method: "GET",
		})
		delete self.outstandingRequests[title];
		if (!ok) return callback(err);

		const { responseJSON: data, headers } = result;
		const revision = headers.get("x-revision-number") ?? "",
			bag_name = headers.get("x-bag-name") ?? "";

		if (!revision || !bag_name || !data) return callback(null, null);

		// If there has been a more recent update from the server then enqueue a load of this tiddler
		self.checkLastRecordedUpdate(title, revision);
		// Invoke the callback
		self.setTiddlerInfo(title, revision, bag_name);
		callback(null, data);
	}
	/*
	Delete a tiddler and invoke the callback with (err)
	options include:
	tiddlerInfo: the syncer's tiddlerInfo for this tiddler
	*/
	async deleteTiddler(title: string, callback: (err: any, adaptorInfo?: any) => void, options: any) {
		var self = this;
		if (this.isReadOnly) { return callback(null); }
		// If we don't have a bag it means that the tiddler hasn't been seen by the server, so we don't need to delete it
		// var bag = this.getTiddlerBag(title);
		// if(!bag) { return callback(null, options.tiddlerInfo.adaptorInfo); }
		self.outstandingRequests[title] = { type: "DELETE" };
		// Issue HTTP request to delete the tiddler
		const [ok, err, result] = await this.recipeRequest({
			key: "handleDeleteRecipeTiddler",
			url: "/tiddlers/" + encodeURIComponent(title),
			method: "DELETE",
		});
		delete self.outstandingRequests[title];
		if (!ok) return callback(err);
		const { responseJSON: data } = result;
		if (!data) return callback(null);

		const revision = data.revision_id, bag_name = data.bag_name;
		// If there has been a more recent update from the server then enqueue a load of this tiddler
		self.checkLastRecordedUpdate(title, revision);
		self.removeTiddlerInfo(title);
		// Invoke the callback & return null adaptorInfo
		callback(null, null);
	}
}


if ($tw.browser && document.location.protocol.startsWith("http")) {
	exports.adaptorClass = MultiWikiClientAdaptor;
}

type ParamsInput = URLSearchParams | [string, string][] | object | string | undefined;

interface HttpRequestOptions<TYPE extends "arraybuffer" | "blob" | "text"> {
	/** The request METHOD. Maybe be anything except CONNECT, TRACE, or TRACK.  */
	method: string;
	/** The url may also contain query params. */
	url: string;
	/** The response types */
	responseType: TYPE;
	headers?: ParamsInput;
	/** This is parsed separately from the url and appended to it. */
	queryParams?: ParamsInput;
	/** 
	 * The string to send as the request body. Not valid for GET and HEAD.
	 * 
	 * For `application/x-www-form-urlencoded`, use `new URLSearchParams().toString()`.
	 * 
	 * For `application/json`, use `JSON.stringify()`
	 */
	requestBodyString?: string;
	progress?: (event: ProgressEvent<EventTarget>) => void;
}


function httpRequest<TYPE extends "arraybuffer" | "blob" | "text">(options: HttpRequestOptions<TYPE>) {

	options.method = options.method.toUpperCase();

	if ((options.method === "GET" || options.method === "HEAD") && options.requestBodyString)
		throw new Error("requestBodyString must be falsy if method is GET or HEAD");

	function paramsInput(input: ParamsInput) {
		if (!input) return new URLSearchParams();
		if (input instanceof URLSearchParams) return input;
		if (Array.isArray(input) || typeof input === "string") return new URLSearchParams(input);
		return new URLSearchParams(Object.entries(input));
	}

	function normalizeHeaders(headers: URLSearchParams) {
		[...headers.keys()].forEach(([k, v]) => {
			const k2 = k.toLowerCase();
			if (k2 !== k) {
				headers.getAll(k).forEach(e => {
					headers.append(k2, e);
				})
				headers.delete(k);
				console.log(k, k2);
			}
		})
	}

	return new Promise<{
		/** Shorthand to check if the response is in the 2xx range. */
		ok: boolean;
		status: number;
		statusText: string;
		headers: URLSearchParams;
		response:
		TYPE extends "arraybuffer" ? ArrayBuffer :
		TYPE extends "blob" ? Blob :
		TYPE extends "text" ? string :
		never;
	}>((resolve) => {
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
			if (this.readyState !== 4) return;

			const headers = new URLSearchParams();
			request.getAllResponseHeaders()?.trim().split(/[\r\n]+/).forEach((line) => {
				const parts = line.split(": ");
				const header = parts.shift()?.toLowerCase();
				const value = parts.join(": ");
				if (header) headers.append(header, value);
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


