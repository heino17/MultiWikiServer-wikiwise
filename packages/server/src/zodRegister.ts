import { fromError } from "zod-validation-error";
import { ServerRequest } from "./StateObject";
import Debug from "debug";
import { ZodRoute } from "./zodRoute";
import { Z2 } from "./Z2";
import { ServerRoute } from "./router";
import { zod } from "@tiddlywiki/server";
import * as core from "zod/v4/core";
const debugCORS = Debug("mws:cors");



export const registerZodRoutes = (parent: ServerRoute, router: any, keys: string[]) => {
  // const router = new TiddlerRouter();
  keys.forEach((key) => {
    const route = router[key as keyof typeof router] as ZodRoute<any, any, any, any, any, any>;
    const {
      method, path, bodyFormat,
      zodPathParams,
      zodQueryParams = (z => ({}) as any),
      zodRequestBody = ["string", "json", "www-form-urlencoded"].includes(bodyFormat)
        ? z => z.undefined() : (z => z.any() as any),
      inner,
      corsRequest = async state => {
        state.pathParams
        const headers = state.headers["access-control-request-headers"]
        const method = state.headers["access-control-request-method"]
        debugCORS("OPTIONS default %s %s %s", state.urlInfo.pathname, method, headers);
        // CORS is disabled by default, so send an empty response
        throw state.sendEmpty(204, {});
      },
      securityChecks,
    } = route;

    if (method.includes("OPTIONS"))
      throw new Error(key + " includes OPTIONS. Use corsRequest instead.");

    const pathParams = path.split("/").filter(e => e.startsWith(":")).map(e => e.substring(1));
    ///^\/recipes\/([^\/]+)\/tiddlers\/(.+)$/,
    if (!path.startsWith("/")) throw new Error(`Path ${path} must start with a forward slash`);
    if (key.startsWith(":")) throw new Error(`Key ${key} must not start with a colon`)
    const pathregex = "^" + path.split("/").map(e =>
      e === "$key" ? key : e.startsWith(":") ? "([^/]+)" : e
    ).join("\\/") + "$";

    parent.defineRoute({
      method: ["OPTIONS"],
      path: new RegExp(pathregex),
      pathParams,
      bodyFormat: "ignore",
      denyFinal: false,
      securityChecks,
    }, async state => {

      checkPath(state, zodPathParams);

      checkQuery(state, zodQueryParams);

      await corsRequest(state as any as ServerRequest<"ignore", "OPTIONS">);

    });

    parent.defineRoute({
      method,
      path: new RegExp(pathregex),
      pathParams,
      bodyFormat,
      denyFinal: false,
    }, async state => {

      checkPath(state, zodPathParams);

      checkQuery(state, zodQueryParams);

      checkData(state, zodRequestBody);

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

export function checkData<
  T extends core.$ZodType
>(
  state: ServerRequest,
  zodRequestBody: (z: Z2<any>) => T
): asserts state is ServerRequest & { data: zod.infer<T> } {
  const inputCheck = Z2.any().pipe(zodRequestBody(Z2)).safeParse(state.data);
  if (!inputCheck.success) {
    console.log(inputCheck.error);
    throw state.sendString(400, { "x-reason": "zod-request" },
      fromError(inputCheck.error).toString(), "utf8");
  }
  state.data = inputCheck.data;
}

export function checkQuery<
  T extends { [x: string]: core.$ZodType<unknown, string[] | undefined>; }
>(
  state: ServerRequest,
  zodQueryParams: (z: Z2<"STRING">) => T
): asserts state is ServerRequest & { queryParams: zod.infer<zod.ZodObject<T>> } {
  const queryCheck = Z2.strictObject(zodQueryParams(Z2)).safeParse(state.queryParams);
  if (!queryCheck.success) {
    console.log(queryCheck.error);
    throw state.sendString(400, { "x-reason": "zod-query" },
      fromError(queryCheck.error).toString(), "utf8");
  }
  state.queryParams = queryCheck.data as any;
}

export function checkPath<
  T extends { [x: string]: core.$ZodType<unknown, string | undefined>; }
>(
  state: ServerRequest,
  zodPathParams: (z: Z2<"STRING">) => T
): asserts state is ServerRequest & { pathParams: zod.infer<zod.ZodObject<T>> } {
  const pathCheck = Z2.strictObject(zodPathParams(Z2)).safeParse(state.pathParams);
  if (!pathCheck.success) {
    console.log(pathCheck.error);
    throw state.sendString(404, { "x-reason": "zod-path" },
      fromError(pathCheck.error).toString(), "utf8");
  }
  state.pathParams = pathCheck.data as any;
}

