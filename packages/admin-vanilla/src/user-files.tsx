// "My files" panel: per-account file uploads, stored on disk and listed here.
// Each upload is streamed to the server (PUT multipart). Downloads stream
// back with a Content-Disposition so the browser saves the file.

import { customElement, JSXElement, state } from "@tiddlywiki/jsx-lit";
import deleteIcon from "@material-symbols/svg-400/outlined/delete.svg";
import downloadIcon from "@material-symbols/svg-400/outlined/download.svg";
import uploadIcon from "@material-symbols/svg-400/outlined/upload.svg";
import refreshIcon from "@material-symbols/svg-400/outlined/refresh.svg";
import folderIcon from "@material-symbols/svg-400/outlined/folder.svg";
import closeIcon from "@material-symbols/svg-400/outlined/close.svg";
import { MaterialSymbol } from "./material-symbol";
import { t } from "./i18n";

export interface UserFilesPanelProps {
  onCountChange?: (count: number) => void;
  /** Site admin: the list shows every account's files with their owner. */
  admin?: boolean;
}

export interface UserFileRow {
  id: string;
  filename: string;
  type: string;
  sizeBytes: number;
  createdAt: string;
  owner?: string | null;
}

function formatUserFileError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(error.message) as {
      reason?: unknown;
      details?: { reason?: unknown; prettyErrors?: unknown };
    };
    const code = typeof parsed?.reason === "string" ? parsed.reason : "";
    if (code) return `${t("The request could not be completed.")} (${code})`;
  } catch {
    // Not JSON — fall through to the raw message.
  }
  return error.message || fallback;
}

