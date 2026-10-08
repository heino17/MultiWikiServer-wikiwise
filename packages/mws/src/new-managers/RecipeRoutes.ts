import { zodRoute, SendError } from "@tiddlywiki/server";
import { RecipeResolver } from "./RecipeResolver";
import { serveWikiIndex } from "./RecipeIndexSender";
import { resolveShellVersionStatus } from "./template-releases";
import { RecipeImportWriter } from "./TabUpserts";
// ---------------------------------------------------------------------------
// Recipe-scoped endpoints (RSD, batch, list, status) — addressed by title.
// ---------------------------------------------------------------------------


// #region GetStatus
export const RecipeStatus = zodRoute({
  method: ["GET", "HEAD"],
  path: "/recipe/:recipe_slug/status",
  bodyFormat: "ignore",
  zodPathParams: z => ({
    recipe_slug: z.prismaField("Recipe", "slug", "string"),
  }),
  inner: async (state) => {
    const { recipe_slug } = state.pathParams;
    state.assertWikiReferer(recipe_slug);
    const recipe = await RecipeResolver.assertRecipe({
      state,
      recipe_slug,
    }).then(e => {
      state.asserted = true;
      return e;
    });
    return await state.$transaction(async (prisma) => {
      const r = new RecipeResolver(recipe, prisma, state.user);
      const { isAdmin, user_id, username, isLoggedIn } = state.user;
      return {
        isAdmin,
        user_id,
        username,
        isLoggedIn,
        // which template shell release this wiki serves, and whether a newer
        // one exists — the wiki's update banner reads it from here
        shell: await resolveShellVersionStatus(prisma, recipe),
        bags: recipe.recipe_bags.map(e => ({
          bag_id: e.bag_id,
          is_writable: e.is_writable,
          prefix: e.prefix,
          priority: e.priority,
          bag_name: e.bag.name,
          canUserWrite: r.canWriteBag(e),
        }))
      };
    });
  },
});
// #region ShellUpdate
/**
 * Accept the template's newest shell release for this wiki: the pin moves to
 * that release and the wiki is recompiled against it. The shell policy stays
 * as it is (pin stays pin, notify stays notify); "auto" wikis serve the newest
 * release anyway, so for them the call only recompiles.
 *
 * Allowed for the wiki owner and for admins — the same gate that guards the
 * wiki settings form. Deliberately not editors: a shell carries the whole
 * page, so accepting a new one is the owner's decision.
 */
