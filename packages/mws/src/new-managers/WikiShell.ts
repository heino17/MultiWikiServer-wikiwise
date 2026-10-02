import { IdString } from "@mws/admin-vanilla/src/definition/tabs";
import { ServerRequest } from "@tiddlywiki/server";
import { TiddlerFields } from "tiddlywiki";
import { toMappingRows } from "../new-managers";
import { BagDataAdapter, RecipeDataAdapter } from "./TabDataAdapter";
import { ParsedWikiFile } from "./WikiFileImport";
import { WikiStore } from "./RecipeResolver";

/**
 * The bag-and-recipe pair of a new wiki, without any tiddler.
 *
 * Both entry points of the import - the `import-wiki-file` command and the
 * admin dialog (`WikiFileRoutes.ts`) - create the wiki through here, so a wiki
 * made from a file is the same wiki the admin app would have created. The bag
 * and the recipe are created inside the caller's transaction: if the import
 * that follows fails, no half-built wiki is left behind.
 *
 * The starter tiddlers are deliberately *not* written here. They are written
 * after the import (see writeStarterTiddlers), otherwise the plan of a replace
 * would list them as tiddlers the file is missing.
 */

export interface WikiShellOptions {
  user: ServerRequest["user"];
  slug: string;
  displayName: string;
  bagName: string;
  templateName: string;
  description?: string;
  /** Roles that get C_admin on the bag and B_write on the recipe. */
  adminRoleNames: readonly string[];
  /** Roles that get read access on the recipe. */
  readerRoleNames?: readonly string[];
}

export interface WikiShell {
  slug: string;
  bagName: string;
  bagId: IdString;
  recipeId: IdString;
}

export async function createWikiShell(prisma: PrismaTxnClient, options: WikiShellOptions): Promise<WikiShell> {
  if (await prisma.recipe.findUnique({ where: { slug: options.slug }, select: { id: true } })) {
    throw new Error(`A wiki with the slug "${options.slug}" already exists.`);
  }
  if (await prisma.bag.findUnique({ where: { name: options.bagName }, select: { id: true } })) {
    throw new Error(`The bag "${options.bagName}" already exists.`);
  }

  const templateName = options.templateName;
  const template = await prisma.template.findUnique({ where: { name: templateName }, select: { name: true } });
  if (!template) throw new Error(`Template ${templateName} does not exist.`);

  // The adapters take the acting user, so the new rows get that user as their
  // owner and the personal-namespace rules of the bags tab apply as usual.
  const bag = await new BagDataAdapter(options.user).saveRow(prisma, {
    id: new IdString(""),
    name: options.bagName,
    description: `Tiddler storage for the wiki "${options.displayName}"`,
    bagPermissions: options.adminRoleNames.map(role => ({ level: "C_admin" as const, role })),
  });

  await new RecipeDataAdapter(options.user).saveRow(prisma, {
    id: new IdString(""),
    slug: options.slug,
    templateName: template.name,
    displayName: options.displayName,
    description: options.description ?? "",
    plugins: [],
    readonlyBags: [],
    writablePrefixBags: toMappingRows({ "": options.bagName }),
    recipeAdmins: options.adminRoleNames,
    recipeUsers: options.readerRoleNames ?? [],
    cspAllow: [],
    landingVisible: false,
  });

  const recipe = await prisma.recipe.findUnique({ where: { slug: options.slug }, select: { id: true } });
  return {
    slug: options.slug,
    bagName: options.bagName,
    bagId: new IdString(bag.id.toString()),
    recipeId: new IdString(recipe!.id),
  };
}

/**
 * A new wiki needs a title and a list of tiddlers to open with. Both come from
 * the file when it has them — `--include-system` (resp. the checkbox in the
 * dialog) has usually already imported them, and then nothing is written.
 */
export async function writeStarterTiddlers(prisma: PrismaTxnClient, options: {
  target: { bagId: IdString };
  parsed: ParsedWikiFile;
  displayName: string;
}) {
  const bagId = options.target.bagId;
  const store = new WikiStore(prisma);

  const siteTitle = await prisma.tiddler.findUnique({
    where: { bag_id_title: { bag_id: IdString.cast(bagId), title: "$:/SiteTitle" } },
    select: { title: true },
  });
  if (!siteTitle) {
    await store.saveTiddler({
      bag_id: bagId,
      fields: {
        title: "$:/SiteTitle",
        text: options.parsed.siteTitle ?? options.displayName,
        type: "text/vnd.tiddlywiki",
      },
    });
  }

  const defaultTiddlers = options.parsed.systemTiddlers.find(t => t.title === "$:/DefaultTiddlers");
  const hasDefaultTiddlers = await prisma.tiddler.findUnique({
    where: { bag_id_title: { bag_id: IdString.cast(bagId), title: "$:/DefaultTiddlers" } },
    select: { title: true },
  });
  if (defaultTiddlers && !hasDefaultTiddlers) {
    await store.saveTiddler({ bag_id: bagId, fields: defaultTiddlers as TiddlerFields });
  }
}
