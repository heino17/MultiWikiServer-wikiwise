import { STREAM_ENDED, Streamer, SYMBOL_IGNORE_ERROR } from "./listen/streamer";
import { StateObject } from "./routes/StateObject";
import RootRoute from "./routes";
import * as z from "zod";
import { createStrictAwaitProxy, JsonValue, truthy, Z2 } from "./utils";
import { Route, rootRoute, RouteOptAny, RouteMatch, } from "./utils";
import { setupDevServer } from "./listen/setupDevServer";
import { ServerState } from "./ServerState";
import { CacheState, registerCacheRoutes, startupCache } from "./routes/cache";
import * as http from "http";
import * as http2 from "http2";
import { SessionManager } from "./services/sessions";
import { Listener } from "./listen/listeners";
import { fromError } from 'zod-validation-error';
import { t as try_ } from "try";
export { RouteMatch, Route, rootRoute };
import Debug from "debug";
import { TW } from "tiddlywiki";
import compression = require("compression");
const debug = Debug("mws:router");


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


export class Router {

  static async makeRouter(
    config: ServerState
  ) {

    const sendDevServer = await setupDevServer(config);

    const rootRoute = defineRoute(ROOT_ROUTE, {
      method: AllowedMethods,
      path: /^/,
      denyFinal: true,
    }, async (state: StateObject) => {
      // real world example of a parent route being useful:
      state.sendDevServer = sendDevServer.bind(undefined, state);
    });

    await RootRoute(rootRoute, config);

    return new Router(rootRoute, config);
  }



  enableBrowserCache: boolean = true;
  enableGzip: boolean = false;
  csrfDisable: boolean = false;

  get siteConfig() { return this.config; }
  public engine: ServerState["engine"];
  public PasswordService: ServerState["PasswordService"];

  fieldModules: TW["Tiddler"]["fieldModules"];

  versions;
  private tiddlerCache: CacheState;

  constructor(
    private rootRoute: rootRoute,
    private config: ServerState,
  ) {
    this.engine = config.engine;
    this.PasswordService = config.PasswordService;
    this.fieldModules = config.fieldModules;
    this.versions = config.versions;
    this.tiddlerCache = config.pluginCache;
  }



