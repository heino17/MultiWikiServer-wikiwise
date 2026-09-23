import { createRequire } from "module";
const require = createRequire("/home/r2d2/Documents/AI_Master/MultiWikiServer-wikiwise/package.json");
const { chromium } = require("playwright-core");
const b = await chromium.launch();
const p = await b.newPage();
const logs=[];
p.on("console", m => { const t=m.text(); if (t.startsWith("HOOK")) logs.push(t.slice(0,260)); });
await p.addInitScript(() => {
  window.$tw = window.$tw || {};
  // intercept loadTiddlersBrowser assignment
  let realLTB = null;
  Object.defineProperty(window.$tw, "loadTiddlersBrowser", {
    configurable: true,
    set(fn) {
      realLTB = fn;
      // wrap it
      window.$tw.loadTiddlersBrowser = function() {
        const nodes = document.querySelectorAll("script.tiddlywiki-tiddler-store,#storeArea");
        console.log("HOOK loadTiddlersBrowser stores="+nodes.length);
        try {
          const r = realLTB.call(this);
          const w = $tw.wiki;
          console.log("HOOK after LTB titles="+w.allTitles().length+" hasStart="+w.tiddlerExists("Start"));
          return r;
        } catch(e) { console.log("HOOK LTB THREW "+e); throw e; }
      };
      // store as own prop
      window.$tw.loadTiddlersBrowserSetterDone = true;
    },
    get() { return realLTB; }
  });
  // intercept deleteTiddler on wiki objects as they get created
  let realDelete = null;
  Object.defineProperty(window.$tw, "wiki", {
    configurable: true,
    set(w) {
      if (w && !w.__hooked) {
        w.__hooked = true;
        realDelete = w.deleteTiddler.bind(w);
        w.deleteTiddler = function(t) {
          console.log("HOOK deleteTiddler "+t);
          return realDelete(t);
        };
      }
      window.$tw.__wikiValue = w;
    },
    get() { return window.$tw.__wikiValue; }
  });
});
await p.goto("http://localhost:5000/wiki/bedienungsanleitung", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);
console.log("=== hook logs ===");
console.log(logs.slice(0,50).join("\n"));
await b.close();
