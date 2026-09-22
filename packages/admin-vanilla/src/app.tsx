import { customElement, JSXElement, addstyles, state } from "@tiddlywiki/jsx-lit";
import css from "./app.inline.css";
import warningIcon from "@material-symbols/svg-400/outlined/warning.svg";
import closeIcon from "@material-symbols/svg-400/outlined/close.svg";
import accountCircleIcon from "@material-symbols/svg-400/outlined/account_circle.svg";
import expandIcon from "@material-symbols/svg-400/outlined/keyboard_arrow_down.svg";
import backupIcon from "@material-symbols/svg-400/outlined/backup.svg";
import deleteIcon from "@material-symbols/svg-400/outlined/delete.svg";
import darkModeIcon from "@material-symbols/svg-400/outlined/dark_mode.svg";
import lightModeIcon from "@material-symbols/svg-400/outlined/light_mode.svg";
import { MaterialSymbol } from "./material-symbol";
import {
  getAllTabs,
  getTab,
  TabId,
  ColumnDefinition,
  FieldDefinition,
  FieldGroupDefinition,
  FieldSection,
  FieldType,
  Mode,
  TabDefinition,
  PermissionRow,
  AdminRecordStore,
  WikiAdminRecord,
  UserAdminRecord,
  RoleAdminRecord,
  BagAdminRecord,
  WritablePrefixRow,
  getSectionHeading,
  getFieldLabel,
  TemplateTypes,
  IdString,

  KeyFields
} from "./definition/tabs";

import { adminStorage, createDraft, getEmptyItems, jsonReviver } from "./definition/store";
import { definitely, is } from "./definition/utils";
import { logout } from "./passwords";
import { fieldTypeRenderSidebars, formatFieldValue, renderFieldEditor, renderFieldSidebar, renderSwitchField, textWithSlashes } from "./definition/renders";
import { tw5logo } from "./logos";
import { getCurrentLocale, setCurrentLocale, supportedLocales, t, type LocaleCode } from "./i18n";
import { getEffectiveTheme, toggleTheme, type ThemeMode } from "./theme";
import "./pinboard";
import "./user-files";


declare global {
  namespace JSX {
    interface IntrinsicElements {
      "mws-pinboard": {
        onCountsChange?: (counts: { noteCount: number; unreadCount: number }) => void;
      };
      "mws-user-files": import("./user-files").UserFilesPanelProps;
    }
  }
}

export type AdminRecord = { id: IdString; };

type ModalMode = "create" | "edit";

type ModalState = {
  [K in TabId]: {
    tabId: K;
    mode: ModalMode;
    draft: AdminRecordStore[K][number];
    /** The unedited original the draft was from. */
    saved: AdminRecordStore[K][number];
    resolverTitle: string;
    operationMessages: Record<string, string>;
    pendingRows: Record<string, number>;
    transientPermissionRows: Record<string, PermissionRow[]>;
    storageError: string;
    loading?: boolean;
  };
}[TabId];

type ModalStateForTab<T extends TabId> = Extract<ModalState, { tabId: T }>;

export interface PerTabFieldState {
  readonly tabId: TabId;
  readonly mode: ModalMode;
  readonly draft: AdminRecord;
  readonly saved: AdminRecord;
  readonly resolverTitle: string;
  readonly operationMessages: Record<string, string>;
  readonly pendingRows: Record<string, number>;
  readonly transientPermissionRows: Record<string, PermissionRow[]>;
  readonly storageError: string;
  readonly loading?: boolean;
}

interface PerTabStore {
  readonly fieldState: PerTabFieldState | null;
  readonly selectedTab: TabDefinition | null;
  readonly itemsByTab: AdminRecordStore;
  readonly displayedStorageError: string;
  readonly isModalLoading: boolean;
  readonly isSaving: boolean;
  readonly isOpeningItem: boolean;
  readonly isOpen: boolean;
  readonly isBusy: boolean;
  readonly clearStorageError: () => void;
  readonly closeModal: () => void;
  readonly reloadItems: () => Promise<void>;
  readonly openCreate: (tabId: TabId) => void;
  readonly openItem: (tabId: TabId, recordId: IdString) => Promise<void>;
  readonly saveDraft: () => Promise<void>;
  readonly updateDraft: DraftChangeHandler;
  readonly updatePendingRows: PendingRowsChangeHandler;
  readonly updateTransientPermissionRows: PermissionRowsChangeHandler;
  readonly updateResolverTitle: ResolverTitleChangeHandler;
  readonly triggerOperation: OperationTriggerHandler;
}

interface AppStoreState {
  activeTab: TabId | "storage" | "pinboard" | "files";
  itemsByTab: AdminRecordStore;
  isLoadingData: boolean;
}

interface PerTabStoreState {
  modalState: ModalState | null;
  isOpeningItem: boolean;
  isSaving: boolean;
}

interface PerTabStoreDependencies {
  getItemsByTab(): AdminRecordStore;
  replaceItemsByTab(itemsByTab: AdminRecordStore): void;
  setActiveTab(tabId: TabId | "storage" | "pinboard" | "files"): void;
  reloadItems(): Promise<void>;
  requestUpdate(): void;
}

interface UpdateHost {
  requestUpdate(): void;
}

export interface AdminStorage {
  loadAll(): Promise<AdminRecordStore>;
  read<T extends TabId>(tabId: T, id: IdString): Promise<AdminRecordStore[T][number] | null>;
  save<T extends TabId>(tabId: T, record: AdminRecordStore[T][number]): Promise<AdminRecordStore[T]>;
}

export type DraftChangeHandler<T = unknown> = (fieldKey: string, value: T) => void;
export type PendingRowsChangeHandler = (fieldKey: string, updater: (count: number) => number) => void;
export type PermissionRowsChangeHandler = (fieldKey: string, rows: PermissionRow[]) => void;
export type ResolverTitleChangeHandler = (value: string) => void;
export type OperationTriggerHandler = (fieldKey: string, message: string) => void;

interface FieldBlockProps {
  field: FieldDefinition;
  value: unknown;
  saved?: unknown;
  disabled?: boolean;
  useCardTitle?: boolean;
  store: PerTabStore;
}



interface MissingDependencyLine {
  value: string;
  missing: boolean;
}

interface SidebarSectionProps {
  title: string;
  content: JSX.Node;
}

interface ToggleFieldProps {
  field: FieldDefinition;
  value: boolean;
  onDraftChange: DraftChangeHandler<boolean>;
  headerOnly?: boolean;
}

interface RecordModalProps {
  store: PerTabStore;
}



export function isServerField(mode: Mode) {
  return ["create", "create edit", "edit", "server"].includes(mode);
}
function isAuthoredField(mode: Mode) {
  return ["create", "create edit", "edit"].includes(mode);
}

function isEditable(field: FieldDefinition, mode: ModalMode): boolean {
  if (!field.mode) return false;
  if (field.mode === "create edit") return true;
  if (field.mode === "create") return mode === "create";
  if (field.mode === "edit") return mode === "edit";
  if (field.mode === "create edit temp") return true;
  if (field.mode === "create temp") return mode === "create";
  if (field.mode === "edit temp") return mode === "edit";
  if (field.mode === "server") return false;
  const t: never = field.mode;
  return false;
}

function getSingularLabel(tab: TabDefinition): string {
  const singularKey = tab.label.endsWith("s") ? tab.label.slice(0, -1) : tab.label;
  return t(singularKey);
}

function getGroupTitleLabel(group: FieldGroupDefinition, groupFields: FieldDefinition[]): string {
  if (group.title) return t(group.title);
  if (groupFields.length === 1) return t(groupFields[0].label);
  return groupFields.map((field) => t(field.label)).join(t(" and "));
}

function getPrimaryValue(tab: TabDefinition, item: AdminRecord): string {
  const primary = tab.columns[0] ?? tab.fields[0];
  return formatFieldValue(getAdminRecordValue(primary, item));
}

function getCreateLabel(tab: TabDefinition): string {
  return t(tab.createLabel);
}



function getFieldSection(field: FieldDefinition): FieldSection {
  return field.section ?? (isAuthoredField(field.mode) ? "authored" : "runtime");
}

function getSectionFields(tab: TabDefinition, section: FieldSection): FieldDefinition[] {
  // if (tab.id === "wikis" && section === "runtime") return [];
  // if (tab.id === "templates" && section === "runtime") return [];
  if (!tab.fieldGroups?.[section]?.length) return [];
  return tab.fields.filter((field) => {
    return getFieldSection(field) === section;
  });
}

function getSidebarFields(tab: TabDefinition) {
  const keys = new Set(tab.sidebarDisplay);
  return tab.fields.filter(e => keys.has(e.key));
}

function getFieldGroups(tab: TabDefinition, section: FieldSection, fields: FieldDefinition[]): FieldGroupDefinition[] {
  const fallback = fields.map((field) => ({ keys: [field.key], width: "half" as const }));

  const configuredGroups = tab.fieldGroups?.[section];
  if (!configuredGroups) return fallback;

  return configuredGroups.filter((group) => group.keys.some((key) => fields.some((field) => field.key === key)));
}


export function uniqueLines(values: readonly string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

// Server `details.reason`-→ i18n-Schlüssel für die gängigen Admin-Operationen.
const STORAGE_ERROR_REASON_KEYS: Record<string, string> = {
  "User not authenticated": "User not authenticated.",
  "User is not an admin": "User is not an admin.",
  "Only the user who created the bag (or the site admin 'admin') may edit it.": "Only the user who created the bag may edit it.",
  "You must be an admin to manage user accounts.": "You must be an admin to manage user accounts.",
  "Only the user who created the wiki (or the site admin 'admin') may delete it.": "Only the user who created the wiki may delete it.",
  "Only the user who created this role (or the site admin 'admin') may delete it.": "Only the user who created this role may delete it.",
  "Only the user who created this bag (or the site admin 'admin') may delete it.": "Only the user who created this bag may delete it.",
  "This bag is used by a wiki recipe and cannot be deleted on its own.": "This bag is used by a wiki recipe and cannot be deleted.",
  "The site admin account 'admin' cannot be deleted.": "The site admin account cannot be deleted.",
  "Only the user who created this account (or the site admin 'admin') may delete it.": "Only the user who created this account may delete it.",
  "You must be an admin to edit other users": "You must be an admin to edit other users.",
  "You must be an admin to edit roles": "You must be an admin to edit roles.",
  "Your administrator has not allowed you to create your own wikis.": "Your administrator has not allowed you to create your own wikis.",
};

// Variablen Gründe (mit dynamischen Rollen-/Tab-Namen) per Präfix:
const STORAGE_ERROR_REASON_PREFIX_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["You are not allowed to assign the", "You are not allowed to assign this role."],
  ["The system role '", "System roles cannot be deleted."],
  ["Only the user who created this ", "Only the user who created this entry may edit it."],
  ["You don't have permission to create ", "You do not have permission to create this entry."],
  ["You don't have permission to modify ", "You do not have permission to modify this entry."],
  ["You have reached your limit of", "You have reached your own wiki limit."],
];

