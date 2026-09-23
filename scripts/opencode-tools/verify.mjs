import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
const reqs=[];
p.on("request", r => { const u=r.url(); if (u.includes("/recipe/") && !u.includes("plugin.js")) reqs.push(u.replace("http://localhost:5000","")); });
const errs=[];
p.on("console", m => { if (m.type()==="error" || m.text().toLowerCase().includes("sync")) errs.push(m.type()+": "+m.text().slice(0,120)); });
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
const r = await p.evaluate(() => {
  const w=$tw.wiki, all=w.allTitles();
  return {
    total: all.length,
    hasStart: w.tiddlerExists("Start"),
    hasUebersicht: w.tiddlerExists("Übersicht"),
    recipe: w.getTiddlerText("$:/config/multiwikiclient/recipe","<MISSING>"),
    host: w.getTiddlerText("$:/config/multiwikiclient/host","<MISSING>"),
    lastSeq: w.getTiddlerText("$:/state/multiwikiclient/recipe/last_revision_id","0"),
    defaultTiddlers: w.getTiddlerText("$:/DefaultTiddlers","<none>"),
    anyStart: w.tiddlerExists("Start"),
    frameText: (document.body.innerText||"").slice(0,60),
  };
});
console.log(JSON.stringify(r,null,1));
console.log("recipe reqs:", JSON.stringify(reqs));
console.log("errs:", JSON.stringify(errs.slice(0,6)));
await b.close();
