import { TW } from "tiddlywiki";
import * as z from "zod";
import { StateObject } from "../routes/StateObject";
import { Streamer } from "./streamer";
import Debug from "debug";
import { ServerState } from "../ServerState";
import { SessionManager } from "../services/sessions";
import { BodyFormat, createStrictAwaitProxy, AllowedMethod, RouteMatch, zodTransformJSON } from "../utils";
import { IncomingMessage, ServerResponse } from "node:http";
import { Http2ServerRequest, Http2ServerResponse } from "node:http2";
import { t as try_ } from "try";
import { Listener } from "./listeners";
import helmet from "helmet";

const debug = Debug("mws:router:matching");

export class Router {
  helmet;
  constructor(
    private rootRoute: rootRoute,
    private config: ServerState
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
    options: Listener
  ) {

    this.handleRequest(req, res, options).catch(err2 => {
      if (err2 === STREAM_ENDED) return;
      res.writeHead(500, { "x-reason": "handle incoming request" }).end();
      console.log(req.url, err2);
    });


  }

  async handleRequest(
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse | Http2ServerResponse,
    options: Listener
  ) {

    await new Promise<void>((resolve, reject) => this.helmet(
      req as IncomingMessage,
      res as ServerResponse,
      err => err ? reject(err) : resolve()
    ));

    const streamer = new Streamer(
      req, res, options.prefix,
      !!(options.key && options.cert || options.secure)
    );

    await this.handleStreamer(streamer).catch(streamer.catcher);

  }

  async handleStreamer(streamer: Streamer) {
    // await new Promise(resolve => {
    //   this.helmet(streamer.req)
    // })
    // this.helmet(req as IncomingMessage, res as ServerResponse, (err1) => {
    //   if (err1) {
    //     console.log("helmet error", err1);
    //     res.writeHead(500, { "x-reason": "helmet error" }).end();
    //     return;
    //   }
    // });



    if (!this.config.csrfDisable
      && !["GET", "HEAD", "OPTIONS"].includes(streamer.method)
      && streamer.headers["x-requested-with"] !== "TiddlyWiki")
      throw streamer.sendString(400, { "x-reason": "x-requested-with missing" },
        `'X-Requested-With' header required`, "utf8");

    const authUser = await SessionManager.parseIncomingRequest(streamer, this.config);

    /** This should always have a length of at least 1 because of the root route. */
    const routePath = this.findRoute(streamer);

    // return 400 rather than 404 to protect the semantic meaning of 404 NOT FOUND,
    // because if the request does not match a route, we have no way of knowing what
    // resource they thought they were requesting and whether or not it exists.
    if (!routePath.length || routePath[routePath.length - 1]?.route.denyFinal)
      return streamer.sendEmpty(400, { "x-reason": "no-route" });

    // Optionally output debug info
    console.log(streamer.method, streamer.url);
    // if no bodyFormat is specified, we default to ignore
    const bodyFormat = routePath.find(e => e.route.bodyFormat)?.route.bodyFormat || "ignore";

    type statetype = {
      [K in BodyFormat]: StateObject<K>;
    }[BodyFormat];

    const state = createStrictAwaitProxy(
      new StateObject(
        streamer,
        routePath,
        bodyFormat,
        authUser,
        this.config
      ) as statetype
    );


    const method = streamer.method;

    // anything that sends a response before this should have thrown, but just in case
    if (streamer.headersSent) return;

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
      const state2: StateObject = state as any;
      return state2.sendString(500, {}, "Invalid bodyFormat: " + state2.bodyFormat, "utf8");
    }

    return await this.handleRoute(state, routePath);

  }



  async handleRoute(state: StateObject<BodyFormat>, route: RouteMatch[]) {

    let result: any = state;
    for (const match of route) {
      await match.route.handler(result);
      if (state.headersSent) return;
    }
    if (!state.headersSent) {
      state.sendEmpty(404, {});
      console.log("No handler sent headers before the promise resolved.");
    }

  }

  findRouteRecursive(
    routes: Route[],
    testPath: string,
    method: AllowedMethod | null,
    returnAll: boolean
  ): RouteMatch[][] {
    const results: RouteMatch[][] = [];
    for (const potentialRoute of routes) {
      // Skip if the method doesn't match.
      if (method && !potentialRoute.method.includes(method)) continue;

      // Try to match the path.
      const match = potentialRoute.path.exec(testPath);

      if (match) {
        debug.extend("matching")(potentialRoute.path.source, testPath, match?.[0]);
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
    return routes.find(e => e.every(f => f.route.method.includes(method))) ?? [];
  }

}
