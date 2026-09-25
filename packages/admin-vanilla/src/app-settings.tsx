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