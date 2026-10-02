import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";
import { IdString } from "@mws/admin-vanilla/src/definition/tabs";
import { readFileSync } from "fs";
import * as path from "path";
import { serverEvents } from "@tiddlywiki/events";
import { DEFAULT_TEMPLATE } from "../new-managers";
import {
	WikiImportMode,
	WikiImportPlan,
	WikiImportTarget,
	applyWikiFileImport,
	defaultWriteTargetBag,
	planWikiFileImport,
} from "../new-managers/importWikiFile";
import { createWikiShell, writeStarterTiddlers } from "../new-managers/WikiShell";
import {
	ParsedWikiFile,
	WikiFileError,
	formatBytes,
	inspectWikiFile,
	parseWikiFile,
} from "../new-managers/WikiFileImport";
import { bootTiddlyWikiVersion } from "../plugin-cache";

serverEvents.on("cli.register", (commands) => {
	commands[info.name] = { info, Command: ImportWikiFileCommand };
});

const info: CommandInfo = {
	name: "import-wiki-file",
	description: "Import a single-file TiddlyWiki (.html), replacing the content of a wiki",
	arguments: [
		["path", "Path to the TiddlyWiki .html file"],
	],
	options: [
		["wiki <string>", "Slug of the wiki whose content is replaced."],
		["create", "Create a new wiki from the file instead of replacing one."],
		["slug <string>", "Slug of the new wiki (with --create; default: derived from the file name or its site title)."],
		["display-name <string>", "Display name of the new wiki (with --create; default: the file's $:/SiteTitle)."],
		["template-name <string>", "Template for the new wiki (with --create)."],
		["owner-roles <string...>", "Roles granted C_admin on the new bag and B_write on the new wiki."],
		["recipe-users <string...>", "Roles granted read access on the new wiki."],
		["bag-name <string>", "Bag to write into (default: the wiki's own default write target)."],
		["merge", "Only add and update tiddlers; keep the tiddlers the file does not contain."],
		["include-system", "Also import the file's $:/ system tiddlers."],
		["dry-run", "Only report what would change."],
		["snapshot-keep <number>", "How many snapshots to keep per wiki (default 10)."],
	],
};

type ImportWikiFileOptions = {
	"wiki"?: [string];
	"create"?: boolean;
	"slug"?: [string];
	"display-name"?: [string];
	"template-name"?: [string];
	"owner-roles"?: string[];
	"recipe-users"?: string[];
	"bag-name"?: [string];
	"merge"?: boolean;
	"include-system"?: boolean;
	"dry-run"?: boolean;
	"snapshot-keep"?: [string];
};

export class ImportWikiFileCommand extends BaseCommand<[string], ImportWikiFileOptions> {
	static info = info;

