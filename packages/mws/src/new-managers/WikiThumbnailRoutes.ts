// Wiki thumbnails — headless screenshots of each wiki for the admin "Wikis"
// list. The server renders the wiki page in a headless browser using the
// requester's own session cookie (so the picture matches what that user can
// see) and caches the PNG under the store folder. Chromium is launched lazily
// and reused; its location can be overridden with MWS_CHROMIUM_PATH.

import { createReadStream } from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SendError, ServerRequest } from "@tiddlywiki/server";
import { chromium } from "playwright-core";
import { RecipeResolver } from "./RecipeResolver";

// Render the wiki at a higher resolution and downscale the screenshot, so the
// preview image gets a nicer anti-aliased result than a native low-res capture.
const VIEWPORT = { width: 1280, height: 800 };
const THUMB_WIDTH = 640;
const THUMB_HEIGHT = 400;

/** Remove the cached thumbnail for a wiki so the next request re-renders it. */
export async function invalidateThumbnail(storePath: string, slug: string): Promise<void> {
  const fileName = slug.replace(/[^a-zA-Z0-9_-]/g, "_");
  for (const suffix of [".png", ".png.tmp"]) {
    await unlink(join(storePath, "thumbnails", fileName + suffix)).catch((error: unknown) => {
      const code = (error as NodeJS.ErrnoException)?.code;
      if (code !== "ENOENT") throw error;
    });
  }
}

function chromiumExecutable(): string {
  return process.env.MWS_CHROMIUM_PATH ?? process.env.CHROME_PATH ?? "/snap/bin/chromium";
}

function thumbnailTtlMs(): number {
  const value = Number.parseInt(process.env.MWS_THUMBNAIL_TTL_HOURS ?? "", 10);
  return (Number.isFinite(value) && value > 0 ? value : 6) * 60 * 60 * 1000;
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

async function statSafe(filePath: string): Promise<{ mtimeMs: number } | null> {
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
  if (!cached || Date.now() - cached.mtimeMs > thumbnailTtlMs()) {
    await queue(outPath, () => renderThumbnail(state, recipe_slug, outPath));
  }

  state.writeHead(200, {
    contentType: { mediaType: "image/png" },
    cacheControl: "private, max-age=600",
  });
  if (state.method !== "HEAD") {
    await state.pipeFrom(createReadStream(outPath));
  }
  return state.end();
}