import { ok } from "assert";
import { truthy } from "../utils";
import { Commander } from "../commander";

export async function startupCache(commander: Commander) {
  const $tw = commander.$tw;

  const bootTiddlers = $tw.loadTiddlersFromPath($tw.boot.bootPath).flatMap(file => file.tiddlers);
  const coreTiddler = $tw.loadPluginFolder($tw.boot.corePath);
  ok(coreTiddler);

  // map ( title -> content )
  const tiddlerMemoryCache = new Map<string, string>([
    ...bootTiddlers.map(e => e.title && [e.title, JSON.stringify(e)] as const).filter(truthy),
    [coreTiddler.title as string, JSON.stringify(coreTiddler)] as const,
  ]);

  // map ( title -> hash )
  // tiddler cache files are named [hash].json
  const tiddlerFileCache = new Map<string, string>();

  return { tiddlerFileCache, tiddlerMemoryCache };
}

export type CacheState = ART<typeof startupCache>;
