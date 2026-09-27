// Installation-wide defaults for the admin app.
//
// These settings choose the language and light/dark theme the admin app is
// served with on first load, and which features are shown. They live in the
// `settings` key/value table (keys below) so the server can inject them early
// into the served HTML. A visitor's own localStorage choice (made in the
// header's language / theme switches) always wins over these defaults.

import { zodRoute } from "@tiddlywiki/server";

export const PREF_KEYS = {
  locale: "admin.defaultLocale",
  theme: "admin.defaultTheme",
  showPinboard: "admin.showPinboard",
  showUserFiles: "admin.showUserFiles",
  showWikiUpload: "admin.showWikiUpload",
  showLocaleSelect: "admin.showLocaleSelect",
  showThumbnails: "admin.showThumbnails",
  showLoginPuzzle: "admin.showLoginPuzzle",
  thumbnailTtlHours: "admin.thumbnailTtlHours",
  showLanding: "admin.showLanding",
  landingMessage: "admin.landingMessage",
  landingNews: "admin.landingNews",
  landingNewsStyle: "admin.landingNewsStyle",
  showCookieConsent: "admin.showCookieConsent",
  legalNotice: "admin.legalNotice",
  showLegalNotice: "admin.showLegalNotice",
} as const;

/** Background-color variants for the landing news block. */
export const LANDING_NEWS_STYLES = ["neutral", "info", "success", "warning", "danger"] as const;
export type LandingNewsStyle = (typeof LANDING_NEWS_STYLES)[number];

function newsStyle(value: string | undefined | null): LandingNewsStyle {
  return LANDING_NEWS_STYLES.includes(value as LandingNewsStyle) ? (value as LandingNewsStyle) : "neutral";
}

const THEMES = ["dark", "light"] as const;
type DefaultTheme = (typeof THEMES)[number] | null;

export interface ServerPrefs {
  defaultLocale: string | null;
  defaultTheme: DefaultTheme;
  showPinboard: boolean;
  showUserFiles: boolean;
  showWikiUpload: boolean;
  showLocaleSelect: boolean;
  showThumbnails: boolean;
  /** Animal-tap puzzle on the login form ("login CAPTCHA"). */
  showLoginPuzzle: boolean;
  /** Thumbnail cache time in hours. `null` = install default (24h). */
  thumbnailTtlHours: number | null;
  /** Serve a public landing page to anonymous visitors at "/" instead of
   *  redirecting them straight to the login form. */
  showLanding: boolean;
  /** Welcome text shown on the landing page (markdown, "" = off). */
  landingMessage: string | null;
  /** News block shown on the landing page (markdown, "" = off). */
  landingNews: string | null;
  /** Background tint of the landing news block. */
  landingNewsStyle: LandingNewsStyle;
  /** Show the cookie-consent banner to visitors on their first visit. */
  showCookieConsent: boolean;
  /** Impressum / legal-notice text published on the public page (markdown). */
  legalNotice: string | null;
  /** Publish the legal-notice page and its footer links. */
  showLegalNotice: boolean;
}

const validThemes = new Set<string>(THEMES);
const ALL_KEYS: string[] = Object.values(PREF_KEYS);

/** Fresh-install defaults. Seeded once when the settings table is empty, so a
 *  brand-new server already ships pre-filled ("landing welcome text",
 *  "landing news", en/dark, thumbnail TTL 24h) and every feature switch on. */
