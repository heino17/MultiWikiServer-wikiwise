import { AttachmentService } from "../services/attachments";
import { ok } from "assert";
import { FileInfoTiddlers, TiddlerFieldModule, TiddlerFields } from "tiddlywiki";
import { UserError } from "../utils";
import { SiteConfig } from "../ServerState";
import { Prisma, PrismaClient, PrismaPromise } from "@prisma/client";
import * as runtime from "@prisma/client/runtime/library";
import { IncomingHttpHeaders } from "http";
import { resolve } from "path";
import { Writable } from "stream";
import { Hash } from "crypto";
import { readFile } from "fs/promises";

abstract class TiddlerStore_PrismaBase {

  abstract prisma: PrismaTxnClient;

  /*
  Returns null if a bag/recipe name is valid, or a string error message if not
  */
  validateItemName(name: string, allowPrivilegedCharacters: boolean) {
    if (typeof name !== "string") {
      return "Not a valid string";
    }
    if (name.length > 256) {
      return "Too long";
    }
    // Removed ~ from this list temporarily
    if (allowPrivilegedCharacters) {
      if (!(/^[^\s\u00A0\x00-\x1F\x7F`!@#%^&*()+={}\[\];\'\"<>,\\\?]+$/g.test(name))) {
        return "Invalid character(s)";
      }
    } else {
      if (!(/^[^\s\u00A0\x00-\x1F\x7F`!@#$%^&*()+={}\[\];:\'\"<>.,\/\\\?]+$/g.test(name))) {
        return "Invalid character(s)";
      }
    }
    return null;
  }
  /*
  Returns null if the argument is an array of valid bag/recipe names, or a string error message if not
  */
  validateItemNames(names: string[], allowPrivilegedCharacters: boolean) {
    if (!Array.isArray(names)) {
      return "Not a valid array";
    }
    var errors = [];
    for (const name of names) {
      const result = this.validateItemName(name, allowPrivilegedCharacters);
      if (result && errors.indexOf(result) === -1) {
        errors.push(result);
      }
    }
    if (errors.length === 0) {
      return null;
    } else {
      return errors.join("\n");
    }
  }

  upsertRecipe_PrismaArray(
    recipe_name: PrismaField<"Recipes", "recipe_name">,
    description: PrismaField<"Recipes", "description">,
    bags: { bag_name: PrismaField<"Bags", "bag_name">, with_acl: PrismaField<"Recipe_bags", "with_acl"> }[],
    plugin_names: string[],
    { allowPrivilegedCharacters = false }: { allowPrivilegedCharacters?: boolean; } = {}
  ) {

    const validationRecipeName = this.validateItemName(recipe_name, allowPrivilegedCharacters);
    if (validationRecipeName) throw validationRecipeName;
    if (bags.length === 0) throw new UserError("Recipes must contain at least one bag");

    return tuple(
      this.prisma.recipes.upsert({
        where: { recipe_name },
        update: { description, recipe_bags: { deleteMany: {} }, plugin_names },
        create: { recipe_name, description, plugin_names },
        select: { recipe_id: true }
      }),
      this.prisma.recipes.update({
        where: { recipe_name },
        data: {
          recipe_bags: {
            create: bags.map(({ bag_name, with_acl }, position) => ({
              bag: { connect: { bag_name } },
              position,
              with_acl
            }))
          }
        }
      })
    );

  }

  upsertBag_PrismaPromise(
    bag_name: PrismaField<"Bags", "bag_name">,
    description: PrismaField<"Bags", "description">,
    { allowPrivilegedCharacters = false }: { allowPrivilegedCharacters?: boolean; } = {}
  ) {

    const validationBagName = this.validateItemName(bag_name, allowPrivilegedCharacters);
    if (validationBagName) throw validationBagName;

    return this.prisma.bags.upsert({
      where: { bag_name },
      update: { description },
      create: { bag_name, description },
      select: { bag_id: true }
    });

  }

  saveTiddlersFromPath_PrismaArray(
    bag_name: PrismaField<"Bags", "bag_name">,
    tiddlers: TiddlerFields[]
  ) {
    return tuple(
      this.prisma.tiddlers.deleteMany({
        where: { bag: { bag_name } }
      }),
      ...tiddlers.flatMap(tiddler =>
        this.saveBagTiddlerFields_PrismaArray(tiddler, bag_name, null)
      )
    )
  }

  saveBagTiddlerFields_PrismaArray(
    tiddlerFields: TiddlerFields,
    bag_name: PrismaField<"Bags", "bag_name">,
    attachment_hash: PrismaField<"Tiddlers", "attachment_hash">
  ) {

    const { title } = tiddlerFields;
    if (!title) {
      console.error(tiddlerFields);
      throw new Error("Tiddler must have a title");
    }

    if (attachment_hash && tiddlerFields.text)
      throw new Error("Do not set both the attachment_hash and the text field. It should be one or the other.")

    const deletion = this.prisma.tiddlers.deleteMany({
      where: { bag: { bag_name }, title }
    });

    const fields = Object.entries(tiddlerFields);
    if (!fields.every(e => e.every(f => typeof f === "string")))
      throw new Error("All fields must be saved to the server as strings.")

    const creation = this.prisma.tiddlers.create({
      data: {
        bag: { connect: { bag_name } },
        title,
        is_deleted: false,
        attachment_hash: attachment_hash || null,
        fields: {
          create: fields.map(([field_name, field_value]) => ({ field_name, field_value }))
        }
      },
      select: {
        revision_id: true
      }
    });

    return tuple(deletion, creation);

  }

  /**
    Returns {revision_id:} of the delete marker
    */
  deleteBagTiddler_PrismaArray(
    bag_name: PrismaField<"Bags", "bag_name">,
    title: PrismaField<"Tiddlers", "title">,
  ) {
    return tuple(
      this.prisma.tiddlers.deleteMany({
        where: { title, bag: { bag_name } },
      }),
      this.prisma.tiddlers.create({
        data: {
          title,
          bag: { connect: { bag_name } },
          is_deleted: true,
          attachment_hash: null,
        },
        select: {
          revision_id: true
        }
      })
    );
  }



}
/** 
 * The functions in this class return one or more Prisma actions which can be performed in a batch. 
 *
 * Use the `$transaction` method to execute the batch and return the result as an array.  
 * 
 */
export class TiddlerStore_PrismaStatic extends TiddlerStore_PrismaBase {
  constructor(public prisma: PrismaEngineClient) {
    super();
  }

  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: {
    isolationLevel?: Prisma.TransactionIsolationLevel
  }): Promise<runtime.Types.Utils.UnwrapTuple<P>> {
    return this.prisma.$transaction(arg, options);
  }


}

export class TiddlerStore_PrismaTransaction extends TiddlerStore_PrismaBase {
  constructor(public prisma: PrismaTxnClient) {
    super();
  }

