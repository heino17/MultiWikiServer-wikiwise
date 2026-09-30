// Shared list behaviour: search text normalisation and the tri-state sort
// cycle. Used by the generic record lists (Wikis, Templates, Bags, Roles,
// Users) and by the "My files" panel, so both filter and sort identically.

export type ListSortDirection = "asc" | "desc";

export type ListViewState = {
  /** Raw text of the search field; compared case-, accent- and eszett-insensitively. */
  query: string;
  /** Column key of the active sort; empty means "server order". */
  sortKey: string;
  sortDirection: ListSortDirection;
};

export const EMPTY_LIST_VIEW: ListViewState = { query: "", sortKey: "", sortDirection: "asc" };

/** Sort state after another click on `columnKey`: a different column starts
 *  ascending, the same column flips, a third click drops the sort and restores
 *  the original order. Takes the two sort fields rather than a `ListViewState`
 *  so callers without a search field can use it too. */
export function nextListSort(sortKey: string, sortDirection: ListSortDirection, columnKey: string): { sortKey: string; sortDirection: ListSortDirection } {
  if (sortKey !== columnKey) return { sortKey: columnKey, sortDirection: "asc" };
  if (sortDirection === "asc") return { sortKey: columnKey, sortDirection: "desc" };
  return { sortKey: "", sortDirection: "asc" };
}

/** Case-, accent- and eszett-insensitive search key, so "schuler" finds
 *  "Schüler" and "Strasse" finds "Straße". `normalize("NFD")` removes the
 *  diacritics but has no decomposition for "ß" (and none for the capital "ẞ",
 *  which `toLowerCase` turns into a lowercase "ß" first), so both are mapped
 *  to "ss" by hand. Without that, German search would miss the most common
 *  way of typing an umlaut-free substitute.
 *
 *  Sorting deliberately does *not* fold "ß": `localeCompare` does not either,
 *  and a sort order is a fixed order, while a search may be forgiving. */
export function normalizeListSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .trim();
}

/** Whether any of a row's cell values matches the query. */
export function listMatchesQuery(values: readonly unknown[], needle: string): boolean {
  if (!needle) return true;
  return values.some((value) => normalizeListSearchText(listValueToText(value)).includes(needle));
}

/** Text of an arbitrary cell value. Unlike a field formatter this never
 *  throws: numbers and booleans are rendered as text and unknown shapes are
 *  flattened, because it runs for every visible cell on every keystroke. */
export function listValueToText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(listValueToText).filter(Boolean).join(" ");
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(listValueToText).filter(Boolean).join(" ");
  }
  return String(value);
}

/** Sort key of a cell. Counts are numeric strings and dates are ISO strings, so
 *  both have to be recognised to sort "10 bags" after "9 bags" and dates
 *  chronologically instead of alphabetically. A real number (a byte count, for
 *  instance) is used as-is and never read back out of its formatted text. */
export function parseListSortValue(value: unknown): number | string | null {
  if (value == null) return null;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value !== "string") return listValueToText(value);
  const text = value.trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number(text);
  // The users tab shows "own wikis" as "3 / 5" (or "3 / ∞"); order by the
  // current usage, which is what the column is about.
  const usage = /^(\d+)\s*\//.exec(text);
  if (usage) return Number(usage[1]);
  if (/\d{4}-\d{2}-\d{2}/.test(text)) {
    const timestamp = Date.parse(text);
    if (!Number.isNaN(timestamp)) return timestamp;
  }
  return text;
}

/** Compares two raw cell values in the requested direction. An empty value is
 *  "unknown", not "smallest", so it sinks to the bottom in both directions
 *  instead of jumping to the top when sorting descending. Returns 0 for equal
 *  values; callers add their own stable tiebreak. */
export function compareListValues(left: unknown, right: unknown, direction: ListSortDirection): number {
  const factor = direction === "asc" ? 1 : -1;
  const leftValue = parseListSortValue(left);
  const rightValue = parseListSortValue(right);
  if (leftValue === null || rightValue === null) {
    if (leftValue === null && rightValue === null) return 0;
    return leftValue === null ? 1 : -1;
  }
  const result = typeof leftValue === "number" && typeof rightValue === "number"
    ? leftValue - rightValue
    : String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: "base" });
  return result * factor;
}
