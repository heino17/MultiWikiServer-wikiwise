import { DraftChangeHandler, OperationTriggerHandler, PendingRowsChangeHandler, PermissionRowsChangeHandler, PerTabFieldState, ResolverTitleChangeHandler } from "../app";
import { MaterialSymbol } from "../material-symbol";
import { AdminRecordStore, FieldDefinition, FieldType, IdString, PermissionRow, WikiAdminRecord, WritablePrefixRow } from "./tabs";
import { definitely, is } from "./utils";
import warningIcon from "@material-symbols/svg-400/outlined/warning.svg";
import { findTemplateRecordForWikiRecord, jsonReviver } from "./store";
import { t } from "../i18n";
import { PasswordGenerator } from "../password-generator";



interface FieldEditorContext<T = unknown> extends ReadonlyFieldContext<T> {
  inputId: string;
  disabled?: boolean;
  fieldState: PerTabFieldState;
  itemsByTab: AdminRecordStore;
  onDraftChange: DraftChangeHandler<T>;
  onPendingRowsChange: PendingRowsChangeHandler;
  onTransientPermissionRowsChange: PermissionRowsChangeHandler;
  onResolverTitleChange: ResolverTitleChangeHandler;
  onTriggerOperation: OperationTriggerHandler;
}

export function renderFieldEditor(ctx: FieldEditorContext<unknown>) {
  return (fieldTypeRenderEditors as any)[ctx.field.type](ctx);
}


/** The subset of FieldEditorContext that the readonly renderers need. */
interface ReadonlyFieldContext<T = unknown> {
  field: FieldDefinition;
  value: T;
  itemsByTab?: AdminRecordStore;
}
export function renderFieldSidebar(ctx: ReadonlyFieldContext) {
  return (fieldTypeRenderSidebars as any)[ctx.field.type](ctx);
}


type PermissionLevel = "A_read" | "B_write";

function getPermissionLevelsForField(fieldKey: string): string[] {
  return fieldKey === "bagPermissions" ? ["A_read", "B_write", "C_admin"] : ["A_read", "B_write"];
}

function formatPermissionLevel(level: string): string {
  return level.replace(/^[A-Z]_/, "");
}

function buildEffectivePrefixObject(writablePrefixBags: (readonly WritablePrefixRow[])[]): readonly WritablePrefixRow[] {
  const result: Record<string, string> = {};
  for (const list of writablePrefixBags) {
    for (const row of list) {
      if (typeof row.prefix !== "string" || typeof row.bagName !== "string")
        throw new Error("Expects an object of { prefix: string; bagName: string; }.")
      result[row.prefix] ??= row.bagName;
    }
  }
  return Object.entries(result)
    .map(([prefix, bagName]) => ({ prefix, bagName }))
    .sort((a, b) => b.prefix.length - a.prefix.length);
}


function getLookupOptions(fieldKey: string, itemsByTab: AdminRecordStore): string[] {
  if (fieldKey === "readonlyBags" || fieldKey === "writablePrefixBags") {
    return Array.from(itemsByTab.availableBagNames);
  }
  if (fieldKey === "plugins") {
    return Array.from(itemsByTab.availablePluginNames);
  }
  if(fieldKey === "twVersion"){
    return embeddedServerResponse.tw5Versions;
  }
  if (fieldKey === "userRoles"
    || fieldKey === "bagPermissions"
    || fieldKey === "recipeAdmins"
    || fieldKey === "recipeUsers"
    || fieldKey === "templateAdmins"
    || fieldKey === "templateUsers"
  ) {
    const roleNames = Array.from(new Set(itemsByTab.roles.map((item) => item.name).filter(Boolean)));
    if (embeddedServerResponse.userState.isAdmin) return roleNames;
    // Everyone except the admin sees only the roles they may actually address:
    // the groups they are a member of (including their own personal role and the
    // shared USER role), the ANON system role (public sharing) and the personal
    // roles of everyone who shares a group role with them (server flag
    // ownerSharesGroupWithMe) — classmates and their own class teacher. Privileged
    // roles (ADMIN and every is_teacher role) are off limits for assignment.
    // Other classes, clubs, unrelated teachers/students stay out of the pickers.
    const foreignTeacherRoleNames = new Set(
      itemsByTab.roles.filter((item) => item.foreignTeacherRole).map((item) => item.name)
    );
    const privilegedRoleNames = new Set(
      itemsByTab.roles.filter((item) => item.name === "ADMIN" || item.isTeacher).map((item) => item.name)
    );
    const myRoleNames = new Set(embeddedServerResponse.userState.roles.map((role) => role.role_name));
    const groupCompanionNames = new Set(itemsByTab.roles.filter((item) => item.ownerSharesGroupWithMe).map((item) => item.name));
    const base = roleNames.filter((name) =>
      !privilegedRoleNames.has(name) && (myRoleNames.has(name) || name === "ANON" || groupCompanionNames.has(name))
    );
    // The user-role picker (assigning roles to a user account) additionally hides
    // foreign teachers' personal roles: role assignments stay within one's own
    // class. Permission editors keep them when the teacher shares a group.
    if (fieldKey === "userRoles")
      return base.filter((name) => !foreignTeacherRoleNames.has(name));
    return base;
  }
  return [];
}