  /**
    Returns {revision_id:,bag_name:} or null if the recipe is empty
    */
  async saveRecipeTiddlerFields(
    tiddlerFields: TiddlerFields,
    recipe_name: PrismaField<"Recipes", "recipe_name">,
    attachment_hash: PrismaField<"Tiddlers", "attachment_hash">
  ) {
    const bag = await this.getRecipeWritableBag(recipe_name);
    const { revision_id } = await this.saveBagTiddlerFields(
      tiddlerFields, bag.bag_name, attachment_hash
    );
    return { revision_id, bag_name: bag.bag_name };
  }

  async saveBagTiddlerFields(
    tiddlerFields: TiddlerFields,
    bag_name: PrismaField<"Bags", "bag_name">,
    attachment_hash: PrismaField<"Tiddlers", "attachment_hash">
  ) {
    const [deletion, creation] = this.saveBagTiddlerFields_PrismaArray(
      tiddlerFields, bag_name, attachment_hash
    );
    return await deletion, await creation;
  }

  /*
  Returns {revision_id:,bag_name:}
  */
  async deleteRecipeTiddler(
    recipe_name: PrismaField<"Recipes", "recipe_name">,
    title: PrismaField<"Tiddlers", "title">
  ) {

    const bag = await this.getRecipeWritableBag(recipe_name, title);

    if (!bag.tiddlers.length) throw new UserError("The writable bag does not contain this tiddler.");

    const { revision_id } = await this.deleteBagTiddler(bag.bag_name, title);

    return { revision_id, bag_name: bag.bag_name };
  }

