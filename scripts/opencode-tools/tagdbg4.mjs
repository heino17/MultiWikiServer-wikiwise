import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
const html = await p.evaluate(() => {
  const e = [...document.querySelectorAll('.tc-tags-wrapper')].map(x=>x.outerHTML.slice(0,1200));
  return e.join("\n----\n");
});
console.log(html.slice(0, 3000));
await b.close();
