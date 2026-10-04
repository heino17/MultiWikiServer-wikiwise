import { TiddlerFields } from "tiddlywiki";

/**
 * Reading a SimpleWiki file into tiddler fields, server side.
 *
 * SimpleWiki is a small single page app with its own file format, not a
 * TiddlyWiki. It hands its data to itself in one script element and can also
 * write it as a bare JSON file, and both carry the same payload:
 *
 *   {version, seiten: [{id, title, content, links, tags, created, updated}],
 *    startseite, sprache, thema}
 *
 * Three things follow from that and shape everything below.
 *
 * A file that announces a higher version is refused whole. Reading half of a
 * format we do not know is worse than refusing it: the fields we skip would be
 * lost on the next export, and the person would find out much later.
 *
 * Page ids are SimpleWiki's own bookkeeping and do not travel. TiddlyWiki
 * identifies a tiddler by its title, and SimpleWiki enforces unique titles,
 * so the title is the identity on both sides.
 *
 * The links do not travel either, but they have to be rewritten. SimpleWiki
 * writes a page reference as `[Text](wiki:Title)`, which TiddlyWiki renders as
 * an ordinary link into the void. `[[Title]]` and `[[Text|Title]]` mean the same
 * thing on both sides and are left alone.
 */

/** The format version this server reads. A file that claims more is refused. */
export const SIMPLEWIKI_FORMAT_VERSION = 1;

/** The id of the script element that carries the data in a SimpleWiki HTML file. */
const DATA_ISLAND_ID = "simplewiki-daten";

/** Maximum pages one SimpleWiki file may bring, on top of the server's own tiddler limit. */
export const DEFAULT_SIMPLEWIKI_PAGE_LIMIT = 20000;

export type SimpleWikiRejectCode =
  | "SIMPLEWIKI_VERSION_TOO_NEW"
  | "SIMPLEWIKI_FORMAT_UNKNOWN"
  | "SIMPLEWIKI_TITLE_MISSING"
  | "SIMPLEWIKI_TITLE_DUPLICATE"
  | "SIMPLEWIKI_STARTPAGE_MISSING"
  | "SIMPLEWIKI_TOO_MANY_PAGES";

export class SimpleWikiError extends Error {
  constructor(readonly code: SimpleWikiRejectCode, message: string) {
    super(message);
    this.name = "SimpleWikiError";
  }
}

export interface SimpleWikiPage {
  id?: string;
  title: string;
  content: string;
  links?: string[];
  tags?: string[];
  created?: string;
  updated?: string;
}

export interface SimpleWikiPayload {
  version: number;
  pages: SimpleWikiPage[];
  /** The title of the page the wiki opens with, empty when the file has none. */
  startTitle: string;
  language: string;
  theme: string;
}

/**
 * Whether the text looks like a SimpleWiki file at all. Cheap, and used to pick
 * a reader before anything is parsed or trusted.
 */
export function isSimpleWikiFile(text: string): boolean {
  return readPayload(text) !== undefined;
}

/**
 * The payload of a SimpleWiki file, or undefined when the text is not one.
 *
 * The data island wins over a whole file that happens to be JSON: an HTML file
 * is never valid JSON, so the two readings cannot collide.
 */
function readPayload(text: string): unknown | undefined {
  const island = readIsland(text);
  const raw = island ?? text;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  // The two markers of the format: a version and the page list. Anything else
  // is some other JSON that happens to be sitting in the same folder.
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
  const record = parsed as Record<string, unknown>;
  if (typeof record.version !== "number") return undefined;
  if (!Array.isArray(record.seiten)) return undefined;
  return parsed;
}

/** The content of the data island, if the file has one. */
function readIsland(text: string): string | undefined {
  const open = new RegExp(`<script[^>]*id=["']?${DATA_ISLAND_ID}["']?[^>]*>`, "i").exec(text);
  if (!open) return undefined;
  const start = open.index + open[0].length;
  const end = text.indexOf("</script>", start);
  return end === -1 ? undefined : text.slice(start, end);
}

/**
 * Reads and checks a SimpleWiki file. Throws SimpleWikiError with the reason a
 * person can act on; the codes are for the dialog, the sentences for the CLI.
 */
