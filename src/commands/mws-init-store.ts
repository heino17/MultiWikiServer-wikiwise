import { resolve } from "node:path";

import { Commander, CommandInfo } from ".";
import { TiddlerStore } from "../routes/TiddlerStore";
import { readFileSync } from "node:fs";

export const info: CommandInfo = {
	name: "mws-init-store",
	synchronous: true,
};


export class Command {

	get $tw() { return this.commander.$tw; }
	constructor(
		public params: string[],
		public commander: Commander,
		public callback: (err?: any) => void
	) {

	}
	async execute() {

		if (!this.commander.setupRequired) return;

		await this.commander.$transaction(async (prisma) => {
			const userCount = await prisma.users.count();

			if (!userCount) {

				await prisma.roles.createMany({
					data: [
						{ role_id: 1, role_name: "ADMIN", description: "System Administrator" },
						{ role_id: 2, role_name: "USER", description: "Basic User" },
					]
				});

				const user = await prisma.users.create({
					data: { username: "admin", email: "", password: "", roles: { connect: { role_id: 1 } } },
					select: { user_id: true }
				});

				const password = await this.commander.PasswordService.PasswordCreation(user.user_id.toString(), "1234");

				await prisma.users.update({
					where: { user_id: user.user_id },
					data: { password: password }
				});

			}

		});

		this.commander.addCommandTokens([
			"--mws-load-plugin-bags",
			"--mws-load-wiki-folder", "./editions/multiwikidocs",
			"mws-docs", "MWS Documentation from https://mws.tiddlywiki.com",
			"mws-docs", "MWS Documentation from https://mws.tiddlywiki.com",
			"--mws-load-wiki-folder", "./node_modules/tiddlywiki/editions/tw5.com",
			"docs", "TiddlyWiki Documentation from https://tiddlywiki.com",
			"docs", "TiddlyWiki Documentation from https://tiddlywiki.com",
			"--mws-load-wiki-folder", "./node_modules/tiddlywiki/editions/dev",
			"dev", "TiddlyWiki Developer Documentation from https://tiddlywiki.com/dev",
			"dev-docs", "TiddlyWiki Developer Documentation from https://tiddlywiki.com/dev",
			"--mws-load-wiki-folder", "./node_modules/tiddlywiki/editions/tour",
			"tour", "TiddlyWiki Interactive Tour from https://tiddlywiki.com",
			"tour", "TiddlyWiki Interactive Tour from https://tiddlywiki.com",
		]);

		this.commander.setupRequired = false;
	}
}

