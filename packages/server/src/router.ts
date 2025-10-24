import { zod } from "./Z2";
import { ServerRequest, ServerRequestClass } from "./StateObject";
import { GenericRequest, GenericResponse, Streamer } from "./streamer";
import Debug from "debug";
import { IncomingMessage, ServerResponse } from "node:http";
import { Http2ServerRequest, Http2ServerResponse } from "node:http2";
import { ListenOptions } from "./listeners";
import { serverEvents } from "@tiddlywiki/events";
import { SendError } from "./SendError";


const debug = Debug("mws:router:matching");
const debugnomatch = Debug("mws:router:nomatch");

export interface AllowedRequestedWithHeaderKeys {
  fetch: true;
  XMLHttpRequest: true;
}

export class Router {
  allowedRequestedWithHeaders: (keyof AllowedRequestedWithHeaderKeys)[] = ["fetch", "XMLHttpRequest"];
  constructor(
    public rootRoute: ServerRoute
  ) {

  }

  handle(
    req: GenericRequest,
    res: GenericResponse,
    options: ListenOptions
  ) {

    const timekey = `request ${(req as Http2ServerRequest)?.stream?.id} ${req.method} ${req.url}`;
    if (Debug.enabled("server:timing:handle")) console.time(timekey);
    // the sole purpose of this method is to catch errors
    this.handleRequest(req, res, options).catch(err2 => {
      if (err2 === STREAM_ENDED || res.headersSent) return;
      if (!(err2 instanceof SendError)) {
        err2 = new SendError("INTERNAL_SERVER_ERROR", 500, {
          message: "Internal Server Error. Details have been logged."
        });
      }
      console.log(timekey, err2);
      const err3 = err2 as SendError<any>;
      res.writeHead(err3.status, {
        "content-type": "application/json",
        "x-reason": err3.reason,
      }).end(JSON.stringify(err3));

    }).finally(() => {
      if (Debug.enabled("server:timing:handle")) console.timeEnd(timekey);
    });

  }

  async handleRequest(
    req: GenericRequest,
    res: GenericResponse,
    options: ListenOptions
  ) {

    await serverEvents.emitAsync("request.middleware", this, req, res, options);

    const streamer = new Streamer(
      req, res, options.prefix ?? "",
      !!(options.key && options.cert || options.secure)
    );

    await this.handleStreamer(streamer).catch(streamer.catcher);

  }

  async handleStreamer(streamer: Streamer) {

    await serverEvents.emitAsync("request.streamer", this, streamer);

    /** This should always have a length of at least 1 because of the root route. */
    const routePath = this.findRoute(streamer);

    // return 400 rather than 404 to protect the semantic meaning of 404 NOT FOUND,
    // because if the request does not match a route, we have no way of knowing what
    // resource they thought they were requesting and whether or not it exists.
    if (!routePath.length || routePath[routePath.length - 1]?.route.denyFinal) {
      console.log("No route found for", streamer.method, streamer.urlInfo.pathname, routePath.length);
      routePath.forEach(e => console.log(e.route.method, e.route.path.source, e.route.denyFinal));
      throw new SendError("NO_ROUTE_MATCHED", 400, null);
    }

    // A basic CSRF prevention so that basic HTML forms and AJAX requests
    // cannot be submitted unless custom headers can be sent.
    // Full CSRF protection would look like this:
    // 1. The server sends a CSRF token in the HTML form or AJAX request.
    // 2. The client sends the CSRF token back in the request headers.
    // 3. The server checks the CSRF token against the session.
    // 4. If the CSRF token is valid, the request is processed.
    // 5. If the CSRF token is invalid, the request is rejected with a 403 Forbidden.
    const reqwith = streamer.headers["x-requested-with"] as keyof AllowedRequestedWithHeaderKeys | undefined;
    // If the route requires a CSRF check,
    if (routePath.some(e => e.route.securityChecks?.requestedWithHeader))
      // If the method is not GET, HEAD, or OPTIONS, 
      if (!["GET", "HEAD", "OPTIONS"].includes(streamer.method))
        // If the x-requested-with header is not set to "fetch", 
        if (!reqwith || !this.allowedRequestedWithHeaders.includes(reqwith))
          // we reject the request with a 403 Forbidden.
          throw new SendError("INVALID_X_REQUESTED_WITH", 400, null);

    // if no bodyFormat is specified, we default to ignore
    const bodyFormat = routePath.find(e => e.route.bodyFormat)?.route.bodyFormat || "ignore";

    type statetype = {
      [K in BodyFormat]: ServerRequest<K>;
    }[BodyFormat];

    const state = this.createServerRequest(streamer, routePath, bodyFormat) as statetype;

    await serverEvents.emitAsync("request.state", this, state, streamer);

    // if headers are already sent, we're supposed to have ended.
    if (streamer.headersSent) return streamer.end();

    const method = streamer.method;
    if (["GET", "HEAD"].includes(method)) state.bodyFormat = "ignore";

    if (state.bodyFormat === "stream" || state.bodyFormat === "ignore") {
      // this starts dumping bytes early, rather than letting node do it once the res finishes.
      // the only advantage is letting the request end faster.
      if (state.bodyFormat === "ignore") streamer.reader.resume();
      // no further body handling required
      return await this.handleRoute(state, routePath);
    }
    if (state.bodyFormat === "string" || state.bodyFormat === "json") {
      state.data = (await state.readBody()).toString("utf8");
      if (state.bodyFormat === "json") {
        // make sure this parses as valid data
        const { success, data } = zod.string().transform(zodTransformJSON).safeParse(state.data);
        if (!success) throw new SendError("MALFORMED_JSON", 400, null);
        state.data = data;
      }
    } else if (state.bodyFormat === "www-form-urlencoded-urlsearchparams"
      || state.bodyFormat === "www-form-urlencoded") {
      const data = state.data = new URLSearchParams((await state.readBody()).toString("utf8"));
      if (state.bodyFormat === "www-form-urlencoded") state.data = Object.fromEntries(data);
    } else if (state.bodyFormat === "buffer") {
      state.data = await state.readBody();
    } else {
      // because it's a union, state becomes never at this point if we matched every route correctly
      // make sure state is never by assigning it to a never const. This will error if something is missed.
      const t: never = state;
      const state2: ServerRequest = state as any;
      throw new SendError("INVALID_BODY_FORMAT", 500, null);
    }

    return await this.handleRoute(state, routePath);

  }


