import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(4000);
const r = await p.evaluate(() => {
  const bt = $tw.boot;
  return {
    status: bt.status && bt.status.message,
    statusError: bt.status && bt.status.error && String(bt.status.error).slice(0,300),
    tasks: bt.tasks,
    executedStartupModules: Object.keys(bt.executedStartupModules || {}).slice(0,30),
    disabledStartupModules: bt.disabledStartupModules,
    wikiTiddlers: $tw.wiki.getTiddlers().length,
  };
});
console.log(JSON.stringify(r,null,1));
await b.close();
