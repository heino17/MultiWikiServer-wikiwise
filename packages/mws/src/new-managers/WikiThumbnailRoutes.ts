// Wiki thumbnails — headless screenshots of each wiki for the admin "Wikis"
// list. The server renders the wiki page in a headless browser using the
// requester's own session cookie (so the picture matches what that user can
// see) and caches the PNG under the store folder. Chromium is launched lazily
// and reused; its location can be overridden with MWS_CHROMIUM_PATH.

import { createReadStream } from "node:fs";
import { mkdir, readdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SendError, ServerRequest } from "@tiddlywiki/server";
import { serverEvents } from "@tiddlywiki/events";
import { chromium } from "playwright-core";
import { RecipeResolver } from "./RecipeResolver";
import { ServerState } from "../ServerState";

// Render the wiki at a higher resolution and downscale the screenshot, so the
// preview image gets a nicer anti-aliased result than a native low-res capture.
const VIEWPORT = { width: 1280, height: 800 };
const THUMB_WIDTH = 640;
const THUMB_HEIGHT = 400;

/** Remove the cached thumbnail files for a wiki (best effort). */
async function unlinkThumbnail(storePath: string, slug: string): Promise<void> {
  const fileName = slug.replace(/[^a-zA-Z0-9_-]/g, "_");
  for (const suffix of [".png", ".png.tmp"]) {
    await unlink(join(storePath, "thumbnails", fileName + suffix)).catch((error: unknown) => {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") throw error;
    });
  }
}

/** Debounce window (ms) between the last save and the thumbnail being dropped.
 *  Keeps the preview intact while a wiki is actively being edited (TiddlyWiki
 *  autosaves call batch/save on every change), instead of deleting the PNG on
 *  each save which would re-render on the next list view. */
function thumbnailDebounceMs(): number {
  const value = Number.parseInt(process.env.MWS_THUMBNAIL_DEBOUNCE_SECONDS ?? "", 10);
  return (Number.isFinite(value) && value >= 0 ? value : 180) * 1000;
}

const invalidationTimers = new Map<string, NodeJS.Timeout>();

/** Debounce invalidation of the cached thumbnail per wiki: subsequent saves
 *  reset the timer, and the PNG is removed once, shortly after the last save.
 *  The next thumbnail request then re-renders the wiki. */
export function invalidateThumbnail(storePath: string, slug: string): void {
  const key = slug;
  const existing = invalidationTimers.get(key);
  if (existing) clearTimeout(existing);
  invalidationTimers.set(key, setTimeout(() => {
    invalidationTimers.delete(key);
    unlinkThumbnail(storePath, slug).catch((error: unknown) => {
      console.error(`[thumbnail] failed to invalidate "${slug}":`, error);
    });
  }, thumbnailDebounceMs()));
}

/** Immediately drop the cached thumbnail of a wiki (used when the wiki itself
 *  is deleted) and cancel any pending debounced invalidation for the slug, so
 *  a leftover timer cannot wipe a re-created wiki's fresh thumbnail later. */
export async function deleteThumbnail(storePath: string, slug: string): Promise<void> {
  invalidationTimers.delete(slug);
  await unlinkThumbnail(storePath, slug);
}

/** Remove every file in `store/thumbnails/` that does not belong to a current
 *  recipe (deleted wikis, crashed `.tmp` leftovers). Runs once at startup.
 *  Slug sanitization stays lossy (non-safe characters → `_`), so the set of
 *  valid files is built from the *sanitized* slugs of existing recipes — a
 *  possible collision only ever keeps a file, never deletes a live one. */
export async function sweepOrphanedThumbnails(config: ServerState): Promise<number> {
  const dir = join(config.storePath, "thumbnails");
  let fileNames: string[];
  try {
    fileNames = await readdir(dir);
  } catch {
    return 0;
  }
  if (fileNames.length === 0) return 0;

  const validFiles = new Set<string>();
  const recipes = await config.engine.recipe.findMany({ select: { slug: true } });
  for (const { slug } of recipes) {
    const base = slug.replace(/[^a-zA-Z0-9_-]/g, "_");
    validFiles.add(base + ".png");
    validFiles.add(base + ".png.tmp");
  }

  let removed = 0;
  for (const name of fileNames) {
    if (validFiles.has(name)) continue;
    await unlink(join(dir, name)).catch(() => {});
    removed++;
  }
  return removed;
}

serverEvents.on("mws.config.init.after", (config) => {
  void sweepOrphanedThumbnails(config).then((removed) => {
    if (removed > 0) console.log(`[thumbnail] removed ${removed} orphaned thumbnail file(s)`);
  }).catch((error: unknown) => {
    console.error("[thumbnail] orphan sweep failed:", error);
  });
});

function chromiumExecutable(): string {
  return process.env.MWS_CHROMIUM_PATH ?? process.env.CHROME_PATH ?? "/snap/bin/chromium";
}

function thumbnailTtlMs(): number {
  const value = Number.parseInt(process.env.MWS_THUMBNAIL_TTL_HOURS ?? "", 10);
  return (Number.isFinite(value) && value > 0 ? value : 24) * 60 * 60 * 1000;
}

