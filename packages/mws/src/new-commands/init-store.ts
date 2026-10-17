import { dist_require_resolve, dist_resolve } from "@tiddlywiki/server";
import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";
import { existsSync } from "fs";
import { resolve } from "path";
import { readSimpleWikiShell, upsertSimpleWikiTemplate } from "../new-managers/simplewiki-template";
import { bundledSystemWikiPath, loadSystemWiki, SYSTEM_WIKIS } from "../new-managers/system-wikis";
import { RoleImportWriter, TemplateImportWriter, UserImportWriter, DEFAULT_TEMPLATE } from "../new-managers";
import { IdString } from "@mws/admin-vanilla/src/definition/tabs";

const info: CommandInfo = {
	name: "init-store",
	description: "Initialize the MWS data folder",
	arguments: [],
};

/**
 * The TiddlyWiki UI languages the default template carries (§138). TiddlyWiki
 * ships every one of them with each install; the MWS plugin cache scans the
 * `languages/` folder, so the titles resolve without a download. A new wiki
 * gets them so it can follow the visitor's browser language out of the box.
 * `zh-Hans` is the full Simplified Chinese plugin; `zh-CN` is only an alias
 * whose content lives in `zh-Hans`, so listing the latter is enough.
 */
const DEFAULT_TEMPLATE_LANGUAGES = [
	"$:/languages/de-DE",
	"$:/languages/es-ES",
	"$:/languages/fr-FR",
	"$:/languages/ja-JP",
	"$:/languages/ko-KR",
	"$:/languages/ru-RU",
	"$:/languages/zh-Hans",
];


export class InitStoreCommand extends BaseCommand {
	static info = info;

	async execute(): Promise<any> {
		await this.setupStore().catch((err) => {
			throw err;
		});
	}

	async setupStore() {
		await this.config.engine.$transaction(async prisma => {
			const roles = await new RoleImportWriter(prisma, true).upsert([
				{ name: "ADMIN", description: "System Administrator", isTeacher: false },
				{ name: "USER", description: "Basic User", isTeacher: false },
				{ name: "TEACHER", description: "Teacher: manages their own students (users they invite)", isTeacher: true },
				{ name: "ANON", description: "Anonymous users (not logged in)", isTeacher: false },
			]);

			const adminRole = roles.find((role) => role.role_name === "ADMIN");
			if (!adminRole)
				throw new Error("Failed to create ADMIN role during store initialization.");


			await new TemplateImportWriter(prisma, true).upsert([{
				name: DEFAULT_TEMPLATE,
				definition: {
					type: "simpleV1",
					description: "The default template, blank and uneditable.",
					readonlyBags: [],
					writablePrefixBags: [],
					plugins: DEFAULT_TEMPLATE_LANGUAGES,
					requiredPluginsEnabled: true,
					customHtmlEnabled: false,
					externalPlugins: true,
					externalStore: false,
					twVersion: null,
					htmlContent: "",
					injectionFunction: "",
					injectionLocation: "",
				},
				permissions: [{ level: "B_write", role_id: new IdString(adminRole.role_id) }]
			}]);

			const userCount = await prisma.users.count();
			if (userCount) return;

			const [admin] = await new UserImportWriter(prisma, true).upsert([
				{ username: "admin", email: "", resetCode: null, roleIds: [new IdString(adminRole.role_id)], wikiLimit: null },
			]);

			const password = await this.config.PasswordService.PasswordCreation(admin.user_id, "1234");

			await prisma.users.update({
				where: { user_id: admin.user_id },
				data: { password: password },
			});

		});

		console.log("Default user created with username 'admin' and password '1234'. Please change this password after logging in.");

		// A fresh store ships the SimpleWiki template, so an operator does not
		// have to run `provision-simplewiki` by hand after the first start. Only
		// on a store that lacks it: an admin may have updated the shell, and a
		// repeated init-store must not roll that back. `provision-simplewiki`
		// stays the update path.
		const simpleWikiShell = dist_resolve("../templates/simplewiki.html");
		if (existsSync(simpleWikiShell)) {
			const { html, bytes } = readSimpleWikiShell(simpleWikiShell);
			const result = await upsertSimpleWikiTemplate(this.config.engine, html, { ifAbsentOnly: true });
			if (result.action === "created") {
				console.log(`Template "SimpleWiki" created from templates/simplewiki.html (${(bytes / 1024).toFixed(1)} kB).`);
			} else {
				console.log(`Template "SimpleWiki" already present; left untouched.`);
			}
		} else {
			console.log("No templates/simplewiki.html in this build; skipping the SimpleWiki template.");
		}

		// System wikis are the ownerless wikis: their bag is the shipped
		// `editions/<slug>`, and the shared definition also names the shell the
		// wiki serves — the manual the SimpleWiki one, the documentation the
		// default TiddlyWiki one. The definitions live in one place, so the
		// start-time sync and `update-system-wikis` load exactly what a fresh
		// store is built with.
		for (const def of SYSTEM_WIKIS) {
			if (!bundledSystemWikiPath(def.slug)) {
				console.log(`Skipping ${def.slug}: the wiki folder editions/${def.slug} is not part of this installation.`);
				continue;
			}
			// A fresh store has nothing to overwrite, so this is a plain load.
			// It also records the edition hash — the value the start-time sync
			// compares against — so a store built here is already up to date.
			await loadSystemWiki(this.config, def, false);
		}

		this.config.setupRequired = false;
	}
}
