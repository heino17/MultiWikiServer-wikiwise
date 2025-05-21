import { StateObject } from "../StateObject";
import { STREAM_ENDED } from "../../listen/streamer";
import { tryParseJSON, ZodAssert as zodAssert } from "../../utils";
import { registerZodRoutes, zodRoute, RouterKeyMap, RouterRouteMap } from "../../router";
import { TiddlerServer } from "../bag-file-server";


export const TiddlerKeyMap: RouterKeyMap<TiddlerRouter, true> = {
  handleCreateRecipeTiddler: true,
  handleDeleteRecipeTiddler: true,
  handleGetBagStates: true,
  handleGetBagTiddler: true,
  handleGetBagTiddlerBlob: true,
  handleGetRecipeStatus: true,
  handleGetRecipeTiddler: true,
  handleListRecipeTiddlers: true,
  handleSaveRecipeTiddler: true,
  handleGetWikiIndex: true,
}

export type TiddlerManagerMap = RouterRouteMap<TiddlerRouter>;

export class TiddlerRouter {
  static defineRoutes = (root: rootRoute) => {
    const router = new TiddlerRouter();
    const keys = Object.keys(TiddlerKeyMap);
    registerZodRoutes(root, router, keys);
  }

  // lets start with the scenarios from the sync adapter
  // 1. Status - The wiki status that gets sent to the TW5 client
  // 2. tiddlers.json - gets a skinny list of the recipe bag state.
  // 3. Save Tiddler - create or update a tiddler
  // 4. Load Tiddler - load the data for a tiddler
  // 5. Delete Tiddler - delete a tiddler
  // 6. Wiki Index - the wiki client itself, with all the config 
  //    from the recipe, and the initial tiddler state

  handleGetRecipeStatus = zodRoute({
    method: ["GET", "HEAD"],
    path: "/recipes/:recipe_name/status",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    inner:
      async (state) => {

        const { recipe_name } = state.pathParams;

        const { recipe, canRead, canWrite } = await state.getRecipeACL(recipe_name, true);

        if (!recipe) throw state.sendEmpty(404, { "x-reason": "recipe not found" });
        if (!canRead) throw state.sendEmpty(403, { "x-reason": "read access denied" });

        const { isAdmin, user_id, username } = state.user;

        return {
          isAdmin,
          user_id,
          username,
          isLoggedIn: state.user.isLoggedIn,
          isReadOnly: !canWrite,
          allowAnonReads: false,
          allowAnonWrites: false,
        };
      }
  });

  handleGetRecipeTiddler = zodRoute({
    method: ["GET", "HEAD"],
    path: "/recipes/:recipe_name/tiddlers/:title",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    inner:
      async (state) => {
        const { recipe_name, title } = state.pathParams;

        await state.assertRecipeACL(recipe_name, false);

        throw await state.$transaction(async (prisma) => {
          const server = new TiddlerServer(state, prisma);
          const bag = await server.getRecipeBagWithTiddler({ recipe_name, title });
          return server.sendBagTiddler({ state, bag_id: bag?.bag_id, title });
        });

      }
  })

