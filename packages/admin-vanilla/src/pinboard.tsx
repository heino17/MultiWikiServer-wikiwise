import { customElement, JSXElement, state } from "@tiddlywiki/jsx-lit";
import addIcon from "@material-symbols/svg-400/outlined/add.svg";
import editIcon from "@material-symbols/svg-400/outlined/edit.svg";
import deleteIcon from "@material-symbols/svg-400/outlined/delete.svg";
import closeIcon from "@material-symbols/svg-400/outlined/close.svg";
import keepIcon from "@material-symbols/svg-400/outlined/keep.svg";
import visibilityIcon from "@material-symbols/svg-400/outlined/visibility.svg";
import visibilityOffIcon from "@material-symbols/svg-400/outlined/visibility_off.svg";
import taskAltIcon from "@material-symbols/svg-400/outlined/task_alt.svg";
import stickyNoteIcon from "@material-symbols/svg-400/outlined/sticky_note_2.svg";
import scheduleIcon from "@material-symbols/svg-400/outlined/schedule.svg";
import refreshIcon from "@material-symbols/svg-400/outlined/refresh.svg";
import copyIcon from "@material-symbols/svg-400/outlined/content_copy.svg";
import checkIcon from "@material-symbols/svg-400/outlined/check.svg";
import { MaterialSymbol } from "./material-symbol";
import { t } from "./i18n";

const PINBOARD_COLORS = ["yellow", "pink", "blue", "green", "orange", "purple"] as const;
type PinboardColor = typeof PINBOARD_COLORS[number];
type PinboardScope = "GLOBAL" | "ROLE" | "USER";
type PinboardFilter = "all" | "unread" | "mine";

/** The wall snaps notes to this raster: 1/20 of the wall's width/height. */
const SNAP_STEP = 0.05;
/** Default un-moved notes are spread over this many columns (like the old grid). */
const DEFAULT_COLS = 4;
/** Drags shorter than this many pixels count as a click, not a move. */
const DRAG_THRESHOLD_PX = 6;
/** Notes longer than this many characters are collapsed on the wall; a click opens the full text. */
const BODY_PREVIEW_CHARS = 130;
/** Notes longer than this many characters get a wider shape so long text wraps sideways instead of overflowing the wall's bottom. */
const BODY_WIDE_CHARS = 200;
/** The note composer accepts at most this many characters. */
const NOTE_BODY_MAX = 1700;

interface DragState {
  noteId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  offsetX: number;
  offsetY: number;
  moved: boolean;
}

const COLOR_LABELS: Record<PinboardColor, string> = {
  yellow: "Yellow",
  pink: "Pink",
  blue: "Blue",
  green: "Green",
  orange: "Orange",
  purple: "Purple",
};

export interface PinboardTargetRole {
  id: string;
  name: string;
}

export interface PinboardTargetUser {
  id: string;
  username: string;
}

export interface PinboardTargets {
  canPostGlobal: boolean;
  roles: PinboardTargetRole[];
  users: PinboardTargetUser[];
}

export interface PinboardNote {
  id: string;
  authorUserId: string;
  authorName: string;
  scopeType: PinboardScope;
  scopeId: string | null;
  scopeLabel: string;
  body: string;
  color: string;
  important: boolean;
  createdAt: string;
  expiresAt: string | null;
  read: boolean;
  dismissed: boolean;
  posX: number | null;
  posY: number | null;
  canEdit: boolean;
  canDelete: boolean;
}

export interface PinboardInfo {
  notes: PinboardNote[];
  unreadCount: number;
  targets: PinboardTargets;
}

export interface PinboardPanelProps {
  onCountsChange?: (counts: { noteCount: number; unreadCount: number }) => void;
}

function formatPinboardError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(error.message) as {
      reason?: unknown;
      details?: { reason?: unknown; prettyErrors?: unknown };
    };
    const reason = typeof parsed?.details?.reason === "string" ? parsed.details.reason : "";
    const pretty = typeof parsed?.details?.prettyErrors === "string" && parsed.details.prettyErrors.trim()
      ? parsed.details.prettyErrors
      : "";
    if (reason) return t(reason);
    if (pretty) {
      return pretty
        .replace(/^✖\s*/, "")
        .replace("Too big: expected string to have <=1700 characters", t("Too big: expected string to have <=1700 characters"))
        .replace(/\n?\s*→ at body$/, "")
        .trim();
    }
    const code = typeof parsed?.reason === "string" ? parsed.reason : "";
    if (code) return `${t("The request could not be completed.")} (${code})`;
  } catch {
    // Not JSON — fall through to the raw message.
  }
  return error.message || fallback;
}