  /** 
   * This is for overriding the server request that gets created. It is not async. 
   * If you need to do anything substantial, use the server events. 
   */
  createServerRequest<B extends BodyFormat>(
    streamer: Streamer,
    /** The array of Route tree nodes the request matched. */
    routePath: RouteMatch[],
    /** The bodyformat that ended up taking precedence. This should be correctly typed. */
    bodyFormat: B,
  ) {
    return new ServerRequestClass(streamer, routePath, bodyFormat, this);
  }

  async handleRoute(state: ServerRequest<BodyFormat>, route: RouteMatch[]) {

    await serverEvents.emitAsync("request.handle", state, route);

    let result: any = state;
    for (const match of route) {
      await Promise.resolve().then(() => {
        return match.route.handler(result);
      }).catch(e => {
        if (match.route.catchHandler) {
          return match.route.catchHandler(result, e);
        } else {
          throw e;
        }
      });
      if (state.headersSent) return;
    }
    if (!state.headersSent) {
      await serverEvents.emitAsync("request.fallback", state, route);
      console.log("No handler sent headers before the promise resolved.");
      throw new SendError("REQUEST_DROPPED", 500, null);
    }

  }

  findRouteRecursive(
    routes: ServerRoute[],
    testPath: string,
    method: string | null,
    returnAll: boolean
  ): RouteMatch[][] {
    const results: RouteMatch[][] = [];
    for (const potentialRoute of routes) {
      // Skip if the method doesn't match.
      if (method && potentialRoute.method.length && !potentialRoute.method.includes(method)) continue;

      // Try to match the path.
      const match = potentialRoute.path.exec(testPath);

      if (match) {

        // The matched portion of the path.
        const matchedPortion = match[0];
        // Remove the matched portion from the testPath.
        const remainingPath = testPath.slice(matchedPortion.length) || "/";

        const result = {
          route: potentialRoute,
          params: match.slice(1),
          remainingPath,
        };
        const { childRoutes = [] } = potentialRoute as any; // see this.defineRoute
        debug(potentialRoute.path.source, testPath, match[0], match[0].length, remainingPath, childRoutes.length);
        // If there are inner routes, try to match them recursively.
        if (childRoutes.length > 0) {
          const innerMatches = this.findRouteRecursive(
            childRoutes,
            remainingPath,
            method,
            returnAll
          );
          innerMatches.forEach(e => { results.push([result, ...e]) })
        } else {
          results.push([result]);
        }
        // we have a match
        if (!returnAll) return results;
      } else {
        // If the path doesn't match, we can skip this route.
        debugnomatch(potentialRoute.path.source, testPath);
      }
    }
    return results;
  }

  /**
   *
   * Top-level function that starts matching from the root routes.
   * Notice that the pathPrefix is assumed to have been handled beforehand.
   *
   * @param streamer
   * @returns The tree path matched
   */
  findRoute(streamer: Streamer): RouteMatch[] {
    const { method, urlInfo } = streamer;
    let testPath = urlInfo.pathname || "/";
    const routes = this.findRouteRecursive([this.rootRoute as any], testPath, method, false);
    // const routes = this.findRouteRecursive([this.rootRoute as any], testPath, null, true);
    // console.log(routes);
    // routes.forEach(e => {
    //   console.log(e[e.length - 1]?.route.method, e[e.length - 1]?.route.path.source)
    // });
    // const matchedMethods = new Set(
    //   routes.map(e =>
    //     e.filter(f => !f.route.denyFinal).map(f => f.route.method).flat()
    //   ).flat()
    // );
    // console.log(matchedMethods);
    return routes.find(e => e.every(f => !f.route.method.length || f.route.method.includes(method))) ?? [];
  }

}