// Fallback je `reason`-Code, wenn keine Detail-Nachricht bekannt ist:
const GENERIC_ERROR_REASON_KEYS: Record<string, string> = {
  "ACCESS_DENIED": "Access denied.",
  "RECORD_KEY_NOT_FOUND": "The record was not found.",
  "RECORD_NOT_FOUND": "The record was not found.",
  "RECIPE_NO_READ_PERMISSION": "You do not have permission to open this wiki.",
  "BAG_NO_READ_PERMISSION": "You do not have permission to open this wiki.",
  "RECIPE_NOT_FOUND": "The wiki was not found.",
};

function formatStorageErrorForDisplay(storageError: string, translate: TranslateFn): string {
  if (!storageError) return storageError;

  try {
    const parsed = JSON.parse(storageError) as {
      reason?: unknown;
      details?: { reason?: unknown; prettyErrors?: unknown };
    };
    const detailReason = typeof parsed.details?.reason === "string" ? parsed.details.reason : "";
    const reasonCode = typeof parsed.reason === "string" ? parsed.reason : "";
    const prettyText = typeof parsed.details?.prettyErrors === "string"
      ? parsed.details.prettyErrors
      : "";

    if (detailReason) {
      const exact = STORAGE_ERROR_REASON_KEYS[detailReason];
      if (exact) return translate(exact);
      const prefixed = STORAGE_ERROR_REASON_PREFIX_KEYS.find(([prefix]) => detailReason.startsWith(prefix));
      if (prefixed) return translate(prefixed[1]);
    }
    if (prettyText.trim()) return prettyText;
    if (reasonCode) {
      const generic = GENERIC_ERROR_REASON_KEYS[reasonCode];
      if (generic) return translate(generic);
      return detailReason || `${translate("The request could not be completed.")} (${reasonCode})`;
    }
  } catch {
    // Keep the original storage error text when it's not valid JSON.
  }

  return storageError;
}

function renderErrorBanner(message: string, dismissAction?: { label: string; onclick: () => void } | null) {
  if (!message) return null;
  return (
    <div class="error-banner" role="alert" aria-live="polite">
      <span class="error-banner-icon" aria-hidden="true"><MaterialSymbol icon={warningIcon} /></span>
      <p class="error-banner-message">{message}</p>
      {dismissAction ? (
        <button class="ghost-button error-banner-dismiss" type="button" onclick={dismissAction.onclick}>{dismissAction.label}</button>
      ) : null}
    </div>
  );
}

// #region - AppStore

class PerTabStoreImpl implements PerTabStore {
  private readonly state: PerTabStoreState = {
    modalState: null,
    isOpeningItem: false,
    isSaving: false,
  };

  constructor(
    private readonly storage: AdminStorage,
    private readonly deps: PerTabStoreDependencies,
  ) { }

  public get fieldState(): PerTabFieldState | null {
    return this.state.modalState as PerTabFieldState | null;
  }

  public get selectedTab(): TabDefinition | null {
    return this.fieldState ? getTab(this.fieldState.tabId) : null;
  }

  public get itemsByTab(): AdminRecordStore {
    return this.deps.getItemsByTab();
  }

  public get displayedStorageError(): string {
    return formatStorageErrorForDisplay(this.fieldState?.storageError ?? "", t);
  }

  public get isModalLoading(): boolean {
    return Boolean(this.fieldState?.loading);
  }

  public get isSaving(): boolean {
    return this.state.isSaving;
  }

  public get isOpeningItem(): boolean {
    return this.state.isOpeningItem;
  }

  public get isOpen(): boolean {
    return Boolean(this.fieldState);
  }

  public get isBusy(): boolean {
    return this.isOpeningItem || this.isSaving;
  }

  public readonly clearStorageError = () => {
    const modalState = this.state.modalState;
    if (!modalState?.storageError) return;
    this.patchState({
      modalState: {
        ...modalState,
        storageError: "",
      },
    });
  };

  public readonly closeModal = () => {
    if (!this.state.modalState) return;
    this.patchState({ modalState: null });
  };

  public readonly reloadItems = async () => {
    await this.deps.reloadItems();
  };

  public readonly openCreate = (tabId: TabId) => {
    const draft = this.createDraftFor(tabId);
    this.deps.setActiveTab(tabId);
    this.patchState({
      modalState: this.createModalState(tabId, "create", draft, draft, false, ""),
    });
  };

  public readonly openItem = async (tabId: TabId, recordId: IdString) => {
    const emptyDraft = this.createDraftFor(tabId);
    this.deps.setActiveTab(tabId);
    this.patchState({
      modalState: this.createModalState(tabId, "edit", emptyDraft, emptyDraft, true, ""),
      isOpeningItem: true,
    });

    let item: AdminRecordStore[typeof tabId][number] | null = null;
    let storageError = "";
    try {
      item = await this.storage.read(tabId, recordId);
    } catch (error) {
      console.error(error);
      storageError = getErrorMessage(error, t("Failed to load record details."));
    } finally {
      this.patchState({ isOpeningItem: false });
    }

    if (!item) {
      this.patchState({
        modalState: this.createModalState(
          tabId,
          "edit",
          emptyDraft,
          emptyDraft,
          false,
          storageError || t("Record not found."),
        ),
      });
      return;
    }

    const draft = this.createDraftFor(tabId, item);
    this.patchState({
      modalState: this.createModalState(tabId, "edit", draft, draft, false, ""),
    });
  };

  public readonly updateDraft: DraftChangeHandler = (fieldKey, value) => {
    const modalState = this.state.modalState;
    if (!modalState) return;

    if (fieldKey === KeyFields[modalState.tabId] && typeof value === "string") {
      value = value;
    }

    const nextDraft = { ...modalState.draft } as typeof modalState.draft;
    (nextDraft as unknown as Record<string, unknown>)[fieldKey] = value;

    this.patchState({
      modalState: {
        ...modalState,
        draft: nextDraft,
      } as ModalState,
    });
  };

  public readonly updatePendingRows: PendingRowsChangeHandler = (fieldKey, updater) => {
    const modalState = this.state.modalState;
    if (!modalState) return;

    const nextCount = Math.max(0, updater(modalState.pendingRows[fieldKey] ?? 0));
    this.patchState({
      modalState: {
        ...modalState,
        pendingRows: {
          ...modalState.pendingRows,
          [fieldKey]: nextCount,
        },
      },
    });
  };

  public readonly updateTransientPermissionRows: PermissionRowsChangeHandler = (fieldKey, rows) => {
    const modalState = this.state.modalState;
    if (!modalState) return;

    this.patchState({
      modalState: {
        ...modalState,
        transientPermissionRows: {
          ...modalState.transientPermissionRows,
          [fieldKey]: rows,
        },
      },
    });
  };

  public readonly updateResolverTitle: ResolverTitleChangeHandler = (value) => {
    const modalState = this.state.modalState;
    if (!modalState) return;
    this.patchState({
      modalState: { ...modalState, resolverTitle: value },
    });
  };

  public readonly triggerOperation: OperationTriggerHandler = (fieldKey, message) => {
    const modalState = this.state.modalState;
    if (!modalState) return;
    this.patchState({
      modalState: {
        ...modalState,
        operationMessages: {
          ...modalState.operationMessages,
          [fieldKey]: message,
        },
      },
    });
  };

  public readonly saveDraft = async () => {
    const snapshot = this.state.modalState;
    if (!snapshot) return;

    this.patchState({
      modalState: {
        ...snapshot,
        storageError: "",
      },
      isSaving: true,
    });

    let savedTabItems: AdminRecordStore[typeof snapshot.tabId] | null = null;
    let storageError = "";
    try {
      savedTabItems = await this.storage.save(
        snapshot.tabId,
        snapshot.draft,
      );
    } catch (error) {
      console.error(error);
      storageError = getErrorMessage(error, t("Failed to save record."));
    } finally {
      this.patchState({ isSaving: false });
    }

    if (!savedTabItems) {
      const currentModalState = this.state.modalState;
      if (!currentModalState) return;
      this.patchState({
        modalState: {
          ...currentModalState,
          storageError,
        },
      });
      return;
    }

    this.deps.replaceItemsByTab({
      ...this.itemsByTab,
      [snapshot.tabId]: savedTabItems,
    } as AdminRecordStore);
    this.patchState({ modalState: null });
  };

  private createDraftFor<T extends TabId>(tabId: T, source?: AdminRecordStore[T][number]): AdminRecordStore[T][number] {
    return createDraft(getTab(tabId), source) as AdminRecordStore[T][number];
  }

  private createModalState<T extends TabId>(
    tabId: T,
    mode: ModalMode,
    draft: AdminRecordStore[T][number],
    saved: AdminRecordStore[T][number],
    loading: boolean,
    storageError: string,
  ): ModalStateForTab<T> {
    return {
      tabId,
      mode,
      draft,
      saved,
      resolverTitle: "Docs/Welcome",
      operationMessages: {},
      pendingRows: {},
      transientPermissionRows: {},
      storageError,
      loading,
    } as ModalStateForTab<T>;
  }

  private patchState(patch: Partial<PerTabStoreState>): void {
    Object.assign(this.state, patch);
    this.deps.requestUpdate();
  }
}

// Storage overview is a diagnostic tab rather than a CRUD tab: it has no
// list of records, columns or editable fields, so it is rendered as a custom
// panel instead of the generic grid. This synthetic definition drives the
// section header and keeps "currentTab" access uniform.
const storageTabDefinition: TabDefinition = {
  id: "storage",
  label: "Storage",
  createLabel: "",
  eyebrow: "Storage overview",
  description: "Disk usage and storage overview of the app.",
  columns: [],
  sidebarDisplay: [],
  fields: [],
} as unknown as TabDefinition;

// The pinboard is likewise a non-CRUD panel: a wall of notes for everyone,
// regardless of role. The synthetic definition only drives the section header.
const pinboardTabDefinition: TabDefinition = {
  id: "pinboard",
  label: "Pinboard",
  createLabel: "",
  eyebrow: "Pinboard overview",
  description: "A wall of notes for everyone.",
  columns: [],
  sidebarDisplay: [],
  fields: [],
} as unknown as TabDefinition;

// "My files" is a non-CRUD panel too: per-account file uploads. The synthetic
// definition only drives the section header.
const userFilesTabDefinition: TabDefinition = {
  id: "files",
  label: "My files",
  createLabel: "",
  eyebrow: "My files",
  description: "Files stored in your account.",
  columns: [],
  sidebarDisplay: [],
  fields: [],
} as unknown as TabDefinition;

class AppStore {
  public readonly state: AppStoreState = {
    activeTab: "wikis",
    itemsByTab: getEmptyItems(),
    isLoadingData: true,
  };

  public readonly perTabStore: PerTabStore;

  private hasLoaded = false;
  private loadPromise: Promise<void> | null = null;

