import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
const r = await p.evaluate(() => {
  const node = document.querySelector("script.tiddlywiki-tiddler-store");
  const des = $tw.wiki.deserializeTiddlers("(DOM)", node);
  const before = new Set($tw.wiki.allTitles());
  const added = [];
  const skipped = [];
  for (const f of des) {
    const title = f.title || (f.fields && f.fields.title);
    if (before.has(title)) skipped.push(title);
    else added.push(title);
  }
  $tw.wiki.addTiddlers(des);
  const afterAdd = new Set($tw.wiki.allTitles());
  const stillMissing = des.map(f=>f.title||f.fields?.title).filter(t=>!afterAdd.has(t));
  return {
    desCount: des.length,
    alreadyPresent: skipped,
    added: added.length,
    afterAddTotal: afterAdd.size,
    stillMissingAfterAdd: stillMissing,
  };
});
console.log(JSON.stringify(r,null,1));
await b.close();
