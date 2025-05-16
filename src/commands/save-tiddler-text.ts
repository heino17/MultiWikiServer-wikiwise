import type { CommandInfo } from "../utils/BaseCommand";
import { BaseCommand } from "../utils/BaseCommand";
import { TiddlerStore } from "../routes/TiddlerStore";

export const info: CommandInfo = {
	name: "save-tiddler-text",
	description: "Save a tiddler text to a bag",
	arguments: [
		["bag-name", "Name of the bag to save tiddler to"],
		["tiddler-title", "Title of the tiddler to save"],
		["tiddler-text", "Text of the tiddler to save"],
	],
};

export class Command extends BaseCommand {


	async execute() {

		if (this.params.length < 3) throw "Missing parameters";

		var bagName = this.params[0] as PrismaField<"Bags", "bag_name">,
			tiddlerTitle = this.params[1] as PrismaField<"Tiddlers", "title">,
			tiddlerText = this.params[2] as string;

		await this.config.$transaction(async (prisma) => {
			const store = TiddlerStore.fromConfig(this.config, prisma);
			await store.saveBagTiddler({ title: tiddlerTitle, text: tiddlerText }, bagName);
		});

	}
}

