// Public legal-notice ("Impressum") page. A real page (no modal) so an
// installation that goes live can publish its mandatory legal details. The
// admin edits the single text field on the Settings page; every language
// shares that one field, so whoever needs a specific wording enters it in
// their own language. The content is rendered with the same escaped
// markdown engine as the landing texts (raw HTML is not injected).

import { addstyles, customElement, JSXElement, state } from "@tiddlywiki/jsx-lit";
import { t } from "./i18n";
import { getEffectiveTheme, toggleTheme, type ThemeMode } from "./theme";
import darkModeIcon from "@material-symbols/svg-400/outlined/dark_mode.svg";
import lightModeIcon from "@material-symbols/svg-400/outlined/light_mode.svg";
import { MaterialSymbol } from "./material-symbol";
import "./hero-locale-select";
import { LandingMarkdown } from "./app-landing";
import { openCookieConsent } from "./cookie-consent";
import css from "./app.inline.css";

@addstyles(css)
@customElement("mws-legal-notice")
export class LegalNoticePage extends JSXElement {
  useLightDOM: boolean = true;

  @state() accessor content: string | null | undefined;
  @state() accessor loadError = "";
  @state() accessor themeMode: ThemeMode = getEffectiveTheme();

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private readonly load = async () => {
    try {
      const response = await fetch(pathPrefix + "/api/legal-notice");
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      this.content = typeof data.content === "string" ? data.content : null;
    } catch {
      this.loadError = t("The overview could not be loaded.");
    }
  };

  private readonly handleThemeToggle = () => {
    toggleTheme();
    this.themeMode = getEffectiveTheme();
  };

  protected render() {
    const showLocaleSelect = embeddedServerResponse.prefs?.showLocaleSelect ?? true;
    const showCookieConsent = embeddedServerResponse.prefs?.showCookieConsent ?? true;

    return (
      <div class="landing-shell">
        <header class="landing-header">
          <div class="landing-header-left">
            <p class="eyebrow landing-eyebrow">Multi-Wiki-Server - {t("Administration")}</p>
            <h1 class="landing-title">MWS<sup class="hero-wordmark-suffix">-wikiwise</sup></h1>
            <p class="hero-copy landing-tagline">{t("All your thoughts, in as many places as you need them.")}</p>
          </div>
          <div class="landing-header-actions">
            <button
              class="hero-theme-toggle"
              type="button"
              aria-label={this.themeMode === "dark" ? t("Switch to light mode") : t("Switch to dark mode")}
              title={this.themeMode === "dark" ? t("Switch to light mode") : t("Switch to dark mode")}
              onclick={this.handleThemeToggle}
            >
              <MaterialSymbol icon={this.themeMode === "dark" ? lightModeIcon : darkModeIcon} />
            </button>
            {showLocaleSelect ? (
              <hero-locale-select />
            ) : null}
            <a class="primary-button login-submit landing-login-button" href={pathPrefix + "/"}>
              {t("Back to the wiki overview")}
            </a>
          </div>
        </header>

        {this.content === undefined ? (
          this.loadError ? (
            <p class="landing-empty">{this.loadError}</p>
          ) : (
            <p class="landing-empty">{t("Loading…")}</p>
          )
        ) : this.content ? (
          <section class="landing-markdown legal-notice-card" aria-label={t("Legal notice")}>
            <LandingMarkdown markdown={this.content} />
          </section>
        ) : (
          <section class="landing-markdown legal-notice-card" aria-label={t("Legal notice")}>
            <h2 class="landing-section-title">{t("Legal notice")}</h2>
            <p class="landing-empty">{t("No legal notice has been published yet.")}</p>
          </section>
        )}

        <footer class="landing-footer">
          <span class="landing-footer-heart" aria-hidden="true">{"❤️"}</span>
          <span><a href="https://github.com/heino17/MultiWikiServer-wikiwise" target="_blank" rel="noreferrer">{t("MWS-wikiwise {version}", { version: embeddedServerResponse.mwsVersion ?? "" })}</a> · {t("TiddlyWiki {version}", { version: embeddedServerResponse.tw5Versions.slice(-1)[0] ?? "" })}</span>
          <a href={pathPrefix + "/"}>{t("Back to the start page")}</a>
          {(embeddedServerResponse.prefs?.showLegalNotice ?? true) ? (
            <a href={pathPrefix + "/legal-notice"}>{t("Legal notice")}</a>
          ) : null}
          {showCookieConsent ? (
            <button class="landing-footer-action" type="button" onclick={() => openCookieConsent(true)}>
              {t("Cookie settings")}
            </button>
          ) : null}
        </footer>
      </div>
    );
  }
}