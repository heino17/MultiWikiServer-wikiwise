import { addstyles, customElement, JSXElement, state } from "@tiddlywiki/jsx-lit";
import css from "./app.inline.css";
import accountCircleIcon from "@material-symbols/svg-400/outlined/account_circle.svg";
import darkModeIcon from "@material-symbols/svg-400/outlined/dark_mode.svg";
import lightModeIcon from "@material-symbols/svg-400/outlined/light_mode.svg";
import settingsIcon from "@material-symbols/svg-400/outlined/settings.svg";
import publicIcon from "@material-symbols/svg-400/outlined/public.svg";
import { MaterialSymbol } from "./material-symbol";
import { logout } from "./passwords";
import { t } from "./i18n";
import { getEffectiveTheme, toggleTheme, ThemeMode } from "./theme";
import "./hero-locale-select";

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "mws-app-header": {};
    }
  }
}

/** Feature switch from the settings table; an absent pref means "on". */
function featurePref(name: "showLocaleSelect"): boolean {
  return embeddedServerResponse.prefs?.[name] ?? true;
}

/** The admin header as the overview pages render it: wordmark, tagline and
 *  the account shell with theme toggle, locale select, and account menu.
 *  Settings/Profile render it too, so every logged-in page looks alike. */
@addstyles(css)
@customElement("mws-app-header")
export class AppHeader extends JSXElement {
  useLightDOM = true;

  @state() accessor themeMode: ThemeMode = getEffectiveTheme();

  private readonly handleThemeToggle = () => {
    toggleTheme();
    this.themeMode = getEffectiveTheme();
  };

  protected render() {
    const isAdmin = embeddedServerResponse.userState.isAdmin;
    return (
      <header class="hero-panel">
        <div class="hero-panel-content">
          <p class="eyebrow">Multi-Wiki-Server - {t("Administration")}</p>
          <h1 style="display:flex; gap: 1rem; align-items:center;">
            <span>MWS<sup class="hero-wordmark-suffix">-wikiwise</sup></span>
          </h1>
          <p class="hero-copy">{t("All your thoughts, in as many places as you need them.")}</p>
        </div>
        <div class="hero-account-shell">
          <button
            class="hero-theme-toggle"
            type="button"
            aria-label={this.themeMode === "dark" ? t("Switch to light mode") : t("Switch to dark mode")}
            title={this.themeMode === "dark" ? t("Switch to light mode") : t("Switch to dark mode")}
            onclick={this.handleThemeToggle}
          >
            <MaterialSymbol icon={this.themeMode === "dark" ? lightModeIcon : darkModeIcon} />
          </button>
          {featurePref("showLocaleSelect") ? (
            <hero-locale-select />
          ) : null}
          {embeddedServerResponse.prefs?.showLanding !== false ? (
            <a
              class="hero-settings-button"
              href={pathPrefix + "/landing"}
              aria-label={t("Public start page")}
              title={t("Public start page")}
            >
              <MaterialSymbol icon={publicIcon} />
            </a>
          ) : null}
          {isAdmin ? (
            <button
              class="hero-settings-button"
              type="button"
              aria-label={t("Settings")}
              title={t("Settings")}
              onclick={() => { location.pathname = pathPrefix + "/settings"; }}
            >
              <MaterialSymbol icon={settingsIcon} />
            </button>
          ) : null}
          <details class="hero-account-menu">
            <summary class="hero-account-trigger" aria-label={t("Open account menu")}>
              <span class="hero-account-name">{embeddedServerResponse.userState.username}</span>
              <span class="hero-account-icon" aria-hidden="true">
                {embeddedServerResponse.userState.avatarUrl
                  ? <img src={embeddedServerResponse.userState.avatarUrl} />
                  : <MaterialSymbol icon={accountCircleIcon} />}
              </span>
            </summary>
            <div class="hero-account-dropdown" role="menu" aria-label={t("Account options")}>
              <button
                class="hero-account-action"
                type="button"
                role="menuitem"
                onclick={() => {
                  location.pathname = pathPrefix + "/profile";
                }}
              >
                {t("Profile")}
              </button>
              <button
                class="hero-account-action"
                type="button"
                role="menuitem"
                onclick={logout}
              >
                {t("Logout")}
              </button>
            </div>
          </details>
        </div>
      </header>
    );
  }
}