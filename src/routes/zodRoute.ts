import * as z from "zod";
import { AllowedMethod, BodyFormat, JsonValue, Z2, ZodState, ZodRoute } from "../utils";

// this is definitely the better version of defineRoute, but that was the starting point


export function zodRoute<
  M extends AllowedMethod,
  B extends "GET" | "HEAD" extends M ? "ignore" : BodyFormat,
  P extends Record<string, z.ZodTypeAny>,
  Q extends Record<string, z.ZodType<any, any, string[] | undefined>>,
  T extends z.ZodTypeAny,
  R extends JsonValue
>({
  method, path, bodyFormat, zodPathParams, zodQueryParams = (z => ({}) as any), zodRequestBody = ["string", "json", "www-form-urlencoded"].includes(bodyFormat)
    ? z => z.undefined() : (z => z.any() as any), inner
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
