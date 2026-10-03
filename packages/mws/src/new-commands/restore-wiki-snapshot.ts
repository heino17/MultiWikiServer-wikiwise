import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";
import { serverEvents } from "@tiddlywiki/events";
import { IdString } from "@mws/admin-vanilla/src/definition/tabs";
import { WikiImportTarget, defaultWriteTargetBag, planTiddlers, applyTiddlers } from "../new-managers/importWikiFile";
import { listSnapshotBags, readSnapshotTiddlers } from "../new-managers/WikiSnapshotBag";

serverEvents.on("cli.register", (commands) => {
	commands[info.name] = { info, Command: RestoreWikiSnapshotCommand };
});

const info: CommandInfo = {
	name: "restore-wiki-snapshot",
	description: "Put the content of a snapshot bag back into a wiki",
	arguments: [
		["snapshot-bag", "Name of the snapshot bag, or the slug of a wiki with --list"],
	],
	options: [
		["to <string>", "Slug of the wiki to restore the snapshot into."],
		["list", "List the snapshot bags of a wiki instead of restoring one."],
		["dry-run", "Only report what would change."],
		["snapshot-keep <number>", "How many snapshots to keep per wiki (default 10)."],
	],
};

type RestoreWikiSnapshotOptions = {
	"to"?: [string];
	"list"?: boolean;
	"dry-run"?: boolean;
	"snapshot-keep"?: [string];
};

export class RestoreWikiSnapshotCommand extends BaseCommand<[string], RestoreWikiSnapshotOptions> {
	static info = info;

	async execute() {

		if (this.params.length < 1) {
			throw "Missing parameters for restore-wiki-snapshot command";
		}

		const snapshotBagName = this.params[0];

		if (this.options["list"]) {
			const snapshots = await this.config.engine.$transaction(prisma =>
				listSnapshotBags(prisma, this.params[0].includes("/") ? undefined : this.params[0]));
			if (!snapshots.length) {
				console.log(`no snapshots found for "${this.params[0]}"`);
			}
			for (const snapshot of snapshots) {
				console.log(`${snapshot.bagName}  ${snapshot.created}  ${snapshot.count} tiddler(s)  `
					+ `before ${snapshot.source || snapshot.sourceBagName}`);
			}
			return null;
		}

		const wikiSlug = this.options["to"]?.[0];
		if (!wikiSlug) throw "Say which wiki to restore into: --to <slug>";

		const snapshotKeep = this.options["snapshot-keep"]?.[0];
		if (snapshotKeep !== undefined && !/^[1-9]\d*$/.test(snapshotKeep)) {
			throw "--snapshot-keep needs a number of 1 or more";
		}

		await this.config.engine.$transaction(async (prisma) => {

			const recipe = await prisma.recipe.findUnique({
				where: { slug: wikiSlug },
				select: { id: true, definition: true },
			});
			if (!recipe) throw `No wiki with the slug "${wikiSlug}".`;

			const bagName = defaultWriteTargetBag(recipe);
			if (!bagName) throw `The wiki "${wikiSlug}" has no default write target.`;
			if (recipe.definition?.readonlyBags?.includes(bagName)) {
				throw `The bag "${bagName}" is a read-only bag of the wiki "${wikiSlug}".`;
			}
			const bag = await prisma.bag.findUnique({ where: { name: bagName }, select: { id: true } });
			if (!bag) throw `The bag "${bagName}" of the wiki "${wikiSlug}" does not exist.`;

			const target: WikiImportTarget = {
				recipeId: new IdString(recipe.id),
				bagId: new IdString(bag.id),
				bagName,
			};

			const tiddlers = await readSnapshotTiddlers(prisma, snapshotBagName);

			// A snapshot is a complete copy of the wiki's own bag: the restore
			// reproduces it exactly, system tiddlers included.
			const plan = await planTiddlers(prisma, { tiddlers, target, mode: "replace", keepTargetSystem: false });
			console.log(`${this.options["dry-run"] ? "would restore" : "restoring"} ${tiddlers.length} tiddler(s) `
				+ `from "${snapshotBagName}" into "${bagName}": ${plan.created.length} new, `
				+ `${plan.updated.length} changed, ${plan.unchanged.length} unchanged, ${plan.deleted.length} deleted`);

			if (this.options["dry-run"]) return;

			const result = await applyTiddlers(prisma, {
				tiddlers,
				plan,
				user: { isAdmin: true } as any,
				slug: wikiSlug,
				source: `restore of ${snapshotBagName}`,
				...(snapshotKeep === undefined ? {} : { snapshotKeep: Number.parseInt(snapshotKeep, 10) }),
			});

			console.log(`${info.name} complete: ${result.written} tiddler(s) written, ${result.deleted} deleted`
				+ (result.snapshot ? `; the previous content is in the bag "${result.snapshot.bagName}"` : ""));
		});

		return null;
	}
}