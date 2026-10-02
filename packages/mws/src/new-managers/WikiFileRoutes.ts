// The admin dialog's way of taking over a single-file TiddlyWiki
// ("Wiki-Datei übernehmen").
//
// The picked file is uploaded twice: PUT /api/wiki-file/inspect parses it and
// answers with the plan ("what would this do?"), PUT /api/wiki-file/import
// repeats the parse and writes. Nothing about an upload is kept between the two
// requests — the File object in the dialog is the state, so a dialog that was
// left open for an hour cannot import a file that was exchanged behind its back,
// and there is no temporary upload to clean up. Parse, plan and snapshot are the
// same code the `import-wiki-file` command runs (WikiFileImport.ts,
// importWikiFile.ts).
//
// The paths live under /api and not under /admin: the generic /admin/:op/:tab
// route (the tab editor) matches every two-segment admin path and is declared
// as a json body, so a multipart route there would have its body parsed as
// JSON before the handler runs.

import { IdString } from "@mws/admin-vanilla/src/definition/tabs";
import { SendError, ServerRequest, zodRoute } from "@tiddlywiki/server";
import { TW } from "tiddlywiki";
import { bootTiddlyWikiVersion } from "../plugin-cache";
import { DEFAULT_TEMPLATE } from "../new-managers";
import { RecipeResolver } from "./RecipeResolver";
import { WikiImportMode, WikiImportPlan, WikiImportTarget, applyWikiFileImport, defaultWriteTargetBag, planWikiFileImport, restoreSnapshotBag } from "./importWikiFile";
import { assertWikiCreationAllowed, defaultBagName, newWikiAdminRole, newWikiSlug, sanitizeSlugPart } from "./TabDataAdapter";
import { ParsedWikiFile, WikiFileError, formatBytes, inspectWikiFile, parseWikiFile } from "./WikiFileImport";
import { listSnapshotBags, snapshotBagPrefix } from "./WikiSnapshotBag";
import { createWikiShell, writeStarterTiddlers } from "./WikiShell";

/** How many titles of a list the dialog shows before it only counts the rest. */
const SAMPLE = 12;

/**
 * Booting a TiddlyWiki costs a few hundred milliseconds, and the store
 * deserializers are pure functions over the text (parseWikiFile never writes
 * into the wiki), so one booted instance per installed version serves every
 * request. The cache holds no tiddler data.
 */
const bootedTw = new Map<string, Promise<TW>>();

/** The version whose parser should read the file: the file's own if installed. */
async function bootForParsing(
  state: ServerRequest,
  fileVersion: string,
  fallbackVersion: string | undefined,
): Promise<{ $tw: TW; version: string }> {
  const versions: string[] = state.config.pluginCache.versions;
  const version = versions.includes(fileVersion) ? fileVersion : (fallbackVersion ?? versions[versions.length - 1]);
  if (!version) {
    throw new SendError("WIKI_FILE_INVALID", 400, {
      reason: `TiddlyWiki ${fileVersion} is not installed on this server.`,
    });
  }
  let booting = bootedTw.get(version);
  if (!booting) {
    booting = bootTiddlyWikiVersion(state.config.wikiPath, version);
    bootedTw.set(version, booting);
    booting.catch(() => bootedTw.delete(version));
  }
  return { $tw: await booting, version };
}

/** `?create=1`, `?merge=true`, … — anything else counts as off. */
function flag(state: ServerRequest, name: string): boolean {
  const value = state.query.get(name);
  return value === "1" || value === "true" || value === "yes";
}

function readIntOption(state: ServerRequest, name: string): number | undefined {
  const raw = state.query.get(name);
  if (raw == null) return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1 || value > 1000) {
    throw new SendError("WIKI_FILE_INVALID", 400, { reason: `The value of "${name}" is not a number between 1 and 1000.` });
  }
  return value;
}

/**
 * Reads the uploaded file into memory, limited the same way the CLI limits it.
 * The text has to be in memory to be parsed anyway, and the limit keeps a
 * hand-crafted upload from reserving a large part of the heap.
 */
