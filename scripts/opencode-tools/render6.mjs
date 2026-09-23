import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: "/snap/bin/chromium" });
for (const [name, path] of [["leer-selbstgebaut","/home/r2d2/scratch_tw/selfbuilt-empty.html"]]) {
  const page = await browser.newPage();
  const errs=[]; page.on("pageerror",e=>errs.push(e.message.slice(0,200)));
  await page.goto("file://"+path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const info = await page.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    vanilla: $tw.wiki.getTiddlerText("$:/themes/tiddlywiki/vanilla/base")?.length ?? "fehlt",
    h1: document.querySelector("h1")?.textContent ?? null,
  }));
  console.log("===", name, JSON.stringify(info), "errors:", errs.length? errs[0] : "-");
}
await browser.close();
