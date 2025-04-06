import { StateObject } from "../../StateObject";
import { STREAM_ENDED } from "../../streamer";
import { ZodAssert as zodAssert, Z2 } from "../../utils";
import { BaseKeyMap, BaseManager, BaseManagerMap, JsonValue, ZodAction, } from "../BaseManager";
import { ZodTypeAny, ZodType, z } from "zod";
import { AllowedMethod, BodyFormat } from "../router";
import { TiddlerServer } from "../bag-file-server";


export const TiddlerKeyMap: BaseKeyMap<TiddlerRouter, true> = {
  handleCreateRecipeTiddler: true,
  handleDeleteRecipeTiddler: true,
  handleGetBagTiddler: true,
  handleGetBagTiddlerBlob: true,
  handleGetRecipeStatus: true,
  handleGetRecipeTiddler: true,
  handleListRecipeTiddlers: true,
  handleSaveRecipeTiddler: true,
  handleGetWikiIndex: true,
}
function isKeyOf<T extends Record<string, any>>(obj: T, key: string | number | symbol): key is keyof T {
  return key in obj;
}

export type TiddlerManagerMap = BaseManagerMap<TiddlerRouter>;

export class TiddlerRouter {
  static defineRoutes = (root: rootRoute) => {
    const router = new TiddlerRouter();
    Object.keys(TiddlerKeyMap).forEach((key) => {
      const route = router[key as keyof typeof router] as ZodRoute<any, any, any, any, any>;
      const { method, path, bodyFormat } = route;
      const pathParams = path.split("/").filter(e => e.startsWith(":")).map(e => e.substring(1));
      ///^\/recipes\/([^\/]+)\/tiddlers\/(.+)$/,
      const pathregex = "^" + path.split("/").map(e => e.startsWith(":") ? "([^/]+)" : e).join("\\/") + "$";
      root.defineRoute({
        method,
        path: new RegExp(pathregex),
        pathParams,
        bodyFormat,
      }, async state => {
        if (state.method === "OPTIONS") {
          return state.sendEmpty(200, {
            // "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": method.join(","),
            "Access-Control-Allow-Headers": "Content-Type, X-Requested-With",
          });
        }
        // we do it out here so we don't start a transaction if the key is invalid.
        if (!isKeyOf(TiddlerKeyMap, key)) throw new Error("No such action");
        const action = router[key] as ZodRoute<any, any, any, any, any>;
        return await action(state);
      });
    });
  }



  handleGetRecipeStatus = this.ZodRoute(
    ["GET", "HEAD"],
    "/recipes/:recipe_name/status",
    z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    "ignore",
    z => z.undefined(),
    async (state) => {

      const { recipe_name } = state.pathParams;

      const { recipe, canRead, canWrite } = await state.getRecipeACL(recipe_name, true);

      if (!recipe) throw state.sendEmpty(404, { "x-reason": "recipe not found" });
      if (!canRead) throw state.sendEmpty(403, { "x-reason": "read access denied" });

      const { isAdmin, user_id, username } = state.user ?? { isAdmin: false, user_id: undefined, username: undefined };

      return {
        isAdmin,
        user_id,
        username,
        isLoggedIn: !!state.user,
        isReadOnly: !canWrite,
        allowAnonReads: state.config.allowAnonReads,
        allowAnonWrites: state.config.allowAnonWrites,
      };
    }
  );

  handleGetRecipeTiddler = this.ZodRoute(
    ["GET", "HEAD"],
    "/recipes/:recipe_name/tiddlers/:title",
    z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    "ignore",
    z => z.undefined(),
    async (state) => {
      const { recipe_name, title } = state.pathParams;

      await state.assertRecipeACL(recipe_name, false);

      throw await state.$transaction(async prisma => {
        const server = new TiddlerServer(state, prisma);
        const bag = await server.getRecipeBagWithTiddler({ recipe_name, title });
        // return await server.getBagTiddler({ bag_id: bag?.bag_id, title });
        return server.sendBagTiddler({ state, bag_id: bag?.bag_id, title });
      });

      // return this.sendTiddlerInfo(state, tiddlerInfo);
    }
  )

