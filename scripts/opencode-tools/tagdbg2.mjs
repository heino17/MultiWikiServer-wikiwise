import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
const r = await p.evaluate(() => {
  const w=$tw.wiki, q=(f)=>w.filterTiddlers(f);
  const s=w.getTiddler("Start");
  return {
    startTags: s.fields.tags,
    startLang: s.fields.lang,
    t: q("[all[tiddlers]tag[Anleitung]]").length,
    t2: q("[all[tiddlers]tags[Anleitung]]").length,
    defaultT: q("[<Start>tagging[]]").length,
    allT: q("[all[tiddlers]]").length,
    anyAnleitung: q("[all[tiddlers]has[tags]get[tags]]").filter(x=>/Anl/.test(x)).slice(0,5),
  };
});
console.log(JSON.stringify(r,null,1));
await b.close();
