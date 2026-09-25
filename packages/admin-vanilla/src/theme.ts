export type ThemeMode = "light" | "dark";
export type ThemeSetting = ThemeMode | "system";

const STORAGE_KEY = "mws.admin.theme";

export function resolveTheme(mode: ThemeMode): void {
  document.documentElement.setAttribute("data-theme", mode);
}

export function getThemeSetting(): ThemeSetting {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : "system";
}

export function setThemeSetting(setting: ThemeSetting): void {
  if (setting === "system") {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    localStorage.setItem(STORAGE_KEY, setting);
  }
}

/** The effective theme: explicit setting if any, else the installation-wide
 *  default (set in the settings page), else the system preference. */
export function getEffectiveTheme(): ThemeMode {
  const setting = getThemeSetting();
  if (setting !== "system") return setting;
  const defaultTheme = embeddedServerResponse?.prefs?.defaultTheme ?? null;
  if (defaultTheme === "dark" || defaultTheme === "light") return defaultTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function initializeTheme(): void {
  resolveTheme(getEffectiveTheme());
  // Drop the first-paint background set by the preflight script in
  // index.html now that the app stylesheet is loaded.
  document.documentElement.style.removeProperty("background-color");
}

/** Apply the other theme and persist it. */
export function toggleTheme(): ThemeMode {
  const next: ThemeMode = getEffectiveTheme() === "dark" ? "light" : "dark";
  setThemeSetting(next);
  resolveTheme(next);
  return next;
}