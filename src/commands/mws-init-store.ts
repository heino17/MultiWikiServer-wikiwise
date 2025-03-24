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

		await this.commander.libsql.executeMultiple(readFileSync("./prisma/schema.prisma.sql", "utf8"));

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
	}
}

