import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
const reqs=[];
p.on("request", r => { const u=r.url(); if (u.includes("recipe/") ) reqs.push(u); });
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);
const r = await p.evaluate(() => {
  const w = $tw.wiki;
  const all = w.allTitles();
  return {
    count: all.length,
    hasStart: all.includes("Start"),
    hasUebersicht: all.includes("Übersicht"),
    hasGettingStarted: all.includes("GettingStarted"),
    recipe: w.getTiddlerText("$:/config/multiwikiclient/recipe","<MISSING>"),
    host: w.getTiddlerText("$:/config/multiwikiclient/host","<MISSING>"),
    lastSeq: w.getTiddlerText("$:/state/multiwikiclient/recipe/last_revision_id","0"),
    siteTitle: w.getTiddlerText("$:/SiteTitle","<none>"),
    defaultTiddlers: w.getTiddlerText("$:/DefaultTiddlers","<none>"),
  };
});
console.log(JSON.stringify(r,null,1));
console.log("recipe reqs:", JSON.stringify(reqs.map(u=>u.replace(/^.*?5000/,"")).slice(0,6)));
await b.close();
