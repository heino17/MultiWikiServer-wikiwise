import { addstyles, customElement, JSXElement } from "@tiddlywiki/jsx-lit";
import warningIcon from "@material-symbols/svg-400/outlined/warning.svg";
import { MaterialSymbol } from "./material-symbol";



declare global {
  interface MyCustomElements {
    "display-content": JSX.SimpleAttrs<{}, DisplayContent>;
  }
}

@addstyles(`:host{ display: contents; }`)
@customElement("display-content")
export class DisplayContent extends JSXElement {}

export function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** Byte count as a short human string, shared by the storage, file and
 *  wiki-file panels so all three round the same way. */
export function prettifyBytes(bytes: number): string {
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

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

// Server `details.reason`-→ i18n-Schlüssel für die gängigen Admin-Operationen.
export const STORAGE_ERROR_REASON_KEYS: Record<string, string> = {
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
  // Wiki-Datei-Import: Meldungen aus WikiFileRoutes.ts und WikiFileImport.ts.
  "The file is larger than this server accepts.": "The file is larger than this server accepts.",
  "No file was uploaded.": "No file was uploaded.",
  "This is not a TiddlyWiki file (no application-name meta tag).": "This is not a TiddlyWiki file.",
  "This is not a TiddlyWiki file (no tiddlywiki-version meta tag).": "This is not a TiddlyWiki file.",
  "This TiddlyWiki file has no tiddler store, so it holds no tiddlers.": "This TiddlyWiki file holds no tiddlers.",
  "The tiddler store of this file could not be read.": "The tiddler store of this file could not be read.",
  "The tiddler store of this file is empty, so there is nothing to import.": "The tiddler store of this file is empty.",
  "This is a TiddlyWiki 2 file. MWS holds TiddlyWiki 5 tiddlers: save the wiki with TiddlyWiki 5 first.":
    "This is a TiddlyWiki 2 file. Save the wiki with TiddlyWiki 5 first.",
  "This wiki is password protected. Remove the password protection in TiddlyWiki and save it again.":
    "This wiki is password protected. Remove the password protection and save it again.",
  "This snapshot does not belong to that wiki.": "This snapshot does not belong to that wiki.",
  "There is no such snapshot.": "There is no such snapshot.",
};

// Variablen Gründe (mit dynamischen Wiki-/Bag-/Rollen-/Tab-Namen) per Präfix:
export const STORAGE_ERROR_REASON_PREFIX_KEYS: ReadonlyArray<readonly [string, string]> = [
  ["You are not allowed to assign the", "You are not allowed to assign this role."],
  ["The system role '", "System roles cannot be deleted."],
  ["Only the user who created this ", "Only the user who created this entry may edit it."],
  ["You don't have permission to create ", "You do not have permission to create this entry."],
  ["You don't have permission to modify ", "You do not have permission to modify this entry."],
  ["You have reached your limit of", "You have reached your own wiki limit."],
  ["Replacing the wiki \"", "Replacing a wiki needs administrator rights. A merge only adds tiddlers."],
  ["A wiki with the slug \"", "A wiki with this name already exists. Choose another name."],
  ["The bag \"", "You cannot write to this bag."],
  ["The wiki \"", "This wiki cannot be edited this way."],
  ["The value of \"", "This value is not a number between 1 and 1000."],
  ["The file holds ", "This file holds too many tiddlers."],
];

// Fallback je `reason`-Code, wenn keine Detail-Nachricht bekannt ist:
const GENERIC_ERROR_REASON_KEYS: Record<string, string> = {
  "ACCESS_DENIED": "Access denied.",
  "RECORD_KEY_NOT_FOUND": "The record was not found.",
  "RECORD_NOT_FOUND": "The record was not found.",
  "RECIPE_NO_READ_PERMISSION": "You do not have permission to open this wiki.",
  "BAG_NO_READ_PERMISSION": "You do not have permission to open this wiki.",
  "RECIPE_NOT_FOUND": "The wiki was not found.",
  "WIKI_FILE_REJECTED": "This file is not a wiki file that can be imported.",
  "WIKI_FILE_INVALID": "This wiki file cannot be used here.",
  "WIKI_FILE_TOO_LARGE": "This file is too large for this server.",
};

export function formatStorageErrorForDisplay(storageError: string, translate: TranslateFn): string {
  if (!storageError) return storageError;

  try {
    const parsed = JSON.parse(storageError) as {
      reason?: unknown;
      details?: { reason?: unknown; prettyErrors?: unknown; maxBytes?: unknown };
    };
    const detailReason = typeof parsed.details?.reason === "string" ? parsed.details.reason : "";
    const reasonCode = typeof parsed.reason === "string" ? parsed.reason : "";
    const prettyText = typeof parsed.details?.prettyErrors === "string"
      ? parsed.details.prettyErrors
      : "";

    if (detailReason) {
      const exact = STORAGE_ERROR_REASON_KEYS[detailReason];
      if (exact) {
        return typeof parsed.details?.maxBytes === "number"
          ? translate(exact, { maxBytes: String(parsed.details.maxBytes) })
          : translate(exact);
      }
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

export function renderErrorBanner(message: string, dismissAction?: { label: string; onclick: () => void } | null) {
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