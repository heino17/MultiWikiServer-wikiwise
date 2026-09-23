import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
await p.evaluate(() => {
  document.querySelector('.tc-tags-wrapper .tc-tag-label').dispatchEvent(new MouseEvent('click',{bubbles:true}));
});
await p.waitForTimeout(1000);
const out = await p.evaluate(() => {
  const headers=[...document.querySelectorAll('.tc-tag-list-language-heading')].map(e=>e.textContent.trim());
  const groups=[...document.querySelectorAll('.tc-drop-down:not([hidden="true"]) .tc-tagged-draggable-list')].map(l=>[...l.querySelectorAll('a')].map(a=>a.textContent.trim()));
  return { headers, groupSizes: groups.map(g=>g.length),
           de: groups[0]||[], en: groups[1]||[] };
});
console.log(JSON.stringify(out,(k,v)=>Array.isArray(v)&&v.length>8?`[${v.length}]: `+v.slice(0,8).join(", "):v,1));
await b.close();
