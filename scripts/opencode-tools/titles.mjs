import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
const r = await p.evaluate(() => {
  const t = $tw.wiki.getTiddlers();
  return {
    count: t.length,
    titles: t.slice(0,60),
    storeScripts: (()=>{let n=0; for(const el of document.querySelectorAll("script")) n++; return {
      all: n,
      stores: document.querySelectorAll("script.tiddlywiki-tiddler-store").length,
      jsonType: document.querySelectorAll('script[type="application/json"]').length,
    };})(),
  };
});
console.log(JSON.stringify(r,null,1));
await b.close();
