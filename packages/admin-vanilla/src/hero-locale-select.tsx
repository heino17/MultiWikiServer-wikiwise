import { customElement, JSXElement } from "@tiddlywiki/jsx-lit";
import expandIcon from "@material-symbols/svg-400/outlined/keyboard_arrow_down.svg";
import { MaterialSymbol } from "./material-symbol";
import { getCurrentLocale, localeLabels, setCurrentLocale, supportedLocales, t, type LocaleCode } from "./i18n";

@customElement("hero-locale-select")
export class HeroLocaleSelect extends JSXElement {
  useLightDOM: boolean = true;

  private readonly selectLocale = (code: LocaleCode, event: MouseEvent) => {
    const details = (event.currentTarget as HTMLElement).closest<HTMLDetailsElement>("details");
    if (details) details.open = false;
    if (code === getCurrentLocale()) return;
    setCurrentLocale(code);
    location.reload();
  };

  render() {
    const current = getCurrentLocale();
    return (
      <details class="hero-locale-menu">
        <summary class="hero-locale-trigger">
          <span>{localeLabels[current]}</span>
          <span class="hero-locale-caret" aria-hidden="true">
            <MaterialSymbol icon={expandIcon} />
          </span>
        </summary>
        <div class="hero-locale-dropdown" role="listbox" aria-label={t("Language")}>
          {supportedLocales.map((code) => (
            <button
              class={`hero-locale-option${code === current ? " is-current" : ""}`}
              type="button"
              role="option"
              aria-selected={code === current}
              onclick={(event) => this.selectLocale(code, event)}
            >
              {localeLabels[code]}
            </button>
          ))}
        </div>
      </details>
    );
  }
}