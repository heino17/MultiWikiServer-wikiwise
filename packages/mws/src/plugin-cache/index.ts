
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

export async function getTW5Paths(wikiPath: string) {
  if (!fs.existsSync(path.resolve(wikiPath, "tw5"))) {
    throw new Error("You need to run update-tiddlywiki first");
  }
  const folders = (await Promise.all((await readdir(path.resolve(wikiPath, "tw5"))).map(async e => {
    const s = await stat(path.resolve(wikiPath, "tw5", e));
    if (!s.isDirectory()) return;
    const t = /^tw5-5\.([0-9]+)\.([0-9]+)(.*)/.exec(e);
    if (!t) return;
    const [, minor, patch, extra] = t;
    const name = `tw5-5.${minor}.${patch}${extra}`;
    return { minor, patch, extra, name };
  }))).filter(truthy).sort((a, b) => {
    return +a.minor - +b.minor
      || +a.patch - +b.patch
      || a.extra.localeCompare(b.extra);
  });

  if (!folders.length) {
    throw new Error("No valid tiddlywiki folder found");
  }

  await writeFile(
    path.resolve(wikiPath, "tw5", "versions.txt"),
    folders.map(e => `tw5-5.${e.minor}.${e.patch}${e.extra}`).join("\n")
  );

  return folders;
}

export async function bootDefaultTiddlyWiki(wikiPath: string) {
  const e = (await getTW5Paths(wikiPath)).pop()!;
  const twPath = path.resolve(wikiPath, "tw5", `tw5-5.${e.minor}.${e.patch}${e.extra}`);
  const { TiddlyWiki } = require(path.resolve(twPath, "boot/boot.js"));
  return await bootTiddlyWiki(wikiPath, TiddlyWiki);
}

export async function startupCache(wikiPath: string, cacheArrayStrings: readonly string[]) {
  const cachePath = path.resolve(wikiPath, "cache");
  fs.mkdirSync(cachePath, { recursive: true });
  const pkg = JSON.parse(fs.readFileSync(dist_resolve("../package.json"), "utf8"));
  Object.seal(cacheArrayStrings);

  const cache = new PluginCache(wikiPath, cacheArrayStrings);

  for (const e of await getTW5Paths(wikiPath)) {
    const tw5path = path.resolve(wikiPath, "tw5", `tw5-5.${e.minor}.${e.patch}${e.extra}`);
    const { TiddlyWiki } = require(path.resolve(tw5path, "boot/boot.js"));
    const $tw = await bootTiddlyWiki(wikiPath, TiddlyWiki);

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

    cache.versions.add($tw.version);

  }

  return cache;

}