  handleGetBagTiddler = this.ZodRoute(
    ["GET", "HEAD"],
    "/bags/:bag_name/tiddlers/:title",
    z => ({
      bag_name: z.prismaField("Bags", "bag_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    "ignore",
    z => z.undefined(),
    async (state) => {

      await state.assertBagACL(state.pathParams.bag_name, false);

      throw await state.$transaction(async prisma => {
        const server = new TiddlerServer(state, prisma);
        // return await server.getBagTiddler(state.pathParams);
        return server.sendBagTiddler({ state, ...state.pathParams });
      });

      // return this.sendTiddlerInfo(state, tiddlerInfo);

    });

  handleGetBagTiddlerBlob = this.ZodRoute(
    ["GET", "HEAD"],
    "/bags/:bag_name/tiddlers/:title/blob",
    z => ({
      bag_name: z.prismaField("Bags", "bag_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    "ignore",
    z => z.undefined(),
    async (state) => {
      const { bag_name, title } = state.pathParams;

      await state.assertBagACL(bag_name, false);

      const result = await state.$transaction(async prisma => {
        const server = new TiddlerServer(state, prisma);
        return await server.getBagTiddlerStream(title, bag_name);
      });

      if (!result) throw state.sendEmpty(404, { "x-reason": "no result" });

      throw state.sendStream(200, {
        Etag: state.makeTiddlerEtag(result),
        "Content-Type": result.type
      }, result.stream);
    });

  handleListRecipeTiddlers = this.ZodRoute(
    ["GET", "HEAD"],
    "/recipes/:recipe_name/tiddlers.json",
    z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    "ignore",
    z => z.undefined(),
    async (state) => {
      zodAssert.queryParams(state, z => ({
        include_deleted: z.string().array().optional(),
        last_known_tiddler_id: z.string().array().optional(),
      }));

      const { recipe_name } = state.pathParams;
      const include_deleted = state.queryParams.include_deleted?.[0] === "true";
      const last_known_tiddler_id = +(state.queryParams.last_known_tiddler_id?.[0] ?? 0) || undefined;

      await state.assertRecipeACL(recipe_name, false);

      const result = await state.$transaction(async prisma => {
        const server = new TiddlerServer(state, prisma);
        return await server.getRecipeTiddlers(recipe_name, {
          include_deleted,
          last_known_tiddler_id
        });

      });
      return result;
    }
  )


  handleSaveRecipeTiddler = this.ZodRoute(
    ["PUT"],
    "/recipes/:recipe_name/tiddlers/:title",
    z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    "json",
    z => z.object({
      title: z.prismaField("Tiddlers", "title", "string", false),
    }).and(z.record(z.string())),
    async (state) => {

      const { recipe_name } = state.pathParams;

      await state.assertRecipeACL(recipe_name, true);

      const { bag_name, tiddler_id } = await state.$transaction(async prisma => {
        const server = new TiddlerServer(state, prisma);
        return await server.saveRecipeTiddler(state.data, state.pathParams.recipe_name);
      });

      return { bag_name, tiddler_id };

    });


  handleDeleteRecipeTiddler = this.ZodRoute(
    ["DELETE"],
    "/recipes/:recipe_name/tiddlers/:title",
    z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    "json",
    z => z.undefined(),
    async (state) => {

      const { recipe_name, title } = state.pathParams;
      if (!recipe_name || !title) throw state.sendEmpty(404, { "x-reason": "bag_name or title not found" });

      await state.assertRecipeACL(recipe_name, true);

      const { bag_name, tiddler_id } = await state.$transaction(async prisma => {
        const server = new TiddlerServer(state, prisma);
        return await server.deleteRecipeTiddler(recipe_name, title);
      });

      return { bag_name, tiddler_id };

    });

  // this is not used by the sync adaptor. I'm not sure what uses it.
  handleCreateRecipeTiddler = this.ZodRoute(
    ["POST"],
    "/recipes/:recipe_name/tiddlers",
    z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    "json",
    z => z.object({
      title: z.prismaField("Tiddlers", "title", "string", false),
    }).and(z.record(z.string())),
    async (state) => {

      await state.assertRecipeACL(state.pathParams.recipe_name, true);

      const recipe_name = state.pathParams.recipe_name;

      return await state.$transaction(async prisma => {
        const server = new TiddlerServer(state, prisma);
        const { bag_name } = await server.getRecipeWritableBag(recipe_name) ?? {};
        if (!bag_name) throw state.sendEmpty(404, { "x-reason": "bag not found" });
        return { bag_name, results: await server.processIncomingStream(bag_name) };
      });

    });

  handleGetWikiIndex = this.ZodRoute(
    ["GET", "HEAD"],
    "/wiki/:recipe_name",
    z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    "ignore",
    z => z.undefined(),
    async (state) => {
      await state.assertRecipeACL(state.pathParams.recipe_name, false);

      await state.$transaction(async prisma => {
        const server = new TiddlerServer(state, prisma);
        await server.serveIndexFile(state.pathParams.recipe_name);
      });

      throw STREAM_ENDED;
    });

  private sendTiddlerInfo = async (
    state: StateObject,
    tiddlerInfo: Awaited<ReturnType<TiddlerServer["getBagTiddler"]>>
  ) => {

    zodAssert.queryParams(state, z => ({
      fallback: z.array(z.string()).optional()
    }));
    // fallbacks are kind of slow, I'm not sure if this is a good idea
    if (!tiddlerInfo || !tiddlerInfo.tiddler) {
      // Redirect to fallback URL if tiddler not found
      const fallback = state.queryParams.fallback?.[0];
      if (fallback) {
        // await state.pushStream(fallback);
        throw state.redirect(fallback);
      } else {
        throw state.sendEmpty(404, { "x-reason": "tiddler not found (no fallback)" });
      }
    }

    return tiddlerInfo;
  }

  protected ZodRoute<M extends AllowedMethod, B extends "GET" | "HEAD" extends M ? "ignore" : BodyFormat, P extends Record<string, ZodTypeAny>, T extends ZodTypeAny, R extends JsonValue>(
    method: M[],
    path: string,
    zodPathParams: (z: Z2<"STRING">) => P,
    bodyFormat: B,
    zodRequest: (z: Z2<"JSON">) => T,
    handler: (state: ZodState<M, B, P, T>) => Promise<R>,
  ): ZodRoute<M, B, P, T, R> {
    // return and throw indicate whether the transaction should commit or rollback
    const action = async (state: StateObject): Promise<typeof STREAM_ENDED> => {

      const pathCheck = Z2.object(zodPathParams(Z2)).safeParse(state.pathParams);
      if (!pathCheck.success) {
        console.log(pathCheck.error);
        throw state.sendEmpty(400, { "x-reason": "zod-path" });
      }

      const inputCheck = zodRequest(Z2).safeParse(state.data);
      if (!inputCheck.success) {
        console.log(inputCheck.error);
        throw state.sendEmpty(400, { "x-reason": "zod-request" });
      }

      const [good, error, res] = await handler(state as ZodState<M, B, P, T>)
        .then(e => [true, undefined, e] as const, e => [false, e, undefined] as const);

      if (!good) {
        if (error === STREAM_ENDED) {
          return error;
        } else if (typeof error === "string") {
          throw state.sendString(400, { "x-reason": "zod-handler" }, error, "utf8");
        } else if (error instanceof Error && error.name === "UserError") {
          throw state.sendString(400, { "x-reason": "user-error" }, error.message, "utf8");
        } else {
          throw error;
        }
      }

      return state.sendJSON(200, res);

    };
    action.path = path;
    action.inner = handler;
    action.zodRequest = zodRequest;
    // action.zodResponse = zodResponse;
    action.zodPathParams = zodPathParams;
    action.method = method;
    action.bodyFormat = bodyFormat;

    return action
  }
}


export interface ZodRoute<
  M extends AllowedMethod,
  B extends BodyFormat,
  P extends Record<string, ZodTypeAny>,
  T extends ZodTypeAny,
  R extends JsonValue
> extends ZodAction<T, R> {
  zodPathParams: (z: Z2<"STRING">) => P;
  method: M[];
  path: string;
  bodyFormat: B;
}


export class ZodState<
  M extends AllowedMethod,
  B extends BodyFormat,
  P extends Record<string, ZodTypeAny>,
  T extends ZodTypeAny
> extends StateObject<B, M, string[][], z.output<T>> {
  declare pathParams: z.output<z.ZodObject<P>>;
  // declare data: z.output<T>;
}

