import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const BASE = "http://127.0.0.1:5001";
const COOKIE = "session=opencode-test-session";
const THUMBDIR = join(ROOT, "dev/wiki/store/thumbnails");

const exists = async (p) => { try { await access(p); return true; } catch { return false; } };

const api = async (path, method = "PUT", body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Cookie": COOKIE,
      "X-Requested-With": "TiddlyWiki",
      "Content-Type": "application/json",
      "Referer": BASE + "/",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
};

const created = await api("/admin/wiki", "PUT", { displayName: "ThumbnailCleanupTest" });
console.log("create wiki:", created.status, JSON.stringify(created.json ?? created));
const slug = created.json?.slug;
if (!slug) throw new Error("no slug from create");

const tRes = await fetch(`${BASE}/wiki/${slug}/thumbnail`, { headers: { Cookie: COOKIE } });
const png = `${THUMBDIR}/${slug}.png`;
console.log("render thumbnail:", tRes.status, tRes.headers.get("content-type"), "| PNG existiert:", await exists(png));

const del = await api("/admin/wiki/delete", "PUT", { slug });
console.log("delete wiki:", del.status, JSON.stringify(del.json));
console.log("sofort nach delete — PNG GELÖSCHT:", !(await exists(png)));

const tRes2 = await fetch(`${BASE}/wiki/${slug}/thumbnail`, { headers: { Cookie: COOKIE } });
console.log("thumbnail danach (Wiki weg, erwartet 404):", tRes2.status);