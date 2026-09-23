import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
p.on("console", m => {});
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
const r = await p.evaluate(() => {
  const out = {};
  for (const t of $tw.wiki.getTiddlers()) {
    const l = t.toLowerCase();
    if (l.includes("multiwikiclient")) out[t] = ($tw.wiki.getTiddler(t).fields.text || "").slice(0,40);
  }
  return out;
});
for (const [k,v] of Object.entries(r)) console.log(k, "=>", JSON.stringify(v));
await b.close();
