import { TiddlerFields, TW } from "tiddlywiki";

/**
 * Reading a single-file TiddlyWiki (.html) into tiddler fields, server side.
 *
 * The stock "text/html" deserializer does not fail on a file it cannot read:
 * without a tiddler store it hands the whole file back as one single
 * text/html tiddler (deserializeHtmlFile() in the core deserializers module).
 * Every import therefore goes through inspectWikiFile() first, and only a file
 * that really is an unencrypted TiddlyWiki 5 wiki is handed to the parser.
 *
 * The validation follows the markers tiddlyhost uses
 * (https://github.com/heino17/tiddlyhost-wikiwise, rails/lib/tw_file.rb):
 * application-name, tiddlywiki-version, and a tiddler store. A built TW5 file
 * can carry both store shapes at once - an empty storeArea next to the JSON
 * store - so the JSON store wins when both are there.
 */

/** Default ceiling for one uploaded wiki file. Configurable via MWS_WIKI_FILE_SIZE_LIMIT. */
export const DEFAULT_WIKI_FILE_SIZE_LIMIT = 50 * 1024 * 1024;

/** Default ceiling for the tiddler count of one uploaded wiki file. */
export const DEFAULT_WIKI_FILE_TIDDLER_LIMIT = 20000;

export type WikiFileKind = "tw5" | "tw5x";

export type WikiFileStore = "json" | "storeArea";

export type WikiFileRejectCode =
  | "NOT_A_TIDDLYWIKI"
  | "UNSUPPORTED_TIDDLYWIKI_2"
  | "ENCRYPTED_WIKI"
  | "NO_TIDDLER_STORE"
  | "FILE_TOO_LARGE"
  | "TOO_MANY_TIDDLERS";

export class WikiFileError extends Error {
  constructor(readonly code: WikiFileRejectCode, message: string) {
    super(message);
    this.name = "WikiFileError";
  }
}

/** What the file markers say about it, without parsing any tiddler. */
export interface WikiFileInfo {
  kind: WikiFileKind;
  twVersion: string;
  store: WikiFileStore;
  sizeBytes: number;
}

export interface ParsedWikiFile extends WikiFileInfo {
  /** The tiddlers to be written, system tiddlers filtered unless asked for. */
  tiddlers: TiddlerFields[];
  /** Every $:/ tiddler found in the file that is not a plugin, also when filtered out. */
  systemTiddlers: TiddlerFields[];
  /** Plugin, theme and library tiddlers, which are never imported. */
  pluginTiddlers: TiddlerFields[];
  /** The titles that were left out because they are system tiddlers. */
  skippedSystemTitles: string[];
  /** The plugin titles that were left out. */
  skippedPluginTitles: string[];
  /** The file's own $:/SiteTitle, used as the display name of a new wiki. */
  siteTitle?: string;
}

/**
 * A single-file TiddlyWiki carries its whole core in the file: the store of a
 * freshly built wiki holds $:/core (over 2 MB of plugin text) plus the themes as
 * plugin-type tiddlers. In MWS the plugin set belongs to the recipe, so a bag
 * must never take a plugin from an uploaded file, no matter what the operator
 * asked for.
 */
const PLUGIN_TYPES = new Set(["plugin", "theme", "library", "language"]);

function isPluginTiddler(fields: TiddlerFields): boolean {
  const type = fields["plugin-type"];
  return typeof type === "string" && PLUGIN_TYPES.has(type);
}

const META_TAG = /<meta\b[^>]*>/gi;

