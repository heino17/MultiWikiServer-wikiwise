import { TiddlyWiki } from "tiddlywiki";
import { } from "tiddlywiki/boot/bootprefix";
import { dist_resolve } from "./utils";
import { ok } from "node:assert";

declare module "tiddlywiki" {
  interface TWUtils {
    eachAsync: (array: any[], callback: (item: any, index: number) => Promise<void>) => Promise<void>;
  }
  interface TWBoot {

  }
}

export async function bootTiddlyWiki(wikiPath: string) {

  const $tw = TiddlyWiki()

  $tw.utils.eachAsync = eachAsync;

  $tw.boot.boot = async (callback) => {
    // Initialise crypto object
    $tw.crypto = new $tw.utils.Crypto();
    // Initialise password prompter
    if ($tw.browser && !$tw.node) {
      $tw.passwordPrompt = new $tw.utils.PasswordPrompt();
    }
    // Preload any encrypted tiddlers
    await new Promise<void>(resolve =>
      $tw.boot.decryptEncryptedTiddlers(resolve)
    );

    // $tw.boot.startup();
    await new Promise<void>(callback => {
      const options = { callback };
      $tw.boot.initStartup(options);
      $tw.boot.loadStartup(options);
      $tw.boot.execStartup(options);
    });

    callback?.();

  };

  // disable the default commander. We'll use our own version of it.

  // creating a new tiddler with the same title as a shadow tiddler
  // prevents the shadow tiddler from defining modules

  $tw.preloadTiddler({ title: "$:/core/modules/commander.js" })
  $tw.modules.define("$:/core/modules/commander.js", "global", {
    Commander: { initCommands: function () { } },
  });

  $tw.preloadTiddler({ title: "$:/core/modules/startup/commands.js" })
  $tw.modules.define("$:/core/modules/startup/commands.js", "startup", {
    name: "commands",
    platforms: ["node"],
    after: ["story"],
    synchronous: true,
    startup: () => { },
  });


  // tiddlywiki [+<pluginname> | ++<pluginpath>] [<wikipath>] ...[--command ...args]
  $tw.boot.argv = [
    "++" + dist_resolve("../plugins/client"),
    "+plugins/tiddlywiki/tiddlyweb",
    // these are sane defaults, these should be in the recipe
    "+themes/tiddlywiki/vanilla",
    "+themes/tiddlywiki/snowwhite",
    wikiPath, // this should be inert
  ];

  await new Promise<void>(resolve => $tw.boot.boot(resolve));

  // this makes sure boot followed the node path
  ok(!$tw.boot.tasks.readBrowserTiddlers);

  // grab library tiddlers from plugins and load them as regular tiddlers so they get rendered.
  // we can safely do this because we only load our own plugins here.
  const titles = $tw.wiki.filterTiddlers("[all[shadows]is[system]type[application/javascript]library[yes]]");
  titles.forEach(title => { $tw.wiki.addTiddler($tw.wiki.getTiddler(title)!); })

  return $tw;

}