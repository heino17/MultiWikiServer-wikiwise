import { StateObject } from "../StateObject";
import { STREAM_ENDED } from "../../listen/streamer";
import { tryParseJSON, UserError, ZodAssert as zodAssert } from "../../utils";
import { registerZodRoutes, zodRoute, RouterKeyMap, RouterRouteMap } from "../../router";
import { TiddlerServer } from "../bag-file-server";
import { TiddlerFields } from "tiddlywiki";
import { TiddlerStore, TiddlerStore_Primitives, TiddlerStore_PrismaStatic } from "../TiddlerStore";
import { createReadStream, readFileSync } from "fs";
import { join, resolve } from "path";
import { createHash } from "crypto";


export const TiddlerKeyMap: RouterKeyMap<TiddlerRouter, true> = {
  // handleCreateRecipeTiddler: true,
  handleDeleteRecipeTiddler: true,
  handleGetBagStates: true,
  // handleGetBagTiddler: true,
  // handleGetBagTiddlerBlob: true,
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
    inner: async (state) => {

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
    inner: async (state) => {
      const { recipe_name, title } = state.pathParams;

      await state.assertRecipeACL(recipe_name, false);

      throw await state.$transaction(async (prisma) => {
        const server = new TiddlerServer2(state, prisma);
        const bag = await server.getRecipeBagWithTiddler({ recipe_name, title });

        // in my testing it seemed that fallback was very inefficient, so I removed it
        if (!bag) return state.sendEmpty(404, { "x-reason": "tiddler not found" });

        const tiddler = await prisma.tiddlers.findUnique({
          where: { bag_id_title: { bag_id: bag.bag_id, title } },
          include: { fields: true }
        })

        // in my testing it seemed that fallback was very inefficient, so I removed it
        if (!tiddler) return state.sendEmpty(404, { "x-reason": "tiddler not found" });

        const result = server.getTiddlerFields(title, tiddler.fields);

        const accept_json = state.headers.accept?.includes("application/json");
        const accept_mws_tiddler = state.headers.accept?.includes("application/x-mws-tiddler");

        // If application/json is requested then this is an API request, and gets the response in JSON
        if (accept_json || accept_mws_tiddler) {

          const type = accept_mws_tiddler ? "application/x-mws-tiddler"
            : accept_json ? "application/json"
              : undefined;

          if (!type) throw new Error("undefined type");

          return state.sendResponse(200, {
            "Etag": state.makeTiddlerEtag({
              bag_name: bag.bag.bag_name,
              revision_id: tiddler.revision_id,
            }),
            "Content-Type": "application/json",
            "X-Revision-Number": tiddler.revision_id,
            "X-Bag-Name": bag.bag.bag_name,
          }, formatTiddlerFields(result, type), "utf8");

        } else {

          // // This is not a JSON API request, we should return the raw tiddler content
          // const result = await this.getBagTiddlerStream(title, tiddlerInfo.bag_name);
          // if (!result || !result.stream) return state.sendEmpty(404);

          return state.sendString(200, {
            "Etag": state.makeTiddlerEtag({
              bag_name: bag.bag.bag_name,
              revision_id: tiddler.revision_id,
            }),
            "Content-Type": result.type
          }, result.text ?? "", "utf8");

        }

      });

    }
  })

  // handleGetBagTiddler = zodRoute({
  //   method: ["GET", "HEAD"],
  //   path: "/bags/:bag_name/tiddlers/:title",
  //   bodyFormat: "ignore",
  //   zodPathParams: z => ({
  //     bag_name: z.prismaField("Bags", "bag_name", "string"),
  //     title: z.prismaField("Tiddlers", "title", "string"),
  //   }),
  //   inner: async (state) => {

  //     await state.assertBagACL(state.pathParams.bag_name, false);

  //     throw await state.$transaction(async (prisma) => {
  //       const server = new TiddlerServer(state, prisma);
  //       // return await server.getBagTiddler(state.pathParams);
  //       return server.sendBagTiddler({ state, ...state.pathParams });
  //     });

  //   }
  // });


  handleListRecipeTiddlers = zodRoute({
    method: ["GET", "HEAD"],
    path: "/recipes/:recipe_name/tiddlers.json",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    inner: async (state) => {

      const { recipe_name } = state.pathParams;

      await state.assertRecipeACL(recipe_name, false);

      const result = await state.$transaction(async (prisma) => {
        const server = new TiddlerServer2(state, prisma);
        return await server.getRecipeTiddlers(recipe_name);
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
    zodQueryParams: z => ({
      last_known_revision_id: z.prismaField("Tiddlers", "revision_id", "string").array().optional(),
      include_deleted: z.enum(["yes", "no"]).array().optional(),
      gzip_stream: z.enum(["yes", "no"]).array().optional(),
    }),
    inner: async (state) => {

      const { recipe_name } = state.pathParams;
      await state.assertRecipeACL(recipe_name, false);

      const
        last_known_revision_id = state.queryParams.last_known_revision_id?.[0],
        include_deleted = state.queryParams.include_deleted?.[0] === "yes",
        gzip_stream = state.queryParams.gzip_stream?.[0] === "yes";

      const result = await state.$transaction(async (prisma) => {
        const server = new TiddlerServer2(state, prisma);
        return await server.getRecipeTiddlersByBag(recipe_name, { include_deleted, last_known_revision_id });
      });
      let etag = "";
      for (const b of result) {
        for (const t of b.tiddlers) {
          if (etag < t.revision_id) etag = t.revision_id;
        }
      }
      const newEtag = `"${etag}${gzip_stream}"`;
      const match = state.headers["if-none-match"] === newEtag;
      // 304 has to return the same headers if they're to be useful, 
      // so we'll also put them in the etag in case it ignores the query
      if (gzip_stream)
        state.writeHead(match ? 304 : 200, {
          "content-type": "application/gzip",
          "content-encoding": "identity",
          "x-gzip-stream": "yes",
          "etag": newEtag,
        });
      else
        state.writeHead(match ? 304 : 200, {
          "content-type": "application/json",
          "content-encoding": "identity",
          "etag": newEtag,
        });
      if (match) throw state.end();
      state.write("[");
      for (let i = 0; i < result.length; i++) {
        await state.write((i > 0 ? "," : "") + JSON.stringify(result[i]));
        if (gzip_stream) await state.splitCompressionStream();
      }
      state.write("]");
      throw state.end();

      // this still sets the return type of the function
      return result;

    }
  })



  handleSaveRecipeTiddler = zodRoute({
    method: ["PUT"],
    path: "/recipes/:recipe_name/tiddlers/:title",
    bodyFormat: "string",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
      title: z.prismaField("Tiddlers", "title", "string"),
    }),
    zodRequestBody: z => z.string(),
    inner: async (state) => {

      const { recipe_name } = state.pathParams;

      await state.assertRecipeACL(recipe_name, true);

      const fields = parseTiddlerFields(state.data, state.headers["content-type"]);

      if (fields === undefined)
        throw state.sendEmpty(400, {
          "x-reason": "PUT tiddler expects a valid json or x-mws-tiddler body"
        });

      const { bag_name, revision_id } = await state.$transaction(async (prisma) => {
        const server = new TiddlerServer2(state, prisma);
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
    zodRequestBody: z => z.undefined(),
    inner: async (state) => {

      const { recipe_name, title } = state.pathParams;
      if (!recipe_name || !title) throw state.sendEmpty(404, { "x-reason": "bag_name or title not found" });

      await state.assertRecipeACL(recipe_name, true);

      const { bag_name, revision_id } = await state.$transaction(async (prisma) => {
        const server = new TiddlerServer2(state, prisma);
        return await server.deleteRecipeTiddler(recipe_name, title);
      });

      return { bag_name, revision_id };

    }
  });

  // // this is not used by the sync adaptor. I'm not sure what uses it.
  // handleCreateRecipeTiddler = zodRoute({
  //   method: ["POST"],
  //   path: "/recipes/:recipe_name/tiddlers",
  //   bodyFormat: "json",
  //   zodPathParams: z => ({
  //     recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
  //   }),
  //   zodRequestBody: z => z.object({
  //     title: z.prismaField("Tiddlers", "title", "string", false),
  //   }).and(z.record(z.string())),
  //   inner: async (state) => {
  //     await state.assertRecipeACL(state.pathParams.recipe_name, true);

  //     const recipe_name = state.pathParams.recipe_name;

  //     return await state.$transaction(async (prisma) => {
  //       const server = new TiddlerServer(state, prisma);
  //       const { bag_name } = await server.getRecipeWritableBag(recipe_name) ?? {};
  //       if (!bag_name) throw state.sendEmpty(404, { "x-reason": "bag not found" });
  //       return { bag_name, results: await server.processIncomingStream(bag_name) };
  //     });

  //   }
  // });

  // handleGetBagTiddlerBlob = zodRoute({
  //   method: ["GET", "HEAD"],
  //   path: "/bags/:bag_name/tiddlers/:title/blob",
  //   bodyFormat: "ignore",
  //   zodPathParams: z => ({
  //     bag_name: z.prismaField("Bags", "bag_name", "string"),
  //     title: z.prismaField("Tiddlers", "title", "string"),
  //   }),
  //   inner: async (state) => {
  //     const { bag_name, title } = state.pathParams;

  //     await state.assertBagACL(bag_name, false);

  //     const result = await state.$transaction(async (prisma) => {
  //       const server = new TiddlerServer(state, prisma);
  //       return await server.getBagTiddlerStream(title, bag_name);
  //     });

  //     if (!result) throw state.sendEmpty(404, { "x-reason": "no result" });

  //     throw state.sendStream(200, {
  //       Etag: state.makeTiddlerEtag(result),
  //       "Content-Type": result.type
  //     }, result.stream);
  //   }
  // });

  handleGetWikiIndex = zodRoute({
    method: ["GET", "HEAD"],
    path: "/wiki/:recipe_name",
    bodyFormat: "ignore",
    zodPathParams: z => ({
      recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    }),
    inner: async (state) => {
      await state.assertRecipeACL(state.pathParams.recipe_name, false);

      await state.$transaction(async (prisma) => {
        const server = new TiddlerServer2(state, prisma);
        await server.serveIndexFile(state.pathParams.recipe_name);
      });

      throw STREAM_ENDED;
    }
  });


}

class TiddlerServer2 extends TiddlerStore_Primitives {
  constructor(
    protected state: StateObject,
    prisma: PrismaTxnClient
  ) {
    super(prisma);
  }
  /**
    Returns {revision_id:,bag_name:} or null if the recipe is empty
    */
  async saveRecipeTiddlerFields(
    tiddlerFields: TiddlerFields,
    recipe_name: PrismaField<"Recipes", "recipe_name">,
    attachment_hash: PrismaField<"Tiddlers", "attachment_hash">
  ) {
    const bag = await this.getRecipeWritableBag(recipe_name);
    const [deletion, creation] = this.saveBagTiddlerFields_PrismaArray(
      tiddlerFields, bag.bag_name, attachment_hash
    );
    await deletion;
    const { revision_id } = await creation;
    return { revision_id, bag_name: bag.bag_name };
  }

  /*
  Returns {revision_id:,bag_name:}
  */
  async deleteRecipeTiddler(
    recipe_name: PrismaField<"Recipes", "recipe_name">,
    title: PrismaField<"Tiddlers", "title">
  ) {

    const bag = await this.getRecipeWritableBag(recipe_name, title);

    if (!bag.tiddlers.length) throw new UserError("The writable bag does not contain this tiddler.");

    const [deletion, creation] = this.deleteBagTiddler_PrismaArray(title, bag.bag_name);
    await deletion;
    const { revision_id } = await creation;
    return { revision_id, bag_name: bag.bag_name };
  }
  async getRecipeTiddlers(recipe_name: PrismaField<"Recipes", "recipe_name">) {
    // Get the recipe name from the parameters
    const bagTiddlers = await this.getRecipeTiddlersByBag(recipe_name);

    // reverse order for Map, so 0 comes after 1 and overlays it
    bagTiddlers.sort((a, b) => b.position - a.position);

    return Array.from(new Map(bagTiddlers.flatMap(bag =>
      bag.tiddlers.map(tiddler => [tiddler.title, {
        title: tiddler.title,
        revision_id: tiddler.revision_id,
        is_deleted: tiddler.is_deleted,
        is_plugin: false,
        bag_name: bag.bag_name,
        bag_id: bag.bag_id
      }])
    )).values());

  }

  async serveIndexFile(recipe_name: PrismaField<"Recipes", "recipe_name">) {
    const state = this.state;

    // Check request is valid
    if (!recipe_name) {
      return state.sendEmpty(404);
    }

    const recipe = await this.prisma.recipes.findUnique({
      where: { recipe_name },
      include: {
        recipe_bags: {
          select: {
            position: true,
            bag: {
              select: {
                bag_id: true,
                bag_name: true,
                is_plugin: true,
              }
            }
          },
        }
      }
    });

    // Check request is valid
    if (!recipe) {
      return state.sendEmpty(404);
    }

    const lastTiddlerId = await this.prisma.tiddlers.aggregate({
      _max: { revision_id: true },
      where: { bag_id: { in: recipe.recipe_bags.map(e => e.bag.bag_id) } }
    });

    const { cachePath, pluginFiles, pluginHashes, requiredPlugins } = state.tiddlerCache;

    const plugins = [
      ...new Set([
        ...(!recipe.skip_required_plugins) ? requiredPlugins : [],
        ...(!recipe.skip_core) ? ["$:/core"] : [],
        ...recipe.plugin_names,
      ]).values()
    ];

    const template = readFileSync(resolve(state.config.cachePath, "tiddlywiki5.html"), "utf8");
    const hash = createHash('md5');
    // Put everything into the hash that could change and invalidate the page

    // the rendered template
    hash.update(template);
    // the bag names
    hash.update(recipe.recipe_bags.map(e => e.bag.bag_name).join(","));
    // the plugin hashes
    hash.update(plugins.map(e => pluginHashes.get(e) ?? "").join(","));
    // the latest tiddler id in those bags
    hash.update(`${lastTiddlerId._max.revision_id}`);
    const contentDigest = hash.digest("hex");

    const newEtag = `"${contentDigest}"`;
    const match = false && state.headers["if-none-match"] === newEtag;

    const headers: Record<string, string> = {};
    headers["content-type"] = "text/html";
    headers["etag"] = newEtag;
    headers["cache-control"] = "max-age=0, private, no-cache";



    // headers['content-security-policy'] = [
    //   // This header should prevent any external data from being pulled into the page 
    //   // via fetch XHR, src tags, CSS includes, etc. 
    //   "default-src 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' data: blob:",
    //   // this blocks any kind of form submissions from happening. 
    //   "form-action 'none'",
    // ].join("; ");

    state.writeHead(match ? 304 : 200, headers);

    if (state.method === "HEAD" || match) return state.end();

    // it is recommended to add <link rel="preload" to the header since these cannot be deferred
    // <link rel="preload" href="main.js" as="script" />

    // and recommended to specify the hashes for each file in their script tag. 
    // <script
    //   src="https://example.com/example-framework.js"
    //   integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
    //   crossorigin="anonymous"></script>

    // this needs to be added to the tiddlywiki file before the script tags
    // $tw = Object.create(null);
    // $tw.preloadTiddlers = $tw.preloadTiddlers || [];
    // $tw.preloadTiddler = function(fields) {
    //   $tw.preloadTiddlers.push(fields);
    // };

    const headPos = template.indexOf("</head>");
    await state.write(template.substring(0, headPos));

    if (state.config.enableExternalPlugins) {
      await state.write("\n" + plugins.map(e => {
        const plugin = pluginFiles.get(e)!;
        const hash = pluginHashes.get(e)!;
        return `<link rel="preload" href="${state.pathPrefix}/$cache/${plugin}/plugin.js" as="script" integrity="${hash}" crossorigin="anonymous" />`;
      }).join("\n") + "\n");
    }


    // Splice in our tiddlers
    var marker = `<script class="tiddlywiki-tiddler-store" type="application/json">[`,
      markerPos = template.indexOf(marker);
    if (markerPos === -1) {
      throw new Error("Cannot find tiddler store in template");
    }

    await state.write(template.substring(headPos, markerPos));

    plugins.forEach(e => {
      if (!state.tiddlerCache.pluginFiles.has(e))
        console.log(`Recipe ${recipe_name} uses unknown plugin ${e}`);
    });

    if (state.config.enableExternalPlugins) {

      await state.write(`
<script>
window.$tw = window.$tw || Object.create(null);
$tw.preloadTiddlers = $tw.preloadTiddlers || [];
$tw.preloadTiddler = function(fields) {
  $tw.preloadTiddlers.push(fields);
};
</script>
`);

      await state.write(plugins.map(e => {
        const plugin = pluginFiles.get(e)!;
        const hash = pluginHashes.get(e)!;
        return `<script src="${state.pathPrefix}/$cache/${plugin}/plugin.js" `
          + ` integrity="${hash}" crossorigin="anonymous"></script>`;
      }).join("\n") + "\n");

      await state.write(marker);

    } else {

      await state.write(marker);

      const fileStreams = plugins.map(e =>
        createReadStream(join(cachePath, pluginFiles.get(e)!, "plugin.json"))
      );

      for (let i = 0; i < fileStreams.length; i++) {
        state.write("\n");
        await state.pipeFrom(fileStreams[i]!);
        state.write(",");
      }

    }


    async function writeTiddler(tiddlerFields: Record<string, string>) {
      await state.write(JSON.stringify(tiddlerFields).replace(/</g, "\\u003c") + ",\n");
    }

    const bagOrder = new Map(recipe.recipe_bags.map(e => [e.bag.bag_id, e.position]));
    const bagIDs = recipe.recipe_bags.filter(e => !state.tiddlerCache.pluginFiles.has(e.bag.bag_name)).map(e => e.bag.bag_id)
    await this.serveStoreTiddlers(bagIDs, bagOrder, writeTiddler);

    await writeTiddler({
      title: "$:/config/multiwikiclient/recipe",
      text: recipe_name
    });

    await writeTiddler({
      title: "$:/config/multiwikiclient/use-server-sent-events",
      text: false ? "yes" : "no"
    });

    await writeTiddler({
      title: "$:/config/multiwikiclient/host",
      text: "$protocol$//$host$" + state.pathPrefix + "/",
    });

    if (state.config.enableDevServer)
      await writeTiddler({
        title: "$:/state/multiwikiclient/dev-mode",
        text: "yes"
      })


    // await writeTiddler({
    //   title: "$:/state/multiwikiclient/gzip-stream",
    //   text: "yes"
    // })

    await state.write(template.substring(markerPos + marker.length))
    // Finish response
    return state.end();

  }


  private async serveStoreTiddlers(
    bagKeys: string[],
    bagOrder: Map<string, number>,
    writeTiddler: (tiddlerFields: Record<string, string>) => Promise<void>
  ) {

    // NOTES: 
    // there is no point in using Prisma's distinct option, as it happens in memory.
    // we also cannot use orderBy across a oneToMany relationship

    const bagTiddlers = await this.prisma.bags.findMany({
      where: { bag_id: { in: bagKeys } },
      select: {
        bag_id: true,
        bag_name: true,
        is_plugin: true,
        description: true,
        owner_id: true,
        tiddlers: {
          select: {
            title: true,
            revision_id: true,
            is_deleted: true,
            attachment_hash: true,
            fields: true,
          },
          where: {
            is_deleted: false,
          },
        }
      }
    });

    if (!bagTiddlers.every(e => bagOrder.has(e.bag_id))) {
      console.log(bagTiddlers.map(e => e.bag_id));
      console.log(bagOrder);
      throw new Error("Bags missing from bag order");
    }

    bagTiddlers.sort((a, b) => bagOrder.get(b.bag_id)! - bagOrder.get(a.bag_id)!);
    // this determines which bag takes precedence
    // Map overwrites earlier entries with later entries,
    // so the topmost bag comes last, i.e. the position numbers are in descending order.
    const recipeTiddlers = Array.from(new Map(bagTiddlers.flatMap(bag =>
      bag.tiddlers.map(tiddler => [tiddler.title, { bag, tiddler }])
    )).values());

    const
      bagInfo: Record<string, string> = {}, revisionInfo: Record<string, string> = {};

    for (const recipeTiddlerInfo of recipeTiddlers) {

      const { title, revision_id, attachment_hash, fields } = recipeTiddlerInfo.tiddler;
      const { bag_name } = recipeTiddlerInfo.bag;

      const tiddler = Object.fromEntries([
        ...fields.map(e => [e.field_name, e.field_value] as const),
        ["title", title]
      ]) as {
        title: string;
        [K: string]: string;
      };

      bagInfo[title] = bag_name;
      revisionInfo[title] = revision_id.toString();
      await writeTiddler(tiddler);
    }

    const last_revision_id = Object.values(revisionInfo).reduce((n, e) => n > e ? n : e, "");

    writeTiddler({
      title: "$:/state/multiwikiclient/tiddlers/bag",
      text: JSON.stringify(bagInfo),
      type: "application/json"
    });
    writeTiddler({
      title: "$:/state/multiwikiclient/tiddlers/revision",
      text: JSON.stringify(revisionInfo),
      type: "application/json"
    });
    writeTiddler({
      title: "$:/state/multiwikiclient/recipe/last_revision_id",
      text: last_revision_id
    });
  }
}

function parseTiddlerFields(input: string, ctype: string | undefined) {

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

function formatTiddlerFields(input: TiddlerFields, ctype: "application/x-mws-tiddler" | "application/json") {
  if (ctype === "application/x-mws-tiddler") {
    const body = input.text;
    delete input.text;
    const head = JSON.stringify(input);
    return `${head}\n\n${body}`;
  }

  if (ctype === "application/json") {
    return JSON.stringify(input);
  }

  throw new UserError("Unknown tiddler wire format " + ctype)

}