async function readUploadedWikiFile(state: ServerRequest<"stream">): Promise<{ filename: string; html: string }> {
  const maxBytes = state.config.wikiFileSizeLimit;
  const chunks: Buffer[] = [];
  const upload: { filename?: string; length: number; over: boolean } = { length: 0, over: false };

  await state.readMultipartData({
    cbPartStart: async (part) => {
      if (!upload.filename && part.filename) upload.filename = part.filename;
    },
    cbPartChunk: async (part, chunk) => {
      if (!part.filename) return;
      upload.length += chunk.length;
      if (upload.length > maxBytes) {
        // keep draining the request body, but stop keeping the bytes
        upload.over = true;
        chunks.length = 0;
        return;
      }
      if (!upload.over) chunks.push(chunk);
    },
    cbPartEnd: async () => { },
  });

  if (upload.over) {
    throw new SendError("WIKI_FILE_TOO_LARGE", 413, {
      reason: "The file is larger than this server accepts.",
      maxBytes,
    });
  }
  if (!upload.filename || chunks.length === 0) {
    throw new SendError("WIKI_FILE_INVALID", 400, { reason: "No file was uploaded." });
  }
  return { filename: upload.filename, html: Buffer.concat(chunks).toString("utf8") };
}

/** Parses the file, or answers with a message the person who picked it can act on. */
async function parseUpload(state: ServerRequest, html: string, options: {
  includeSystem: boolean;
  /** The version the target wiki or template uses, for a file version that is not installed. */
  fallbackVersion?: string;
}): Promise<{ parsed: ParsedWikiFile; readWith: string }> {
  try {
    const info = inspectWikiFile(html, { sizeLimit: state.config.wikiFileSizeLimit });
    const { $tw, version } = await bootForParsing(state, info.twVersion, options.fallbackVersion);
    const parsed = parseWikiFile($tw, html, {
      includeSystem: options.includeSystem,
      sizeLimit: state.config.wikiFileSizeLimit,
    });
    return { parsed, readWith: version };
  } catch (error) {
    if (error instanceof WikiFileError) {
      throw new SendError("WIKI_FILE_REJECTED", 400, { code: error.code, reason: error.message });
    }
    throw error;
  }
}

/** The TiddlyWiki version a wiki's tiddler parser would use (from its template). */
async function wikiParserVersion(state: ServerRequest, slug: string): Promise<string | undefined> {
  const recipe = await state.engine.recipe.findUnique({
    where: { slug },
    select: { template: { select: { definition: true } } },
  });
  return recipe ? state.config.pluginCache.versionFromTemplate(recipe.template.definition.twVersion) : undefined;
}

async function templateParserVersion(state: ServerRequest, name: string): Promise<string | undefined> {
  const template = await state.engine.template.findUnique({ where: { name }, select: { definition: true } });
  return template ? state.config.pluginCache.versionFromTemplate(template.definition.twVersion) : undefined;
}

/**
 * A replace rewrites the whole bag, so it needs the rights a bag admin has:
 * C_admin on the bag, or being its owner, the wiki's owner, or a site admin.
 * canWriteBag() is deliberately not enough — it also answers true for B_write.
 */
function mayReplace(state: ServerRequest, recipe: { owner_user_id: string | null }, rb: { bag: { owner_user_id: string | null; permissions: { level: string }[] } }): boolean {
  if (state.user.isAdmin) return true;
  if (recipe.owner_user_id === state.user.user_id) return true;
  if (rb.bag.owner_user_id === state.user.user_id) return true;
  return rb.bag.permissions[0]?.level === "C_admin";
}

export interface ResolvedWikiTarget {
  target: WikiImportTarget;
  slug: string;
  bagName: string;
  displayName: string;
}

/**
 * The bag an import writes into, with the permission checks both entry points
 * share. Nothing is created here: a preview compares against an empty bag, and
 * the import creates bag and recipe inside its own transaction.
 */
