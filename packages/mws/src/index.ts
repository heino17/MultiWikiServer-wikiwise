import * as opaque from "@serenity-kit/opaque";
import { serverEvents, runCLI } from "@tiddlywiki/server";
import { existsSync, writeFileSync, readFileSync } from "fs";
import * as path from "path";
import { TW } from "tiddlywiki";
import { ServerState } from "./ServerState";
import { startupCache } from "./services/cache";
import { createPasswordService } from "./services/PasswordService";
import { bootTiddlyWiki } from "./services/tiddlywiki";

serverEvents.on("cli.execute.before", async (name, params, options, instance) => {
  const wikiPath = process.cwd();
  if (!existsSync(wikiPath)) throw "The wiki path does not exist";
  const $tw = await bootTiddlyWiki(wikiPath);
  const passwordService = await createPasswordService(readPasswordMasterKey(wikiPath));
  const cache = await startupCache($tw, path.resolve(wikiPath, "cache"));
  const config = new ServerState(wikiPath, $tw, passwordService, cache);
  serverEvents.emitAsync("server.init.before", config, $tw);
  await config.init();
  serverEvents.emitAsync("server.init.after", config, $tw);
  instance.serverState = config;
  instance.$tw = $tw;
});

declare module "@tiddlywiki/server" {
  export interface BaseCommand {
    serverState: ServerState;
    $tw: TW;
  }
  interface ServerEventsMap {
    "server.init.before": [config: ServerState, $tw: TW];
    "server.init.after": [config: ServerState, $tw: TW];
  }
}

export function readPasswordMasterKey(wikiPath: string) {
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

runCLI().catch(console.log);
