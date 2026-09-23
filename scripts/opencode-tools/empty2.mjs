import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
const logs=[];
p.on("console", m => logs.push(m.type()+": "+m.text().slice(0,220)));
p.on("pageerror", e => logs.push("PAGEERROR: "+String(e).slice(0,300)));
p.on("requestfailed", r => logs.push("REQFAIL: "+r.url().slice(0,80)+" "+(r.failure()&&r.failure().errorText)) );
await p.goto("file:///home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/empty.html", { waitUntil: "load" });
await p.waitForTimeout(2500);
const r = await p.evaluate(() => ({
  hasTw: typeof $tw !== "undefined",
  storeNodes: document.querySelectorAll("script.tiddlywiki-tiddler-store, #storeArea, div#storeArea").length,
  storeLen: document.querySelectorAll("script.tiddlywiki-tiddler-store").length,
  preload: $tw ? ($tw.preloadTiddlers||[]).length : null,
  status: $tw ? (($tw.boot && $tw.boot.status)||{}).message : null,
}));
console.log(JSON.stringify(r,null,1));
console.log("=== logs ===");
console.log(logs.slice(0,20).join("\n"));
await b.close();
