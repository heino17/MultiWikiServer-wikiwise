import { IdString } from "@mws/admin-vanilla/src/definition/tabs";
import { ServerRequest } from "@tiddlywiki/server";
import { TiddlerFields } from "tiddlywiki";
import { ParsedWikiFile, WikiFileStore } from "./WikiFileImport";
import { WikiStore } from "./RecipeResolver";
import {
  SnapshotBag,
  createSnapshotBag,
  readSnapshotTiddlers,
} from "./WikiSnapshotBag";

/**
 * The write side of a single-file TiddlyWiki import, shared by the CLI
 * (import-wiki-folder's HTML sibling, new-commands/import-wiki-file.ts) and the
 * admin route.
 *
 * A replace only ever touches one bag, the wiki's default write target: bags
 * shared with other wikis keep their content, and the recipe, its permissions
 * and its plugins are left alone. That is the same shape as load-wiki-folder,
 * except that the tiddlers come from a file instead of a wiki folder.
 */

export type WikiImportMode = "replace" | "merge";

export interface WikiImportTarget {
  /** Only used to route the tiddler events to the wiki's connected clients. */
  recipeId?: IdString;
  bagId: IdString;
  bagName: string;
}

export interface WikiImportPlan {
  target: WikiImportTarget;
  mode: WikiImportMode;
  kind: "tw5" | "tw5x";
  twVersion: string;
  store: WikiFileStore;
  sizeBytes: number;
  includeSystem: boolean;
  /** Titles left out because they are system tiddlers. */
  skippedSystemTitles: string[];
  /** Plugin titles left out; plugins never enter a bag, not even on request. */
  skippedPluginTitles: string[];
  /** How many tiddlers the file offers for writing. */
  fileTiddlerCount: number;
  /** Tiddlers currently in the target bag. */
  existingCount: number;
  created: string[];
  updated: string[];
  unchanged: string[];
  /** Only filled in replace mode: the tiddlers the file does not contain. */
  deleted: string[];
  /**
   * System tiddlers of the bag that a replace keeps anyway. They configure the
   * wiki as a whole ($:/SiteTitle, $:/DefaultTiddlers) and belong to MWS, so
   * they are never deleted just because an uploaded file has none.
   */
  keptSystemTitles: string[];
}

export interface WikiImportResult {
  written: number;
  deleted: number;
  unchanged: number;
  snapshot?: SnapshotBag;
}

/** The bag a wiki writes to by default: the one under the empty title prefix. */
export function defaultWriteTargetBag(recipe: {
  id: string;
  definition: PrismaJson.Recipe_definition | null;
}): string | undefined {
  return recipe.definition?.writablePrefixBags?.find(row => row.prefix === "")?.bagName;
}

export async function planTiddlers(prisma: PrismaTxnClient, options: {
  tiddlers: readonly TiddlerFields[];
  target: WikiImportTarget;
  mode: WikiImportMode;
  file?: Partial<WikiImportPlan> & { includeSystem?: boolean };
}): Promise<WikiImportPlan> {
  const { tiddlers, target, mode } = options;

  const existing = await prisma.tiddler.findMany({
    where: { bag_id: IdString.cast(target.bagId) },
    select: { title: true, fields: true },
  });
  const existingByTitle = new Map(existing.map(row => [row.title, row.fields]));

  const created: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];
  for (const tiddler of tiddlers) {
    const before = existingByTitle.get(tiddler.title);
    if (!before) {
      created.push(tiddler.title);
    } else if (JSON.stringify(before) === JSON.stringify(tiddler)) {
      unchanged.push(tiddler.title);
    } else {
      updated.push(tiddler.title);
    }
    existingByTitle.delete(tiddler.title);
  }
  // Whatever is left in the bag is not in the file: a replace deletes it, a
  // merge keeps it. System tiddlers are never deleted (see WikiImportPlan).
  const missing = Array.from(existingByTitle.keys());
  const deleted = mode === "replace" ? missing.filter(title => !title.startsWith("$:/")).sort() : [];
  const keptSystemTitles = missing.filter(title => title.startsWith("$:/")).sort();

  return {
    target,
    mode,
    kind: options.file?.kind ?? "tw5",
    twVersion: options.file?.twVersion ?? "",
    store: options.file?.store ?? "json",
    sizeBytes: options.file?.sizeBytes ?? 0,
    includeSystem: !!options.file?.includeSystem,
    skippedSystemTitles: options.file?.skippedSystemTitles ?? [],
    skippedPluginTitles: options.file?.skippedPluginTitles ?? [],
    fileTiddlerCount: tiddlers.length,
    existingCount: existing.length,
    created: created.sort(),
    updated: updated.sort(),
    unchanged,
    deleted,
    keptSystemTitles,
  };
}

