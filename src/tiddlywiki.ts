import { TiddlyWiki } from "tiddlywiki";
import { $TW } from "./commands";

export async function bootTiddlyWiki(wikiPath: string) {

  const $tw = TiddlyWiki() as any;

  $tw.utils.eachAsync = eachAsync;

  $tw.boot.boot = async () => {
    // Initialise crypto object
    $tw.crypto = new $tw.utils.Crypto();
    // Initialise password prompter
    if ($tw.browser && !$tw.node) {
      $tw.passwordPrompt = new $tw.utils.PasswordPrompt();
    }
    // Preload any encrypted tiddlers
    await new Promise(resolve => $tw.boot.decryptEncryptedTiddlers(resolve));

    // $tw.boot.startup();
    await new Promise(callback => {
      const options = { callback };
      $tw.boot.initStartup(options);
      $tw.boot.loadStartup(options);
      $tw.boot.execStartup(options);
    });

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
    startup: () => {},
  });



  $tw.preloadTiddler({ title: "$:/plugins/tiddlywiki/multiwikiserver/startup.js" })
  $tw.modules.define("$:/plugins/tiddlywiki/multiwikiserver/startup.js", "startup", {
    name: "multiwikiserver",
    platforms: ["node"],
    after: ["load-modules"],
    before: ["story", "commands"],
    synchronous: true,
    startup: () => {},
  });

  // tiddlywiki [+<pluginname> | ++<pluginpath>] [<wikipath>] ...[--command ...args]
  $tw.boot.argv = [
    "++plugins/client",
    "+themes/tiddlywiki/vanilla",
    wikiPath,
  ];

  await $tw.boot.boot();

  console.log("booted");

  return $tw as $TW;

}