
import * as fs from "fs";
import * as path from "path";
import { TW } from "tiddlywiki";
import { importPlugins } from "./importPlugins";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "fs/promises";
import { dist_resolve, truthy } from "@tiddlywiki/server";
import { Readable, Writable } from "stream";
import { x as extractTar } from 'tar'
import { createGunzip } from "zlib";
import { pipeline } from "stream/promises";
import { bootTiddlyWiki } from "../services/tiddlywiki";
import { Debug } from "@prisma/client/runtime/client";
import { loadWikiTiddlers } from "./importEditions";
import { thrower } from "../new-managers";
import { PluginCache } from "./PluginCache";
import { getTW5Paths, startupValidateTW5Folder } from "./UpdateTiddlyWiki";
export * from "./importPlugins";
export * from "./importEditions";
export * from "./PluginCache";

export const requiredPlugins = [
  "$:/plugins/mws/client",
  "$:/themes/tiddlywiki/snowwhite",
  "$:/themes/tiddlywiki/vanilla",
];

const debug = Debug("mws:cache");

interface TW5RegistryInfo {
  _id: string;
  _rev: string;
  _etag?: string | null;
  _modified?: string | null;
  versions: Record<string, any>;
  "dist-tags": { latest: string; };
}


export async function bootDefaultTiddlyWiki(wikiPath: string) {
  const e = (await getTW5Paths(wikiPath)).pop()!;
  const twPath = path.resolve(wikiPath, "tw5", e.name);
  const { TiddlyWiki } = require(path.resolve(twPath, "boot/boot.js"));
  return await bootTiddlyWiki(wikiPath, TiddlyWiki);
}

export async function bootTiddlyWikiVersion(wikiPath: string, version: string) {
  const twPath = path.resolve(wikiPath, "tw5", version);
  if (!fs.existsSync(twPath))
    throw new Error("TiddlyWiki version " + version + " is not installed");
  const { TiddlyWiki } = require(path.resolve(twPath, "boot/boot.js"));
  return await bootTiddlyWiki(wikiPath, TiddlyWiki);
}

export async function startupCache(wikiPath: string, cacheArrayStrings: readonly string[]) {
  const cachePath = path.resolve(wikiPath, "cache");
  fs.mkdirSync(cachePath, { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(dist_resolve("../package.json"), "utf8"));
  Object.seal(cacheArrayStrings);

  await startupValidateTW5Folder(wikiPath);
  const versions = await getTW5Paths(wikiPath)
  const cache = new PluginCache(wikiPath, cacheArrayStrings, versions.map(e => e.name));


  for (const e of versions) {
    const $tw = await bootTiddlyWikiVersion(wikiPath, e.name);

    // we only need the client since we don't load plugins server-side
    const { pluginPaths } = await importPlugins($tw, wikiPath, cacheArrayStrings, cache.pluginHashes, pkg.version);

    for (const plugin of pluginPaths) {
      cache.pluginPaths.set(plugin.version, plugin.title, plugin.path);
      cache.pluginPathsInfo.set(plugin.path, plugin);
    }

    const tw5Docs = loadWikiTiddlers($tw, path.resolve($tw.boot.corePath, "../editions/tw5.com"), []);

    const result = $tw.wiki.renderTiddler(
      "text/plain",
      "$:/core/templates/tiddlywiki5.html",
      // the boot and library tiddlers get rendered into the page
      // this list gets saved in the store array
      // we have to render at least one tiddler
      { variables: { saveTiddlerFilter: "$:/SplashScreen" } }
    );


    await writeFile(path.resolve(cachePath, "tiddlywiki", $tw.version, "tiddlywiki5.html"), result);

    const cacheTW5Docs = {
      plugins: [
        "$:/core",
        ...tw5Docs[0].plugins.map(folder =>
          cache.pluginPathsInfo.get(path.join("tiddlywiki", $tw.version, folder).replaceAll("\\", "/"))?.title
          ?? thrower(new Error("couldn't find the tw5 plugin " + folder))
        )
      ],
      tiddlers: tw5Docs[0].tiddlers,
      version: $tw.version,
    };

    await writeFile(path.resolve(cachePath, "tiddlywiki", $tw.version, "docs.json"), JSON.stringify(cacheTW5Docs));

  }

  return cache;

}