export function readSimpleWikiFile(text: string, options: { pageLimit?: number } = {}): SimpleWikiPayload {
  const raw = readPayload(text);
  if (raw === undefined) {
    throw new SimpleWikiError("SIMPLEWIKI_FORMAT_UNKNOWN",
      "This file does not contain SimpleWiki data.");
  }
  const record = raw as Record<string, unknown>;
  const version = record.version as number;
  if (!Number.isInteger(version) || version < 1) {
    throw new SimpleWikiError("SIMPLEWIKI_FORMAT_UNKNOWN",
      `This file claims SimpleWiki format version "${String(record.version)}". Only whole numbers from 1 on are known.`);
  }
  // Whole file, not a page of it: a round trip through an older server must not
  // quietly drop fields this version added.
  if (version > SIMPLEWIKI_FORMAT_VERSION) {
    throw new SimpleWikiError("SIMPLEWIKI_VERSION_TOO_NEW",
      `This file uses SimpleWiki format version ${version}; this server reads version ${SIMPLEWIKI_FORMAT_VERSION} and cannot import it.`);
  }

  const pages = record.seiten as unknown[];
  const pageLimit = options.pageLimit ?? DEFAULT_SIMPLEWIKI_PAGE_LIMIT;
  if (pages.length > pageLimit) {
    throw new SimpleWikiError("SIMPLEWIKI_TOO_MANY_PAGES",
      `This file holds ${pages.length} pages; at most ${pageLimit} are imported.`);
  }

  const seen = new Map<string, number>();
  const parsed: SimpleWikiPage[] = [];
  for (const entry of pages) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new SimpleWikiError("SIMPLEWIKI_FORMAT_UNKNOWN",
        "This file has a page that is not an object.");
    }
    const page = entry as Record<string, unknown>;
    const title = typeof page.title === "string" ? page.title.trim() : "";
    if (!title) {
      throw new SimpleWikiError("SIMPLEWIKI_TITLE_MISSING",
        "This file has a page without a title. TiddlyWiki has no tiddler without one either.");
    }
    // Titles are the identity on both sides, so two pages with one title would
    // mean one page silently overwriting the other on the way in.
    const first = seen.get(title);
    if (first !== undefined) {
      throw new SimpleWikiError("SIMPLEWIKI_TITLE_DUPLICATE",
        `This file has more than one page titled "${title}" (pages ${first + 1} and ${parsed.length + 1}); TiddlyWiki would only keep the last one.`);
    }
    seen.set(title, parsed.length);
    parsed.push({
      title,
      content: typeof page.content === "string" ? page.content : "",
      ...(typeof page.id === "string" ? { id: page.id } : {}),
      ...(stringList(page.links) ? { links: stringList(page.links) } : {}),
      ...(stringList(page.tags) ? { tags: stringList(page.tags) } : {}),
      ...(typeof page.created === "string" && page.created ? { created: page.created } : {}),
      ...(typeof page.updated === "string" && page.updated ? { updated: page.updated } : {}),
    });
  }

  // The start page is named by id and TiddlyWiki wants a title, so the two are
  // joined here. An empty file, or one whose start page is gone, opens on the
  // wiki's own default instead.
  const startId = typeof record.startseite === "string" ? record.startseite.trim() : "";
  const startPage = startId ? parsed.find(page => page.id === startId) : undefined;
  if (startId && !startPage) {
    throw new SimpleWikiError("SIMPLEWIKI_STARTPAGE_MISSING",
      `The start page of this file (id "${startId}") is not one of its pages.`);
  }

  return {
    version,
    pages: parsed,
    startTitle: startPage?.title ?? "",
    language: typeof record.sprache === "string" ? record.sprache : "",
    theme: typeof record.thema === "string" ? record.thema : "",
  };
}

/** A list field of the payload, or undefined when it is absent or empty. */
function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((row): row is string => typeof row === "string" && !!row.trim());
  return list.length ? list : undefined;
}

/**
 * The tiddler fields of a SimpleWiki file, plus the one system tiddler that
 * makes the wiki open on the page the file wanted.
 */
