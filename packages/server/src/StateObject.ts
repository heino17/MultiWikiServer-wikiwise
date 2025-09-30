import { Streamer, StreamerState } from './streamer';
import { BodyFormat, Router } from "./router";
import { RouteMatch } from './router';
import { ok } from 'assert';
import { IncomingHttpHeaders } from 'http';
import { zod } from './Z2';
import {
  getMultipartBoundary,
  isMultipartRequestHeader,
  MultipartPart,
  parseNodeMultipartStream,
  SuperHeaders,
} from '@mjackson/multipart-parser';
import { InteropObservable, Observable, Operator, Subject } from 'rxjs';
import { is } from './utils';

export interface ServerRequest<
  B extends BodyFormat = BodyFormat,
  M extends string = string,
  D = unknown
> extends ServerRequestClass<B, M, D> { }

// This class abstracts the request/response cycle into a single object.
// It hides most of the details from the routes, allowing us to easily 
// change the underlying server implementation.
export class ServerRequestClass<
  B extends BodyFormat = BodyFormat,
  M extends string = string,
  D = unknown
> extends StreamerState {

  get method(): M { return super.method as M; }


  data!:
    B extends "string" ? string :
    B extends "buffer" ? Buffer :
    B extends "www-form-urlencoded-urlsearchparams" ? URLSearchParams :
    B extends "stream" ? undefined :
    B extends "ignore" ? undefined :
    D;
  /** 
   * an *object from entries* of all the pathParams in the tree mapped to the path regex matches from that route.
   * 
   * Object.fromEntries takes the last value if there are duplicates, so conflicting names will have the last value in the path. 
   * 
   * Conflicting names would be defined on the route definitions, so just change the name there if there is a conflict.
   * 
   * pathParams are parsed with `decodeURIComponent` one time.
   */
  pathParams: Record<string, string | undefined>;
  /** 
   * The query params. Because these aren't checked anywhere, 
   * the value includes undefined since it will be that if 
   * the key is not specified at all. 
   * 
   * This will always satisfy the zod schema: `z.record(z.string(), z.array(z.string()))`
   */
  queryParams: Record<string, string[] | undefined>;

  constructor(
    streamer: Streamer,
    /** The array of Route tree nodes the request matched. */
    routePath: RouteMatch[],
    /** The bodyformat that ended up taking precedence. This should be correctly typed. */
    public bodyFormat: B,
    protected router: Router,
  ) {
    super(streamer);

    this.pathParams = Object.fromEntries<string | undefined>(routePath.map(r =>
      r.route.pathParams
        ?.map((e, i) => [e, r.params[i]] as const)
        .filter(<T>(e: T): e is T & {} => !!e)
      ?? []
    ).flat()) as any;

    const pathParamsZodCheck = zod.record(zod.string(), zod.string().transform(zodURIComponent).optional()).safeParse(this.pathParams);
    if (!pathParamsZodCheck.success) console.log("BUG: Path params zod error", pathParamsZodCheck.error, this.pathParams);
    else this.pathParams = pathParamsZodCheck.data;

    this.queryParams = Object.fromEntries([...this.urlInfo.searchParams.keys()]
      .map(key => [key, this.urlInfo.searchParams.getAll(key)] as const));

    const queryParamsZodCheck = zod.record(zod.string(), zod.array(zod.string())).safeParse(this.queryParams);
    if (!queryParamsZodCheck.success) console.log("BUG: Query params zod error", queryParamsZodCheck.error, this.queryParams);
    else this.queryParams = queryParamsZodCheck.data;


  }


  /** type-narrowing helper function. This affects anywhere T is used. */
  isBodyFormat<T extends B, S extends { [K in B]: ServerRequest<K, M, D> }[T]>(format: T): this is S {
    return this.bodyFormat as BodyFormat === format;
  }
  /** 
   * Checks the request and response headers and calculates the appropriate 
   * encoding to use for the response. This may be checked early if you 
   * can only support a subset of normal encodings or have precompressed data.
   */
  acceptsEncoding(encoding: ('br' | 'gzip' | 'deflate' | 'identity')[]) {
    return this.streamer.compressor.getEncodingMethod(encoding);
  }

  /**
   *
   * Sends a **302** status code and **Location** header to the client.
   * 
   * This will add the path prefix to the redirect path
   * 
   * - **301 Moved Permanently:** The resource has been permanently moved to a new URL.
   * - **302 Found:** The resource is temporarily located at a different URL.
   * - **303 See Other:** Fetch the resource from another URI using a GET request.
   * - **307 Temporary Redirect:** The resource is temporarily located at a different URL; the same HTTP method should be used.
   * - **308 Permanent Redirect:** The resource has permanently moved; the client should use the new URL in future requests.
   */
  redirect(location: string): typeof STREAM_ENDED {
    return this.sendEmpty(302, { 'Location': this.pathPrefix + location });
  }

  /**
  Options include:
  - `cbPartStart(headers,name,filename)` - invoked when a file starts being received
  - `cbPartChunk(chunk)` - invoked when a chunk of a file is received
  - `cbPartEnd()` - invoked when a file finishes being received
  - `cbFinished(err)` - invoked when the all the form data has been processed, optional,
                        as it is called immediately before resolving or rejecting the promise.
                        The promise will reject with err if there is an error.
  */
  readMultipartData(this: ServerRequest<"stream", any>, options: {
    cbPartStart: (headers: IncomingHttpHeaders, name: string | null, filename: string | null) => void;
    cbPartChunk: (chunk: Buffer) => void;
    cbPartEnd: () => void;
    cbFinished?: (err: Error | string | null) => void;
  }) {
    return new Promise<void>((resolve, reject) => {
      // Check that the Content-Type is multipart/form-data
      const contentType = this.headers['content-type'];
      if (!contentType?.startsWith("multipart/form-data")) {
        return reject("Expected multipart/form-data content type");
      }
      // Extract the boundary string from the Content-Type header
      const boundaryMatch = contentType.match(/boundary=(.+)$/);
      if (!boundaryMatch) {
        return reject("Missing boundary in multipart/form-data");
      }
      const boundary = boundaryMatch[1];
      const boundaryBuffer = Buffer.from("--" + boundary);
      // Initialise
      let buffer = Buffer.alloc(0);
      let processingPart = false;
      // Process incoming chunks
      this.reader.on("data", (chunk) => {
        // Accumulate the incoming data
        buffer = Buffer.concat([buffer, chunk]);
        // Loop through any parts within the current buffer
        while (true) {
          if (!processingPart) {
            // If we're not processing a part then we try to find a boundary marker
            const boundaryIndex = buffer.indexOf(boundaryBuffer);
            if (boundaryIndex === -1) {
              // Haven't reached the boundary marker yet, so we should wait for more data
              break;
            }
            // Look for the end of the headers
            const endOfHeaders = buffer.indexOf("\r\n\r\n", boundaryIndex + boundaryBuffer.length);
            if (endOfHeaders === -1) {
              // Haven't reached the end of the headers, so we should wait for more data
              break;
            }
            // Extract and parse headers
            const headersPart = Uint8Array.prototype.slice.call(buffer, boundaryIndex + boundaryBuffer.length, endOfHeaders).toString();
            const currentHeaders: IncomingHttpHeaders = {};
            headersPart.split("\r\n").forEach(headerLine => {
              const [key, value] = headerLine.split(": ");
              ok(typeof key === "string");
              currentHeaders[key.toLowerCase()] = value;
            });
            // Parse the content disposition header
            const contentDisposition: {
              name: string | null;
              filename: string | null;
            } = {
              name: null,
              filename: null
            };
            if (currentHeaders["content-disposition"]) {
              // Split the content-disposition header into semicolon-delimited parts
              const parts = currentHeaders["content-disposition"].split(";").map(part => part.trim());
              // Iterate over each part to extract name and filename if they exist
              parts.forEach(part => {
                if (part.startsWith("name=")) {
                  // Remove "name=" and trim quotes
                  contentDisposition.name = part.substring(6, part.length - 1);
                } else if (part.startsWith("filename=")) {
                  // Remove "filename=" and trim quotes
                  contentDisposition.filename = part.substring(10, part.length - 1);
                }
              });
            }
            processingPart = true;
            options.cbPartStart(currentHeaders, contentDisposition.name, contentDisposition.filename);
            // Slice the buffer to the next part
            buffer = Buffer.from(buffer, endOfHeaders + 4);
          } else {
            const boundaryIndex = buffer.indexOf(boundaryBuffer);
            if (boundaryIndex >= 0) {
              // Return the part up to the boundary minus the terminating LF CR
              options.cbPartChunk(Buffer.from(buffer, 0, boundaryIndex - 2));
              options.cbPartEnd();
              processingPart = false;
              // this starts at the boundary marker, which gets picked up on the next loop
              buffer = Buffer.from(buffer, boundaryIndex);
            } else {
              // Return the rest of the buffer
              options.cbPartChunk(buffer);
              // Reset the buffer and wait for more data
              buffer = Buffer.alloc(0);
              break;
            }
          }
        }
      });

      // All done
      this.reader.on("end", () => {
        resolve();
      });
    }).then(() => {
      options.cbFinished?.(null);
    }, (err) => {
      options.cbFinished?.(err);
      throw err;
    });

  }

  async readMultipartData2(
    this: ServerRequest<"stream", any>,
    options: {
      cbPartStart: (part: MultipartPart) => void;
      cbPartChunk: (part: MultipartPart, chunk: Buffer) => void;
      cbPartEnd: (part: MultipartPart) => void;
    }
  ) {
    const contentType = this.headers['content-type'];
    if (!contentType || !isMultipartRequestHeader(contentType)) return false;
    const boundary = getMultipartBoundary(contentType);
    if (!boundary) throw 'Invalid Content-Type header: missing boundary';
    for await (let part of parseNodeMultipartStream(this.reader, {
      boundary,
      onCreatePart: (part) => {
        //@ts-ignore
        const arr = part.content = new RxArray<Uint8Array>(...part.content);
        if (part.isFile) {
          arr.asObservable().subscribe((e) => {
            if (!e) return;
            const [event, args, res] = e;
            if (event === "push") {
              args.forEach((chunk) => {
                options.cbPartChunk(part, Buffer.from(chunk));
              });
            }
          });
        }
        options.cbPartStart(part);
      }
    })) {
      options.cbPartEnd(part);
    }
  }

}