export function formatFieldValue(value: any): string {
  if (typeof value === "string"
    || value instanceof IdString
  )
    return value.trim() || "—";
  if (Array.isArray(value)) {
    if (!value.length) return "—";
    if (typeof value[0] === "string")
      return value.join("\n"); // value.length ?  : "—";
    if (typeof value[0] === "object") {
      if (typeof value[0].prefix === "string")
        return value.map(e => `${e.prefix}: ${e.bagName}`).join("\n");
      if (typeof value[0].name === "string")
        return value.map(e => `${e.name}`).join("\n");
    }
  }
  console.error("value is not supported", value)
  throw new Error("value is not supported");
}


function renderSearchableInput({ id, currentValue, placeholder, options, onInput, disabled }: {
  id: string;
  currentValue: string;
  placeholder: string;
  options: string[];
  onInput: (nextValue: string) => void;
  disabled: boolean | undefined;
}) {
  const datalistId = `${id}-options`;
  return (
    <>
      <input
        id={id}
        class="field-input"
        type="text"
        value={currentValue}
        disabled={disabled}
        ref={(element) => {
          if (element.value !== currentValue) element.value = currentValue;
        }}
        placeholder={placeholder}
        list={options.length ? datalistId : undefined}
        oninput={(event) => onInput((event.currentTarget as HTMLInputElement).value)}
      />
      {options.length ? (
        <datalist id={datalistId}>
          {options.map((option) => <option value={option} />)}
        </datalist>
      ) : null}
    </>
  );
}

/**
 * Keeps the derived default bag (the empty-prefix write target "editions/<slug>")
 * in sync while the wiki slug is being edited: any authored writablePrefixBags row
 * that still points at "editions/<old-slug>" follows the new slug value.
 */
function syncDefaultBagOnSlugChange(ctx: FieldEditorContext, nextSlug: string) {
  const { field, value, fieldState, onDraftChange } = ctx;
  if (field.key !== "slug" || fieldState.tabId !== "wikis") return;
  const oldSlug = String(value ?? "");
  if (!oldSlug || oldSlug === nextSlug) return;
  const draft = fieldState.draft as Partial<WikiAdminRecord>;
  const rows = draft.writablePrefixBags;
  if (!Array.isArray(rows)) return;
  const oldBag = `editions/${oldSlug}`;
  const newBag = `editions/${nextSlug}`;
  const nextRows = rows.map((row) => (row.bagName === oldBag ? { ...row, bagName: newBag } : row));
  if (nextRows.some((row, index) => row.bagName !== rows[index].bagName)) {
    onDraftChange("writablePrefixBags", nextRows);
  }
}

const SLUG_FORMAT_HINT_KEY = "Use lowercase letters, numbers and hyphens, e.g. mein-wiki.";
const SLUG_FORMAT_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function renderSlugLiveValidation(ctx: FieldEditorContext) {
  const { field, value, fieldState, itemsByTab } = ctx;
  if (field.key !== "slug" || fieldState.tabId !== "wikis") return null;
  const slug = String(value ?? "");
  if (!slug) {
    return (
      <p class="field-helper" role="status" aria-live="polite">
        {t(SLUG_FORMAT_HINT_KEY)}
      </p>
    );
  }
  const savedSlug = (fieldState.saved as Partial<WikiAdminRecord>)?.slug;
  const takenSlugs = itemsByTab.wikis.map((wiki) => wiki.slug).filter((item) => item !== savedSlug);
  const isValidFormat = SLUG_FORMAT_REGEX.test(slug);
  const isTaken = takenSlugs.includes(slug);
  if (!isValidFormat) {
    return (
      <p class="field-helper" role="alert" aria-live="polite" style={{ color: "var(--color-danger)" }}>
        {t(SLUG_FORMAT_HINT_KEY)}
      </p>
    );
  }
  if (isTaken) {
    return (
      <p class="field-helper" role="alert" aria-live="polite" style={{ color: "var(--color-danger)" }}>
        {t("This name is already taken.")}
      </p>
    );
  }
  return (
    <p class="field-helper" role="status" aria-live="polite" style={{ color: "var(--color-success)" }}>
      {t("This name is available.")}
    </p>
  );
}

