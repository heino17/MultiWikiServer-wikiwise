import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const browser = await chromium.launch({ executablePath: "/snap/bin/chromium" });
for (const [name, path] of [["orig-empty","/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/empty.html"],["manual-neu","/home/r2d2/scratch_tw/manual-new.html"]]) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.goto("file://"+path, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/home/r2d2/scratch_tw/${name}.png` });
  const sel = await page.evaluate(() => {
    const q=s=>document.querySelector(s);
    return {
      sidebar: !!q(".tc-sidebar"), topbar: !!q("#topbar"),
      storyriver: !!q(".tc-story-river"), frame: !!q(".tc-tiddler-frame"),
      backlog: !!q("#backstagePanel"), btn: !!q("button"),
      countButtons: document.querySelectorAll("button").length,
      hostTitle: document.title,
    };
  });
  console.log("===", name, JSON.stringify(sel));
}
await browser.close();
