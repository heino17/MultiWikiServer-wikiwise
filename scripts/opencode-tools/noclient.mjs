import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("file:///home/r2d2/scratch_tw/wiki-noclient.html", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);
const r = await p.evaluate(() => {
  const w=$tw.wiki;
  return {
    total: w.allTitles().length,
    hasStart: w.tiddlerExists("Start"),
    hasConfig: w.tiddlerExists("$:/config/multiwikiclient/recipe"),
  };
});
console.log(JSON.stringify(r));
await b.close();
