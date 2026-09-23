import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: "/snap/bin/chromium" });
for (const [name, path] of [["bed","/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/Bedienungsanleitung.html"],["empty","/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/empty.html"]]) {
  const page = await browser.newPage();
  await page.goto("file://"+path, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const info = await page.evaluate(() => {
    const pluginInfo = $tw.wiki.pluginInfo || {};
    return {
      pluginTitles: Object.keys(pluginInfo).sort().slice(0,40),
      pluginCount: Object.keys(pluginInfo).length,
      coreVersion: $tw.version,
    };
  });
  console.log("===", name, JSON.stringify(info, null, 1));
}
await browser.close();