function renderTextInputField(ctx: FieldEditorContext, type: "text" | "number" | "password") {
  const { field, value, disabled, inputId, onDraftChange, } = ctx;
  definitely<string>(value);
  if (field.mode === "server" || field.mode === "") {
    return renderCalloutField(ctx);
  }
  const passwordGenerator = type === "password" && field.passwordGenerator
    ? <PasswordGenerator
      fieldKey={field.key}
      confirmKey={field.passwordGenerator === true ? undefined : field.passwordGenerator}
      disabled={disabled}
      onDraftChange={(key, value) => onDraftChange(key, value)}
      onTriggerOperation={ctx.onTriggerOperation}
    />
    : null;
  return <>
    <input id={inputId} class="field-input" type={type} value={value} ref={(element) => {
      if (element.value !== value) element.value = value;
    }} disabled={disabled} oninput={(event) => {
      const nextValue = (event.currentTarget as HTMLInputElement).value;
      syncDefaultBagOnSlugChange(ctx, nextValue);
      onDraftChange(field.key, nextValue);
    }} />
    {renderSlugLiveValidation(ctx)}
    {passwordGenerator}
  </>;
}

function renderTextareaField(ctx: FieldEditorContext, rows: number, extraClass = "") {
  const { field, value, disabled, inputId, onDraftChange } = ctx;
  definitely<string>(value);
  const className = extraClass ? `field-textarea ${extraClass}` : "field-textarea";
  return <textarea id={inputId} class={className} rows={rows} ref={(element) => {
    if (element.value !== value) element.value = value;
  }} disabled={disabled} oninput={(event) => onDraftChange(field.key, (event.currentTarget as HTMLTextAreaElement).value)} />;
}

function renderSelectField(ctx: FieldEditorContext<boolean>) {
  const { field, value, disabled, inputId, onDraftChange } = ctx;
  definitely<boolean>(value);
  return (
    <select id={inputId} class="field-select" disabled={disabled} onchange={(event) => onDraftChange(field.key, (event.currentTarget as HTMLSelectElement).value === "true")}>
      <option value="true" selected={value}>{t("Enabled")}</option>
      <option value="false" selected={!value}>{t("Disabled")}</option>
    </select>
  );
}


export function renderSwitchField(ctx: Pick<
  FieldEditorContext<boolean>,
  "field" | "value" | "onDraftChange"
>, headerSwitch = false) {
  const { field, value, onDraftChange } = ctx;
  const checked = value === true;
  return (
    <label class="header-switch" for={`header-${field.key}`}>
      <input
        id={`header-${field.key}`}
        class="header-switch-input"
        type="checkbox"
        checked={checked}
        ref={(element) => { if (element.checked !== checked) element.checked = checked; }}
        onchange={(event) => onDraftChange(field.key, (event.currentTarget as HTMLInputElement).checked)}
      />
      <span class={checked ? "header-switch-track is-checked" : "header-switch-track"} aria-hidden="true">
        <span class="header-switch-thumb"></span>
      </span>
    </label>
  )
  // return (
  //   <div class="toggle-field-row">
  //     {!headerSwitch ? (
  //       <div class="toggle-field-copy">
  //         <strong>{field.label}</strong>
  //         {field.description ? <p>{field.description}</p> : null}
  //       </div>
  //     ) : null}

  //   </div>
  // );
}



function renderActivityFeedField(ctx: ReadonlyFieldContext<readonly string[]>) {
  const lines = ctx.value;
  return <ul class="timeline-list">{lines.map((line) => <li>{line}</li>)}</ul>;
}

function renderMetadataTableField(ctx: ReadonlyFieldContext<readonly string[]>) {
  const lines = ctx.value;
  return <dl class="meta-list">{lines.map((line) => {
    const [key, ...rest] = line.split(":");
    return <><dt>{key}</dt><dd>{rest.join(":").trim()}</dd></>;
  })}</dl>;
}

function renderTableField(ctx: ReadonlyFieldContext) {
  const { field, value, itemsByTab } = ctx;
  definitely<readonly string[]>(value);
  return renderLinesList(value, field.key, itemsByTab)
}

