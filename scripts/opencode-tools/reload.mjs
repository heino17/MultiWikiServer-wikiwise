import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
const logs=[];
p.on("console", m => logs.push(m.type()+": "+m.text().slice(0,180)));
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
const r = await p.evaluate(() => {
  const w=$tw.wiki;
  const before = w.allTitles().length;
  const markerExists = !!document.querySelector("script.tiddlywiki-tiddler-store");
  let afterRun = false, startAfterRun = false, err=null;
  try {
    $tw.loadTiddlersBrowser();
    $tw.wiki.addTiddlers($tw.preloadTiddlers||[]);
    afterRun = w.allTitles().length;
    startAfterRun = w.tiddlerExists("Start");
    const rec = w.getTiddlerText("$:/config/multiwikiclient/recipe","<MISSING>");
  } catch(e) { err=String(e); }
  return {
    before,
    markerExists,
    afterRun,
    startAfterRun,
    err,
    preload: ($tw.preloadTiddlers||[]).length,
    recipe: w.getTiddlerText("$:/config/multiwikiclient/recipe","<MISSING>"),
    keywords: {mwc: w.allTitles().filter(t=>t.includes("multiwikiclient")).length},
  };
});
console.log(JSON.stringify(r,null,1));
console.log("=== tail logs ===");
console.log(logs.slice(-12).join("\n"));
await b.close();
