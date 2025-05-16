import { resolve } from "path";
import type { CommandInfo } from "../utils/BaseCommand";
import { BaseCommand } from "../utils/BaseCommand";
import { TiddlerStore } from "../routes/TiddlerStore";

export const info: CommandInfo = {
	name: "load-tiddlers",
	description: "Load tiddlers from a folder into a bag",
	arguments: [
		["path", "Path to the TiddlyWiki5 plugins folder"],
		["bag-name", "Name of the bag to load tiddlers into"],
	],
};

export class Command extends BaseCommand {

	tiddlersPath: string;
	bagName: PrismaField<"Bags", "bag_name">;

	constructor(...args: ConstructorParameters<typeof BaseCommand>) {
		super(...args);
		this.tiddlersPath = resolve(this.params[0] as string);
		this.bagName = this.params[1] as PrismaField<"Bags", "bag_name">;
	}

	async execute() {

		if (this.params.length < 2) return "Missing pathname and/or bag name";
		await this.config.$transaction(async (prisma) => {
			const store = TiddlerStore.fromConfig(this.config, prisma);
			var tiddlersFromPath = this.$tw.loadTiddlersFromPath(this.tiddlersPath);
			//@ts-ignore
			await store.saveTiddlersFromPath(tiddlersFromPath, this.bagName);
		});
		return null;

	}
}
