import { ok } from "assert";
import { dist_resolve, truthy, ZodAssert } from "../utils";
import { Commander } from "../commander";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { TW } from "tiddlywiki";

export async function startupCache(rootRoute: rootRoute, commander: Commander) {
  const $tw = commander.$tw;

  // we only need the client since we don't load plugins server-side
  // console.log(commander.siteConfig.enablePluginCache);

  const { tiddlerFiles, tiddlerHashes } = commander.siteConfig.enablePluginCache
    ? await importTW5(path.join($tw.boot.corePath, ".."), commander.cachePath, "client", $tw)
    : { tiddlerFiles: new Map(), tiddlerHashes: new Map() };

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
      reqpath: state.pathParams.plugin + "/plugin.js"
    });

  })

  return { tiddlerFiles, tiddlerHashes };
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
  // <script
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
      if (type === "server") {
        plugin.tiddlers = JSON.parse(plugin.text).tiddlers;
        delete plugin.text;
        fs.writeFileSync(path.join(newPath, "plugin.info"), JSON.stringify(plugin));
      } else if (type === "client") {
        let js = Buffer.from(`$tw.preloadTiddler(${JSON.stringify(plugin)});`, "utf8");
        let hash = crypto.createHash("sha384").update(js).digest("base64");
        fs.writeFileSync(path.join(newPath, "plugin.js"), js);
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
