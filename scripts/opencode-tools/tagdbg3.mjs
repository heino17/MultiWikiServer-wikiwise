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
    tagging: w.filterTiddlers("[Anleitungtagging[]]").length,
    de: w.filterTiddlers("[Anleitungtagging[]lang[de]]").length,
    en: w.filterTiddlers("[Anleitungtagging[]lang[en]]").length,
  };
});
console.log("filters:", JSON.stringify(r));
await p.waitForTimeout(400);
// click first Anleitung pill in the story/start tiddler
const clicked = await p.evaluate(() => {
  const pill = [...document.querySelectorAll('.tc-tag-list-item button, .tc-tag-list-item a')].find(el=>/Anleitung/.test(el.textContent||""));
  if(!pill) return null;
  pill.click(); return pill.textContent.trim();
});
console.log("clicked:", clicked);
await p.waitForTimeout(1200);
const out = await p.evaluate(() => {
  const res={};
  const dd = [...document.querySelectorAll('.tc-drop-down')].filter(el => el.querySelector('.tc-tagged-draggable-list')).pop();
  res.found = !!dd;
  if (dd) {
    res.headers = [...dd.querySelectorAll('.tc-tag-list-language-heading')].map(e=>e.textContent.trim());
    const groups = [...dd.querySelectorAll('.tc-tagged-draggable-list')].map(l => [...l.querySelectorAll('a')].map(a=>a.textContent.trim()));
    res.groupSizes = groups.map(g=>g.length);
    res.sample = groups.map(g=>g.slice(0,3));
  }
  return res;
});
console.log("dropdown:", JSON.stringify(out,null,1));
await b.close();