export async function resolveWikiTarget(state: ServerRequest, prisma: PrismaTxnClient, options: {
  mode: WikiImportMode;
  /** The wiki to import into. */
  wikiSlug: string;
  bagName?: string;
}): Promise<ResolvedWikiTarget> {
  const { wikiSlug } = options;
  const recipe = await RecipeResolver.assertRecipe({ state, recipe_slug: wikiSlug });

  const bagName = options.bagName || defaultWriteTargetBag(recipe);
  if (!bagName) {
    throw new SendError("WIKI_FILE_INVALID", 400, {
      reason: `The wiki "${wikiSlug}" has no default write bag. Choose a bag by hand.`,
    });
  }
  const rb = recipe.recipe_bags.find(row => row.bag.name === bagName);
  if (!rb) {
    throw new SendError("WIKI_FILE_INVALID", 400, { reason: `The wiki "${wikiSlug}" does not use the bag "${bagName}".` });
  }
  // A read-only bag stays read-only, whatever the person may do elsewhere: an
  // import is a write like any other.
  if (!rb.is_writable || recipe.definition?.readonlyBags?.includes(bagName)) {
    throw new SendError("ACCESS_DENIED", 403, { reason: `The bag "${bagName}" of the wiki "${wikiSlug}" is read-only.` });
  }

  const resolver = new RecipeResolver(recipe, null, state.user);
  if (!resolver.canWriteBag(rb)) {
    throw new SendError("ACCESS_DENIED", 403, {
      reason: `You do not have write access to the bag "${bagName}" of the wiki "${wikiSlug}".`,
    });
  }
  if (options.mode === "replace" && !mayReplace(state, recipe, rb)) {
    throw new SendError("ACCESS_DENIED", 403, {
      reason: `Replacing the wiki "${wikiSlug}" needs administrator rights (C_admin) on its write bag. A merge is enough to add tiddlers.`,
    });
  }

  return {
    target: { recipeId: new IdString(recipe.id), bagId: new IdString(rb.bag_id), bagName },
    slug: wikiSlug,
    bagName,
    displayName: recipe.definition?.displayName || wikiSlug,
  };
}

/**
 * The bag of a wiki that is about to be created. The inspect answers with the
 * free slug it would use, the import insists on exactly that slug — silently
 * moving to "-2" would import into a different wiki than the one confirmed.
 */
async function resolveNewWikiTarget(state: ServerRequest, prisma: PrismaTxnClient, options: {
  parsed: ParsedWikiFile;
  requestedSlug?: string;
  displayName?: string;
  bagName?: string;
  /** true for the import: the slug must still be free. */
  committing: boolean;
}): Promise<ResolvedWikiTarget> {
  const wanted = sanitizeSlugPart(options.requestedSlug || options.parsed.siteTitle || "imported-wiki");
  const slug = options.committing ? wanted : await newWikiSlug(prisma, state.user, wanted);
  if (options.committing) {
    const taken = await prisma.recipe.findUnique({ where: { slug }, select: { id: true } });
    if (taken) {
      throw new SendError("WIKI_FILE_INVALID", 409, {
        reason: `A wiki with the slug "${slug}" exists. Choose another name, or import into that wiki.`,
      });
    }
  }
  const bagName = options.bagName || defaultBagName(state.user.user_id, slug);
  if (await prisma.bag.findUnique({ where: { name: bagName }, select: { id: true } })) {
    throw new SendError("WIKI_FILE_INVALID", 409, { reason: `The bag "${bagName}" already exists.` });
  }
  return {
    // An empty id makes the plan compare against nothing, which is what the
    // preview of a new wiki needs.
    target: { bagId: new IdString(""), bagName },
    slug,
    bagName,
    displayName: options.displayName?.trim() || options.parsed.siteTitle || slug,
  };
}

function sample(titles: string[]) {
  return { count: titles.length, titles: titles.slice(0, SAMPLE) };
}