  constructor(
    private readonly host: UpdateHost,
    private readonly storage: AdminStorage,
  ) {
    this.perTabStore = new PerTabStoreImpl(storage, {
      getItemsByTab: () => this.state.itemsByTab,
      replaceItemsByTab: (itemsByTab) => this.patchState({ itemsByTab }),
      setActiveTab: (tabId) => this.setActiveTab(tabId),
      reloadItems: () => this.reload(),
      requestUpdate: () => this.host.requestUpdate(),
    });
  }

  public get currentTab(): TabDefinition {
    return this.state.activeTab === "storage"
      ? storageTabDefinition
      : this.state.activeTab === "pinboard"
        ? pinboardTabDefinition
        : this.state.activeTab === "files"
          ? userFilesTabDefinition
          : getTab(this.state.activeTab);
  }

  public get activeTabItems(): AdminRecordStore[TabId] {
    if (this.state.activeTab === "storage" || this.state.activeTab === "pinboard" || this.state.activeTab === "files") return [];
    return this.state.itemsByTab[this.state.activeTab];
  }

  public get isListInteractionDisabled(): boolean {
    return this.perTabStore.isBusy;
  }

  public ensureLoaded(): Promise<void> {
    if (this.hasLoaded) return Promise.resolve();
    if (!this.loadPromise) {
      this.loadPromise = this.loadAllInternal().finally(() => {
        this.loadPromise = null;
      });
    }
    return this.loadPromise;
  }

  public reload(): Promise<void> {
    this.hasLoaded = false;
    return this.ensureLoaded();
  }

  public readonly setActiveTab = (tabId: TabId | "storage" | "pinboard" | "files") => {
    if (tabId === this.state.activeTab) return;
    this.patchState({ activeTab: tabId });
  };

  public readonly openCreate = (tabId: TabId) => {
    this.perTabStore.openCreate(tabId);
  };

  public readonly openItem = async (tabId: TabId, recordId: IdString) => {
    await this.perTabStore.openItem(tabId, recordId);
  };

  private async loadAllInternal(): Promise<void> {
    this.patchState({
      isLoadingData: true,
    });

    try {
      const loadedItems = await this.storage.loadAll();
      this.hasLoaded = true;
      this.patchState({
        itemsByTab: loadedItems,
        isLoadingData: false,
      });
    } catch (error) {
      this.patchState({
        isLoadingData: false,
      });
      throw error;
    }
  }

  private patchState(patch: Partial<AppStoreState>): void {
    Object.assign(this.state, patch);
    this.host.requestUpdate();
  }
}



// #region - field block

@customElement("mws-field-block")
class FieldBlockElement<T> extends JSXElement {
  useLightDOM: boolean = true;

  @state() accessor props!: FieldBlockProps;

  protected render() {
    const { field, useCardTitle, value, saved: savedValue, store } = this.props;
    const fieldState = store.fieldState;
    if (!fieldState) return null;

    const modalMode = fieldState.mode;
    const editable = isEditable(field, modalMode);
    const disabled = Boolean(this.props.disabled) || !editable;
    // const useToggleEditor = editable && field.key === "requiredPluginsEnabled";
    const isToggle = field.type === "switch";
    const children = <>
      {renderFieldEditor({
        inputId: `field-${field.key}`,
        field,
        value,
        disabled,
        fieldState,
        itemsByTab: store.itemsByTab,
        onDraftChange: store.updateDraft,
        onPendingRowsChange: store.updatePendingRows,
        onTransientPermissionRowsChange: store.updateTransientPermissionRows,
        onResolverTitleChange: store.updateResolverTitle,
        onTriggerOperation: store.triggerOperation,
      })}
    </>;
    return (
      <div class="field-block">
        <div class="field-editor">
          {!useCardTitle ? <label class="field-label" for={`field-${field.key}`}>{t(getFieldLabel(field, modalMode))}</label> : null}
          {field.description ? <p class="field-helper">{t(field.description)}</p> : null}
          {isToggle ? <div class="toggle-field-row">{children}</div> : children}
        </div>
      </div>
    );
  }
}

export function getAdminRecordValue(field: FieldDefinition | ColumnDefinition, draft: AdminRecord) {
  if (!(field.key in draft)) throw new Error("The field " + field.key + " is not defined in the draft record");
  return (draft as any)[field.key];
}
export function setAdminRecordValue(field: FieldDefinition | ColumnDefinition, draft: AdminRecord, value: unknown, init: boolean) {
  if (!init && !(field.key in draft)) throw new Error("The field " + field.key + " is not defined in the draft record");
  (draft as any)[field.key] = value;
}

function sidebarField(field: FieldDefinition, draft: AdminRecord, saved: AdminRecord, itemsByTab?: AdminRecordStore) {
  const value = getAdminRecordValue(field, saved);
  return sidebarSection({
    title: t(field.label),
    content: renderFieldSidebar({
      field,
      value: getAdminRecordValue(field, saved),
      itemsByTab
    })
  })
}
function sidebarSection({ title, content }: SidebarSectionProps) {
  return (
    <div class="sidebar-section">
      <h4 class="sidebar-section-title">{title}</h4>
      <div class="sidebar-section-body">{content}</div>
    </div>
  );
}

// #region tab modal

@customElement("mws-record-modal")
class RecordModalElement extends JSXElement {
  useLightDOM: boolean = true;

  @state() accessor props!: RecordModalProps;
  @state() accessor deleting = false;
  @state() accessor deleteError = "";

  private readonly deleteWiki = async () => {
    const { store } = this.props;
    const { selectedTab, fieldState } = store;
    if (!selectedTab || !fieldState || this.deleting) return;
    const draft = fieldState.draft as Partial<WikiAdminRecord>;
    const slug = draft.slug;
    const title = String(getPrimaryValue(selectedTab, draft as AdminRecord) || slug || "");
    if (!slug) return;
    if (!globalThis.confirm(
      t("Really delete wiki \"{title}\" ({slug}) for good?", { title, slug: slug.toString() }) + "\n"
      + t("This removes all tiddlers and bags of the wiki.") + "\n"
      + t("This action cannot be undone.")
    )) return;
    this.deleting = true;
    this.deleteError = "";
    try {
      const response = await fetch(pathPrefix + "/admin/wiki/delete", {
        method: "PUT",
        headers: { "X-Requested-With": "TiddlyWiki" },
        body: JSON.stringify({ slug: slug.toString() }),
      });
      const text = await response.text();
      if (response.status !== 200) throw new Error(text);
      await store.reloadItems();
      store.closeModal();
    } catch (error) {
      console.error(error);
      this.deleteError = formatStorageErrorForDisplay(getErrorMessage(error, t("Failed to delete wiki.")), t);
    } finally {
      this.deleting = false;
    }
  };

  private readonly deleteUser = async () => {
    const { store } = this.props;
    const { selectedTab, fieldState } = store;
    if (!selectedTab || !fieldState || this.deleting) return;
    const draft = fieldState.draft as Partial<UserAdminRecord>;
    const username = draft.username?.toString() ?? "";
    if (!username) return;
    if (!globalThis.confirm(
      t("Really delete user \"{username}\" for good?", { username }) + "\n"
      + t("Their wikis, bags, templates and roles are kept and are then managed only by the 'admin' account.") + "\n"
      + t("This action cannot be undone.")
    )) return;
    this.deleting = true;
    this.deleteError = "";
    try {
      const response = await fetch(pathPrefix + "/admin/user/delete", {
        method: "PUT",
        headers: { "X-Requested-With": "TiddlyWiki" },
        body: JSON.stringify({ username }),
      });
      const text = await response.text();
      if (response.status !== 200) throw new Error(text);
      const currentUsername = embeddedServerResponse.userState.username;
      if (username === currentUsername) {
        // Self-Delete: the server dropped our session along with the
        // account — reloading lands on the login screen instead of trying
        // to /admin/load with an invalid session.
        location.reload();
        return;
      }
      await store.reloadItems();
      store.closeModal();
    } catch (error) {
      console.error(error);
      this.deleteError = formatStorageErrorForDisplay(getErrorMessage(error, t("Failed to delete user.")), t);
    } finally {
      this.deleting = false;
    }
  };

  private readonly deleteRole = async () => {
    const { store } = this.props;
    const { selectedTab, fieldState } = store;
    if (!selectedTab || !fieldState || this.deleting) return;
    const draft = fieldState.draft as Partial<RoleAdminRecord>;
    const name = String(draft.name ?? "");
    if (!name) return;
    if (!globalThis.confirm(
      t("Really delete role \"{name}\" for good?", { name }) + "\n"
      + t("This removes the role from all user accounts and permission entries.") + "\n"
      + t("This action cannot be undone.")
    )) return;
    this.deleting = true;
    this.deleteError = "";
    try {
      const response = await fetch(pathPrefix + "/admin/role/delete", {
        method: "PUT",
        headers: { "X-Requested-With": "TiddlyWiki" },
        body: JSON.stringify({ name }),
      });
      const text = await response.text();
      if (response.status !== 200) throw new Error(text);
      await store.reloadItems();
      store.closeModal();
    } catch (error) {
      console.error(error);
      this.deleteError = formatStorageErrorForDisplay(getErrorMessage(error, t("Failed to delete role.")), t);
    } finally {
      this.deleting = false;
    }
  };

  private readonly deleteBag = async () => {
    const { store } = this.props;
    const { selectedTab, fieldState } = store;
    if (!selectedTab || !fieldState || this.deleting) return;
    const draft = fieldState.draft as Partial<BagAdminRecord>;
    const name = String(getPrimaryValue(selectedTab, draft as AdminRecord) ?? "");
    if (!name) return;
    if (!globalThis.confirm(
      t("Really delete bag \"{name}\" for good?", { name }) + "\n"
      + t("This removes all tiddlers and permissions of the bag.") + "\n"
      + t("Bags that are used by a wiki recipe cannot be deleted.") + "\n"
      + t("This action cannot be undone.")
    )) return;
    this.deleting = true;
    this.deleteError = "";
    try {
      const response = await fetch(pathPrefix + "/admin/bag/delete", {
        method: "PUT",
        headers: { "X-Requested-With": "TiddlyWiki" },
        body: JSON.stringify({ name }),
      });
      const text = await response.text();
      if (response.status !== 200) throw new Error(text);
      await store.reloadItems();
      store.closeModal();
    } catch (error) {
      console.error(error);
      this.deleteError = formatStorageErrorForDisplay(getErrorMessage(error, t("Failed to delete bag.")), t);
    } finally {
      this.deleting = false;
    }
  };

