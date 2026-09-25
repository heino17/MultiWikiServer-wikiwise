// Installation-wide defaults for the admin app's first paint.
//
// These settings choose the language and light/dark theme the admin app is
// served with on first load. They live in the `settings` key/value table
// (`admin.defaultLocale`, `admin.defaultTheme`) so the server can inject them
// early into the served HTML. A visitor's own localStorage choice (made in the
// header's language / theme switches) always wins over these defaults.

import { zodRoute } from "@tiddlywiki/server";

export const PREF_KEYS = {
  locale: "admin.defaultLocale",
  theme: "admin.defaultTheme",
} as const;

const THEMES = ["dark", "light"] as const;
type DefaultTheme = (typeof THEMES)[number] | null;

export interface ServerPrefs {
  defaultLocale: string | null;
  defaultTheme: DefaultTheme;
}

const validThemes = new Set<string>(THEMES);

export async function readPrefs(prisma: PrismaTxnClient): Promise<ServerPrefs> {
  const rows = await prisma.settings.findMany({
    where: { key: { in: [PREF_KEYS.locale, PREF_KEYS.theme] } },
    select: { key: true, value: true },
  });
  const map = new Map(rows.map((row) => [row.key, row.value]));
  const defaultLocale = map.get(PREF_KEYS.locale)?.trim() || null;
  const rawTheme = map.get(PREF_KEYS.theme);
  const defaultTheme = rawTheme && validThemes.has(rawTheme)
    ? (rawTheme as NonNullable<DefaultTheme>)
    : null;
  return { defaultLocale, defaultTheme };
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
  }),
  inner: async (state) => {
    state.assertReferer(["/"]);
    state.okAdmin();
    state.asserted = true;

    const { defaultLocale, defaultTheme } = state.data;
    const entries: { key: string; value: string }[] = [];
    if (defaultLocale) entries.push({ key: PREF_KEYS.locale, value: defaultLocale });
    if (defaultTheme) entries.push({ key: PREF_KEYS.theme, value: defaultTheme });

    await state.$transaction(async (prisma) => {
      const keepKeys = new Set(entries.map((entry) => entry.key));
      for (const key of [PREF_KEYS.locale, PREF_KEYS.theme]) {
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