export const RecipeShellUpdate = zodRoute({
  method: ["PUT"],
  path: "/recipe/:recipe_slug/shell/update",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({
    recipe_slug: z.prismaField("Recipe", "slug", "string"),
  }),
  inner: async (state) => {
    const { recipe_slug } = state.pathParams;
    state.assertWikiReferer(recipe_slug);
    const recipe = await RecipeResolver.assertRecipe({
      state,
      recipe_slug,
    }).then(e => {
      state.asserted = true;
      return e;
    });

    if (!state.user.isAdmin && recipe.owner_user_id !== state.user.user_id)
      throw new SendError("ACCESS_DENIED", 403, { reason: "Only the wiki owner or an admin may update the shell." });

    return await state.$transaction(async (prisma) => {
      const latest = await prisma.templateVersion.findFirst({
        where: { template_id: recipe.template_id },
        orderBy: { release: "desc" },
        select: { id: true, release: true, definition: true },
      });
      if (!latest)
        throw state.sendEmpty(409, { "x-reason": "the template has no shell releases yet" });

      const compiled = new RecipeImportWriter(prisma, false).compileRecipeSimpleV1(
        recipe.definition,
        latest.definition,
      );
      await prisma.recipe.update({
        where: { id: recipe.id },
        data: {
          plugins: compiled.plugins,
          compiledAt: new Date(),
          pinned_template_version_id: latest.id,
          recipe_bags: {
            deleteMany: {},
            create: compiled.bags.map(e => ({
              bag: { connect: { name: e.bagName } },
              is_writable: e.isWritable,
              prefix: e.prefix,
              priority: e.priority,
            })),
          },
        },
      });

      return await resolveShellVersionStatus(prisma, {
        template_id: recipe.template_id,
        shell_policy: recipe.shell_policy,
        pinned_template_version_id: latest.id,
      });
    });
  },
});
// #region TiddlerList
export const TiddlerList = zodRoute({
  method: ["GET", "HEAD"],
  path: "/recipe/:recipe_slug/list.json",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: false },
  zodPathParams: z => ({
    recipe_slug: z.prismaField("Recipe", "slug", "string"),
  }),
  inner: async (state) => {
    const { recipe_slug } = state.pathParams;
    state.assertWikiReferer(recipe_slug);
    const recipe = await RecipeResolver.assertRecipe({
      state,
      recipe_slug,
    }).then(e => {
      state.asserted = true;
      return e;
    });
    return await state.$transaction(async (prisma) => {
      const r = new RecipeResolver(recipe, prisma, state.user);
      return await r.listTiddlers();
    });
  },
});
// #region RecipeStore
export const RecipeStoreJS = zodRoute({
  method: ["GET", "HEAD"],
  path: "/recipe/:recipe_slug/store.js",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: false },
  zodPathParams: z => ({
    recipe_slug: z.prismaField("Recipe", "slug", "string"),
  }),
  zodQueryKeys: ["cache"],
  inner: async (state) => {
    const { recipe_slug } = state.pathParams;
    state.assertWikiReferer(recipe_slug);
    throw await serveWikiIndex(state, recipe_slug, "store.js");
  },
});
// #region RecipeStore
export const RecipeStoreJSON = zodRoute({
  method: ["GET", "HEAD"],
  path: "/recipe/:recipe_slug/store.json",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: false },
  zodPathParams: z => ({
    recipe_slug: z.prismaField("Recipe", "slug", "string"),
  }),
  zodQueryKeys: ["cache"],
  inner: async (state) => {
    const { recipe_slug } = state.pathParams;
    state.assertWikiReferer(recipe_slug);
    throw await serveWikiIndex(state, recipe_slug, "store.json");
  },
});
// #region RecipeUpdates
/** Poll for tiddler changes since a known sequence number. */
export const RecipeUpdates = zodRoute({
  method: ["GET", "HEAD"],
  path: "/recipe/:recipe_slug/updates",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: false },
  zodPathParams: z => ({
    recipe_slug: z.prismaField("Recipe", "slug", "string"),
  }),
  zodQueryKeys: ["since"],
  inner: async (state) => {
    const { recipe_slug } = state.pathParams;
    state.assertWikiReferer(recipe_slug);

    const recipe = await RecipeResolver.assertRecipe({
      state,
      recipe_slug,
    }).then(e => {
      state.asserted = true;
      return e;
    });

    return await state.$transaction(async (prisma) => {
      const r = new RecipeResolver(recipe, prisma, state.user);
      const bagIDMap = new Map(recipe.recipe_bags.map(b => [b.bag_id, b]));
      const since = Number(state.query.get("since")) || 0;
      const events = await prisma.tiddlerEvent.findMany({
        where: { bag_id: { in: Array.from(bagIDMap.keys()) }, seq: { gt: since } },
        orderBy: { seq: "asc" },
        select: { seq: true, title: true, type: true, bag_id: true },
      });

      const lastSeq = events.at(-1)?.seq ?? since;

      const lastEventByTitle = new Map<string, "save" | "delete">();
      for (const e of events) {
        const target = r.getWriteTarget({ title: e.title });
        if (!bagIDMap.get(e.bag_id)!.is_writable || target && target.bag_id === e.bag_id)
          lastEventByTitle.set(e.title, e.type);
      }

      const modifications: string[] = [];
      const deletions: string[] = [];
      for (const [title, type] of lastEventByTitle) {
        if (type === "save")
          modifications.push(title);

        else
          deletions.push(title);
      }

      return { modifications, deletions, lastSeq: lastSeq.toString() };
    });
  },
});
// #region TiddlerBatch
/**
 * Batch RSD over a set of titles. Per-tiddler: each item returns its own
 * success or failure. Not atomic — a denied item does not fail the rest.
 */
export const TiddlerBatch = zodRoute({
  method: ["PUT"],
  path: "/recipe/:recipe_slug/batch/:op",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({
    recipe_slug: z.prismaField("Recipe", "slug", "string"),
    op: z.enum(["list", "read", "save", "delete"]),
  }),
  zodRequestBody: z => z.object({
    // for read/delete: titles. for save: tiddler field records (must include title).
    titles: z.prismaField("Tiddler", "title", "string").array().optional(),
    tiddlers: z.record(z.string(), z.any()).array().optional(),
  }),
  inner: async (state) => {
    const { recipe_slug, op } = state.pathParams;
    state.assertWikiReferer(recipe_slug)



    const recipe = await RecipeResolver.assertRecipe({
      state,
      recipe_slug,
    }).then(e => {
      state.asserted = true;
      return e;
    });

    const result = await state.$transaction(async (prisma) => {

      const r = new RecipeResolver(recipe, prisma, state.user);

      if (op === "list") {
        return await r.listTiddlers();
      }

      if (op === "read") {
        state.data.titles = Array.from(new Set(state.data.titles));
        if (!Array.isArray(state.data.titles))
          throw new SendError("ARGUMENT_REQUIRED", 400, { name: "titles" });
        return await r.readTiddlers({ titles: state.data.titles });
      }

      if (op === "save") {
        if (!Array.isArray(state.data.tiddlers))
          throw new SendError("ARGUMENT_REQUIRED", 400, { name: "tiddlers" });
        return await r.saveTiddlers({ tiddlers: state.data.tiddlers });
      }

      if (op === "delete") {
        state.data.titles = Array.from(new Set(state.data.titles));
        if (!Array.isArray(state.data.titles))
          throw new SendError("ARGUMENT_REQUIRED", 400, { name: "titles" });
        return await r.deleteTiddlers({ titles: state.data.titles });
      }

      { const t: never = op; }

      throw new Error("Invalid op should have been caught by zod");
    });

    // No thumbnail invalidation here any more: serveWikiThumbnail() compares
    // the PNG's mtime against the wiki's newest tiddler change (see
    // isStaleAfterEdit), so a save needs no event and cannot be lost by a
    // server restart.

    return result;
  },
});

