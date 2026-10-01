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

export interface SnapshotBag {
  bagName: string;
  slug: string;
  created: string;
  sourceBagName: string;
  source: string;
  count: number;
  /** Older snapshots of the same wiki that the retention rule dropped. */
  pruned?: string[];
}

export function snapshotBagPrefix(slug: string): string {
  return `${SNAPSHOT_BAG_PREFIX}${slug}/`;
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
  keep?: number;
  now?: Date;
}): Promise<SnapshotBag> {
  const now = options.now ?? new Date();
  const created = now.toISOString();
  const prefix = snapshotBagPrefix(options.slug);

  let bagName = prefix + snapshotStamp(now);
  for (let attempt = 2; await bagIdOfName(prisma, bagName); attempt++) {
    bagName = `${prefix}${snapshotStamp(now)}-${attempt}`;
  }

  const writer = new BagImportWriter(prisma, false);
  await writer.checkExisting(new IdString(""), bagName, options.user, { allowCreate: true });
  const [bag] = await writer.upsert([{
    name: bagName,
    description: `Snapshot of "${options.slug}" (${options.tiddlers.length} tiddlers) taken ${created} before ${options.source}`,
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

  const keep = options.keep ?? DEFAULT_SNAPSHOT_KEEP;
  const pruned = await pruneSnapshotBags(prisma, options.slug, keep);

  return {
    bagName,
    slug: options.slug,
    created,
    sourceBagName: options.sourceBagName,
    source: options.source,
    count: options.tiddlers.length,
    pruned,
  };
}

/** Drops the oldest snapshots of a wiki, keeping the newest `keep` of them. */
export async function pruneSnapshotBags(prisma: PrismaTxnClient, slug: string, keep: number): Promise<string[]> {
  const prefix = snapshotBagPrefix(slug);
  const rows = await prisma.bag.findMany({
    where: { name: { startsWith: prefix } },
    select: { id: true, name: true },
    orderBy: { name: "desc" },
  });
  const stale = rows.slice(Math.max(keep, 0));
  for (const row of stale) {
    await dropBag(prisma, row.id);
  }
  return stale.map(row => row.name);
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
    return {
      bagName: row.name,
      slug: meta("wiki") || row.name.slice(SNAPSHOT_BAG_PREFIX.length).split("/")[0],
      created: meta("created") || row.created.toISOString(),
      sourceBagName: meta("bag"),
      source: meta("source"),
      count: Number.isFinite(count) ? count : row.tiddlers.length,
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
