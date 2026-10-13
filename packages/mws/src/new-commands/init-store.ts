import { dist_require_resolve, dist_resolve } from "@tiddlywiki/server";
import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";
import { existsSync } from "fs";
import { resolve } from "path";
import { readSimpleWikiShell, upsertSimpleWikiTemplate } from "../new-managers/simplewiki-template";
import { LoadWikiFolderCommand } from "./load-wiki-folder";
import { RoleImportWriter, TemplateImportWriter, UserImportWriter, DEFAULT_TEMPLATE } from "../new-managers";
import { IdString } from "@mws/admin-vanilla/src/definition/tabs";

const info: CommandInfo = {
	name: "init-store",
	description: "Initialize the MWS data folder",
	arguments: [],
};


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
					plugins: [],
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

		// System wikis are the ownerless wikis: their bag falls back to
		// `editions/<slug>` instead of `editions/<owner-id>/<slug>` and they are
		// loaded from a folder that ships with the installation. `templateName`
		// chooses the shell the wiki serves; the manual uses the SimpleWiki
		// template, the documentation the default TiddlyWiki one.
		const runner = async (path: string, bagName: string, bagDesc: string, recName: string, recDesc: string, recUsers: string[] = [], templateName = DEFAULT_TEMPLATE) => {
			if (!existsSync(path)) {
				console.log(`Skipping ${recName}: the wiki folder ${path} is not part of this installation.`);
				return;
			}
			const command = new LoadWikiFolderCommand([path!], {
				"bag-relative-root": [dist_resolve("..")],
				"bag-description": [bagDesc],
				"recipe-name": [recName],
				"recipe-description": [recDesc],
				"recipe-users": recUsers,
				"template-name": [templateName],
				"overwrite": false,
				"owner-roles": ["ADMIN"]
			});
			command.config = this.config;
			await command.execute();
		};

		await runner(
			dist_resolve("../editions/mws-docs"),
			"mws-docs", "MWS Documentation from https://mws.tiddlywiki.com",
			"mws-docs", "MWS Documentation from https://mws.tiddlywiki.com",
		);

		// The manual is a system wiki too, but it serves the SimpleWiki shell
		// rather than a TiddlyWiki page. Its content lives in `editions/simplewiki-manual`
		// and is loaded with the SimpleWiki template, so a fresh installation has
		// the manual at `/wiki/simplewiki-manual` without anyone clicking it
		// together first.
		await runner(
			dist_resolve("../editions/simplewiki-manual"),
			"simplewiki-manual", "MWS Bedienungsanleitung (SimpleWiki)",
			"simplewiki-manual", "MWS Bedienungsanleitung (SimpleWiki)",
			["ANON"], "SimpleWiki"
		);

		this.config.setupRequired = false;
	}
}
