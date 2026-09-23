import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
for (const url of ["file:///home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/empty.html"]) {
  const p = await b.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const w = $tw.wiki;
    const out = {};
    try { out.getTiddlers = w.getTiddlers().length; } catch(e){ out.getTiddlers = "ERR "+e; }
    try { out.allTitles = w.allTitles().length; } catch(e){ out.allTitles = "ERR "+e; }
    try { out.raw = Object.keys(w.tiddlers).length; } catch(e){ out.raw = "ERR "+e; }
    try { out.getTGettingStarted = !!w.getTiddler("GettingStarted"); } catch(e){ out.gt="ERR "+e; }
    try { out.GSfields = w.getTiddler("GettingStarted") && w.getTiddler("GettingStarted").fields.title; } catch(e){}
    try { out.matchTiddler = w.getTiddlerText("$:/SiteTitle","-none-"); } catch(e){ out.st="ERR "+e; }
    return out;
  });
  console.log(url, JSON.stringify(r,null,1));
  await p.close();
}
await b.close();
