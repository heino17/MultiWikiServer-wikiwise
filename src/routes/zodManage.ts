import * as z from "zod";
import { zodRoute } from "./zodRoute";
import { JsonValue, Z2, ZodState } from "../utils";




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
    zodRequestBody: zodRequest,
    inner: async (state) => {
      state.asserted = true;
      return state.$transaction(async (prisma) => await inner(state, prisma));
    }
  });
}
