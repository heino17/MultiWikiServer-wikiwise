// Keeping the shipped system wikis current in an existing store.
//
// The documentation (`mws-docs`) and the manual (`simplewiki-manual`) are
// system wikis: ownerless wikis whose bag is the shipped `editions/<slug>`.
// `init-store` loads them into a *fresh* store, and that was the only way they
// ever arrived. Installing a newer tarball replaces the server code under
// `node_modules/@mws/wikiwise`, but the store kept the tiddlers it was built
// with — so the manual stayed at the version of the data folder's first start.
//
// This module adds the two ways to bring what this build ships to the store,
// mirroring the shell update (§137):
//
//   - `syncBundledSystemWikis` — the start-time default. It loads a system wiki
//     only when the edition this build ships differs from the one recorded for
//     the store, so a start with nothing to do is a read-only no-op and a
//     hand-edited system wiki survives until the build really moves.
//   - the explicit `update-system-wikis` command — applies whatever the build
//     ships, so an operator can also repair or force a store.
//
// The "edition version" is a content hash rather than a hand-maintained label:
// an edition is a folder of tiddlers, so a hash cannot be forgotten to bump.
// The definition (description, template, read roles) is part of the hash too,
// so renaming the manual is a change the store follows.

import { createHash } from "crypto";
import { existsSync, readdirSync, readFileSync } from "fs";
import * as path from "path";
import { dist_resolve } from "@tiddlywiki/server";
import { LoadWikiFolderCommand } from "../new-commands/load-wiki-folder";
import type { ServerState } from "../ServerState";
import { DEFAULT_TEMPLATE } from "./TabUpserts";

/** One shipped system wiki. The slug is both the recipe slug and the folder
 *  name under `editions/`; the bag is `editions/<slug>`, exactly the shape
 *  `init-store` used before this module existed. */
export type SystemWikiDefinition = {
	slug: string;
	description: string;
	templateName: string;
	/** Roles granted read access; empty means only ADMIN (via owner-roles). */
	recipeUsers: string[];
};

/** The system wikis this build ships, in load order. The manual comes last
 *  because it serves the SimpleWiki template, which the start-time shell sync
 *  creates first when an old store lacks it. */
export const SYSTEM_WIKIS: SystemWikiDefinition[] = [
	{
		slug: "mws-docs",
		description: "MWS Documentation from https://mws.tiddlywiki.com",
		templateName: DEFAULT_TEMPLATE,
		recipeUsers: [],
	},
	{
		slug: "simplewiki-manual",
		// §136: name the product the manual documents, not the fork it runs on.
		description: "SimpleWiki-Bedienungsanleitung",
		templateName: "SimpleWiki",
		recipeUsers: ["ANON"],
	},
];

/** Settings key under which the edition hash last loaded into the store is
 *  recorded. One per slug, independent of the admin preferences namespace. */
export function systemWikiHashKey(slug: string): string {
	return `systemwiki.${slug}.hash`;
}

/** The folder this build ships for a system wiki, or null when the build has
 *  none (a dev checkout without the edition, or a packaging mistake). */
export function bundledSystemWikiPath(slug: string): string | null {
	const folder = dist_resolve(`../editions/${slug}`);
	return existsSync(folder) ? folder : null;
}

/** Every file under a folder, relative and sorted, so the walk order does not
 *  depend on the filesystem. */
function collectEditionFiles(dir: string, base = ""): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const rel = base ? `${base}/${entry.name}` : entry.name;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) files.push(...collectEditionFiles(full, rel));
		else if (entry.isFile()) files.push(rel);
	}
	return files;
}

/** A content hash of an edition plus the load definition. Two builds that ship
 *  the same tiddlers under the same description hash alike, so a store that
 *  already carries them is left alone. */
