/*\
title: $:/plugins/tiddlywiki/multiwikiserver/commands/mws-load-wiki-folder.js
type: application/javascript
module-type: command

Command to create and load a bag for the specified core editions

--load-wiki-folder <path> <bag-name> <bag-description> <recipe-name> <recipe-description>

\*/


import { resolve } from "path";
import { BaseCommand } from "../utils/BaseCommand";
import type { CommandInfo } from "../commander";
import { TiddlerStore } from "../routes/TiddlerStore";
import { TiddlerFields } from "../services/attachments";
import * as path from "path";
import * as fs from "fs";
import { TW } from "tiddlywiki";
import { truthy } from "../utils";
import { CacheState } from "../routes/cache";

export const info: CommandInfo = {
	name: "load-wiki-folder",
	description: "Load a TiddlyWiki folder into a bag",
	arguments: [
		["path", "Path to the TiddlyWiki5 plugins folder"],
		["bag-name", "Name of the bag to load tiddlers into"],
		["bag-description", "Description of the bag"],
		["recipe-name", "Name of the recipe to create"],
		["recipe-description", "Description of the recipe"],
	],
	synchronous: true
};
// tiddlywiki --load ./mywiki.html --savewikifolder ./mywikifolder
export class Command extends BaseCommand {


	async execute() {

		// Check parameters
		if (this.params.length < 5) {
			return "Missing parameters for --mws-load-wiki-folder command";
		}

		await this.config.engine.$transaction(loadWikiFolder({
			wikiPath: this.params[0] as string,
			bagName: this.params[1] as PrismaField<"Bags", "bag_name">,
			bagDescription: this.params[2] as PrismaField<"Bags", "description">,
			recipeName: this.params[3] as PrismaField<"Recipes", "recipe_name">,
			recipeDescription: this.params[4] as PrismaField<"Recipes", "description">,
			store: TiddlerStore.fromCommander(this.commander, this.config.engine),
			$tw: this.commander.$tw,
			cache: this.config.pluginCache
		}));
		console.log(info.name, "complete:", this.params[0])
		return null;
	}


	async test() {
		const checkBags = await this.config.engine.bags.findMany({
			where: { bag_name: { startsWith: "$:/" } },
			select: { bag_name: true, tiddlers: { select: { title: true } } }
		});
		checkBags.forEach(e => {
			e.tiddlers.forEach(f => {
				if (f.title as string !== e.bag_name as string) {
					if (e.bag_name === "$:/plugins/tiddlywiki/codemirror-fullscreen-editing"
						&& f.title === "$:/plugins/tiddlywiki/codemirror-fullscreen"
					) return;
					console.log(`The bag ${e.bag_name} has a tiddler ${f.title}, in the future this will be unsupported. This can occur if the top bag in a recipe is one of the system bags (starting with $:/)`)
				}
			});
		});
	}
}


// Copy TiddlyWiki core editions
function loadWikiFolder({ $tw, store, cache, ...options }: {
	wikiPath: string,
	bagName: PrismaField<"Bags", "bag_name">,
	bagDescription: PrismaField<"Bags", "description">,
	recipeName: PrismaField<"Recipes", "recipe_name">,
	recipeDescription: PrismaField<"Recipes", "description">,
	store: TiddlerStore,
	$tw: TW,
	cache: CacheState,
}) {
	const pluginNamesTW5: string[] = [];
	const tiddlersFromPath = loadWikiTiddlers($tw, options.wikiPath, [], pluginNamesTW5);
	// Add plugins to the recipe list
	const recipeList = [];
	// Create the recipe
	recipeList.push({
		bag_name: options.bagName,
		with_acl: true as PrismaField<"Recipe_bags", "with_acl">,
	});
	recipeList.reverse();

	const is_plugin = false as PrismaField<"Bags", "is_plugin">;

	const plugins = pluginNamesTW5.map(e => ({
		plugin: cache.filePlugins.get(path.join("tiddlywiki", e)),
		folder: e,
	}));

	plugins.forEach(e => {
		if (!e.plugin) console.log(`Folder ${options.wikiPath} missing ${e.folder}.`)
	});

	return [
		// create the bag
		store.upsertBag_PrismaPromise(options.bagName, options.bagDescription, is_plugin),
		// create the recipe and recipe_bags entries
		...store.upsertRecipe_PrismaArray(
			options.recipeName,
			options.recipeDescription,
			recipeList,
			plugins.map(e => e.plugin).filter(truthy)
		),
		// save the tiddlers (this will skip attachments)
		...store.saveTiddlersFromPath_PrismaArray(tiddlersFromPath, options.bagName)
	];

}