async function apiJson(path: string, init?: RequestInit): Promise<any> {
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

/** A stable per-note rotation (degrees) derived from the note id. */
function tiltForId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return (Math.abs(hash) % 7) - 3;
}

function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface ScopeOption {
  scopeType: PinboardScope;
  scopeId: string;
  label: string;
}

@customElement("mws-pinboard")
export class PinboardPanel extends JSXElement {
  useLightDOM = true;

  @state() accessor props!: PinboardPanelProps;
  @state() accessor info: PinboardInfo | null = null;
  @state() accessor loading = false;
  @state() accessor error = "";
  @state() accessor filter: PinboardFilter = "all";
  /// Up-to-the-move position of notes the user is arranging, overriding the
  /// server-supplied `posX`/`posY` (immutable accessor, so moves re-render).
  @state() accessor layout: Record<string, { x: number; y: number }> = {};
  private drag: DragState | null = null;
  private wallCanvas: HTMLElement | null = null;
  /// Note currently shown full-size in the view modal (the wall stays put).
  @state() accessor viewNoteId: string | null = null;
  /// Note for which the "Copy to clipboard" feedback is currently shown.
  @state() accessor copiedNoteId: string | null = null;

  @state() accessor composerOpen = false;
  @state() accessor editingId: string | null = null;
  @state() accessor composerBody = "";
  @state() accessor composerColor: PinboardColor = "yellow";
  @state() accessor composerImportant = false;
  @state() accessor composerScopeType: PinboardScope = "GLOBAL";
  @state() accessor composerScopeId = "";
  @state() accessor composerExpiresAt = "";
  @state() accessor busy = false;

  private get me() {
    return embeddedServerResponse.userState;
  }

  connectedCallback(): void {
    super.connectedCallback();
    void this.fetchInfo();
  }

  private readonly pushCounts = (counts: { noteCount: number; unreadCount: number }) => {
    this.props?.onCountsChange?.(counts);
  };

  /** Replace the local note list so the renderer diffs in place (keeps the wall
   * and the scroll position); the unread counter is recomputed from the patch. */
  private readonly replaceNotes = (updater: (notes: PinboardNote[]) => PinboardNote[]) => {
    if (!this.info) return;
    const notes = updater(this.info.notes);
    const unreadCount = notes.reduce((count, note) => count + (this.isUnread(note) ? 1 : 0), 0);
    this.info = { ...this.info, notes, unreadCount };
    this.pushCounts({ noteCount: notes.length, unreadCount });
  };

  private readonly fetchInfo = async () => {
    this.loading = true;
    this.error = "";
    try {
      const info = await apiJson("/api/pinboard") as PinboardInfo;
      this.info = info;
      this.layout = {};
      this.pushCounts({ noteCount: info.notes.length, unreadCount: info.unreadCount });
    } catch (error) {
      this.error = formatPinboardError(error, t("Failed to load the pinboard."));
    } finally {
      this.loading = false;
    }
  };

  private scopeOptions(includeCurrent?: { scopeType: PinboardScope; scopeId: string | null; scopeLabel: string }): ScopeOption[] {
    const targets = this.info?.targets;
    const options: ScopeOption[] = [];
    if (targets?.canPostGlobal) {
      options.push({ scopeType: "GLOBAL", scopeId: "", label: t("Everyone") });
    }
    for (const role of targets?.roles ?? []) {
      options.push({ scopeType: "ROLE", scopeId: role.id, label: role.name });
    }
    for (const user of targets?.users ?? []) {
      options.push({ scopeType: "USER", scopeId: user.id, label: user.username });
    }
    if (includeCurrent?.scopeType && includeCurrent.scopeType !== "GLOBAL") {
      const exists = options.some(option =>
        option.scopeType === includeCurrent.scopeType && option.scopeId === includeCurrent.scopeId
      );
      if (!exists) {
        options.push({
          scopeType: includeCurrent.scopeType,
          scopeId: includeCurrent.scopeId ?? "",
          label: includeCurrent.scopeLabel || t("For {name}", { name: "" }),
        });
      }
    }
    return options;
  }

