import { customElement, JSXElement, state } from "@tiddlywiki/jsx-lit";
import closeIcon from "@material-symbols/svg-400/outlined/close.svg";
import uploadIcon from "@material-symbols/svg-400/outlined/upload.svg";
import historyIcon from "@material-symbols/svg-400/outlined/history.svg";
import restoreIcon from "@material-symbols/svg-400/outlined/settings_backup_restore.svg";
import { MaterialSymbol } from "./material-symbol";
import { t } from "./i18n";
import { formatStorageErrorForDisplay, prettifyBytes, renderErrorBanner } from "./helpers";

export interface WikiFileImportProps {
  /** Wikis the dialog may target. Passed in so the component stays free of
   *  store internals; the app filters it to what the person may see. */
  wikis: readonly { slug: string; displayName: string }[];
  onClose: () => void;
  /** Fired after a successful import so the app can reload its lists: the
   *  import changes the target wiki behind the dialog. */
  onDone: () => void;
  /** Called with the imported wiki when the person wants to undo the import.
   *  The app closes this dialog and opens the snapshot dialog for that wiki. */
  onRestoreSnapshots: (slug: string) => void;
}

interface SampleList {
  count: number;
  titles: string[];
}

interface InspectResponse {
  file: {
    kind: string;
    twVersion: string;
    store: string;
    filename: string;
    sizeBytes: number;
    sizeText: string;
    siteTitle: string;
    tiddlerCount: number;
    systemTiddlerCount: number;
    pluginTiddlerCount: number;
  };
  target: {
    create: boolean;
    slug: string;
    bagName: string;
    displayName: string;
    templateName: string | null;
  };
  includeSystem: boolean;
  includePlugins: boolean;
  plan: {
    mode: string;
    bagName: string;
    fileTiddlers: number;
    existing: number;
    created: SampleList;
    updated: SampleList;
    unchanged: number;
    deleted: SampleList;
    keptSystem: SampleList;
    skippedSystem: number;
    keptPlugins: SampleList;
    skippedPlugins: SampleList;
    skippedPluginReasons: { title: string; reasonCode: "not-wanted" | "no-version" | "version-mismatch"; reason: string }[];
    skippedTransient: SampleList;
    language: {
      wanted: string;
      packTitle?: string;
      delivered: boolean;
      reasonCode?: "not-wanted" | "no-pack";
      reason?: string;
    } | null;
    dropped: { title: string; reason: string }[];
    snapshots: boolean;
  };
  system: {
    count: number;
    tiddlers: { title: string; text: string; hasText: boolean }[];
  };
}

interface ImportResponse {
  slug: string;
  bagName: string;
  displayName: string;
  create: boolean;
  result: { written: number; deleted: number; unchanged: number };
  snapshot: { bagName: string; created: string; count: number } | null;
}

type TargetKind = "new" | "existing";
type ImportMode = "replace" | "merge";

/** Mirrors `sanitizeSlugPart()` on the server (TabDataAdapter.ts): the dialog
 *  only suggests a slug, the server has the last word and may add a number to
 *  make it unique. Duplicated on purpose — importing the server module would
 *  drag Prisma into the browser bundle. */
