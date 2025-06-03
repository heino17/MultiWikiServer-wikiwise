import * as z from "zod";
import { AllowedMethod, BodyFormat, JsonValue, Z2, ZodState, ZodRoute } from "../utils";



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