/** Reads a <meta name="..."> value the way a browser would, attribute order aside. */
function metaContent(html: string, name: string): string | undefined {
  const wanted = name.toLowerCase();
  META_TAG.lastIndex = 0;
  let tag: RegExpExecArray | null;
  while ((tag = META_TAG.exec(html)) !== null) {
    const nameMatch = /\bname\s*=\s*["']?([^"'\s>]+)/i.exec(tag[0]);
    if (!nameMatch || nameMatch[1].toLowerCase() !== wanted) continue;
    const contentMatch = /\bcontent\s*=\s*["']([^"]*)["']/i.exec(tag[0]);
    if (contentMatch) return contentMatch[1];
  }
  return undefined;
}

// TiddlyWiki 2 announces itself in a script block instead of a meta tag.
const TW2_VERSION = /var\s+version\s*=\s*\{[^}]*?title\s*:\s*["']TiddlyWiki["']/m;
const ENCRYPTED_STORE = /<pre\b[^>]*\bid\s*=\s*["']?encryptedStoreArea/i;
const JSON_STORE = /<script\b[^>]*\bclass\s*=\s*["']tiddlywiki-tiddler-store["']/i;
const STORE_AREA = /<div\b[^>]*\bid\s*=\s*["']?storeArea/i;
const EXTERNAL_CORE = /<script\b[^>]*\bsrc\s*=\s*["'][^"']*tiddlywikicore/i;

/**
 * Checks that the text is an unencrypted TiddlyWiki 5 file and reports what it
 * is. Throws a WikiFileError with a message meant for the person who picked the
 * file, never for a log.
 */
export function inspectWikiFile(html: string, options: { sizeLimit?: number } = {}): WikiFileInfo {
  const sizeLimit = options.sizeLimit ?? DEFAULT_WIKI_FILE_SIZE_LIMIT;
  const sizeBytes = Buffer.byteLength(html, "utf8");
  if (sizeBytes > sizeLimit) {
    throw new WikiFileError("FILE_TOO_LARGE",
      `The file is ${formatBytes(sizeBytes)}; the limit is ${formatBytes(sizeLimit)}.`);
  }

  // A TiddlyWiki 2 file announces itself in a script block and has no meta tags,
  // so it is recognised before the application-name check: the operator needs to
  // hear "this is TW2, save it with TW5", not "this is not a TiddlyWiki".
  if (TW2_VERSION.test(html)) {
    throw new WikiFileError("UNSUPPORTED_TIDDLYWIKI_2",
      "This is a TiddlyWiki 2 file. MWS holds TiddlyWiki 5 tiddlers: save the wiki with TiddlyWiki 5 first.");
  }

  const applicationName = metaContent(html, "application-name")?.trim();
  if (applicationName !== "TiddlyWiki") {
    throw new WikiFileError("NOT_A_TIDDLYWIKI", applicationName
      ? `This is not a TiddlyWiki file (application-name is "${applicationName}").`
      : "This is not a TiddlyWiki file (no application-name meta tag).");
  }

  const twVersion = metaContent(html, "tiddlywiki-version")?.trim();
  if (!twVersion) {
    throw new WikiFileError("NOT_A_TIDDLYWIKI",
      "This is not a TiddlyWiki file (no tiddlywiki-version meta tag).");
  }

  if (ENCRYPTED_STORE.test(html)) {
    throw new WikiFileError("ENCRYPTED_WIKI",
      "This wiki is password protected. Remove the password protection in TiddlyWiki and save it again.");
  }

  const store: WikiFileStore | undefined = JSON_STORE.test(html)
    ? "json"
    : STORE_AREA.test(html) ? "storeArea" : undefined;
  if (!store) {
    throw new WikiFileError("NO_TIDDLER_STORE",
      "This TiddlyWiki file has no tiddler store, so it holds no tiddlers.");
  }

  return {
    kind: EXTERNAL_CORE.test(html) ? "tw5x" : "tw5",
    twVersion,
    store,
    sizeBytes,
  };
}

/**
 * Parses an inspected wiki file into tiddler fields.
 *
 * Needs the booted $tw of a TiddlyWiki version: the deserializer modules only
 * exist inside a booted instance. Use the version the file was saved with when
 * it is installed, so the markup matches what the parser expects.
 */
export function parseWikiFile($tw: TW, html: string, options: {
  /** Also return the $:/ tiddlers. They configure the whole wiki and are off by default. */
  includeSystem?: boolean;
  sizeLimit?: number;
  tiddlerLimit?: number;
} = {}): ParsedWikiFile {
  const info = inspectWikiFile(html, { sizeLimit: options.sizeLimit });
  const tiddlerLimit = options.tiddlerLimit ?? DEFAULT_WIKI_FILE_TIDDLER_LIMIT;

  const found = $tw.wiki.deserializeTiddlers("", html, undefined, {
    deserializer: "text/html",
  }) as TiddlerFields[];

  // A file whose store marker lies (the marker inside a code sample, say) ends
  // up here as the deserializer's fallback: the whole file as one tiddler.
  if (found.length === 1 && found[0]?.type === "text/html") {
    throw new WikiFileError("NO_TIDDLER_STORE",
      "The tiddler store of this file could not be read.");
  }

  const tiddlers: TiddlerFields[] = [];
  const systemTiddlers: TiddlerFields[] = [];
  const pluginTiddlers: TiddlerFields[] = [];
  const skippedSystemTitles: string[] = [];
  const skippedPluginTitles: string[] = [];
  let siteTitle: string | undefined;

  for (const fields of found) {
    const title = typeof fields?.title === "string" ? fields.title.trim() : "";
    if (!title) continue;
    const tiddler = { ...fields, title };
    if (title === "$:/SiteTitle") siteTitle = String(fields.text ?? "").trim() || undefined;
    if (!title.startsWith("$:/")) {
      tiddlers.push(tiddler);
      continue;
    }
    if (isPluginTiddler(tiddler)) {
      pluginTiddlers.push(tiddler);
      skippedPluginTitles.push(title);
      continue;
    }
    systemTiddlers.push(tiddler);
    if (options.includeSystem) tiddlers.push(tiddler);
    else skippedSystemTitles.push(title);
  }

  tiddlers.sort((a, b) => a.title.localeCompare(b.title));

  if (!tiddlers.length && !systemTiddlers.length) {
    throw new WikiFileError("NO_TIDDLER_STORE",
      "The tiddler store of this file is empty, so there is nothing to import.");
  }

  if (tiddlers.length > tiddlerLimit) {
    throw new WikiFileError("TOO_MANY_TIDDLERS",
      `The file holds ${tiddlers.length} tiddlers; the limit is ${tiddlerLimit}.`);
  }

  return {
    ...info,
    tiddlers,
    systemTiddlers,
    pluginTiddlers,
    skippedSystemTitles,
    skippedPluginTitles,
    siteTitle,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${bytes} bytes`;
}