  private readonly openComposerFor = (note: PinboardNote | null) => {
    const targets = this.info?.targets;
    let scopeType: PinboardScope = "GLOBAL";
    if (!targets?.canPostGlobal) {
      scopeType = targets?.roles?.length ? "ROLE" : "USER";
    }
    this.editingId = note?.id ?? null;
    this.composerOpen = true;
    this.composerBody = note?.body ?? "";
    this.composerColor = PINBOARD_COLORS.includes(note?.color as PinboardColor)
      ? (note?.color as PinboardColor)
      : "yellow";
    this.composerImportant = note?.important ?? false;
    this.composerScopeType = note ? note.scopeType : scopeType;
    this.composerScopeId = note?.scopeType === "GLOBAL" ? "" : (note?.scopeId ?? "");
    this.composerExpiresAt = toDateTimeLocal(note?.expiresAt);
    this.error = "";
  };

  private readonly closeComposer = () => {
    if (this.busy) return;
    this.composerOpen = false;
    this.editingId = null;
  };

  private readonly handleScopeChange = (event: Event) => {
    const raw = (event.target as HTMLSelectElement).value;
    const separator = raw.indexOf(":");
    const scopeType = raw.slice(0, separator) as PinboardScope;
    const scopeId = raw.slice(separator + 1);
    this.composerScopeType = scopeType;
    this.composerScopeId = scopeType === "GLOBAL" ? "" : scopeId;
  };

  private readonly submitNote = async () => {
    const body = this.composerBody.trim();
    if (!body || this.busy) return;
    this.busy = true;
    this.error = "";
    try {
      await apiJson("/api/pinboard/note", {
        method: "PUT",
        body: JSON.stringify({
          id: this.editingId ?? undefined,
          body,
          color: this.composerColor,
          important: this.composerImportant,
          scopeType: this.composerScopeType,
          scopeId: this.composerScopeType === "GLOBAL" ? null : (this.composerScopeId || null),
          expiresAt: this.composerExpiresAt ? new Date(this.composerExpiresAt).toISOString() : null,
        }),
      });
      this.composerOpen = false;
      this.editingId = null;
      this.composerBody = "";
      this.composerExpiresAt = "";
      await this.fetchInfo();
    } catch (error) {
      this.error = formatPinboardError(error, this.editingId ? t("Failed to update the note.") : t("Failed to pin the note."));
    } finally {
      this.busy = false;
    }
  };

  private readonly setNoteRead = async (note: PinboardNote, read: boolean) => {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    const noteId = note.id;
    this.replaceNotes(notes => notes.map(item => item.id === noteId ? { ...item, read } : item));
    try {
      await apiJson("/api/pinboard/read", {
        method: "PUT",
        body: JSON.stringify({ id: noteId, read }),
      });
    } catch (error) {
      this.error = formatPinboardError(error, t("Failed to update the note."));
      await this.fetchInfo();
    } finally {
      this.busy = false;
    }
  };

  private readonly setNoteDismissed = async (note: PinboardNote, dismissed: boolean) => {
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    const noteId = note.id;
    this.replaceNotes(notes => notes.map(item => item.id === noteId ? { ...item, dismissed } : item));
    try {
      await apiJson("/api/pinboard/read", {
        method: "PUT",
        body: JSON.stringify({ id: noteId, dismissed }),
      });
    } catch (error) {
      this.error = formatPinboardError(error, t("Failed to update the note."));
      await this.fetchInfo();
    } finally {
      this.busy = false;
    }
  };

  private readonly removeNote = async (note: PinboardNote) => {
    if (!globalThis.confirm(t("Really remove this note?"))) return;
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    const noteId = note.id;
    this.replaceNotes(notes => notes.filter(item => item.id !== noteId));
    try {
      await apiJson("/api/pinboard/note/delete", {
        method: "PUT",
        body: JSON.stringify({ id: noteId }),
      });
      if (this.viewNoteId === note.id) this.viewNoteId = null;
      this.composerOpen = false;
      this.editingId = null;
    } catch (error) {
      this.error = formatPinboardError(error, t("Failed to remove the note."));
      await this.fetchInfo();
    } finally {
      this.busy = false;
    }
  };

  private readonly copyNoteBody = async (note: PinboardNote) => {
    try {
      await navigator.clipboard.writeText(note.body);
      this.copiedNoteId = note.id;
      window.setTimeout(() => {
        if (this.copiedNoteId === note.id) this.copiedNoteId = null;
      }, 1600);
    } catch (error) {
      this.error = formatPinboardError(error, t("Could not copy to the clipboard."));
    }
  };

