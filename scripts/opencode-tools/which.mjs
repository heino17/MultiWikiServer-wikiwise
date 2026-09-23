import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
const r = await p.evaluate(() => {
  const w=$tw.wiki, all=w.allTitles();
  const out={titles:all.map(t=>({t, shadow:w.isShadowTiddler?w.isShadowTiddler(t):undefined}))};
  return out;
});
console.log(JSON.stringify(r,null,1));
await b.close();
