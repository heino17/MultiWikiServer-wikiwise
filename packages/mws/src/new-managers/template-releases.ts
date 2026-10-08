// Shared helpers for template shell releases (B+C, §N).
//
// A release is an immutable snapshot of a template's definition. Every write
// to a template definition creates one. A wiki either follows the template
// head ("auto"), or pins one concrete release and compares the release it
// serves against the template's latest release to notify its owner.

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
   * pinned release, "live-<uuid>-<millis>" for the template head. A template
   * save always creates a new release, so this key changes on every save and
   * browsers cannot keep a stale shell from an HTTP 304.
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
 * Creates the next immutable release of a template from a freshly written
 * definition and returns the created row. The release number is unique per
 * template and strictly ascending, which is what pinning and the update
 * banner compare against. Runs inside the caller's transaction.
 */
export async function createTemplateRelease(
  prisma: PrismaTxnClient,
  templateRow: { id: string; definition: TemplateDefinition },
): Promise<TemplateVersionRef> {
  const latest = await prisma.templateVersion.findFirst({
    where: { template_id: templateRow.id },
    orderBy: { release: "desc" },
    select: { release: true },
  });
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
  return row;
}