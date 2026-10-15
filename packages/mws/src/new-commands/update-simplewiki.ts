import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";
import {
	SIMPLEWIKI_TEMPLATE,
	bundledSimpleWikiShellPath,
	syncBundledSimpleWikiTemplate,
} from "../new-managers/simplewiki-template";

const info: CommandInfo = {
	name: "update-simplewiki",
	description: "Update the SimpleWiki template in this store from the simplewiki.html this build ships, so existing wikis can adopt the newer shell",
	arguments: [],
};

/**
 * The explicit half of the shell update: the server already syncs the bundled
 * shell on start, but only forward and only when the shell declares a newer
 * version. This command applies whatever the build ships, keeps the template's
 * permissions, and says what happened. The shell never reaches the wikis
 * itself: it mints a release, and `notify` wikis show their owner the update
 * hint while `auto` wikis follow.
 */
export class UpdateSimpleWikiCommand extends BaseCommand {
	static info = info;

	async execute() {
		if (!bundledSimpleWikiShellPath()) {
			console.log("This build ships no templates/simplewiki.html; nothing to update.");
			return;
		}

		const result = await syncBundledSimpleWikiTemplate(this.config.engine, "force");
		const from = result.fromLabel ?? "no label";
		const to = result.toLabel ?? "no label";

		switch (result.action) {
			case "created":
				console.log(`Template "${SIMPLEWIKI_TEMPLATE}" created from the bundled shell (${to}).`);
				break;
			case "updated":
				console.log(`Template "${SIMPLEWIKI_TEMPLATE}" updated (${from} -> ${to}, release ${result.release}).`);
				break;
			default:
				console.log(`Template "${SIMPLEWIKI_TEMPLATE}" already serves the bundled shell (${to}); nothing changed.`);
				break;
		}

		console.log("Existing wikis adopt it through their shell policy: \"auto\" follows, \"notify\" asks the owner first.");
	}
}
