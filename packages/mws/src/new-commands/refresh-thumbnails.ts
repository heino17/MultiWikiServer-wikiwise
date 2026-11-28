import { BaseCommand, CommandInfo } from "@tiddlywiki/commander";
import { clearThumbnailCache } from "../new-managers/WikiThumbnailRoutes";

const info: CommandInfo = {
	name: "refresh-thumbnails",
	description: "Discard cached wiki thumbnails so they are rendered again",
	arguments: [],
	options: [
		["slug <string>", "Discard only the preview of this wiki slug."],
	],
	getHelp() {
		return [
			"",
			"Thumbnails are cached under store/thumbnails/ and deliberately kept",
			"when a wiki is edited (§75). After installing a browser, libraries or",
			"fonts, the old pictures stay in place until the cache TTL expires.",
			"This command removes the PNGs; the next visit to the admin Wikis list",
			"renders them again with the current environment. Wiki content is never",
			"touched, and a failed render still leaves the wiki itself intact.",
		].join("\n");
	},
};

type RefreshThumbnailsOptions = {
	"slug"?: [string];
};

export class RefreshThumbnailsCommand extends BaseCommand<[], RefreshThumbnailsOptions> {
	static info = info;

	async execute() {
		const slug = this.options.slug?.[0];
		if (slug) {
			const recipe = await this.config.engine.recipe.findUnique({
				where: { slug },
				select: { id: true },
			});
			if (!recipe) throw `No wiki with the slug "${slug}".`;
		}
		const removed = await clearThumbnailCache(this.config.storePath, slug);
		console.log(
			`Removed ${removed} cached thumbnail file(s)${slug ? ` for "${slug}"` : ""}. `
			+ "They will be rendered again on the next admin Wikis view.",
		);
		return { removed };
	}
}
