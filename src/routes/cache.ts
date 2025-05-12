import { ok } from "assert";
import { dist_resolve, truthy, ZodAssert } from "../utils";
import { Commander } from "../commander";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { TW } from "tiddlywiki";

const prefix = Buffer.from(`$tw.preloadTiddler(`, "utf8");
const suffix = Buffer.from(`);`, "utf8");

export async function startupCache(rootRoute: rootRoute, commander: Commander) {
  const $tw = commander.$tw;

  // we only need the client since we don't load plugins server-side
  const { tiddlerFiles: pluginFiles, tiddlerHashes: pluginHashes } =
    await importTW5(path.join($tw.boot.corePath, ".."), commander.cachePath, "client", $tw);

  const filePlugins = new Map([...pluginFiles.entries()].map(e => e.reverse() as [string, string]));

  rootRoute.defineRoute({
    method: ["GET", "HEAD"],
    path: /^\/\$cache\/(.*)\/plugin\.js$/,
    bodyFormat: "ignore",
    pathParams: ["plugin"]
  }, async state => {
    ZodAssert.pathParams(state, z => ({
      plugin: z.string()
    }))
    // console.log("serving plugin", state.pathParams.plugin)
    return state.sendFile(200, {}, {
      root: commander.cachePath,
      reqpath: state.pathParams.plugin + "/plugin.json",
      prefix,
      suffix,
    });

  })

  return { pluginFiles, pluginHashes, filePlugins, cacheFolder: commander.cachePath, prefix, suffix };
}




async function importTW5(twFolder: string, cacheFolder: string, type: string, $tw: TW) {


  const readLevel = (d: string) => {
    return (fs.readdirSync(path.join(twFolder, d)))
      .filter(e => !$tw.boot.excludeRegExp.test(e))
      .map(e => path.join(d, e));
  }

  const plugins = [
    ...[
      ...[
        'plugins', 'themes'
      ].flatMap(readLevel),
      'languages'
    ].flatMap(readLevel),
    'core'
  ].map(e => {
    const oldPath = path.join(twFolder, e);
    const relativePluginPath = path.normalize(path.relative(twFolder, oldPath));
    return [oldPath, relativePluginPath] as const;
  });

  plugins.push([
    dist_resolve("../plugins/client"),
    "plugins/mws/client"
  ] as const);

  // plugins.forEach(oldPath => {
  //   console.log(oldPath);
  //   const relativePluginPath = path.normalize(path.relative(twFolder, oldPath));
  //   console.log(relativePluginPath);
  //   const newPath = path.join(cacheFolder, relativePluginPath);
  //   console.log(newPath);
  //   console.log();
  // });


  // it is recommended to add <link rel="preload" to the header since these cannot be deferred
  // <link rel="preload" href="main.js" as="script" />

  // and recommended to specify the hashes for each file in their script tag. 
  // <cript
  //   src="https://example.com/example-framework.js"
  //   integrity="sha384-oqVuAfXRKap7fdgcCY5uykM6+R9GqQ8K/uxy9rx7HNQlGYl1kPzQho1wx4JwY8wC"
  //   crossorigin="anonymous"></script>

  // this needs to be added to the tiddlywiki file before the script tags
  // $tw = Object.create(null);
  // $tw.preloadTiddlers = $tw.preloadTiddlers || [];
  // $tw.preloadTiddler = function(fields) {
  //   $tw.preloadTiddlers.push(fields);
  // };

  const hashes: any = {};
  const tiddlerFiles = new Map<string, string>();
  const tiddlerHashes = new Map<string, string>();

  plugins.forEach(([oldPath, relativePluginPath]) => {
    const plugin = $tw.loadPluginFolder(oldPath);
    const newPath = path.join(cacheFolder, relativePluginPath);
    fs.mkdirSync(newPath, { recursive: true });
    if (plugin && plugin.title) {
      // need to compare sizes of various configurations
      plugin.text = JSON.stringify(JSON.parse(plugin.text as string));
      Object.keys(plugin).forEach(e => {
        if (plugin[e] !== undefined && typeof plugin[e] !== "string") {
          // before, this was handled by the database making sure all field values were strings
          plugin[e] = `${plugin[e]}`;
          if (process.env.ENABLE_DEV_SERVER)
            console.log(`DEV: Tiddler ${plugin.title} field ${e} was not a string`)
        }
      })
      if (type === "server") {
        plugin.tiddlers = JSON.parse(plugin.text).tiddlers;
        delete plugin.text;
        fs.writeFileSync(path.join(newPath, "plugin.info"), JSON.stringify(plugin));
      } else if (type === "client") {
        const json = Buffer.from(JSON.stringify(plugin).replace(/<\//gi, "\\u003c/"), "utf8");
        const js = Buffer.concat([prefix, json, suffix]);
        let hash = crypto.createHash("sha384").update(js).digest("base64");
        fs.writeFileSync(path.join(newPath, "plugin.json"), json);
        tiddlerFiles.set(plugin.title, relativePluginPath);
        tiddlerHashes.set(plugin.title, "sha384-" + hash);
      }
    } else {
      console.log("Info: No plugin found at", oldPath);
    }
  });

  fs.writeFileSync(path.join(cacheFolder, "hashes.json"), JSON.stringify(hashes, null, 2));

  return { tiddlerFiles, tiddlerHashes };

}


export type CacheState = ART<typeof startupCache>;