  handleGetBagTiddler = zodRoute({
    method: ["GET", "HEAD"],
    path: "/bags/:bag_name/tiddlers/:title",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      bag_name: z.prismaField("Bags", "bag_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    inner:
      async (state) => {

        await state.assertBagACL(state.pathParams.bag_name, false);

        throw await state.$transaction(async (prisma) => {
          const server = new TiddlerServer(state, prisma);
          // return await server.getBagTiddler(state.pathParams);
          return server.sendBagTiddler({ state, ...state.pathParams });
        });

      }
  });


  handleListRecipeTiddlers = zodRoute({
    method: ["GET", "HEAD"],
    path: "/recipes/:recipe_name/tiddlers.json",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    zodQueryParams: z => ({
      include_deleted: z.string().array().optional(),
      last_known_revision_id: z.string().array().optional(),
    }),
    inner: async (state) => {

      const { recipe_name } = state.pathParams;
      const include_deleted = state.queryParams.include_deleted?.[0] === "true";
      const last_known_revision_id = state.queryParams.last_known_revision_id?.[0];

      await state.assertRecipeACL(recipe_name, false);

      const result = await state.$transaction(async (prisma) => {
        const server = new TiddlerServer(state, prisma);
        const options = { include_deleted, last_known_revision_id };
        let result = await server.getRecipeTiddlers(recipe_name);
        return result
          .filter(tiddler => options.include_deleted || !tiddler.is_deleted)
          .filter(tiddler => !options.last_known_revision_id || tiddler.revision_id > options.last_known_revision_id);
      });
      return result;
    }
  })


  handleGetBagStates = zodRoute({
    method: ["GET", "HEAD"],
    path: "/recipes/:recipe_name/bag-states",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    inner: async (state) => {

      const { recipe_name } = state.pathParams;
      await state.assertRecipeACL(recipe_name, false);

      zodAssert.queryParams(state, z => ({
        last_known_revision_id: z.prismaField("Tiddlers", "revision_id", "string").array().optional(),
        include_deleted: z.enum(["yes", "no"]).array().optional(),
      }));

      const
        last_known_revision_id = state.queryParams.last_known_revision_id?.[0], include_deleted = state.queryParams.include_deleted?.[0] === "yes";

      const result = await state.$transaction(async (prisma) => {
        const server = new TiddlerServer(state, prisma);
        return await server.getRecipeTiddlersByBag(recipe_name, { include_deleted, last_known_revision_id });
      });

      return result;
    }
  })

  parseFields(input: string, ctype: string | undefined) {

    if (ctype?.startsWith("application/json"))
      return tryParseJSON<any>(input);

    if (ctype?.startsWith("application/x-mws-tiddler")) {
      //https://jsperf.app/mukuro
      // for a big text field (100k random characters)
      // splitting the string is 1000x faster!
      // but I don't really trust getFieldStringBlock 
      // because it doesn't check for fields with colon names
      // in fact, the behavior of the file system adapter when it 
      // encounters invalid field names is just to use JSON anyway.

      const headerEnd = input.indexOf("\n\n");
      if (headerEnd === -1) return tryParseJSON<any>(input);
      const header = input.slice(0, headerEnd);
      const body = input.slice(headerEnd + 2);

      const fields = tryParseJSON<any>(header);
      if (!fields) return undefined;
      fields.text = body;
      return fields;
    }
  }

  handleSaveRecipeTiddler = zodRoute({
    method: ["PUT"],
    path: "/recipes/:recipe_name/tiddlers/:title",
    bodyFormat: "string",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    zodRequestBody: z => z.string(),
    inner:
      async (state) => {

        const { recipe_name } = state.pathParams;

        await state.assertRecipeACL(recipe_name, true);

        const fields = this.parseFields(state.data, state.headers["content-type"]);

        if (fields === undefined)
          throw state.sendEmpty(400, {
            "x-reason": "PUT tiddler expects a valid json or x-mws-tiddler body"
          });

        const { bag_name, revision_id } = await state.$transaction(async (prisma) => {
          const server = new TiddlerServer(state, prisma);
          // The tiddlywiki client saves binary tiddlers as base64-encoded text field
          // so no special handling is required.
          return await server.saveRecipeTiddlerFields(fields, state.pathParams.recipe_name, null);
        });

        return { bag_name, revision_id };

      }
  });


  handleDeleteRecipeTiddler = zodRoute({
    method: ["DELETE"],
    path: "/recipes/:recipe_name/tiddlers/:title",
    bodyFormat: "json",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    zodRequestBody:
      z => z.undefined(), inner:
      async (state) => {

        const { recipe_name, title } = state.pathParams;
        if (!recipe_name || !title) throw state.sendEmpty(404, { "x-reason": "bag_name or title not found" });

        await state.assertRecipeACL(recipe_name, true);

        const { bag_name, revision_id } = await state.$transaction(async (prisma) => {
          const server = new TiddlerServer(state, prisma);
          return await server.deleteRecipeTiddler(recipe_name, title);
        });

        return { bag_name, revision_id };

      }
  });

  // this is not used by the sync adaptor. I'm not sure what uses it.
  handleCreateRecipeTiddler = zodRoute({
    method: ["POST"],
    path: "/recipes/:recipe_name/tiddlers",
    bodyFormat: "json",
    zodPathParams:
      z => ({
        recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
      }),
    zodRequestBody:
      z => z.object({
        title: z.prismaField("Tiddlers", "title", "string", false),
      }).and(z.record(z.string())), inner:
      async (state) => {
        await state.assertRecipeACL(state.pathParams.recipe_name, true);

        const recipe_name = state.pathParams.recipe_name;

        return await state.$transaction(async (prisma) => {
          const server = new TiddlerServer(state, prisma);
          const { bag_name } = await server.getRecipeWritableBag(recipe_name) ?? {};
          if (!bag_name) throw state.sendEmpty(404, { "x-reason": "bag not found" });
          return { bag_name, results: await server.processIncomingStream(bag_name) };
        });

      }
  });

  handleGetBagTiddlerBlob = zodRoute({
    method: ["GET", "HEAD"],
    path: "/bags/:bag_name/tiddlers/:title/blob",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      bag_name: z.prismaField("Bags", "bag_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    inner:
      async (state) => {
        const { bag_name, title } = state.pathParams;

        await state.assertBagACL(bag_name, false);

        const result = await state.$transaction(async (prisma) => {
          const server = new TiddlerServer(state, prisma);
          return await server.getBagTiddlerStream(title, bag_name);
        });

        if (!result) throw state.sendEmpty(404, { "x-reason": "no result" });

        throw state.sendStream(200, {
          Etag: state.makeTiddlerEtag(result),
          "Content-Type": result.type
        }, result.stream);
      }
  });

  handleGetWikiIndex = zodRoute({
    method: ["GET", "HEAD"],
    path: "/wiki/:recipe_name",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    inner:
      async (state) => {
        await state.assertRecipeACL(state.pathParams.recipe_name, false);

        await state.$transaction(async (prisma) => {
          const server = new TiddlerServer(state, prisma);
          await server.serveIndexFile(state.pathParams.recipe_name);
        });

        throw STREAM_ENDED;
      }
  });


}
