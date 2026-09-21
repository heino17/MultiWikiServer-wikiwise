import { readFileSync } from "fs";
import { dist_resolve } from "@tiddlywiki/server";

/**
 * German UI overrides for the MWS client plugin. The `.multids` file is the
 * single source of truth (also usable for manual/per-wiki imports); newly
 * created wikis get these tiddlers injected as starting content so the
 * upload button, notifier and bag info read German.
 */
const LANGUAGE_TIDDLERS_PATH = "../plugins/client/translations/de-DE.multids";

let cached: { title: string; text: string }[] | null = null;

export function getDefaultLanguageTiddlers(): { title: string; text: string }[] {
  if (cached) return cached;
  try {
    const raw = readFileSync(dist_resolve(LANGUAGE_TIDDLERS_PATH), "utf8");
    const prefix = raw.match(/^\s*title:\s*(.*)$/m)?.[1]?.trim() ?? "";
    const tiddlers: { title: string; text: string }[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim() || line.startsWith("#") || /^\s*title:/.test(line)) continue;
      const sep = line.indexOf(":");
      if (sep < 0) continue;
      const key = line.slice(0, sep).trim();
      const text = line.slice(sep + 1).trim();
      if (key) tiddlers.push({ title: prefix + key, text });
    }
    cached = tiddlers;
  } catch (e) {
    console.log("Warning: could not load default language tiddlers", e);
    cached = [];
  }
  return cached;
}
