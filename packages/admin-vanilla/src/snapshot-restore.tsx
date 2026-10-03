import { customElement, JSXElement, state } from "@tiddlywiki/jsx-lit";
import closeIcon from "@material-symbols/svg-400/outlined/close.svg";
import deleteIcon from "@material-symbols/svg-400/outlined/delete.svg";
import historyIcon from "@material-symbols/svg-400/outlined/history.svg";
import restoreIcon from "@material-symbols/svg-400/outlined/settings_backup_restore.svg";
import { MaterialSymbol } from "./material-symbol";
import { t } from "./i18n";
import { formatStorageErrorForDisplay, renderErrorBanner } from "./helpers";

export interface SnapshotRestoreProps {
  /** Wikis the dialog may target. Passed in so the component stays free of
   *  store internals; the app filters it to what the person may see. */
  wikis: readonly { slug: string; displayName: string }[];
  /** Wiki to start with — the import dialog passes the wiki it just wrote, so
   *  the snapshot it created is the first row. Empty means "ask". */
  initialSlug: string;
  onClose: () => void;
  /** Fired after a successful restore so the app can reload its lists. */
  onDone: () => void;
}

interface SnapshotRow {
  bagName: string;
  created: string;
  source: string;
  sourceBagName: string;
  count: number;
}

/** Same shape as the fetch wrapper in wiki-file-import.tsx, kept module-local
 *  like in pinboard.tsx and user-files.tsx. */
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

@customElement("mws-snapshot-restore")
export class SnapshotRestoreDialog extends JSXElement {
  useLightDOM = true;

  @state() accessor props!: SnapshotRestoreProps;
  @state() accessor wikiSlug = "";
  @state() accessor snapshots: SnapshotRow[] | null = null;
  @state() accessor loading = false;
  /** Bag name of the snapshot being written, empty while idle. */
  @state() accessor restoring = "";
  /** Bag name of the snapshot whose confirmation is open, empty when none. */
  @state() accessor confirming = "";
  /** Which question that confirmation asks. */
  @state() accessor confirmKind: "restore" | "delete" = "restore";
  /** Bag name of the snapshot being deleted, empty while idle. */
  @state() accessor deleting = "";
  /** How many snapshots the server keeps per wiki, for the rule under the list. */
  @state() accessor keep = 0;
  @state() accessor error = "";
  @state() accessor notice = "";
  @state() accessor restoredSlug = "";

  connectedCallback(): void {
    super.connectedCallback();
    const wikis = this.props?.wikis ?? [];
    const wanted = this.props?.initialSlug;
    const slug = wanted && wikis.some(wiki => wiki.slug === wanted)
      ? wanted
      : (wikis[0]?.slug ?? "");
    if (slug !== this.wikiSlug) {
      this.wikiSlug = slug;
      void this.loadSnapshots();
    }
  }

  private readonly selectWiki = (slug: string) => {
    if (slug === this.wikiSlug) return;
    this.wikiSlug = slug;
    this.confirming = "";
    this.confirmKind = "restore";
    this.notice = "";
    this.error = "";
    this.restoredSlug = "";
    this.snapshots = null;
    void this.loadSnapshots();
  };

  /** Only administrators may replace, and only they see snapshots here — the
   *  list route is behind the same gate as the replace that created them. A
   *  person who may only merge gets an error, not an empty list. */
  private readonly loadSnapshots = async () => {
    const slug = this.wikiSlug;
    if (!slug) return;
    this.loading = true;
    try {
      const response = await wikiFileApiJson(
        `/api/wiki-file/snapshots?wiki=${encodeURIComponent(slug)}`,
      ) as { snapshots?: SnapshotRow[]; keep?: number };
      this.snapshots = response?.snapshots ?? [];
      // The retention rule belongs to the server; the dialog states it instead
      // of hardcoding the number the server would prune to.
      this.keep = response?.keep ?? 0;
    } catch (error) {
      this.snapshots = null;
      this.error = error instanceof Error ? error.message : t("The snapshots could not be loaded.");
    } finally {
      this.loading = false;
    }
  };

