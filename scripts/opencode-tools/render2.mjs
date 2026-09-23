import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: "/snap/bin/chromium" });
for (const [name, path] of [["bed","/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/Bedienungsanleitung.html"],["empty","/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/empty.html"]]) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errs = [];
  page.on("pageerror", e => errs.push("PAGEERROR: "+e.message));
  page.on("console", m => { if (m.type()==="error") errs.push("CONSOLE-ERR: "+m.text().slice(0,300)); });
  await page.goto("file://"+path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const styles = await page.evaluate(() => Array.from(document.querySelectorAll("style")).map(s=>({len:s.textContent.length, src:(s.textContent.match(/^\s*\/\*/)||[])[0]||"", id:s.id, cls:s.className})).slice(-12));
  const cssTiddlerCount = await page.evaluate(() => $tw.wiki.getTiddlersWithTag ? $tw.wiki.getTiddlersWithTag("$:/tags/Stylesheet").length : "n/a");
  const hasTheme = await page.evaluate(() => $tw.wiki.getTiddlerText("$:/themes/tiddlywiki/vanilla/base")?.length ?? "missing");
  console.log("===", name);
  console.log("  theme-css-tiddler:", hasTheme, "| tag Stylesheet:", cssTiddlerCount);
  for (const e of errs.slice(0,8)) console.log("  ", e);
}
await browser.close();
