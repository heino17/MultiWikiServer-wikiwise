// Public landing-page data for visitors who are not logged in.
//
// The landing page greets anonymous visitors at "/" with a lightweight
// overview of the installation instead of immediately dumping them on the
// login form. To keep the "private wikis stay private" promise, everything
// here is either installation-wide public information (versions, aggregate
// counts) or restricted to the wikis an anonymous visitor is allowed to
// read (recipe definition AND every bag in its ordering must grant ANON).

import { zodRoute } from "@tiddlywiki/server";
import { SendError } from "@tiddlywiki/server";
import { SessionManager } from "./sessions";
import { PREF_KEYS } from "./PrefsRoutes";

/** A session counts as "online" while it was touched within this window. */
const ONLINE_WINDOW_MS = 15 * 60 * 1000;

/** settings key prefix hiding a recipe from the landing page ("true" hides). */
const HIDDEN_PREFIX = "landing.hidden.";

function hiddenLandingRows(settingsRows: { key: string; value: string }[]): Set<string> {
  const hidden = new Set<string>();
  for (const { key, value } of settingsRows) {
    if (key.startsWith(HIDDEN_PREFIX) && value === "true")
      hidden.add(key.slice(HIDDEN_PREFIX.length));
  }
  return hidden;
}

export const LandingData = zodRoute({
  method: ["GET"],
  path: "/api/landing",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: false },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.asserted = true;

    const anonRoleId = state.user.roles.find((r) => r.role_name === SessionManager.AnonRoleName)?.role_id;

    const [recipeRows, [userCount, onlineCount], settingsRows] = await Promise.all([
      anonRoleId
        ? state.engine.recipe.findMany({
            select: {
              id: true,
              slug: true,
              definition: true,
              permissions: {
                where: { role_id: anonRoleId },
                select: { role_id: true, level: true },
              },
              recipe_bags: {
                orderBy: { priority: "asc" },
                select: {
                  bag_id: true,
                  bag: {
                    select: {
                      permissions: {
                        where: { role_id: anonRoleId },
                        select: { role_id: true, level: true },
                      },
                    },
                  },
                },
              },
            },
          })
        : [],
      Promise.all([
        state.engine.users.count(),
        state.engine.sessions.count({
          where: { last_accessed: { gt: new Date(Date.now() - ONLINE_WINDOW_MS) } },
        }),
      ]),
      state.engine.settings.findMany({ select: { key: true, value: true } }),
    ]);

    const settings = new Map(settingsRows.map((row) => [row.key, row.value]));
    const hiddenLanding = hiddenLandingRows(settingsRows);

    // Mirror the RecipeResolver read gate: a wiki is public only when the
    // ANON role holds a recipe permission row AND a permission row on every
    // bag in the ordering. Anything else is treated as private. Wiki owners
    // can additionally hide their own public wiki from the landing page.
    const publicWikis = recipeRows.filter(
      (row) => !hiddenLanding.has(row.id)
        && row.permissions.length > 0
        && row.recipe_bags.length > 0
        && row.recipe_bags.every((rb) => rb.bag.permissions.length > 0),
    );

    const publicBagIds = Array.from(new Set(publicWikis.flatMap((row) => row.recipe_bags.map((rb) => rb.bag_id))));
    const tiddlerCount = publicBagIds.length
      ? await state.engine.tiddler.count({ where: { bag_id: { in: publicBagIds } } })
      : 0;

    const wikis = publicWikis.map((row) => {
      const definition = row.definition as (Record<string, unknown> | null) ?? {};
      return {
        slug: row.slug,
        displayName: typeof definition.displayName === "string" && definition.displayName.trim()
          ? definition.displayName.trim()
          : row.slug,
        description: typeof definition.description === "string" ? definition.description : "",
      };
    });

    return {
      versions: {
        mws: state.config.versions.mws,
        tw5: Array.from(state.config.versions.tw5 ?? []),
      },
      stats: {
        publicWikis: publicWikis.length,
        tiddlers: tiddlerCount,
        users: userCount,
        online: onlineCount,
      },
      wikis,
      message: settings.get(PREF_KEYS.landingMessage)?.trim() || null,
      news: settings.get(PREF_KEYS.landingNews)?.trim() || null,
    };
  },
});