type RxArrayEvents<T> = {
  [K in "push" | "pop" | "shift" | "unshift" | "splice" | "sort" | "copyWithin" | "reverse"]?:
  K extends "push" ? [K, T[], number] :
  [K, Parameters<Array<T>[K]>, ReturnType<Array<T>[K]>];
}
class RxArray<T> extends Array<T> implements InteropObservable<RxArrayEvents<T>[keyof RxArrayEvents<T>]> {
  #subject = new Subject<RxArrayEvents<T>[keyof RxArrayEvents<T>]>();
  [Symbol.observable]() { return this.#subject.asObservable(); }
  asObservable() { return this.#subject.asObservable(); }

  constructor(length: number);
  constructor(...items: T[]);
  constructor(...args: any[]) {
    super(...args);
    const factory = (method: keyof RxArrayEvents<T>) => {
      return (...args: any[]) => {
        const result = Array.prototype[method].apply(this, args);
        this.#subject.next([method as any, args, result]);
        return result;
      };
    };
    this.push = factory("push");
    this.pop = factory("pop");
    this.shift = factory("shift");
    this.unshift = factory("unshift");
    this.splice = factory("splice");
    this.sort = factory("sort");
    this.copyWithin = factory("copyWithin");
    this.reverse = factory("reverse");
  }
}

const zodURIComponent = (val: string, ctx: zod.RefinementCtx) => {
  try {
    return decodeURIComponent(val);
  } catch (e) {
    ctx.addIssue({
      code: zod.ZodIssueCode.custom,
      message: "Invalid URI component",
    });
    return zod.NEVER;
  }
}