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

/**
 * Why a plugin tiddler of the file did not go into the bag. The reason codes
 * are for the dialog, which translates them; the sentences next to them are
 * for the CLI and for anyone reading the plan as text.
 */
export type WikiFilePluginSkipCode = "not-wanted" | "no-version" | "version-mismatch";

export interface WikiFilePluginSkip {
  title: string;
  reasonCode: WikiFilePluginSkipCode;
  reason: string;
}

export interface ParsedWikiFile extends WikiFileInfo {
  /** The tiddlers to be written, system tiddlers filtered unless asked for. */
  tiddlers: TiddlerFields[];
  /** Every $:/ tiddler found in the file that is not a plugin, also when filtered out. */
  systemTiddlers: TiddlerFields[];
  /** Plugin and theme tiddlers; the language pack is the one that may travel. */
  pluginTiddlers: TiddlerFields[];
  /** The titles that were left out because they are system tiddlers. */
  skippedSystemTitles: string[];
  /** The plugin titles that will be written into the bag. */
  keptPluginTitles: string[];
  /** The plugin titles that were left out, each with the reason. */
  skippedPlugins: WikiFilePluginSkip[];
  /** The session and build state that was dropped, never importable. */
  skippedTransientTitles: string[];
  /** Whether the operator asked for the file's plugins at all. */
  includePlugins: boolean;
  /** The TiddlyWiki version the plugin versions were checked against. */
  targetVersion: string;
  /** The file's own $:/SiteTitle, used as the display name of a new wiki. */
  siteTitle?: string;
  /** The language the file wants, and the pack it carries for it, if any. */
  language?: WikiFileLanguage;
}

/**
 * What the file says about its language. A file can name a language pack it
 * does not contain (it came from a recipe, or somebody deleted it), and then
 * $:/language would point into the void and the plugin switcher would silently
 * fall back to English.
 */
export interface WikiFileLanguage {
  /** The value of the file's $:/language, e.g. "$:/languages/de-DE". */
  wanted: string;
  /** The pack the file carries for it, if any. */
  packTitle?: string;
  /** Whether the booted installation knows the language without the file. */
  inCore: boolean;
}

/**
 * A single-file TiddlyWiki carries its whole core in the file: the store of a
 * freshly built wiki holds $:/core (over 2 MB of plugin text) plus the themes as
 * plugin-type tiddlers. In MWS the plugin set belongs to the recipe, so by
 * default a bag takes none of them.
 *
 * The operator can ask for them anyway ("import the file's plugins"), and then
 * the rule is a version check rather than a blanket no: a plugin may only enter
 * a bag when its own `version` is the version the target wiki runs. $:/core is
 * the whole kernel, and a core from another release would break the wiki in a
 * way no snapshot brings back, because the recipe and the client plugin of the
 * installation are built for one version. Identical text changes nothing, so
 * the cheap case - the file was saved by the same release - still works.
 *
 * Language packs are not part of that opt-in. MWS keeps language plugins in the
 * bag and not in the recipe (a recipe's plugin list is empty for the wikis MWS
 * creates), because the language is a property of the wiki and not of the
 * installation. They travel under the system-tiddler opt-in, and $:/language
 * itself is only written when the wiki can speak the language afterwards (pack
 * in the file, in the core, or in the target bag), otherwise the target keeps
 * its own language.
 */
const PLUGIN_TYPES = new Set(["plugin", "theme", "library", "language"]);

/**
 * Tiddlers that hold the state of one browser session or one build, never the
 * content of a wiki. TiddlyWiki's own import deselects these (core
 * modules/upgraders/system.js); we drop them outright, because in MWS they
 * would end up in the bag and stay there.
 *
 * $:/status/ deserves the mention: the syncer reads $:/status/UserName from
 * there (core modules/wiki.js), so an imported one would put the name of the
 * person who saved the file on every tiddler created in the wiki afterwards.
 */
const TRANSIENT_TITLES = new Set([
  "$:/build",
  "$:/HistoryList",
  "$:/Import",
  "$:/isEncrypted",
  "$:/StoryList",
]);

const TRANSIENT_PREFIXES = ["$:/state/", "$:/status/", "$:/temp/"];

