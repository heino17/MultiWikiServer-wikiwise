import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
const clicked = await p.evaluate(() => {
  const pill = document.querySelector('.tc-tags-wrapper .tc-tag-label');
  if(!pill) return "no pill";
  pill.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true}));
  return pill.outerHTML.slice(0,200);
});
await p.waitForTimeout(1000);
const out = await p.evaluate(() => {
  const res = {};
  const li = document.querySelector('.tc-tags-wrapper .tc-tag-list-item');
  const reveal = li && li.querySelector('.tc-drop-down');
  res.hidden = reveal ? reveal.getAttribute('hidden') : 'no-reveal';
  res.revealHtml = reveal ? reveal.outerHTML.slice(0,400) : '';
  res.headers = [...document.querySelectorAll('.tc-tag-list-language-heading')].map(e=>e.textContent.trim());
  const groups = [...document.querySelectorAll('.tc-drop-down:not([hidden="true"]) .tc-tagged-draggable-list')].map(l=>[...l.querySelectorAll('a')].map(a=>a.textContent.trim()));
  res.groupSizes = groups.map(g=>g.length);
  res.firstGroup = groups[0] ? groups[0].slice(0,4) : null;
  return res;
});
console.log("clicked:", clicked.slice(0,120));
console.log(JSON.stringify(out,null,1));
await b.close();
