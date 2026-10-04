import { IdString } from "@mws/admin-vanilla/src/definition/tabs";
import { ServerRequest } from "@tiddlywiki/server";
import { TiddlerFields } from "tiddlywiki";
import { BagImportWriter } from "./TabUpserts";

/**
 * Safety copy of a bag before it is replaced by an import.
 *
 * MWS keeps no content history: a tiddler's revision is the sequence number of
 * its event, not a previous version of its fields (WikiStore in
 * RecipeResolver.ts). Replacing a bag is therefore irreversible unless something
 * was copied first, so every replacing import writes one of these bags before it
 * writes anything.
 *
 * A snapshot bag is not referenced by any wiki recipe, so it never shows up as
 * wiki content. It stays visible (and deletable) in the bags tab, which is what
 * makes a restore possible without the CLI.
 */

export const SNAPSHOT_BAG_PREFIX = "snapshots/";

/** Metadata tiddlers inside a snapshot bag; never restored into a wiki. */
export const SNAPSHOT_META_PREFIX = "$:/mws/snapshot/";

export const DEFAULT_SNAPSHOT_KEEP = 10;

/**
 * How many snapshots *the user asked for* one wiki keeps.
 *
 * Separate from `DEFAULT_SNAPSHOT_KEEP` on purpose. The automatic snapshot is
 * taken a second before an import overwrites the bag, so it is the last way out
 * of that import. If it shared a budget with manual backups, then taking a
 * backup could drop the very snapshot one would want to keep — the oldest
 * automatic snapshot goes first, which is exactly the one taken longest ago. So
 * each kind is pruned against its own budget and the two never compete.
 */
export const MANUAL_SNAPSHOT_KEEP = 5;

/**
 * Marks a snapshot bag as one the user asked for, inside its own name.
 *
 * The name is the only thing `pruneSnapshotBags` looks at — sorting and
 * counting a wiki's snapshots must not open every bag to read its metadata.
 * The marker therefore has to live where pruning can see it for free. It sits
 * between the wiki prefix and the stamp, so a manual snapshot still sorts
 * chronologically *within* the manual ones and `snapshotStampOf` keeps
 * accepting it, because that guard only requires a single path segment.
 */
export const MANUAL_SNAPSHOT_MARKER = "manual-";

/**
 * What a manual snapshot records as its origin. A marker rather than a
 * sentence, because the restore dialog shows the origin and the store must not
 * hold one language's wording — the dialog translates it.
 */
export const MANUAL_SNAPSHOT_SOURCE = "manual";

export interface SnapshotBag {
  bagName: string;
  slug: string;
  created: string;
  sourceBagName: string;
  source: string;
  count: number;
  /** True when the user asked for this snapshot instead of an import taking it. */
  manual: boolean;
  /** Older snapshots of the same kind that the retention rule dropped. */
  pruned?: string[];
}

/** Whether a snapshot bag name belongs to a manual backup rather than an import. */
export function isManualSnapshotName(slug: string, bagName: string): boolean {
  return bagName.startsWith(snapshotBagPrefix(slug) + MANUAL_SNAPSHOT_MARKER);
}

export function snapshotBagPrefix(slug: string): string {
  return `${SNAPSHOT_BAG_PREFIX}${slug}/`;
}

/**
 * The guard the restore and the delete route share: a snapshot may only be
 * touched under the prefix of its own wiki, so an administrator of one wiki
 * cannot read another wiki's tiddlers by naming its bag here. Returns the
 * stamp, or null when the name belongs to another wiki or to a wiki further
 * down the path.
 */
export function snapshotStampOf(slug: string, bagName: string): string | null {
  const prefix = snapshotBagPrefix(slug);
  if (!bagName.startsWith(prefix)) return null;
  const stamp = bagName.slice(prefix.length);
  return stamp && !stamp.includes("/") ? stamp : null;
}

/** A fixed-width UTC stamp, so bag names sort chronologically. */
function snapshotStamp(date: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    pad(date.getUTCMilliseconds(), 3),
    "Z",
  ].join("");
}

async function bagIdOfName(prisma: PrismaTxnClient, name: string): Promise<IdString | undefined> {
  const bag = await prisma.bag.findUnique({ where: { name }, select: { id: true } });
  return bag ? new IdString(bag.id) : undefined;
}

async function dropBag(prisma: PrismaTxnClient, bagId: string): Promise<void> {
  await prisma.bagPermission.deleteMany({ where: { bag_id: bagId } });
  await prisma.tiddler.deleteMany({ where: { bag_id: bagId } });
  await prisma.bag.delete({ where: { id: bagId } });
}

/**
 * Copies the tiddlers of a bag into a fresh snapshot bag. Called inside the
 * caller's transaction, before the first delete, so a failing import leaves the
 * bag and every snapshot untouched.
 */