function sanitizeSlugPart(input: string): string {
  return input.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

async function wikiFileApiJson(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(pathPrefix + path, {
    ...init,
    headers: {
      "X-Requested-With": "TiddlyWiki",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  if (response.status !== 200) throw new Error(text || `HTTP ${response.status}`);
  return text ? JSON.parse(text) : null;
}

@customElement("mws-wiki-file-import")
export class WikiFileImportDialog extends JSXElement {
  useLightDOM = true;

  @state() accessor props!: WikiFileImportProps;
  @state() accessor file: File | null = null;
  @state() accessor targetKind: TargetKind = "new";
  @state() accessor wikiSlug = "";
  @state() accessor name = "";
  @state() accessor slug = "";
  @state() accessor mode: ImportMode = "replace";
  @state() accessor includeSystem = false;
  @state() accessor includePlugins = false;
  @state() accessor busy = false;
  @state() accessor error = "";
  @state() accessor preview: InspectResponse | null = null;
  @state() accessor imported: ImportResponse | null = null;

  connectedCallback(): void {
    super.connectedCallback();
    // Default to the first wiki the person may see; a "new wiki" import is the
    // rarer case and needs a name anyway.
    if (!this.wikiSlug && this.props?.wikis?.length) this.wikiSlug = this.props.wikis[0].slug;
  }

  /** Any change to the question invalidates the answer: the preview must not
   *  survive a changed file, target or mode. */
  private readonly invalidate = () => {
    this.preview = null;
    this.imported = null;
    this.error = "";
  };

  private readonly query = (): URLSearchParams => {
    const params = new URLSearchParams();
    if (this.targetKind === "new") {
      params.set("create", "1");
      // On import the slug has to be the exact free one from the preview.
      const slug = (this.preview?.target.slug || this.slug).trim();
      if (slug) params.set("slug", slug);
      const name = this.name.trim();
      if (name) params.set("display-name", name);
    } else {
      params.set("wiki", this.wikiSlug);
      if (this.mode === "merge") params.set("merge", "1");
    }
    if (this.includeSystem) params.set("include-system", "1");
    if (this.includePlugins) params.set("include-plugins", "1");
    return params;
  };

  private readonly uploadBody = (): FormData => {
    const form = new FormData();
    if (this.file) form.append("file", this.file, this.file.name);
    return form;
  };

  private readonly inspect = async () => {
    if (!this.file || this.busy) return;
    this.busy = true;
    this.error = "";
    this.imported = null;
    try {
      const response = await wikiFileApiJson(
        `/api/wiki-file/inspect?${this.query().toString()}`,
        { method: "PUT", body: this.uploadBody() },
      ) as InspectResponse;
      this.preview = response;
    } catch (error) {
      this.preview = null;
      this.error = error instanceof Error ? error.message : t("The wiki file could not be read.");
    } finally {
      this.busy = false;
    }
  };

  private readonly runImport = async () => {
    if (!this.file || !this.preview || this.busy) return;
    this.busy = true;
    this.error = "";
    try {
      const response = await wikiFileApiJson(
        `/api/wiki-file/import?${this.query().toString()}`,
        { method: "PUT", body: this.uploadBody() },
      ) as ImportResponse;
      this.imported = response;
      this.props.onDone();
      if (this.targetKind === "existing") this.wikiSlug = response.slug;
    } catch (error) {
      this.error = error instanceof Error ? error.message : t("The wiki file could not be imported.");
      // The reason is usually a stale target (slug taken, rights changed), so
      // the old plan must not stay on screen as if it still applied.
      this.preview = null;
    } finally {
      this.busy = false;
    }
  };

  private readonly setTargetKind = (kind: TargetKind) => {
    if (kind === this.targetKind) return;
    this.targetKind = kind;
    this.invalidate();
  };

  private readonly setMode = (mode: ImportMode) => {
    if (mode === this.mode) return;
    this.mode = mode;
    this.invalidate();
  };

  private readonly sampleLine = (label: string, sample: SampleList, hint?: string) => (
    <div class="wiki-file-plan-row">
      <span class="wiki-file-plan-label">{label}</span>
      <strong class="wiki-file-plan-count">{sample.count.toLocaleString()}</strong>
      <span class="wiki-file-plan-hint">{hint}</span>
      {sample.titles.length ? (
        <details class="wiki-file-plan-samples">
          <summary>{t("Show {count} titles", { count: sample.titles.length })}</summary>
          <ul>
            {sample.titles.map(title => <li key={title}><code>{title}</code></li>)}
          </ul>
        </details>
      ) : null}
    </div>
  );

  private renderPreview() {
    const preview = this.preview;
    if (!preview) return null;
    const { plan, target, file } = preview;
    return (
      <section class="wiki-file-preview">
        <h4>{t("What will happen")}</h4>
        <p class="wiki-file-preview-target">
          {t("Target")}: <strong>{target.displayName}</strong>
          {" "}(<code>{target.slug}</code>) → <code>{target.bagName}</code>
        </p>
        <p class="wiki-file-preview-file">
          {t("File")}: <strong>{file.filename}</strong> · {file.sizeText} · TiddlyWiki {file.twVersion}
          {file.siteTitle ? <> · <em>{file.siteTitle}</em></> : null}
        </p>
        <div class="wiki-file-plan">
          {this.sampleLine(t("New tiddlers"), plan.created)}
          {this.sampleLine(t("Changed tiddlers"), plan.updated)}
          <div class="wiki-file-plan-row">
            <span class="wiki-file-plan-label">{t("Unchanged tiddlers")}</span>
            <strong class="wiki-file-plan-count">{plan.unchanged.toLocaleString()}</strong>
          </div>
          {plan.mode === "replace" && plan.deleted.count ? (
            <div class="wiki-file-plan-row wiki-file-plan-warn">
              <span class="wiki-file-plan-label">{t("Deleted: tiddlers not in the file")}</span>
              <strong class="wiki-file-plan-count">{plan.deleted.count.toLocaleString()}</strong>
              <span class="wiki-file-plan-hint">{t("These tiddlers leave the wiki")}</span>
              {plan.deleted.titles.length ? (
                <details class="wiki-file-plan-samples" open>
                  <summary>{t("Show the {count} deleted titles", { count: plan.deleted.titles.length })}</summary>
                  <ul>
                    {plan.deleted.titles.map(title => <li key={title}><code>{title}</code></li>)}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
          {plan.skippedSystem || !this.includeSystem ? (
            <div class="wiki-file-plan-row">
              <span class="wiki-file-plan-label">{t("System tiddlers left out")}</span>
              <strong class="wiki-file-plan-count">{plan.skippedSystem.toLocaleString()}</strong>
              <span class="wiki-file-plan-hint">
                {this.includeSystem ? t("A language pack is one of them") : t("Turn them on above to import them")}
              </span>
            </div>
          ) : null}
          {!this.includeSystem && plan.keptSystem.count ? this.sampleLine(
            t("System tiddlers kept from the wiki"), plan.keptSystem,
          ) : null}
          {plan.keptPlugins.count ? this.sampleLine(
            t("Plugins written into the wiki"), plan.keptPlugins,
          ) : null}
          {plan.skippedPlugins.count ? (
            <div class="wiki-file-plan-row">
              <span class="wiki-file-plan-label">{t("Plugins left out")}</span>
              <strong class="wiki-file-plan-count">{plan.skippedPlugins.count.toLocaleString()}</strong>
              <span class="wiki-file-plan-hint">
                {this.includePlugins
                  ? t("Not the version the wiki runs")
                  : t("Turn them on above to import them")}
              </span>
              {plan.skippedPlugins.titles.length ? (
                <details class="wiki-file-plan-samples" open>
                  <summary>{t("Show {count} titles", { count: plan.skippedPlugins.titles.length })}</summary>
                  <ul>
                    {plan.skippedPluginReasons.map(row => (
                      <li key={row.title}>
                        <code>{row.title}</code>
                        <span class="wiki-file-system-text">
                          {row.reasonCode === "not-wanted"
                            ? t("The file's plugins were not asked for")
                            : row.reasonCode === "no-version"
                              ? t("The plugin names no version, so it cannot be checked")
                              : t("Another version than the wiki runs")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
          {plan.skippedTransient.count ? this.sampleLine(
            t("Session state dropped"), plan.skippedTransient,
          ) : null}
          {plan.language ? (
            <div class="wiki-file-plan-row">
              <span class="wiki-file-plan-label">{t("Language of the file")}</span>
              <strong class="wiki-file-plan-count">
                <code>{plan.language.wanted}</code>
              </strong>
              <span class="wiki-file-plan-hint">
                {plan.language.delivered
                  ? (plan.language.packTitle
                    ? t("The language pack comes with the file")
                    : t("The wiki already has this language"))
                  : (plan.language.reasonCode === "not-wanted"
                    ? t("Turn on the system tiddlers above to take the language over")
                    : t("The wiki keeps its own language: the file has no language pack for it"))}
              </span>
            </div>
          ) : null}
          {plan.dropped.map(row => (
            <p class="wiki-file-dropped" key={row.title}>
              <code>{row.title}</code> {t("is not written")}: {row.reason}
            </p>
          ))}
        </div>
        {plan.snapshots ? (
          <p class="wiki-file-snapshot-hint">
            {t("Before anything is written, the current content of the bag is copied into a snapshot. If the import was wrong, you can set the wiki back to it afterwards.")}
          </p>
        ) : null}
        {preview.system.count ? (
          <details class="wiki-file-system-list">
            <summary>{t("System tiddlers in the file ({count})", { count: preview.system.count })}</summary>
            <ul>
              {preview.system.tiddlers.map(entry => (
                <li key={entry.title}>
                  <code>{entry.title}</code>
                  {entry.text ? <span class="wiki-file-system-text">{entry.text}</span> : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    );
  }

  private renderResult() {
    const imported = this.imported;
    if (!imported) return null;
    return (
      <section class="wiki-file-result">
        <h4>
          <MaterialSymbol icon={uploadIcon} />
          {imported.create ? t("The wiki \"{slug}\" has been created.", { slug: imported.slug }) : t("The wiki \"{slug}\" has been imported into.", { slug: imported.slug })}
        </h4>
        <ul class="wiki-file-result-list">
          <li>{t("Written: {count}", { count: imported.result.written })}</li>
          <li>{t("Deleted: {count}", { count: imported.result.deleted })}</li>
          <li>{t("Unchanged: {count}", { count: imported.result.unchanged })}</li>
        </ul>
        {imported.snapshot ? (
          <p class="wiki-file-result-snapshot">
            <MaterialSymbol icon={historyIcon} />
            {t("Snapshot {name} with {count} tiddlers", {
              name: imported.snapshot.bagName,
              count: imported.snapshot.count,
            })}
          </p>
        ) : null}
        <div class="wiki-file-result-actions">
          {/* Wie die Wiki-Karten auf der Startseite: der Dialog bleibt stehen,
              die Wiki kommt in einen eigenen Tab. */}
          <a
            class="ghost-button"
            href={pathPrefix + "/wiki/" + encodeURIComponent(imported.slug)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t("Open the wiki")}
          </a>
          {imported.snapshot ? (
            <button
              class="ghost-button"
              type="button"
              onclick={() => this.props.onRestoreSnapshots(imported.slug)}
            >
              <MaterialSymbol icon={restoreIcon} />
              {t("Restore a snapshot")}
            </button>
          ) : null}
        </div>
      </section>
    );
  }

  render() {
    const wikis = this.props?.wikis ?? [];
    const busy = this.busy;
    return (
      <div class="modal-shell wiki-file-modal" webjsx-attr-open onclick={(event) => {
        if (event.target === event.currentTarget && !busy) this.props.onClose();
      }}>
        <section class="modal-card wiki-file-card" role="dialog" aria-modal="true" aria-label={t("Take over a wiki file")}>
          <header class="modal-header">
            <div class="modal-title">
              <p class="eyebrow">{t("Wiki file")}</p>
              <h3>{t("Take over a wiki file")}</h3>
              <p>{t("Import the saved HTML of a TiddlyWiki 5 wiki: the file is checked first, then you decide what is written into the wiki.")}</p>
            </div>
            <div class="close-button" onclick={() => { if (!busy) this.props.onClose(); }} aria-label={t("Close")}>
              <MaterialSymbol icon={closeIcon} />
            </div>
          </header>

          <div class="modal-layout">
            <div class="field-stack modal-main wiki-file-fields">
              {this.error ? renderErrorBanner(formatStorageErrorForDisplay(this.error, t)) : null}

              <div class="field-block">
                <div class="field-editor">
                  <label class="field-label" for="wiki-file-input">{t("Wiki file (.html)")}</label>
                  <input
                    id="wiki-file-input"
                    class="field-input"
                    type="file"
                    accept=".html,.htm,text/html"
                    onchange={(event) => {
                      const input = event.target as HTMLInputElement;
                      this.file = input.files?.[0] ?? null;
                      this.invalidate();
                    }}
                    disabled={busy}
                  />
                  {this.file ? (
                    <p class="wiki-file-muted">
                      {this.file.name} · {prettifyBytes(this.file.size)}
                    </p>
                  ) : (
                    <p class="wiki-file-muted">
                      {t("The saved index.html of a TiddlyWiki 5 wiki, with all tiddlers in it.")}
                    </p>
                  )}
                </div>
              </div>

              <fieldset class="wiki-file-choice">
                <legend class="field-label">{t("Where should the tiddlers go?")}</legend>
                <label class="wiki-file-radio">
                  <input
                    type="radio"
                    name="wiki-file-target"
                    checked={this.targetKind === "new"}
                    onchange={() => this.setTargetKind("new")}
                    disabled={busy}
                  />
                  {t("A new wiki")}
                </label>
                <label class="wiki-file-radio">
                  <input
                    type="radio"
                    name="wiki-file-target"
                    checked={this.targetKind === "existing"}
                    onchange={() => this.setTargetKind("existing")}
                    disabled={busy || !wikis.length}
                  />
                  {t("An existing wiki")}
                  {wikis.length ? null : <span class="wiki-file-muted"> ({t("no wiki available")})</span>}
                </label>

                {this.targetKind === "new" ? (
                  <div class="wiki-file-choice-detail">
                    <label class="field-label" for="wiki-file-name">{t("Name of the wiki")}</label>
                    <input
                      id="wiki-file-name"
                      class="field-input"
                      type="text"
                      value={this.name}
                      placeholder={t("My Wiki")}
                      oninput={(event) => {
                        this.name = (event.target as HTMLInputElement).value;
                        // The name is the slug source; keep both fields in step
                        // unless the slug was typed on its own.
                        if (!this.slug || this.slug === sanitizeSlugPart(this.name.slice(0, -1))) {
                          this.slug = sanitizeSlugPart(this.name);
                        }
                        this.invalidate();
                      }}
                      disabled={busy}
                    />
                    <label class="field-label" for="wiki-file-slug">{t("Wiki name (slug)")}</label>
                    <input
                      id="wiki-file-slug"
                      class="field-input"
                      type="text"
                      value={this.slug}
                      oninput={(event) => {
                        this.slug = sanitizeSlugPart((event.target as HTMLInputElement).value);
                        this.invalidate();
                      }}
                      disabled={busy}
                    />
                    <p class="wiki-file-muted">
                      {t("Empty: the file name decides. The preview shows the name the wiki will actually get.")}
                    </p>
                  </div>
                ) : (
                  <div class="wiki-file-choice-detail">
                    <label class="field-label" for="wiki-file-wiki">{t("Wiki")}</label>
                    <select
                      id="wiki-file-wiki"
                      class="field-select"
                      onchange={(event) => {
                        this.wikiSlug = (event.target as HTMLSelectElement).value;
                        this.invalidate();
                      }}
                      disabled={busy || !wikis.length}
                    >
                      {wikis.map(wiki => (
                        <option key={wiki.slug} value={wiki.slug} selected={wiki.slug === this.wikiSlug}>
                          {wiki.displayName} ({wiki.slug})
                        </option>
                      ))}
                    </select>

                    <span class="field-label">{t("How should it be written?")}</span>
                    <label class="wiki-file-radio">
                      <input
                        type="radio"
                        name="wiki-file-mode"
                        checked={this.mode === "replace"}
                        onchange={() => this.setMode("replace")}
                        disabled={busy}
                      />
                      {t("Replace: the wiki becomes the file, with a snapshot of the old state")}
                    </label>
                    <label class="wiki-file-radio">
                      <input
                        type="radio"
                        name="wiki-file-mode"
                        checked={this.mode === "merge"}
                        onchange={() => this.setMode("merge")}
                        disabled={busy}
                      />
                      {t("Merge: only tiddlers that are new or changed are written, nothing is deleted")}
                    </label>
                    <p class="wiki-file-muted">
                      {this.mode === "replace"
                        ? t("Replacing needs administrator rights on the write bag of the wiki.")
                        : t("Merging needs write access to the bag, like saving a tiddler.")}
                    </p>
                  </div>
                )}
              </fieldset>

              <label class="wiki-file-checkbox">
                <input
                  type="checkbox"
                  checked={this.includeSystem}
                  onchange={(event) => {
                    this.includeSystem = (event.target as HTMLInputElement).checked;
                    this.invalidate();
                  }}
                  disabled={busy}
                />
                {t("Also import system tiddlers (titles starting with $:/): layout, tags, themes of the old wiki")}
              </label>

              <label class="wiki-file-checkbox">
                <input
                  type="checkbox"
                  checked={this.includePlugins}
                  onchange={(event) => {
                    this.includePlugins = (event.target as HTMLInputElement).checked;
                    this.invalidate();
                  }}
                  disabled={busy}
                />
                {t("Also import the file's plugins: core, themes and libraries")}
                <span class="wiki-file-muted">
                  {t("Only those that are the version the wiki runs. The copy travels with the wiki, into its snapshots and into another installation; while the wiki loads its plugins from the installation's cache, the running wiki keeps using those.")}
                </span>
              </label>

              {this.renderPreview()}
              {this.renderResult()}
            </div>
          </div>

          <footer class="modal-actions">
            <button class="ghost-button" type="button" onclick={() => this.props.onClose()} disabled={busy}>
              {this.imported ? t("Done") : t("Close")}
            </button>
            {!this.imported ? (
              <button
                class="ghost-button"
                type="button"
                onclick={() => void this.inspect()}
                disabled={busy || !this.file || (this.targetKind === "existing" && !this.wikiSlug)}
              >
                {this.busy && !this.preview ? t("Reading…") : t("Check the file")}
              </button>
            ) : null}
            {!this.imported ? (
              <button
                class="primary-button"
                type="button"
                onclick={() => void this.runImport()}
                disabled={busy || !this.preview}
              >
                {this.busy && this.preview ? t("Importing…") : t("Import now")}
              </button>
            ) : null}
          </footer>
        </section>
      </div>
    );
  }
}