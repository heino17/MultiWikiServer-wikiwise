import "./global";
import * as opaque from "@serenity-kit/opaque";
import { serverEvents, startup, Router, Z2 } from "@tiddlywiki/server";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "fs";
import * as path from "path";
import { TW } from "tiddlywiki";
import { ServerState, TiddlerCache } from "./ServerState";
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
import "./RequestState";
import "./services/tw-routes";
import "./services/cache";
import { prismaField } from "./zodAssert";
import { Debug } from "@prisma/client/runtime/library";
import { SqliteAdapter } from "./db/sqlite-adapter";
import { PrismaClient } from "@prisma/client";


serverEvents.on("zod.make", (zod: Z2<any>) => {
  zod.prismaField = prismaField;
});

serverEvents.on("cli.register", commands2 => {
  Object.assign(commands2, commands);
})
serverEvents.on("listen.routes", async (listen, root) => {
  await serverEvents.emitAsync("mws.routes", root, listen.config);
})
serverEvents.on("listen.routes.fallback", async (listen, root) => {
  await serverEvents.emitAsync("mws.routes.fallback", root, listen.config);
})

declare module "@tiddlywiki/server" {
  interface ServerEventsMap {
    "mws.init.before": [config: ServerState, $tw: TW];
    "mws.init.after": [config: ServerState, $tw: TW];
    "mws.adapter.init.before": [adapter: SqliteAdapter];
    "mws.adapter.init.after": [adapter: SqliteAdapter];
    "mws.cache.init.before": [cachePath: string, $tw: TW];
    "mws.cache.init.after": [cache: TiddlerCache, $tw: TW];
    "mws.routes": [root: ServerRoute, config: ServerState];
    "mws.routes.fallback": [root: ServerRoute, config: ServerState];
  }
}

serverEvents.on("cli.execute.before", async (name, params, options, instance) => {
  const wikiPath = path.resolve(process.cwd());
  if (!existsSync(wikiPath)) throw "The wiki path does not exist";

  const $tw = await bootTiddlyWiki(wikiPath);
  const passwordService = await createPasswordService(readPasswordMasterKey(wikiPath));

  const cachePath = path.resolve(wikiPath, "cache");
  mkdirSync(cachePath, { recursive: true });
  serverEvents.emitAsync("mws.cache.init.before", cachePath, $tw);
  const cache = await startupCache($tw, cachePath);
  serverEvents.emitAsync("mws.cache.init.after", cache, $tw);

  const storePath = path.resolve(wikiPath, "store");
  mkdirSync(storePath, { recursive: true });
  const databasePath = path.resolve(storePath, "database.sqlite");

  const adapter = new SqliteAdapter(databasePath, !!process.env.ENABLE_DEV_SERVER);
  serverEvents.emitAsync("mws.adapter.init.before", adapter);
  await adapter.init();
  serverEvents.emitAsync("mws.adapter.init.after", adapter);

  const engine: PrismaEngineClient = new PrismaClient({
    log: [
      ...Debug.enabled("prisma:query") ? ["query" as const] : [],
      "info", "warn"
    ],
    adapter: adapter.adapter
  });

  const config = new ServerState({ wikiPath, cachePath, storePath }, $tw, engine, passwordService, cache);
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

export async function runMWS() {
  await opaque.ready;
  await startup();
}