	async execute() {

		if (this.params.length < 1) {
			throw "Missing parameters for import-wiki-file command";
		}

		const filePath = path.resolve(this.params[0]);
		const create = !!this.options["create"];
		const wikiSlug = this.options["wiki"]?.[0];
		if (create === !!wikiSlug) {
			throw "Say where the file goes: --wiki <slug> to replace a wiki, or --create for a new one";
		}

		const mode: WikiImportMode = this.options["merge"] ? "merge" : "replace";
		const includeSystem = !!this.options["include-system"];
		const dryRun = !!this.options["dry-run"];
		const snapshotKeep = this.options["snapshot-keep"]?.[0];
		// A replace always keeps the copy it just made, otherwise there is nothing
		// to restore and the option would mean "replace without a safety net".
		if (snapshotKeep !== undefined && !/^[1-9]\d*$/.test(snapshotKeep)) {
			throw "--snapshot-keep needs a number of 1 or more";
		}

		const templateName = this.options["template-name"]?.[0] ?? DEFAULT_TEMPLATE;
		const fileName = path.basename(filePath);
		const html = readFileSync(filePath, "utf8");
		const sizeLimit = this.config.wikiFileSizeLimit;

		let parsed: ParsedWikiFile;
		try {
			const fileInfo = inspectWikiFile(html, { sizeLimit });
			const $tw = await this.bootForImport(fileInfo.twVersion, wikiSlug, templateName);
			parsed = parseWikiFile($tw, html, { includeSystem, sizeLimit });
		} catch (error) {
			if (error instanceof WikiFileError) throw `${fileName}: ${error.message}`;
			throw error;
		}

		console.log(`${fileName}: TiddlyWiki ${parsed.twVersion} (${parsed.kind}), `
			+ `${parsed.store === "json" ? "JSON" : "classic"} store, ${formatBytes(parsed.sizeBytes)}, `
			+ `${parsed.tiddlers.length} tiddler(s), ${parsed.systemTiddlers.length} system tiddler(s), `
			+ `${parsed.pluginTiddlers.length} plugin tiddler(s)`);

		await this.config.engine.$transaction(async (prisma) => {

			const adminUser = { isAdmin: true } as any;
			let target: WikiImportTarget;
			let slug: string;

			if (create && !dryRun) {
				slug = this.newSlug(parsed);
				const shell = await createWikiShell(prisma, {
					user: adminUser,
					slug,
					bagName: this.options["bag-name"]?.[0] ?? `editions/${slug}`,
					displayName: this.options["display-name"]?.[0] ?? parsed.siteTitle ?? slug,
					templateName,
					adminRoleNames: this.options["owner-roles"] ?? [],
					readerRoleNames: this.options["recipe-users"] ?? [],
				});
				target = { recipeId: shell.recipeId, bagId: shell.bagId, bagName: shell.bagName };
			} else {
				const resolved = await resolveTarget(prisma, {
					create,
					wikiSlug,
					slug: this.options["slug"]?.[0],
					bagName: this.options["bag-name"]?.[0],
					parsed,
				});
				target = resolved.target;
				slug = resolved.slug;
			}

			const plan = await planWikiFileImport(prisma, { parsed, target, mode, includeSystem });
			printPlan(plan, dryRun);

			if (dryRun) return;

			const result = await applyWikiFileImport(prisma, {
				parsed,
				plan,
				user: adminUser,
				slug,
				source: `import of ${fileName}`,
				...(snapshotKeep === undefined ? {} : { snapshotKeep: Number.parseInt(snapshotKeep, 10) }),
			});

			if (create) {
				await writeStarterTiddlers(prisma, {
					target,
					parsed,
					displayName: this.options["display-name"]?.[0] ?? parsed.siteTitle ?? slug,
				});
				console.log(`created the wiki "${slug}" (bag "${target.bagName}")`);
			}

			console.log(`${info.name} complete: ${result.written} tiddler(s) written, `
				+ `${result.deleted} deleted, ${result.unchanged} unchanged`
				+ (result.snapshot ? `; snapshot in the bag "${result.snapshot.bagName}"` : ""));
			if (result.snapshot?.pruned?.length) {
				console.log(`dropped ${result.snapshot.pruned.length} older snapshot(s): `
					+ result.snapshot.pruned.join(", "));
			}
		});

		return null;
	}

	/**
	 * The deserializer only exists inside a booted TiddlyWiki. The version the
	 * file was saved with comes first, so its markup matches what the parser
	 * expects; a version that is not installed falls back to the one the target
	 * wiki, or the template of a new wiki, uses anyway.
	 */
	private async bootForImport(fileVersion: string, wikiSlug: string | undefined, templateName: string) {
		const cache = this.config.pluginCache;
		if (cache.versions.includes(fileVersion)) {
			return bootTiddlyWikiVersion(this.config.wikiPath, fileVersion);
		}

		const fallback = wikiSlug
			? await this.templateVersionOfWiki(wikiSlug)
			: await this.templateVersion(templateName);

		if (!fallback) {
			throw `TiddlyWiki version ${fileVersion} is not installed. Run "update-tiddlywiki" first.`;
		}
		console.log(`TiddlyWiki ${fileVersion} is not installed here; reading the file with ${fallback}`);
		return bootTiddlyWikiVersion(this.config.wikiPath, fallback);
	}

	private async templateVersionOfWiki(slug: string): Promise<string | undefined> {
		const recipe = await this.config.engine.recipe.findUnique({
			where: { slug },
			select: { template: { select: { definition: true } } },
		});
		return recipe ? this.config.pluginCache.versionFromTemplate(recipe.template.definition.twVersion) : undefined;
	}

	private async templateVersion(name: string): Promise<string | undefined> {
		const template = await this.config.engine.template.findUnique({
			where: { name },
			select: { definition: true },
		});
		return template ? this.config.pluginCache.versionFromTemplate(template.definition.twVersion) : undefined;
	}

	/** A slug from --slug, the file's site title, or its name. */
	private newSlug(parsed: ParsedWikiFile): string {
		const slug = slugify(this.options["slug"]?.[0] || parsed.siteTitle || path.basename(this.params[0]));
		return slug || "imported-wiki";
	}
}

/**
 * Resolves the bag an import writes into. For a new wiki the bag does not exist
 * yet, and an empty id makes the plan compare against nothing, which is what a
 * --dry-run needs.
 */
