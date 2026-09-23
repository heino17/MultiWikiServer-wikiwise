import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
const logs=[];
p.on("console", m => { const t=m.text(); if (t.includes("WATCH") || t.startsWith("hook")) logs.push(m.type()+": "+t.slice(0,220)); });
await p.addInitScript(() => {
  let installed=false;
  const iv = setInterval(() => {
    if (typeof $tw !== "undefined" && $tw.wiki && !installed) {
      installed = true;
      clearInterval(iv);
      const w=$tw.wiki;
      const origAdd = w.addTiddlers.bind(w);
      w.addTiddlers = function(tids) {
        const n = Array.isArray(tids)?tids.length:(tids&&tids.tiddlers?tids.tiddlers.length:"?");
        const sample = Array.isArray(tids)&&tids[0] ? (tids[0].title||tids[0].fields?.title||"?") : "";
        console.log("hook addTiddlers n="+n+" first="+sample);
        try { return origAdd(tids); } catch(e){ console.log("hook addTiddlers THREW "+e); throw e; }
      };
      const origDel = w.deleteTiddler.bind(w);
      w.deleteTiddler = function(t) { console.log("hook deleteTiddler "+t); return origDel(t); };
    }
  }, 20);
});
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
await p.evaluate(() => { $tw.wiki.addTiddler({title:"Start", text:"x"}); });
console.log("=== hooks captured ===");
console.log(logs.slice(0,40).join("\n"));
await b.close();