export const INSTALL_DEFAULTS: { key: string; value: string }[] = [
  { key: PREF_KEYS.locale, value: "en" },
  { key: PREF_KEYS.theme, value: "dark" },
  { key: PREF_KEYS.showPinboard, value: "true" },
  { key: PREF_KEYS.showUserFiles, value: "true" },
  { key: PREF_KEYS.showWikiUpload, value: "true" },
  { key: PREF_KEYS.showLocaleSelect, value: "true" },
  { key: PREF_KEYS.showThumbnails, value: "true" },
  { key: PREF_KEYS.showLoginPuzzle, value: "true" },
  { key: PREF_KEYS.thumbnailTtlHours, value: "24" },
  { key: PREF_KEYS.showLanding, value: "true" },
  {
    key: PREF_KEYS.landingMessage,
    value: "A block can be displayed here permanently as a welcome message for your site...",
  },
  {
    key: PREF_KEYS.landingNews,
    value: "Here a collapsible news block for displaying brief news items...",
  },
  { key: PREF_KEYS.landingNewsStyle, value: "neutral" },
  { key: PREF_KEYS.showCookieConsent, value: "true" },
  {
    key: PREF_KEYS.legalNotice,
    value: "## Legal notice\n\n**Your company**  \nStreet 10, 12345 City, Country  \nE-Mail: office@example.com · Phone: +49 123 456 7890\n\nRegistered office / commercial register:  \nValue-added tax identification number:",
  },
  { key: PREF_KEYS.showLegalNotice, value: "true" },
];

/** Writes the install defaults for every pref key without a row yet. Keeps any
 *  value an admin has already stored. */
export async function applyInstallDefaults(prisma: PrismaTxnClient): Promise<void> {
  const existing = await prisma.settings.findMany({
    where: { key: { in: INSTALL_DEFAULTS.map((entry) => entry.key) } },
    select: { key: true },
  });
  const have = new Set(existing.map((row) => row.key));
  for (const entry of INSTALL_DEFAULTS) {
    if (have.has(entry.key)) continue;
    await prisma.settings.create({ data: { key: entry.key, value: entry.value } });
  }
}

