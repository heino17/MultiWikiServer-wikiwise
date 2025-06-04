import * as path from "path";
import * as fs from "fs";
import { ServerRequest } from "./requests/StateObject";
import { BodyFormat } from "./requests/router";

declare global {
  /** helper function which returns the arguments as an array, but typed as a tuple, which is still an array, but positional. */
  function tuple<P extends any[]>(...arg: P): P;
}

(global as any).tuple = function (...args: any[]) { return args; }


declare global { const STREAM_ENDED: unique symbol; }
const STREAM_ENDED: unique symbol = Symbol("STREAM_ENDED");
(global as any).STREAM_ENDED = STREAM_ENDED;



declare global {

  /** Awaited Return Type */
  type ART<T extends (...args: any) => any> = Awaited<ReturnType<T>>
  type Complete<T> = { [K in keyof T]-?: T[K] }
  interface ObjectConstructor { keys<T>(t: T): (string & keyof T)[]; }

}



declare global {

  interface RouteDef {

    /** 
     * Regex to test the pathname on. It must start with `^`. If this is a child route, 
     * it will be tested against the remaining portion of the parent route.  
     */
    path: RegExp;
    pathParams?: string[];
    /** The uppercase method names to match this route */
    method: string[];
    /** 
     * The highest bodyformat in the chain always takes precedent. Type-wise, only one is allowed, 
     * but at runtime the first one found is the one used. 
     * 
     * Note that bodyFormat is completely ignored for GET and HEAD requests.
     */
    bodyFormat?: BodyFormat;
    /** If this route is the last one matched, it will NOT be called, and a 404 will be returned. */
    denyFinal?: boolean;

    securityChecks?: {
      /**
       * If true, the request must have the "x-requested-with" header set to "XMLHttpRequest".
       * This is a common way to check if the request is an AJAX request.
       * If the header is not set, the request will be rejected with a 403 Forbidden.
       */
      requestedWithHeader?: boolean;
    };


  }
  interface ServerRoute extends RouteDef {

    /**
     * If this route's handler sends headers, the matched child route will not be called.
     */
    handler: (state: ServerRequest) => Promise<typeof STREAM_ENDED>

    /**
     * ### ROUTING
     *
     * @param route The route definition.
     *
     * If the parent route sends headers, or returns the STREAM_ENDED symbol, 
     * this route will not be called.
     *
     * Inner routes are matched on the remaining portion of the parent route
     * using `pathname.slice(match[0].length)`. If the parent route entirely 
     * matches the pathname, this route will be matched on "/".
     * 
     * If the body format is "stream", "buffer", "ignore" or not yet defined at this level in the tree,
     * then zod cannot be used. 
     * 
     * Note that GET and HEAD are always bodyFormat: "ignore", regardless of what is set here.
     */
    defineRoute: (
      route: RouteDef,
      handler: (state: ServerRequest) => Promise<symbol | void>
    ) => ServerRoute;
  }
}