import { Commander, CommandInfo } from "../commander";
import { TiddlerStore } from "../routes/TiddlerStore";

export const info: CommandInfo = {
	name: "mws-save-tiddler-text",
	synchronous: true
};

export class Command {

	constructor(
		public params: string[],
		public commander: Commander,
		public callback: (err?: any) => void
	) {

	}
	async execute() {

		if (this.params.length < 3) throw "Missing parameters";

		var bagName = this.params[0] as PrismaField<"Bags", "bag_name">,
			tiddlerTitle = this.params[1] as PrismaField<"Tiddlers", "title">,
			tiddlerText = this.params[2] as string;

		await this.commander.$transaction(async (prisma) => {
			const store = new TiddlerStore(this.commander, prisma);
			await store.saveBagTiddler({ title: tiddlerTitle, text: tiddlerText }, bagName);
		});

	}
}