function renderLinesList(value: readonly string[], key: string, itemsByTab?: AdminRecordStore) {
  const missingCheck =
    itemsByTab ?
      (key === "effectiveReadonlyBags" || key === "readonlyBags") ? new Set(Array.from(itemsByTab.availableBagNames)) :
        (key === "effectivePluginSet" || key === "plugins") ? itemsByTab.availablePluginNames :
          null : null;
  const lines = value.map(line => ({ line, missing: missingCheck && !missingCheck.has(line), }));
  return <ul class="value-list">{lines.map(({ line, missing }) => <li>
    {textWithSlashes(line)}
    {missing ? <span class="missing-marker" aria-label="Missing dependency" title="Missing dependency"><MaterialSymbol icon={warningIcon} /></span> : null}
  </li>)}</ul>;

}
export function textWithSlashes(line: string): JSX.Node[] {
  return line.split("/").map((e, i, a) => <>{e + ((i !== a.length - 1) ? "/" : "")}<wbr /></>);
}

function renderCalloutField(ctx: ReadonlyFieldContext) {
  definitely<string>(ctx.value);
  return <div class="field-callout"><p>{formatFieldValue(ctx.value)}</p></div>;
}

function renderPreField(ctx: ReadonlyFieldContext) {
  definitely<string>(ctx.value);
  return (
    <div class="field-value">
      <pre>{formatFieldValue(ctx.value)}</pre>
    </div>
  );
}

function renderConfirmPasswordFieldEditor(ctx: FieldEditorContext<any>) {
  const { field, value, disabled, fieldState, inputId, onDraftChange, onTriggerOperation } = ctx;
  definitely<string>(value);
  const confirmationValue = fieldState.operationMessages[field.key] ?? "";
  const hasConfirmation = Boolean(confirmationValue);
  const hasMismatch = hasConfirmation && confirmationValue !== value;

  return (
    <div class="row-editor-stack">
      <input
        id={inputId}
        class="field-input"
        type="password"
        value={value}
        disabled={disabled}
        placeholder={t("Repeat password")}
        ref={(element) => {
          if (element.value !== value) element.value = value;
        }}
        oninput={(event) => onDraftChange(field.key, (event.currentTarget as HTMLInputElement).value)}
      />
      <input
        id={`${inputId}-confirm`}
        class="field-input"
        type="password"
        value={confirmationValue}
        disabled={disabled}
        placeholder={t("Confirm password")}
        ref={(element) => {
          if (element.value !== confirmationValue) element.value = confirmationValue;
        }}
        oninput={(event) => onTriggerOperation(field.key, (event.currentTarget as HTMLInputElement).value)}
      />
      {hasConfirmation ? <p class="field-helper">{hasMismatch ? t("Passwords do not match yet.") : t("Passwords match.")}</p> : null}
    </div>
  );
}

function renderSearchMultiselectFieldSidebar(ctx: ReadonlyFieldContext<any>): JSX.Node {
  definitely<readonly string[]>(ctx.value);
  return <ul>
    {ctx.value.map((entry) => <li>{entry}</li>)}
  </ul>;
}

function renderSearchFieldSidebar(ctx: ReadonlyFieldContext<string | null>): JSX.Node {
  return <div class="field-callout"><p>{formatFieldValue(ctx.value ?? "")}</p></div>;
}

function renderSearchFieldEditor(ctx: FieldEditorContext<string | null> | ReadonlyFieldContext<string | null>) {
  if (ctx.field.mode === "server" || ctx.field.mode === "" || !("onDraftChange" in ctx)) {
    return renderSearchFieldSidebar(ctx);
  }
  const { field, value, disabled, itemsByTab, inputId, onDraftChange } = ctx;
  return renderSearchableInput({
    id: inputId,
    currentValue: value ?? "",
    placeholder: t(field.label),
    options: getLookupOptions(field.key, itemsByTab),
    disabled,
    onInput: (nextValue) => onDraftChange(field.key, nextValue || null),
  });
}

