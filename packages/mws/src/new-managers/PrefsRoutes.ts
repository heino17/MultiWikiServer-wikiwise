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
  thumbnailTtlHours: "admin.thumbnailTtlHours",
} as const;

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
  /** Thumbnail cache time in hours. `null` = install default (24h). */
  thumbnailTtlHours: number | null;
}

const validThemes = new Set<string>(THEMES);
const ALL_KEYS: string[] = Object.values(PREF_KEYS);

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
    thumbnailTtlHours: ttlHours != null && Number.isFinite(ttlHours) && ttlHours > 0 ? ttlHours : null,
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
    thumbnailTtlHours: z.number().int().min(1).max(2160).nullable(),
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
      thumbnailTtlHours,
    } = state.data;
    const entries: { key: string; value: string }[] = [];
    if (defaultLocale) entries.push({ key: PREF_KEYS.locale, value: defaultLocale });
    if (defaultTheme) entries.push({ key: PREF_KEYS.theme, value: defaultTheme });
    if (showPinboard != null) entries.push({ key: PREF_KEYS.showPinboard, value: showPinboard ? "true" : "false" });
    if (showUserFiles != null) entries.push({ key: PREF_KEYS.showUserFiles, value: showUserFiles ? "true" : "false" });
    if (showWikiUpload != null) entries.push({ key: PREF_KEYS.showWikiUpload, value: showWikiUpload ? "true" : "false" });
    if (showLocaleSelect != null) entries.push({ key: PREF_KEYS.showLocaleSelect, value: showLocaleSelect ? "true" : "false" });
    if (showThumbnails != null) entries.push({ key: PREF_KEYS.showThumbnails, value: showThumbnails ? "true" : "false" });
    if (thumbnailTtlHours != null) entries.push({ key: PREF_KEYS.thumbnailTtlHours, value: String(thumbnailTtlHours) });

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