async function resolveTarget(prisma: PrismaTxnClient, options: {
	create: boolean;
	wikiSlug?: string;
	slug?: string;
	bagName?: string;
	parsed: ParsedWikiFile;
}): Promise<{ target: WikiImportTarget; slug: string }> {

	if (options.create) {
		const slug = slugify(options.slug || options.parsed.siteTitle || "imported-wiki");
		const existing = await prisma.recipe.findUnique({ where: { slug }, select: { id: true } });
		if (existing) {
			throw `A wiki with the slug "${slug}" already exists. Use --wiki ${slug} to import into it.`;
		}
		const bagName = options.bagName ?? `editions/${slug}`;
		if (await prisma.bag.findUnique({ where: { name: bagName }, select: { id: true } })) {
			throw `The bag "${bagName}" already exists. Import into its wiki with --wiki.`;
		}
		return { target: { bagId: new IdString(""), bagName }, slug };
	}

	const slug = options.wikiSlug!;
	const recipe = await prisma.recipe.findUnique({
		where: { slug },
		select: { id: true, definition: true },
	});
	if (!recipe) throw `No wiki with the slug "${slug}".`;

	const bagName = options.bagName ?? defaultWriteTargetBag(recipe);
	if (!bagName) throw `The wiki "${slug}" has no default write target; name one with --bag-name.`;
	// Read-only bags stay read-only, whatever the operator is allowed to do
	// elsewhere: an import is a write like any other.
	if (recipe.definition?.readonlyBags?.includes(bagName)) {
		throw `The bag "${bagName}" is a read-only bag of the wiki "${slug}".`;
	}
	const bag = await prisma.bag.findUnique({ where: { name: bagName }, select: { id: true } });
	if (!bag) throw `The bag "${bagName}" of the wiki "${slug}" does not exist.`;

	return {
		target: {
			recipeId: new IdString(recipe.id),
			bagId: new IdString(bag.id),
			bagName,
		},
		slug,
	};
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function printPlan(plan: WikiImportPlan, dryRun: boolean) {
	console.log(`${dryRun ? "would write" : "writing"} into the bag "${plan.target.bagName}" (${plan.mode}): `
		+ `${plan.created.length} new, ${plan.updated.length} changed, ${plan.unchanged.length} unchanged, `
		+ `${plan.deleted.length} deleted`);
	if (plan.created.length) console.log(`  new:     ${printTitles(plan.created)}`);
	if (plan.updated.length) console.log(`  changed: ${printTitles(plan.updated)}`);
	if (plan.deleted.length) console.log(`  deleted: ${printTitles(plan.deleted)}`);
	if (!plan.includeSystem && plan.skippedSystemTitles.length) {
		console.log(`  ${plan.skippedSystemTitles.length} system tiddler(s) left out `
			+ `(--include-system imports them): ${printTitles(plan.skippedSystemTitles)}`);
	}
	if (plan.keptSystemTitles.length) {
		console.log(`  ${plan.keptSystemTitles.length} system tiddler(s) of the wiki kept as they are: `
			+ printTitles(plan.keptSystemTitles));
	}
	if (plan.skippedPluginTitles.length) {
		console.log(`  ${plan.skippedPluginTitles.length} core plugin/theme/library tiddler(s) never imported `
			+ `(a wiki gets them from its recipe): ${printTitles(plan.skippedPluginTitles)}`);
	}
	if (plan.language) {
		const pack = plan.language.packTitle ? ` (pack ${plan.language.packTitle} comes with the file)` : "";
		console.log(plan.language.delivered
			? `  language: ${plan.language.wanted}${pack}`
			: `  language: ${plan.language.wanted} is not taken over - ${plan.language.reason}`);
	}
	for (const row of plan.dropped) {
		console.log(`  ${row.title} not written: ${row.reason}`);
	}
	if (plan.skippedTransientTitles.length) {
		console.log(`  ${plan.skippedTransientTitles.length} session/build tiddler(s) dropped `
			+ `(they belong to one browser session, not to the wiki): ${printTitles(plan.skippedTransientTitles)}`);
	}
	if (plan.mode === "replace" && plan.existingCount > 0) {
		console.log(`  a replace copies "${plan.target.bagName}" into a snapshot bag first`);
	}
}

function printTitles(titles: string[], limit = 12): string {
	const shown = titles.slice(0, limit).join(", ");
	return titles.length > limit ? `${shown}, ... (+${titles.length - limit})` : shown;
}