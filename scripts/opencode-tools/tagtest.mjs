import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
let ok = false;
try {
  await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const tagOn = await p.evaluate(() => {
    const e = document.querySelector('.tc-tags-wrapper .tc-tag-list-item');
    return e ? e.textContent.trim() : null;
  });
  const out = await p.evaluate(() => {
    const results = {};
    // find the "Anleitung" pill and click its inner button via the state popup reveal
    const pillBtn = [...document.querySelectorAll('.tc-tags-wrapper .tc-tag-list-item button, .tc-tags-wrapper .tc-tag-list-item a')].find(b => /Anleitung/.test(b.textContent||""));
    if (pillBtn) { pillBtn.click(); }
    return new Promise(res => setTimeout(() => {
      const dd = document.querySelector('.tc-drop-down');
      results.dropdownOpen = !!dd;
      results.headers = dd ? [...dd.querySelectorAll('.tc-tag-list-language-heading')].map(e=>e.textContent.trim()) : [];
      results.deItems = dd ? [...dd.querySelectorAll('.tc-tagged-draggable-list')].map(l=>[...l.querySelectorAll('a')].map(a=>a.getAttribute('href')||a.textContent.trim())) : [];
      results.allLinks = dd ? [...dd.querySelectorAll('.tc-tagged-draggable-list a')].map(a=>a.textContent.trim()) : [];
      res(results);
    }, 900));
  });
  console.log("tagOn:", JSON.stringify(tagOn));
  console.log("dropdown:", JSON.stringify(out, (k,v)=>v && v.length && v.length>30 ? v.length : v, 1));
} catch(e) { console.log("ERR", e.message); ok=true; }
await b.close();
