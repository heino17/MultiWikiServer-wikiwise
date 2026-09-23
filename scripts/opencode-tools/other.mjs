import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const slug = process.argv[2];
const p = await b.newPage();
const reqs=[];
p.on("request", r => { if (r.url().includes("recipe/")) reqs.push(r.url().replace("http://localhost:5000","")); });
await p.goto("http://localhost:5000/wiki/"+slug, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
const r = await p.evaluate(() => ({
  total: $tw.wiki.getTiddlers().length,
  hasStart: $tw.wiki.tiddlerExists("Start"),
  recipe: $tw.wiki.getTiddlerText("$:/config/multiwikiclient/recipe","<MISSING>"),
  host: $tw.wiki.getTiddlerText("$:/config/multiwikiclient/host","<MISSING>"),
}));
console.log(slug, JSON.stringify(r), "reqs:", JSON.stringify(reqs.slice(0,3)));
await b.close();
