import * as z from "zod";
import { zodRoute } from "../zodRoute";
import { JsonValue, Z2, ZodState } from "../../utils";
import Debug from "debug";
const debug = Debug("mws:cors:admin")



export function admin<T extends z.ZodTypeAny, R extends JsonValue>(
  zodRequest: (z: Z2<"JSON">) => T,
  inner: (state: ZodState<"POST", "json", Record<string, z.ZodTypeAny>, {}, T>, prisma: PrismaTxnClient) => Promise<R>
) {
  return zodRoute({
    method: ["POST"],
    path: "/admin/$key",
    zodPathParams: z => ({}),
    zodQueryParams: z => ({}),
    bodyFormat: "json",
    zodRequestBody: zodRequest,
    inner: async (state) => {
      //  this would enable cors with credentials on admin routes, but we're not going to do that!
      // if (state.headers.origin) {
      //   debug("origin request from %s", state.headers.origin)
      //   state.setHeader("access-control-allow-origin", state.headers.origin);
      //   state.setHeader("access-control-allow-credentials", "true");
      //   state.setHeader("access-control-allow-headers", "x-requested-with, content-type, accepts");
      //   state.setHeader("access-control-expose-headers", "etag, x-reason")
      // }

      state.asserted = true;
      return state.$transaction(async (prisma) => await inner(state, prisma));
    }
  });
}
