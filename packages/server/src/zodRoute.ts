import * as z from "zod";
import { AllowedMethod, BodyFormat, JsonValue } from "./utils";
import { StateObject } from "./StateObject";



export function zodRoute<
  M extends Exclude<AllowedMethod, 'OPTIONS'>,
  B extends "GET" | "HEAD" extends M ? "ignore" : BodyFormat,
  P extends Record<string, z.ZodTypeAny>,
  Q extends Record<string, z.ZodType<any, any, string[] | undefined>>,
  T extends z.ZodTypeAny,
  R extends JsonValue
>(route: ZodRoute<M, B, P, Q, T, R>): ZodRoute<M, B, P, Q, T, R> {
  return route;
}

export interface ZodCustom {

}

type z = typeof z;
export const Z2 = makeZ2();
export interface Z2 extends z, ZodCustom {

}

function makeZ2(): Z2 {
  const z2 = Object.create(z);
  return z2;
}


export interface ZodRoute<
  M extends AllowedMethod,
  B extends BodyFormat,
  P extends Record<string, z.ZodTypeAny>,
  Q extends Record<string, z.ZodTypeAny>,
  T extends z.ZodTypeAny,
  R extends JsonValue
> {

  /**
   * The input will be `Record<string, string>`
   * If a path variable is not set in the request, the path will not match.
   *
   * Expects a Record of zod checks. Every path variable must be included.
  */
  zodPathParams: (z: Z2) => P;
  /**
   * The input will be `Record<string, string[]>`.
   * If a value is not set, an empty string is used.
   *
   * Expects a Record of zod checks.
   *
   * The default behavior is to remove all query params.
   */
  zodQueryParams?: (z: Z2) => Q;
  /** 
   * CORS preflight requests do not include credentials or request headers,
   * so you can't authenticate requests. It is a way to provide information about the endpoint. 
   * 
   * Be careful, because if you specify the same route with different methods, and set corsRequest
   * on more than one, because only the first one will actually be called.
   */
  corsRequest?: (state: ZodState<"OPTIONS", "ignore", P, Q, z.ZodUndefined>) => Promise<typeof STREAM_ENDED>;
  /**
   * A zod check of the request body result.
   *
   * Only valid for `string`, `json`, and `www-form-urlencoded` body types
   *
   * The default is `undefined` for those types.
   */
  zodRequestBody?: (z: Z2) => T;

  securityChecks?: RouteDef["securityChecks"];
  method: M[];
  path: string;
  bodyFormat: B;
  inner: (state: { [K in M]: ZodState<K, B, P, Q, T> }[M]) => Promise<R>;
}

export interface ZodRouteDef<
  M extends AllowedMethod,
  B extends BodyFormat,
  P extends Record<string, z.ZodTypeAny>,
  Q extends Record<string, z.ZodTypeAny>,
  T extends z.ZodTypeAny,
  R extends JsonValue
> {
  zodRequestBody?: B extends "string" | "json" | "www-form-urlencoded" ? (z: Z2) => T : undefined;
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