  async deleteBagTiddler(
    bag_name: PrismaField<"Bags", "bag_name">,
    title: PrismaField<"Tiddlers", "title">,
  ) {
    const [deletion, creation] = this.deleteBagTiddler_PrismaArray(bag_name, title);
    return await deletion, await creation;
  }

  async getRecipeTiddlers(recipe_name: PrismaField<"Recipes", "recipe_name">) {
    // Get the recipe name from the parameters
    const bagTiddlers = await this.getRecipeTiddlersByBag(recipe_name);

    // reverse order for Map, so 0 comes after 1 and overlays it
    bagTiddlers.sort((a, b) => b.position - a.position);

    return Array.from(new Map(bagTiddlers.flatMap(bag => bag.tiddlers.map(tiddler => [tiddler.title, {
      title: tiddler.title,
      revision_id: tiddler.revision_id,
      is_deleted: tiddler.is_deleted,
      bag_name: bag.bag_name,
      bag_id: bag.bag_id
    }])
    )).values());

  }


  /**
  * Get the writable bag for the specified recipe.
  *
  * If title is specified, the tiddler will be included in bag.tiddlers, if it exists.
  *
  * The bag will still be returned even if the tiddler does not exist.
  */
  async getRecipeWritableBag(
    recipe_name: PrismaField<"Recipes", "recipe_name">,
    title?: PrismaField<"Tiddlers", "title">
  ) {

    const recipe = await this.prisma.recipes.findUnique({
      where: { recipe_name },
      select: {
        recipe_id: true,
        recipe_bags: {
          where: { position: 0 },
          select: {
            bag: {
              select: {
                bag_id: true, bag_name: true,
                ...title ? {
                  tiddlers: {
                    select: { revision_id: true },
                    where: { title }
                  }
                } : {}
              }
            }
          }
        }
      }
    });

    if (!recipe) throw new UserError("Recipe not found");

    // the where clause selects only the bag at position 0, 
    // not to be confused with index zero of the result array!
    const bag = recipe.recipe_bags[0]?.bag;

    if (!bag) throw new UserError("Recipe has no bag at position 0");

    return bag;
  }

  async getRecipeBagWithTiddler({ recipe_name, title }: { recipe_name: string; title: string; }) {

    return await this.prisma.recipe_bags.findFirst({
      include: { bag: true, recipe: true },
      where: {
        recipe: { recipe_name },
        bag: { tiddlers: { some: { title, is_deleted: false } } }
      },
      orderBy: { position: "asc" }
    });
  }

  async getRecipeTiddlersByBag(
    recipe_name: PrismaField<"Recipes", "recipe_name">,
    options: {
      last_known_revision_id?: PrismaField<"Tiddlers", "revision_id">;
      include_deleted?: boolean;
    } = {}
  ) {
    // In prisma it's easy to get the top bag for a specific title. 
    // To get all titles we basically have to get all bags and manually find the top one. 
    const lastid = options.last_known_revision_id;
    const withDeleted = options.include_deleted;
    const bags = await this.prisma.recipe_bags.findMany({
      where: { recipe: { recipe_name } },
      select: {
        position: true,
        bag: {
          select: {
            bag_id: true,
            bag_name: true,
            tiddlers: {
              select: {
                title: true,
                revision_id: true,
                is_deleted: true,
              },
              where: {
                is_deleted: withDeleted ? undefined : false,
                revision_id: lastid ? { gt: lastid } : undefined
              },
            }
          }
        }
      },
    });

    bags.sort((a, b) => a.position - b.position);

    return bags.map(e => ({
      bag_id: e.bag.bag_id,
      bag_name: e.bag.bag_name,
      position: e.position,
      tiddlers: e.bag.tiddlers
    }));

  }

}