  private readonly openNote = (note: PinboardNote) => {
    this.viewNoteId = note.id;
    if (note.authorUserId !== this.me.user_id && !note.read && !note.dismissed) {
      void this.setNoteRead(note, true);
    }
  };

  private readonly matchesMine = (note: PinboardNote): boolean => {
    if (note.authorUserId === this.me.user_id) return true;
    if (note.scopeType === "USER") return note.scopeId === this.me.user_id;
    if (note.scopeType === "ROLE") {
      return this.me.roles.some(role => role.role_id === note.scopeId);
    }
    return false;
  };

  private readonly isMine = (note: PinboardNote): boolean => note.authorUserId === this.me.user_id;
  private readonly isUnread = (note: PinboardNote): boolean => !this.isMine(note) && !note.read && !note.dismissed;

  /**
   * Where the note sits on the wall for the current user: a moved note keeps
   * its drag position; a saved one uses the server value; untouched notes fall
   * back to a tidy grid spread so fresh walls still look organised.
   */
  private readonly getPosition = (note: PinboardNote, index: number, count: number): { x: number; y: number } => {
    const placed = this.layout[note.id]
      ?? (note.posX != null && note.posY != null ? { x: note.posX, y: note.posY } : null);
    if (placed) return placed;
    const col = index % DEFAULT_COLS;
    const row = Math.floor(index / DEFAULT_COLS);
    const totalRows = Math.max(Math.ceil(count / DEFAULT_COLS), 1);
    return { x: (col + 0.5) / DEFAULT_COLS, y: row / totalRows };
  };

  private readonly snapPosition = (x: number, y: number): { x: number; y: number } => {
    const clamp = (value: number) => Math.min(1, Math.max(0, value));
    return { x: clamp(Math.round(x / SNAP_STEP) * SNAP_STEP), y: clamp(Math.round(y / SNAP_STEP) * SNAP_STEP) };
  };

  private readonly beginDrag = (event: PointerEvent, note: PinboardNote) => {
    if (this.drag || !this.wallCanvas) return;
    const target = event.target as Element | null;
    if (target?.closest("button, a, input, select, textarea, .pinboard-note-actions")) return;
    const anchor = (event.currentTarget as Element).getBoundingClientRect();
    const canvasRect = this.wallCanvas.getBoundingClientRect();
    this.drag = {
      noteId: note.id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      offsetX: (event.clientX - (anchor.left + anchor.width / 2)) / canvasRect.width,
      offsetY: (event.clientY - anchor.top) / canvasRect.height,
      moved: false,
    };
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  private readonly onDragMove = (event: PointerEvent, note: PinboardNote) => {
    const drag = this.drag;
    if (!drag || drag.noteId !== note.id || drag.pointerId !== event.pointerId || !this.wallCanvas) return;
    if (!drag.moved) {
      const dx = event.clientX - drag.startClientX;
      const dy = event.clientY - drag.startClientY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
    }
    const rect = this.wallCanvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const rawX = (event.clientX - rect.left) / rect.width - drag.offsetX;
    const rawY = (event.clientY - rect.top) / rect.height - drag.offsetY;
    this.layout = { ...this.layout, [note.id]: this.snapPosition(rawX, rawY) };
  };

  private readonly endDrag = (event: PointerEvent, note: PinboardNote) => {
    const drag = this.drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    this.drag = null;
    if (event.currentTarget instanceof Element && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved) {
      const pos = this.layout[note.id];
      if (pos) void this.savePosition(note.id, pos.x, pos.y);
    } else {
      this.openNote(note);
    }
  };

  private readonly cancelDrag = (event: PointerEvent, note: PinboardNote) => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    this.drag = null;
  };

  private readonly savePosition = async (id: string, x: number, y: number) => {
    try {
      await apiJson("/api/pinboard/layout", {
        method: "PUT",
        body: JSON.stringify({ id, x, y }),
      });
    } catch (error) {
      this.error = formatPinboardError(error, t("Failed to save the note position."));
    }
  };

