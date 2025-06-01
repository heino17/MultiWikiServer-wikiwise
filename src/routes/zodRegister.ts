import { fromError } from "zod-validation-error";
import { Z2, ZodRoute } from "../utils";
import { StateObject } from "./StateObject";

export const registerZodRoutes = (root: rootRoute, router: any, keys: string[]) => {
  // const router = new TiddlerRouter();
  keys.forEach((key) => {
    const route = router[key as keyof typeof router] as ZodRoute<any, any, any, any, any, any>;
    const {
      method, path, bodyFormat,
      zodPathParams,
      zodQueryParams,
      zodRequestBody: zodRequest,
      inner,
      corsRequest,
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

    root.defineRoute({
      method: ["OPTIONS"],
      path: new RegExp(pathregex),
      pathParams,
      bodyFormat: "ignore",
      denyFinal: false,
    }, async state => {

      checkPath(zodPathParams, state);

      checkQuery(zodQueryParams, state);

      await corsRequest(state as any as StateObject<"ignore", "OPTIONS">);

    })

    root.defineRoute({
      method,
      path: new RegExp(pathregex),
      pathParams,
      bodyFormat,
      denyFinal: false,
    }, async state => {

      checkPath(zodPathParams, state);

      checkQuery(zodQueryParams, state);

      checkData(zodRequest, state);

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

function checkData(zodRequest: (z: Z2<"JSON">) => any, state: StateObject) {
  const inputCheck = zodRequest(Z2).safeParse(state.data);
  if (!inputCheck.success) {
    console.log(inputCheck.error);
    throw state.sendString(400, { "x-reason": "zod-request" },
      fromError(inputCheck.error).toString(), "utf8");
  }
  state.data = inputCheck.data;
}

function checkQuery(zodQueryParams: (z: Z2<"STRING">) => any, state: StateObject) {
  const queryCheck = Z2.object(zodQueryParams(Z2)).safeParse(state.queryParams);
  if (!queryCheck.success) {
    console.log(queryCheck.error);
    throw state.sendString(400, { "x-reason": "zod-query" },
      fromError(queryCheck.error).toString(), "utf8");
  }
  state.queryParams = queryCheck.data;
}

function checkPath(zodPathParams: (z: Z2<"STRING">) => any, state: StateObject) {
  const pathCheck = Z2.object(zodPathParams(Z2)).safeParse(state.pathParams);
  if (!pathCheck.success) {
    console.log(pathCheck.error);
    throw state.sendString(400, { "x-reason": "zod-path" },
      fromError(pathCheck.error).toString(), "utf8");
  }
  state.pathParams = pathCheck.data;
}