function previewText(fields: { text?: unknown }, length = 100): string {
  const flat = String(fields?.text ?? "").replace(/\s+/g, " ").trim();
  return flat.length > length ? flat.slice(0, length) + "…" : flat;
}

/** What the dialog shows before the person confirms. */
function planSummary(plan: WikiImportPlan) {
  return {
    mode: plan.mode,
    bagName: plan.target.bagName,
    fileTiddlers: plan.fileTiddlerCount,
    existing: plan.existingCount,
    created: sample(plan.created),
    updated: sample(plan.updated),
    unchanged: plan.unchanged.length,
    /** The tiddlers a replace removes, named: this is the destructive part. */
    deleted: { count: plan.deleted.length, titles: plan.deleted },
    /** System tiddlers a replace keeps although the file has none. */
    keptSystem: sample(plan.keptSystemTitles),
    /** Left out because they are system tiddlers. */
    skippedSystem: plan.skippedSystemTitles.length,
    /**
     * Core plugins, themes and libraries never enter a bag; only the language
     * pack does, because MWS keeps language packs in the bag, not the recipe.
     */
    skippedPlugins: sample(plan.skippedPluginTitles),
    /** Session and build state the file carries, dropped while reading it. */
    skippedTransient: sample(plan.skippedTransientTitles),
    /** What becomes of the file's language. */
    language: plan.language ?? null,
    /** Offered by the file, deliberately not written, with the reason. */
    dropped: plan.dropped,
    /** A replace copies the bag into a snapshot bag first. */
    snapshots: plan.mode === "replace" && plan.existingCount > 0,
  };
}

function fileSummary(parsed: ParsedWikiFile) {
  return {
    kind: parsed.kind,
    twVersion: parsed.twVersion,
    store: parsed.store,
    sizeBytes: parsed.sizeBytes,
    sizeText: formatBytes(parsed.sizeBytes),
    siteTitle: parsed.siteTitle ?? "",
    tiddlerCount: parsed.tiddlers.length,
    systemTiddlerCount: parsed.systemTiddlers.length,
    pluginTiddlerCount: parsed.pluginTiddlers.length,
  };
}

/** The system tiddlers the "import system tiddlers too" checkbox would bring in. */
function systemSummary(parsed: ParsedWikiFile) {
  return {
    count: parsed.systemTiddlers.length,
    tiddlers: parsed.systemTiddlers.slice(0, 200).map(fields => ({
      title: fields.title,
      text: previewText(fields),
      hasText: typeof fields?.text === "string" && fields.text.length > 0,
    })),
  };
}

const QUERY_KEYS: string[] = [
  "create", "wiki", "slug", "bag", "merge", "include-system", "template", "display-name", "snapshot-keep",
];

/** Upload → preview. Nothing is written. */
export const AdminWikiFileInspect = zodRoute({
  method: ["PUT"],
  path: "/api/wiki-file/inspect",
  bodyFormat: "stream",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodQueryKeys: QUERY_KEYS,
  inner: async (state) => {
    state.okUser();
    state.assertReferer(["/"]);
    state.asserted = true;

    const create = flag(state, "create");
    const includeSystem = flag(state, "include-system");
    const mode: WikiImportMode = flag(state, "merge") ? "merge" : "replace";
    const templateName = state.query.get("template") || DEFAULT_TEMPLATE;
    const wikiSlug = state.query.get("wiki") || undefined;

    // The cheap gates first: a user who may not create a wiki should not have
    // to upload a file to find that out.
    if (create) {
      await assertWikiCreationAllowed(state.engine, state.user);
    }

    const { filename, html } = await readUploadedWikiFile(state);
    const fallbackVersion = create
      ? await templateParserVersion(state, templateName)
      : (wikiSlug ? await wikiParserVersion(state, wikiSlug) : undefined);
    const { parsed, readWith } = await parseUpload(state, html, { includeSystem, fallbackVersion });

    const targetOptions = {
      requestedSlug: state.query.get("slug") || undefined,
      displayName: state.query.get("display-name") || undefined,
      bagName: state.query.get("bag") || undefined,
    };
    const resolved = create
      ? await resolveNewWikiTarget(state, state.engine, { ...targetOptions, parsed, committing: false })
      : await resolveWikiTarget(state, state.engine, {
        mode,
        wikiSlug: wikiSlug!,
        bagName: targetOptions.bagName,
      });

    const plan = await planWikiFileImport(state.engine, {
      parsed,
      target: resolved.target,
      mode,
      includeSystem,
    });

    return {
      file: { ...fileSummary(parsed), filename, readWith },
      target: {
        create,
        slug: resolved.slug,
        bagName: resolved.bagName,
        displayName: resolved.displayName,
        templateName: create ? templateName : null,
      },
      includeSystem,
      plan: planSummary(plan),
      system: systemSummary(parsed),
    };
  },
});