  private readonly renderNote = (note: PinboardNote, mode: "wall" | "filed", index = 0, count = 1): JSX.Node => {
    const mine = this.isMine(note);
    const unread = this.isUnread(note);
    const read = !mine && note.read && !note.dismissed;
    const dragging = mode === "wall" && this.drag?.noteId === note.id;
    const pos = mode === "wall" ? this.getPosition(note, index, count) : null;
    const hasMore = note.body.length > BODY_PREVIEW_CHARS;
    const previewBody = hasMore
      ? note.body.slice(0, BODY_PREVIEW_CHARS).replace(/\s+\S*$/, "") + " …"
      : note.body;
    const scope = note.scopeType === "GLOBAL"
      ? t("Everyone")
      : note.scopeType === "USER"
        ? (note.scopeId === this.me.user_id ? t("For you") : t("For {name}", { name: note.scopeLabel }))
        : note.scopeLabel;
    const classes = [
      "pinboard-note",
      "is-" + note.color,
      note.important ? "is-important" : "",
      unread ? "is-unread" : "",
      read ? "is-read" : "",
      note.dismissed ? "is-dismissed" : "",
      note.body.length > BODY_WIDE_CHARS ? "is-wide" : "",
      dragging ? "is-dragging" : "",
    ].filter(Boolean).join(" ");

    return (
      <article
        key={note.id}
        class={classes}
        {...(mode === "wall" && pos
          ? {
              style: {
                left: `${pos.x * 100}%`,
                top: `${pos.y * 100}%`,
                zIndex: String(dragging ? 100 : note.important ? 3 : 1),
              },
              onpointerdown: (event: PointerEvent) => this.beginDrag(event, note),
              onpointermove: (event: PointerEvent) => this.onDragMove(event, note),
              onpointerup: (event: PointerEvent) => this.endDrag(event, note),
              onpointercancel: (event: PointerEvent) => this.cancelDrag(event, note),
            }
          : {
              onclick: () => this.openNote(note),
            })}
      >
        <div class="pinboard-note-inner" style={{ transform: `rotate(${dragging ? 0 : tiltForId(note.id)}deg) scale(${dragging ? 1.06 : 1})` }}>
          <span class="pinboard-note-tape" aria-hidden="true" />
        {note.important ? (
          <span class="pinboard-note-pin" aria-hidden="true" title={t("Important")}>
            <MaterialSymbol icon={keepIcon} />
          </span>
        ) : null}
        <div class="pinboard-note-body">{previewBody}</div>
        <div class="pinboard-note-byline">
          <strong>{note.authorName}</strong>
          {read ? <span class="pinboard-note-read" title={t("Read")}><MaterialSymbol icon={taskAltIcon} /></span> : unread ? <span class="pinboard-note-new" title={t("Unread")}><MaterialSymbol icon={visibilityIcon} /></span> : null}
          {mine ? <span class="pinboard-note-mine">{t("Mine")}</span> : null}
        </div>
        <div class="pinboard-note-meta">
          <span class="pinboard-note-scope" title={t("Audience")}>{scope}</span>
          <time>{new Date(note.createdAt).toLocaleString()}</time>
        </div>
        {note.expiresAt ? (
          <div class="pinboard-note-expiry">
            <MaterialSymbol icon={scheduleIcon} />
            <span>{new Date(note.expiresAt).toLocaleString()}</span>
          </div>
        ) : null}
        <div class="pinboard-note-actions" onclick={(event) => event.stopPropagation()}>
          {!mine ? (
            note.read
              ? (
                <button type="button" class="pinboard-action" title={t("Mark unread")} onclick={() => void this.setNoteRead(note, false)}>
                  <MaterialSymbol icon={visibilityOffIcon} /> {t("Mark unread")}
                </button>
              )
              : (
                <button type="button" class="pinboard-action" title={t("Mark read")} onclick={() => void this.setNoteRead(note, true)}>
                  <MaterialSymbol icon={taskAltIcon} /> {t("Mark read")}
                </button>
              )
          ) : null}
          {!mine && !note.dismissed ? (
            <button type="button" class="pinboard-action" title={t("File away")} onclick={() => void this.setNoteDismissed(note, true)}>
              <MaterialSymbol icon={stickyNoteIcon} /> {t("File away")}
            </button>
          ) : null}
          {note.dismissed ? (
            <button type="button" class="pinboard-action" title={t("Show again")} onclick={() => void this.setNoteDismissed(note, false)}>
              <MaterialSymbol icon={visibilityIcon} /> {t("Show again")}
            </button>
          ) : null}
          {note.canEdit ? (
            <button type="button" class="pinboard-action" title={t("Edit note")} onclick={() => this.openComposerFor(note)}>
              <MaterialSymbol icon={editIcon} /> {t("Edit note")}
            </button>
          ) : null}
          {note.canDelete ? (
            <button type="button" class="pinboard-action is-danger" title={t("Remove note")} onclick={() => void this.removeNote(note)}>
              <MaterialSymbol icon={deleteIcon} /> {t("Remove note")}
            </button>
          ) : null}
        </div>
        </div>
      </article>
    );
  };

