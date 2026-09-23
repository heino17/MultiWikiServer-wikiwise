import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);
const r = await p.evaluate(() => ({
  storyRiverChildren: (document.querySelector("#storyRiver, .tc-story-river")||{} ).children ? document.querySelectorAll("#storyRiver *, .tc-story-river *").length : -1,
  frames: document.querySelectorAll(".tc-tiddler-frame").length,
  bodyText: (document.body.innerText||"").slice(0,200),
  missingMsg: document.body.innerText && document.body.innerText.includes("Missing tiddler") ? document.body.innerText.match(/Missing tiddler[^\-]{0,60}/g) : null,
}));
console.log(JSON.stringify(r,null,1));
await b.close();