/** Upload → import: the same parse, then the plan, the snapshot and the write. */
export const AdminWikiFileImport = zodRoute({
  method: ["PUT"],
  path: "/api/wiki-file/import",
  bodyFormat: "stream",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodQueryKeys: QUERY_KEYS,
  inner: async (state) => {
    state.okUser();
    state.assertReferer(["/"]);

    const create = flag(state, "create");
    const includeSystem = flag(state, "include-system");
    const mode: WikiImportMode = flag(state, "merge") ? "merge" : "replace";
    const templateName = state.query.get("template") || DEFAULT_TEMPLATE;
    const wikiSlug = state.query.get("wiki") || undefined;
    const snapshotKeep = readIntOption(state, "snapshot-keep");

    if (create) {
      await assertWikiCreationAllowed(state.engine, state.user);
    }

    const { filename, html } = await readUploadedWikiFile(state);
    const fallbackVersion = create
      ? await templateParserVersion(state, templateName)
      : (wikiSlug ? await wikiParserVersion(state, wikiSlug) : undefined);
    const { parsed } = await parseUpload(state, html, { includeSystem, fallbackVersion });

    const targetOptions = {
      requestedSlug: state.query.get("slug") || undefined,
      displayName: state.query.get("display-name") || undefined,
      bagName: state.query.get("bag") || undefined,
    };

    // The permission check on an existing wiki happens before the transaction
    // opens: that is the gate, and state.$transaction insists on it. For a new
    // wiki the gate was assertWikiCreationAllowed above; whether the slug is
    // still free can only be answered inside the transaction, where the bag and
    // the recipe are created.
    const existing = create
      ? undefined
      : await resolveWikiTarget(state, state.engine, { mode, wikiSlug: wikiSlug!, bagName: targetOptions.bagName });
    state.asserted = true;

    const result = await state.$transaction(async (prisma) => {
      const resolved = existing
        ?? await resolveNewWikiTarget(state, prisma, { ...targetOptions, parsed, committing: true });

      let target = resolved.target;
      if (create) {
        const { roleNames } = await newWikiAdminRole(prisma, state.user);
        const shell = await createWikiShell(prisma, {
          user: state.user,
          slug: resolved.slug,
          bagName: resolved.bagName,
          displayName: resolved.displayName,
          templateName,
          adminRoleNames: roleNames,
        });
        target = { recipeId: shell.recipeId, bagId: shell.bagId, bagName: shell.bagName };
      }

      const plan = await planWikiFileImport(prisma, { parsed, target, mode, includeSystem });
      const written = await applyWikiFileImport(prisma, {
        parsed,
        plan,
        user: state.user,
        slug: resolved.slug,
        source: `import of ${filename} in the admin app`,
        ...(snapshotKeep === undefined ? {} : { snapshotKeep }),
      });

      if (create) {
        await writeStarterTiddlers(prisma, { target, parsed, displayName: resolved.displayName });
      }

      return { resolved, target, plan, written };
    });

    return {
      slug: result.resolved.slug,
      bagName: result.target.bagName,
      displayName: result.resolved.displayName,
      create,
      plan: planSummary(result.plan),
      result: {
        written: result.written.written,
        deleted: result.written.deleted,
        unchanged: result.written.unchanged,
      },
      snapshot: result.written.snapshot
        ? {
          bagName: result.written.snapshot.bagName,
          created: result.written.snapshot.created,
          count: result.written.snapshot.count,
          pruned: result.written.snapshot.pruned ?? [],
        }
        : null,
    };
  },
});

