import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";
import * as path from "path";
import {
	INJECTION_LOCATION,
	readSimpleWikiShell,
	SIMPLEWIKI_TEMPLATE,
	upsertSimpleWikiTemplate,
} from "../new-managers/simplewiki-template";

export { readSimpleWikiShell, SIMPLEWIKI_TEMPLATE };

const info: CommandInfo = {
	name: "provision-simplewiki",
	description: "Create or update the SimpleWiki template from a built simplewiki.html, so wikis can be created that serve the SimpleWiki interface instead of TiddlyWiki",
	arguments: [
		["path", "Path to the built simplewiki.html"],
	],
	options: [
		["template <string>", `Name of the template to write (default: ${SIMPLEWIKI_TEMPLATE}).`],
		["users <string...>", "Roles that may create wikis from this template (default: every role with teacher capability)."],
	],
};

type ProvisionSimpleWikiOptions = {
	"template"?: [string];
	"users"?: string[];
};

export class ProvisionSimpleWikiCommand extends BaseCommand<[string], ProvisionSimpleWikiOptions> {
	static info = info;

	async execute() {
		if (this.params.length < 1) {
			throw "Missing parameters for provision-simplewiki command";
		}

		const filePath = path.resolve(this.params[0]);
		const templateName = this.options["template"]?.[0] ?? SIMPLEWIKI_TEMPLATE;
		const { html, bytes } = readSimpleWikiShell(filePath);

		const result = await upsertSimpleWikiTemplate(this.config.engine, html, {
			templateName,
			userRoleNames: this.options["users"],
		});

		console.log(`Template "${templateName}" ${result.action} (id ${result.id})`);
		console.log(`  shell      ${filePath}`);
		console.log(`  size       ${(bytes / 1024).toFixed(1)} kB`);
		console.log(`  injects    $tw.preloadTiddler behind a single ${INJECTION_LOCATION}`);
		console.log(`  editable   ADMIN`);
		console.log(`  may use    ${result.mayUse.join(", ") || "(nobody yet)"}`);
		console.log("");
		console.log("New wikis are created from it in the admin app under \"Create a wiki\".");
	}
}