function renderSearchMultiselectFieldEditor(ctx: FieldEditorContext<any>) {
  const { field, value, disabled, fieldState, itemsByTab, inputId, onDraftChange, onPendingRowsChange } = ctx;
  if (typeof value === "string") {
    console.log(ctx);
    throw new Error("value is a string");
  }
  if (field.mode === "server" || field.mode === "") {
    return renderLinesList(value, field.key, itemsByTab);
  }
  const editableLines = value;
  const pendingRowCount = fieldState.pendingRows[field.key] ?? 0;
  const lookupOptions = getLookupOptions(field.key, itemsByTab);
  const itemLabel = t(field.label);
  // field.key === "plugins" ? "plugin" :
  //   field.key === "userRoles" ? "role id" :
  //     "bag";
  const templateRecord = is<WikiAdminRecord>(fieldState.draft, fieldState.tabId === "wikis")
    ? findTemplateRecordForWikiRecord(fieldState.draft, itemsByTab) : undefined;
  const templateReadonlyBagLines = field.key === "readonlyBags" && templateRecord ? templateRecord.readonlyBags : [];
  const templatePluginLines = field.key === "plugins" && templateRecord ? templateRecord.plugins : [];
  const templateCorePluginsEnabled = Boolean(templateRecord?.requiredPluginsEnabled);

  const updateLineValueAt = (index: number, nextValue: string) => {
    const lines = value.slice();
    const hadStoredRow = index < lines.length;
    while (lines.length <= index) lines.push("");
    lines[index] = nextValue;
    onDraftChange(field.key, lines);
    if (!hadStoredRow && nextValue.trim()) onPendingRowsChange(field.key, (count) => count - 1);
  };

  const removeLineValueAt = (index: number) => {
    const lines = value.slice();
    if (index >= lines.length) {
      onPendingRowsChange(field.key, (count) => count - 1);
      return;
    }
    lines.splice(index, 1);
    onDraftChange(field.key, lines);
  };

  const displayedLines = editableLines.length
    ? [...editableLines, ...Array.from({ length: pendingRowCount }, () => "")]
    : ["", ...Array.from({ length: pendingRowCount }, () => "")];
  return (
    <div class="row-editor-stack">
      {displayedLines.map((line, index) => (
        <div class="row-editor-row">
          {renderSearchableInput({
            id: `${inputId}-${index}`,
            currentValue: line,
            placeholder: itemLabel,
            options: lookupOptions,
            onInput: (nextValue) => updateLineValueAt(index, nextValue),
            disabled: ctx.disabled
          })}
          <button type="button" class="row-action-button" disabled={disabled} onclick={() => removeLineValueAt(index)}>{t("Remove")}</button>
        </div>
      ))}
      <button type="button" class="ghost-button" disabled={disabled} onclick={() => onPendingRowsChange(field.key, (count) => count + 1)}>{t("Add {item}", { item: itemLabel })}</button>
      {field.key === "readonlyBags" && fieldState.tabId === "wikis" && templateRecord ? (
        <div class="field-callout">
          <p>{t("Readonly bags from template")}</p>
          <ul class="value-list">
            {templateReadonlyBagLines.length ? templateReadonlyBagLines.map((bag) => <li>{bag}</li>) : <li>{t("No template readonly bags")}</li>}
          </ul>
        </div>
      ) : null}
      {field.key === "plugins" && fieldState.tabId === "wikis" && templateRecord ? (
        <div class="field-callout">
          <p>{t("Plugins from template")}</p>
          <ul class="value-list">
            {templatePluginLines.map((plugin) => <li>{plugin}</li>)}
            {templateCorePluginsEnabled ? <li>{t("core plugins")}</li> : <li>{t("core plugins disabled")}</li>}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function renderPermissionTableFieldViewer(ctx: ReadonlyFieldContext<readonly PermissionRow[]>) {
  const permissionRows = ctx.value;
  if (!permissionRows.length) {
    return <div class="field-callout"><p>{t("No permissions assigned.")}</p></div>;
  }
  return <table class="value-table">
    {permissionRows.map((row) => (
      <tr>
        <td>{row.role || "—"}</td>
        <td><span class="pill-value pill-value-small">{formatPermissionLevel(row.level)}</span></td>
      </tr>
    ))}
  </table>;
}

function renderPermissionTableFieldEditor(ctx: FieldEditorContext<readonly PermissionRow[]>) {
  const { field, disabled, fieldState, itemsByTab, inputId, onDraftChange, onTransientPermissionRowsChange } = ctx;
  if (field.mode === "server" || field.mode === "") {
    return renderPermissionTableFieldViewer(ctx);
  }
  const permissionRows = ctx.value;
  const lookupOptions = getLookupOptions(field.key, itemsByTab);
  const availableLevels = getPermissionLevelsForField(field.key);
  const transientPermissionRows = fieldState.transientPermissionRows[field.key] ?? [];
  const displayedPermissionRows = permissionRows.length || transientPermissionRows.length
    ? [...permissionRows, ...transientPermissionRows]
    : [{ role: "", level: availableLevels[0] as PermissionLevel }];

  const persistPermissionRows = (rows: PermissionRow[]) => {
    const persistedRows = rows.filter((row) => row.role.trim());
    const nextTransientRows = rows.filter((row) => !row.role.trim());
    onDraftChange(field.key, permissionRowsCodec.stringify(persistedRows));
    onTransientPermissionRowsChange(field.key, nextTransientRows);
  };

  return (
    <div class="row-editor-stack">
      {displayedPermissionRows.map((row, index) => (
        <div key={`${field.key}-permission-${index}`} class="row-editor-row row-editor-row-wide row-editor-row-permission">
          {renderSearchableInput({
            id: `${inputId}-${index}-role`,
            currentValue: row.role,
            placeholder: t("Role"),
            options: lookupOptions,
            disabled: ctx.disabled,
            onInput: (nextValue) => {
              const nextRows = [...displayedPermissionRows];
              nextRows[index] = { ...row, role: nextValue };
              persistPermissionRows(nextRows);
            },
          })}
          <select class="field-select" onchange={(event) => {
            if (disabled) return;
            const nextRows = [...displayedPermissionRows];
            nextRows[index] = { ...row, level: (event.currentTarget as HTMLSelectElement).value as PermissionLevel };
            persistPermissionRows(nextRows);
          }} disabled={disabled}>
            {availableLevels.map((level) => <option key={`${field.key}-${index}-${level}`} value={level} selected={level === row.level}>{formatPermissionLevel(level)}</option>)}
          </select>
          <button type="button" class="row-action-button" disabled={disabled} onclick={() => {
            const nextRows = [...displayedPermissionRows];
            nextRows.splice(index, 1);
            persistPermissionRows(nextRows);
          }}>{t("Remove")}</button>
        </div>
      ))}
      <button type="button" class="ghost-button" disabled={disabled} onclick={() =>
        onTransientPermissionRowsChange(field.key, [...transientPermissionRows, {
          role: "", level: availableLevels[0] as PermissionLevel
        }])}>{t("Add permission")}</button>
    </div>
  );
}

const defaultPrefixPill = <div class="prefix-bag-sidebar-pill">{t("default")}</div>;

function hasPrefixTrimMismatch(value: string): boolean {
  return value.trim() !== value;
}

function renderPrefixMappingRows(displayedMappingRows: readonly WritablePrefixRow[]) {
  return <table class="value-table">
    {displayedMappingRows.map((row) => (
      <tr>
        <td>{row.prefix ? <code>{'"' + row.prefix + '"'}</code> : defaultPrefixPill}</td>
        <td>{row.bagName}</td>
      </tr>
    ))}
  </table>;
}

function renderPrefixTableFieldSidebar(ctx: ReadonlyFieldContext<any>): JSX.Node {
  definitely<WritablePrefixRow[]>(ctx.value);
  return <dl class="prefix-bag-sidebar">
    {ctx.value.map((entry) => <>
      <dt class="prefix-bag-sidebar-term">{entry.prefix ? <span class="prefix-bag-sidebar-prefix">"{textWithSlashes(entry.prefix)}"</span> : defaultPrefixPill}</dt>
      <dd class="prefix-bag-sidebar-value">{textWithSlashes(entry.bagName)}</dd>
    </>)}
  </dl>;
}

function renderPrefixTableFieldEditor(ctx: FieldEditorContext<any>) {
  const { field, value, disabled, fieldState, itemsByTab, inputId, onDraftChange, onPendingRowsChange } = ctx;
  const forDisplay = field.mode === "server";
  definitely<WritablePrefixRow[]>(value);
  const mappingRows = value;
  const pendingRowCount = fieldState.pendingRows[field.key] ?? 0;
  const lookupOptions = getLookupOptions(field.key, itemsByTab);
  const displayedMappingRows = mappingRows.length
    ? [...mappingRows, ...Array.from({ length: pendingRowCount }, () => ({ prefix: "", bagName: "" }))]
    : [{ prefix: "", bagName: "" }, ...Array.from({ length: pendingRowCount }, () => ({ prefix: "", bagName: "" }))];
  const templateRecord = is<WikiAdminRecord>(fieldState.draft, fieldState.tabId === "wikis")
    ? findTemplateRecordForWikiRecord(fieldState.draft, itemsByTab) : undefined;
  const inheritedRoutingRows = fieldState.tabId === "wikis" && templateRecord ? templateRecord.writablePrefixBags : [];

  if (forDisplay) {
    return renderPrefixMappingRows(displayedMappingRows);
  }
  return (
    <div class="row-editor-stack">
      {displayedMappingRows.map((row, index) => (
        <div class="row-editor-row row-editor-row-wide">
          <div class="prefix-input-shell">
            <input class={hasPrefixTrimMismatch(row.prefix) ? "field-input is-invalid" : "field-input"}
              type="text"
              value={row.prefix}
              placeholder={t("Prefix, leave blank for default")}
              aria-invalid={hasPrefixTrimMismatch(row.prefix) ? "true" : undefined}
              title={hasPrefixTrimMismatch(row.prefix) ? t("Prefix has leading or trailing whitespace. Is this intentional?") : undefined}
              disabled={disabled}
              oninput={(event) => {
                const element = event.currentTarget as HTMLInputElement;
                const hadStoredRow = index < mappingRows.length;
                const nextRows = mappingRows.length ? [...mappingRows] : [{ prefix: "", bagName: "" }];
                nextRows[index] = { ...row, prefix: element.value };
                onDraftChange(field.key, nextRows);
                if (!hadStoredRow && (element.value || row.bagName.trim())) onPendingRowsChange(field.key, (count) => count - 1);
              }} ref={(element) => {
                if (element.value !== row.prefix) element.value = row.prefix;
              }} />
            {hasPrefixTrimMismatch(row.prefix) ? <span
              class="prefix-input-alert missing-marker"
              aria-label={t("Prefix has leading or trailing whitespace")}
              title={t("Prefix has leading or trailing whitespace. Is this intentional?")}
            ><MaterialSymbol icon={warningIcon} /></span> : null}
          </div>
          {renderSearchableInput({
            id: `${inputId}-${index}-target`,
            currentValue: row.bagName,
            placeholder: t("Target bag"),
            options: lookupOptions,
            disabled: ctx.disabled,
            onInput: (nextValue) => {
              const hadStoredRow = index < mappingRows.length;
              const nextRows = mappingRows.length ? [...mappingRows] : [{ prefix: "", bagName: "" }];
              nextRows[index] = { ...row, bagName: nextValue };
              onDraftChange(field.key, nextRows);
              if (!hadStoredRow && (row.prefix || nextValue.trim())) onPendingRowsChange(field.key, (count) => count - 1);
            },
          })}
          {<button type="button" class="row-action-button" disabled={disabled} onclick={() => {
            if (index >= mappingRows.length) {
              onPendingRowsChange(field.key, (count) => count - 1);
              return;
            }
            const nextRows = mappingRows.length ? [...mappingRows] : [];
            nextRows.splice(index, 1);
            onDraftChange(field.key, nextRows);
          }}>{t("Remove")}</button>}
        </div>
      ))}
      {<button type="button" class="ghost-button" disabled={disabled} onclick={() => onPendingRowsChange(field.key, (count) => count + 1)}>{t("Add prefix rule")}</button>}
      {inheritedRoutingRows.length ? (
        <div class="field-callout">
          <p>{t("Writable bags inherited from template:")}</p>
          {renderPrefixMappingRows(buildEffectivePrefixObject([mappingRows, inheritedRoutingRows]))}
        </div>
      ) : null}
    </div>
  );
}

function renderAutocompleteFieldSidebar(ctx: ReadonlyFieldContext<any>) {
  return ctx.value ?? "";
}

function renderAutocompleteFieldEditor(ctx: FieldEditorContext<any>) {
  const { field, value, disabled, itemsByTab, inputId, onDraftChange } = ctx;
  const datalistId = `${inputId}-options`;
  const optionMap = new Map(itemsByTab.templates.map((entry) => [entry.name, entry.id]));

  return (
    <>
      <input id={inputId} class="field-input" type="text" value={value ?? ""} disabled={disabled}
        ref={(element) => {
          if (value && element.value !== value) element.value = value;
        }}
        list={datalistId}
        oninput={(event) => {
          const name = event.currentTarget.value;
          if (!name) return event.preventDefault();
          onDraftChange(field.key, name);
        }}
      />
      <datalist id={datalistId}>
        {Array.from(optionMap.keys(), (option) => <option value={option} />)}
      </datalist>
    </>
  );
}

function computeResolverPreview(draft: WikiAdminRecord, title: string) {
  const normalizedTitle = title.trim();
  const targets = draft.effectiveWritableBags.filter((row) => row.bagName).sort((a, b) => b.prefix.length - a.prefix.length);
  const writeTarget = normalizedTitle
    ? (targets.find((target) => target.prefix && normalizedTitle.startsWith(target.prefix)) ?? targets.find((target) => target.prefix === ""))
    : undefined;
  return {
    title: normalizedTitle,
    writeTo: writeTarget?.bagName ?? "No writable target",
    matchedPrefix: writeTarget ? (writeTarget.prefix || "default") : "none",
  };
}

function renderResolverPreviewFieldEditor(ctx: FieldEditorContext<any>) {
  const { fieldState, inputId, onResolverTitleChange } = ctx;
  definitely<WikiAdminRecord>(fieldState.draft);
  const preview = computeResolverPreview(fieldState.draft, fieldState.resolverTitle);
  return (
    <div class="tool-panel resolver-tool">
      <label class="field-label" for={inputId}>{t("Title to test")}</label>
      <input id={inputId} class="field-input" type="text" value={fieldState.resolverTitle} ref={(element) => {
        if (element.value !== fieldState.resolverTitle) element.value = fieldState.resolverTitle;
      }} oninput={(event) => onResolverTitleChange((event.currentTarget as HTMLInputElement).value)} />
      <div class="resolver-grid">
        <div class="resolver-stat">
          <span>{t("Matched prefix")}</span>
          <strong>{preview.matchedPrefix}</strong>
        </div>
        <div class="resolver-stat">
          <span>{t("Write target")}</span>
          <strong>{preview.writeTo}</strong>
        </div>
      </div>
      <div class="field-callout">
        <p>{preview.title ? t("Resolver would test the title against the longest matching prefix rule, then fall back to the default target if no explicit prefix matches. Final reads and write permission depend on live server state and are not shown here.") : t("Enter a title to preview how this wiki would route it.")}</p>
      </div>
    </div>
  );
}

function renderValueListFieldSidebar(ctx: ReadonlyFieldContext<any>) {
  const lines = typeof ctx.value === "string"
    ? lineListCodec.parse(ctx.value)
    : ctx.value as readonly string[];
  return renderLinesList(lines, ctx.field.key, ctx.itemsByTab);
}

type FieldTypeRenderEditor = ((ctx: FieldEditorContext<any>) => JSX.Node) | null;
type FieldTypeRenderSidebar = ((ctx: ReadonlyFieldContext<any>) => JSX.Node) | null;


class LineListCodec {
  public parse(value: string): string[] {
    if (!value.trim()) return [];
    return value.split("\n").map((entry) => entry.trim()).filter(Boolean);
  }

  public stringify(lines: string[]): string {
    return lines.map((line) => line.trim()).filter(Boolean).join("\n");
  }
}

class PermissionRowsCodec {
  public parse(value: PermissionRow[]): PermissionRow[] {
    return JSON.parse(JSON.stringify(value), jsonReviver);
  }

  public stringify(value: PermissionRow[]): PermissionRow[] {
    return JSON.parse(JSON.stringify(value), jsonReviver);
  }
}

export const lineListCodec = new LineListCodec();
export const permissionRowsCodec = new PermissionRowsCodec();




export const fieldTypeRenderEditors = {
  "string": (ctx) => renderTextInputField(ctx, "text"),
  "version": (ctx) => renderTextInputField(ctx, "text"),
  "number": (ctx) => renderTextInputField(ctx, "number"),
  "text": (ctx) => renderTextareaField(ctx, 4),
  "enter-password": (ctx) => renderTextInputField(ctx, "password"),
  "confirm-password": renderConfirmPasswordFieldEditor,
  "search-multiselect": renderSearchMultiselectFieldEditor,
  "search-optional": renderSearchFieldEditor,
  "permission-table": renderPermissionTableFieldEditor,
  "prefix-table": renderPrefixTableFieldEditor,
  "select": renderSelectField,
  "switch": renderSwitchField,
  "search": renderAutocompleteFieldEditor,
  "resolver-preview": renderResolverPreviewFieldEditor,
  "parameter-list": renderValueListFieldSidebar,
  "relationship-table": renderValueListFieldSidebar,
  "summary-list": renderValueListFieldSidebar,
  "activity-feed": renderActivityFeedField,
  "metadata-table": renderMetadataTableField,
  "table": renderTableField,
  "structured-preview": renderCalloutField,
  "validation-report": renderCalloutField,
  "template-type": (ctx) => null,
} satisfies Record<FieldType, FieldTypeRenderEditor>;

export const fieldTypeRenderSidebars = {
  "string": renderPreField,
  "version": renderPreField,
  "number": renderPreField,
  "text": renderPreField,
  "enter-password": () => null,
  "confirm-password": () => null,
  "search-multiselect": renderSearchMultiselectFieldSidebar,
  "search-optional": renderSearchFieldSidebar,
  "permission-table": renderPermissionTableFieldViewer,
  "prefix-table": renderPrefixTableFieldSidebar,
  "select": () => null,
  "switch": () => null,
  "search": renderAutocompleteFieldSidebar,
  "resolver-preview": () => null,
  "parameter-list": renderValueListFieldSidebar,
  "relationship-table": renderValueListFieldSidebar,
  "summary-list": renderValueListFieldSidebar,
  "activity-feed": renderActivityFeedField,
  "metadata-table": renderMetadataTableField,
  "table": renderTableField,
  "structured-preview": renderCalloutField,
  "validation-report": renderCalloutField,
  "template-type": () => null,
} satisfies Record<FieldType, FieldTypeRenderSidebar>;
