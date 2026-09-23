import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("file:///home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/empty.html", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(4000);
const r = await p.evaluate(() => ({
  total: $tw.wiki.getTiddlers().length,
  hasStarter: $tw.wiki.tiddlerExists("$:/DefaultTiddlers") || $tw.wiki.tiddlerExists("GettingStarted"),
}));
console.log(JSON.stringify(r));
await b.close();
