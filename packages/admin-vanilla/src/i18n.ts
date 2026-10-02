import { deStrings } from "./locales/de";
import { enStrings } from "./locales/en";
import { esStrings } from "./locales/es";
import { frStrings } from "./locales/fr";
import { jaStrings } from "./locales/ja";
import { koStrings } from "./locales/ko";
import { ruStrings } from "./locales/ru";
import { zhCnStrings } from "./locales/zh-cn";

export type LocaleCode =
  | "en"
  | "de"
  | "es"
  | "fr"
  | "ja"
  | "ko"
  | "ru"
  | "zh-cn";

const dictionaries: Record<LocaleCode, Record<string, string>> = {
  en: enStrings,
  de: deStrings,
  es: esStrings,
  fr: frStrings,
  ja: jaStrings,
  ko: koStrings,
  ru: ruStrings,
  "zh-cn": zhCnStrings,
};

export const supportedLocales: LocaleCode[] = [
  "en",
  "de",
  "ru",
  "es",
  "fr",
  "ja",
  "ko",
  "zh-cn",
];

/** Display labels for the locale selector. */
export const localeLabels: Record<LocaleCode, string> = {
  en: "🇺🇸 American",
  de: "🇩🇪 Deutsch",
  es: "🇪🇸 Español",
  fr: "🇫🇷 Français",
  ja: "🇯🇵 日本語",
  ko: "🇰🇷 한국어",
  ru: "🇷🇺 Русский",
  "zh-cn": "🇨🇳 中文",
};

const STORAGE_KEY = "mws.admin.locale";

function normalizeLocaleCode(raw: string): LocaleCode {
  const code = raw.replace("_", "-").toLowerCase().split("-")[0];
  if (code === "de") return "de";
  if (code === "es") return "es";
  if (code === "fr") return "fr";
  if (code === "ja") return "ja";
  if (code === "ko") return "ko";
  if (code === "ru") return "ru";
  if (code === "zh") return "zh-cn";
  return "en";
}

/** The locale currently in effect (from localStorage override, else the
 *  installation-wide default, else the browser language). */
export function getCurrentLocale(): LocaleCode {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (stored) return normalizeLocaleCode(stored);
  } catch { /* storage unavailable */ }
  const defaultLocale = embeddedServerResponse?.prefs?.defaultLocale;
  if (defaultLocale) return normalizeLocaleCode(defaultLocale);
  return normalizeLocaleCode(globalThis.navigator?.language ?? "en");
}

export function setCurrentLocale(code: LocaleCode): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, code);
  } catch { /* storage unavailable */ }
}

/** Stored language override, if any (used to highlight the active option). */
export function getStoredLocale(): LocaleCode | null {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return stored ? normalizeLocaleCode(stored) : null;
  } catch {
    return null;
  }
}

/**
 * Translate a string. The English strings are the keys, so an English lookup
 * always returns the input unchanged. Interpolation placeholders are written
 * as {name} and filled from the provided params object. Numeric params are
 * grouped for the active locale, so a large count reads as "1.234.567" in
 * German and "1,234,567" in English.
 *
 * Plural support: when a numeric `count` param is passed and a dict entry with
 * the key `${key}#<plural category>` exists, that variant wins; otherwise the
 * base key is used. Categories follow Intl.PluralRules, and the app ships
 * `#one` for every language that has such a category (`en`, `de`, `es`, `fr`,
 * `ru`) plus `#few` for Russian, the only supported language that has `few`.
 * German `1` therefore resolves `#one` and everything else falls back to the
 * base key. Convention:
 *
 *   en: "{count} notes": "{count} notes",
 *       "{count} notes#one": "{count} note",
 *   de: "{count} notes": "{count} Notizen",
 *       "{count} notes#one": "{count} Notiz",
 *   ru: "{count} notes": "{count} заметок",
 *       "{count} notes#one": "{count} заметка",
 *       "{count} notes#few": "{count} заметки",
 *
 * The base key therefore has to be the form used for `many`/`other`, not for
 * `one` — Russian would read "1 заметок" otherwise. Pass `count` as a number,
 * not as a pre-formatted string: a string does not select a plural category.
 */

const pluralRulesCache = new Map<LocaleCode, Intl.PluralRules>();

function pluralCategory(code: LocaleCode, count: number): string {
  let rules = pluralRulesCache.get(code);
  if (!rules) {
    rules = new Intl.PluralRules(code);
    pluralRulesCache.set(code, rules);
  }
  return rules.select(count);
}

export function t(key: string, params?: Record<string, string | number>): string {
  const locale = getCurrentLocale();
  const dictionary = dictionaries[locale];
  let text = dictionary[key] ?? key;
  const count = params?.count;
  if (typeof count === "number") {
    const variant = dictionary[key + "#" + pluralCategory(locale, count)];
    if (variant !== undefined) text = variant;
  }
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      const rendered =
        typeof value === "number" ? value.toLocaleString(locale) : String(value);
      text = text.split("{" + name + "}").join(rendered);
    }
  }
  return text;
}