  private readonly restore = async (snapshot: SnapshotRow) => {
    const slug = this.wikiSlug;
    if (this.restoring || !slug) return;
    this.restoring = snapshot.bagName;
    this.error = "";
    this.notice = "";
    this.restoredSlug = "";
    try {
      await wikiFileApiJson(`/api/wiki-file/restore?wiki=${encodeURIComponent(slug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: snapshot.bagName }),
      });
      // The server snapshots the current state before it writes, so the new
      // list holds the state we just left — that is the way back out again.
      this.notice = t("The wiki \"{slug}\" was restored from {date}.", {
        slug,
        date: new Date(snapshot.created).toLocaleString(),
      });
      this.restoredSlug = slug;
      this.confirming = "";
      this.props.onDone();
      await this.loadSnapshots();
    } catch (error) {
      this.error = error instanceof Error ? error.message : t("The snapshot could not be restored.");
    } finally {
      this.restoring = "";
    }
  };

  private readonly removeSnapshot = async (snapshot: SnapshotRow) => {
    const slug = this.wikiSlug;
    if (this.deleting || this.restoring || !slug) return;
    this.deleting = snapshot.bagName;
    this.error = "";
    try {
      await wikiFileApiJson(`/api/wiki-file/snapshot/delete?wiki=${encodeURIComponent(slug)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshot: snapshot.bagName }),
      });
      // The row is gone on the server; drop it here too instead of reloading,
      // so the list does not flash a spinner around a single removed line.
      this.snapshots = (this.snapshots ?? []).filter(row => row.bagName !== snapshot.bagName);
      this.confirming = "";
    } catch (error) {
      this.error = error instanceof Error ? error.message : t("The snapshot could not be deleted.");
    } finally {
      this.deleting = "";
    }
  };

  private readonly confirmPanel = (snapshot: SnapshotRow) => {
    const wiki = this.props.wikis.find(entry => entry.slug === this.wikiSlug);
    if (this.confirmKind === "delete") {
      const busy = this.deleting === snapshot.bagName;
      return (
        <div class="snapshot-confirm">
          <p class="snapshot-confirm-question">{t("Delete this snapshot?")}</p>
          <p class="snapshot-confirm-detail">
            {new Date(snapshot.created).toLocaleString()}
            {" · "}{t("{count} tiddlers", { count: snapshot.count })}
          </p>
          <p class="snapshot-confirm-hint">
            {t("A deleted snapshot cannot be recovered, and this is the only copy left of this state.")}
          </p>
          <div class="snapshot-confirm-actions">
            <button
              class="ghost-button"
              type="button"
              onclick={() => { this.confirming = ""; }}
              disabled={busy}
            >{t("Keep it")}</button>
            <button
              class="primary-button"
              type="button"
              onclick={() => void this.removeSnapshot(snapshot)}
              disabled={busy}
            >{busy ? t("Deleting…") : t("Delete it")}</button>
          </div>
        </div>
      );
    }
    const busy = this.restoring === snapshot.bagName;
    return (
      <div class="snapshot-confirm">
        <p class="snapshot-confirm-question">{t("Restore this snapshot?")}</p>
        <p class="snapshot-confirm-detail">
          {t("Wiki")}: <strong>{wiki?.displayName || this.wikiSlug}</strong>
          {" · "}{new Date(snapshot.created).toLocaleString()}
          {" · "}{t("{count} tiddlers", { count: snapshot.count })}
        </p>
        <p class="snapshot-confirm-hint">
          {t("The current content is saved as a new snapshot first, so this step can be undone.")}
        </p>
        <div class="snapshot-confirm-actions">
          <button
            class="ghost-button"
            type="button"
            onclick={() => { this.confirming = ""; }}
            disabled={busy}
          >{t("Keep the current state")}</button>
          <button
            class="primary-button"
            type="button"
            onclick={() => void this.restore(snapshot)}
            disabled={busy}
          >{busy ? t("Restoring…") : t("Restore now")}</button>
        </div>
      </div>
    );
  };

  private readonly snapshotList = () => {
    const wikis = this.props?.wikis ?? [];
    if (!wikis.length) return <p class="wiki-file-muted">{t("There is no wiki to restore a snapshot for.")}</p>;
    if (!this.wikiSlug) return null;
    if (this.loading) return <p class="wiki-file-muted">{t("Loading snapshots…")}</p>;
    if (!this.snapshots) return null;
    if (!this.snapshots.length) {
      return <p class="wiki-file-muted">{t("No snapshots yet. The first one is written by the next import.")}</p>;
    }
    // The route orders the bags by name descending and the names carry a
    // fixed-width UTC stamp, so the newest snapshot comes first.
    const busy = this.restoring !== "" || this.deleting !== "";
    return (
      <ul class="snapshot-list">
        {this.snapshots.map(snapshot => (
          <li key={snapshot.bagName}>
            <div class="snapshot-main">
              <strong>{new Date(snapshot.created).toLocaleString()}</strong>
              <small>{t("{count} tiddlers", { count: snapshot.count })} · {snapshot.source || snapshot.sourceBagName}</small>
            </div>
            {this.confirming === snapshot.bagName ? (
              this.confirmPanel(snapshot)
            ) : (
              <div class="snapshot-row-actions">
                <button
                  class="ghost-button"
                  type="button"
                  onclick={() => {
                    this.confirming = snapshot.bagName;
                    this.confirmKind = "restore";
                  }}
                  disabled={busy}
                >{t("Restore this snapshot")}</button>
                {/* Not a bare icon: the label says what it does, the icon only
                    repeats it. */}
                <button
                  class="ghost-button"
                  type="button"
                  title={t("Delete this snapshot")}
                  aria-label={t("Delete this snapshot")}
                  onclick={() => {
                    this.confirming = snapshot.bagName;
                    this.confirmKind = "delete";
                  }}
                  disabled={busy}
                >
                  <MaterialSymbol icon={deleteIcon} />
                  {t("Delete")}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  };

  render() {
    const wikis = this.props?.wikis ?? [];
    const busy = this.restoring !== "";
    return (
      <div class="modal-shell wiki-file-modal" webjsx-attr-open onclick={(event) => {
        if (event.target === event.currentTarget && !busy) this.props.onClose();
      }}>
        <section class="modal-card wiki-file-card" role="dialog" aria-modal="true" aria-label={t("Restore a snapshot")}>
          <header class="modal-header">
            <div class="modal-title">
              <p class="eyebrow">{t("Snapshot")}</p>
              <h3>{t("Restore a snapshot")}</h3>
              <p>{t("Set a wiki back to an earlier state. Every import that replaces the content of a wiki writes a snapshot first.")}</p>
            </div>
            <div class="close-button" onclick={() => { if (!busy) this.props.onClose(); }} aria-label={t("Close")}>
              <MaterialSymbol icon={closeIcon} />
            </div>
          </header>

          <div class="modal-layout">
            <div class="field-stack modal-main wiki-file-fields">
              {this.error ? renderErrorBanner(formatStorageErrorForDisplay(this.error, t)) : null}
              {this.notice ? (
                <p class="wiki-file-notice">
                  <MaterialSymbol icon={historyIcon} />
                  {this.notice}
                  {" "}
                  <a
                    class="ghost-button"
                    href={pathPrefix + "/wiki/" + encodeURIComponent(this.restoredSlug)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {t("Open the wiki")}
                  </a>
                </p>
              ) : null}

              <div class="field-block">
                <div class="field-editor">
                  <label class="field-label" for="snapshot-restore-wiki">{t("Wiki")}</label>
                  <select
                    id="snapshot-restore-wiki"
                    class="field-select"
                    onchange={(event) => this.selectWiki((event.target as HTMLSelectElement).value)}
                    disabled={busy || !wikis.length}
                  >
                    {wikis.map(wiki => (
                      <option key={wiki.slug} value={wiki.slug} selected={wiki.slug === this.wikiSlug}>
                        {wiki.displayName} ({wiki.slug})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <section class="wiki-file-snapshots">
                <h4>
                  <MaterialSymbol icon={historyIcon} />
                  {t("Snapshots of this wiki")}
                </h4>
                {this.snapshotList()}
                {/* Without this the retention rule is invisible: a snapshot
                    simply disappears from the list one day, and nobody knows
                    whether that was a mistake or the rule. */}
                {this.keep > 0 && this.snapshots?.length ? (
                  <p class="wiki-file-muted">{t("Only the newest {count} snapshots are kept. Older ones are dropped automatically.", { count: this.keep })}</p>
                ) : null}
              </section>
            </div>
          </div>

          <footer class="modal-actions">
            <button class="ghost-button" type="button" onclick={() => this.props.onClose()} disabled={busy}>
              {t("Close")}
            </button>
          </footer>
        </section>
      </div>
    );
  }
}
