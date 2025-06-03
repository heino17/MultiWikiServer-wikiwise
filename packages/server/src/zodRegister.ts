import { fromError } from "zod-validation-error";
import { StateObject } from "./StateObject";
import Debug from "debug";
import z from "zod";
import { Z2, ZodRoute } from "./zodRoute";
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

      await corsRequest(state as any as StateObject<"ignore", "OPTIONS">);

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
  T extends z.ZodType
>(
  state: StateObject,
  zodRequestBody: (z: Z2) => T
): asserts state is StateObject & { data: z.infer<T> } {
  const inputCheck = zodRequestBody(Z2).safeParse(state.data);
  if (!inputCheck.success) {
    console.log(inputCheck.error);
    throw state.sendString(400, { "x-reason": "zod-request" },
      fromError(inputCheck.error).toString(), "utf8");
  }
  state.data = inputCheck.data;
}

export function checkQuery<
  T extends Record<string, z.ZodType<any, z.ZodOptional<z.ZodArray<any>>>>
>(
  state: StateObject,
  zodQueryParams: (z: Z2) => T
): asserts state is StateObject & { queryParams: z.infer<z.ZodObject<T>> } {
  const queryCheck = Z2.object(zodQueryParams(Z2)).safeParse(state.queryParams);
  if (!queryCheck.success) {
    console.log(queryCheck.error);
    throw state.sendString(400, { "x-reason": "zod-query" },
      fromError(queryCheck.error).toString(), "utf8");
  }
  state.queryParams = queryCheck.data;
}

export function checkPath<
  T extends Record<string, z.ZodType>
>(
  state: StateObject,
  zodPathParams: (z: Z2) => T
): asserts state is StateObject & { pathParams: z.infer<z.ZodObject<T>> } {
  const pathCheck = Z2.object(zodPathParams(Z2)).safeParse(state.pathParams);
  if (!pathCheck.success) {
    console.log(pathCheck.error);
    throw state.sendString(404, { "x-reason": "zod-path" },
      fromError(pathCheck.error).toString(), "utf8");
  }
  state.pathParams = pathCheck.data;
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
