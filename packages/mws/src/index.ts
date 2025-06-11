import "../../../prisma/global";
import { serverEvents } from "@tiddlywiki/events";
import "@tiddlywiki/commander";
import "@tiddlywiki/server";

import "./managers";
import "./managers/admin-recipes";
import "./managers/admin-users";
import "./managers/wiki-routes";
import "./zodAssert";
import "./RequestState";
import "./ServerState";
import "./services/tw-routes";
import "./services/cache";
import * as opaque from "@serenity-kit/opaque";
import { startup, Router, Z2, ServerRoute, BodyFormat, RouteMatch } from "@tiddlywiki/server";
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
import { runCLI } from "@tiddlywiki/commander";

import { prismaField } from "./zodAssert";
import { Debug } from "@prisma/client/runtime/library";
import { SqliteAdapter } from "./db/sqlite-adapter";
import { PrismaClient } from "@prisma/client";
import pkg from "../package.json";
import { StateObject } from "./RequestState";
import { Streamer } from "@tiddlywiki/server";

export { ZodRoute } from "@tiddlywiki/server";
export * from "./managers";

export async function runMWS() {
  await opaque.ready;
  await startup();
  await runCLI();
}

serverEvents.on("zod.make", (zod: Z2<any>) => {
  zod.prismaField = prismaField;
});

serverEvents.on("cli.register", commands2 => {
  Object.assign(commands2, commands);
});

serverEvents.on("cli.commander", (program) => {
  program.description("Multi-User Multi-Wiki Server for TiddlyWiki.");
})

serverEvents.on("listen.routes", async (listen, root) => {
  await serverEvents.emitAsync("mws.routes", root, listen.config);
});

serverEvents.on("listen.routes.fallback", async (listen, root) => {
  await serverEvents.emitAsync("mws.routes.fallback", root, listen.config);
});


declare module "@tiddlywiki/events" {
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

declare module "@tiddlywiki/events" {
  /**
   * - "mws.router.init" event is emitted during "listen.router" after createServerRequest is set by MWS. 
   */
  interface ServerEventsMap {
    "mws.router.init": [router: Router, config: ServerState];
  }

}
declare module "@tiddlywiki/server" {
  interface ServerRequest<
    B extends BodyFormat = BodyFormat,
    M extends string = string,
    D = unknown
  > extends StateObject<B, M, D> { }
}

serverEvents.on("listen.router", async (listen, router) => {
  router.createServerRequest = <B extends BodyFormat>(
    streamer: Streamer, routePath: RouteMatch[], bodyFormat: B
  ) => {
    return new StateObject(streamer, routePath, bodyFormat, router);
  };
  await serverEvents.emitAsync("mws.router.init", router, listen.config);
});


declare module "@tiddlywiki/commander" {
  interface BaseCommand {
    config: ServerState;
    $tw: TW;
  }
}
declare module "@tiddlywiki/server" {
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



declare global {

  /** Awaited Return Type */
  type ART<T extends (...args: any) => any> = Awaited<ReturnType<T>>
  type Complete<T> = { [K in keyof T]-?: T[K] }
  interface ObjectConstructor { keys<T>(t: T): (string & keyof T)[]; }

}
declare global {
  /** helper function which returns the arguments as an array, but typed as a tuple, which is still an array, but positional. */
  function tuple<P extends any[]>(...arg: P): P;
}
(global as any).tuple = function (...args: any[]) { return args; }

declare global {
  /** Helper function which narrows the type to only truthy values */
  function truthy<T>(obj: T): obj is Exclude<T, false | null | undefined | 0 | '' | void>
}
(global as any).truthy = function truthy(obj: any) { return !!obj; }


