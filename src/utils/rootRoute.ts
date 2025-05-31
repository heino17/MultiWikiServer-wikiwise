import { StateObject } from "../routes/StateObject";
import * as z from "zod";
import { AllowedMethod, BodyFormat, JsonValue, Z2 } from ".";

export interface RouteOptAny extends RouteOptBase<BodyFormat, AllowedMethod[], string[]> { }

export interface Route extends RouteDef<ParentTuple, string[]> { }

declare global {
  interface rootRoute extends RouteDef<[
    undefined,
    AllowedMethod[],
    StateObject<BodyFormat, AllowedMethod>,
    [[]]
  ], []> { }
}

export interface RouteMatch {
  route: Route;
  params: (string | undefined)[];
  remainingPath: string;
}

type DetermineRouteOptions<
  P extends ParentTuple, PA extends string[]
> = P extends [BodyFormat, AllowedMethod[], any, any]
  ?
  RouteOptBase<P[0], P[1], PA> & { bodyFormat?: undefined; }
  :
  P extends [undefined, AllowedMethod[], any, any]
  ?
  | { [K in BodyFormat]: RouteOptBase<K, P[1], PA> & { bodyFormat: K; }; }[BodyFormat]
  | RouteOptBase<BodyFormat, P[1], PA> & { bodyFormat?: undefined; }
  : never;

type ParentTuple = [BodyFormat | undefined, AllowedMethod[], any, string[][]];

interface RouteOptBase<B extends BodyFormat, M extends AllowedMethod[], PA extends string[]> {

  /** 
   * Regex to test the pathname on. It must start with `^`. If this is a child route, 
   * it will be tested against the remaining portion of the parent route.  
   */
  path: RegExp;
  pathParams?: PA;
  /** The uppercase method names to match this route */
  method: M;
  /** 
   * The highest bodyformat in the chain always takes precedent. Type-wise, only one is allowed, 
   * but at runtime the first one found is the one used. 
   * 
   * Note that bodyFormat is completely ignored for GET and HEAD requests.
   */
  bodyFormat?: B;
  /** If this route is the last one matched, it will NOT be called, and a 404 will be returned. */
  denyFinal?: boolean;
}

export interface RouteDef<P extends ParentTuple, PA extends string[]> extends RouteOptBase<P[0] & {}, P[1], PA> {

  /**
   * If this route's handler sends headers, the matched child route will not be called.
   */
  handler: (state: StateObject<P[0] extends undefined ? BodyFormat : (P[0] & {}), P[1][number], [...P[3], [...PA]], unknown>) => Promise<P[2]>

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
  defineRoute: <R, PA extends string[],
    // T extends DetermineRouteOptions<P, [...PA]>
    T extends (P extends [BodyFormat, AllowedMethod[], any, any]
      ?
      RouteOptBase<P[0], P[1], [...PA]> & { bodyFormat?: undefined; }
      :
      P extends [undefined, AllowedMethod[], any, any]
      ?
      | { [K in BodyFormat]: RouteOptBase<K, P[1], [...PA]> & { bodyFormat: K; }; }[BodyFormat]
      | RouteOptBase<BodyFormat, P[1], [...PA]> & { bodyFormat?: undefined; }
      : never)
  > (
    route: T,
    handler: (
      /** 
       * The state object for this route.
       * 
       * If the route only specifies "GET" and/or "HEAD", then the bodyFormat can only be "ignore"
       * 
       * Otherwise, the bodyFormat is determined by the first parent route that specifies it.
       * 
       * The state object is wrapped in a proxy which throws if methods return a promise that 
       * doesn't get awaited before the next property access. It only enforces the first layer 
       * of properties, so if you have a nested object, you will need to wrap it in a proxy as well.
       * 
       * store and store.sql will probably also be wrapped in this proxy.
       */
      state: StateObject<
        // if the route only specifies "GET" and/or "HEAD", then the bodyFormat can only be "ignore"
        (Exclude<T["method"][number], "GET" | "HEAD"> extends never ? never : (
          // parent route specified bodyFormat?
          P[0] extends BodyFormat ? P[0] :
          // this route specified bodyFormat?
          T["bodyFormat"] extends BodyFormat ? T["bodyFormat"] :
          // otherwise it could be anything
          BodyFormat
        )) | (
          // GET and HEAD requests imply "ignore"
          T["method"][number] extends "GET" | "HEAD" ? "ignore" : never
        ),
        // HTTP method
        T["method"][number],
        // possible placeholder for declaring routes
        getPA<P, T>,
        // infer zod, if set for this route
        unknown
      >) => Promise<R>
  ) =>
    P[0] extends BodyFormat ? RouteDef<[P[0], T["method"], R, P[3]], [...PA]> :
    T["bodyFormat"] extends BodyFormat ? RouteDef<[T["bodyFormat"], T["method"], R, P[3]], [...PA]> :
    RouteDef<[undefined, T["method"], R, P[3]], [...PA]>

