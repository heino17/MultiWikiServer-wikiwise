import { Readable } from 'stream';
import { recieveMultipartData as readMultipartData, sendResponse } from './helpers';
import { Streamer } from './server';
import { AuthState } from './AuthState';
import { PassThrough } from 'node:stream';
import { AllowedMethod, BodyFormat, RouteMatch, Router } from './router';
import { z } from 'zod';

// This class abstracts the request/response cycle into a single object.
// It hides most of the details from the routes, allowing us to easily change the underlying server implementation.
export class StateObject<B extends BodyFormat = BodyFormat, M extends AllowedMethod = AllowedMethod, R extends RouteMatch<any>[] = RouteMatch<any>[], D = unknown> {

  get url() { return this.streamer.url; }
  get method(): M { return this.streamer.method as M; }
  get headers() { return this.streamer.headers; }
  get host() { return this.streamer.host; }
  get urlInfo() { return this.streamer.url; }
  get headersSent() { return this.streamer.headersSent; }

  get reader() { return this.streamer.reader; }

  readBody = this.streamer.readBody.bind(this.streamer);
  readMultipartData = readMultipartData.bind(this.router, this);

  sendEmpty = this.streamer.sendEmpty.bind(this.streamer);
  sendString = this.streamer.sendString.bind(this.streamer);
  sendBuffer = this.streamer.sendBuffer.bind(this.streamer);
  sendStream = this.streamer.sendStream.bind(this.streamer);
  sendFile = this.streamer.sendFile.bind(this.streamer);
  end = this.streamer.end.bind(this.streamer);

  sendResponse = sendResponse.bind(this.router, this);

  get enableBrowserCache() { return this.router.enableBrowserCache; }
  get enableGzip() { return this.router.enableGzip; }
  get pathPrefix() { return this.router.pathPrefix; }

  queryParameters = this.url.searchParams;
  data!:
    B extends "string" ? string :
    B extends "buffer" ? Buffer :
    B extends "www-form-urlencoded" ? URLSearchParams :
    B extends "stream" ? Readable :
    D;
  params: string[][];
  constructor(
    private streamer: Streamer,
    /** The array of Route tree nodes the request matched. */
    route: R,
    /** The bodyformat that ended up taking precedence. This should be correctly typed. */
    public bodyFormat: B,
    public authState: AuthState,
    private router: Router
  ) {
    this.params = route.map(r => r.params);
  }

  wiki: any;
  boot: any;
  server: any;

  zod<T extends z.ZodTypeAny>(schema: T): this is { data: z.infer<T> } {
    const { success, data } = z.any().pipe(schema).safeParse(this.data);
    if (!success) return false;
    this.data = data;
    return true;
  }

  makeTiddlerEtag(options: { bag_name: string; tiddler_id: string; }) {
    if (options.bag_name || options.tiddler_id) {
      return "\"tiddler:" + options.bag_name + "/" + options.tiddler_id + "\"";
    } else {
      throw "Missing bag_name or tiddler_id";
    }
  }

  /** type-narrowing helper function. This affects anywhere T is used. */
  isBodyFormat<T extends B, S extends { [K in B]: StateObject<K, M, R, D> }[T]>(format: T): this is S {
    return this.bodyFormat as BodyFormat === format;
  }


  sendSSE(retryMilliseconds: number) {
    if (typeof retryMilliseconds !== "number" || retryMilliseconds < 0)
      throw new Error("Invalid retryMilliseconds: must be a non-negative number");

    const stream = new PassThrough();

    this.sendStream(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    }, stream);

    stream.write(": This page is a server-sent event stream. It will continue loading until you close it.\n");
    stream.write(": https://html.spec.whatwg.org/multipage/server-sent-events.html#server-sent-events\n");
    stream.write("\n");

    /**
     * 
     * @param {string} eventName The event name. If zero-length, the field is omitted
     * @param eventData The data to send. Must be stringify-able to JSON.
     * @param {string} eventId The event id. If zero-length, the field is omitted.
     */
    const write = (eventName: string, eventData: any, eventId: string) => {
      if (typeof eventName !== "string")
        throw new Error("Event name must be a string (a zero-length string disables the field)");
      if (eventName.includes("\n"))
        throw new Error("Event name cannot contain newlines");
      if (typeof eventId !== "string")
        throw new Error("Event ID must be a string");
      if (eventId.includes("\n"))
        throw new Error("Event ID cannot contain newlines");

      stream.write([
        eventName && `event: ${eventName}`,
        `data: ${JSON.stringify(eventData)}`,
        eventId && `id: ${eventId}`,
        retryMilliseconds && `retry: ${retryMilliseconds}`,
      ].filter(e => e).join("\n") + "\n\n");
    }

    const close = () => stream.end();

    return { write, close };

  }
}
