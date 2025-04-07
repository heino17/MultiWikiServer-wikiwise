import { ZodAssert as zodAssert } from "../utils";
import { TiddlerServer } from "./bag-file-server";

export class TiddlerRouter {
  routes: Record<string, any>[] = [];
  constructor(root: rootRoute) {
    this.routes.forEach(({ route, handler }) => { root.defineRoute(route, handler); });
  }
  defineRoute: rootRoute["defineRoute"] = (route, handler): any => {
    this.routes.push({ route, handler });
  };
  handleGetRecipeStatus = this.defineRoute({
    method: ["GET"],
    path: /^\/recipes\/([^\/]+)\/status$/,
    pathParams: ["recipe_name"],
  }, async (state) => {
    zodAssert.pathParams(state, z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }));

    const { recipe_name } = state.pathParams;

    const { recipe, canRead, canWrite } = await state.getRecipeACL(recipe_name, true);

    if (!recipe) return state.sendEmpty(404, { "x-reason": "recipe not found" });
    if (!canRead) return state.sendEmpty(403, { "x-reason": "read access denied" });

    const { isAdmin, user_id, username } = state.user;

    return state.sendJSON(200, {
      isAdmin,
      user_id,
      username,
      isLoggedIn: state.user.isLoggedIn,
      isReadOnly: !canWrite,
      allowAnonReads: state.config.allowAnonReads,
      allowAnonWrites: state.config.allowAnonWrites,
    });
  });

  handleGetRecipeTiddler = this.defineRoute({
    method: ["GET"],
    path: /^\/recipes\/([^\/]+)\/tiddlers\/(.+)$/,
    pathParams: ["recipe_name", "title"],
  }, async (state) => {
    zodAssert.pathParams(state, z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }));

    zodAssert.queryParams(state, z => ({
      fallback: z.array(z.string()).optional()
    }));

    const { recipe_name, title } = state.pathParams;

    await state.assertRecipeACL(recipe_name, false);

    return await state.$transaction(async (prisma) => {
      const server = new TiddlerServer(state, prisma);
      const bag = await server.getRecipeBagWithTiddler({ recipe_name, title });
      return await server.sendBagTiddler({ state, bag_id: bag?.bag_id, title });
    });
  });

  handleListRecipeTiddlers = this.defineRoute({
    method: ["GET"],
    path: /^\/recipes\/([^\/]+)\/tiddlers.json$/,
    pathParams: ["recipe_name"],
  }, async (state) => {

    zodAssert.pathParams(state, z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }));
    zodAssert.queryParams(state, z => ({
      include_deleted: z.string().array().optional(),
      last_known_tiddler_id: z.string().array().optional(),
    }));
    const { recipe_name } = state.pathParams;
    const include_deleted = state.queryParams.include_deleted?.[0] === "true";
    const last_known_tiddler_id = +(state.queryParams.last_known_tiddler_id?.[0] ?? 0) || undefined;

    await state.assertRecipeACL(recipe_name, false);

    const result = await state.$transaction(async (prisma) => {
      const server = new TiddlerServer(state, prisma);
      return await server.getRecipeTiddlers(recipe_name, {
        include_deleted,
        last_known_tiddler_id
      });

    });
    return state.sendJSON(200, result);
  });

  handleSaveRecipeTiddler = this.defineRoute({
    method: ["PUT"],
    path: /^\/recipes\/([^\/]+)\/tiddlers\/(.+)$/,
    pathParams: ["recipe_name", "title"],
    bodyFormat: "json",
  }, async (state) => {

    zodAssert.pathParams(state, z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }));

    zodAssert.data(state, z => z.object({
      title: z.prismaField("Tiddlers", "title", "string", false),
    }).and(z.record(z.string())));

    const { recipe_name, title } = state.pathParams;

    await state.assertRecipeACL(recipe_name, true);

    const { bag_name, tiddler_id } = await state.$transaction(async (prisma) => {
      const server = new TiddlerServer(state, prisma);
      return await server.saveRecipeTiddler(state.data, state.pathParams.recipe_name);
    });

    return state.sendEmpty(204, {
      "X-Revision-Number": tiddler_id.toString(),
      Etag: state.makeTiddlerEtag({ bag_name, tiddler_id }),
      "X-Bag-Name": bag_name,
    });

  });

  handleDeleteBagTiddler = this.defineRoute({
    method: ["DELETE"],
    path: /^\/bags\/([^\/]+)\/tiddlers\/(.+)$/,
    pathParams: ["bag_name", "title"],
    bodyFormat: "ignore",
  }, async (state) => {

    zodAssert.pathParams(state, z => ({
      bag_name: z.prismaField("Bags", "bag_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }));

    const { bag_name, title } = state.pathParams;
    if (!bag_name || !title) return state.sendEmpty(404, { "x-reason": "bag_name or title not found" });

    await state.assertBagACL(bag_name, true);

    const result = await state.$transaction(async (prisma) => {
      const server = new TiddlerServer(state, prisma);
      return await server.deleteBagTiddler(title, bag_name);
    });


    return state.sendEmpty(204, {
      "X-Revision-Number": result.tiddler_id.toString(),
      Etag: state.makeTiddlerEtag(result),
      "Content-Type": "text/plain"
    });

  });

  handleGetBagTiddler = this.defineRoute({
    method: ["GET"],
    path: /^\/bags\/([^\/]+)\/tiddlers\/(.+)$/,
    pathParams: ["bag_name", "title"],
  }, async (state) => {
    zodAssert.pathParams(state, z => ({
      bag_name: z.prismaField("Bags", "bag_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }));

    await state.assertBagACL(state.pathParams.bag_name, false);

    return await state.$transaction(async (prisma) => {
      const server = new TiddlerServer(state, prisma);
      return server.sendBagTiddler({
        state,
        bag_name: state.pathParams.bag_name,
        title: state.pathParams.title
      });
    });
  });

  handleCreateBagTiddler = this.defineRoute({
    method: ["POST"],
    path: /^\/bags\/([^\/]+)\/tiddlers\/$/,
    pathParams: ["bag_name"],
    bodyFormat: "stream",
  }, async (state) => {
    zodAssert.pathParams(state, z => ({
      bag_name: z.prismaField("Bags", "bag_name", "string"),
    }));

    await state.assertBagACL(state.pathParams.bag_name, true);

    // Get the parameters
    const bag_name = state.pathParams.bag_name;

    const results = await state.$transaction(async (prisma) => {
      const server = new TiddlerServer(state, prisma);
      return await server.processIncomingStream(bag_name);
    });

    // we aren't rendering html anymore, so just return json
    return state.sendJSON(200, { bag_name, results });

  });

  handleGetBagTiddlerBlob = this.defineRoute({
    method: ["GET"],
    path: /^\/bags\/([^\/]+)\/tiddlers\/([^\/]+)\/blob$/,
    pathParams: ["bag_name", "title"],
  }, async (state) => {
    zodAssert.pathParams(state, z => ({
      bag_name: z.prismaField("Bags", "bag_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }));

    const { bag_name, title } = state.pathParams;

    await state.assertBagACL(bag_name, false);

    const result = await state.$transaction(async (prisma) => {
      const server = new TiddlerServer(state, prisma);
      return await server.getBagTiddlerStream(title, bag_name);
    });

    if (!result) return state.sendEmpty(404, { "x-reason": "no result" });

    return state.sendStream(200, {
      Etag: state.makeTiddlerEtag(result),
      "Content-Type": result.type
    }, result.stream);

  });


  handleGetWikiIndex = this.defineRoute({
    method: ["GET", "HEAD"],
    path: /^\/wiki\/([^\/]+)$/,
    pathParams: ["recipe_name"],
  }, async (state) => {
    zodAssert.pathParams(state, z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }));

    await state.assertRecipeACL(state.pathParams.recipe_name, false);

    return await state.$transaction(async (prisma) => {
      const server = new TiddlerServer(state, prisma);
      return await server.serveIndexFile(state.pathParams.recipe_name);
    });

  });
}
