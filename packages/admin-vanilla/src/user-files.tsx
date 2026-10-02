// "My files" panel: per-account file uploads, stored on disk and listed here.
// Each upload is streamed to the server (PUT multipart). Downloads stream
// back with a Content-Disposition so the browser saves the file. Files can be
// shared with other accounts; shared files appear in the "Shared with me"
// section (download only).

import { customElement, JSXElement, state } from "@tiddlywiki/jsx-lit";
import deleteIcon from "@material-symbols/svg-400/outlined/delete.svg";
import downloadIcon from "@material-symbols/svg-400/outlined/download.svg";
import uploadIcon from "@material-symbols/svg-400/outlined/upload.svg";
import refreshIcon from "@material-symbols/svg-400/outlined/refresh.svg";
import folderIcon from "@material-symbols/svg-400/outlined/folder.svg";
import closeIcon from "@material-symbols/svg-400/outlined/close.svg";
import shareIcon from "@material-symbols/svg-400/outlined/share.svg";
import checkIcon from "@material-symbols/svg-400/outlined/check.svg";
import personIcon from "@material-symbols/svg-400/outlined/person.svg";
import visibilityIcon from "@material-symbols/svg-400/outlined/visibility.svg";
import { odtToHtml } from "odf-kit/reader";
import { MaterialSymbol } from "./material-symbol";
import { OdtPreviewDocument } from "./odt-preview";
import { getEffectiveTheme } from "./theme";
import {
  compareListValues,
  listMatchesQuery,
  nextListSort,
  normalizeListSearchText,
  type ListSortDirection,
} from "./list-view";
import { t } from "./i18n";
import { prettifyBytes } from "./helpers";

export interface UserFilesPanelProps {
  /** Fired with the total number of shown files whenever the list changes.
   *  String-tag mounts (`<mws-user-files onCountChange=…>`) deliver the value as
   *  the `countchange` DOM event instead of a direct props call — the JSX
   *  string-tag path wires `on*` props to `addEventListener` and never sets
   *  `props` (see `pushCount`). Component-style mounts receive the plain number. */
  onCountChange?: (count: number | Event) => void;
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
  shared?: { type: string; id: string | null }[];
}

/** One sortable column of the file tables. */
type UserFileColumn = {
  key: string;
  /** Resolved lazily so the label follows the current language. */
  label: () => string;
};

export interface ShareTargets {
  global: boolean;
  roles: { id: string; name: string }[];
  users: { id: string; name: string }[];
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

const MARKDOWN_TOKEN = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/;

/** Format one line's inline markdown into JSX text and elements. The source is
 *  rendered as text nodes (never parsed as HTML), so file content cannot
 *  inject markup. Links are restricted to http(s)/mailto. */
function parseInline(src: string): (JSX.Element | string)[] {
  const nodes: (JSX.Element | string)[] = [];
  let rest = src;
  for (;;) {
    const match = MARKDOWN_TOKEN.exec(rest);
    if (!match) {
      if (rest) nodes.push(rest);
      break;
    }
    const index = match.index;
    if (index > 0) nodes.push(rest.slice(0, index));
    const token = match[1];
    rest = rest.slice(index + token.length);

    let strong = token.match(/^\*\*([^*]+)\*\*$/);
    if (strong) { nodes.push(<strong>{strong[1]}</strong>); continue; }
    strong = token.match(/^__([^_]+)__$/);
    if (strong) { nodes.push(<strong>{strong[1]}</strong>); continue; }
    let strike = token.match(/^~~([^~]+)~~$/);
    if (strike) { nodes.push(<del>{strike[1]}</del>); continue; }
    let em = token.match(/^\*([^*]+)\*$/);
    if (em) { nodes.push(<em>{em[1]}</em>); continue; }
    em = token.match(/^_([^_]+)_$/);
    if (em) { nodes.push(<em>{em[1]}</em>); continue; }
    let code = token.match(/^`([^`]+)`$/);
    if (code) { nodes.push(<code>{code[1]}</code>); continue; }
    const link = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link && /^(https?:|mailto:)/.test(link[2])) {
      nodes.push(<a href={link[2]} target="_blank" rel="noreferrer">{link[1]}</a>);
      continue;
    }
    nodes.push(token);
  }
  return nodes;
}

/** Render a markdown heading level as the matching h1..h6 element. */
function markdownHeading(level: number, children: ReturnType<typeof parseInline>): JSX.Element {
  switch (level) {
    case 1: return <h1>{children}</h1>;
    case 2: return <h2>{children}</h2>;
    case 3: return <h3>{children}</h3>;
    case 4: return <h4>{children}</h4>;
    case 5: return <h5>{children}</h5>;
    default: return <h5>{children}</h5>;
  }
}

/** Convert the user's Markdown into JSX elements for the file preview. */
export function renderMarkdownToJSX(src: string): (JSX.Element | string)[][] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: (JSX.Element | string)[][] = [];
  const paragraphs: string[] = [];
  const flushParagraph = () => {
    if (paragraphs.length) {
      blocks.push([<p>{parseInline(paragraphs.join(" "))}</p>]);
      paragraphs.length = 0;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      flushParagraph();
      const code: string[] = [];
      for (i++; i < lines.length && !/^```\s*$/.test(lines[i]); i++) code.push(lines[i]);
      blocks.push([<pre><code>{code.join("\n")}</code></pre>]);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      blocks.push([markdownHeading(level, parseInline(heading[2]))]);
      continue;
    }
    if (/^\s*(?:[-*_])\s*$/.test(line)) {
      flushParagraph();
      blocks.push([<hr/>]);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      i--;
      blocks.push([<blockquote>{parseInline(quote.join(" "))}</blockquote>]);
      continue;
    }
    if (/^\s*[\*-]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      flushParagraph();
      const ordered = /^\s*\d+\.\s+/.test(line);
      const re = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[\*-]\s+(.*)$/;
      const items: JSX.Element[] = [];
      while (i < lines.length) {
        const match = lines[i].match(re);
        if (!match) break;
        items.push(<li>{parseInline(match[1])}</li>);
        i++;
      }
      i--;
      blocks.push(ordered ? [<ol>{items}</ol>] : [<ul>{items}</ul>]);
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      continue;
    }
    paragraphs.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

