import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: "/snap/bin/chromium" });
for (const [name, path] of [["bed","/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/Bedienungsanleitung.html"],["empty","/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/empty.html"]]) {
  const page = await browser.newPage();
  await page.goto("file://"+path, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const info = await page.evaluate(() => {
    const pi_core = $tw.wiki.getPluginInfo("$:/core");
    const vanilla = $tw.wiki.getTiddler("$:/themes/tiddlywiki/vanilla");
    return {
      pluginInfo_core: pi_core ? { tiddlersCount: Object.keys(pi_core.tiddlers||{}).length } : null,
      vanillaShadow: $tw.wiki.isShadowTiddler("$:/themes/tiddlywiki/vanilla/base"),
      vanillaTiddler: !!vanilla,
      twFlatTiddler: !!$tw.wiki.getTiddler("$:/plugins/tiddlywiki/tiddlyweb"),
      safeMode: $tw.safeMode,
    };
  });
  console.log("===", name, JSON.stringify(info));
}
await browser.close();
