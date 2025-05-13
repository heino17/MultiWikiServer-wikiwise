import { resolve } from "node:path";

import type { CommandInfo } from "../commander";
import { BaseCommand } from "../utils/BaseCommand";
import { dist_require_resolve, dist_resolve } from "../utils";

export const info: CommandInfo = {
	name: "init-store",
	description: "Initialize the MWS data folder",
	arguments: [],
	synchronous: true,
};


export class Command extends BaseCommand {

	async execute() {

		if (!this.config.setupRequired) return;

		await this.config.$transaction(async (prisma) => {
			const userCount = await prisma.users.count();

			if (!userCount) {

				await prisma.roles.createMany({
					data: [
						{ role_name: "ADMIN", description: "System Administrator" },
						{ role_name: "USER", description: "Basic User" },
					]
				});

				const user = await prisma.users.create({
					data: { username: "admin", email: "", password: "", roles: { connect: { role_name: "ADMIN" } } },
					select: { user_id: true }
				});

				const password = await this.config.PasswordService.PasswordCreation(user.user_id.toString(), "1234");

				await prisma.users.update({
					where: { user_id: user.user_id },
					data: { password: password }
				});

			}

		});
		// should give us the path to boot.js
		const tweditions = resolve(dist_require_resolve("tiddlywiki"), "../../editions");
		this.commander.addCommandTokens([
			"--load-plugin-bags",
			"--load-wiki-folder", dist_resolve("../editions/mws-docs"),
			"mws-docs", "MWS Documentation from https://mws.tiddlywiki.com",
			"mws-docs", "MWS Documentation from https://mws.tiddlywiki.com",
			"--load-wiki-folder", resolve(tweditions, "tw5.com"),
			"docs", "TiddlyWiki Documentation from https://tiddlywiki.com",
			"docs", "TiddlyWiki Documentation from https://tiddlywiki.com",
			"--load-wiki-folder", resolve(tweditions, "dev"),
			"dev", "TiddlyWiki Developer Documentation from https://tiddlywiki.com/dev",
			"dev-docs", "TiddlyWiki Developer Documentation from https://tiddlywiki.com/dev",
			"--load-wiki-folder", resolve(tweditions, "tour"),
			"tour", "TiddlyWiki Interactive Tour from https://tiddlywiki.com",
			"tour", "TiddlyWiki Interactive Tour from https://tiddlywiki.com",
			"--divider",
		]);

		this.config.setupRequired = false;
	}
}

