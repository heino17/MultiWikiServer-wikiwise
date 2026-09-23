import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
const r = await p.evaluate(() => {
  const w=$tw.wiki;
  return {
    tagTempl: w.getTiddlerText("$:/core/ui/TagTemplate","<none>").slice(0,80),
    styles: w.tiddlerExists("$:/TagLanguageStyles"),
    de: w.filterTiddlers("[<Anleitung>tagging[]lang[de]]").length,
    en: w.filterTiddlers("[<Anleitung>tagging[]lang[en]]").length,
    tagging: w.filterTiddlers("[<Anleitung>tagging[]]").length,
    deFirst: w.filterTiddlers("[<Anleitung>tagging[]lang[de]first[]]").join(","),
    sampleLang: w.getTiddler("Start").fields.lang,
  };
});
console.log(JSON.stringify(r,null,1));
await b.close();
