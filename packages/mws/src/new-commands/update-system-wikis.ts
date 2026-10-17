import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";
import { syncBundledSystemWikis } from "../new-managers/system-wikis";

const info: CommandInfo = {
	name: "update-system-wikis",
	description: "Reload the system wikis this build ships (the documentation and the SimpleWiki manual) into this store, and drop the ones it no longer ships",
	arguments: [],
};

/**
 * The explicit half of the system-wiki update: the server already syncs the
 * shipped editions on start, but only when they differ from the one recorded
 * for the store. This command applies whatever the build ships — it repairs a
 * damaged system wiki and can also move a store back to a build with a different
 * edition — removes the system wikis the build no longer ships, and says what
 * happened.
 */
export class UpdateSystemWikisCommand extends BaseCommand {
	static info = info;

	async execute() {
		const outcome = await syncBundledSystemWikis(this.config, "force");

		for (const result of outcome.loaded) {
			switch (result.action) {
				case "created":
					console.log(`System wiki "${result.slug}" created from the shipped edition.`);
					break;
				case "updated":
					console.log(`System wiki "${result.slug}" reloaded from the shipped edition.`);
					break;
				case "skipped":
					console.log(`System wiki "${result.slug}" skipped: ${result.reason}`);
					break;
				default:
					console.log(`System wiki "${result.slug}" already matches the shipped edition; nothing changed.`);
					break;
			}
		}

		for (const slug of outcome.retired) {
			console.log(`Retired system wiki "${slug}" removed: this build no longer ships it.`);
		}
	}
}