@customElement("mws-user-files")
export class UserFilesPanel extends JSXElement {
  useLightDOM = true;

  @state() accessor props!: UserFilesPanelProps;
  @state() accessor files: UserFileRow[] = [];
  @state() accessor sharedFiles: UserFileRow[] = [];
  @state() accessor targets: ShareTargets = { global: false, roles: [], users: [] };
  @state() accessor loading = false;
  @state() accessor uploading = false;
  @state() accessor error = "";
  @state() accessor message = "";
  @state() accessor dragOver = false;
  @state() accessor sharingId = "";
  @state() accessor sharingDraft = "";
  @state() accessor sharingRect: { left: number; top: number; width: number; height: number } | null = null;
  @state() accessor previewId = "";
  @state() accessor previewLoading = false;
  @state() accessor previewText = "";
  @state() accessor previewDocumentHtml = "";
  @state() accessor previewError = "";

  /** Search text and sort column. In memory only, like the other lists: a
   *  stored sort key would outlive a renamed column. `/api/user-files/list`
   *  returns every file (`findMany` without a limit), so filtering and sorting
   *  the whole list in the browser is complete, not a partial view. */
  @state() accessor query = "";
  @state() accessor sortKey = "";
  @state() accessor sortDirection: ListSortDirection = "asc";

  connectedCallback(): void {
    super.connectedCallback();
    void this.fetchFiles();
  }

  /** Site-admin mode comes in two flavours depending on how the panel is
   *  mounted: the app uses the string tag `<mws-user-files admin>` which lands
   *  as an attribute, while a component-style mount sets the `props` object.
   *  Accept both so the admin list reliably shows the "Owner" column. */
  private readonly isAdminView = (): boolean =>
    this.hasAttribute("admin") || this.props?.admin === true;

  private readonly pushCount = () => {
    const own = this.files.length;
    const shared = this.isAdminView() ? 0 : this.sharedFiles.length;
    const count = own + shared;
    this.props?.onCountChange?.(count);
    this.dispatchEvent(new CustomEvent<number>("countchange", { detail: count, bubbles: true, composed: true }));
  };