function isTransientTitle(title: string): boolean {
  return TRANSIENT_TITLES.has(title)
    || TRANSIENT_PREFIXES.some((prefix) => title.startsWith(prefix));
}

function isPluginTiddler(fields: TiddlerFields): boolean {
  const type = fields["plugin-type"];
  return typeof type === "string" && PLUGIN_TYPES.has(type);
}

/**
 * `$:/DefaultTiddlers` names the tiddlers a fresh wiki opens with, and a
 * single-file TiddlyWiki practically never keeps it in its store: the stock
 * edition leaves it in the core, where it reads "GettingStarted". So an
 * uploaded file that carries its core hands MWS the start page inside that
 * plugin, while a file without it says nothing at all. Reading only the store
 * would leave every such import on whatever MWS wrote when the wiki was
 * created ("Willkommen"), pointing at a tiddler the file never had — which
 * looks like a broken import even though the import itself was correct.
 *
 * This is the one system tiddler MWS takes from the core of the file, and only
 * when the file offers nothing itself, because the alternative is a start page
 * that names a tiddler nobody can open.
 */
const CORE_DEFAULT_TIDDLERS = "$:/DefaultTiddlers";

/** The core plugin of the file, which is where the start page usually hides. */
function findCorePlugin(pluginTiddlers: readonly TiddlerFields[]): TiddlerFields | undefined {
  return pluginTiddlers.find(t => t.title === "$:/core");
}

/**
 * One tiddler's text out of a plugin's payload. A plugin is JSON of the shape
 * `{"tiddlers": {...}}`, and its own field text is empty — the payload holds
 * everything. A payload that is not that shape (a broken or repacked plugin)
 * yields nothing rather than throwing: the caller then keeps what it had.
 */
function readCoreText(core: TiddlerFields, title: string): string | undefined {
  const text = typeof core.text === "string" ? core.text : "";
  if (!text) return undefined;
  let payload: { tiddlers?: Record<string, { text?: unknown }> };
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    return undefined;
  }
  const found = payload?.tiddlers?.[title];
  const value = typeof found?.text === "string" ? found.text.trim() : "";
  return value || undefined;
}

/** A language pack, the one plugin type that never needs the plugin opt-in. */
function isLanguagePack(fields: TiddlerFields): boolean {
  return fields["plugin-type"] === "language";
}

/**
 * Whether a plugin of the file may enter the bag, and why not if it may not.
 *
 * The test is the plugin's own `version` field against the version the target
 * wiki runs - not `core-version`, which only says which cores the plugin
 * accepts (">=5.0.0" for the stock core) and would let anything through. A
 * plugin without a version cannot be checked at all, so it stays out.
 */
