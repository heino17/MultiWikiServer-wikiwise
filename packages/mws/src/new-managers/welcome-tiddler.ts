/**
 * The starting page of a one-click TiddlyWiki wiki: its title and its text,
 * written in the language the new wiki will actually show (§146).
 *
 * Two things decide that language:
 *
 * - the language the creator uses in the admin app — the request carries it —
 *   and
 * - the template: only languages it ships as plugins can be shown, so a
 *   template without language plugins (the English-only one, §142) is always
 *   English, no matter what the creator reads.
 *
 * Texts exist for the two languages MWS itself speaks. The other six languages
 * of the default template fall back to English until their texts are supplied;
 * adding one is a single entry in `WELCOME_TEXTS` (the text is data, not code).
 *
 * The language of an existing wiki cannot change later: its welcome tiddler is
 * written once at creation and only re-written when the wiki is renamed, which
 * keeps the language it was created with.
 */

/** The languages the admin app can send; it offers exactly these eight. */
export const CREATE_LOCALES = [
  "en",
  "de",
  "es",
  "fr",
  "ja",
  "ko",
  "ru",
  "zh-cn",
] as const;

export type CreateLocale = (typeof CREATE_LOCALES)[number];

/**
 * The language plugin a template must ship for a language to be usable.
 * English is the TiddlyWiki core, so it needs nothing.
 */
const LANGUAGE_PLUGINS: Record<CreateLocale, readonly string[]> = {
  en: [],
  de: ["$:/languages/de-DE"],
  es: ["$:/languages/es-ES"],
  fr: ["$:/languages/fr-FR"],
  ja: ["$:/languages/ja-JP"],
  ko: ["$:/languages/ko-KR"],
  ru: ["$:/languages/ru-RU"],
  "zh-cn": ["$:/languages/zh-Hans"],
};

/** A translated welcome tiddler. */
export interface WelcomeTranslation {
  /** Tiddler title. It is the page `$:/DefaultTiddlers` opens, so it is read. */
  readonly title: string;
  /** Starts of the auto-generated first line, newest first. */
  readonly headingPrefixes: readonly string[];
  /** A sentence only the generated text carries; identifies MWS text. */
  readonly onboarding: string;
  /**
   * The tiddler text as MWS writes it; `{{name}}` becomes the display name.
   * TiddlyWiki wiki syntax, not Markdown: `!` is a heading (`#` would start an
   * ordered list and render the line as "1. Willkommen in …").
   */
  readonly text: string;
}

/**
 * The translated texts. Adding a language is one entry here — the `satisfies`
 * keeps every entry honest and needs no change to a type union.
 */
const WELCOME_TEXTS = {
  de: {
    title: "Willkommen",
    // `#` is what wikis created before the heading fix carry (§70); accepting
    // it lets those wikis still be recognised on rename.
    headingPrefixes: ["! Willkommen in \u201e", "# Willkommen in \u201e"],
    onboarding: "per Knopfdruck f\u00fcr dich angelegt",
    text: `! Willkommen in \u201e{{name}}" \ud83c\udf89

Dieses Wiki wurde gerade per Knopfdruck f\u00fcr dich angelegt.

* Neue Tiddler schreibst du einfach, indem du einen neuen Tiddler anlegst.
* Alles wird automatisch gespeichert und ist sofort f\u00fcr andere sichtbar.

Viel Spa\u00df beim Loslegen!`,
  },
  en: {
    title: "Welcome",
    headingPrefixes: ["! Welcome to \u201c"],
    onboarding: "was just created for you with one click",
    text: `! Welcome to \u201c{{name}}\u201d \ud83c\udf89

This wiki was just created for you with one click.

* To write something new, create a tiddler.
* Everything is saved automatically and is visible to others right away.

Have fun getting started!`,
  },
} satisfies Partial<Record<CreateLocale, WelcomeTranslation>>;

/** The languages a text exists for. */
type WelcomeLanguage = keyof typeof WELCOME_TEXTS;

/** The translation for a language, or null when there is none. */
function translationFor(locale: string): WelcomeTranslation | null {
  return locale in WELCOME_TEXTS
    ? WELCOME_TEXTS[locale as WelcomeLanguage]
    : null;
}

/** Every tiddler title MWS uses for a welcome page. */
export const WELCOME_TITLES: readonly string[] =
  Object.values(WELCOME_TEXTS).map((translation) => translation.title);

/** The language a welcome tiddler was written in, recognised by its title. */
export function welcomeTranslationForTitle(
  title: string | undefined,
): WelcomeTranslation | null {
  return Object.values(WELCOME_TEXTS)
    .find((translation) => translation.title === title) ?? null;
}

/** The generated text for a display name. */
export function welcomeText(
  translation: WelcomeTranslation,
  displayName: string,
): string {
  return translation.text.replace("{{name}}", displayName);
}

/**
 * Whether a welcome tiddler still carries the text MWS wrote. Used on rename so
 * a text the owner edited is never overwritten with a generated one.
 */
export function isGeneratedWelcome(
  text: string,
  translation: WelcomeTranslation,
): boolean {
  return text.includes(translation.onboarding)
    && translation.headingPrefixes.some((prefix) => text.startsWith(prefix));
}

/** Whether the template can show a language: it must ship its plugin. */
function templateShips(locale: CreateLocale, templatePlugins: readonly string[]): boolean {
  return LANGUAGE_PLUGINS[locale].every((plugin) => templatePlugins.includes(plugin));
}

/**
 * The welcome page for a new wiki. Falls back to English when the template
 * cannot show the creator's language or when its text is not translated yet —
 * English is the TiddlyWiki core and therefore always available.
 */
export function welcomeTiddler(
  displayName: string,
  locale: CreateLocale | undefined,
  templatePlugins: readonly string[],
): { title: string; text: string } {
  // Older clients send no language. German is what every wiki got so far, so
  // a creation without it keeps its previous result.
  const requested = locale ?? "de";
  const translation = translationFor(requested);
  // English is the TiddlyWiki core and always available, so it is the fallback
  // both for an untranslated language and for one the template cannot show.
  const chosen = translation && templateShips(requested, templatePlugins)
    ? translation
    : WELCOME_TEXTS.en;
  return {
    title: chosen.title,
    text: welcomeText(chosen, displayName),
  };
}