async function userFilesApiJson(path: string, init?: RequestInit): Promise<any> {
  const response = await fetch(pathPrefix + path, {
    ...init,
    headers: {
      "X-Requested-With": "TiddlyWiki",
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  if (response.status !== 200) throw new Error(text);
  return text ? JSON.parse(text) : null;
}

@customElement("mws-user-files")
export class UserFilesPanel extends JSXElement {
  useLightDOM = true;

  @state() accessor props!: UserFilesPanelProps;
  @state() accessor files: UserFileRow[] = [];
  @state() accessor loading = false;
  @state() accessor uploading = false;
  @state() accessor error = "";
  @state() accessor message = "";
  @state() accessor dragOver = false;

  connectedCallback(): void {
    super.connectedCallback();
    void this.fetchFiles();
  }

  private readonly pushCount = () => {
    this.props?.onCountChange?.(this.files.length);
  };

  private readonly fetchFiles = async () => {
    if (this.loading) return;
    this.loading = true;
    this.error = "";
    try {
      const result = await userFilesApiJson("/api/user-files/list") as { files?: UserFileRow[] } | null;
      this.files = result?.files ?? [];
      this.pushCount();
    } catch (error) {
      this.error = formatUserFileError(error, t("Failed to load your files."));
    } finally {
      this.loading = false;
    }
  };

  private readonly prettifyBytes = (bytes: number) => {
    if (!bytes || bytes < 1024) return `${bytes || 0} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${value.toFixed(1)} ${units[unit]}`;
  };

  private readonly uploadFile = async (file: File | null | undefined) => {
    if (!file || this.uploading) return;
    this.uploading = true;
    this.error = "";
    this.message = "";
    try {
      const body = new FormData();
      body.append("file", file, file.name);
      await userFilesApiJson("/api/user-files/upload", {
        method: "PUT",
        body,
      });
      this.message = t("Uploaded {name}.", { name: file.name });
      await this.fetchFiles();
    } catch (error) {
      this.error = formatUserFileError(error, t("Failed to upload {name}.", { name: file.name }));
    } finally {
      this.uploading = false;
    }
  };

  private readonly handleFileInput = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    void this.uploadFile(file);
  };

  private readonly dropFiles = (event: DragEvent) => {
    this.dragOver = false;
    const file = event.dataTransfer?.files?.[0];
    if (!file || this.uploading) return;
    event.preventDefault();
    void this.uploadFile(file);
  };

  private readonly deleteFile = async (file: UserFileRow) => {
    if (!globalThis.confirm(t("Really delete \"{name}\" for good?", { name: file.filename }) + "\n" + t("This action cannot be undone."))) return;
    this.uploading = true;
    this.error = "";
    this.message = "";
    try {
      await userFilesApiJson("/api/user-files/delete", {
        method: "PUT",
        body: JSON.stringify({ id: file.id }),
      });
      this.files = this.files.filter(item => item.id !== file.id);
      this.pushCount();
      this.message = t("Deleted {name}.", { name: file.filename });
    } catch (error) {
      this.error = formatUserFileError(error, t("Failed to delete {name}.", { name: file.filename }));
    } finally {
      this.uploading = false;
    }
  };

  protected render() {
    return (
      <section class="user-files-panel">
        <div class="user-files-toolbar">
          <div
            class={this.dragOver ? "user-files-dropzone is-dragover" : "user-files-dropzone"}
            ondrop={this.dropFiles}
            ondragover={(event) => { event.preventDefault(); this.dragOver = true; }}
            ondragleave={() => { this.dragOver = false; }}
          >
            <MaterialSymbol icon={uploadIcon} />
            <label class="user-files-dropzone-label">
              <input
                type="file"
                class="user-files-file-input"
                onchange={this.handleFileInput}
                disabled={this.uploading}
              />
              <span>{t("Choose a file or drop it here")}</span>
            </label>
            <button
              class="ghost-button"
              type="button"
              onclick={() => void this.fetchFiles()}
              disabled={this.loading || this.uploading}
            >
              <MaterialSymbol icon={refreshIcon} /> {t("Refresh")}
            </button>
          </div>
        </div>

        {this.error ? (
          <div class="error-banner" role="alert">
            <span class="error-banner-icon" aria-hidden="true"><MaterialSymbol icon={closeIcon} /></span>
            <p class="error-banner-message">{this.error}</p>
            <button class="ghost-button error-banner-dismiss" type="button" onclick={() => { this.error = ""; }}>{t("Dismiss")}</button>
          </div>
        ) : null}
        {this.message ? (
          <p class="storage-status" role="status">{this.message}</p>
        ) : null}

        {this.loading ? (
          <div class="field-callout"><p>{t("Loading your files…")}</p></div>
        ) : this.files.length ? (
          <div class="storage-table-scroll">
            <table class="storage-table user-files-table">
              <thead>
                <tr>
                  <th>{t("File name")}</th>
                  {this.props?.admin ? <th>{t("Owner")}</th> : null}
                  <th>{t("Type")}</th>
                  <th>{t("Size")}</th>
                  <th>{t("Uploaded")}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {this.files.map((file) => (
                  <tr key={file.id}>
                    <td><strong class="user-files-name">{file.filename}</strong></td>
                    {this.props?.admin ? <td>{file.owner || "—"}</td> : null}
                    <td>{file.type}</td>
                    <td>{this.prettifyBytes(file.sizeBytes)}</td>
                    <td>{new Date(file.createdAt).toLocaleString()}</td>
                    <td class="user-files-actions">
                      <a
                        class="ghost-button"
                        href={pathPrefix + "/api/user-files/download?id=" + encodeURIComponent(file.id)}
                        download={file.filename}
                        title={t("Download")}
                        aria-label={t("Download")}
                      >
                        <MaterialSymbol icon={downloadIcon} />
                      </a>
                      <button
                        class="ghost-button"
                        type="button"
                        title={t("Delete")}
                        aria-label={t("Delete")}
                        onclick={() => void this.deleteFile(file)}
                        disabled={this.uploading}
                      >
                        <MaterialSymbol icon={deleteIcon} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div class="pinboard-empty">
            <MaterialSymbol icon={folderIcon} />
            <p>{t("No files yet. Upload something to get started.")}</p>
          </div>
        )}
      </section>
    );
  }
}