// Public landing-page data for visitors who are not logged in.
//
// The landing page greets anonymous visitors at "/" with a lightweight
// overview of the installation instead of immediately dumping them on the
// login form. To keep the "private wikis stay private" promise, everything
// here is either installation-wide public information (versions, aggregate
// counts) or restricted to the wikis an anonymous visitor is allowed to
// read (recipe definition AND every bag in its ordering must grant ANON).

import { zodRoute } from "@tiddlywiki/server";
import { SessionManager } from "./sessions";
import { PREF_KEYS } from "./PrefsRoutes";

/** A session counts as "online" while it was touched within this window. */
const ONLINE_WINDOW_MS = 15 * 60 * 1000;

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

    // Mirror the RecipeResolver read gate: a wiki is public only when the
    // ANON role holds a recipe permission row AND a permission row on every
    // bag in the ordering. Anything else is treated as private.
    const publicWikis = recipeRows.filter(
      (row) => row.permissions.length > 0
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