  protected render() {
    const { store } = this.props;
    const { selectedTab, fieldState } = store;
    if (!selectedTab || !fieldState) return null;

    const itemsByTab = store.itemsByTab;
    const storageError = store.displayedStorageError;
    const isModalLoading = store.isModalLoading;
    const isSaving = store.isSaving;
    const isOpeningItem = store.isOpeningItem;
    const onClose = store.closeModal;
    const onSave = store.saveDraft;
    const onDraftChange = store.updateDraft;
    const onClearStorageError = store.clearStorageError;
    const recordTitle = fieldState.mode === "create"
      ? t("New {tab}", { tab: getSingularLabel(selectedTab) })
      : getPrimaryValue(selectedTab, fieldState.draft) || t("{tab} details", { tab: getSingularLabel(selectedTab) });
    const headerCopy = storageError
      ? t("Storage returned an error for this record. Fix the issue or close the dialog and try again.")
      : t(selectedTab.description);

    const authoredFields = !isModalLoading ? getSectionFields(selectedTab, "authored") : [];
    const runtimeFields = !isModalLoading ? getSectionFields(selectedTab, "runtime") : [];
    const operationFields = !isModalLoading ? getSectionFields(selectedTab, "operations") : [];
    const sidebarFields = !isModalLoading ? getSidebarFields(selectedTab) : [];

    const currentUsername = embeddedServerResponse.userState.username;
    const ownerUsername = String((fieldState.draft as Partial<WikiAdminRecord>).ownerUsername ?? "");
    const canDeleteWiki = selectedTab.id === "wikis" && (
      currentUsername === "admin" || (ownerUsername !== "" && ownerUsername === currentUsername)
    );
    const draftUsername = selectedTab.id === "users"
      ? String((fieldState.draft as Partial<UserAdminRecord>).username ?? "")
      : "";
    const draftOwnerUsername = String((fieldState.draft as Partial<UserAdminRecord>).ownerUsername ?? "");
    const canDeleteUser = selectedTab.id === "users" && draftUsername !== "admin" && (
      embeddedServerResponse.userState.isAdmin
        ? (currentUsername === "admin" || (draftOwnerUsername !== "" && draftOwnerUsername === currentUsername) || draftUsername === currentUsername)
        : embeddedServerResponse.userState.isTeacher
          ? (draftOwnerUsername !== "" && draftOwnerUsername === currentUsername && draftUsername !== currentUsername)
          : false
    );
    const draftRoleName = selectedTab.id === "roles"
      ? String((fieldState.draft as Partial<RoleAdminRecord>).name ?? "")
      : "";
    const draftRoleOwnerUsername = selectedTab.id === "roles"
      ? String((fieldState.draft as Partial<RoleAdminRecord>).ownerUsername ?? "")
      : "";
    const roleNameIsReserved = selectedTab.id === "roles"
      && (draftRoleName === "ADMIN" || draftRoleName === "USER" || draftRoleName === "ANON");
    const canDeleteRole = selectedTab.id === "roles" && !roleNameIsReserved && draftRoleName !== "" && (
      currentUsername === "admin" || (draftRoleOwnerUsername !== "" && draftRoleOwnerUsername === currentUsername)
    );
    const draftBagName = selectedTab.id === "bags"
      ? String(getPrimaryValue(selectedTab, fieldState.draft as AdminRecord) ?? "")
      : "";
    const draftBagOwnerUsername = selectedTab.id === "bags"
      ? String((fieldState.draft as Partial<BagAdminRecord>).ownerUsername ?? "")
      : "";
    const canDeleteBag = selectedTab.id === "bags" && draftBagName !== "" && (
      currentUsername === "admin" || (draftBagOwnerUsername !== "" && draftBagOwnerUsername === currentUsername)
    );

    return (
      <div class="modal-shell" webjsx-attr-open onclick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}>
        <section class="modal-card" role="dialog" aria-modal="true" aria-label={t("{tab} details", { tab: selectedTab.label })}>
          <header class="modal-header">
            <div class="modal-title">
              <p class="eyebrow">{t(selectedTab.eyebrow)}</p>
              <h3>{isModalLoading
                ? t("Loading {tab}...", { tab: getSingularLabel(selectedTab).toLowerCase() })
                : textWithSlashes(recordTitle)}</h3>
              <p>{isModalLoading ? t("Fetching record details from async storage before rendering the form.") : headerCopy}</p>
            </div>
            <div class="close-button" onclick={onClose} aria-label={t("Close details")}>
              <MaterialSymbol icon={closeIcon} />
            </div>
          </header>

          {isModalLoading ? (
            <div class="modal-loading-shell">
              <div class="modal-loading-bar" aria-hidden="true"><span></span></div>
              <p class="modal-loading-copy">{t("Loading {tab} details...", { tab: selectedTab.label.toLowerCase() })}</p>
            </div>
          ) : (
            <div class="modal-layout">
              <aside class="field-index modal-sidebar">
                {sidebarFields.map(field => sidebarSection({
                  title: t(field.label),
                  content: renderFieldSidebar({
                    field,
                    value: getAdminRecordValue(field, fieldState.saved),
                    itemsByTab
                  })
                }))}
              </aside>

              <div class="field-stack modal-main">
                {([
                  ["authored", authoredFields],
                  ["runtime", runtimeFields],
                  ["operations", operationFields],
                ] as [FieldSection, FieldDefinition[]][]).map(([section, fields]) => {
                  if (!fields.length) return null;
                  const heading = getSectionHeading(section, fieldState.mode);
                  return (
                    <section class="modal-section">
                      {heading ? (
                        <header class="modal-section-header">
                          <div>
                            <h4>{t(heading.title)}</h4>
                          </div>
                          <p>{heading.copy ? t(heading.copy) : null}</p>
                        </header>
                      ) : null}

                      <div class="section-field-grid">
                        {getFieldGroups(selectedTab, section, fields).map((group) => {
                          const groupFields = group.keys
                            .map((key) => fields.find((field) => field.key === key))
                            .filter((field): field is FieldDefinition => Boolean(field));
                          const headerField = group.headerFieldKey
                            ? fields.find((field) => field.key === group.headerFieldKey)
                            : undefined;
                          const groupDisabled = Boolean(group.disabledWhenHeaderOff && headerField && getAdminRecordValue(headerField, fieldState.draft) !== true);
                          const headerDescription = group.description ?? (!group.footerDescriptionFromHeader ? headerField?.description : undefined) ?? "";
                          const footerDescription = group.footerDescriptionFromHeader ? headerField?.description : undefined;
                          if (!groupFields.length) return null;

                          return (
                            <article class={group.width === "full" ? "field-card is-full" : "field-card"}>
                              <header class="field-card-header">
                                <div class="field-card-header-row">
                                  <h4>{getGroupTitleLabel(group, groupFields)}</h4>
                                  {headerField ? renderSwitchField({
                                    field: headerField,
                                    value: getAdminRecordValue(headerField, fieldState.draft) ?? "",
                                    onDraftChange,
                                  }, true) : null}
                                </div>
                                {headerDescription ? <p>{t(headerDescription)}</p> : null}
                              </header>

                              <div class={groupFields.length > 1 ? (group.layout === "stack" ? "composite-fields is-stack" : "composite-fields") : "single-field"}>
                                {groupFields.map((field) => (
                                  <FieldBlockElement
                                    field={field}
                                    value={getAdminRecordValue(field, fieldState.draft)}
                                    saved={getAdminRecordValue(field, fieldState.saved)}
                                    disabled={groupDisabled}
                                    useCardTitle={groupFields.length === 1}
                                    store={store}
                                  />
                                ))}
                              </div>
                              {footerDescription ? <div class="field-card-footer-note"><p>{t(footerDescription)}</p></div> : null}
                            </article>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}

                {true
                  ? <footer class="modal-actions">
                    <div style="display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
                      {selectedTab.id === "wikis" && fieldState.mode === "edit" && canDeleteWiki ? (
                        <button
                          class="ghost-button"
                          type="button"
                          style={{ color: "var(--color-danger)", border: "1px solid var(--color-border-danger)", background: "transparent" }}
                          onclick={this.deleteWiki}
                          disabled={isSaving || this.deleting}
                        >{this.deleting ? t("Deleting…") : t("Delete wiki")}</button>
                      ) : null}
                      {selectedTab.id === "users" && fieldState.mode === "edit" && canDeleteUser ? (
                        <button
                          class="ghost-button"
                          type="button"
                          style={{ color: "var(--color-danger)", border: "1px solid var(--color-border-danger)", background: "transparent" }}
                          onclick={this.deleteUser}
                          disabled={isSaving || this.deleting}
                        >{this.deleting ? t("Deleting…") : t("Delete user")}</button>
                      ) : null}
                      {selectedTab.id === "roles" && fieldState.mode === "edit" && canDeleteRole ? (
                        <button
                          class="ghost-button"
                          type="button"
                          style={{ color: "var(--color-danger)", border: "1px solid var(--color-border-danger)", background: "transparent" }}
                          onclick={this.deleteRole}
                          disabled={isSaving || this.deleting}
                        >{this.deleting ? t("Deleting…") : t("Delete role")}</button>
                      ) : null}
                      {selectedTab.id === "bags" && fieldState.mode === "edit" && canDeleteBag ? (
                        <button
                          class="ghost-button"
                          type="button"
                          style={{ color: "var(--color-danger)", border: "1px solid var(--color-border-danger)", background: "transparent" }}
                          onclick={this.deleteBag}
                          disabled={isSaving || this.deleting}
                        >{this.deleting ? t("Deleting…") : t("Delete bag")}</button>
                      ) : null}
                      {this.deleteError ? renderErrorBanner(this.deleteError) : null}
                    </div>
                    <div style="display:flex; gap:0.75rem; align-items:center;">
                      <button class="ghost-button" type="button" onclick={onClose} disabled={isSaving || this.deleting}>{t("Cancel")}</button>
                      <button class="primary-button" type="button" onclick={onSave} disabled={isSaving || isOpeningItem || this.deleting}>{isSaving ? t("Saving...") : fieldState.mode === "create" ? t("Save {tab}", { tab: getSingularLabel(selectedTab) }) : t("Save changes")}</button>
                    </div>
                  </footer>
                  : <footer class="modal-actions">
                    <button class="ghost-button" type="button" onclick={onClose} disabled={isSaving}>{t("Close")}</button>
                  </footer>}
              </div>
            </div>
          )}

          {storageError ? renderErrorBanner(storageError, { label: t("Dismiss error message"), onclick: onClearStorageError }) : null}
        </section>
      </div>
    );
  }
}

// #region tab main
function throttle(window: number) {
  let active = false;
  return () => {
    if (!active) {
      active = true;
      setTimeout(() => {
        active = false;
      }, window);
      return false;
    } else {
      return active;
    }
  }
}

export type BackupInfo = {
  name: string;
  createdAt: string;
  sizeBytes: number;
  files: { name: string; sizeBytes: number }[];
};

export type StorageCategory = {
  path: string;
  category: string;
  files: number;
  directories: number;
  totalSizeBytes: number;
  lastModified: string;
};

export type StorageBlobsInfo = {
  blobCount: number;
  blobBytes: number;
  contentBytes: number;
  tiddlerCount: number;
  storeFiles: {
    files: number;
    directories: number;
    totalSizeBytes: number;
    lastModified: string;
  };
  inbox: {
    files: number;
    totalSizeBytes: number;
  };
  orphanedStoreFiles: number;
};

export type StorageUserUsage = {
  username: string;
  wikiCount: number;
  wikiContentBytes: number;
  fileStoreBytes: number;
  totalBytes: number;
};

export type StorageInfo = {
  disk: {
    totalBytes: number;
    usedBytes: number;
    availableBytes: number;
  };
  lastScan: string;
  recordCounts: {
    tiddlers: number;
    bags: number;
    recipes: number;
    users: number;
    templates: number;
  };
  categories: StorageCategory[];
  blobs: StorageBlobsInfo;
  topUsers: StorageUserUsage[];
};

export type StorageCleanupCategory = {
  count: number;
  bytes: number;
  samples: string[];
};

export type StorageCleanupPreview = {
  generatedAt: string;
  dryRun: boolean;
  staleAfterMs: number;
  categories: {
    inbox: StorageCleanupCategory;
    orphaned: StorageCleanupCategory;
    unreferenced: StorageCleanupCategory;
  };
  total: {
    count: number;
    bytes: number;
  };
};

@addstyles(css)
@customElement("mws-app")
export class App extends JSXElement {
  // don't use shadow dom. allows inheriting main.css styles.
  useLightDOM: boolean = true;

  @state() accessor mainStorageError = "";

  @state() accessor newWikiOpen = false;
  @state() accessor newWikiName = "";
  @state() accessor newWikiBusy = false;
  @state() accessor newWikiError = "";
  @state() accessor newWikiSlug: string | null = null;
  @state() accessor themeMode: ThemeMode = getEffectiveTheme();
  @state() accessor thumbnailSrc = "";

  @state() accessor backupBusy = false;
  @state() accessor backupError = "";
  @state() accessor backupMessage = "";
  @state() accessor backupDeleting = "";
  @state() accessor backups: BackupInfo[] = [];

  @state() accessor storageInfo: StorageInfo | null = null;
  @state() accessor storageLoading = false;
  @state() accessor storageError = "";
  @state() accessor cleanupPreview: StorageCleanupPreview | null = null;
  @state() accessor cleanupLoading = false;
  @state() accessor cleanupError = "";
  @state() accessor cleanupBusy = false;

  @state() accessor pinboardUnread = 0;
  @state() accessor pinboardCount = 0;
  private pinboardTimer: number | null = null;
  @state() accessor userFileCount = 0;

  private readonly store = new AppStore(this, adminStorage);
  private readonly handlePageShow = () => {
    void this.loadAdminRecords(true);
    void this.loadPinboardUnread();
    void this.loadUserFileCount();
  };
  private readonly handlePinboardCounts = (counts: { noteCount: number; unreadCount: number }) => {
    this.pinboardCount = counts.noteCount;
    this.pinboardUnread = counts.unreadCount;
  };
  private readonly handleUserFileCount = (count: number) => {
    this.userFileCount = count;
  };
  private readonly loadUserFileCount = async () => {
    if (!embeddedServerResponse.userState.isLoggedIn) return;
    try {
      const [ownResponse, sharedResponse] = await Promise.all([
        fetch(pathPrefix + "/api/user-files/list", {
          headers: { "X-Requested-With": "TiddlyWiki" },
        }),
        fetch(pathPrefix + "/api/user-files/shared", {
          headers: { "X-Requested-With": "TiddlyWiki" },
        }),
      ]);
      const ownText = await ownResponse.text();
      const sharedText = await sharedResponse.text();
      if (ownResponse.status !== 200 || sharedResponse.status !== 200) return;
      const own = JSON.parse(ownText) as { files?: unknown[] } | null;
      const shared = JSON.parse(sharedText) as { files?: unknown[] } | null;
      if (own?.files != null) this.userFileCount = own.files.length + (shared?.files?.length ?? 0);
    } catch {
      // Keep the previous badge if the request fails (e.g. a racing logout).
    }
  };
  private readonly loadPinboardUnread = async () => {
    if (!embeddedServerResponse.userState.isLoggedIn) return;
    try {
      const response = await fetch(pathPrefix + "/api/pinboard/unread-count", {
        headers: { "X-Requested-With": "TiddlyWiki" },
      });
      const text = await response.text();
      if (response.status !== 200) throw new Error(text);
      const parsed = JSON.parse(text) as { noteCount?: number; unreadCount?: number } | null;
      if (parsed == null) return;
      this.pinboardCount = parsed.noteCount ?? this.pinboardCount;
      this.pinboardUnread = parsed.unreadCount ?? this.pinboardUnread;
    } catch {
      // Keep the previous badge if the request fails (e.g. a racing logout).
    }
  };
  private readonly handleLocaleChange = (event: Event) => {
    const code = (event.target as HTMLSelectElement).value as LocaleCode;
    if (code === getCurrentLocale()) return;
    setCurrentLocale(code);
    location.reload();
  };
  private readonly handleThemeToggle = () => {
    toggleTheme();
    this.themeMode = getEffectiveTheme();
  };
  private readonly handleAccountMenuClick = (event: MouseEvent) => {
    const accountMenu = this.querySelector(".hero-account-menu");
    if (!(accountMenu instanceof HTMLDetailsElement) || !accountMenu.open) return;

    const target = event.target;
    if (target instanceof Node && accountMenu.contains(target)) return;
    accountMenu.open = false;
  };

  constructor() {
    super()
  }

  private readonly clearMainStorageError = () => {
    if (!this.mainStorageError) return;
    this.mainStorageError = "";
  };
  loadThrottle = throttle(3000);
  private readonly loadAdminRecords = async (reload = false) => {
    if (this.loadThrottle()) return;
    this.clearMainStorageError();

    try {
      if (reload) {
        await this.store.reload();
        return;
      }

      await this.store.ensureLoaded();
    } catch (error) {
      console.error(error);
      this.mainStorageError = formatStorageErrorForDisplay(
        getErrorMessage(error, t("Failed to load admin records.")), t,
      );
    }
  };

  private readonly openCreate = (tabId: TabId) => {
    this.store.openCreate(tabId);
  };

  private readonly closeCreateWikiMenu = () => {
    const menu = this.querySelector(".create-wiki-menu");
    if (menu instanceof HTMLDetailsElement) menu.open = false;
  };

  private readonly startNewWiki = () => {
    const username = embeddedServerResponse.userState.username;
    this.newWikiName = username ? t("{username}'s Wiki", { username }) : t("My Wiki");
    this.newWikiError = "";
    this.newWikiSlug = null;
    this.newWikiOpen = true;
  };

  private readonly closeNewWiki = () => {
    if (this.newWikiBusy) return;
    this.newWikiOpen = false;
  };

  private readonly submitNewWiki = async () => {
    const displayName = this.newWikiName.trim();
    if (!displayName || this.newWikiBusy) return;
    this.newWikiBusy = true;
    this.newWikiError = "";
    this.newWikiSlug = null;
    try {
      const response = await fetch(pathPrefix + "/admin/wiki", {
        method: "PUT",
        headers: { "X-Requested-With": "TiddlyWiki" },
        body: JSON.stringify({ displayName }),
      });
      const text = await response.text();
      if (response.status !== 200) throw new Error(text);
      const result = JSON.parse(text, jsonReviver);
      await this.store.reload();
      this.newWikiSlug = result.slug ?? null;
      this.newWikiName = "";
    } catch (error) {
      console.error(error);
      this.newWikiError = getErrorMessage(error, t("Failed to create wiki."));
    } finally {
      this.newWikiBusy = false;
    }
  };

  private prettifyBytes(bytes: number) {
    if (!bytes || bytes < 1024) return `${bytes || 0} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
      value /= 1024;
      unit++;
    }
    return `${value.toFixed(1)} ${units[unit]}`;
  }

  private readonly loadBackups = async () => {
    if (!embeddedServerResponse.userState.isAdmin) return;
    try {
      const response = await fetch(pathPrefix + "/admin/backup/list", {
        headers: { "X-Requested-With": "TiddlyWiki" },
      });
      const text = await response.text();
      if (response.status !== 200) throw new Error(text);
      this.backups = JSON.parse(text, jsonReviver).backups ?? [];
    } catch (error) {
      console.error(error);
      this.backupError = getErrorMessage(error, t("Failed to load backups."));
    }
  };

  private readonly loadStorage = async () => {
    if (!embeddedServerResponse.userState.isAdmin) return;
    if (this.storageLoading) return;
    this.storageLoading = true;
    this.storageError = "";
    try {
      const response = await fetch(pathPrefix + "/admin/storage", {
        headers: { "X-Requested-With": "TiddlyWiki" },
      });
      const text = await response.text();
      if (response.status !== 200) throw new Error(text);
      this.storageInfo = JSON.parse(text);
    } catch (error) {
      console.error(error);
      this.storageError = getErrorMessage(error, t("Failed to load storage overview."));
    } finally {
      this.storageLoading = false;
    }
  };

  private readonly previewCleanup = async () => {
    if (this.cleanupLoading) return;
    this.cleanupLoading = true;
    this.cleanupError = "";
    this.cleanupPreview = null;
    try {
      const response = await fetch(pathPrefix + "/admin/storage/cleanup", {
        headers: { "X-Requested-With": "TiddlyWiki" },
      });
      const text = await response.text();
      if (response.status !== 200) throw new Error(text);
      this.cleanupPreview = JSON.parse(text);
    } catch (error) {
      console.error(error);
      this.cleanupError = getErrorMessage(error, t("Failed to scan storage."));
    } finally {
      this.cleanupLoading = false;
    }
  };

  private readonly executeCleanup = async () => {
    if (this.cleanupBusy) return;
    this.cleanupBusy = true;
    this.cleanupError = "";
    try {
      const response = await fetch(pathPrefix + "/admin/storage/cleanup", {
        method: "POST",
        headers: { "X-Requested-With": "TiddlyWiki" },
      });
      const text = await response.text();
      if (response.status !== 200) throw new Error(text);
      this.cleanupPreview = JSON.parse(text);
      await this.loadStorage();
    } catch (error) {
      console.error(error);
      this.cleanupError = getErrorMessage(error, t("Failed to clean storage."));
    } finally {
      this.cleanupBusy = false;
    }
  };

  private readonly createBackup = async () => {
    if (this.backupBusy) return;
    this.backupBusy = true;
    this.backupError = "";
    this.backupMessage = "";
    try {
      const response = await fetch(pathPrefix + "/admin/backup", {
        method: "PUT",
        headers: { "X-Requested-With": "TiddlyWiki" },
      });
      const text = await response.text();
      if (response.status !== 200) throw new Error(text);
      const result = JSON.parse(text, jsonReviver);
      this.backups = result.backups ?? [];
      this.backupMessage = t("Backup created: {name}", { name: result.backup?.name ?? "" });
    } catch (error) {
      console.error(error);
      this.backupError = getErrorMessage(error, t("Failed to create backup."));
    } finally {
      this.backupBusy = false;
    }
  };

  private readonly deleteBackup = async (name: string) => {
    if (!globalThis.confirm(
      t("Really delete backup \"{name}\"?", { name }) + "\n"
      + t("This action cannot be undone.")
    )) return;
    this.backupDeleting = name;
    this.backupError = "";
    this.backupMessage = "";
    try {
      const response = await fetch(pathPrefix + "/admin/backup/delete", {
        method: "PUT",
        headers: { "X-Requested-With": "TiddlyWiki" },
        body: JSON.stringify({ name }),
      });
      const text = await response.text();
      if (response.status !== 200) throw new Error(text);
      const result = JSON.parse(text, jsonReviver);
      this.backups = result.backups ?? [];
    } catch (error) {
      console.error(error);
      this.backupError = getErrorMessage(error, t("Failed to delete backup."));
    } finally {
      this.backupDeleting = "";
    }
  };

  connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("click", this.handleAccountMenuClick, true);
    window.addEventListener("pageshow", this.handlePageShow);
    void this.loadAdminRecords();
    void this.loadBackups();
    void this.loadStorage();
    void this.loadPinboardUnread();
    this.pinboardTimer = window.setInterval(() => void this.loadPinboardUnread(), 30000);
  }

  disconnectedCallback(): void {
    document.removeEventListener("click", this.handleAccountMenuClick, true);
    window.removeEventListener("pageshow", this.handlePageShow);
    if (this.pinboardTimer !== null) {
      window.clearInterval(this.pinboardTimer);
      this.pinboardTimer = null;
    }
    super.disconnectedCallback();
  }

  protected render() {
    const store = this.store;
    const { activeTab, itemsByTab, isLoadingData } = store.state;
    const perTabStore = store.perTabStore;
    const currentTab = store.currentTab;
    const activeTabItems = store.activeTabItems;
    const isListInteractionDisabled = store.isListInteractionDisabled;
    const mainStorageError = this.mainStorageError;
    const isStorageTab = activeTab === "storage";

    const userState = embeddedServerResponse.userState;
    const isAdmin = userState.isAdmin;
    const isTeacher = userState.isTeacher;
    const isStudent = userState.isLoggedIn && !isAdmin && !isTeacher;
    const ownWikiCount = itemsByTab.wikis.filter((wiki) => wiki.ownerUsername === userState.username).length;
    // Admins and teachers create freely; students are limited by the
    // teacher-configured wiki limit (NULL = unlimited, 0 = none).
    const canCreateOwnWiki = isAdmin || isTeacher
      || userState.wikiLimit == null
      || ownWikiCount < userState.wikiLimit;
    const ownWikiRemaining = userState.wikiLimit == null
      ? null
      : Math.max(0, userState.wikiLimit - ownWikiCount);
    // Teachers (like admins) are exempt from the limit server-side, so their
    // stored value must never be shown as if it applied.
    const bannerWikiLimit = isTeacher ? null : userState.wikiLimit;

    return (
      <div class="admin-shell">
        <header class="hero-panel">
          <div class="hero-panel-content">
            <p class="eyebrow">{t("Multi-wiki server administration")}</p>
            <h1 style="display:flex; gap: 1rem; align-items:center;">
              <span>MWS<sup class="hero-wordmark-suffix">-wikiwise</sup></span>
            </h1>
            <p class="hero-copy">{t("All your thoughts, in as many places as you need them.")}</p>
          </div>
          <div class="hero-account-shell">
            <button
              class="hero-theme-toggle"
              type="button"
              aria-label={this.themeMode === "dark" ? t("Switch to light mode") : t("Switch to dark mode")}
              title={this.themeMode === "dark" ? t("Switch to light mode") : t("Switch to dark mode")}
              onclick={this.handleThemeToggle}
            >
              <MaterialSymbol icon={this.themeMode === "dark" ? lightModeIcon : darkModeIcon} />
            </button>
            <select
              class="hero-locale-select"
              aria-label={t("Language")}
              ref={(element) => {
                const current = getCurrentLocale();
                if (element.value !== current) element.value = current;
              }}
              onchange={this.handleLocaleChange}
            >
              {supportedLocales.map((code) => (
                <option value={code}>{code === "de" ? "🇩🇪 Deutsch" : "🇺🇸 English"}</option>
              ))}
            </select>
            <details class="hero-account-menu">
              <summary class="hero-account-trigger">
                <span class="hero-account-name">
                  {embeddedServerResponse.tw5Versions.slice(-1)[0]}
                </span>
                <span class="hero-account-icon" aria-hidden="true">
                  <MaterialSymbol icon={tw5logo} class="hero-account-icon" />
                </span>
              </summary>
              <div class="hero-account-dropdown" role="menu" aria-label={t("Account options")}>
                {embeddedServerResponse.tw5Versions.map(e => <>
                  <a
                    href={pathPrefix + "/tw5/" + e}
                    class="hero-account-action"
                    type="button"
                    role="menuitem"
                  >{e}</a>
                </>)}
              </div>
            </details>

            <details class="hero-account-menu">
              <summary class="hero-account-trigger" aria-label={t("Open account menu")}>
                <span class="hero-account-name">{embeddedServerResponse.userState.username}</span>
                <span class="hero-account-icon" aria-hidden="true">
                  {embeddedServerResponse.userState.avatarUrl
                    ? <img src={embeddedServerResponse.userState.avatarUrl} />
                    : <MaterialSymbol icon={accountCircleIcon} />}
                </span>
              </summary>
              <div class="hero-account-dropdown" role="menu" aria-label={t("Account options")}>
                <button
                  class="hero-account-action"
                  type="button"
                  role="menuitem"
                  onclick={() => {
                    location.pathname = pathPrefix + "/profile";
                  }}
                >
                  {t("Profile")}
                </button>
                <button
                  class="hero-account-action"
                  type="button"
                  role="menuitem"
                  onclick={logout}
                >
                  {t("Logout")}
                </button>
              </div>
            </details>
          </div>
        </header>

        <nav class="tab-strip" aria-label={t("Admin sections")}>
          {getAllTabs().filter((tab) => {
            if (tab.id === "roles") return isAdmin;
            if (tab.id === "users") return isAdmin || isTeacher;
            if (tab.id === "bags" || tab.id === "templates") return isAdmin || isTeacher;
            return true;
          }).map((tab) => (
            <button
              class={tab.id === activeTab ? "tab-button is-active" : "tab-button"}
              onclick={() => store.setActiveTab(tab.id)}
              type="button"
            >
              <span>{t(tab.label)}</span>
              <small>{t("{count} items", { count: itemsByTab[tab.id].length })}</small>
            </button>
          ))}
          {isAdmin ? (
            <button
              class={isStorageTab ? "tab-button is-active" : "tab-button"}
              onclick={() => {
                store.setActiveTab("storage");
                void this.loadStorage();
              }}
              type="button"
            >
              <span>{t("Storage")}</span>
              <small>{this.storageLoading
                ? t("Loading…")
                : this.storageInfo
                  ? this.prettifyBytes(this.storageInfo.disk.usedBytes)
                  : ""}</small>
            </button>
          ) : null}
          <button
            class={activeTab === "pinboard" ? "tab-button is-active" : "tab-button"}
            onclick={() => {
              store.setActiveTab("pinboard");
              void this.loadPinboardUnread();
            }}
            type="button"
          >
            <span>{t("Pinboard")}</span>
            <small class="pinboard-tab-counts">
              <span>{t("{count} notes", { count: this.pinboardCount })}</span>
              <span>{t("{count} new notes", { count: this.pinboardUnread })}</span>
            </small>
          </button>
          <button
            class={activeTab === "files" ? "tab-button is-active" : "tab-button"}
            onclick={() => store.setActiveTab("files")}
            type="button"
          >
            <span>{t("My files")}</span>
            <small>{t("{count} files", { count: this.userFileCount })}</small>
          </button>
        </nav>

        <section class="section-header">
          <div>
            <p class="eyebrow">{t(currentTab.eyebrow)}</p>
            <h2>{t(currentTab.label)}</h2>
          </div>
          <p class="section-copy">{t(currentTab.description)}</p>
          <div style="display:flex; gap:0.75rem; align-items:center; flex-wrap:wrap;">
            {isAdmin ? (
              <details class="create-wiki-menu" ontoggle={(event: Event) => {
                if ((event.currentTarget as HTMLDetailsElement).open) void this.loadBackups();
              }}>
                <summary class="ghost-button create-wiki-trigger">
                  <span>{t("Backups")}</span>
                  <span class="create-wiki-caret" aria-hidden="true">
                    <MaterialSymbol icon={backupIcon} />
                  </span>
                </summary>
                <div class="create-wiki-dropdown" role="menu" aria-label={t("Backups")}>
                  <button
                    class="create-wiki-action"
                    type="button"
                    role="menuitem"
                    onclick={() => void this.createBackup()}
                    disabled={this.backupBusy}
                  >{this.backupBusy ? t("Creating backup…") : t("Create backup now")}</button>
                  {this.backupError ? <p class="backup-status is-error">{this.backupError}</p> : null}
                  {this.backupMessage ? <p class="backup-status">{this.backupMessage}</p> : null}
                  {this.backups.length ? this.backups.map((backup) => (
                    <div class="backup-entry">
                      <a
                        class="backup-entry-main"
                        href={pathPrefix + "/admin/backup/download?name=" + encodeURIComponent(backup.name)}
                        download={`${backup.name}.zip`}
                        title={t("Download backup")}
                      >
                        <strong>{backup.name}</strong>
                        <small>{new Date(backup.createdAt).toLocaleString()} · {this.prettifyBytes(backup.sizeBytes)}</small>
                      </a>
                      <button
                        class="backup-delete-button"
                        type="button"
                        title={t("Delete backup")}
                        aria-label={t("Delete backup")}
                        onclick={() => void this.deleteBackup(backup.name)}
                        disabled={this.backupDeleting === backup.name}
                      >
                        <MaterialSymbol icon={deleteIcon} />
                      </button>
                    </div>
                  )) : <p class="backup-status">{t("No backups yet.")}</p>}
                </div>
              </details>
            ) : null}
            {canCreateOwnWiki && currentTab.id === "wikis" ? (
              <details class="create-wiki-menu">
                <summary class="primary-button create-wiki-trigger">
                  <span>{t("Create a wiki")}</span>
                  <span class="create-wiki-caret" aria-hidden="true">
                    <MaterialSymbol icon={expandIcon} />
                  </span>
                </summary>
                <div class="create-wiki-dropdown" role="menu" aria-label={t("Create a wiki")}>
                  <button
                    class="create-wiki-action"
                    type="button"
                    role="menuitem"
                    onclick={() => { this.startNewWiki(); this.closeCreateWikiMenu(); }}
                    disabled={isLoadingData || perTabStore.isOpeningItem || perTabStore.isSaving}
                  >{t("1-click wiki creation")}</button>
                  {isAdmin || isTeacher ? (
                    <button
                      class="create-wiki-action"
                      type="button"
                      role="menuitem"
                      onclick={() => { this.openCreate("wikis"); this.closeCreateWikiMenu(); }}
                      disabled={isLoadingData || perTabStore.isOpeningItem || perTabStore.isSaving}
                    >{t("Defined wiki creation")}</button>
                  ) : null}
                </div>
              </details>
            ) : null}
            {isStorageTab ? (
              <button
                class="ghost-button"
                type="button"
                onclick={() => void this.loadStorage()}
                disabled={this.storageLoading}
              >{this.storageLoading ? t("Scanning…") : t("Refresh")}</button>
            ) : currentTab.id !== "wikis" && (currentTab.id !== "roles" || embeddedServerResponse.userState.username === "admin") ? (
              <button
                class="ghost-button"
                type="button"
                onclick={() => this.openCreate(currentTab.id)}
                disabled={isLoadingData || perTabStore.isOpeningItem || perTabStore.isSaving}
              >{getCreateLabel(currentTab)}</button>
            ) : null}
          </div>
        </section>

        {isStorageTab ? (
          <section class="list-panel storage-panel-wrap">
            {this.storageError ? renderErrorBanner(this.storageError, { label: t("Retry"), onclick: () => void this.loadStorage() }) : null}
            {this.storageLoading ? (
              <div class="field-callout">
                <p>{t("Scanning storage…")}</p>
              </div>
            ) : this.storageInfo ? (
              <div class="storage-panel">
                <section class="storage-status-card">
                  <div class="storage-status-header">
                    <div>
                      <p class="eyebrow">{t("System disk")}</p>
                      <h3>{t("Disk storage status")}</h3>
                    </div>
                    <p class="storage-scan-meta">{t("Last scan")}: {new Date(this.storageInfo.lastScan).toLocaleString()}</p>
                  </div>
                  {(() => {
                    const { totalBytes, usedBytes } = this.storageInfo.disk;
                    const percent = totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0;
                    const statusClass = percent >= 90 ? "is-critical" : percent >= 75 ? "is-warning" : "is-ok";
                    const statusLabel = percent >= 90
                      ? t("Storage is nearly full – clean up or free space!")
                      : percent >= 75
                        ? t("Storage utilization is high.")
                        : t("Storage usage is ok.");
                    return (
                      <div class="storage-usage-block">
                        <strong class="storage-usage-text">
                          {this.prettifyBytes(usedBytes)} {t("of")} {this.prettifyBytes(totalBytes)} ({percent}%)
                        </strong>
                        <div class="storage-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                          <div class={`storage-progress-bar ${statusClass}`} style={{ width: `${percent}%` }} />
                        </div>
                        <p class={`storage-status-label ${statusClass}`}>{statusLabel}</p>
                        <p class="storage-free-text">{t("{free} free", { free: this.prettifyBytes(this.storageInfo.disk.availableBytes) })}</p>
                      </div>
                    );
                  })()}
                </section>

                <section class="storage-records-section">
                  <h3>{t("MultiWikiServer storage usage")}</h3>
                  {(() => {
                    const counts = this.storageInfo.recordCounts;
                    return (
                      <ul class="storage-record-counts">
                        <li><span>{t("Tiddlers")}</span><strong>{counts.tiddlers}</strong></li>
                        <li><span>{t("Bags")}</span><strong>{counts.bags}</strong></li>
                        <li><span>{t("Wikis")}</span><strong>{counts.recipes}</strong></li>
                        <li><span>{t("Templates")}</span><strong>{counts.templates}</strong></li>
                        <li><span>{t("Users")}</span><strong>{counts.users}</strong></li>
                      </ul>
                    );
                  })()}
                </section>

                <section class="storage-blobs-section">
                  <h3>{t("Blobs & files")}</h3>
                  {(() => {
                    const blobs = this.storageInfo.blobs;
                    const files = (count: number) => t("{count} files", { count: count.toLocaleString() });
                    return (
                      <div class="storage-blobs-grid">
                        <div class="storage-blob-tile is-blobs">
                          <p class="storage-blob-label">{t("Blobs")}</p>
                          <strong class="storage-blob-value">{blobs.blobCount.toLocaleString()}</strong>
                          <p class="storage-blob-sub">{t("Binary content in the database (images, videos, PDFs)")}</p>
                        </div>
                        <div class="storage-blob-tile is-store">
                          <p class="storage-blob-label">{t("File store")}</p>
                          <strong class="storage-blob-value">{this.prettifyBytes(blobs.blobBytes)}</strong>
                          <p class="storage-blob-sub">{t("Size of binary content (base64 encoded)")}</p>
                        </div>
                        <div class="storage-blob-tile is-content">
                          <p class="storage-blob-label">{t("Wiki content")}</p>
                          <strong class="storage-blob-value">{this.prettifyBytes(blobs.contentBytes)}</strong>
                          <p class="storage-blob-sub">{t("All tiddler content and metadata")}</p>
                        </div>
                        <div class="storage-blob-tile is-disk">
                          <p class="storage-blob-label">{t("Attachments on disk")}</p>
                          <strong class="storage-blob-value">{this.prettifyBytes(blobs.storeFiles.totalSizeBytes)}</strong>
                          <p class="storage-blob-sub">{files(blobs.storeFiles.files)} {t("in store/files/")}</p>
                        </div>
                        <div class="storage-blob-tile is-inbox">
                          <p class="storage-blob-label">{t("Inbox")}</p>
                          <strong class="storage-blob-value">{this.prettifyBytes(blobs.inbox.totalSizeBytes)}</strong>
                          <p class="storage-blob-sub">{files(blobs.inbox.files)} {t("in store/inbox/")}</p>
                        </div>
                        <div class="storage-blob-tile is-orphan">
                          <p class="storage-blob-label">{t("Orphaned files")}</p>
                          <strong class="storage-blob-value">{blobs.orphanedStoreFiles.toLocaleString()}</strong>
                          <p class="storage-blob-sub">{t("Incomplete or unreferenced files in store/files/")}</p>
                        </div>
                      </div>
                    );
                  })()}
                </section>

                <section class="storage-cleanup-section">
                  <div class="storage-cleanup-header">
                    <h3>{t("Clean up storage")}</h3>
                    <button class="ghost-button" type="button" onclick={() => void this.previewCleanup()} disabled={this.cleanupLoading}>
                      {this.cleanupLoading ? t("Scanning…") : t("Scan for cleanup")}
                    </button>
                  </div>
                  {this.cleanupError ? <p class="backup-status is-error">{this.cleanupError}</p> : null}
                  {!this.cleanupPreview ? (
                    <p class="storage-cleanup-hint">
                      {t("Removes aborted uploads and unreferenced files from store/inbox/ and store/files/. Nothing is deleted until you confirm the preview.")}
                    </p>
                  ) : (
                    (() => {
                      const preview = this.cleanupPreview;
                      const category = (label: string, data: StorageCleanupCategory) => (
                        <div class="storage-cleanup-cat">
                          <span class="storage-cleanup-cat-label">{label}</span>
                          <span class="storage-cleanup-cat-count">{data.count.toLocaleString()}</span>
                          <span class="storage-cleanup-cat-bytes">{this.prettifyBytes(data.bytes)}</span>
                        </div>
                      );
                      return (
                        <div class="storage-cleanup-result">
                          <p class="storage-cleanup-summary">
                            {preview.total.count === 0
                              ? t("Nothing to clean up.")
                              : preview.dryRun
                                ? t("Found {count} candidates with {bytes} in total.", { count: preview.total.count.toLocaleString(), bytes: this.prettifyBytes(preview.total.bytes) })
                                : t("Removed {count} candidates with {bytes} in total.", { count: preview.total.count.toLocaleString(), bytes: this.prettifyBytes(preview.total.bytes) })}
                          </p>
                          <div class="storage-cleanup-cats">
                            {category(t("Stale inbox"), preview.categories.inbox)}
                            {category(t("Orphaned store files"), preview.categories.orphaned)}
                            {category(t("Unreferenced blobs"), preview.categories.unreferenced)}
                          </div>
                          <div class="storage-cleanup-action">
                            {preview.dryRun && preview.total.count > 0 ? (
                              <>
                                <button class="primary-button" type="button" onclick={() => void this.executeCleanup()} disabled={this.cleanupBusy}>
                                  {this.cleanupBusy ? t("Cleaning up…") : t("Clean up now")}
                                </button>
                                <button class="ghost-button" type="button" onclick={() => { this.cleanupPreview = null; }}>{t("Cancel")}</button>
                              </>
                            ) : (
                              <button class="ghost-button" type="button" onclick={() => { this.cleanupPreview = null; }}>{t("Close")}</button>
                            )}
                          </div>
                        </div>
                      );
                    })()
                  )}
                </section>

                <section class="storage-data-section">
                  <h3>{t("Storage usage per user (Top 10)")}</h3>
                  <div class="storage-table-scroll">
                    <table class="storage-table storage-user-table">
                      <thead>
                        <tr>
                          <th>{t("User")}</th>
                          <th>{t("Wikis")}</th>
                          <th>{t("Wiki content")}</th>
                          <th>{t("File store")}</th>
                          <th>{t("Total")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {this.storageInfo.topUsers.map((user) => (
                          <tr key={user.username}>
                            <td><strong class="storage-user-name">{user.username}</strong></td>
                            <td>{user.wikiCount.toLocaleString()}</td>
                            <td>{this.prettifyBytes(user.wikiContentBytes)}</td>
                            <td>{this.prettifyBytes(user.fileStoreBytes)}</td>
                            <td class="storage-user-total">{this.prettifyBytes(user.totalBytes)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section class="storage-data-section">
                  <h3>{t("Data overview")}</h3>
                  <div class="storage-table-scroll">
                    <table class="storage-table">
                      <thead>
                        <tr>
                          <th>{t("Path")}</th>
                          <th>{t("Category")}</th>
                          <th>{t("Files")}</th>
                          <th>{t("Directories")}</th>
                          <th>{t("Total size")}</th>
                          <th>{t("Last modified")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {this.storageInfo.categories.map((cat) => (
                          <tr key={cat.path}>
                            <td><code class="storage-path">{cat.path}</code></td>
                            <td>{t(cat.category)}</td>
                            <td>{cat.files}</td>
                            <td>{cat.directories}</td>
                            <td>{this.prettifyBytes(cat.totalSizeBytes)}</td>
                            <td>{cat.lastModified ? new Date(cat.lastModified).toLocaleString() : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section class="storage-legend">
                  <h3>{t("Legend")}</h3>
                  <ul>
                    <li><span class="storage-legend-chip is-db"></span>{t("Database")} – {t("SQLite database with all tiddlers and metadata")}</li>
                    <li><span class="storage-legend-chip is-app"></span>{t("Application data")} – {t("Application files and metadata in the store folder")}</li>
                    <li><span class="storage-legend-chip is-attachments"></span>{t("Attachments")} – {t("Uploaded file attachments")}</li>
                    <li><span class="storage-legend-chip is-backups"></span>{t("Backups")} – {t("Database snapshots and backups")}</li>
                    <li><span class="storage-legend-chip is-cache"></span>{t("Cache")} – {t("Cached data")}</li>
                    <li><span class="storage-legend-chip is-temp"></span>{t("Temporary data")} – {t("Inbox and temporary files")}</li>
                    <li><span class="storage-legend-chip is-system"></span>{t("System & configuration")} – {t("Configuration and system files")}</li>
                  </ul>
                </section>
              </div>
            ) : null}
          </section>
        ) : activeTab === "pinboard" ? (
          <section class="list-panel">
            <mws-pinboard onCountsChange={this.handlePinboardCounts} />
          </section>
        ) : activeTab === "files" ? (
          <section class="list-panel">
            <mws-user-files onCountChange={this.handleUserFileCount} admin={embeddedServerResponse.userState.isAdmin} />
          </section>
        ) : (
          <section class="list-panel">
          {/* <div class="list-toolbar">
            <div>
              <strong>{currentTab.label} list</strong>
              <p>{isLoadingData
                ? "Loading…"
                : "Click any row to for more information."}</p>
            </div>
            <div class="toolbar-actions">
              <button
                class="ghost-button"
                type="button"
                onclick={() => this.openCreate(currentTab.id)}
                disabled={isLoadingData || perTabStore.isOpeningItem || perTabStore.isSaving}
              >{getCreateLabel(currentTab)}</button>
            </div>
          </div> */}

          {mainStorageError ? renderErrorBanner(mainStorageError, { label: t("Dismiss"), onclick: this.clearMainStorageError }) : null}

          {currentTab.id === "wikis" && userState.isLoggedIn && !isAdmin ? (
            <div class="field-callout wiki-limit-banner">
              <p>{bannerWikiLimit == null
                ? t("You have created {used} of ∞ own wikis – unlimited more possible.", { used: ownWikiCount })
                : bannerWikiLimit === 0
                  ? t("Your administrator has not allowed you to create your own wikis yet.")
                  : ownWikiRemaining === 0
                    ? t("You have reached your limit of {limit} own wiki(s).", { limit: bannerWikiLimit })
                    : t("You have created {used} of {limit} own wikis – {remaining} more possible.", {
                      used: ownWikiCount,
                      limit: bannerWikiLimit,
                      remaining: ownWikiRemaining ?? 0,
                    })}</p>
            </div>
          ) : null}

          <div class="list-grid" style={{ ["--grid-columns"]: buildListGridTemplate(currentTab.columns) }}>
            <div class="list-head-row">
              {currentTab.columns.map((column) => (
                <div class={"list-cell list-head" + (column.width && column.width > 1 ? " span-" + column.width : "")}>{t(column.label)}</div>
              ))}
            </div>

            <div class="list-body">
            {isLoadingData ? (
              <div class="field-callout full-row">
                <p>{t("Loading {tab}…", { tab: currentTab.label.toLowerCase() })}</p>
              </div>
            ) : activeTabItems.length ? activeTabItems.map((item) => (
              <div
                class="list-row"
                role="button"
                tabindex={isListInteractionDisabled ? -1 : 0}
                aria-disabled={isListInteractionDisabled ? "true" : undefined}
                onclick={() => {
                  if (!isListInteractionDisabled)
                    void store.openItem(currentTab.id, item.id);
                }}
                onkeydown={(event) => {
                  if (isListInteractionDisabled) return;
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  void store.openItem(currentTab.id, item.id);
                }}
              >
                {currentTab.columns.map((column) => {
                  const value = getAdminRecordValue(column, item);
                  const isFirstColumn = column.key === currentTab.columns[0]?.key;
                  const linkUrl = isFirstColumn ? getListColumnLink(currentTab.id, column.key, item) : null;
                  if (typeof linkUrl === "string") {
                    return <a
                      class={"list-cell list-cell-link" + (column.width && column.width > 1 ? " span-" + column.width : "")}
                      href={linkUrl}
                      target="_blank"
                      rel="noreferrer"
                      onclick={(event) => event.stopPropagation()}
                      onkeydown={(event) => event.stopPropagation()}
                    >{renderListCellValue(column.key, value, (src) => { this.thumbnailSrc = src; }, column.truncate)}</a>;
                  }
                  return (
                    <div class={"list-cell" + (column.width && column.width > 1 ? " span-" + column.width : "")}>
                      {renderListCellValue(column.key, value, (src) => { this.thumbnailSrc = src; }, column.truncate)}
                      {/* {(() => {


                        return typeof linkUrl === "string"
                          ? <a
                            class="list-cell-link"
                            href={linkUrl} onclick={(event) => event.stopPropagation()}
                            onkeydown={(event) => event.stopPropagation()}
                          >{renderListCellValue(column.key, value)}</a>
                          : renderListCellValue(column.key, value);
                      })()} */}
                    </div>
                  )
                })}
              </div>
            )) : (
              <div class="field-callout full-row">
                {currentTab.id === "wikis" && isStudent && !canCreateOwnWiki
                  ? <p>{userState.wikiLimit === 0
                    ? t("Your administrator has not allowed you to create your own wikis yet.")
                    : t("You have reached your limit of {limit} own wiki(s).", { limit: userState.wikiLimit ?? 0 })}</p>
                  : <p>{t("Create a {tab} to get started.", { tab: currentTab.label.toLowerCase() })}</p>}
              </div>
            )}
            </div>
          </div>
          </section>
        )}

        {perTabStore.isOpen ? (
          <RecordModalElement
            store={perTabStore}
          />
        ) : null}

        {this.newWikiOpen ? (
          <div class="modal-shell" webjsx-attr-open>
            <section class="modal-card" role="dialog" aria-modal="true" aria-label={t("New Wiki")}>
              <header class="modal-header">
                <div class="modal-title">
                  <p class="eyebrow">{t("New Wiki")}</p>
                  <h3>{t("Create a wiki with a single click")}</h3>
                  <p>{t("A name is all it takes. Slug, bag and default permissions are assigned automatically (slug: wiki-<username>).")}</p>
                </div>
                <div class="close-button" onclick={this.closeNewWiki} aria-label={t("Close")}>
                  <MaterialSymbol icon={closeIcon} />
                </div>
              </header>
              <div class="modal-layout">
                <div class="field-stack modal-main">
                  <div class="field-block">
                    <div class="field-editor">
                      <label class="field-label" for="new-wiki-name">{t("Name of the wiki")}</label>
                      <input
                        id="new-wiki-name"
                        class="field-input"
                        type="text"
                        value={this.newWikiName}
                        oninput={(event) => { this.newWikiName = (event.target as HTMLInputElement).value; }}
                      />
                      {this.newWikiError ? renderErrorBanner(formatStorageErrorForDisplay(this.newWikiError, t)) : null}
                      {this.newWikiSlug ? (
                        <p class="field-helper">
                          {t("Done — your wiki is here:")}{" "}
                          <a href={pathPrefix + "/wiki/" + encodeURIComponent(this.newWikiSlug)} target="_blank" rel="noreferrer">
                            {pathPrefix}/wiki/{this.newWikiSlug}
                          </a>
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              <footer class="modal-actions">
                <button class="ghost-button" type="button" onclick={this.closeNewWiki} disabled={this.newWikiBusy}>{t("Close")}</button>
                <button class="primary-button" type="button" onclick={this.submitNewWiki} disabled={this.newWikiBusy || !this.newWikiName.trim()}>
                  {this.newWikiBusy ? t("Creating…") : t("Create wiki")}
                </button>
              </footer>
            </section>
          </div>
        ) : null}

        {this.thumbnailSrc ? (
          <div class="modal-shell modal-shell-centered" webjsx-attr-open onclick={(event) => {
            if (event.target === event.currentTarget) this.thumbnailSrc = "";
          }}>
            <section class="modal-card thumbnail-modal" role="dialog" aria-modal="true" aria-label={t("Wiki preview")}>
              <header class="modal-header">
                <div class="modal-title">
                  <p class="eyebrow">{t("Wiki preview")}</p>
                  <h3>{t("Thumbnail")}</h3>
                </div>
                <div class="close-button" onclick={() => { this.thumbnailSrc = ""; }} aria-label={t("Close")}>
                  <MaterialSymbol icon={closeIcon} />
                </div>
              </header>
              <div class="modal-layout">
                <img class="wiki-thumbnail-full" src={this.thumbnailSrc} alt="" />
              </div>
            </section>
          </div>
        ) : null}
      </div>
    );
  }
}

// #region table stuff

function buildListGridTemplate(columns: readonly ColumnDefinition[]): string {
  return columns.map((column) => {
    // Truncated/tall-text columns are allowed to compress down to their longest
    // word on narrow screens (responsive), while the others keep their full
    // content width; both grow to fill the available width via the 1fr max.
    // Description-style columns snuggly fit their full text on wide screens
    // (--truncate-min = max-content); on narrow screens (below 800px) a CSS
    // media rule switches the minimum to min-content so the column can shrink
    // and the text wraps instead of overflowing.
    const track = column.truncate
      ? "minmax(var(--truncate-min, max-content), 1fr)"
      : "minmax(max-content, 1fr)";
    return Array.from({ length: column.width ?? 1 }, () => track).join(" ");
  }).join(" ");
}

function renderListCellValue(columnKey: string, value: string | undefined, onThumbnailClick?: (src: string) => void, truncate?: number) {
  let formattedValue = formatFieldValue(value);
  if (truncate && formattedValue.length > truncate) formattedValue = formattedValue.slice(0, truncate) + "…";

  if (columnKey === "recipeUsers" || columnKey === "recipeAdmins" || columnKey === "groupRoles") {
    const names = Array.isArray(value) ? value.filter((name): name is string => typeof name === "string" && Boolean(name)) : [];
    if (!names.length) return <span class="list-access-names is-empty">—</span>;
    return (
      <span class="list-access-names">
        {names.map((name) => <span class="list-access-name" key={name}>{name}</span>)}
      </span>
    );
  }

  if (columnKey === "myRights") {
    const labels: Record<string, string> = {
      admin: t("Admin"),
      owner: t("Owner"),
      write: t("Write access"),
      read: t("Read access"),
    };
    return <span class={"my-rights" + (value && labels[value] ? " my-rights-" + value : "")}>{labels[value ?? ""] ?? ""}</span>;
  }

  if (columnKey === "thumbnailUrl" && value) {
    return (
      <img
        class="wiki-thumbnail"
        src={value}
        alt=""
        loading="lazy"
        decoding="async"
        onclick={(event) => {
          event.stopPropagation();
          onThumbnailClick?.(value);
        }}
      />
    );
  }

  if (columnKey === "statusFlags" && value?.toLowerCase().includes("alert")) {
    return (
      <span class="missing-marker" aria-label={formattedValue} title={formattedValue}>
        <MaterialSymbol icon={warningIcon} />
      </span>
    );
  }

  return textWithSlashes(formattedValue);
}

function getListColumnLink(tabId: TabId, columnKey: string, item: AdminRecord): string | null {
  const mapper = getListColumnLinkMappers(tabId)[columnKey];
  return mapper ? mapper(item) : null;
}


function getListColumnLinkMappers(tabId: TabId): Partial<Record<string, ListColumnLinkMapper>> {
  switch (tabId) {
    case "wikis":
      return {
        slug: (item) => {
          definitely<WikiAdminRecord>(item);
          return item.slug ? `${pathPrefix}/wiki/${encodeURIComponent(item.slug)}` : null;
        },
      };
    case "templates":
    case "bags":
    case "roles":
    case "users":
      return {};
    default: {
      const exhaustive: never = tabId;
      return exhaustive;
    }
  }
}

type ListColumnLinkMapper = (item: AdminRecord) => string | null;
