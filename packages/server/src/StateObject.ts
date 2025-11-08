import { Streamer, StreamerState } from './streamer';
import { BodyFormat, Router } from "./router";
import { RouteMatch } from './router';
import { zod } from './Z2';
import {
  getMultipartBoundary,
  isMultipartRequestHeader,
  MultipartPart,
  parseNodeMultipartStream,
} from '@mjackson/multipart-parser';
import { SendError } from './SendError';

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

  dataBuffer?: Buffer;
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

    this.pathParams = routePath.reduce((n, e) => Object.assign(n, e.groups), {});

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



  async readMultipartData(
    this: ServerRequest<"stream", any>,
    options: {
      cbPartStart: (part: MultipartPart) => Promise<void>;
      cbPartChunk: (part: MultipartPart, chunk: Buffer) => Promise<void>;
      cbPartEnd: (part: MultipartPart) => Promise<void>;
    }
  ) {

    const contentType = this.headers['content-type'];
    if (!contentType || !isMultipartRequestHeader(contentType))
      throw new SendError("MULTIPART_INVALID_CONTENT_TYPE", 400, null);

    const boundary = getMultipartBoundary(contentType);
    if (!boundary)
      throw new SendError("MULTIPART_MISSING_BOUNDARY", 400, null);

    for await (let part of parseNodeMultipartStream(this.reader, {
      boundary,
      useContentPart: false,
      onCreatePart: async (part) => {
        part.append = async (chunk: Uint8Array) => {
          await options.cbPartChunk(part, Buffer.from(chunk));
        };
        await options.cbPartStart(part);
      }
    })) {
      await options.cbPartEnd(part);
    }
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