let browserPromise: ReturnType<typeof chromium.launch> | null = null;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      executablePath: chromiumExecutable(),
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
      ],
    }).catch((error: unknown) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

const inFlight = new Map<string, Promise<void>>();

function queue(key: string, fn: () => Promise<void>): Promise<void> {
  const existing = inFlight.get(key);
  if (existing) return existing;
  const promise = fn().finally(() => { inFlight.delete(key); });
  inFlight.set(key, promise);
  return promise;
}

/** Maximum number of wiki renders running at once (each owns its own Chromium
 *  context). After a TTL expiry the whole wiki list re-renders on first view —
 *  this bounds the CPU/RAM spike instead of opening unlimited contexts.
 *  Overridable via MWS_THUMBNAIL_RENDER_CONCURRENCY (default 2, clamped 1..8). */
function renderConcurrency(): number {
  const value = Number.parseInt(process.env.MWS_THUMBNAIL_RENDER_CONCURRENCY ?? "", 10);
  const n = Number.isFinite(value) ? value : 2;
  return Math.max(1, Math.min(8, n));
}

const maxConcurrentRenders = renderConcurrency();
let activeRenders = 0;
const renderWaiters: Array<() => void> = [];

/** Acquire a render slot (bounds parallel Chromium contexts), run `fn`, then
 *  hand the slot to the next waiter. FIFO so bursts render one after another. */
async function withRenderSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeRenders >= maxConcurrentRenders) {
    await new Promise<void>((resolve) => renderWaiters.push(resolve));
  }
  activeRenders++;
  try {
    return await fn();
  } finally {
    activeRenders--;
    const next = renderWaiters.shift();
    if (next) next();
  }
}

async function statSafe(filePath: string): Promise<{ mtimeMs: number; size: number } | null> {
  try {
    return await stat(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw error;
  }
}

async function downscalePng(context: import("playwright-core").BrowserContext, source: Buffer, width: number, height: number): Promise<Buffer> {
  const dataUrl = "data:image/png;base64," + source.toString("base64");
  const resizePage = await context.newPage();
  try {
    await resizePage.setViewportSize({ width, height });
    await resizePage.setContent(`<!doctype html><html><head><style>html,body{margin:0;padding:0}img{display:block;width:${width}px;height:${height}px;object-fit:cover}</style></head><body><img src="${dataUrl}"></body></html>`, { waitUntil: "load" });
    await resizePage.waitForTimeout(100);
    return await resizePage.screenshot({ omitBackground: true });
  } finally {
    await resizePage.close();
  }
}

async function renderThumbnail(state: ServerRequest, slug: string, outPath: string): Promise<void> {
  const origin = `${state.assumeHTTPS ? "https" : "http"}://${state.host}`;
  const pageUrl = `${origin}${state.pathPrefix}/wiki/${encodeURIComponent(slug)}`;

  const browser = await getBrowser();
  const context = await browser.newContext({ viewport: VIEWPORT });
  try {
    if (state.user.sessionId) {
      await context.addCookies([{
        name: "session",
        value: state.user.sessionId,
        domain: state.host.split(":")[0],
        path: state.pathPrefix ? state.pathPrefix + "/" : "/",
        httpOnly: true,
        sameSite: "Strict",
      }]);
    }
    const page = await context.newPage();
    await page.goto(pageUrl, { waitUntil: "networkidle", timeout: 60000 });
    // let the TiddlyWiki client finish booting and do its initial paint
    await page.waitForTimeout(2500);
    const shot = await page.screenshot({ type: "png" });
    const resized = await downscalePng(context, shot, THUMB_WIDTH, THUMB_HEIGHT);
    const tmpPath = outPath + ".tmp";
    await writeFile(tmpPath, resized);
    await rename(tmpPath, outPath);
  } finally {
    await context.close().catch(() => {});
  }
}

export async function serveWikiThumbnail(state: ServerRequest) {
  if (!state.user.isLoggedIn)
    throw new SendError("ACCESS_DENIED", 403, { reason: "User not authenticated" });

  const { recipe_slug } = state.pathParams as { recipe_slug: string };
  await RecipeResolver.assertRecipe({ state, recipe_slug });

  const dir = join(state.config.storePath, "thumbnails");
  await mkdir(dir, { recursive: true });
  const fileName = recipe_slug.replace(/[^a-zA-Z0-9_-]/g, "_");
  const outPath = join(dir, fileName + ".png");

  const cached = await statSafe(outPath);
  const ttlMs = thumbnailTtlMs();
  if (!cached || Date.now() - cached.mtimeMs > ttlMs) {
    await queue(outPath, () => withRenderSlot(() => renderThumbnail(state, recipe_slug, outPath)));
  }

  const current = (await statSafe(outPath)) ?? cached;
  if (!current) {
    state.writeHead(404, { contentType: { mediaType: "image/png" } });
    return state.end();
  }

  const maxAge = Math.floor(ttlMs / 1000);
  const modifiedSeconds = Math.floor(current.mtimeMs / 1000) * 1000;
  const etag = `"${Math.floor(current.mtimeMs)}-${current.size}"`;
  const lastModified = new Date(modifiedSeconds).toUTCString();
  const ifNoneMatch = state.headers.get("if-none-match");
  const ifModifiedSince = state.headers.get("if-modified-since");

  const etagMatches = ifNoneMatch === "*"
    || (ifNoneMatch?.split(",").map((value: string) => value.trim()).includes(etag) ?? false);
  const notModifiedSince = ifNoneMatch == null && ifModifiedSince != null
    && new Date(ifModifiedSince).getTime() >= modifiedSeconds;

  if (etagMatches || notModifiedSince) {
    state.writeHead(304, { etag, lastModified, cacheControl: `private, max-age=${maxAge}` });
    return state.end();
  }

  state.writeHead(200, {
    contentType: { mediaType: "image/png" },
    etag,
    lastModified,
    cacheControl: `private, max-age=${maxAge}`,
  });
  if (state.method !== "HEAD") {
    await state.pipeFrom(createReadStream(outPath));
  }
  return state.end();
}