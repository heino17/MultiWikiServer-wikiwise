import { resolve } from "path";
import { CommandInfo, Commander } from ".";
import { TiddlerStore } from "../routes/TiddlerStore";
import { RouterConfig } from "../router";

export const info: CommandInfo = {
	name: "mws-load-tiddlers",
	synchronous: true
};

export class Command {
	get $tw() { return this.commander.$tw as { utils: any, loadTiddlersFromPath: any }; }
	config: RouterConfig;
	tiddlersPath: string;
	bagName: PrismaField<"Bags", "bag_name">;
	constructor(
		public params: string[],
		public commander: Commander,
		public callback: (err?: any) => void
	) {
		this.config = this.commander.router.config;
		this.tiddlersPath = resolve(this.params[0] as string);
		this.bagName = this.params[1] as PrismaField<"Bags", "bag_name">;
	}
	async execute() {
		if (this.params.length < 2) return "Missing pathname and/or bag name";
		await this.commander.router.engine.$transaction(async (prisma) => {
			const store = new TiddlerStore(this.commander.router.config, prisma as any);
			var tiddlersFromPath = this.$tw.loadTiddlersFromPath(this.tiddlersPath);
			await store.saveTiddlersFromPath(tiddlersFromPath, this.bagName);
		});
		return null;

	}
}