/**
 * Lists the currently publicly readable (ANON-open) wikis the caller may
 * decide about, with their landing-page visibility flag. Every logged-in user
 * sees their own wikis; the site admin account ("admin") sees all.
 */
export const LandingWikisGet = zodRoute({
  method: ["GET"],
  path: "/api/landing/wikis",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.assertReferer(["/settings"]);
    state.okUser();
    state.asserted = true;

    const anonRole = await state.engine.roles.findFirst({
      where: { role_name: SessionManager.AnonRoleName },
      select: { role_id: true },
    });
    const anonRoleId = anonRole?.role_id;
    if (!anonRoleId) return { wikis: [] };

    const [recipes, settingsRows] = await Promise.all([
      state.engine.recipe.findMany({
        where: state.user.username === "admin" ? {} : { owner_user_id: state.user.user_id },
        select: {
          id: true,
          slug: true,
          definition: true,
          permissions: {
            where: { role_id: anonRoleId },
            select: { role_id: true, level: true },
          },
          recipe_bags: {
            orderBy: { priority: "asc" },
            select: {
              bag: {
                select: {
                  permissions: {
                    where: { role_id: anonRoleId },
                    select: { role_id: true, level: true },
                  },
                },
              },
            },
          },
        },
      }),
      state.engine.settings.findMany({
        select: { key: true, value: true },
        where: { key: { startsWith: HIDDEN_PREFIX } },
      }),
    ]);

    const hiddenLanding = hiddenLandingRows(settingsRows);

    const publicWikis = recipes.filter(
      (row) => row.permissions.length > 0
        && row.recipe_bags.length > 0
        && row.recipe_bags.every((rb) => rb.bag.permissions.length > 0),
    );

    return {
      wikis: publicWikis.map((row) => {
        const definition = row.definition as (Record<string, unknown> | null) ?? {};
        return {
          slug: row.slug,
          displayName: typeof definition.displayName === "string" && definition.displayName.trim()
            ? definition.displayName.trim()
            : row.slug,
          hiddenOnLanding: hiddenLanding.has(row.id),
        };
      }),
    };
  },
});

/**
 * Hides or unhides a wiki on the public landing page. Only the user who
 * created the wiki (or the site admin account) may toggle it; hiding is
 * stored as a `landing.hidden.<recipeId>` settings row.
 */
export const LandingWikisPut = zodRoute({
  method: ["PUT"],
  path: "/api/landing/wikis",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodRequestBody: z => z.object({
    slug: z.string().min(1).max(120),
    hidden: z.boolean(),
  }),
  inner: async (state) => {
    state.assertReferer(["/settings"]);
    state.okUser();
    state.asserted = true;

    const { slug, hidden } = state.data;

    const { hiddenOnLanding } = await state.$transaction(async (prisma) => {
      const recipe = await prisma.recipe.findUnique({
        where: { slug },
        select: { id: true, owner_user_id: true },
      });
      if (!recipe)
        throw new SendError("RECIPE_NOT_FOUND", 404, { recipeName: slug });

      const isOwner = !!recipe.owner_user_id && recipe.owner_user_id === state.user.user_id;
      const isSiteAdmin = state.user.username === "admin";
      if (!isOwner && !isSiteAdmin)
        throw new SendError("ACCESS_DENIED", 403, { reason: "Only the user who created the wiki (or the site admin 'admin') may change whether it appears on the landing page." });

      const key = HIDDEN_PREFIX + recipe.id;
      if (hidden) {
        await prisma.settings.upsert({
          where: { key },
          create: { key, value: "true" },
          update: { value: "true" },
        });
      } else {
        await prisma.settings.deleteMany({ where: { key } });
      }

      return { hiddenOnLanding: hidden };
    });

    return { slug, hiddenOnLanding };
  },
});