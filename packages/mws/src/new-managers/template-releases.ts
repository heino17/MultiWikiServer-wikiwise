// Shared helpers for template shell releases (B+C, §N).
//
// A release is an immutable snapshot of a template's definition. A write that
// changes the definition creates one; a write that stores the identical
// definition keeps the release that is already there. A wiki either follows
// the template head ("auto"), or pins one concrete release and compares the
// release it serves against the template's latest release to notify its owner.
//
// Only the newest release and the ones wikis have pinned are worth keeping:
// every release stores the whole definition, and a custom shell runs into the
// megabytes. createTemplateRelease prunes the rest after every write, and the
// prune-template-releases command does the same for a store that grew before
// this was in place.

import { type TemplateDefinition } from "./TabDataAdapter";

/** The three ways a wiki follows its template's shell releases. */
export const SHELL_POLICIES = ["auto", "pin", "notify"] as const;
export type ShellPolicy = (typeof SHELL_POLICIES)[number];

export function isShellPolicy(value: unknown): value is ShellPolicy {
  return typeof value === "string" && (SHELL_POLICIES as readonly string[]).includes(value);
}

/**
 * Reads a human-readable shell version out of a custom HTML shell. The release
 * carries it as a label (e.g. "v0.1.0") when the shell declares one via
 *
 *   <meta name="mws-shell-version" content="v0.1.0">
 *
 * Returns null when there is no such tag — the release is then identified by
 * its release number alone. The tag may appear before or after other
 * attributes; the value is trimmed. Case-insensitive on the name.
 */
export function extractShellLabel(html: string | null | undefined): string | null {
  if (typeof html !== "string") return null;
  const match =
    /<meta\b[^>]*\bname=["']mws-shell-version["'][^>]*\bcontent=["']([^"']*)["']/i.exec(html)
    ?? /<meta\b[^>]*\bcontent=["']([^"']*)["'][^>]*\bname=["']mws-shell-version["']/i.exec(html);
  const label = match?.[1]?.trim();
  return label ? label : null;
}

/** A template version row reduced to what pinning and the banner need. */
export interface TemplateVersionRef {
  id: string;
  release: number;
  label: string | null;
}

export interface ShellVersionStatus {
  policy: string;
  /** release the wiki currently serves (NULL when there is no release yet) */
  servedRelease: number | null;
  servedLabel: string | null;
  /** the template's newest release (NULL when there is no release yet) */
  latestRelease: number | null;
  latestLabel: string | null;
  /** true when serving an older release and a newer one exists */
  updateAvailable: boolean;
  /**
   * Identity of the served shell, used in the index ETag: "v-<uuid>" for a
   * pinned release, "live-<uuid>" for the template head. A save that changes
   * the shell mints a new release, so the key changes and browsers cannot keep
   * a stale shell from an HTTP 304; a save that changes nothing keeps the
   * release and the key, which is what "nothing changed" should say.
   */
  servedKey: string;
}

/**
 * Resolves which release a wiki serves and whether a newer one exists.
 * One/one small queries: the template's latest release plus — for pin/notify
 * wikis — the pinned release.
 */
export async function resolveShellVersionStatus(
  prisma: PrismaTxnClient,
  recipe: {
    template_id: string;
    shell_policy: string;
    pinned_template_version_id: string | null;
  },
): Promise<ShellVersionStatus> {
  const latest = await prisma.templateVersion.findFirst({
    where: { template_id: recipe.template_id },
    orderBy: { release: "desc" },
    select: { id: true, release: true, label: true },
  });
  const pinned = recipe.pinned_template_version_id
    ? await prisma.templateVersion.findUnique({
        where: { id: recipe.pinned_template_version_id },
        select: { id: true, release: true, label: true },
      })
    : null;
  const usePinned = recipe.shell_policy !== "auto" && pinned !== null;
  const served = usePinned ? pinned : latest;
  return {
    policy: recipe.shell_policy,
    servedRelease: served?.release ?? null,
    servedLabel: served?.label ?? null,
    latestRelease: latest?.release ?? null,
    latestLabel: latest?.label ?? null,
    updateAvailable: latest !== null && served !== null && latest.release > served.release,
    servedKey: usePinned
      ? `v-${pinned!.id}`
      : `live-${latest?.id ?? recipe.template_id}`,
  };
}

/**
 * JSON equality of two definitions, so a write that changes nothing does not
 * mint a release. String equality is enough and cannot be wrong: both sides
 * are serialized the same way by the same writer, so equal bytes mean equal
 * definitions. A different key order (Postgres `jsonb` reorders keys) only
 * ever reads as "changed", which costs one redundant release, never a wrong
 * one.
 */
function definitionsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Deletes every release of a template except the newest one and the releases
 * that wikis have pinned. The newest is what "auto" wikis serve and the
 * baseline the update banner compares against; a pinned release is referenced
 * by `recipe.pinned_template_version_id` and has to survive. Runs inside the
 * caller's transaction and returns the number of rows deleted.
 */
export async function pruneTemplateReleases(
  prisma: PrismaTxnClient,
  templateId: string,
): Promise<number> {
  const pinned = await prisma.recipe.findMany({
    where: { pinned_template_version_id: { not: null } },
    select: { pinned_template_version_id: true },
  });
  const keep = new Set<string>(pinned.map(row => row.pinned_template_version_id as string));

  const releases = await prisma.templateVersion.findMany({
    where: { template_id: templateId },
    orderBy: { release: "desc" },
    select: { id: true },
  });
  if (!releases.length) return 0;
  keep.add(releases[0].id);

  const deleted = await prisma.templateVersion.deleteMany({
    where: { template_id: templateId, id: { notIn: [...keep] } },
  });
  return deleted.count;
}

/**
 * `pruneTemplateReleases` for every template, for the CLI command. Returns the
 * total number of deleted rows and how many templates were visited.
 */
export async function pruneAllTemplateReleases(
  prisma: PrismaTxnClient,
): Promise<{ deleted: number; templates: number }> {
  const templates = await prisma.template.findMany({ select: { id: true } });
  let deleted = 0;
  for (const template of templates) {
    deleted += await pruneTemplateReleases(prisma, template.id);
  }
  return { deleted, templates: templates.length };
}

/**
 * Creates the next immutable release of a template from a freshly written
 * definition and returns the created row. The release number is unique per
 * template and strictly ascending, which is what pinning and the update
 * banner compare against. Runs inside the caller's transaction.
 *
 * A definition that is byte-identical to the newest release is not a change:
 * no release is written and the existing one is returned, so a repeated
 * provision or an untouched admin save does not pile up copies of the shell.
 * After a new release the older, unpinned ones are pruned.
 */
export async function createTemplateRelease(
  prisma: PrismaTxnClient,
  templateRow: { id: string; definition: TemplateDefinition },
): Promise<TemplateVersionRef> {
  const latest = await prisma.templateVersion.findFirst({
    where: { template_id: templateRow.id },
    orderBy: { release: "desc" },
    select: { id: true, release: true, label: true, definition: true },
  });
  if (latest && definitionsEqual(latest.definition, templateRow.definition)) {
    return { id: latest.id, release: latest.release, label: latest.label };
  }
  const release = (latest?.release ?? 0) + 1;
  const row = await prisma.templateVersion.create({
    data: {
      template_id: templateRow.id,
      release,
      label: extractShellLabel(
        (templateRow.definition as { htmlContent?: unknown }).htmlContent as string | undefined,
      ),
      definition: templateRow.definition,
    },
    select: { id: true, release: true, label: true },
  });
  await pruneTemplateReleases(prisma, templateRow.id);
  return row;
}