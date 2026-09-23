import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: "/snap/bin/chromium" });
for (const [name, path] of [["bed","/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/Bedienungsanleitung.html"],["empty","/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/empty.html"]]) {
  const page = await browser.newPage();
  await page.goto("file://"+path, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const info = await page.evaluate(() => {
    const titles = $tw.wiki.allTitles();
    const sys = titles.filter(t=>t.startsWith("$:/"));
    return {
      all: titles.length,
      system: sys.length,
      vanillaPlugin: $tw.wiki.getTiddler("$:/themes/tiddlywiki/vanilla") ? "ja" : "fehlt",
      baseCssLen: $tw.wiki.getTiddlerText("$:/themes/tiddlywiki/vanilla/base")?.length ?? "fehlt",
      coreUnpacked: $tw.wiki.getTiddler("$:/core/ui/RootView") ? "ja" : "fehlt",
      storyTiddler: $tw.wiki.getTiddler("$:/StoryList")?.fields.list ?? "(kein list-field)",
      isEncrypted: $tw.wiki.getTiddlerText("$:/isEncrypted"),
    };
  });
  console.log("===", name, JSON.stringify(info));
}
await browser.close();