/** Boolean prefs are stored as "true"/"false"; an absent row means the default. */
function boolPref(map: Map<string, string>, key: string, fallback: boolean): boolean {
  const raw = map.get(key);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

export async function readPrefs(prisma: PrismaTxnClient): Promise<ServerPrefs> {
  const rows = await prisma.settings.findMany({
    where: { key: { in: ALL_KEYS } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const defaultLocale = map.get(PREF_KEYS.locale)?.trim() || null;
  const rawTheme = map.get(PREF_KEYS.theme);
  const defaultTheme = rawTheme && validThemes.has(rawTheme)
    ? (rawTheme as NonNullable<DefaultTheme>)
    : null;
  const rawTtl = map.get(PREF_KEYS.thumbnailTtlHours);
  const ttlHours = rawTtl == null ? null : Number.parseInt(rawTtl, 10);
  return {
    defaultLocale,
    defaultTheme,
    showPinboard: boolPref(map, PREF_KEYS.showPinboard, true),
    showUserFiles: boolPref(map, PREF_KEYS.showUserFiles, true),
    showWikiUpload: boolPref(map, PREF_KEYS.showWikiUpload, true),
    showLocaleSelect: boolPref(map, PREF_KEYS.showLocaleSelect, true),
    showThumbnails: boolPref(map, PREF_KEYS.showThumbnails, true),
    showLoginPuzzle: boolPref(map, PREF_KEYS.showLoginPuzzle, true),
    thumbnailTtlHours: ttlHours != null && Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : null,
    showLanding: boolPref(map, PREF_KEYS.showLanding, true),
    landingMessage: map.get(PREF_KEYS.landingMessage)?.trim() || null,
    landingNews: map.get(PREF_KEYS.landingNews)?.trim() || null,
    landingNewsStyle: newsStyle(map.get(PREF_KEYS.landingNewsStyle)),
    showCookieConsent: boolPref(map, PREF_KEYS.showCookieConsent, true),
    legalNotice: map.get(PREF_KEYS.legalNotice)?.trim() || null,
    showLegalNotice: boolPref(map, PREF_KEYS.showLegalNotice, true),
  };
}

export const AdminPrefsGet = zodRoute({
  method: ["GET"],
  path: "/api/prefs",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.okUser();
    state.asserted = true;
    return await readPrefs(state.engine);
  }
});

export const AdminPrefsPut = zodRoute({
  method: ["PUT"],
  path: "/api/prefs",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodRequestBody: z => z.object({
    defaultLocale: z.string().trim().max(20).nullable(),
    defaultTheme: z.enum(THEMES).nullable(),
    showPinboard: z.boolean().nullable(),
    showUserFiles: z.boolean().nullable(),
    showWikiUpload: z.boolean().nullable(),
    showLocaleSelect: z.boolean().nullable(),
    showThumbnails: z.boolean().nullable(),
    showLoginPuzzle: z.boolean().nullable(),
    thumbnailTtlHours: z.number().int().min(1).max(2160).nullable(),
    showLanding: z.boolean().nullable(),
    landingMessage: z.string().max(2000).nullable(),
    landingNews: z.string().max(10000).nullable(),
    landingNewsStyle: z.enum(LANDING_NEWS_STYLES).nullable(),
    showCookieConsent: z.boolean().nullable(),
    legalNotice: z.string().max(20000).nullable(),
    showLegalNotice: z.boolean().nullable(),
  }),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.okAdmin();
    state.asserted = true;

    const {
      defaultLocale,
      defaultTheme,
      showPinboard,
      showUserFiles,
      showWikiUpload,
      showLocaleSelect,
      showThumbnails,
      showLoginPuzzle,
      thumbnailTtlHours,
      showLanding,
      landingMessage,
      landingNews,
      landingNewsStyle,
      showCookieConsent,
      legalNotice,
      showLegalNotice,
    } = state.data;
    const entries: { key: string; value: string }[] = [];
    if (defaultLocale) entries.push({ key: PREF_KEYS.locale, value: defaultLocale });
    if (defaultTheme) entries.push({ key: PREF_KEYS.theme, value: defaultTheme });
    if (showPinboard != null) entries.push({ key: PREF_KEYS.showPinboard, value: showPinboard ? "true" : "false" });
    if (showUserFiles != null) entries.push({ key: PREF_KEYS.showUserFiles, value: showUserFiles ? "true" : "false" });
    if (showWikiUpload != null) entries.push({ key: PREF_KEYS.showWikiUpload, value: showWikiUpload ? "true" : "false" });
    if (showLocaleSelect != null) entries.push({ key: PREF_KEYS.showLocaleSelect, value: showLocaleSelect ? "true" : "false" });
    if (showThumbnails != null) entries.push({ key: PREF_KEYS.showThumbnails, value: showThumbnails ? "true" : "false" });
    if (showLoginPuzzle != null) entries.push({ key: PREF_KEYS.showLoginPuzzle, value: showLoginPuzzle ? "true" : "false" });
    if (thumbnailTtlHours != null) entries.push({ key: PREF_KEYS.thumbnailTtlHours, value: String(thumbnailTtlHours) });
    if (showLanding != null) entries.push({ key: PREF_KEYS.showLanding, value: showLanding ? "true" : "false" });
    if (landingMessage != null) entries.push({ key: PREF_KEYS.landingMessage, value: landingMessage.trim() });
    if (landingNews != null) entries.push({ key: PREF_KEYS.landingNews, value: landingNews.trim() });
    if (landingNewsStyle != null) entries.push({ key: PREF_KEYS.landingNewsStyle, value: landingNewsStyle });
    if (showCookieConsent != null) entries.push({ key: PREF_KEYS.showCookieConsent, value: showCookieConsent ? "true" : "false" });
    if (legalNotice != null) entries.push({ key: PREF_KEYS.legalNotice, value: legalNotice.trim() });
    if (showLegalNotice != null) entries.push({ key: PREF_KEYS.showLegalNotice, value: showLegalNotice ? "true" : "false" });

    await state.$transaction(async (prisma) => {
      const keepKeys = new Set(entries.map((entry) => entry.key));
      for (const key of ALL_KEYS) {
        if (keepKeys.has(key)) continue;
        await prisma.settings.deleteMany({ where: { key } });
      }
      for (const entry of entries) {
        await prisma.settings.upsert({
          where: { key: entry.key },
          create: { key: entry.key, value: entry.value },
          update: { value: entry.value },
        });
      }
    });

    return await readPrefs(state.engine);
  }
});