  $o?: P;
}

type getPA<P extends ParentTuple, T extends DetermineRouteOptions<P, any>> =
  [...P[3], ...T["pathParams"] extends string[] ? [T["pathParams"]] : []];
function test<T extends z.ZodTypeAny>(schema: { schema: T }): T {
  return schema.schema;
}
const test1 = test({ schema: z.object({ test: z.string() }) })
type t1 = typeof test1;
type t2 = z.infer<t1>;



/** This doesn't need to run, it's just to test types */
function testroute(root: rootRoute) {

  const test1 = root.defineRoute({
    path: /^test/,
    method: ["GET", "POST"],
    bodyFormat: undefined,
  }, async state => {
    const test: BodyFormat = state.bodyFormat;
  });

  const test2_2 = test1.defineRoute({
    path: /^test/,
    bodyFormat: "www-form-urlencoded",
    method: ["POST"],
  }, async state => {
    // zod: z.object({ test: z.string() }),


  });

  const test2 = test1.defineRoute({
    path: /^test/,
    bodyFormat: "string",
    method: ["GET"],
    zod: z.string(),
    // handler: ,
  }, async (state) => {
    //@ts-expect-error because we didn't include "string"
    const test: Exclude<BodyFormat, "ignore"> = state.bodyFormat;
    // no error here if bodyFormat is correctly typed
    const test2: "ignore" = state.bodyFormat
    // @ts-expect-error because it should be "string"
    state.isBodyFormat("buffer");
    // this should never be an error unless something is really messed up
    state.isBodyFormat("ignore");
  });

  const test3 = test2.defineRoute({
    path: /^test/,
    method: ["GET"],
    // // @ts-expect-error because it's already been defined by the parent
    // bodyFormat: "buffer",
    zod: z.string(),
  }, async (state) => {
    //@ts-expect-error because we didn't include "string"
    const test: Exclude<BodyFormat, "ignore"> = state.bodyFormat;
    // no error here if bodyFormat is correctly typed
    const test2: "ignore" = state.bodyFormat
    // @ts-expect-error because it should be "string"
    state.isBodyFormat("buffer");
    // this should never be an error unless something is really messed up
    state.isBodyFormat("ignore");
  })

  const test2post = test1.defineRoute({
    path: /^test/,
    bodyFormat: "string",
    method: ["POST"],
    zod: z.string(),
    // handler: ,
  }, async (state) => {
    // @ts-expect-error because we didn't include "string"
    const test: Exclude<BodyFormat, "string"> = state.bodyFormat;
    // no error here if bodyFormat is correctly typed
    const test2: "string" = state.bodyFormat
    // @ts-expect-error because it should be "string"
    state.isBodyFormat("buffer");
    // this should never be an error unless something is really messed up
    state.isBodyFormat("string");
  });

  const test3post = test2post.defineRoute({
    path: /^test/,
    method: ["POST"],
    // // @ts-expect-error because it's already been defined by the parent
    // bodyFormat: "buffer",
    zod: z.string(),
  }, async (state) => {
    // @ts-expect-error because we didn't include "string"
    const test: Exclude<BodyFormat, "string"> = state.bodyFormat;
    // no error here if bodyFormat is correctly typed
    const test2: "string" = state.bodyFormat
    // @ts-expect-error because it should be "string"
    state.isBodyFormat("buffer");
    // this should never be an error unless something is really messed up
    state.isBodyFormat("string");
  })
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
    zodRequestBody: (z: any) => infer REQ extends z.ZodTypeAny,
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
