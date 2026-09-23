import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
const errs = [];
p.on("pageerror", e => errs.push(String(e).slice(0,300)));
p.on("console", m => { if (m.type()==="error") errs.push(m.text().slice(0,300)); });
await p.goto("http://localhost:5000/wiki/bedienungsanleitung");
await p.waitForTimeout(1500);
const r = await p.evaluate(() => {
  const nodes = document.querySelectorAll("script.tiddlywiki-tiddler-store");
  const out = { nodes: nodes.length };
  if (nodes.length && $tw) {
    try {
      const des = $tw.wiki.deserializeTiddlers("(DOM)", nodes[0]);
      out.deserialized = des.length;
      out.first = des[0] && des[0].fields.title;
    } catch(e) { out.deserializeError = String(e); }
  }
  return out;
});
console.log(JSON.stringify(r,null,1));
console.log("errors:", JSON.stringify(errs.slice(0,4),null,1));
await b.close();