export function checkPluginVersion(
  fields: TiddlerFields,
  targetVersion: string,
): { ok: true } | { ok: false; reasonCode: Exclude<WikiFilePluginSkipCode, "not-wanted">; reason: string } {
  const title = String(fields.title ?? "");
  const version = typeof fields.version === "string" ? fields.version.trim() : "";
  if (!version) {
    return {
      ok: false,
      reasonCode: "no-version",
      reason: `The plugin "${title}" names no version, so it cannot be checked against TiddlyWiki ${targetVersion}.`,
    };
  }
  if (version !== targetVersion) {
    return {
      ok: false,
      reasonCode: "version-mismatch",
      reason: `The plugin "${title}" is version ${version}; the wiki runs TiddlyWiki ${targetVersion}. A wiki takes a plugin only when it is the version the wiki itself runs.`,
    };
  }
  return { ok: true };
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
  /**
   * Also return the core plugins, themes and libraries, but only those whose own
   * version is `targetVersion`. Off by default.
   */
  includePlugins?: boolean;
  /** The TiddlyWiki version the target wiki runs; the plugins are checked against it. */
  targetVersion?: string;
  sizeLimit?: number;
  tiddlerLimit?: number;
} = {}): ParsedWikiFile {
  const info = inspectWikiFile(html, { sizeLimit: options.sizeLimit });
  const tiddlerLimit = options.tiddlerLimit ?? DEFAULT_WIKI_FILE_TIDDLER_LIMIT;
  const includePlugins = !!options.includePlugins;
  // Without a version to check against, no plugin may travel: an unchecked
  // kernel in a bag is exactly what the opt-in is there to prevent.
  const targetVersion = options.targetVersion ?? "";

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
  const keptPluginTitles: string[] = [];
  const skippedPlugins: WikiFilePluginSkip[] = [];
  const skippedTransientTitles: string[] = [];
  let siteTitle: string | undefined;
  let languageWanted: string | undefined;
  let languagePack: string | undefined;

  for (const fields of found) {
    const title = typeof fields?.title === "string" ? fields.title.trim() : "";
    if (!title) continue;
    const tiddler = { ...fields, title };
    if (!title.startsWith("$:/")) {
      tiddlers.push(tiddler);
      continue;
    }
    // Session and build state first: it is junk even when system tiddlers are
    // wanted, so it must not be counted as a system tiddler either.
    if (isTransientTitle(title)) {
      skippedTransientTitles.push(title);
      continue;
    }
    if (title === "$:/SiteTitle") siteTitle = String(fields.text ?? "").trim() || undefined;
    if (title === "$:/language") languageWanted = String(fields.text ?? "").trim() || undefined;
    if (isPluginTiddler(tiddler)) {
      pluginTiddlers.push(tiddler);
      if (isLanguagePack(tiddler)) {
        // The pack follows the same rule as every other $:/ tiddler: it only
        // travels when the operator asked for the file's settings.
        if (languageWanted === undefined) languageWanted = title;
        else if (languageWanted === title) languagePack = title;
        systemTiddlers.push(tiddler);
        if (options.includeSystem) tiddlers.push(tiddler);
        else skippedSystemTitles.push(title);
        continue;
      }
      // Core, theme and library plugins: opt-in, and only at the wiki's version.
      if (!includePlugins) {
        skippedPlugins.push({
          title,
          reasonCode: "not-wanted",
          reason: `The plugin "${title}" is not imported unless the file's plugins are asked for. A wiki gets its plugins from its recipe.`,
        });
        continue;
      }
      const check = checkPluginVersion(tiddler, targetVersion);
      if (!check.ok) {
        skippedPlugins.push({ title, reasonCode: check.reasonCode, reason: check.reason });
        continue;
      }
      keptPluginTitles.push(title);
      tiddlers.push(tiddler);
      continue;
    }
    systemTiddlers.push(tiddler);
    if (options.includeSystem) tiddlers.push(tiddler);
    else skippedSystemTitles.push(title);
  }

  // A pack may sit behind its $:/language in the store, so resolve it once the
  // whole store has been read. Whether the target wiki can speak the language is
  // decided later, against the target bag.
  if (languageWanted && !languagePack) {
    languagePack = pluginTiddlers.some((t) => t.title === languageWanted) ? languageWanted : undefined;
  }
  const language = languageWanted ? {
    wanted: languageWanted,
    ...(languagePack ? { packTitle: languagePack } : {}),
    inCore: !!$tw.wiki.getTiddler(languageWanted),
  } : undefined;

  // The start page out of the core, for the case see CORE_DEFAULT_TIDDLERS.
  // Only when the file's store says nothing: a file that names its own start
  // page in the store has already had its say in the loop above.
  let defaultTiddlersFromCore: string | undefined;
  if (!systemTiddlers.some(t => t.title === CORE_DEFAULT_TIDDLERS)) {
    const core = findCorePlugin(pluginTiddlers);
    const fromCore = core ? readCoreText(core, CORE_DEFAULT_TIDDLERS) : undefined;
    if (fromCore) {
      defaultTiddlersFromCore = fromCore;
      systemTiddlers.push({
        title: CORE_DEFAULT_TIDDLERS,
        text: fromCore,
        type: "text/vnd.tiddlywiki",
      });
      // It is a setting of the whole wiki, so it travels with the system
      // opt-in like every other one — and on its own, because a start page that
      // names a tiddler nobody can open is the one thing worse than the wrong one.
      tiddlers.push({ title: CORE_DEFAULT_TIDDLERS, text: fromCore, type: "text/vnd.tiddlywiki" });
    }
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
    keptPluginTitles,
    skippedPlugins,
    skippedTransientTitles,
    includePlugins,
    targetVersion,
    siteTitle,
    language,
  };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${bytes} bytes`;
}