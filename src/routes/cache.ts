import { dist_resolve, ZodAssert } from "../utils";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import { TW } from "tiddlywiki";
import { SiteConfig } from "../ServerState";
import { gunzip, gunzipSync, gzipSync } from "zlib";

const prefix = Buffer.from(`$tw.preloadTiddler(`, "utf8");
const suffix = Buffer.from(`);`, "utf8");

export async function startupCache($tw: TW, cachePath: string) {


  // we only need the client since we don't load plugins server-side
  const { tiddlerFiles: pluginFiles, tiddlerHashes: pluginHashes } =
    await importPlugins(path.join($tw.boot.corePath, ".."), cachePath, "client", $tw,);

  const filePlugins = new Map([...pluginFiles.entries()].map(e => e.reverse() as [string, string]));

  const requiredPlugins = [
    "$:/plugins/mws/client",
    "$:/themes/tiddlywiki/snowwhite",
    "$:/themes/tiddlywiki/vanilla",
  ];

  const result = $tw.wiki.renderTiddler("text/plain", "$:/core/templates/tiddlywiki5.html", {
    variables: {
      // the boot and library tiddlers get rendered into the page
      // this list gets saved in the store array
      // we have to render at least one tiddler
      saveTiddlerFilter: "$:/SplashScreen"
    }
  });

  const filepath = path.resolve(cachePath, "tiddlywiki5.html")

  fs.writeFileSync(filepath, result);

  return {
    pluginFiles, pluginHashes, filePlugins,
    requiredPlugins, cachePath,
    prefix, suffix,
  };
}

export async function registerCacheRoutes(rootRoute: rootRoute, config: SiteConfig) {

  rootRoute.defineRoute({
    method: ["GET", "HEAD"],
    path: /^\/\$cache\/(.*)\/plugin\.js$/,
    bodyFormat: "ignore",
    pathParams: ["plugin"]
  }, async state => {
    ZodAssert.pathParams(state, z => ({ plugin: z.string() }));
    state.setHeader("Content-Type", "application/javascript");
    // state.setHeader("Content-Encoding", "gzip");
    return state.sendFile(200, {}, {
      root: path.join(config.wikiPath, "cache"),
      reqpath: state.pathParams.plugin + "/plugin.js",
    });

  })
}


async function importPlugins(twFolder: string, cacheFolder: string, type: string, $tw: TW) {


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
    const relativePluginPath = path.join("tiddlywiki", path.relative(twFolder, oldPath));
    return [oldPath, relativePluginPath] as const;
  });

  plugins.push([
    dist_resolve("../plugins/client"),
    "tiddlywiki/plugins/mws/client"
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

  const pluginsList: any[] = [];
  const tiddlerFiles = new Map<string, string>();
  const tiddlerHashes = new Map<string, string>();

  plugins.forEach(([oldPath, relativePluginPath]) => {
    const plugin = $tw.loadPluginFolder(oldPath);
    const newPath = path.join(cacheFolder, relativePluginPath);
    fs.mkdirSync(newPath, { recursive: true });
    if (plugin && plugin.title && plugin.text) {
      // need to compare sizes of various configurations

      // plugin.text = JSON.stringify(JSON.parse(plugin.text as string));
      Object.keys(plugin).forEach(e => {
        if (plugin[e] !== undefined && typeof plugin[e] !== "string") {
          // before, this was handled by the database making sure all field values were strings
          plugin[e] = `${plugin[e]}`;
          if (process.env.ENABLE_DEV_SERVER)
            console.log(`DEV: Tiddler ${plugin.title} field ${e} was not a string`)
        }
      });

      if (type === "server") {
        plugin.tiddlers = JSON.parse(plugin.text).tiddlers;
        delete plugin.text;
        fs.writeFileSync(path.join(newPath, "plugin.info"), JSON.stringify(plugin));
      } else if (type === "client") {
        const json = Buffer.from(JSON.stringify(plugin).replace(/<\//gi, "\\u003c/"), "utf8");
        fs.writeFileSync(path.join(newPath, "plugin.json"), json);
        const js = Buffer.concat([prefix, json, suffix]);
        const hash = crypto.createHash("sha384").update(js).digest("base64");
        // const gz = gzipSync(js, { level: 4, memLevel: 4 });
        // const js2 = gunzipSync(gz);
        // const hash2 = crypto.createHash("sha384").update(js2).digest("base64");
        // if(hash !== hash2) throw "hash not match";
        fs.writeFileSync(path.join(newPath, "plugin.js"), js);
        tiddlerFiles.set(plugin.title, relativePluginPath);
        tiddlerHashes.set(plugin.title, "sha384-" + hash);
        pluginsList.push({ title: plugin.title, path: relativePluginPath, hash });
      }
    } else {
      console.log("Info: No plugin found at", oldPath);
    }
  });

  fs.writeFileSync(path.join(cacheFolder, "tiddlywiki-plugins.json"), JSON.stringify(pluginsList, null, 2));

  return { tiddlerFiles, tiddlerHashes };

}


export type CacheState = ART<typeof startupCache>;
