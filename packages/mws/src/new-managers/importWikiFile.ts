import { IdString } from "@mws/admin-vanilla/src/definition/tabs";
import { ServerRequest } from "@tiddlywiki/server";
import { TiddlerFields } from "tiddlywiki";
import { ParsedWikiFile, WikiFilePluginSkip, WikiFileStore } from "./WikiFileImport";
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
  /** Whether the file's core plugins were asked for and written. */
  includePlugins: boolean;
  /** Titles left out because they are system tiddlers. */
  skippedSystemTitles: string[];
  /** Plugin titles written into the bag, at the wiki's own version. */
  keptPluginTitles: string[];
  /** Plugin titles left out, each with the reason. */
  skippedPlugins: WikiFilePluginSkip[];
  /** Session and build state that was dropped while reading the file. */
  skippedTransientTitles: string[];
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
  /** What happens to the file's language. */
  language?: WikiImportPlanLanguage;
  /**
   * Titles the file offers that are deliberately not written, each with the
   * reason. The write step skips them, so the plan and the write cannot drift
   * apart.
   */
  dropped: { title: string; reason: string }[];
}

/**
 * The language of the file and what the target wiki makes of it. Language packs
 * are the one plugin type a file may bring (MWS keeps them in the bag, not in
 * the recipe), but a file can name a language it does not ship - then
 * $:/language would point at nothing and the plugin switcher would quietly fall
 * back to English.
 */
export interface WikiImportPlanLanguage {
  wanted: string;
  /** The pack that comes with the file. */
  packTitle?: string;
  /** Whether the wiki speaks this language after the import. */
  delivered: boolean;
  /** Why not, when delivered is false: the system tiddlers are off, or the pack is missing. */
  reasonCode?: "not-wanted" | "no-pack";
  /** The same, said for a person. */
  reason?: string;
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
  /**
   * Whether the target's own `$:/` tiddlers survive a replace. True for an
   * import, where they configure the wiki as a whole and a file that stays
   * silent about them must not wipe them. False for a restore, which has to
   * reproduce the snapshot instead of merging into the wiki.
   */
  keepTargetSystem?: boolean;
}): Promise<WikiImportPlan> {
  const { tiddlers, target, mode } = options;
  const keepTargetSystem = options.keepTargetSystem ?? true;

  const existing = await prisma.tiddler.findMany({
    where: { bag_id: IdString.cast(target.bagId) },
    select: { title: true, fields: true },
  });
  const existingByTitle = new Map(existing.map(row => [row.title, row.fields]));

  const created: string[] = [];
  const updated: string[] = [];
  const unchanged: string[] = [];
  const dropped = options.file?.dropped ?? [];
  const droppedTitles = new Set(dropped.map(row => row.title));
  for (const tiddler of tiddlers) {
    // A dropped title is left alone completely: it is neither written nor
    // counted, and it stays in existingByTitle so a replace cannot claim it.
    if (droppedTitles.has(tiddler.title)) continue;
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
  // merge keeps it. An import protects the target's system tiddlers, a restore
  // does not (see keepTargetSystem).
  const missing = Array.from(existingByTitle.keys());
  const deleted = mode === "replace"
    ? (keepTargetSystem ? missing.filter(title => !title.startsWith("$:/")) : missing).sort()
    : [];
  const keptSystemTitles = !keepTargetSystem || options.file?.includeSystem
    ? []
    : missing.filter(title => title.startsWith("$:/")).sort();

  return {
    target,
    mode,
    kind: options.file?.kind ?? "tw5",
    twVersion: options.file?.twVersion ?? "",
    store: options.file?.store ?? "json",
    sizeBytes: options.file?.sizeBytes ?? 0,
    includeSystem: !!options.file?.includeSystem,
    includePlugins: !!options.file?.includePlugins,
    skippedSystemTitles: options.file?.skippedSystemTitles ?? [],
    keptPluginTitles: options.file?.keptPluginTitles ?? [],
    skippedPlugins: options.file?.skippedPlugins ?? [],
    skippedTransientTitles: options.file?.skippedTransientTitles ?? [],
    fileTiddlerCount: tiddlers.length,
    existingCount: existing.length,
    created: created.sort(),
    updated: updated.sort(),
    unchanged,
    deleted,
    keptSystemTitles,
    dropped,
    ...(options.file?.language ? { language: options.file.language } : {}),
  };
}

/**
 * Decides what becomes of the file's $:/language. A $:/language that points at a
 * pack nobody has would leave the wiki quietly in English, so in that case the
 * wish is dropped and the reason is reported - the target keeps its own language.
 */
async function resolveLanguage(prisma: PrismaTxnClient, options: {
  parsed: ParsedWikiFile;
  target: WikiImportTarget;
  includeSystem: boolean;
}): Promise<{ language?: WikiImportPlanLanguage; dropped: { title: string; reason: string }[] }> {
  const { parsed, target, includeSystem } = options;
  if (!parsed.language) return { dropped: [] };
  const { wanted, packTitle, inCore } = parsed.language;
  if (!includeSystem) {
    // Nothing of the file's settings travels, so the target keeps its language.
    return {
      language: {
        wanted,
        ...(packTitle ? { packTitle } : {}),
        delivered: false,
        reasonCode: "not-wanted",
        reason: "The file's system tiddlers are not imported, so the wiki keeps its own language.",
      },
      dropped: [],
    };
  }
  const alreadyThere = await prisma.tiddler.findFirst({
    where: { bag_id: IdString.cast(target.bagId), title: wanted },
    select: { title: true },
  });
  if (packTitle || inCore || alreadyThere) {
    return {
      language: { wanted, ...(packTitle ? { packTitle } : {}), delivered: true },
      dropped: [],
    };
  }
  const reason = `The file wants the language "${wanted}" but does not contain the language pack, and the target wiki does not have it either. The wiki keeps its own language.`;
  return {
    language: { wanted, delivered: false, reasonCode: "no-pack", reason },
    dropped: [{ title: "$:/language", reason }],
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
  /** Only used when the parsed file does not know it; the parse decides. */
  includePlugins?: boolean;
}): Promise<WikiImportPlan> {
  const includeSystem = !!options.includeSystem;
  const { language: _fileLanguage, ...parsedFile } = options.parsed;
  const { language, dropped } = await resolveLanguage(prisma, {
    parsed: options.parsed,
    target: options.target,
    includeSystem,
  });
  return planTiddlers(prisma, {
    tiddlers: options.parsed.tiddlers,
    target: options.target,
    mode: options.mode,
    file: {
      ...parsedFile,
      includeSystem,
      includePlugins: options.includePlugins ?? !!parsedFile.includePlugins,
      dropped,
      ...(language ? { language } : {}),
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
  // what is stored, so there is nothing to write. The same holds for what the
  // plan deliberately left out.
  const skip = new Set([...plan.unchanged, ...plan.dropped.map(row => row.title)]);
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

  // A snapshot is a complete copy of this wiki's own bag, so the restore has to
  // reproduce it exactly - system tiddlers included. Leaving the ones the wiki
  // has gained since the snapshot behind is what made a restore look like a
  // mixture of the wiki and the snapshot.
  const plan = await planTiddlers(prisma, {
    tiddlers,
    target: options.target,
    mode: "replace",
    keepTargetSystem: false,
  });

  return applyTiddlers(prisma, {
    tiddlers,
    plan,
    user: options.user,
    slug: options.slug,
    source: `restore of ${options.snapshotBagName}`,
    ...(options.snapshotKeep === undefined ? {} : { snapshotKeep: options.snapshotKeep }),
  });
}