/**
 * Compares the file against the target bag without writing anything: what a
 * --dry-run prints and what the admin dialog confirms.
 */
export async function planWikiFileImport(prisma: PrismaTxnClient, options: {
  parsed: ParsedWikiFile;
  target: WikiImportTarget;
  mode: WikiImportMode;
  includeSystem?: boolean;
}): Promise<WikiImportPlan> {
  return planTiddlers(prisma, {
    tiddlers: options.parsed.tiddlers,
    target: options.target,
    mode: options.mode,
    file: {
      ...options.parsed,
      includeSystem: options.includeSystem,
    },
  });
}

/**
 * Writes tiddlers into the bag the plan was made for. In replace mode the bag is
 * copied into a snapshot bag first, inside the caller's transaction, so an
 * import that fails halfway leaves both the wiki and the snapshots untouched.
 */
export async function applyTiddlers(prisma: PrismaTxnClient, options: {
  tiddlers: readonly TiddlerFields[];
  plan: WikiImportPlan;
  user: ServerRequest["user"];
  /** The wiki slug, used to group the snapshots of one wiki. */
  slug: string;
  /** Recorded in the snapshot: what is about to overwrite the bag. */
  source: string;
  snapshotKeep?: number;
}): Promise<WikiImportResult> {
  const { plan } = options;
  const store = new WikiStore(prisma);
  const bagId = new IdString(plan.target.bagId.toString());
  const recipeId = plan.target.recipeId;

  let snapshot: SnapshotBag | undefined;
  if (plan.mode === "replace" && plan.existingCount > 0) {
    const existing = await prisma.tiddler.findMany({
      where: { bag_id: IdString.cast(bagId) },
      select: { title: true, fields: true },
    });
    snapshot = await createSnapshotBag(prisma, {
      user: options.user,
      slug: options.slug,
      sourceBagId: bagId,
      sourceBagName: plan.target.bagName,
      source: options.source,
      tiddlers: existing,
      ...(options.snapshotKeep === undefined ? {} : { keep: options.snapshotKeep }),
    });
  }

  // Unchanged tiddlers keep their row and their revision: the file agrees with
  // what is stored, so there is nothing to write.
  const skip = new Set(plan.unchanged);
  let written = 0;
  for (const fields of options.tiddlers) {
    if (skip.has(fields.title)) continue;
    await store.saveTiddler({
      ...(recipeId ? { recipe_id: recipeId } : {}),
      bag_id: bagId,
      fields,
    });
    written++;
  }

  let deleted = 0;
  for (const title of plan.deleted) {
    await store.deleteTiddler({
      ...(recipeId ? { recipe_id: recipeId } : {}),
      bag_id: bagId,
      title,
    });
    deleted++;
  }

  return {
    written,
    deleted,
    unchanged: plan.unchanged.length,
    ...(snapshot ? { snapshot } : {}),
  };
}

/** The tiddler fields of a parsed wiki file, ready to be written. */
export async function applyWikiFileImport(prisma: PrismaTxnClient, options: {
  parsed: ParsedWikiFile;
  plan: WikiImportPlan;
  user: ServerRequest["user"];
  slug: string;
  source: string;
  snapshotKeep?: number;
}): Promise<WikiImportResult> {
  return applyTiddlers(prisma, { ...options, tiddlers: options.parsed.tiddlers });
}

/**
 * Copies a snapshot bag back into a wiki's default write target. The bag is
 * snapshotted before that too, so a restore can be undone like an import.
 */
export async function restoreSnapshotBag(prisma: PrismaTxnClient, options: {
  snapshotBagName: string;
  target: WikiImportTarget;
  user: ServerRequest["user"];
  slug: string;
  snapshotKeep?: number;
}): Promise<WikiImportResult> {
  const tiddlers = await readSnapshotTiddlers(prisma, options.snapshotBagName);

  const plan = await planTiddlers(prisma, { tiddlers, target: options.target, mode: "replace" });

  return applyTiddlers(prisma, {
    tiddlers,
    plan,
    user: options.user,
    slug: options.slug,
    source: `restore of ${options.snapshotBagName}`,
    ...(options.snapshotKeep === undefined ? {} : { snapshotKeep: options.snapshotKeep }),
  });
}