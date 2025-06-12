import * as z from "zod";
import { ServerRequest, ServerRequestClass } from "./StateObject";
import { Streamer } from "./streamer";
import Debug from "debug";
import { IncomingMessage, ServerResponse } from "node:http";
import { Http2ServerRequest, Http2ServerResponse } from "node:http2";
import { ListenOptions } from "./listeners";
import helmet from "helmet";
import { serverEvents } from "@tiddlywiki/events";


const debug = Debug("mws:router:matching");

export class Router {
  helmet;
  constructor(
    public rootRoute: ServerRoute
  ) {
    //https://helmetjs.github.io/
    // we'll start with the defaults and go from there
    // feel free to open issues on Github for this
    this.helmet = helmet({
      contentSecurityPolicy: false,
      strictTransportSecurity: false,
    });

  }

  handle(
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse | Http2ServerResponse,
    options: ListenOptions
  ) {
    // the sole purpose of this method is to catch errors
    this.handleRequest(req, res, options).catch(err2 => {
      if (err2 === STREAM_ENDED) return;
      res.writeHead(500, { "x-reason": "handle incoming request" }).end();
      console.log(req.url, err2);
    });


  }

  async handleRequest(
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse | Http2ServerResponse,
    options: ListenOptions
  ) {

    await serverEvents.emitAsync("request.middleware", this, req, res, options);

    await new Promise<void>((resolve, reject) => this.helmet(
      req as IncomingMessage,
      res as ServerResponse,
      err => err ? reject(err) : resolve()
    ));

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
      return streamer.sendEmpty(400, { "x-reason": "no-route" });
    }

    // A basic CSRF prevention so that basic HTML forms and AJAX requests
    // cannot be submitted unless custom headers can be sent.
    // Full CSRF protection would look like this:
    // 1. The server sends a CSRF token in the HTML form or AJAX request.
    // 2. The client sends the CSRF token back in the request headers.
    // 3. The server checks the CSRF token against the session.
    // 4. If the CSRF token is valid, the request is processed.
    // 5. If the CSRF token is invalid, the request is rejected with a 403 Forbidden.

    // If the route requires a CSRF check,
    if (routePath.some(e => e.route.securityChecks?.requestedWithHeader))
      // If the method is not GET, HEAD, or OPTIONS, 
      if (!["GET", "HEAD", "OPTIONS"].includes(streamer.method))
        // If the x-requested-with header is not set to "fetch", 
        if (streamer.headers["x-requested-with"] !== "fetch")
          // we reject the request with a 403 Forbidden.
          return streamer.sendEmpty(403, { "x-reason": "x-requested-with missing" });

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
      // the only advantage is that it eases congestion on the socket.
      if (state.bodyFormat === "ignore") streamer.reader.resume();

      return await this.handleRoute(state, routePath);
    }
    if (state.bodyFormat === "string" || state.bodyFormat === "json") {
      state.data = (await state.readBody()).toString("utf8");
      if (state.bodyFormat === "json") {
        // make sure this parses as valid data
        const { success, data } = z.string().transform(zodTransformJSON).safeParse(state.data);
        if (!success) return state.sendEmpty(400, { "x-reason": "json" });
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
      return state2.sendString(500, {}, "Invalid bodyFormat: " + state2.bodyFormat, "utf8");
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
      await match.route.handler(result);
      if (state.headersSent) return;
    }
    if (!state.headersSent) {
      await serverEvents.emitAsync("request.fallback", state, route);
      state.sendEmpty(404, {});
      console.log("No handler sent headers before the promise resolved.");
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
        debug(potentialRoute.path.source, testPath, match?.[0]);
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


export const zodTransformJSON = (arg: string, ctx: z.RefinementCtx) => {
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
      code: z.ZodIssueCode.custom,
      message: e instanceof Error ? e.message : `${e}`,
      fatal: true,
    });
    return z.NEVER;
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
     * If true, the request must have the "x-requested-with" header set to "XMLHttpRequest".
     * This is a common way to check if the request is an AJAX request.
     * If the header is not set, the request will be rejected with a 403 Forbidden.
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


const debugDefining = Debug("mws:router:defining");
function defineRoute(
  parent: { $o?: any; method: any; } | typeof ROOT_ROUTE,
  route: RouteDef,
  handler: (state: any) => any
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

  (route as ServerRoute).defineRoute = (...args: [any, any]) => defineRoute(route, ...args);

  (route as ServerRoute).handler = handler;

  debugDefining(route.method, route.path.source);

  return route as any;
}

export const ROOT_ROUTE: unique symbol = Symbol("ROOT_ROUTE");

export function createRootRoute(
  method: string[],
  handler: (state: ServerRequest) => void
) {
  console.log("Creating root route with methods", method);
  return defineRoute(ROOT_ROUTE, {
    method,
    path: /^/,
    denyFinal: true,
  }, handler);
}
