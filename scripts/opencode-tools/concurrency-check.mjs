import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const Database = require(join(ROOT, "node_modules/better-sqlite3"));

const DB = join(ROOT, "dev/wiki/store/database.sqlite");
const THUMBDIR = join(ROOT, "dev/wiki/store/thumbnails");
const BASE = "http://127.0.0.1:5001";
const COOKIE = "session=opencode-test-session";

const db = new Database(DB, { readonly: true });
const slugs = db.prepare("SELECT slug FROM recipe ORDER BY slug").all().map(r => r.slug);
db.close();
console.log("slugs:", slugs.length);

const t0 = Date.now();
const completions = [];
const timersOf = new Set(slugs);

for (const slug of slugs) {
  fetch(`${BASE}/wiki/${encodeURIComponent(slug)}/thumbnail`, { headers: { Cookie: COOKIE } }).then(async r => {
    completions.push({ slug, at: Date.now() - t0, status: r.status, ct: r.headers.get("content-type") });
  }).catch(e => completions.push({ slug, at: Date.now() - t0, error: String(e) }));
}

const poll = setInterval(async () => {
  try {
    for (const name of await readdir(THUMBDIR)) {
      const slug = name.replace(/\.png$/, "");
      if (timersOf.has(slug)) timersOf.delete(slug);
    }
  } catch {}
  if (timersOf.size === 0 && completions.length >= slugs.length) {
    clearInterval(poll);
    finish();
  }
}, 300);

function finish() {
  completions.sort((a, b) => a.at - b.at);
  console.log("fertig: alle", completions.length, "Requests beantwortet in", Math.round(completions.at(-1).at / 1000), "s");
  for (const c of completions) console.log(" ", String(Math.round(c.at / 100) / 10).padStart(6), "s |", c.slug, c.status, c.ct ?? "");
  const gaps = [];
  for (let i = 1; i < completions.length; i++) gaps.push(completions[i].at - completions[i - 1].at);
  const ok = completions.filter(c => c.status === 200).length;
  console.log("nicht-200:", completions.length - ok, "| kleinstes Gap:", Math.round(Math.min(...gaps) / 100) / 10, "s | größtes Gap:", Math.round(Math.max(...gaps) / 100) / 10, "s");
}
setTimeout(() => { clearInterval(poll); console.log("TIMEOUT — noch übrig:", [...timersOf]); process.exit(1); }, 170000);