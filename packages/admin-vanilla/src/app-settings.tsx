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
        }),
      });
      this.message = t("Settings saved.");
    } catch {
      this.error = t("Failed to save settings.");
    } finally {
      this.isSubmitting = false;
    }
  };

  protected render() {
    return (
      <div class="admin-shell">
        <section class="modal-card" aria-label={t("Settings")} style="max-width: 30rem; margin: 0 auto; width: 100%;">
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

            {this.isAdmin ? (
              <p class="settings-hint">{t("A visitor's own language or theme choice always wins.")}</p>
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