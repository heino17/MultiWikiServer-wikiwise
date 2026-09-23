import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
const errs=[];
p.on("pageerror", e => errs.push(String(e).slice(0,200)));
await p.goto("http://localhost:5000/wiki/bedienungsanleitung");
await p.waitForTimeout(1200);
const r = await p.evaluate(() => {
  const out = {status: ($tw.boot.status && $tw.boot.status.message) || "",
               wikiTiddlers: $tw.wiki.getTiddlers().length};
  const node = document.querySelector("script.tiddlywiki-tiddler-store");
  try {
    const des = $tw.wiki.deserializeTiddlers("(DOM)", node);
    out.desType = Object.prototype.toString.call(des);
    out.des0 = des[0] && {title: des[0].title || des[0].fields && des[0].fields.title,
                          hasFields: !!(des[0].fields)};
    try { $tw.wiki.addTiddlers(des); out.added = true; out.after = $tw.wiki.getTiddlers().length; }
    catch(e){ out.addError = String(e); }
  } catch(e){ out.desError = String(e); }
  return out;
});
console.log(JSON.stringify(r,null,1));
console.log("pageerrors:", JSON.stringify(errs,null,1));
await b.close();
