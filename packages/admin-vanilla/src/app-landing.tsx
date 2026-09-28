// Public landing page shown to visitors who are not logged in. It greets them
// at "/" with the server's public information instead of dropping them onto
// the login form. All data comes from the public "GET /api/landing" endpoint
// and is restricted to anonymous-readable wikis, so no private wiki content
// ever leaks here.

import { addstyles, customElement, JSXElement, state } from "@tiddlywiki/jsx-lit";
import { t } from "./i18n";
import { getEffectiveTheme, toggleTheme, type ThemeMode } from "./theme";
import darkModeIcon from "@material-symbols/svg-400/outlined/dark_mode.svg";
import lightModeIcon from "@material-symbols/svg-400/outlined/light_mode.svg";
import closeIcon from "@material-symbols/svg-400/outlined/close.svg";
import { MaterialSymbol } from "./material-symbol";
import "./hero-locale-select";
import { openCookieConsent } from "./cookie-consent";
import css from "./app.inline.css";

type LandingWiki = {
  slug: string;
  displayName: string;
  description: string;
};

type LandingData = {
  versions: { mws: string; tw5: string[] };
  stats: { publicWikis: number; tiddlers: number; users: number; online: number };
  wikis: LandingWiki[];
  message: string | null;
  news: string | null;
  newsStyle: string | null;
  showCookieConsent: boolean;
};

const LANDING_NEWS_STYLES = ["neutral", "info", "success", "warning", "danger"] as const;

// ---------------------------------------------------------------------------
// Minimal markdown — enough for the admin-curated welcome message and news.
// Input is HTML-escaped first, so raw HTML from the settings texts can never
// be injected (the text is admin-controlled, but defense in depth is free).
// ---------------------------------------------------------------------------

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function newsStyleOf(value: string | null | undefined): (typeof LANDING_NEWS_STYLES)[number] {
  return LANDING_NEWS_STYLES.includes(value as (typeof LANDING_NEWS_STYLES)[number])
    ? (value as (typeof LANDING_NEWS_STYLES)[number])
    : "neutral";
}

function inlineMarkdown(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
    );
}

function markdownToHtml(markdown: string): string {
  const out: string[] = [];
  const listStack: string[] = [];
  const closeLists = () => {
    while (listStack.length) out.push(`</${listStack.pop()}>`);
  };

  for (const rawLine of markdown.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      closeLists();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (listStack[listStack.length - 1] !== "ul") {
        closeLists();
        listStack.push("ul");
        out.push("<ul>");
      }
      out.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }
    const ordered = /^\d+\.\s+(.*)$/.exec(line);
    if (ordered) {
      if (listStack[listStack.length - 1] !== "ol") {
        closeLists();
        listStack.push("ol");
        out.push("<ol>");
      }
      out.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      closeLists();
      out.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
      continue;
    }
    if (/^-{3,}$/.test(line)) {
      closeLists();
      out.push("<hr>");
      continue;
    }
    closeLists();
    out.push(`<p>${inlineMarkdown(line)}</p>`);
  }
  closeLists();
  return out.join("\n");
}

@addstyles(css)
@customElement("mws-landing-markdown")
export class LandingMarkdown extends JSXElement {
  useLightDOM: boolean = true;

  @state() accessor props!: { markdown: string };

  protected render() {
    this.innerHTML = markdownToHtml(this.props.markdown);
    return JSXElement.DO_NOT_RENDER;
  }
}

@addstyles(css)
@customElement("mws-landing-page")
export class LandingPage extends JSXElement {
  useLightDOM: boolean = true;

  @state() accessor props!: {};
  @state() accessor themeMode: ThemeMode = getEffectiveTheme();
  @state() accessor data: LandingData | null = null;
  @state() accessor loadError = "";
  /** From here until the end of the session the news block stays hidden. */
  @state() accessor newsDismissed = (
    typeof sessionStorage !== "undefined"
    && sessionStorage.getItem("mws-news-dismissed") === "1"
  );
  /** Fade-out in progress (mirrors the cookie-consent dismissal effect). */
  @state() accessor newsLeaving = false;

  connectedCallback(): void {
    super.connectedCallback();
    void this.load();
  }

  private readonly load = async () => {
    try {
      const response = await fetch(pathPrefix + "/api/landing");
      if (!response.ok) throw new Error(String(response.status));
      this.data = await response.json();
    } catch {
      this.loadError = t("The overview could not be loaded.");
    }
  };

  private readonly handleThemeToggle = () => {
    toggleTheme();
    this.themeMode = getEffectiveTheme();
  };