  protected render() {
    const notes = this.info?.notes ?? [];
    const viewNote = this.viewNoteId ? notes.find(note => note.id === this.viewNoteId) ?? null : null;
    const targets = this.info?.targets;
    const unreadNotes = notes.filter(note => this.isUnread(note));
    const mineNotes = notes.filter(note => this.matchesMine(note) && !note.dismissed);
    const shownNotes: PinboardNote[] = [];
    const filedAwayNotes: PinboardNote[] = [];
    for (const note of notes) {
      if (note.dismissed) {
        filedAwayNotes.push(note);
        continue;
      }
      if (this.filter === "unread" && !this.isUnread(note)) continue;
      if (this.filter === "mine" && !this.matchesMine(note)) continue;
      shownNotes.push(note);
    }

    const scopeOptions = this.scopeOptions(this.editingId
      ? notes.find(note => note.id === this.editingId)
      : undefined);
    const currentScopeValue = `${this.composerScopeType}:${this.composerScopeId}`;
    const canPin = scopeOptions.length > 0;

    const filterChips: { id: PinboardFilter; label: string; count: number }[] = [
      { id: "all", label: t("All"), count: shownNotes.length + filedAwayNotes.length },
      { id: "unread", label: t("Unread"), count: unreadNotes.length },
      { id: "mine", label: t("Mine"), count: mineNotes.length },
    ];

    return (
      <section class="pinboard-panel">
        <div class="pinboard-toolbar">
          <div class="pinboard-filters" role="group" aria-label={t("Filter")}>
            {filterChips.map(chip => (
              <button
                key={chip.id}
                type="button"
                class={this.filter === chip.id ? "filter-chip is-active" : "filter-chip"}
                onclick={() => { this.filter = chip.id; }}
              >
                <span>{chip.label}</span>
                <small>{chip.count}</small>
              </button>
            ))}
          </div>
          <div class="pinboard-toolbar-actions">
            <button
              class="ghost-button"
              type="button"
              onclick={() => void this.fetchInfo()}
              disabled={this.loading || this.busy}
            >
              <MaterialSymbol icon={refreshIcon} /> {t("Refresh")}
            </button>
            <button
              class="primary-button"
              type="button"
              onclick={() => this.openComposerFor(null)}
              disabled={!canPin}
              title={canPin ? undefined : t("You have no one to pin a note for yet.")}
            >
              <MaterialSymbol icon={addIcon} /> {t("New note")}
            </button>
          </div>
          <p class="pinboard-hint">{t("The \"Mark as read\" is seen by NO ONE else; it only serves your own overview.")}</p>
        </div>

        {this.error ? (
          <div class="error-banner" role="alert">
            <span class="error-banner-icon" aria-hidden="true"><MaterialSymbol icon={closeIcon} /></span>
            <p class="error-banner-message">{this.error}</p>
            <button class="ghost-button error-banner-dismiss" type="button" onclick={() => { this.error = ""; }}>{t("Dismiss")}</button>
          </div>
        ) : null}

        {this.composerOpen ? (
          <section class="pinboard-composer">
            <header class="pinboard-composer-header">
              <h4>{this.editingId ? t("Edit note") : t("New note")}</h4>
              <button class="close-button" type="button" aria-label={t("Close")} onclick={this.closeComposer} disabled={this.busy}>
                <MaterialSymbol icon={closeIcon} />
              </button>
            </header>
            <div class="pinboard-composer-layout">
              <label class="pinboard-composer-body" for="pinboard-note-body">
                <textarea
                  id="pinboard-note-body"
                  class="field-input pinboard-textarea"
                  placeholder={t("Write a note…")}
                  maxlength={NOTE_BODY_MAX}
                  ref={(element) => { if (element && element.value !== this.composerBody) element.value = this.composerBody; }}
                  oninput={(event) => { this.composerBody = (event.target as HTMLTextAreaElement).value; }}
                  disabled={this.busy}
                />
                <span class={this.composerBody.length >= NOTE_BODY_MAX ? "pinboard-char-count is-full" : "pinboard-char-count"} aria-live="polite">
                  {this.composerBody.length}/{NOTE_BODY_MAX}
                </span>
              </label>
              <div class="pinboard-composer-side">
                <div class="pinboard-composer-row">
                  <span class="pinboard-composer-label">{t("Color")}</span>
                  <div class="pinboard-swatches" role="radiogroup" aria-label={t("Color")}>
                    {PINBOARD_COLORS.map(color => (
                      <button
                        type="button"
                        key={color}
                        class={this.composerColor === color ? `pinboard-swatch is-${color} is-active` : `pinboard-swatch is-${color}`}
                        role="radio"
                        aria-checked={this.composerColor === color}
                        aria-label={t(COLOR_LABELS[color])}
                        title={t(COLOR_LABELS[color])}
                        onclick={() => { this.composerColor = color; }}
                      />
                    ))}
                  </div>
                </div>
                <label class="pinboard-check">
                  <input type="checkbox" checked={this.composerImportant} onchange={(event) => { this.composerImportant = (event.target as HTMLInputElement).checked; }} />
                  <span>{t("Important")}</span>
                </label>
                <div class="pinboard-composer-row">
                  <span class="pinboard-composer-label">{t("For")}</span>
                  <select class="field-input" onchange={this.handleScopeChange} disabled={this.busy}>
                    {scopeOptions.filter(option => option.scopeType === "GLOBAL").map(option => (
                      <option key="GLOBAL" value={`GLOBAL:`} selected={currentScopeValue === "GLOBAL:"}>{option.label}</option>
                    ))}
                    {scopeOptions.some(option => option.scopeType === "ROLE") ? (
                      <optgroup label={t("Classes")}>
                        {scopeOptions.filter(option => option.scopeType === "ROLE").map(option => (
                          <option key={option.scopeId} value={`ROLE:${option.scopeId}`} selected={currentScopeValue === `ROLE:${option.scopeId}`}>{option.label}</option>
                        ))}
                      </optgroup>
                    ) : null}
                    {scopeOptions.some(option => option.scopeType === "USER") ? (
                      <optgroup label={t("People")}>
                        {scopeOptions.filter(option => option.scopeType === "USER").map(option => (
                          <option key={option.scopeId} value={`USER:${option.scopeId}`} selected={currentScopeValue === `USER:${option.scopeId}`}>{option.label}</option>
                        ))}
                      </optgroup>
                    ) : null}
                  </select>
                </div>
                <div class="pinboard-composer-row">
                  <span class="pinboard-composer-label">{t("Expiry")}</span>
                  <input
                    type="datetime-local"
                    class="field-input"
                    value={this.composerExpiresAt}
                    oninput={(event) => { this.composerExpiresAt = (event.target as HTMLInputElement).value; }}
                    disabled={this.busy}
                  />
                </div>
              </div>
            </div>
            <footer class="pinboard-composer-footer">
              <div>
                {this.editingId ? <p class="field-helper">{t("Editing your note updates it for everyone.")}</p> : null}
              </div>
              <div style="display:flex; gap:0.75rem; align-items:center;">
                <button class="ghost-button" type="button" onclick={this.closeComposer} disabled={this.busy}>{t("Cancel")}</button>
                <button class="primary-button" type="button" onclick={() => void this.submitNote()} disabled={this.busy || !this.composerBody.trim()}>
                  {this.editingId ? (this.busy ? t("Saving...") : t("Save changes")) : (this.busy ? t("Pinning…") : t("Pin it"))}
                </button>
              </div>
            </footer>
          </section>
        ) : null}

        {this.loading ? (
          <div class="field-callout"><p>{t("Loading pinboard…")}</p></div>
        ) : shownNotes.length || filedAwayNotes.length ? (
          <div class="pinboard-wall">
            {shownNotes.length ? (
              <div
                class="pinboard-wall-canvas"
                ref={(element) => { this.wallCanvas = element; }}
              >
                {shownNotes.map((note, index) => this.renderNote(note, "wall", index, shownNotes.length))}
              </div>
            ) : null}
            {filedAwayNotes.length ? (
              <div class="pinboard-filed-away">
                <p class="pinboard-filed-label">{t("Filed away")}</p>
                <div class="pinboard-wall-grid">{filedAwayNotes.map(note => this.renderNote(note, "filed"))}</div>
              </div>
            ) : null}
          </div>
        ) : (
          <div class="pinboard-empty">
            <MaterialSymbol icon={stickyNoteIcon} />
            <p>{this.filter === "all" ? t("No notes here yet.") : this.filter === "unread" ? t("Nothing new to read.") : t("No notes for you yet.")}</p>
          </div>
        )}

        {viewNote ? (
          <div class="modal-shell modal-shell-centered" webjsx-attr-open onclick={(event) => {
            if (event.target === event.currentTarget) this.viewNoteId = null;
          }}>
            <section class="modal-card pinboard-viewer" role="dialog" aria-modal="true" aria-label={t("Note")}>
              <header class="modal-header">
                <div class="modal-title">
                  <p class="eyebrow">{viewNote.scopeType === "GLOBAL"
                    ? t("Everyone")
                    : viewNote.scopeType === "USER"
                      ? (viewNote.scopeId === this.me.user_id ? t("For you") : t("For {name}", { name: viewNote.scopeLabel }))
                      : viewNote.scopeLabel}</p>
                  <h3>{viewNote.authorName}</h3>
                </div>
                <div class="close-button" onclick={() => { this.viewNoteId = null; }} aria-label={t("Close")}>
                  <MaterialSymbol icon={closeIcon} />
                </div>
              </header>
              <div class="modal-layout pinboard-viewer-layout">
                <div class={"pinboard-viewer-note is-" + viewNote.color}>{viewNote.body}</div>
                <div class="pinboard-viewer-meta">
                  <span class="pinboard-note-scope">{viewNote.scopeType === "GLOBAL"
                    ? t("Everyone")
                    : viewNote.scopeType === "USER"
                      ? (viewNote.scopeId === this.me.user_id ? t("For you") : t("For {name}", { name: viewNote.scopeLabel }))
                      : viewNote.scopeLabel}</span>
                  <time>{new Date(viewNote.createdAt).toLocaleString()}</time>
                  {viewNote.expiresAt ? (
                    <span class="pinboard-viewer-expiry">
                      <MaterialSymbol icon={scheduleIcon} />
                      <span>{t("Expires {date}", { date: new Date(viewNote.expiresAt).toLocaleString() })}</span>
                    </span>
                  ) : null}
                  {this.isMine(viewNote) ? <span class="pinboard-note-mine">{t("Mine")}</span> : null}
                </div>
              </div>
              <footer class="pinboard-viewer-actions">
                {!this.isMine(viewNote) ? (
                  (viewNote.read
                    ? <button type="button" class="pinboard-action" onclick={() => void this.setNoteRead(viewNote, false)}><MaterialSymbol icon={visibilityOffIcon} /> {t("Mark unread")}</button>
                    : <button type="button" class="pinboard-action" onclick={() => void this.setNoteRead(viewNote, true)}><MaterialSymbol icon={taskAltIcon} /> {t("Mark read")}</button>)
                ) : null}
                {!this.isMine(viewNote) && !viewNote.dismissed ? (
                  <button type="button" class="pinboard-action" onclick={() => void this.setNoteDismissed(viewNote, true)}><MaterialSymbol icon={stickyNoteIcon} /> {t("File away")}</button>
                ) : null}
                {viewNote.dismissed ? (
                  <button type="button" class="pinboard-action" onclick={() => void this.setNoteDismissed(viewNote, false)}><MaterialSymbol icon={visibilityIcon} /> {t("Show again")}</button>
                ) : null}
                {viewNote.canEdit ? (
                  <button type="button" class="pinboard-action" onclick={() => { this.viewNoteId = null; this.openComposerFor(viewNote); }}><MaterialSymbol icon={editIcon} /> {t("Edit note")}</button>
                ) : null}
                {viewNote.canDelete ? (
                  <button type="button" class="pinboard-action is-danger" onclick={() => void this.removeNote(viewNote)}><MaterialSymbol icon={deleteIcon} /> {t("Remove note")}</button>
                ) : null}
                <button type="button" class={this.copiedNoteId === viewNote.id ? "pinboard-action is-copied" : "pinboard-action"} onclick={() => void this.copyNoteBody(viewNote)}>
                  <MaterialSymbol icon={this.copiedNoteId === viewNote.id ? checkIcon : copyIcon} />
                  {this.copiedNoteId === viewNote.id ? t("Copied") : t("Copy to clipboard")}
                </button>
                <button class="primary-button" type="button" onclick={() => { this.viewNoteId = null; }}>{t("Close")}</button>
              </footer>
            </section>
          </div>
        ) : null}
      </section>
    );
  }
}