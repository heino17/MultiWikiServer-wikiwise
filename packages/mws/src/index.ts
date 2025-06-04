import "./global";
import * as opaque from "@serenity-kit/opaque";
import { serverEvents, startup, Router, Z2 } from "@tiddlywiki/server";
import { existsSync, writeFileSync, readFileSync } from "fs";
import * as path from "path";
import { TW } from "tiddlywiki";
import { ServerState } from "./ServerState";
import { startupCache } from "./services/cache";
import { createPasswordService } from "./services/PasswordService";
import { bootTiddlyWiki } from "./services/tiddlywiki";
import { AuthUser, SessionManager } from "./services/sessions";
import { commands } from "./commands";
import { setupDevServer } from "./services/setupDevServer";

import "./managers";
import "./managers/admin-recipes";
import "./managers/admin-users";
import "./managers/wiki-routes";
import "./zodAssert";
import "./StateObject";
import "./services/tw-routes";
import "./services/cache";
import { prismaField } from "./zodAssert";


serverEvents.on("zod.make", (zod: Z2<any>) => {
  zod.prismaField = prismaField;
});

serverEvents.on("cli.register", commands2 => {
  Object.assign(commands2, commands);
})



serverEvents.on("cli.execute.before", async (name, params, options, instance) => {
  const wikiPath = process.cwd();
  if (!existsSync(wikiPath)) throw "The wiki path does not exist";
  const $tw = await bootTiddlyWiki(wikiPath);
  const passwordService = await createPasswordService(readPasswordMasterKey(wikiPath));
  const cache = await startupCache($tw, path.resolve(wikiPath, "cache"));
  const config = new ServerState(wikiPath, $tw, passwordService, cache);
  serverEvents.emitAsync("mws.init.before", config, $tw);
  await config.init();
  serverEvents.emitAsync("mws.init.after", config, $tw);
  instance.config = config;
  instance.$tw = $tw;
});

serverEvents.on("listen.router", async (listen, router) => {
  router.config = listen.config;
  router.sendAdmin = await setupDevServer(listen.config);
});
serverEvents.on("request.streamer", async (router, streamer) => {
  streamer.user = await SessionManager.parseIncomingRequest(streamer, router.config);
});
// request.state is handled in StateObject.ts
serverEvents.on("listen.routes", async (listen, root) => {
  await serverEvents.emitAsync("mws.routes", root, listen.config);
})
serverEvents.on("listen.routes.fallback", async (listen, root) => {
  await serverEvents.emitAsync("mws.routes.fallback", root, listen.config);
})

declare module "@tiddlywiki/server" {
  interface BaseCommand {
    config: ServerState;
    $tw: TW;
  }

  interface Router {
    config: ServerState;
    sendAdmin: ART<typeof setupDevServer>;
  }

  interface Streamer {
    user: AuthUser;
  }

  interface ServerEventsMap {
    // these two run inside "cli.execute.before" 
    "mws.init.before": [config: ServerState, $tw: TW];
    "mws.init.after": [config: ServerState, $tw: TW];
    "mws.routes": [root: ServerRoute, config: ServerState];
    "mws.routes.fallback": [root: ServerRoute, config: ServerState];
  }
}

function readPasswordMasterKey(wikiPath: string) {
  const passwordKeyFile = path.join(wikiPath, "passwords.key");
  if (typeof passwordKeyFile === "string"
    && passwordKeyFile
    && !existsSync(passwordKeyFile)) {
    writeFileSync(passwordKeyFile, opaque.server.createSetup());
    console.log("Password master key created at", passwordKeyFile);
  }

  const passwordMasterKey = readFileSync(passwordKeyFile, "utf8").trim();
  return passwordMasterKey;
}

serverEvents.on("mws.routes.fallback", (root, config) => {

  root.defineRoute({
    method: ['GET'],
    path: /^\/.*/,
    bodyFormat: "stream",
  }, async state => {
    await state.sendAdmin();
    return STREAM_ENDED;
  });
});

export async function runMWS() {
  await opaque.ready;
  await startup();
}
