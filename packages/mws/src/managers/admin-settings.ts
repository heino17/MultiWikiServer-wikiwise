import { registerZodRoutes, RouterKeyMap, RouterRouteMap, ServerRoute, UserError } from "@tiddlywiki/server";
import { admin } from "./admin-utils";
import { ServerState } from "../ServerState";
import { assertSignature } from "../services/sessions";
import { serverEvents } from "@tiddlywiki/events";




export const SettingsKeyMap: RouterKeyMap<SettingsManager, true> = {
  settings_read: true,
  settings_update: true,
}

export type SettingsManagerMap = RouterRouteMap<SettingsManager>;

serverEvents.on("mws.routes", (root) => {
  SettingsManager.defineRoutes(root);
});

const validKeys = ["siteTitle", "siteDescription", "theme", "language"];

class SettingsManager {
  static defineRoutes(root: ServerRoute) {
    registerZodRoutes(root, new SettingsManager(), Object.keys(SettingsKeyMap));
  }

  settings_read = admin(z => z.undefined(), async (state, prisma) => {

    state.okAdmin();

    const current = Object.fromEntries(
      (await prisma.settings.findMany())
        .map(({ key, value }) => [key, value])
    );

    return state.config.settings.map(e => {
      return { ...e, value: current[e.key] };
    });

    // return Object.fromEntries(settings.map(s => [s.key, s.value]));

  });

  settings_update = admin(z => z.object({
    key: z.string(),
    value: z.string(),
  }), async (state, prisma) => {

    state.okAdmin();

    const { key, value } = state.data;

    if (!state.config.settings.find(e => e.key === key)) {
      throw new UserError(`Invalid setting key: ${key}`);
    }

    // Update or create the setting
    await prisma.settings.update({ where: { key }, data: { value }, });

    const existing = Object.fromEntries((await prisma.settings.findMany()).map(e => [e.key, e.value]));

    await state.config.initSettings(existing);

    return { success: true };
  });

}
