import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
const r = await p.evaluate(() => {
  const w=$tw.wiki, q=f=>w.filterTiddlers(f).length;
  return {
    a_all: q("[all[tiddlers]]"),
    a_tag: q("[all[tiddlers]tag[Anleitung]]"),
    a_tagging: q("[Anleitung]tagging[]"),
    a_tagging2: q("[!is[system]tagging[]]"),
  };
});
console.log(JSON.stringify(r));
await b.close();
