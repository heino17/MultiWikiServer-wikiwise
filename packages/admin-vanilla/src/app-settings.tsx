import { addstyles, customElement, JSXElement, state } from "@tiddlywiki/jsx-lit";
import css from "./app.inline.css";
import { localeLabels, supportedLocales, t } from "./i18n";

async function apiJson(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(pathPrefix + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "TiddlyWiki",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  if (response.status !== 200) throw new Error(text);
  return text ? JSON.parse(text) : null;
}

const themeOptions = [
  { value: "", labelKey: "Follow system theme" },
  { value: "light", labelKey: "Light theme" },
  { value: "dark", labelKey: "Dark theme" },
] as const;

const newsStyleOptions = [
  { value: "neutral", labelKey: "Neutral" },
  { value: "info", labelKey: "Info" },
  { value: "success", labelKey: "Success" },
  { value: "warning", labelKey: "Warning" },
  { value: "danger", labelKey: "Danger" },
] as const;

@addstyles(css)

@addstyles(css)
@customElement("mws-settings-form")
export class SettingsForm extends JSXElement {
  useLightDOM = true;

  @state() accessor props!: {};

  @state() accessor locale: string = embeddedServerResponse.prefs?.defaultLocale ?? "";
  @state() accessor theme: string = embeddedServerResponse.prefs?.defaultTheme ?? "";

  @state() accessor showPinboard = embeddedServerResponse.prefs?.showPinboard ?? true;
  @state() accessor showUserFiles = embeddedServerResponse.prefs?.showUserFiles ?? true;
  @state() accessor showWikiUpload = embeddedServerResponse.prefs?.showWikiUpload ?? true;
  @state() accessor showLocaleSelect = embeddedServerResponse.prefs?.showLocaleSelect ?? true;
  @state() accessor showThumbnails = embeddedServerResponse.prefs?.showThumbnails ?? true;
  @state() accessor showLoginPuzzle = embeddedServerResponse.prefs?.showLoginPuzzle ?? true;
  @state() accessor showCookieConsent = embeddedServerResponse.prefs?.showCookieConsent ?? true;

  @state() accessor thumbnailTtlHours = embeddedServerResponse.prefs?.thumbnailTtlHours ?? null;

  @state() accessor showLanding = embeddedServerResponse.prefs?.showLanding ?? true;

  @state() accessor landingMessage = embeddedServerResponse.prefs?.landingMessage ?? "";

  @state() accessor landingNews = embeddedServerResponse.prefs?.landingNews ?? "";

  @state() accessor landingNewsStyle = embeddedServerResponse.prefs?.landingNewsStyle ?? "neutral";

  @state() accessor legalNotice = embeddedServerResponse.prefs?.legalNotice ?? "";

  @state() accessor showLegalNotice = embeddedServerResponse.prefs?.showLegalNotice ?? true;

  @state() accessor isSubmitting = false;
  @state() accessor message = "";
  @state() accessor error = "";

  private readonly isAdmin = embeddedServerResponse.userState.isAdmin;

  private touched = false;

  connectedCallback(): void {
    super.connectedCallback();
    void this.loadPrefs();
  }

  private readonly loadPrefs = async () => {
    try {
      const prefs = await apiJson("/api/prefs");
      if (this.touched || !prefs) return;
      if (typeof prefs.defaultLocale === "string") this.locale = prefs.defaultLocale;
      if (prefs.defaultTheme === "dark" || prefs.defaultTheme === "light") this.theme = prefs.defaultTheme;
      if (typeof prefs.showPinboard === "boolean") this.showPinboard = prefs.showPinboard;
      if (typeof prefs.showUserFiles === "boolean") this.showUserFiles = prefs.showUserFiles;
      if (typeof prefs.showWikiUpload === "boolean") this.showWikiUpload = prefs.showWikiUpload;
      if (typeof prefs.showLocaleSelect === "boolean") this.showLocaleSelect = prefs.showLocaleSelect;
      if (typeof prefs.showThumbnails === "boolean") this.showThumbnails = prefs.showThumbnails;
      if (typeof prefs.showLoginPuzzle === "boolean") this.showLoginPuzzle = prefs.showLoginPuzzle;
      if (typeof prefs.thumbnailTtlHours === "number") this.thumbnailTtlHours = prefs.thumbnailTtlHours;
      if (typeof prefs.showLanding === "boolean") this.showLanding = prefs.showLanding;
      if (typeof prefs.landingMessage === "string") this.landingMessage = prefs.landingMessage;
      if (typeof prefs.landingNews === "string") this.landingNews = prefs.landingNews;
      if (typeof prefs.landingNewsStyle === "string") this.landingNewsStyle = prefs.landingNewsStyle;
      if (typeof prefs.showCookieConsent === "boolean") this.showCookieConsent = prefs.showCookieConsent;
      if (typeof prefs.legalNotice === "string") this.legalNotice = prefs.legalNotice;
      if (typeof prefs.showLegalNotice === "boolean") this.showLegalNotice = prefs.showLegalNotice;
      if (!this.showUserFiles) this.showWikiUpload = false;
    } catch {
      // keep the embedded values
    }
  };

  private readonly onCancel = async () => {
    location.pathname = pathPrefix + "/";
  };

  private readonly handleSave = async () => {
    if (!this.isAdmin || this.isSubmitting) return;
    this.isSubmitting = true;
    this.message = "";
    this.error = "";
    try {
      await apiJson("/api/prefs", {
        method: "PUT",
        body: JSON.stringify({
          defaultLocale: this.locale || null,
          defaultTheme: this.theme || null,
          showPinboard: this.showPinboard,
          // "Upload files from wikis" only makes sense while "My files" is on.
          showUserFiles: this.showUserFiles,
          showWikiUpload: this.showUserFiles && this.showWikiUpload,
          showLocaleSelect: this.showLocaleSelect,
          showThumbnails: this.showThumbnails,
          showLoginPuzzle: this.showLoginPuzzle,
          thumbnailTtlHours: this.thumbnailTtlHours,
          showLanding: this.showLanding,
          landingMessage: this.landingMessage.trim() || null,
          landingNews: this.landingNews.trim() || null,
          landingNewsStyle: this.landingNewsStyle,
          showCookieConsent: this.showCookieConsent,
          legalNotice: this.legalNotice.trim() || null,
          showLegalNotice: this.showLegalNotice,
        }),
      });
      // Saved — head back to the overview right away. The "Close" button
      // stays for leaving without saving.
      location.pathname = pathPrefix + "/";
    } catch {
      this.error = t("Failed to save settings.");
    } finally {
      this.isSubmitting = false;
    }
  };

  private readonly onPinboardChange = (checked: boolean) => { this.touched = true; this.showPinboard = checked; };

  private readonly onLocaleSelectChange = (checked: boolean) => { this.touched = true; this.showLocaleSelect = checked; };

  private readonly onThumbnailsChange = (checked: boolean) => { this.touched = true; this.showThumbnails = checked; };

  private readonly onLoginPuzzleChange = (checked: boolean) => { this.touched = true; this.showLoginPuzzle = checked; };

  private readonly onCookieConsentChange = (checked: boolean) => { this.touched = true; this.showCookieConsent = checked; };

  private readonly onLegalNoticeChange = (value: string) => { this.touched = true; this.legalNotice = value; };

  private readonly onShowLegalNoticeChange = (checked: boolean) => { this.touched = true; this.showLegalNotice = checked; };

  private readonly onLandingChange = (checked: boolean) => { this.touched = true; this.showLanding = checked; };

  private readonly onLandingMessageChange = (value: string) => { this.touched = true; this.landingMessage = value; };

  private readonly onLandingNewsChange = (value: string) => { this.touched = true; this.landingNews = value; };

  private readonly onThumbnailTtlChange = (value: string) => {
    this.touched = true;
    if (value.trim() === "") {
      this.thumbnailTtlHours = null;
      return;
    }
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 2160) this.thumbnailTtlHours = parsed;
  };

  private readonly onUserFilesChange = (checked: boolean) => {
    this.touched = true;
    this.showUserFiles = checked;
    if (!checked) this.showWikiUpload = false;
  };

  private readonly onWikiUploadChange = (checked: boolean) => {
    if (!this.showUserFiles) return;
    this.touched = true;
    this.showWikiUpload = checked;
  };

  protected render() {
    return (
      <div class="admin-shell">
        <section class="modal-card" aria-label={t("Settings")} style="max-width: 34rem; margin: 0 auto; width: 100%;">
          <header class="login-card-header">
            <div class="login-card-title">
              <h3>{t("Settings")}</h3>
              <p class="login-card-copy">{t("Choose the language and theme every visitor sees on their first load.")}</p>
            </div>
          </header>

          <div class="login-card-body">
            <div class="login-fields">
              <div class="login-field">
                <span class="login-field-label">{t("Language on first load")}</span>
                <select
                  class="field-select"
                  disabled={!this.isAdmin}
                  onchange={(event) => { this.touched = true; this.locale = (event.target as HTMLSelectElement).value; }}
                >
                  <option value="" selected={this.locale === ""}>{t("Follow browser language")}</option>
                  {supportedLocales.map((code) => (
                    <option value={code} selected={this.locale === code}>{localeLabels[code]}</option>
                  ))}
                </select>
              </div>

              <div class="login-field">
                <span class="login-field-label">{t("Theme on first load")}</span>
                <select
                  class="field-select"
                  disabled={!this.isAdmin}
                  onchange={(event) => { this.touched = true; this.theme = (event.target as HTMLSelectElement).value; }}
                >
                  {themeOptions.map((option) => (
                    <option value={option.value} selected={this.theme === option.value}>{t(option.labelKey)}</option>
                  ))}
                </select>
              </div>
            </div>

            <div class="login-field">
              <span class="login-field-label">{t("Features")}</span>
              <div class="settings-toggle-list">
                <label class="settings-toggle-row">
                  <span class="settings-toggle-copy">
                    <strong>{t("Show pinboard")}</strong>
                    <p>{t("A wall of notes for everyone.")}</p>
                  </span>
                  <input
                    class="header-switch-input"
                    type="checkbox"
                    checked={this.showPinboard}
                    disabled={!this.isAdmin}
                    onchange={(event) => this.onPinboardChange((event.currentTarget as HTMLInputElement).checked)}
                  />
                  <span class={this.showPinboard ? "header-switch-track is-checked" : "header-switch-track"} aria-hidden="true">
                    <span class="header-switch-thumb"></span>
                  </span>
                </label>

                <label class="settings-toggle-row">
                  <span class="settings-toggle-copy">
                    <strong>{t("Show \"My files\"")}</strong>
                    <p>{t("Per-account file uploads and shares.")}</p>
                  </span>
                  <input
                    class="header-switch-input"
                    type="checkbox"
                    checked={this.showUserFiles}
                    disabled={!this.isAdmin}
                    onchange={(event) => this.onUserFilesChange((event.currentTarget as HTMLInputElement).checked)}
                  />
                  <span class={this.showUserFiles ? "header-switch-track is-checked" : "header-switch-track"} aria-hidden="true">
                    <span class="header-switch-thumb"></span>
                  </span>
                </label>

                <label class={"settings-toggle-row" + (this.showUserFiles ? "" : " is-disabled")}>
                  <span class="settings-toggle-copy">
                    <strong>{t("Upload files from wikis")}</strong>
                    <p>{this.showUserFiles
                      ? t("Lets the wiki toolbox upload files into the owner's files.")
                      : t("Requires \"My files\".")}</p>
                  </span>
                  <input
                    class="header-switch-input"
                    type="checkbox"
                    checked={this.showUserFiles && this.showWikiUpload}
                    disabled={!this.isAdmin || !this.showUserFiles}
                    onchange={(event) => this.onWikiUploadChange((event.currentTarget as HTMLInputElement).checked)}
                  />
                  <span class={this.showUserFiles && this.showWikiUpload ? "header-switch-track is-checked" : "header-switch-track"} aria-hidden="true">
                    <span class="header-switch-thumb"></span>
                  </span>
                </label>

                <label class="settings-toggle-row">
                  <span class="settings-toggle-copy">
                    <strong>{t("Show the language selector")}</strong>
                    <p>{t("The language dropdown in the header.")}</p>
                  </span>
                  <input
                    class="header-switch-input"
                    type="checkbox"
                    checked={this.showLocaleSelect}
                    disabled={!this.isAdmin}
                    onchange={(event) => this.onLocaleSelectChange((event.currentTarget as HTMLInputElement).checked)}
                  />
                  <span class={this.showLocaleSelect ? "header-switch-track is-checked" : "header-switch-track"} aria-hidden="true">
                    <span class="header-switch-thumb"></span>
                  </span>
                </label>

                <label class="settings-toggle-row">
                  <span class="settings-toggle-copy">
                    <strong>{t("Login animal puzzle")}</strong>
                    <p>{t("Tap all the animals before logging in.")}</p>
                  </span>
                  <input
                    class="header-switch-input"
                    type="checkbox"
                    checked={this.showLoginPuzzle}
                    disabled={!this.isAdmin}
                    onchange={(event) => this.onLoginPuzzleChange((event.currentTarget as HTMLInputElement).checked)}
                  />
                  <span class={this.showLoginPuzzle ? "header-switch-track is-checked" : "header-switch-track"} aria-hidden="true">
                    <span class="header-switch-thumb"></span>
                  </span>
                </label>

                <label class="settings-toggle-row">
                  <span class="settings-toggle-copy">
                    <strong>{t("Show wiki thumbnails")}</strong>
                    <p>{t("Screenshot previews in the Wikis list.")}</p>
                  </span>
                  <input
                    class="header-switch-input"
                    type="checkbox"
                    checked={this.showThumbnails}
                    disabled={!this.isAdmin}
                    onchange={(event) => this.onThumbnailsChange((event.currentTarget as HTMLInputElement).checked)}
                  />
                  <span class={this.showThumbnails ? "header-switch-track is-checked" : "header-switch-track"} aria-hidden="true">
                    <span class="header-switch-thumb"></span>
                  </span>
                </label>

                <label class="settings-toggle-row">
                  <span class="settings-toggle-copy">
                    <strong>{t("Show the cookie consent")}</strong>
                    <p>{t("The cookie notice shown to visitors on their first visit.")}</p>
                  </span>
                  <input
                    class="header-switch-input"
                    type="checkbox"
                    checked={this.showCookieConsent}
                    disabled={!this.isAdmin}
                    onchange={(event) => this.onCookieConsentChange((event.currentTarget as HTMLInputElement).checked)}
                  />
                  <span class={this.showCookieConsent ? "header-switch-track is-checked" : "header-switch-track"} aria-hidden="true">
                    <span class="header-switch-thumb"></span>
                  </span>
                </label>

                <div class="settings-toggle-row is-input-row">
                  <span class="settings-toggle-copy">
                    <strong>{t("Thumbnail cache time (hours)")}</strong>
                    <p>{t("How long a wiki's screenshot preview stays cached. Leave empty to use the default of 24 hours.")}</p>
                  </span>
                  <input
                    class="field-input settings-number-input"
                    type="number"
                    min="1"
                    max="2160"
                    step="1"
                    value={this.thumbnailTtlHours ?? ""}
                    disabled={!this.isAdmin}
                    oninput={(event) => this.onThumbnailTtlChange((event.target as HTMLInputElement).value)}
                  />
                </div>

                <label class="settings-toggle-row">
                  <span class="settings-toggle-copy">
                    <strong>{t("Show the public landing page")}</strong>
                    <p>{t("Anonymous visitors get an overview with statistics and the public wikis instead of the login form.")}</p>
                  </span>
                  <input
                    class="header-switch-input"
                    type="checkbox"
                    checked={this.showLanding}
                    disabled={!this.isAdmin}
                    onchange={(event) => this.onLandingChange((event.currentTarget as HTMLInputElement).checked)}
                  />
                  <span class={this.showLanding ? "header-switch-track is-checked" : "header-switch-track"} aria-hidden="true">
                    <span class="header-switch-thumb"></span>
                  </span>
                </label>

                <div class="settings-toggle-row settings-text-field">
                  <span class="settings-toggle-copy">
                    <strong>{t("Landing welcome message")}</strong>
                    <p>{t("A welcome text on the public page. Markdown is supported.")}</p>
                  </span>
                  <textarea
                    class="field-textarea settings-textarea"
                    rows="4"
                    placeholder={t("A welcome text on the public page. Markdown is supported.")}
                    disabled={!this.isAdmin}
                    ref={(element) => { if (element && element.value !== this.landingMessage) element.value = this.landingMessage; }}
                    oninput={(event) => this.onLandingMessageChange((event.target as HTMLTextAreaElement).value)}
                  ></textarea>
                </div>

                <div class="settings-toggle-row settings-text-field">
                  <span class="settings-toggle-copy">
                    <strong>{t("Landing news")}</strong>
                    <p>{t("A collapsible block visitors can close with the X for the rest of their session. Markdown is supported.")}</p>
                  </span>
                  <textarea
                    class="field-textarea settings-textarea"
                    rows="4"
                    placeholder={t("News shown on the public page. Markdown is supported.")}
                    disabled={!this.isAdmin}
                    ref={(element) => { if (element && element.value !== this.landingNews) element.value = this.landingNews; }}
                    oninput={(event) => this.onLandingNewsChange((event.target as HTMLTextAreaElement).value)}
                  ></textarea>
                </div>

                <div class="settings-toggle-row is-input-row">
                  <span class="settings-toggle-copy">
                    <strong>{t("News block style")}</strong>
                    <p>{t("Background of the news block on the public page, e.g. reddish for an important notice.")}</p>
                  </span>
                  <span class="news-style-picker">
                    <span class={"news-style-swatch is-" + this.landingNewsStyle} aria-hidden="true"></span>
                    <select
                      class="field-select"
                      disabled={!this.isAdmin}
                      onchange={(event) => { this.touched = true; this.landingNewsStyle = (event.target as HTMLSelectElement).value; }}
                    >
                      {newsStyleOptions.map((option) => (
                        <option value={option.value} selected={this.landingNewsStyle === option.value}>{t(option.labelKey)}</option>
                      ))}
                    </select>
                  </span>
                </div>

                <label class="settings-toggle-row">
                  <span class="settings-toggle-copy">
                    <strong>{t("Show the legal notice")}</strong>
                    <p>{t("Show or hide the Impressum page and the links to it in the footers.")}</p>
                  </span>
                  <input
                    class="header-switch-input"
                    type="checkbox"
                    checked={this.showLegalNotice}
                    disabled={!this.isAdmin}
                    onchange={(event) => this.onShowLegalNoticeChange((event.currentTarget as HTMLInputElement).checked)}
                  />
                  <span class={this.showLegalNotice ? "header-switch-track is-checked" : "header-switch-track"} aria-hidden="true">
                    <span class="header-switch-thumb"></span>
                  </span>
                </label>

                <div class="settings-toggle-row settings-text-field">
                  <span class="settings-toggle-copy">
                    <strong>{t("Legal notice")}</strong>
                    <p>{t("The Impressum text published on the public page. Markdown is supported.")}</p>
                  </span>
                  <textarea
                    class="field-textarea settings-textarea"
                    rows="6"
                    placeholder={t("The Impressum text published on the public page. Markdown is supported.")}
                    disabled={!this.isAdmin}
                    ref={(element) => { if (element && element.value !== this.legalNotice) element.value = this.legalNotice; }}
                    oninput={(event) => this.onLegalNoticeChange((event.target as HTMLTextAreaElement).value)}
                  ></textarea>
                </div>
              </div>
            </div>

            {this.isAdmin ? (
              <p class="settings-hint">{t("A visitor's own language or theme choice always wins. Feature switches apply to everyone.")}</p>
            ) : (
              <p class="settings-hint">{t("Only administrators can change installation-wide defaults.")}</p>
            )}

            {(this.message || this.error) ? (
              <div class="login-feedback" role="status" aria-live="polite">
                <p>{this.error || this.message}</p>
              </div>
            ) : null}

            <footer class="login-actions">
              <div class="login-action-row">
                <button class="ghost-button" type="button" disabled={this.isSubmitting} onclick={this.onCancel}>
                  {t("Close")}
                </button>
                {this.isAdmin ? (
                  <button
                    class="primary-button login-submit"
                    type="button"
                    disabled={this.isSubmitting}
                    onclick={this.handleSave}
                  >
                    {t("Save settings")}
                  </button>
                ) : null}
              </div>
            </footer>
          </div>
        </section>
      </div>
    );
  }
}