function loadWikiTiddlers($tw: TW, wikiPath: string, parentPaths: string[], pluginNamesTW5: string[]) {
	// Read the tiddlywiki.info file
	const wikiInfoPath = path.resolve(wikiPath, $tw.config.wikiInfo);
	let wikiInfo: any;
	if (fs.existsSync(wikiInfoPath)) {
		wikiInfo = $tw.utils.parseJSONSafe(fs.readFileSync(wikiInfoPath, "utf8"), function () { return null; });
	}
	if (!wikiInfo) return [];

	const tiddlersFromPath: { tiddlers: TiddlerFields[] }[] = [];

	if (wikiInfo.includeWikis) {
		parentPaths = parentPaths.slice(0);
		parentPaths.push(wikiPath);
		$tw.utils.each(wikiInfo.includeWikis, function (info) {
			if (typeof info === "string") {
				info = { path: info };
			}
			var resolvedIncludedWikiPath = path.resolve(wikiPath, info.path);
			if (parentPaths.indexOf(resolvedIncludedWikiPath) === -1) {
				tiddlersFromPath.push(...loadWikiTiddlers($tw, resolvedIncludedWikiPath, parentPaths, pluginNamesTW5));
			} else {
				$tw.utils.error("Cannot recursively include wiki " + resolvedIncludedWikiPath);
			}
		});
	}


	const twFolder = path.join($tw.boot.corePath, "..");
	const extraPlugins: string[] = [];

	const loadPlugins = (plugins: string[], libraryPath: any, envVar: any) => {
		$tw.utils.each(plugins, function (pluginName: string) {
			const pluginPaths = $tw.getLibraryItemSearchPaths(libraryPath, envVar);
			const pluginPath = $tw.findLibraryItem(pluginName, pluginPaths);
			if (!pluginPath) return;
			const relPath = path.relative(twFolder, pluginPath);
			if (relPath.startsWith("..")) extraPlugins.push(pluginPath);
			else pluginNamesTW5.push(relPath);
		});
	}

	loadPlugins(wikiInfo.plugins, $tw.config.pluginsPath, $tw.config.pluginsEnvVar);
	loadPlugins(wikiInfo.themes, $tw.config.themesPath, $tw.config.themesEnvVar);
	loadPlugins(wikiInfo.languages, $tw.config.languagesPath, $tw.config.languagesEnvVar);

	const tiddler_files_path = path.resolve(wikiPath, $tw.config.wikiTiddlersSubDir);

	tiddlersFromPath.push(...$tw.loadTiddlersFromPath(resolve(tiddler_files_path)) as any);

	const loadWikiPlugins = (wikiPluginsPath: string) => {
		if (fs.existsSync(wikiPluginsPath)) {
			var pluginFolders = fs.readdirSync(wikiPluginsPath);
			for (var t = 0; t < pluginFolders.length; t++) {
				extraPlugins.push(path.resolve(wikiPluginsPath, "./" + pluginFolders[t]));
			}
		}
	}

	loadWikiPlugins(path.resolve(wikiPath, $tw.config.wikiPluginsSubDir));
	loadWikiPlugins(path.resolve(wikiPath, $tw.config.wikiThemesSubDir));
	loadWikiPlugins(path.resolve(wikiPath, $tw.config.wikiLanguagesSubDir));

	extraPlugins.forEach((e) => {
		const plugin = $tw.loadPluginFolder(e);
		if (!plugin) {
			console.log(`No plugin found at ${e}`);
		} else if (!plugin.title) {
			console.log(`Found a valid plugin at ${e} but it doesn't have a title.`);
		} else {
			console.log(`Loading plugin ${e} into bag since it isn't a TiddlyWiki plugin`);
			tiddlersFromPath.push({ tiddlers: [plugin as TiddlerFields] });
		}
		return undefined;
	});

	return tiddlersFromPath;

}

