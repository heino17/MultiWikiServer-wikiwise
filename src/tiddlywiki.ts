import { TiddlyWiki, TWBoot } from "tiddlywiki";
import { } from "tiddlywiki/boot/bootprefix";
import { $TW } from "./commands";

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

  // creating a new tiddler with the same title as a shadow tiddler
  // prevents the shadow tiddler from defining modules

  $tw.preloadTiddler({ title: "$:/core/modules/commander.js" })
  $tw.modules.define("$:/core/modules/commander.js", "global", {
    Commander: { initCommands: function () { } },
  });

  // disable the default commander. We'll use our own version of it.
  $tw.preloadTiddler({ title: "$:/core/modules/startup/commands.js" })
  $tw.modules.define("$:/core/modules/startup/commands.js", "startup", {
    name: "commands",
    platforms: ["node"],
    after: ["story"],
    synchronous: true,
    startup: () => { },
  });



  $tw.preloadTiddler({ title: "$:/plugins/tiddlywiki/multiwikiserver/startup.js" })
  $tw.modules.define("$:/plugins/tiddlywiki/multiwikiserver/startup.js", "startup", {
    name: "multiwikiserver",
    platforms: ["node"],
    after: ["load-modules"],
    before: ["story", "commands"],
    synchronous: true,
    startup: () => { },
  });

  // tiddlywiki [+<pluginname> | ++<pluginpath>] [<wikipath>] ...[--command ...args]
  $tw.boot.argv = [
    "++plugins/client",
    "+plugins/tiddlywiki/tiddlyweb",
    "+themes/tiddlywiki/vanilla",
    "+themes/tiddlywiki/snowwhite",
    wikiPath,
  ];

  // use callback to match the type signature
  await new Promise<void>(resolve => $tw.boot.boot(resolve));

  console.log("booted");

  return $tw;

}