export function simpleWikiTiddlers(payload: SimpleWikiPayload): {
  tiddlers: TiddlerFields[];
  systemTiddlers: TiddlerFields[];
} {
  const tiddlers: TiddlerFields[] = payload.pages.map(page => ({
    title: page.title,
    text: wikiLinks(page.content),
    ...(page.tags?.length ? { tags: tiddlyWikiList(page.tags) } : {}),
    ...(page.created ? { created: tiddlyWikiDate(page.created) } : {}),
    ...(page.updated ? { modified: tiddlyWikiDate(page.updated) } : {}),
  }));
  // Not optional: a wiki whose start page is not on the first screen is not
  // what the file asked for. Only a file without a start page stays silent.
  const systemTiddlers: TiddlerFields[] = payload.startTitle
    ? [{ title: "$:/DefaultTiddlers", text: `[[${payload.startTitle}]]` }]
    : [];
  return { tiddlers, systemTiddlers };
}

/**
 * SimpleWiki tags into the TiddlyWiki list format.
 *
 * A list field lives in this store as text, not as a JSON array: every one of
 * the ~900 tags MWS wrote from a TiddlyWiki import is a string, and the import
 * of a TiddlyWiki file writes none as an array. TiddlyWiki's own
 * stringifyList does the same - an entry with a space in it is wrapped in
 * double brackets, the rest is left bare, and the entries are joined with a
 * single space. Written out here rather than borrowed from $tw, because a
 * SimpleWiki file is read without booting a TiddlyWiki at all.
 */
function tiddlyWikiList(entries: string[]): string {
  return entries
    .map(entry => (/[^\S\x00A0]/mg.test(entry) ? `[[${entry}]]` : entry))
    .join(" ");
}

/**
 * SimpleWiki dates into TiddlyWiki dates.
 * SimpleWiki writes ISO 8601 in UTC, `new Date().toISOString()`. TiddlyWiki
 * writes YYYYMMDDhhmmssSSS and its parseDate reads that form digit by digit -
 * it does not understand ISO at all, so an ISO string in `created` or
 * `modified` is read as a plausible but wrong date - "2026-10-03T…" comes out
 * as the first of January - and takes the modified-time listings and the info
 * pane with it. Both formats name the same instant in UTC, so this is a
 * reformatting and not a shift.
 *
 * A value that is not a date at all is passed through unchanged: TiddlyWiki
 * keeps such a field as the text it is, and guessing would invent a date.
 */
function tiddlyWikiDate(value: string): string {
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return value;
  const pad = (n: number, width = 2): string => String(n).padStart(width, "0");
  return pad(when.getUTCFullYear(), 4)
    + pad(when.getUTCMonth() + 1)
    + pad(when.getUTCDate())
    + pad(when.getUTCHours())
    + pad(when.getUTCMinutes())
    + pad(when.getUTCSeconds())
    + pad(when.getUTCMilliseconds(), 3);
}

/**
 * Rewrites `[Text](wiki:Title)` and `[Text](<wiki:Title>)` into TiddlyWiki's
 * `[[Text|Title]]`. Everything else in the page stays as it is, code samples
 * included: a fenced block or an inline code span may well show the syntax as
 * an example, and rewriting it there would change what the page teaches.
 */
function wikiLinks(content: string): string {
  const gaps: string[] = [];
  const blank = (region: string): string => {
    gaps.push(region);
    // A NUL cannot occur in the payload, so the placeholder cannot collide with
    // text that is only waiting to be put back.
    return `\u0000${gaps.length - 1}\u0000`;
  };
  const linked = content
    // Fenced blocks first, so their markers are gone before the inline rule runs.
    .replace(/```[\s\S]*?(?:```|$)/g, blank)
    .replace(/`[^`\n]*`/g, blank)
    .replace(
      /\[([^\][]*)\]\(\s*<?wiki:([^<>()\s][^<>()]*?)>?\s*\)/g,
      (_match, label: string, target: string) => `[[${label.trim() || target.trim()}|${target.trim()}]]`,
    );
  return linked.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => gaps[Number(index)] ?? "");
}
