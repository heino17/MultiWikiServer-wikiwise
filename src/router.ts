import { ok } from "assert";
import { AuthState, AuthStateRouteACL } from "./AuthState";
import { Streamer } from "./server";
import { StateObject } from "./StateObject";
import RootRoute from "./routes";
import * as z from "zod";
import { is } from "./helpers";

export const AllowedMethods = [...["GET", "HEAD", "OPTIONS", "POST", "PUT", "DELETE"] as const];
export type AllowedMethod = typeof AllowedMethods[number];

export const BodyFormats = ["stream", "string", "json", "buffer", "www-form-urlencoded", "www-form-urlencoded-object", "ignore"] as const;
export type BodyFormat = typeof BodyFormats[number];


const zodJSON = (arg: string, ctx: z.RefinementCtx) => {
  try {
    return JSON.parse(arg);
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
  pathPrefix: string = "";
  enableBrowserCache: boolean = true;
  enableGzip: boolean = true;
  csrfDisable: boolean = false;
  servername: string = "";
  variables = new Map();
  get(name: string): string {
    return this.variables.get(name) || "";
  }
  rootRoute: Route;
  constructor() {
    this.rootRoute = defineRoute(ROOT_ROUTE, {
      useACL: {},
      method: AllowedMethods,
      path: /^/,
      // we can put handler stuff here if we want, but at the moment that's not necessary
      handler: async (state: any) => state,
    });
    RootRoute(this.rootRoute as rootRoute);
  }

  async handle(streamer: Streamer) {

    const authState = new AuthState(this);

    await authState.checkStreamer(streamer);

    /** This always has a length of at least 1. */
    const routePath = this.findRoute(streamer);
    // well, at least after this line it does.
    if (!routePath.length) return streamer.sendString(404, {}, "Not found", "utf8");

    await authState.checkMatchedRoutes(routePath);

    // Optionally output debug info
    // if (this.get("debug-level") !== "none") {
    console.log("Request path:", JSON.stringify(streamer.url));
    console.log("Request headers:", JSON.stringify(streamer.headers));
    console.log(authState.toDebug());
    // }

    // if no bodyFormat is specified, we default to "buffer" since we do still need to recieve the body
    const bodyFormat = routePath.find(e => e.route.bodyFormat)?.route.bodyFormat || "buffer";

    type statetype = { [K in BodyFormat]: StateObject<K> }[BodyFormat]

    const state = new StateObject(streamer, routePath, bodyFormat, authState, this) as statetype;
    const method = streamer.method;

    // anything that sends a response before this should have thrown, but just in case
    if (streamer.headersSent) return;


    if (state.bodyFormat === "stream" || state.bodyFormat === "ignore" || ["GET", "HEAD"].includes(method)) {
      // this starts dumping bytes early, rather than letting node do it once the res finishes.
      // the only advantage is that it eases congestion on the socket.
      if (state.bodyFormat === "ignore" || ["GET", "HEAD"].includes(method)) streamer.reader.resume();

      return await this.handleRoute(state, routePath);
    }
    if (state.bodyFormat === "string" || state.bodyFormat === "json") {
      state.data = (await state.readBody()).toString("utf8");
      if (state.bodyFormat === "json") {
        // make sure this parses as valid data
        const { success, data } = z.string().transform(zodJSON).safeParse(state.data);
        if (!success) return state.sendEmpty(400, {});
        state.data = data;
      }
    } else if (state.bodyFormat === "www-form-urlencoded" || state.bodyFormat === "www-form-urlencoded-object") {
      const data = state.data = new URLSearchParams((await state.readBody()).toString("utf8"));
      if (state.bodyFormat === "www-form-urlencoded-object") {
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
    // we don't check buffer or stream, but stream isn't here, so just not buffer.
    if (state.bodyFormat !== "buffer") {
      // check zod for the entire tree, starting from the first bodyFormat
      // since it is a type error for zod to be specified above the bodyFormat, 
      // we can optimize this for performance and consistency.
      const firstBodyFormat = routePath.findIndex(e => e.route.bodyFormat);
      // if we don't have a body format, skip zod.
      const result = firstBodyFormat === -1 ? [] : routePath.slice(firstBodyFormat)
        .map(e => z.any().pipe(e.route.zod ?? z.any()).safeParse(state.data));

      if (result.length) {
        if (!result.every(e => e.success)) return state.sendEmpty(400, {});
        // we use the last zod result (zod strips unknown keys, among other things)
        state.data = result.pop();
      }
    }

    return await this.handleRoute(state, routePath);

  }


  async handleRoute(state: StateObject<BodyFormat>, route: RouteMatch[]) {

    await state.authState.checkStateObject(state);


    {
      let result: any = state;
      for (const match of route) {
        result = await match.route.handler(result);
        if (state.headersSent) return;
      }
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
    const { method, url } = streamer;
    let testPath = url.pathname || "/";
    if (this.pathPrefix && testPath.startsWith(this.pathPrefix))
      testPath = testPath.slice(this.pathPrefix.length) || "/";
    return this.findRouteRecursive([this.rootRoute], testPath, method);
  }

}


interface RouteOptBase<B extends BodyFormat, M extends AllowedMethod[], R, Z extends z.ZodTypeAny> {
  /** The ACL options for this route. It is required to simplify updates, but could be empty by default */
  useACL: AuthStateRouteACL;
  /** 
   * Regex to test the pathname on. It must start with `^`. If this is a child route, 
   * it will be tested against the remaining portion of the parent route.  
   */
  path: RegExp;
  /** The uppercase method names to match this route */
  method: M;
  /** 
   * The highest bodyformat in the chain always takes precedent. Type-wise, only one is allowed, 
   * but at runtime the first one found is the one used. 
   */
  bodyFormat?: B;
  /**
   * If this route's handler sends headers, the matched child route will not be called.
   */
  handler: (state: StateObject<B, M[number], RouteMatch[], Z extends z.ZodTypeAny ? z.infer<Z> : undefined>) => Promise<R>

  zod?: Z;
}
interface RouteOptAny extends RouteOptBase<BodyFormat, AllowedMethod[], any, any> { }

export interface Route extends RouteDef<[BodyFormat | undefined, AllowedMethod[], any], any> { }

export interface rootRoute extends RouteDef<[undefined, AllowedMethod[], StateObject<BodyFormat, AllowedMethod>], any> { }

export interface RouteMatch<Params extends string[] = string[]> {
  route: Route;
  params: Params;
  remainingPath: string;
}

interface RouteDef<P extends [BodyFormat | undefined, AllowedMethod[], any], PZ extends z.ZodTypeAny>
  extends RouteOptBase<P[0] & {}, P[1], P[2], PZ> {


  // the jsdoc comment doesn't show up here in VSCode, so I put it on each overload. annoying!
  defineRoute:
  P extends [BodyFormat, AllowedMethod[], any] ?
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
  <R, Z extends z.ZodTypeAny, T extends RouteOptBase<P[0], P[1], R, Z> & { bodyFormat?: undefined }>(
    route: T
  ) => RouteDef<[P[0], T["method"], R], T["zod"] & {}>

  : P extends [undefined, AllowedMethod[], any] ? {
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
    <R, Z extends z.ZodTypeAny, K extends BodyFormat, T extends RouteOptBase<K, P[1], R, Z> & { bodyFormat: K }>(
      route: T
    ): RouteDef<[T["bodyFormat"], T["method"], R], T["zod"] & {}>
    // <R, Z extends z.ZodTypeAny, T extends {
    //   [K in BodyFormat]: RouteOptBase<K, P[1], R, Z> & { bodyFormat: K, zod?: Z }
    // }[BodyFormat]>(
    //   route: T
    // ): RouteDef<[T["bodyFormat"], T["method"], R], T["zod"]>
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
    <R, T extends RouteOptBase<BodyFormat, P[1], R, never> & { bodyFormat?: undefined }>(
      route: T
    ): RouteDef<[undefined, T["method"], R], never>

  }

  : never;

  $o?: P;
}



const ROOT_ROUTE: unique symbol = Symbol("ROOT_ROUTE");

function defineRoute(
  parent: { $o?: any, method: any } | typeof ROOT_ROUTE,
  route: RouteOptAny
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

  (route as any).defineRoute = defineRoute.bind(null, route)

  return route as any; // this is usually ignored except for the root route.
}
/** This doesn't need to run, it's just to test types */
function testroute(root: rootRoute) {

  const test1 = root.defineRoute({
    useACL: {},
    path: /^test/,
    method: ["GET", "POST"],
    bodyFormat: undefined,
    handler: async state => {
      const test: BodyFormat = state.bodyFormat;
    },
  });

  const test2_2 = test1.defineRoute({
    useACL: {},
    path: /^test/,
    bodyFormat: "www-form-urlencoded-object",
    method: ["POST"],
    zod: z.object({ test: z.string() }),
    handler: async state => {


    }
  })

  const test2 = test1.defineRoute({
    useACL: {},
    path: /^test/,
    bodyFormat: "string",
    method: ["GET"],
    zod: z.string(),
    handler: async state => {
      // // @ts-expect-error because we didn't include "string"
      // const test: Exclude<BodyFormat, "string"> = state.bodyFormat;
      // // no error here if bodyFormat is correctly typed
      // const test2: "string" = state.bodyFormat
      // // @ts-expect-error because it should be "string"
      // state.isBodyFormat("buffer");
      // // this should never be an error unless something is really messed up
      // state.isBodyFormat("string");
    },
  });

  const test3 = test2.defineRoute({
    useACL: {},
    path: /^test/,
    method: ["GET"],
    // // @ts-expect-error because it's already been defined by the parent
    // bodyFormat: "buffer",
    zod: z.string(),
    handler: async state => {
      // //@ts-expect-error because we didn't include "string"
      // const test: Exclude<BodyFormat, "string"> = state.bodyFormat;
      // // no error here if bodyFormat is correctly typed
      // const test2: "string" = state.bodyFormat
      // // @ts-expect-error because it should be "string"
      // state.isBodyFormat("buffer");
      // // this should never be an error unless something is really messed up
      // state.isBodyFormat("string");
    },
  })
}