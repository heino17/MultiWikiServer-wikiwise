import { StateObject } from "../routes/StateObject";
import * as z from "zod";
import { AllowedMethod, BodyFormat, JsonValue, Z2 } from ".";

declare global {

  interface rootRoute extends Route { }

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


  }
  interface Route extends RouteDef {

    /**
     * If this route's handler sends headers, the matched child route will not be called.
     */
    handler: (state: StateObject) => Promise<typeof STREAM_ENDED>

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
      handler: (state: StateObject) => Promise<symbol | void>
    ) => Route;
  }
}

export interface RouteMatch {
  route: Route;
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






export interface ZodRoute<
  M extends AllowedMethod,
  B extends BodyFormat,
  P extends Record<string, z.ZodTypeAny>,
  Q extends Record<string, z.ZodTypeAny>,
  T extends z.ZodTypeAny,
  R extends JsonValue
> {
  zodPathParams: (z: Z2<"STRING">) => P;
  zodQueryParams: (z: Z2<"STRING">) => Q;
  zodRequestBody: (z: Z2<"JSON">) => T;
  method: M[];
  path: string;
  bodyFormat: B;
  inner: (state: ZodState<M, B, Q, P, T>) => Promise<R>,
  corsRequest: (state: ZodState<"OPTIONS", "ignore", P, Q, z.ZodUndefined>) => Promise<symbol>;
}

export class ZodState<
  M extends AllowedMethod | "OPTIONS",
  B extends BodyFormat,
  P extends Record<string, z.ZodTypeAny>,
  Q extends Record<string, z.ZodTypeAny>,
  T extends z.ZodTypeAny
> extends StateObject<B, M, z.output<T>> {
  declare pathParams: z.output<z.ZodObject<P>>;
  declare queryParams: z.output<z.ZodObject<Q>>;
  // declare data: z.output<T>;
}


export type RouterRouteMap<T> = {
  [K in keyof T as T[K] extends ZodRoute<any, any, any, any, any, any> ? K : never]:
  T[K] extends ZodRoute<any, any, any, any, infer REQ, infer RES>
  ? ((data: z.input<REQ>) => Promise<jsonify<RES>>)
  : `${K & string} does not extend`;
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
  [K in keyof T as T[K] extends ZodRoute<any, any, any, any, any, any> ? K : never]: V;
}
