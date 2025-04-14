import { STREAM_ENDED, Streamer } from "../streamer";
import { StateObject } from "../StateObject";
import RootRoute from ".";
import * as z from "zod";
import { createStrictAwaitProxy, JsonValue, truthy, Z2 } from "../utils";
import { Route, rootRoute, RouteOptAny, RouteMatch, } from "../utils";
import { MWSConfigConfig } from "../server";
import { setupDevServer } from "../setupDevServer";
import { Commander } from "../commander";
import { ZodRoute, ZodState } from "./BaseManager";
import { CacheState, startupCache } from "./cache";

export { RouteMatch, Route, rootRoute };

export const AllowedMethods = [...["GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE"] as const];
export type AllowedMethod = typeof AllowedMethods[number];

export const BodyFormats = ["stream", "string", "json", "buffer", "www-form-urlencoded", "www-form-urlencoded-urlsearchparams", "ignore"] as const;
export type BodyFormat = typeof BodyFormats[number];

export const PermissionName = []

const zodTransformJSON = (arg: string, ctx: z.RefinementCtx) => {
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

export interface SiteConfig extends MWSConfigConfig {
  wikiPath: string;
  attachmentSizeLimit: number;
  attachmentsEnabled: boolean;
  contentTypeInfo: Record<string, any>;
  saveLargeTextToFileSystem: never;
  storePath: string;
}

export class Router {

  static async makeRouter(
    commander: Commander,
    enableDevServer: string | undefined
  ) {

    const sendDevServer = await setupDevServer(enableDevServer);

    const rootRoute = defineRoute(ROOT_ROUTE, {
      method: AllowedMethods,
      path: /^/,
      denyFinal: true,
    }, async (state: StateObject) => {
      state.sendDevServer = sendDevServer.bind(undefined, state);
    });

    await commander.SessionManager.defineRoutes(rootRoute);

    await RootRoute(rootRoute);

    const cache = await startupCache(commander);

    return new Router(rootRoute, commander, cache);
  }


  pathPrefix: string = "";
  enableBrowserCache: boolean = true;
  enableGzip: boolean = false;
  csrfDisable: boolean = false;
  servername: string = "";
  variables = new Map();
  get(name: string): string {
    return this.variables.get(name) || "";
  }
  public engine: Commander["engine"];
  private SessionManager: Commander["SessionManager"];

  constructor(
    private rootRoute: rootRoute,
    private commander: Commander,
    private tiddlerCache: CacheState,
  ) {
    this.engine = commander.engine;
    this.SessionManager = commander.SessionManager;

  }

  async handle(streamer: Streamer) {

    if (!this.csrfDisable
      && ["POST", "PUT", "DELETE"].includes(streamer.method)
      && streamer.headers["x-requested-with"] !== "TiddlyWiki"
    )
      throw streamer.sendString(403, { "x-reason": "x-requested-with missing" },
        `'X-Requested-With' header required to login to '${this.servername}'`, "utf8");

    const authUser = await this.SessionManager.parseIncomingRequest(streamer, this);

    /** This should always have a length of at least 1 because of the root route. */
    const routePath = this.findRoute(streamer);
    if (!routePath.length || routePath[routePath.length - 1]?.route.denyFinal)
      return streamer.sendEmpty(404, { "x-reason": "no-route" });

    // Optionally output debug info
    console.log(streamer.method, streamer.url);
    // if no bodyFormat is specified, we default to "buffer" since we do still need to recieve the body
    const bodyFormat = routePath.find(e => e.route.bodyFormat)?.route.bodyFormat || "buffer";

    type statetype = { [K in BodyFormat]: StateObject<K> }[BodyFormat]

    const state = createStrictAwaitProxy(
      new StateObject(
        streamer,
        routePath,
        bodyFormat,
        authUser,
        this.commander,
        this.tiddlerCache,
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
        if (!success) return state.sendEmpty(400, {});
        state.data = data;
      }
    } else if (state.bodyFormat === "www-form-urlencoded-urlsearchparams"
      || state.bodyFormat === "www-form-urlencoded") {
      const data = state.data = new URLSearchParams((await state.readBody()).toString("utf8"));
      if (state.bodyFormat === "www-form-urlencoded") {
        state.data = Object.fromEntries(data);
      }
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
    method: AllowedMethod
  ): RouteMatch[] {
    for (const potentialRoute of routes) {
      // Skip if the method doesn't match.
      if (!potentialRoute.method.includes(method)) continue;

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
        // If there are inner routes, try to match them recursively.
        if (childRoutes.length > 0) {
          const innerMatch = this.findRouteRecursive(
            childRoutes,
            remainingPath,
            method
          );
          return [result, ...innerMatch];
        } else {
          return [result];
        }
      }
    }
    return [];
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
    if (this.pathPrefix && testPath.startsWith(this.pathPrefix))
      testPath = testPath.slice(this.pathPrefix.length) || "/";
    return this.findRouteRecursive([this.rootRoute as any], testPath, method);
  }

}

const ROOT_ROUTE: unique symbol = Symbol("ROOT_ROUTE");
function defineRoute(
  parent: { $o?: any, method: any } | typeof ROOT_ROUTE,
  route: RouteOptAny,
  handler: (state: any) => any,
) {

  if (route.bodyFormat && !BodyFormats.includes(route.bodyFormat))
    throw new Error("Invalid bodyFormat: " + route.bodyFormat);
  if (!route.method.every(e => (parent === ROOT_ROUTE ? AllowedMethods : parent.method).includes(e)))
    throw new Error("Invalid method: " + route.method);
  if (route.path.source[0] !== "^")
    throw new Error("Path regex must start with ^");

  if (parent !== ROOT_ROUTE) {
    // the typing is too complicated if we add childRoutes
    if (!(parent as any).childRoutes) (parent as any).childRoutes = [];
    (parent as any).childRoutes.push(route);
  }

  (route as any).defineRoute = (...args: [any, any]) => defineRoute(route, ...args);

  (route as any).handler = handler;

  return route as any; // this is usually ignored except for the root route.
}



// this is definitely the better version of defineRoute, but that was the starting point
export function zodRoute<M extends AllowedMethod, B extends "GET" | "HEAD" extends M ? "ignore" : BodyFormat, P extends Record<string, z.ZodTypeAny>, T extends z.ZodTypeAny, R extends JsonValue>(
  method: M[],
  path: string,
  zodPathParams: (z: Z2<"STRING">) => P,
  bodyFormat: B,
  zodRequest: (z: Z2<"JSON">) => T,
  handler: (state: ZodState<M, B, P, T>) => Promise<R>,
): ZodRoute<M, B, P, T, R> {
  // return and throw indicate whether the transaction should commit or rollback
  const action = async (state: StateObject): Promise<typeof STREAM_ENDED> => {

    const pathCheck = Z2.object(zodPathParams(Z2)).safeParse(state.pathParams);
    if (!pathCheck.success) {
      console.log(pathCheck.error);
      throw state.sendEmpty(400, { "x-reason": "zod-path" });
    }

    const inputCheck = zodRequest(Z2).safeParse(state.data);
    if (!inputCheck.success) {
      console.log(inputCheck.error);
      throw state.sendEmpty(400, { "x-reason": "zod-request" });
    }

    const [good, error, res] = await handler(state as ZodState<M, B, P, T>)
      .then(e => [true, undefined, e] as const, e => [false, e, undefined] as const);

    if (!good) {
      if (error === STREAM_ENDED) {
        return error;
      } else if (typeof error === "string") {
        throw state.sendString(400, { "x-reason": "zod-handler" }, error, "utf8");
      } else if (error instanceof Error && error.name === "UserError") {
        throw state.sendString(400, { "x-reason": "user-error" }, error.message, "utf8");
      } else {
        throw error;
      }
    }

    return state.sendJSON(200, res);

  };
  action.path = path;
  action.inner = handler;
  action.zodRequest = zodRequest;
  action.zodPathParams = zodPathParams;
  action.method = method;
  action.bodyFormat = bodyFormat;

  return action
}

export const registerZodRoutes = (root: rootRoute, router: any, keys: string[]) => {
  // const router = new TiddlerRouter();
  keys.forEach((key) => {
    const route = router[key as keyof typeof router] as ZodRoute<any, any, any, any, any>;
    const { method, path, bodyFormat } = route;
    const pathParams = path.split("/").filter(e => e.startsWith(":")).map(e => e.substring(1));
    ///^\/recipes\/([^\/]+)\/tiddlers\/(.+)$/,
    const pathregex = "^" + path.split("/").map(e => e.startsWith(":") ? "([^/]+)" : e).join("\\/") + "$";
    root.defineRoute({
      method,
      path: new RegExp(pathregex),
      pathParams,
      bodyFormat,
    }, async state => {
      if (state.method === "OPTIONS") {
        return state.sendEmpty(200, {
          // "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": method.join(","),
          "Access-Control-Allow-Headers": "Accept, Content-Type, X-Requested-With",
        });
      }
      // we do it out here so we don't start a transaction if the key is invalid.
      if (!keys.includes(key)) throw new Error("No such action");
      const action = router[key] as ZodRoute<any, any, any, any, any>;
      return await action(state);
    });
  });
}