/** The snapshots of one wiki, newest first. */
export const AdminWikiFileSnapshots = zodRoute({
  method: ["GET"],
  path: "/api/wiki-file/snapshots",
  bodyFormat: "ignore",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodQueryKeys: ["wiki"],
  inner: async (state) => {
    state.okUser();
    state.assertReferer(["/", "/admin"]);
    state.asserted = true;

    const slug = state.query.get("wiki");
    if (!slug) throw new SendError("ARGUMENT_REQUIRED", 400, { name: "wiki" });

    // A snapshot shows what was in the bag before, so its list is behind the
    // same gate as the replace that created it.
    const resolved = await resolveWikiTarget(state, state.engine, { mode: "replace", wikiSlug: slug });
    const snapshots = await listSnapshotBags(state.engine, resolved.slug);
    return {
      slug: resolved.slug,
      bagName: resolved.bagName,
      snapshots: snapshots.map(snapshot => ({
        bagName: snapshot.bagName,
        created: snapshot.created,
        source: snapshot.source,
        sourceBagName: snapshot.sourceBagName,
        count: snapshot.count,
      })),
    };
  },
});

/** Puts a snapshot back into the wiki's default write bag. */
export const AdminWikiFileRestore = zodRoute({
  method: ["PUT"],
  path: "/api/wiki-file/restore",
  bodyFormat: "json",
  securityChecks: { requestedWithHeader: true },
  zodPathParams: z => ({}),
  zodQueryKeys: ["wiki"],
  zodRequestBody: z => z.object({
    snapshot: z.string().min(1),
    keep: z.number().int().min(1).max(1000).optional(),
  }),
  inner: async (state) => {
    state.okUser();
    state.assertReferer(["/"]);

    const slug = state.query.get("wiki");
    if (!slug) throw new SendError("ARGUMENT_REQUIRED", 400, { name: "wiki" });
    const { snapshot, keep } = state.data;

    // Only a snapshot of this wiki may be restored into it — otherwise a bag
    // admin of one wiki could read another wiki's tiddlers by restoring its
    // snapshot here.
    const prefix = snapshotBagPrefix(slug);
    const stamp = snapshot.startsWith(prefix) ? snapshot.slice(prefix.length) : "";
    if (!stamp || stamp.includes("/")) {
      throw new SendError("ACCESS_DENIED", 403, { reason: "This snapshot does not belong to that wiki." });
    }

    const resolved = await resolveWikiTarget(state, state.engine, { mode: "replace", wikiSlug: slug });
    const known = (await listSnapshotBags(state.engine, resolved.slug)).some(row => row.bagName === snapshot);
    if (!known) throw new SendError("WIKI_FILE_INVALID", 404, { reason: "There is no such snapshot." });
    // A restore rewrites the bag, so it is behind the same gate as the replace
    // that took the snapshot.
    state.asserted = true;

    const restored = await state.$transaction(async (prisma) => {
      return restoreSnapshotBag(prisma, {
        snapshotBagName: snapshot,
        target: resolved.target,
        user: state.user,
        slug: resolved.slug,
        ...(keep === undefined ? {} : { snapshotKeep: keep }),
      });
    });

    return {
      slug: resolved.slug,
      bagName: resolved.bagName,
      result: {
        written: restored.written,
        deleted: restored.deleted,
        unchanged: restored.unchanged,
      },
      snapshot: restored.snapshot
        ? {
          bagName: restored.snapshot.bagName,
          created: restored.snapshot.created,
          count: restored.snapshot.count,
          pruned: restored.snapshot.pruned ?? [],
        }
        : null,
    };
  },
});