  async handle(streamer: Streamer) {

    if (!this.csrfDisable
      && ["POST", "PUT", "DELETE"].includes(streamer.method)
      && streamer.headers["x-requested-with"] !== "TiddlyWiki"
    )
      throw streamer.sendString(400, { "x-reason": "x-requested-with missing" },
        `'X-Requested-With' header required`, "utf8");

    const authUser = await SessionManager.parseIncomingRequest(streamer, this);

    /** This should always have a length of at least 1 because of the root route. */
    const routePath = this.findRoute(streamer);

    // we return 400 here, because if the request matches a route, then it is possible 
    // that a resource could have existed at this address, 
    // but if no route matches, any such question is irrelevant because the request
    // was malformed and nothing can be inferred from returning 404. A resource could 
    // have existed, if the request had been well-formed, but no such determination 
    // could be made, because no handler was found which could satisfy this request. 
    // this protects the semantic meaning of 404 as being the valid response of NOT FOUND
    // to a valid request about a specific URL. We do not want the client to wrongfully
    // conclude that a resource DOES NOT exist, because the fact that they're requesting
    // a route with no handler points to a much more fundamental problem than just 
    // no resource existing. The fact is that they did not even know how to ask the question,
    // and simply telling them a resource does not exist is the wrong answer. 
    if (!routePath.length || routePath[routePath.length - 1]?.route.denyFinal)
      return streamer.sendEmpty(400, { "x-reason": "no-route" });

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
        this,
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
    method: AllowedMethod
  ): RouteMatch[] {
    for (const potentialRoute of routes) {
      // Skip if the method doesn't match.
      if (!potentialRoute.method.includes(method)) continue;

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

  (route as Route).handler = handler;

  debug.extend("defining")(route.method, route.path.source);

  return route as any; // this is usually ignored except for the root route.
}


export interface ZodAction<T extends z.ZodTypeAny, R extends JsonValue> {
  // (state: StateObject): Promise<typeof STREAM_ENDED>;
  inner: (route: z.output<T>) => Promise<R>
  zodRequestBody: (z: Z2<"JSON">) => T;
  zodResponse?: (z: Z2<"JSON">) => z.ZodType<R>;
}

export interface ZodRoute<
  M extends AllowedMethod,
  B extends BodyFormat,
  P extends Record<string, z.ZodTypeAny>,
  Q extends Record<string, z.ZodTypeAny>,
  T extends z.ZodTypeAny,
  R extends JsonValue
> extends ZodAction<T, R> {
  zodPathParams: (z: Z2<"STRING">) => P;
  zodQueryParams: (z: Z2<"STRING">) => Q;
  method: M[];
  path: string;
  bodyFormat: B;
  inner: (state: ZodState<M, B, Q, P, T>) => Promise<R>,
}

export class ZodState<
  M extends AllowedMethod,
  B extends BodyFormat,
  P extends Record<string, z.ZodTypeAny>,
  Q extends Record<string, z.ZodTypeAny>,
  T extends z.ZodTypeAny
> extends StateObject<B, M, string[][], z.output<T>> {
  declare pathParams: z.output<z.ZodObject<P>>;
  declare queryParams: z.output<z.ZodObject<Q>>;
  // declare data: z.output<T>;
}


export type RouterRouteMap<T> = {
  [K in keyof T as T[K] extends ZodAction<any, any> ? K : never]:
  T[K] extends {
    zodRequest: (z: any) => infer REQ extends z.ZodTypeAny,
    zodResponse?: (z: any) => infer RES extends z.ZodType<JsonValue>
  } ? ((data: z.input<REQ>) => Promise<jsonify<z.output<RES>>>) : never;
}

export type jsonify<T> =
  T extends void ? null :
  T extends Promise<any> ? unknown :
  T extends Date ? string :
  // T extends Map<infer K, infer V> ? [jsonify<K>, jsonify<V>][] :
  // T extends Set<infer U> ? jsonify<U>[] :
  T extends string | number | boolean | null | undefined ? T :
  T extends [...any[]] ? number extends T["length"] ? jsonify<T[number]>[] : [...jsonifyTuple<T>] :
  T extends Array<infer U> ? jsonify<U>[] :
  T extends object ? { [K in keyof T]: jsonify<T[K]> } :
  unknown;

export type jsonifyTuple<T> = T extends [infer A, ...infer B] ? [jsonify<A>, ...jsonifyTuple<B>] : T extends [infer A] ? [jsonify<A>] : [];



export type RouterKeyMap<T, V> = {
  [K in keyof T as T[K] extends ZodAction<any, any> ? K : never]: V;
}


// this is definitely the better version of defineRoute, but that was the starting point
export function zodRoute<
  M extends AllowedMethod,
  B extends "GET" | "HEAD" extends M ? "ignore" : BodyFormat,
  P extends Record<string, z.ZodTypeAny>,
  Q extends Record<string, z.ZodType<any, any, string[] | undefined>>,
  T extends z.ZodTypeAny,
  R extends JsonValue
>({
  method, path, bodyFormat,
  zodPathParams,
  zodQueryParams = (z => ({}) as any),
  zodRequestBody = ["string", "json", "www-form-urlencoded"].includes(bodyFormat)
    ? z => z.undefined() : (z => z.any() as any),
  inner
}: {
  method: M[];
  /** `"/path/to/route/:var/route/:var2"` */
  path: string;
  bodyFormat: B;
  /** 
   * The input will be `Record<string, string>` 
   * If a path variable is not set in the request, the path will not match.
   * 
   * Expects a Record of zod checks. Every path variable must be included.
  */
  zodPathParams: (z: Z2<"STRING">) => P;
  /** 
   * The input will be `Record<string, string[]>`. 
   * If a value is not set, an empty string is used. 
   * 
   * Expects a Record of zod checks.
   * 
   * The default behavior is to remove all query params.
   */
  zodQueryParams?: (z: Z2<"STRING">) => Q;
  /** 
   * A zod check of the request body result. 
   * 
   * Only valid for `string`, `json`, and `www-form-urlencoded` body types
   * 
   * The default is `undefined` for those types.
   */
  zodRequestBody?: B extends "string" | "json" | "www-form-urlencoded" ? (z: Z2<"JSON">) => T : undefined;
  inner: (state: ZodState<M, B, P, Q, T>) => Promise<R>;
}): ZodRoute<M, B, P, Q, T, R> {

  return {
    method,
    path,
    bodyFormat,
    inner,
    zodRequestBody,
    zodPathParams,
    zodQueryParams,
  } as ZodRoute<M, B, P, Q, T, R>;
}

export const registerZodRoutes = (root: rootRoute, router: any, keys: string[]) => {
  // const router = new TiddlerRouter();
  keys.forEach((key) => {
    const route = router[key as keyof typeof router] as ZodRoute<any, any, any, any, any, any>;
    const { method, path, bodyFormat, zodPathParams, zodRequestBody: zodRequest, inner } = route;
    const pathParams = path.split("/").filter(e => e.startsWith(":")).map(e => e.substring(1));
    ///^\/recipes\/([^\/]+)\/tiddlers\/(.+)$/,
    if (!path.startsWith("/")) throw new Error(`Path ${path} must start with a forward slash`);
    if (key.startsWith(":")) throw new Error(`Key ${key} must not start with a colon`)
    const pathregex = "^" + path.split("/").map(e =>
      e === "$key" ? key : e.startsWith(":") ? "([^/]+)" : e
    ).join("\\/") + "$";

    root.defineRoute({
      method: [...method, "OPTIONS"],
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
      // return await (router[key] as ZodRoute<any, any, any, any, any>)(state);
      const pathCheck = Z2.object(zodPathParams(Z2)).safeParse(state.pathParams);
      if (!pathCheck.success) {
        console.log(pathCheck.error);
        throw state.sendString(400, { "x-reason": "zod-path" },
          fromError(pathCheck.error).toString(), "utf8");
      }

      const inputCheck = zodRequest(Z2).safeParse(state.data);
      if (!inputCheck.success) {
        console.log(inputCheck.error);
        throw state.sendString(400, { "x-reason": "zod-request" },
          fromError(inputCheck.error).toString(), "utf8");
      }

      const [good, error, res] = await inner(state)
        .then(e => [true, undefined, e] as const, e => [false, e, undefined] as const);

      if (!good) {
        if (error === STREAM_ENDED) {
          return error;
        } else if (typeof error === "string") {
          return state.sendString(400, { "x-reason": "zod-handler" }, error, "utf8");
        } else if (error instanceof Error && error.name === "UserError") {
          return state.sendString(400, { "x-reason": "user-error" }, error.message, "utf8");
        } else {
          throw error;
        }
      }

      return state.sendJSON(200, res);
    });
  });
}



export function zodManage<T extends z.ZodTypeAny, R extends JsonValue>(
  zodRequest: (z: Z2<"JSON">) => T,
  inner: (state: ZodState<"POST", "json", Record<string, z.ZodTypeAny>, {}, T>, prisma: PrismaTxnClient) => Promise<R>
) {
  return zodRoute({
    method: ["POST"],
    path: "/manager/$key",
    zodPathParams: z => ({}),
    zodQueryParams: z => ({}),
    bodyFormat: "json",
    zodRequestBody: zodRequest as any,
    inner: async (state) => {
      return state.$transaction(async (prisma) => await inner(state, prisma));
    }
  });
}
