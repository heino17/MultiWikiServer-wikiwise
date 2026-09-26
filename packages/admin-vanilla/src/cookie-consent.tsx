// Cookie-consent banner (category based).
//
// This server stores a single cookie: the "session" cookie that keeps the
// user logged in, which is strictly necessary and therefore does not need
// consent (ePrivacy/GDPR). No tracking or analytics cookies are set, and
// preferences (theme/locale) live locally in localStorage. The third-party
// ("external") category starts OFF: if external services (e.g. Google Fonts)
// are ever loaded again, they are gated behind this consent via consent.ts.
//
// The banner slides in softly at the bottom edge, offers "accept all", "only
// necessary" and a settings pane with per-category toggles, and stores the
// final decision in localStorage (not in a cookie).

import { addstyles, customElement, JSXElement, state } from "@tiddlywiki/jsx-lit";
import { t } from "./i18n";
import { getConsent, setExternalConsent } from "./consent";
import css from "./app.inline.css";

const FADE_OUT_MS = 450;

@addstyles(css)
@customElement("mws-cookie-consent")
export class CookieConsent extends JSXElement {
  useLightDOM: boolean = true;

  @state() accessor accepted = false;
  @state() accessor visible = false;
  @state() accessor showSettings = false;
  @state() accessor externalDraft = false;

  /** When true the banner forces itself open (used by the reopen controls). */
  explicitOpen = false;

  connectedCallback(): void {
    super.connectedCallback();
    if (getConsent().persisted && !this.explicitOpen) {
      this.accepted = true;
      return;
    }
    requestAnimationFrame(() => {
      this.externalDraft = getConsent().state.external;
      this.visible = true;
      if (this.explicitOpen) this.showSettings = true;
    });
  }

  private readonly handleAcceptAll = () => {
    setExternalConsent(true);
    this.dismiss();
  };

  private readonly handleOnlyNecessary = () => {
    setExternalConsent(false);
    this.dismiss();
  };

  private readonly handleOpenSettings = () => {
    this.externalDraft = getConsent().state.external;
    this.showSettings = true;
  };

  private readonly handleSaveSettings = () => {
    setExternalConsent(this.externalDraft);
    this.dismiss();
  };

  private readonly handleExternalDraft = (event: Event) => {
    this.externalDraft = (event.target as HTMLInputElement).checked;
  };

  private dismiss(): void {
    this.visible = false;
    window.setTimeout(() => this.remove(), FADE_OUT_MS);
  }

  protected render() {
    if (this.accepted) return JSXElement.DO_NOT_RENDER;
    return (
      <aside
        class={`cookie-consent${this.visible ? " show" : ""}`}
        role="dialog"
        aria-label={t("Cookie notice")}
      >
        <p class="cookie-consent-text">
          {t("We use only the cookies that are technically necessary for logging in and store preferences locally. No tracking or analytics cookies are set. Services from third parties (e.g. Google Fonts) are loaded only after your separate consent.")}
        </p>

        {this.showSettings ? (
          <div class="cookie-consent-settings">
            <label class="cookie-consent-row">
              <span class="cookie-consent-row-copy">
                <strong>{t("Necessary cookies")}</strong>
                <span>{t("Login session and local preferences (theme, language).")}</span>
              </span>
              <span class="cookie-consent-track is-checked" aria-hidden="true">
                <span class="cookie-consent-thumb" />
              </span>
              <input class="cookie-consent-input" type="checkbox" checked disabled />
            </label>
            <label class="cookie-consent-row">
              <span class="cookie-consent-row-copy">
                <strong>{t("External services")}</strong>
                <span>{t("Third-party services (e.g. Google Fonts) are loaded only after your consent.")}</span>
              </span>
              <span class={`cookie-consent-track${this.externalDraft ? " is-checked" : ""}`} aria-hidden="true">
                <span class="cookie-consent-thumb" />
              </span>
              <input
                class="cookie-consent-input"
                type="checkbox"
                checked={this.externalDraft}
                onchange={this.handleExternalDraft}
              />
            </label>
          </div>
        ) : null}

        <div class="cookie-consent-actions">
          {this.showSettings ? (
            <button class="cookie-consent-button" type="button" onclick={this.handleSaveSettings}>
              {t("Save settings")}
            </button>
          ) : (
            <>
              <button class="cookie-consent-button" type="button" onclick={this.handleAcceptAll}>
                {t("Accept all cookies")}
              </button>
              <button class="cookie-consent-button cookie-consent-button-outline" type="button" onclick={this.handleOpenSettings}>
                {t("Cookie settings")}
              </button>
              <button class="cookie-consent-button cookie-consent-button-outline" type="button" onclick={this.handleOnlyNecessary}>
                {t("Only necessary cookies")}
              </button>
            </>
          )}
        </div>
      </aside>
    );
  }
}

/**
 * Reopens the banner after it was dismissed (persistent controls in the
 * landing footer and the admin header use this), optionally directly on the
 * per-category settings pane so the visitor can revise their consent.
 */
export function openCookieConsent(settings = false): void {
  const existing = document.querySelector("mws-cookie-consent") as CookieConsent | null;
  if (existing && existing.isConnected) {
    existing.accepted = false;
    existing.externalDraft = getConsent().state.external;
    existing.showSettings = settings;
    existing.visible = true;
    return;
  }
  const element = document.createElement("mws-cookie-consent") as CookieConsent;
  element.explicitOpen = settings;
  document.body.appendChild(element);
}