export function hashSystemWiki(def: SystemWikiDefinition, folder: string): string {
	const hash = createHash("sha384");
	hash.update(JSON.stringify([def.slug, def.description, def.templateName, def.recipeUsers]));
	for (const rel of collectEditionFiles(folder)) {
		hash.update("\0" + rel + "\0");
		hash.update(readFileSync(path.join(folder, rel)));
	}
	return hash.digest("hex");
}

/** Loads one shipped system wiki into the store, through the same
 *  `load-wiki-folder` command an operator would run, and records its hash. */
export async function loadSystemWiki(
	config: ServerState,
	def: SystemWikiDefinition,
	overwrite: boolean,
): Promise<{ action: "created" | "updated"; hash: string }> {
	const folder = bundledSystemWikiPath(def.slug);
	if (!folder) throw new Error(`This build ships no editions/${def.slug}.`);

	const hash = hashSystemWiki(def, folder);

	const existing = await config.engine.recipe.findUnique({
		where: { slug: def.slug },
		select: { id: true },
	});

	const command = new LoadWikiFolderCommand([folder], {
		"bag-relative-root": [dist_resolve("..")],
		"bag-description": [def.description],
		"recipe-name": [def.slug],
		"recipe-description": [def.description],
		"recipe-users": def.recipeUsers,
		"template-name": [def.templateName],
		"overwrite": overwrite,
		"owner-roles": ["ADMIN"],
	});
	command.config = config;
	await command.execute();

	await config.engine.settings.upsert({
		where: { key: systemWikiHashKey(def.slug) },
		create: { key: systemWikiHashKey(def.slug), value: hash },
		update: { value: hash },
	});

	return { action: existing ? "updated" : "created", hash };
}

export type SystemWikiSyncAction = "created" | "updated" | "current" | "skipped";

export type SystemWikiSyncResult = {
	slug: string;
	action: SystemWikiSyncAction;
	/** hash recorded for the store before the sync (null when none) */
	fromHash: string | null;
	/** hash of the edition this build ships */
	toHash: string | null;
	/** why a system wiki was skipped or left alone */
	reason?: string;
};

/**
 * Brings the system wikis this build ships to the store.
 *
 * `forward` (the start-time default) loads a wiki only when it is missing or
 * its recorded hash differs from the shipped one — a genuine move forward, and
 * a start with nothing to do only reads. `force` (the explicit
 * `update-system-wikis` command) reloads every shipped wiki so an operator can
 * also repair a store or apply the build unconditionally.
 *
 * One failing wiki does not stop the others; a failure is reported as a
 * `skipped` result with the reason. That matters at start-up, where a bad
 * edition must not keep the server from starting.
 */
export async function syncBundledSystemWikis(
	config: ServerState,
	mode: "forward" | "force" = "forward",
): Promise<SystemWikiSyncResult[]> {
	const results: SystemWikiSyncResult[] = [];

	for (const def of SYSTEM_WIKIS) {
		const folder = bundledSystemWikiPath(def.slug);
		if (!folder) {
			results.push({
				slug: def.slug, action: "skipped", fromHash: null, toHash: null,
				reason: `this build ships no editions/${def.slug}`,
			});
			continue;
		}

		const toHash = hashSystemWiki(def, folder);
		const stored = await config.engine.settings.findUnique({
			where: { key: systemWikiHashKey(def.slug) },
			select: { value: true },
		});
		const fromHash = stored?.value ?? null;
		const existing = await config.engine.recipe.findUnique({
			where: { slug: def.slug },
			select: { id: true },
		});

		const needed = mode === "force" || fromHash !== toHash || !existing;
		if (!needed) {
			results.push({ slug: def.slug, action: "current", fromHash, toHash });
			continue;
		}

		try {
			const applied = await loadSystemWiki(config, def, true);
			results.push({ slug: def.slug, action: applied.action, fromHash, toHash });
		} catch (err) {
			results.push({
				slug: def.slug, action: "skipped", fromHash, toHash,
				reason: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return results;
}