export interface RouteMatch {
  route: ServerRoute;
  params: (string | undefined)[];
  remainingPath: string;
}


export const zodTransformJSON = (arg: string, ctx: zod.RefinementCtx<string>) => {
  try {
    if (arg === "") return undefined;
    return JSON.parse(arg, (key, value) => {
      //https://github.com/fastify/secure-json-parse
      if (key === '__proto__')
        throw new Error('Invalid key: __proto__');
      if (key === 'constructor' && Object.prototype.hasOwnProperty.call(value, 'prototype'))
        throw new Error('Invalid key: constructor.prototype');
      return value;
    });
  } catch (e) {
    ctx.addIssue({
      code: "custom",
      message: e instanceof Error ? e.message : `${e}`,
      input: arg,
    });
    return zod.NEVER;
  }
};
export const zodDecodeURIComponent = (arg: string, ctx: zod.RefinementCtx<string>) => {
  try {
    return decodeURIComponent(arg);
  } catch (e) {
    ctx.addIssue({
      code: "custom",
      message: e instanceof Error ? e.message : `${e}`,
      input: arg,
    });
    return zod.NEVER;
  }
};

export const BodyFormats = ["stream", "string", "json", "buffer", "www-form-urlencoded", "www-form-urlencoded-urlsearchparams", "ignore"] as const;
export type BodyFormat = (typeof BodyFormats)[number];




export interface RouteDef {

  /** 
   * Regex to test the pathname on. It must start with `^`. If this is a child route, 
   * it will be tested against the remaining portion of the parent route.  
   */
  path: RegExp;
  pathParams?: string[];
  /** 
   * The uppercase method names to match this route.
   * 
   * If the array is empty and denyFinal is true, it will match all methods.
   * 
   * If the array is empty and denyFinal is false, it will throw an error.
   */
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
     * If true, the request must have the "x-requested-with" header set to keyof AllowedRequestedWithHeaderKeys.
     * This is a common way to check if the request is an AJAX request.
     * If the header is not set, the request will be rejected with a 403 Forbidden.
     * 
     * @see {@link AllowedRequestedWithHeaderKeys}
     */
    requestedWithHeader?: boolean;
  };


}
export interface ServerRoute extends RouteDef {

  /**
   * If this route's handler sends headers, the matched child route will not be called.
   */
  handler: (state: ServerRequest) => Promise<typeof STREAM_ENDED>

  /**
   * If the handler promise rejects, this function will be called as a second attempt.
   * 
   * Same rules apply as for handler.
   */
  catchHandler?: (state: ServerRequest, error: any) => Promise<typeof STREAM_ENDED>

  registerError: Error;

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
    handler: (state: ServerRequest) => Promise<symbol | void>,
    catchHandler?: (state: ServerRequest, error: any) => Promise<symbol | void>
  ) => ServerRoute;
}


const debugDefining = Debug("mws:router:defining");
function defineRoute(
  parent: { $o?: any; method: any; } | typeof ROOT_ROUTE,
  route: RouteDef,
  handler: (state: any) => any,
  catchHandler?: (state: any, error: any) => any
) {

  if (route.bodyFormat && !BodyFormats.includes(route.bodyFormat))
    throw new Error("Invalid bodyFormat: " + route.bodyFormat);
  if (!route.method.length && !route.denyFinal)
    throw new Error("Route must have at least one method or have denyFinal set to true");
  if (parent !== ROOT_ROUTE && parent.method.length && !route.method.every(e => parent.method.includes(e)))
    throw new Error("Invalid method: " + route.method);
  if (route.path.source[0] !== "^")
    throw new Error("Path regex must start with ^");

  if (parent !== ROOT_ROUTE) {
    // the typing is too complicated if we add childRoutes
    if (!(parent as any).childRoutes) (parent as any).childRoutes = [];
    (parent as any).childRoutes.push(route);
  }

  (route as ServerRoute).defineRoute = (...args: [any, any, any]) => defineRoute(route, ...args);

  (route as ServerRoute).handler = handler;

  (route as ServerRoute).catchHandler = catchHandler;

  (route as ServerRoute).registerError = new Error("defineRoute register error");

  debugDefining(route.method, route.path.source);

  return route as any;
}

export const ROOT_ROUTE: unique symbol = Symbol("ROOT_ROUTE");

export function createRootRoute(
  method: string[],
  handler: (state: ServerRequest) => Promise<void>
): ServerRoute {
  return defineRoute(ROOT_ROUTE, {
    method,
    path: /^/,
    denyFinal: true,
  }, handler);
}
