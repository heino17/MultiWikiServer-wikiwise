// Central consent model for cookies and similar storage technologies.
//
// Categories:
//   essential   – the "session" cookie used for logging in (strictly
//                 necessary, never requires consent per ePrivacy/GDPR).
//   preferences – locally stored UI preferences (theme, locale) kept in
//                 localStorage; functional and local, treated as necessary.
//   external    – everything that reaches a third party (Google Fonts,
//                 analytics, maps, embeds, ...). This category is OFF by
//                 default and only becomes true after explicit consent.
//
// The consent state lives in localStorage under "mws-cookie-consent" and is
// versioned. The old "v1" boolean acceptance is migrated conservatively to
// "essential + preferences only" (external was impossible at the time).

export type ConsentCategory = "essential" | "preferences" | "external";

export interface ConsentState {
  version: "v2";
  /** Always true – the login session cookie. */
  essential: true;
  /** Always true – local UI preferences (theme/locale). */
  preferences: true;
  /** Third-party loading; false until the visitor consents. */
  external: boolean;
  updatedAt: string;
}

export interface ConsentData {
  state: ConsentState;
  /** True when a (possibly migrated) decision was already stored. */
  persisted: boolean;
}

const STORAGE_KEY = "mws-cookie-consent";
const CURRENT_VERSION = "v2" as const;
const CHANGE_EVENT = "mws-consent-change";

function defaultState(external: boolean): ConsentState {
  return {
    version: CURRENT_VERSION,
    essential: true,
    preferences: true,
    external,
    updatedAt: new Date().toISOString(),
  };
}

function readRaw(): string | null {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeState(state: ConsentState): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable; the decision simply is not persisted
  }
}

/**
 * Normalizes whatever is stored. Returns null when nothing (or something
 * unusable) is stored, so the caller can decide whether a fresh prompt is due.
 * The old "v1" acceptance is migrated in place to a v2 state.
 */
function parseStored(raw: string | null): ConsentState | null {
  if (!raw) return null;
  if (raw === "v1") {
    // Old boolean acceptance predates external resources entirely.
    const migrated = defaultState(false);
    writeState(migrated);
    return migrated;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentState>;
    if (parsed && parsed.version === CURRENT_VERSION) {
      return {
        version: CURRENT_VERSION,
        essential: true,
        preferences: true,
        external: parsed.external === true,
        updatedAt: typeof parsed.updatedAt === "string"
          ? parsed.updatedAt
          : new Date().toISOString(),
      };
    }
  } catch {
    // fall through to the conservative default
  }
  return null;
}

export function getConsent(): ConsentData {
  const state = parseStored(readRaw());
  if (!state) return { state: defaultState(false), persisted: false };
  return { state, persisted: true };
}

/** "essential" and "preferences" always grant; only "external" is gated. */
export function hasConsent(category: ConsentCategory): boolean {
  switch (category) {
    case "essential":
    case "preferences":
      return true;
    case "external":
      return getConsent().state.external;
  }
}

export function setExternalConsent(external: boolean): void {
  const previous = parseStored(readRaw()) ?? defaultState(false);
  writeState({ ...previous, external, updatedAt: new Date().toISOString() });
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/**
 * Subscribes to consent changes (e.g. immediate loading of external
 * resources once the visitor accepts). Returns an unsubscribe function.
 */
export function onConsentChange(listener: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, listener);
  return () => window.removeEventListener(CHANGE_EVENT, listener);
}

/**
 * Future-proof helper for third-party resources: adds a stylesheet only when
 * the visitor consented, otherwise registers it to be loaded as soon as they
 * do. Components that would embed external services use this (or
 * hasConsent("external")) instead of hard-coding a <link>.
 */
export function applyExternalStylesheet(href: string): void {
  const marker = `data-consent-external="${CSS.escape(href)}"`;
  const insert = () => {
    if (document.head.querySelector(`link[${marker}]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-consent-external", href);
    document.head.appendChild(link);
  };
  if (hasConsent("external")) {
    insert();
    return;
  }
  onConsentChange(() => {
    if (hasConsent("external")) insert();
  });
}