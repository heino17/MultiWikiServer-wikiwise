import { stat, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = "http://127.0.0.1:5001";
const SLUG = "webserver-vm";
const THUMB = join(ROOT, `dev/wiki/store/thumbnails/${SLUG}.png`);
const COOKIE = "session=opencode-test-session";

const exists = async () => {
  try { await access(THUMB); return true; } catch { return false; }
};

const save = async () => {
  const res = await fetch(`${BASE}/recipe/${SLUG}/batch/save`, {
    method: "PUT",
    headers: {
      "Cookie": COOKIE,
      "X-Requested-With": "TiddlyWiki",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tiddlers: [{ title: "DebounceTest", text: "x" }] }),
  });
  return res.status;
};

const del = async () => {
  const res = await fetch(`${BASE}/recipe/${SLUG}/batch/delete`, {
    method: "PUT",
    headers: {
      "Cookie": COOKIE,
      "X-Requested-With": "TiddlyWiki",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ titles: ["DebounceTest"] }),
  });
  return res.status;
};

console.log("PNG vor Start existiert:", await exists(), "mtime:", (await stat(THUMB)).mtimeMs);

console.log("1. save:", await save());
await new Promise((r) => setTimeout(r, 300));
console.log("2. save:", await save());
console.log("unmittelbar danach — PNG sollte NOCH existieren (Debounce):", await exists());

await new Promise((r) => setTimeout(r, 7000));
console.log("nach 7 s — PNG sollte GELÖSCHT sein:", !(await exists()));

const tRes = await fetch(`${BASE}/wiki/${SLUG}/thumbnail`, { headers: { Cookie: COOKIE } });
console.log("thumbnail-Request (lazy re-render):", tRes.status, tRes.headers.get("content-type"), "PNG existiert wieder:", await exists());

console.log("cleanup delete:", await del());
await new Promise((r) => setTimeout(r, 6000));
console.log("nach delete+6 s — PNG wieder weg (delete debounced):", !(await exists()));

const tRes2 = await fetch(`${BASE}/wiki/${SLUG}/thumbnail`, { headers: { Cookie: COOKIE } });
console.log("finaler thumbnail-Request:", tRes2.status, "PNG existiert:", await exists(), "mtime:", (await stat(THUMB)).mtimeMs);