export async function createSnapshotBag(prisma: PrismaTxnClient, options: {
  user: ServerRequest["user"];
  /** The wiki the snapshot belongs to; keeps the bag names of one wiki together. */
  slug: string;
  /** The bag being copied. */
  sourceBagId: IdString;
  sourceBagName: string;
  /** What is about to happen, recorded in the snapshot ("import of foo.html"). */
  source: string;
  tiddlers: readonly { title: string; fields: PrismaJson.Tiddler_fields }[];
  /**
   * True when the user asked for this snapshot instead of an import taking one.
   * Picks the marker in the bag name and the retention budget; see
   * `MANUAL_SNAPSHOT_KEEP`.
   */
  manual?: boolean;
  keep?: number;
  now?: Date;
}): Promise<SnapshotBag> {
  const now = options.now ?? new Date();
  const created = now.toISOString();
  const prefix = snapshotBagPrefix(options.slug);
  const marker = options.manual ? MANUAL_SNAPSHOT_MARKER : "";
  const keep = options.keep ?? (options.manual ? MANUAL_SNAPSHOT_KEEP : DEFAULT_SNAPSHOT_KEEP);

  let bagName = prefix + marker + snapshotStamp(now);
  for (let attempt = 2; await bagIdOfName(prisma, bagName); attempt++) {
    bagName = `${prefix}${marker}${snapshotStamp(now)}-${attempt}`;
  }

  const writer = new BagImportWriter(prisma, false);
  await writer.checkExisting(new IdString(""), bagName, options.user, { allowCreate: true });
  const [bag] = await writer.upsert([{
    name: bagName,
    // An automatic snapshot names what is about to overwrite the bag, a manual
    // one has no such thing — "before a manual backup" would be nonsense.
    description: options.manual
      ? `Manual backup of "${options.slug}" (${options.tiddlers.length} tiddlers) taken ${created}`
      : `Snapshot of "${options.slug}" (${options.tiddlers.length} tiddlers) taken ${created} before ${options.source}`,
    permissions: [],
  }]);

  const bagId = IdString.cast(new IdString(bag.id));
  const meta: PrismaJson.Tiddler_fields[] = [
    { title: `${SNAPSHOT_META_PREFIX}wiki`, text: options.slug, type: "text/vnd.tiddlywiki" },
    { title: `${SNAPSHOT_META_PREFIX}created`, text: created, type: "text/vnd.tiddlywiki" },
    { title: `${SNAPSHOT_META_PREFIX}bag`, text: options.sourceBagName, type: "text/vnd.tiddlywiki" },
    { title: `${SNAPSHOT_META_PREFIX}source`, text: options.source, type: "text/vnd.tiddlywiki" },
    { title: `${SNAPSHOT_META_PREFIX}count`, text: `${options.tiddlers.length}`, type: "text/vnd.tiddlywiki" },
  ];
  // The bag belongs to no recipe, so nothing is listening for its tiddler
  // events: these rows are written directly instead of through WikiStore,
  // which would add one event row per tiddler for nobody.
  await prisma.tiddler.createMany({
    data: [
      ...meta.map(fields => ({ bag_id: bagId, title: fields.title, fields })),
      ...options.tiddlers.map(tiddler => ({ bag_id: bagId, title: tiddler.title, fields: tiddler.fields })),
    ],
  });

  const pruned = await pruneSnapshotBags(prisma, options.slug, keep, options.manual ? "manual" : "auto");

  return {
    bagName,
    slug: options.slug,
    created,
    sourceBagName: options.sourceBagName,
    source: options.source,
    count: options.tiddlers.length,
    manual: Boolean(options.manual),
    pruned,
  };
}

/**
 * Which snapshots a retention run may drop: only the ones an import took, only
 * the ones the user asked for, or both. "all" exists for the wiki deletion,
 * which has to leave no snapshot behind — a boolean could not say that, because
 * "unspecified" would have had to mean either "auto" or "all".
 */
export type SnapshotKind = "auto" | "manual" | "all";

/** Drops the oldest snapshots of a wiki, keeping the newest `keep` of them. */
export async function pruneSnapshotBags(prisma: PrismaTxnClient, slug: string, keep: number, kind: SnapshotKind = "auto"): Promise<string[]> {
  const prefix = snapshotBagPrefix(slug);
  const marker = prefix + MANUAL_SNAPSHOT_MARKER;
  // Only this kind of snapshot is a candidate, so the two budgets cannot eat
  // into each other. The marker is part of the name, which is why this stays a
  // single query instead of opening every bag to ask what it is.
  const where = kind === "all"
    ? { name: { startsWith: prefix } }
    : kind === "manual"
      ? { name: { startsWith: marker } }
      : { name: { startsWith: prefix, not: { startsWith: marker } } };
  const rows = await prisma.bag.findMany({
    where,
    select: { id: true, name: true },
    orderBy: { name: "desc" },
  });
  const stale = rows.slice(Math.max(keep, 0));
  for (const row of stale) {
    await dropBag(prisma, row.id);
  }
  return stale.map(row => row.name);
}