  private readonly fetchFiles = async () => {
    if (this.loading) return;
    this.loading = true;
    this.error = "";
    this.sharingId = "";
    try {
      const [listResult, sharedResult, targetsResult] = await Promise.all([
        userFilesApiJson("/api/user-files/list") as Promise<{ files?: UserFileRow[] }>,
        userFilesApiJson("/api/user-files/shared") as Promise<{ files?: UserFileRow[] }>,
        userFilesApiJson("/api/user-files/share-targets") as Promise<{ targets?: ShareTargets }>,
      ]);
      this.files = listResult?.files ?? [];
      this.sharedFiles = sharedResult?.files ?? [];
      const targets = targetsResult?.targets;
      if (targets) this.targets = targets;
      this.pushCount();
    } catch (error) {
      this.error = formatUserFileError(error, t("Failed to load your files."));
    } finally {
      this.loading = false;
    }
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

  private readonly openSharing = (file: UserFileRow, rect: DOMRect) => {
    const current = new Set((file.shared ?? []).map(scope => scope.type + ":" + scope.id));
    this.sharingId = file.id;
    this.sharingDraft = (file.shared ?? [])
      .filter(scope => this.isScopeAvailable(scope))
      .map(scope => scope.type + ":" + scope.id)
      .join("|");
    this.sharingRect = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  };

  private readonly closeSharing = () => {
    this.sharingId = "";
    this.sharingDraft = "";
    this.sharingRect = null;
  };

  /** True when the given scope is still available as a share target. */
  private readonly isScopeAvailable = (scope: { type: string; id: string | null }): boolean => {
    if (scope.type === "GLOBAL") return this.targets.global;
    if (scope.type === "ROLE") return this.targets.roles.some(role => role.id === scope.id);
    if (scope.type === "USER") return this.targets.users.some(user => user.id === scope.id);
    return false;
  };

  private readonly toggleShareScope = (scopeType: string, scopeId: string | null, on: boolean) => {
    const key = scopeType + ":" + scopeId;
    const parts = new Set(this.sharingDraft.split("|").filter(Boolean));
    if (on) parts.add(key);
    else parts.delete(key);
    this.sharingDraft = [...parts].join("|");
  };

  private readonly saveSharing = async () => {
    const file = this.files.find(item => item.id === this.sharingId);
    if (!file) return;
    const scopes = this.sharingDraft
      .split("|")
      .filter(Boolean)
      .map(part => {
        const colon = part.indexOf(":");
        const type = part.slice(0, colon);
        const id = part.slice(colon + 1) || null;
        return { scope_type: type, scope_id: id };
      });
    this.uploading = true;
    this.error = "";
    this.message = "";
    try {
      await userFilesApiJson("/api/user-files/share", {
        method: "PUT",
        body: JSON.stringify({ id: file.id, scopes }),
      });
      const had = file.shared?.length ?? 0;
      const now = scopes.length;
      file.shared = scopes.map(scope => ({ type: scope.scope_type, id: scope.scope_id }));
      this.closeSharing();
      if (now && now >= had) this.message = t("Shared {name}.", { name: file.filename });
      else this.message = t("Stopped sharing {name}.", { name: file.filename });
      await this.fetchFiles();
    } catch (error) {
      this.error = formatUserFileError(error, t("Failed to share {name}.", { name: file.filename }));
    } finally {
      this.uploading = false;
    }
  };

  private readonly isShared = (file: UserFileRow): boolean => (file.shared?.length ?? 0) > 0;

  /** Columns offered for sorting. "Owner" only exists in the admin view of the
   *  own-files table and always in the shared table, so it is not offered
   *  everywhere. The trailing actions column has no header and is not
   *  sortable, mirroring the thumbnail column in the record lists. */
  private fileColumns = (includeOwner: boolean): UserFileColumn[] => {
    const columns: UserFileColumn[] = [{ key: "filename", label: () => t("File name") }];
    if (includeOwner) columns.push({ key: "owner", label: () => t("Owner") });
    columns.push(
      { key: "type", label: () => t("Type") },
      { key: "size", label: () => t("Size") },
      { key: "uploaded", label: () => t("Uploaded") },
    );
    return columns;
  };

  /** Raw cell value for one column. Sizes stay numbers and dates stay ISO
   *  strings, so they sort by magnitude and by time rather than by their
   *  formatted text. */
  private static fileValue = (columnKey: string, file: UserFileRow): unknown => {
    switch (columnKey) {
      case "filename": return file.filename;
      case "owner": return file.owner ?? "";
      case "type": return file.type;
      case "size": return file.sizeBytes;
      case "uploaded": return file.createdAt;
      default: return "";
    }
  };

  /** Searchable text of one row: the name, plus the "Shared" badge wording so
   *  that searching "shared" finds the shared own-files too. */
  private fileSearchText = (file: UserFileRow): unknown[] => [
    file.filename,
    file.owner,
    file.type,
    this.isShared(file) ? t("Shared") : "",
  ];

  private readonly sortFiles = (files: readonly UserFileRow[], sortKey: string): UserFileRow[] => {
    if (!sortKey) return [...files];
    return [...files].sort((left, right) =>
      compareListValues(
        UserFilesPanel.fileValue(sortKey, left),
        UserFilesPanel.fileValue(sortKey, right),
        this.sortDirection,
      )
      // Stable tiebreak, so equal sizes or dates do not shuffle between sorts.
      || String(left.id).localeCompare(String(right.id)));
  };

  private readonly toggleFileSort = (columnKey: string) => {
    const next = nextListSort(this.sortKey, this.sortDirection, columnKey);
    this.sortKey = next.sortKey;
    this.sortDirection = next.sortDirection;
  };

  private readonly handleQueryInput = (event: Event) => {
    this.query = (event.target as HTMLInputElement).value;
  };

  private static readonly TEXT_EXTENSIONS = new Set([
    "md", "markdown", "txt", "csv", "json", "js", "ts", "css", "html",
    "xml", "yml", "yaml", "ini", "log", "sh", "toml", "tex",
  ]);
  private static readonly IMAGE_EXTENSIONS = new Set([
    "png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp", "tiff",
  ]);
  private static readonly AUDIO_EXTENSIONS = new Set([
    "mp3", "ogg", "oga", "wav", "m4a", "flac", "aac", "opus", "webm",
  ]);
  private static readonly VIDEO_EXTENSIONS = new Set([
    "mp4", "webm", "ogv", "mov", "m4v",
  ]);

  private static readonly fileExtension = (filename: string): string =>
    filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";

  private readonly previewKindOf = (file: UserFileRow): "text" | "image" | "audio" | "video" | "pdf" | "odt" | "none" => {
    const ext = UserFilesPanel.fileExtension(file.filename);
    const type = (file.type || "").toLowerCase();
    if (type.startsWith("text/") || UserFilesPanel.TEXT_EXTENSIONS.has(ext) || type.includes("markdown")) return "text";
    if (type === "application/pdf" || ext === "pdf") return "pdf";
    if (type.startsWith("image/") || UserFilesPanel.IMAGE_EXTENSIONS.has(ext)) return "image";
    if (type.startsWith("audio/") || UserFilesPanel.AUDIO_EXTENSIONS.has(ext)) return "audio";
    if (type.startsWith("video/") || UserFilesPanel.VIDEO_EXTENSIONS.has(ext)) return "video";
    if (ext === "odt" || type === "application/vnd.oasis.opendocument.text") return "odt";
    return "none";
  };

  private static readonly isMarkdownName = (filename: string): boolean =>
    ["md", "markdown", "mdown", "mkd"].includes(UserFilesPanel.fileExtension(filename));

  private readonly previewUrlOf = (id: string): string =>
    pathPrefix + "/api/user-files/preview?id=" + encodeURIComponent(id);

  private readonly openPreview = (file: UserFileRow) => {
    this.closeSharing();
    this.previewId = file.id;
    this.previewText = "";
    this.previewDocumentHtml = "";
    this.previewError = "";
    const kind = this.previewKindOf(file);
    if (kind !== "text" && kind !== "odt") return;
    this.previewLoading = true;
    void (async () => {
      try {
        const response = await fetch(this.previewUrlOf(file.id));
        if (!response.ok) throw new Error(String(response.status));
        if (kind === "odt") {
          const bytes = new Uint8Array(await response.arrayBuffer());
          this.previewDocumentHtml = odtToHtml(bytes, { fragment: true });
        } else {
          this.previewText = await response.text();
        }
      } catch {
        this.previewError = t("Failed to load your files.");
      } finally {
        this.previewLoading = false;
      }
    })();
  };

  private readonly closePreview = () => {
    this.previewId = "";
    this.previewText = "";
    this.previewDocumentHtml = "";
    this.previewError = "";
    this.previewLoading = false;
  };

  private readonly previewFile = (): UserFileRow | null => {
    return this.files.find(item => item.id === this.previewId)
      ?? this.sharedFiles.find(item => item.id === this.previewId)
      ?? null;
  };

  /** Render the preview overlay body for the currently open file. */
  private readonly renderPreviewBody = (file: UserFileRow) => {
    const url = this.previewUrlOf(file.id);
    const kind = this.previewKindOf(file);
    if (kind === "image") return <img class="user-files-preview-media" src={url} alt={file.filename} />;
    if (kind === "audio") return <audio class="user-files-preview-media" src={url} controls autoplay />;
    if (kind === "video") return <video class="user-files-preview-media" src={url} controls autoplay />;
    if (kind === "pdf") {
      return (
        <iframe
          class="user-files-preview-iframe"
          src={url}
          title={file.filename}
        />
      );
    }
    if (kind === "text") {
      if (this.previewLoading) return <div class="field-callout"><p>{t("Loading preview…")}</p></div>;
      if (this.previewError) return <div class="error-banner"><p class="error-banner-message">{this.previewError}</p></div>;
      const isMarkdown = UserFilesPanel.isMarkdownName(file.filename) || (file.type || "").toLowerCase().includes("markdown");
      if (isMarkdown) {
        return <div class="user-files-preview-markdown">{renderMarkdownToJSX(this.previewText)}</div>;
      }
      return <pre class="user-files-preview-text">{this.previewText}</pre>;
    }
    if (kind === "odt") {
      if (this.previewLoading) return <div class="field-callout"><p>{t("Loading preview…")}</p></div>;
      if (this.previewError) return <div class="error-banner"><p class="error-banner-message">{this.previewError}</p></div>;
      return <OdtPreviewDocument html={this.previewDocumentHtml} dark={getEffectiveTheme() === "dark"} />;
    }
    return (
      <div class="pinboard-empty">
        <MaterialSymbol icon={folderIcon} />
        <p>{t("Preview not available for this file type.")}</p>
        <a
          class="primary-button"
          href={pathPrefix + "/api/user-files/download?id=" + encodeURIComponent(file.id)}
          download={file.filename}
        >
          <MaterialSymbol icon={downloadIcon} /> {t("Download")}
        </a>
      </div>
    );
  };

  private readonly renderPreview = () => {
    const file = this.previewFile();
    if (!file) return null;
    return (
      <div class="user-files-preview-backdrop" onclick={() => this.closePreview()}>
        <div
          class="user-files-preview-panel"
          role="dialog"
          aria-label={file.filename}
          onclick={(event) => { event.stopPropagation(); }}
        >
          <div class="user-files-preview-header">
            <strong class="user-files-preview-title">{file.filename}</strong>
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
              title={t("Close preview")}
              aria-label={t("Close preview")}
              onclick={() => this.closePreview()}
            >
              <MaterialSymbol icon={closeIcon} />
            </button>
          </div>
          <div class="user-files-preview-body">
            {this.renderPreviewBody(file)}
          </div>
        </div>
      </div>
    );
  };

  /** Fixed-position styles that keep the popover on screen next to the
   *  trigger button, flipped above it when it would overflow the viewport. */
  private readonly sharingStyle = (): Record<string, string> => {
    const rect = this.sharingRect ?? { left: 0, top: 0, width: 0, height: 0 };
    const popWidth = 280;
    const rows = this.targets.roles.length + this.targets.users.length + (this.targets.global ? 1 : 0);
    const estHeight = 110 + rows * 30;
    let left = rect.left + rect.width - popWidth;
    left = Math.max(8, Math.min(left, window.innerWidth - popWidth - 8));
    let top = rect.top + rect.height + 8;
    if (top + estHeight > window.innerHeight) top = Math.max(8, rect.top - estHeight - 8);
    return { position: "fixed", left: `${left}px`, top: `${top}px`, maxWidth: "calc(100vw - 16px)" };
  };

  private readonly renderSharePopover = () => {
    if (!this.sharingId) return null;
    const file = this.files.find(item => item.id === this.sharingId);
    if (!file) return null;
    const draft = new Set(this.sharingDraft.split("|").filter(Boolean));
    const has = (type: string, id: string | null) => draft.has(type + ":" + id);
    return (
      <div class="user-files-share-backdrop" onclick={() => this.closeSharing()}>
        <div
          class="user-files-share-popover"
          role="dialog"
          aria-label={t("Share")}
          style={this.sharingStyle()}
          onclick={(event) => { event.stopPropagation(); }}
        >
          <p class="user-files-share-title">{t("Share")}: <strong>{file.filename}</strong></p>
        {this.targets.global ? (
          <label class="user-files-share-option">
            <input
              type="checkbox"
              checked={has("GLOBAL", null)}
              onchange={(event) => {
                this.toggleShareScope("GLOBAL", null, (event.target as HTMLInputElement).checked);
              }}
            />
            <MaterialSymbol icon={shareIcon} />
            <span>{t("Share with everyone")}</span>
          </label>
        ) : null}
        {this.targets.roles.map(role => (
          <label class="user-files-share-option">
            <input
              type="checkbox"
              checked={has("ROLE", role.id)}
              onchange={(event) => {
                this.toggleShareScope("ROLE", role.id, (event.target as HTMLInputElement).checked);
              }}
            />
            <MaterialSymbol icon={checkIcon} />
            <span>{role.name}</span>
          </label>
        ))}
        {this.targets.users.map(userItem => (
          <label class="user-files-share-option">
            <input
              type="checkbox"
              checked={has("USER", userItem.id)}
              onchange={(event) => {
                this.toggleShareScope("USER", userItem.id, (event.target as HTMLInputElement).checked);
              }}
            />
            <MaterialSymbol icon={personIcon} />
            <span>{userItem.name}</span>
          </label>
        ))}
        <div class="user-files-share-actions">
          <button class="ghost-button" type="button" onclick={() => this.closeSharing()}>{t("Cancel")}</button>
          <button class="primary-button" type="button" onclick={() => void this.saveSharing()} disabled={this.uploading}>
            {t("Save")}
          </button>
        </div>
        </div>
      </div>
    );
  };

  /** One sortable column header. The arrow, `aria-sort` and the screen-reader
   *  status work like in the record lists; a real `<th>` already carries the
   *  `columnheader` role, so only the state has to be named. */
  private renderSortableHeader = (column: UserFileColumn) => {
    const isSortedBy = this.sortKey === column.key;
    const label = column.label();
    return (
      <th
        scope="col"
        aria-sort={isSortedBy ? (this.sortDirection === "asc" ? "ascending" : "descending") : "none"}
      >
        <button
          class={"list-sort" + (isSortedBy ? " is-active" : "")}
          type="button"
          title={t("Sort by {column}", { column: label })}
          aria-label={t("Sort by {column}", { column: label })}
          onclick={() => this.toggleFileSort(column.key)}
        >
          <span class="list-sort-label">{label}</span>
          <span class="list-sort-arrow" aria-hidden="true">
            {isSortedBy ? (this.sortDirection === "asc" ? "▲" : "▼") : "↕"}
          </span>
          {isSortedBy ? (
            <span class="visually-hidden">
              {this.sortDirection === "asc" ? t("Sorted ascending") : t("Sorted descending")}
            </span>
          ) : null}
        </button>
      </th>
    );
  };

  protected render() {
    const adminView = this.isAdminView();
    const needle = normalizeListSearchText(this.query);
    // One search field covers both tables: a file is a file, whether it was
    // uploaded by this account or shared with it.
    const matches = (file: UserFileRow) => listMatchesQuery(this.fileSearchText(file), needle);
    const ownColumns = this.fileColumns(adminView);
    const shownFiles = this.sortFiles(this.files.filter(matches), this.sortKey);
    const shownSharedFiles = this.sortFiles(this.sharedFiles.filter(matches), this.sortKey);
    const totalFiles = this.files.length + this.sharedFiles.length;
    const shownCount = shownFiles.length + shownSharedFiles.length;
    const searching = needle !== "";
    const showShared = !adminView && this.sharedFiles.length > 0;
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
          <div class="user-files-search-row">
            <div class="list-search">
              <label class="list-search-label" for="list-search-user-files">{t("Search")}</label>
              <input
                id="list-search-user-files"
                class="field-input list-search-input"
                type="search"
                placeholder={t("Search {tab}…", { tab: t("My files") })}
                /* The JSX runtime writes `value` as an attribute, and an
                 * attribute does not update a search box the user already typed
                 * in. Setting the property keeps the field in step. */
                ref={(element) => { if (element && element.value !== this.query) element.value = this.query; }}
                oninput={this.handleQueryInput}
              />
              {this.query ? (
                <button
                  class="list-search-clear"
                  type="button"
                  aria-label={t("Clear search")}
                  title={t("Clear search")}
                  onclick={() => { this.query = ""; }}
                >
                  <MaterialSymbol icon={closeIcon} />
                </button>
              ) : null}
            </div>
            <div class="user-files-search-actions">
              {searching ? (
                <span class="list-result-count">
                  {t("{shown} of {total} shown", { shown: shownCount, total: totalFiles })}
                </span>
              ) : null}
              {this.sortKey ? (
                <button
                  class="ghost-button"
                  type="button"
                  onclick={() => { this.sortKey = ""; }}
                >{t("Clear sorting")}</button>
              ) : null}
            </div>
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
        ) : shownFiles.length ? (
          <div class="storage-table-scroll">
            <table class="storage-table user-files-table">
              <thead>
                <tr>
                  {ownColumns.map((column) => this.renderSortableHeader(column))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shownFiles.map((file) => (
                  <tr key={file.id}>
                    <td>
                      <strong class="user-files-name">{file.filename}</strong>
                      {this.isShared(file) ? <span class="user-files-shared-badge">{t("Shared")}</span> : null}
                    </td>
                    {this.isAdminView() ? <td>{file.owner || "—"}</td> : null}
                    <td>{file.type}</td>
                    <td>{prettifyBytes(file.sizeBytes)}</td>
                    <td>{new Date(file.createdAt).toLocaleString()}</td>
                    <td class="user-files-actions">
                      <button
                        class="ghost-button"
                        type="button"
                        title={t("Share")}
                        aria-label={t("Share")}
                        onclick={(event) => { this.sharingId === file.id ? this.closeSharing() : this.openSharing(file, (event.currentTarget as HTMLElement).getBoundingClientRect()); }}
                        disabled={this.uploading}
                      >
                        <MaterialSymbol icon={shareIcon} />
                      </button>
                      <button
                        class="ghost-button"
                        type="button"
                        title={t("Preview")}
                        aria-label={t("Preview")}
                        onclick={() => this.previewId === file.id ? this.closePreview() : this.openPreview(file)}
                        disabled={this.previewLoading || this.uploading}
                      >
                        <MaterialSymbol icon={visibilityIcon} />
                      </button>
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
            {searching && this.files.length
              ? <p>{t("No matches in {tab}.", { tab: t("My files") })}</p>
              : <p>{t("No files yet. Upload something to get started.")}</p>}
          </div>
        )}

        {showShared ? (
          <div class="user-files-shared-section">
            <h3 class="user-files-section-title">
              <MaterialSymbol icon={shareIcon} />
              {t("Shared with me")}
            </h3>
            {shownSharedFiles.length ? (
            <div class="storage-table-scroll">
              <table class="storage-table user-files-table">
                <thead>
                  <tr>
                    {this.fileColumns(true).map((column) => this.renderSortableHeader(column))}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shownSharedFiles.map((file) => (
                    <tr key={file.id}>
                      <td><strong class="user-files-name">{file.filename}</strong></td>
                      <td>{file.owner || "—"}</td>
                      <td>{file.type}</td>
                      <td>{prettifyBytes(file.sizeBytes)}</td>
                      <td>{new Date(file.createdAt).toLocaleString()}</td>
                      <td class="user-files-actions">
                        <button
                          class="ghost-button"
                          type="button"
                          title={t("Preview")}
                          aria-label={t("Preview")}
                          onclick={() => this.previewId === file.id ? this.closePreview() : this.openPreview(file)}
                          disabled={this.previewLoading}
                        >
                          <MaterialSymbol icon={visibilityIcon} />
                        </button>
                        <a
                          class="ghost-button"
                          href={pathPrefix + "/api/user-files/download?id=" + encodeURIComponent(file.id)}
                          download={file.filename}
                          title={t("Download")}
                          aria-label={t("Download")}
                        >
                          <MaterialSymbol icon={downloadIcon} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            ) : (
              <div class="pinboard-empty">
                <MaterialSymbol icon={folderIcon} />
                <p>{t("No matches in {tab}.", { tab: t("Shared with me") })}</p>
              </div>
            )}
          </div>
        ) : null}

        {this.renderSharePopover()}
        {this.renderPreview()}
      </section>
    );
  }
}