  private readonly handleNewsDismiss = () => {
    if (this.newsLeaving) return;
    try {
      sessionStorage.setItem("mws-news-dismissed", "1");
    } catch {
      // private / restricted browsing mode: still hide for this render
    }
    this.newsLeaving = true;
    window.setTimeout(() => { this.newsDismissed = true; }, 400);
  };

  private statCards(): Array<{ value: number; label: string }> {
    const stats = this.data?.stats;
    if (!stats) return [];
    return [
      { value: stats.publicWikis, label: t("Public wikis") },
      { value: stats.tiddlers, label: t("Tiddlers") },
      { value: stats.users, label: t("Users") },
      { value: stats.online, label: t("Online") },
    ];
  }

  protected render() {
    const showLocaleSelect = embeddedServerResponse.prefs?.showLocaleSelect ?? true;
    const currentTw5 = this.data?.versions.tw5.at(-1);

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
            {embeddedServerResponse.userState.isLoggedIn ? (
              <a class="primary-button login-submit landing-login-button" href={pathPrefix + "/"}>
                {t("Back to the wiki overview")}
              </a>
            ) : (
              <a class="primary-button login-submit landing-login-button" href={pathPrefix + "/login"}>
                {t("Log in")}
              </a>
            )}
          </div>
        </header>

        {this.data ? (
          <>
            {this.data.message ? (
              <section class="landing-markdown landing-message" aria-label={t("Welcome")}>
                <LandingMarkdown markdown={this.data.message} />
              </section>
            ) : null}

            {this.data.news && !this.newsDismissed ? (
              <section
                class={"landing-markdown landing-news is-" + newsStyleOf(this.data.newsStyle) + (this.newsLeaving ? " leaving" : "")}
                aria-label={t("News")}
              >
                <h2 class="landing-section-title">{t("News")}</h2>
                <LandingMarkdown markdown={this.data.news} />
                <button
                  class="landing-news-dismiss"
                  type="button"
                  aria-label={t("Hide news for this session")}
                  title={t("Hide news for this session")}
                  onclick={this.handleNewsDismiss}
                >
                  <MaterialSymbol icon={closeIcon} />
                </button>
              </section>
            ) : null}

            <section class="landing-stats" aria-label={t("Server statistics")}>
              {this.statCards().map((card) => (
                <div class="landing-stat-card">
                  <strong>{card.value.toLocaleString()}</strong>
                  <span>{card.label}</span>
                </div>
              ))}
            </section>

            <section class="landing-section" aria-label={t("Public wikis")}>
              <h2 class="landing-section-title">{t("Public wikis")}</h2>
              <p class="landing-section-copy">{t("User-created wikis")}</p>
              {this.data.wikis.length > 0 ? (
                <div class="landing-wiki-grid">
                  {this.data.wikis.map((wiki) => (
                    <a
                      class="landing-wiki-card"
                      href={pathPrefix + "/wiki/" + encodeURIComponent(wiki.slug)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <div class="landing-wiki-thumb">
                        <img
                          src={pathPrefix + "/wiki/" + encodeURIComponent(wiki.slug) + "/thumbnail"}
                          alt={wiki.displayName}
                          loading="lazy"
                          onerror={(event) => {
                            (event.currentTarget as HTMLImageElement).style.visibility = "hidden";
                          }}
                        />
                      </div>
                      <div class="landing-wiki-card-copy">
                        <strong>{wiki.displayName}</strong>
                        <p>{wiki.description || wiki.slug}</p>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p class="landing-empty">{t("No public wikis yet.")}</p>
              )}
            </section>
          </>
        ) : this.loadError ? (
          <p class="landing-empty">{this.loadError}</p>
        ) : (
          <p class="landing-empty">{t("Loading…")}</p>
        )}

        <footer class="landing-footer">
          <span class="landing-footer-heart" aria-hidden="true">{"❤️"}</span>
          <span>{t("MWS-wikiwise {version}", { version: this.data?.versions.mws ?? "" })} · {t("TiddlyWiki {version}", { version: currentTw5 ?? "" })}</span>
          <a href={pathPrefix + "/tw5/" + (currentTw5 ?? "")}>{t("TiddlyWiki docs")}</a>
          {(embeddedServerResponse.prefs?.showLegalNotice ?? true) ? (
            <a href={pathPrefix + "/legal-notice"}>{t("Legal notice")}</a>
          ) : null}
          {this.data?.showCookieConsent !== false ? (
            <button class="landing-footer-action" type="button" onclick={() => openCookieConsent(true)}>
              {t("Cookie settings")}
            </button>
          ) : null}
        </footer>
      </div>
    );
  }
}