/**
 * Drops one snapshot bag. The caller has checked the name against the wiki and
 * against the stored list; this only refuses a bag that is not a snapshot, so a
 * mistyped name can never take a wiki's own bag with it.
 */
export async function deleteSnapshotBag(prisma: PrismaTxnClient, bagName: string): Promise<boolean> {
  const meta = await readSnapshotMeta(prisma, bagName);
  if (!meta) return false;
  const bagId = await bagIdOfName(prisma, bagName);
  if (!bagId) return false;
  await dropBag(prisma, bagId.toString());
  return true;
}

/**
 * How many snapshots one wiki has, without reading their meta tiddlers. The
 * overview in the wikis tab asks for a count per wiki and never opens a
 * snapshot, so it should not pay for the rows behind them.
 */
export async function countSnapshotBags(prisma: PrismaTxnClient, slug: string): Promise<number> {
  return prisma.bag.count({ where: { name: { startsWith: snapshotBagPrefix(slug) } } });
}

export async function listSnapshotBags(prisma: PrismaTxnClient, slug?: string): Promise<SnapshotBag[]> {
  const where = slug
    ? { name: { startsWith: snapshotBagPrefix(slug) } }
    : { name: { startsWith: SNAPSHOT_BAG_PREFIX } };
  const rows = await prisma.bag.findMany({
    where,
    select: {
      id: true,
      name: true,
      created: true,
      tiddlers: {
        where: { title: { startsWith: SNAPSHOT_META_PREFIX } },
        select: { title: true, fields: true },
      },
    },
    orderBy: { name: "desc" },
  });
  return rows.map(row => {
    const meta = (suffix: string) => {
      const found = row.tiddlers.find(e => e.title === SNAPSHOT_META_PREFIX + suffix);
      return found ? String(found.fields.text ?? "") : "";
    };
    const count = Number(meta("count"));
    // Named after the parameter above but deliberately its own value: a bag name
    // that lost its metadata still has to yield the wiki it belongs to, and that
    // is the slug the marker is tested against below.
    const bagSlug = meta("wiki") || row.name.slice(SNAPSHOT_BAG_PREFIX.length).split("/")[0];
    return {
      bagName: row.name,
      slug: bagSlug,
      created: meta("created") || row.created.toISOString(),
      sourceBagName: meta("bag"),
      source: meta("source"),
      count: Number.isFinite(count) ? count : row.tiddlers.length,
      // Read off the name, because the list already has it and the marker is
      // what the retention rule splits on. The stored source agrees, but an
      // older store has snapshots written before the marker existed.
      manual: bagSlug ? isManualSnapshotName(bagSlug, row.name) : false,
    };
  });
}

/** Reads the metadata of a snapshot bag, or null if the bag is not one. */
export async function readSnapshotMeta(prisma: PrismaTxnClient, bagName: string): Promise<SnapshotBag | null> {  const bagId = await bagIdOfName(prisma, bagName);
  if (!bagId) return null;
  const rows = await prisma.tiddler.findMany({
    where: { bag_id: IdString.cast(bagId), title: { startsWith: SNAPSHOT_META_PREFIX } },
    select: { title: true, fields: true },
  });
  const text = (suffix: string) => {
    const row = rows.find(e => e.title === SNAPSHOT_META_PREFIX + suffix);
    return row ? String(row.fields.text ?? "") : "";
  };
  const wiki = text("wiki");
  if (!wiki) return null;
  return {
    bagName,
    slug: wiki,
    created: text("created"),
    sourceBagName: text("bag"),
    source: text("source"),
    count: Number(text("count")) || 0,
    manual: isManualSnapshotName(wiki, bagName),
  };
}
/**
 * The tiddlers of a snapshot bag, without the metadata tiddlers, ready to be
 * written into a wiki again.
 */
export async function readSnapshotTiddlers(
  prisma: PrismaTxnClient,
  bagName: string,
): Promise<TiddlerFields[]> {
  const meta = await readSnapshotMeta(prisma, bagName);
  if (!meta) {
    throw new Error(`${bagName} is not a snapshot bag (no ${SNAPSHOT_META_PREFIX}wiki tiddler).`);
  }
  const bagId = await bagIdOfName(prisma, bagName);
  const rows = await prisma.tiddler.findMany({
    where: { bag_id: IdString.cast(bagId!), title: { not: { startsWith: SNAPSHOT_META_PREFIX } } },
    select: { title: true, fields: true },
  });
  if (!rows.length) throw new Error(`The snapshot bag "${bagName}" holds no tiddlers.`);
  return rows.map(row => ({ ...row.fields, title: row.title }));
}
