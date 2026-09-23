import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(800);
const r = await p.evaluate(() => {
  const all = $tw.wiki.getTiddlers();
  const has = t => all.includes(t);
  const pre = ($tw.preloadTiddlers||[]).map(x=>x.title||x.fields?.title || "?");
  return {
    total: all.length,
    hasStart: has("Start"),
    hasUebersicht: has("Übersicht"),
    preloadCnt: pre.length,
    preloadSample: pre.slice(0,6),
    preloadHasConfig: pre.includes("$:/config/multiwikiclient/recipe"),
  };
});
console.log(JSON.stringify(r, null, 1));
await b.close();
