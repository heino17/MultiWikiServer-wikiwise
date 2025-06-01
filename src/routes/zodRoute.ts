import * as z from "zod";
import { AllowedMethod, BodyFormat, JsonValue, Z2, ZodState, ZodRoute } from "../utils";
import { Debug } from "@prisma/client/runtime/library";
const debugCORS = Debug("mws:cors");

export function zodRoute<
  M extends Exclude<AllowedMethod, 'OPTIONS'>,
  B extends "GET" | "HEAD" extends M ? "ignore" : BodyFormat,
  P extends Record<string, z.ZodTypeAny>,
  Q extends Record<string, z.ZodType<any, any, string[] | undefined>>,
  T extends z.ZodTypeAny,
  R extends JsonValue
>({
  method,
  path,
  bodyFormat,
  zodPathParams,
  zodQueryParams = (z => ({}) as any),
  zodRequestBody = ["string", "json", "www-form-urlencoded"].includes(bodyFormat)
    ? z => z.undefined() : (z => z.any() as any),
  inner,
  corsRequest = async state => {
    const headers = state.headers["access-control-request-headers"]
    const method = state.headers["access-control-request-method"]
    debugCORS("OPTIONS default %s %s %s", state.urlInfo.pathname, method, headers);
    // CORS is disabled by default, so send an empty response
    throw state.sendEmpty(204, {});
  }
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
  inner: (state: { [K in M]: ZodState<K, B, P, Q, T> }[M]) => Promise<R>;
  /** 
   * CORS preflight requests do not include credentials or request headers,
   * so you can't authenticate requests. It is a way to provide information about the endpoint. 
   * 
   * Be careful, because if you specify the same route with different methods, and set corsRequest
   * on more than one, because only the first one will actually be called.
   */
  corsRequest?: (state: ZodState<"OPTIONS", "ignore", P, Q, z.ZodUndefined>) => Promise<typeof STREAM_ENDED>;
}): ZodRoute<M, B, P, Q, T, R> {

  return {
    method,
    path,
    bodyFormat,
    inner,
    zodRequestBody,
    zodPathParams,
    zodQueryParams,
    corsRequest,
  } as ZodRoute<M, B, P, Q, T, R>;
}
