import { AttachmentService } from "../services/attachments";
import { ok } from "assert";
import { FileInfoTiddlers, TiddlerFieldModule, TiddlerFields } from "tiddlywiki";
import { UserError } from "../utils";
import { SiteConfig } from "../ServerState";
import { Prisma, PrismaClient, PrismaPromise } from "@prisma/client";
import * as runtime from "@prisma/client/runtime/library";

/*

### NOTES from attachments file

Class to handle the attachments in the filing system

The store folder looks like this:

store/
  inbox/ - files that are in the process of being uploaded via a multipart form upload
    202402282125432742/
      0
      1
      ...
    ...
  files/ - files that are the text content of large tiddlers
    b7def178-79c4-4d88-b7a4-39763014a58b/
      data.jpg - the extension is provided for convenience when directly inspecting the file system
      meta.json - contains:
        {
          "filename": "data.jpg",
          "type": "video/mp4",
          "uploaded": "2024021821224823"
        }
  database.sql - The database file (managed by Prisma)

*/

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
    is_plugin: PrismaField<"Bags", "is_plugin">,
    { allowPrivilegedCharacters = false }: { allowPrivilegedCharacters?: boolean; } = {}
  ) {

    const validationBagName = this.validateItemName(bag_name, allowPrivilegedCharacters);
    if (validationBagName) throw validationBagName;

    return this.prisma.bags.upsert({
      where: { bag_name },
      update: { description, is_plugin },
      create: { bag_name, description, is_plugin },
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
    title: PrismaField<"Tiddlers", "title">,
    bag_name: PrismaField<"Bags", "bag_name">
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

export class TiddlerStore_Primitives extends TiddlerStore_PrismaBase {
  constructor(public prisma: PrismaTxnClient) {
    super();
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
                bag_id: true, bag_name: true, is_plugin: true,
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

    if (bag.is_plugin)
      throw new UserError("Saving to plugin bags is not currently supported. "
        + "Please use a normal bag at the top of the recipe. "
        + "This error occurs if a plugin bag is at the top of the recipe.\n");

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
      last_known_revision_id?: PrismaField<"Tiddlers", "revision_id">,
      include_deleted?: boolean,
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
            is_plugin: true,
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
      is_plugin: e.bag.is_plugin,
      position: e.position,
      tiddlers: e.bag.tiddlers
    }));

  }

  
  getTiddlerFields(
    title: PrismaField<"Tiddlers", "title">,
    fields: { field_name: string, field_value: string }[]
  ) {
    return Object.fromEntries([
      ...fields.map(e => [e.field_name, e.field_value] as const),
      ["title", title]
    ]) as TiddlerFields;
  }
}

export class TiddlerStore extends TiddlerStore_Primitives {
  static fromConfig(config: SiteConfig, prisma: PrismaTxnClient) {
    return new TiddlerStore(
      config.fieldModules,
      new AttachmentService(config, prisma),
      config.storePath,
      config.contentTypeInfo,
      prisma
    );
  }

  constructor(
    public fieldModules: Record<string, TiddlerFieldModule>,
    private attachService: AttachmentService,
    public storePath: string,
    public contentTypeInfo: Record<string, any>,
    public prisma: PrismaTxnClient
  ) {
    super(prisma);
  }

  /*
  Returns {revision_id:}
  */
  async saveBagTiddler(
    incomingTiddlerFields: TiddlerFields,
    bag_name: PrismaField<"Bags", "bag_name">
  ) {
    const { title } = incomingTiddlerFields;

    const existing_attachment_hash = await this.prisma.tiddlers.findFirst({
      where: { title, bag: { bag_name } },
      select: { attachment_hash: true }
    }).then(e => e?.attachment_hash ?? null);

    const { tiddlerFields, attachment_hash } = await this.attachService.processIncomingTiddler({
      tiddlerFields: incomingTiddlerFields,
      existing_attachment_hash,
      existing_canonical_uri: existing_attachment_hash && this.attachService.makeCanonicalUri(bag_name, incomingTiddlerFields.title)
    });

    return this.saveBagTiddlerFields(tiddlerFields, bag_name, attachment_hash);

  }
  /*
  Create a tiddler in a bag adopting the specified file as the attachment. The attachment file must be on the same disk as the attachment store
  Options include:
  
  filepath - filepath to the attachment file
  hash - string hash of the attachment file
  type - content type of file as uploaded
  
  Returns {revision_id:}
  */
  async saveBagTiddlerWithAttachment(
    incomingTiddlerFields: TiddlerFields,
    bag_name: PrismaField<"Bags", "bag_name">,
    options: {
      filepath: string;
      hash: string;
      type: string;
      _canonical_uri: string;
    }
  ) {
    const attachment_hash = await this.attachService.adoptAttachment({
      // options.filepath, options.type, options.hash, options._canonical_uri
      incomingFilepath: options.filepath,
      type: options.type,
      hash: options.hash,
      _canonical_uri: options._canonical_uri
    });
    if (attachment_hash) {
      return this.saveBagTiddlerFields(incomingTiddlerFields, bag_name, attachment_hash);
    } else {
      return null;
    }
  }

  /*
  returns {revision_id:,tiddler:}
  */
  async getBagTiddler(options: {
    title: PrismaField<"Tiddlers", "title">;
    bag_name?: PrismaField<"Bags", "bag_name">;
    bag_id?: PrismaField<"Bags", "bag_id">;
  }) {
    const { title, bag_name, bag_id } = options;
    ok(bag_name || bag_id, "bag_name or bag_id must be provided");

    const tiddler = await this.prisma.tiddlers.findFirst({
      where: bag_name
        ? { title, bag: { bag_name }, is_deleted: false }
        : { title, bag_id, is_deleted: false },
      select: { revision_id: true }
    });
    if (!tiddler) return null;

    var tiddlerInfo = await this.getTiddlerInfo(tiddler.revision_id);
    if (!tiddlerInfo) return null;

    return {
      ...tiddlerInfo,
      tiddler: this.attachService.processOutgoingTiddler(tiddlerInfo)
    };

  }

  private async getRecipeTiddler(
    title: PrismaField<"Tiddlers", "title">,
    recipe_name: PrismaField<"Recipes", "recipe_name">
  ) {

    const recipe_bag = await this.getRecipeBagWithTiddler({ recipe_name, title });

    if (!recipe_bag) return null;

    return await this.getBagTiddler({ title, bag_id: recipe_bag.bag_id });

  }


  async getTiddlerInfo(
    revision_id: PrismaField<"Tiddlers", "revision_id">
  ) {

    const tiddler = await this.prisma.tiddlers.findUnique({
      where: { revision_id, is_deleted: false },
      include: { fields: true, bag: true }
    });

    if (!tiddler) return null;

    if (tiddler.bag.is_plugin && tiddler.title as string !== tiddler.bag.bag_name as string)
      throw new UserError("Can only get tiddler info for a plugin bag itself");

    return {
      bag_name: tiddler.bag.bag_name,
      is_plugin_bag: tiddler.bag.is_plugin,
      revision_id: tiddler.revision_id,
      attachment_hash: tiddler.attachment_hash,
      tiddler: Object.fromEntries([
        ...tiddler.fields.map(e => [e.field_name, e.field_value] as const),
        ["title", tiddler.title]
      ]) as TiddlerFields
    };
  }
  /*
  Get an attachment ready to stream. Returns null if there is an error or:
  revision_id: revision of tiddler
  stream: stream of file
  type: type of file
  Returns {revision_id:,bag_name:}
  */
  async getBagTiddlerStream(
    title: PrismaField<"Tiddlers", "title">,
    bag_name: PrismaField<"Bags", "bag_name">
  ) {
    const tiddlerInfo = await this.getBagTiddler({ title, bag_name });
    if (!tiddlerInfo) return null;

    if (tiddlerInfo.attachment_hash) {
      return {
        ...await this.attachService.getAttachmentStream(tiddlerInfo.attachment_hash) ?? {},
        revision_id: tiddlerInfo.revision_id,
        bag_name: bag_name
      };
    } else {
      const { Readable } = require('stream');
      const stream = new Readable();
      stream._read = () => {
        // Push data
        const type = tiddlerInfo.tiddler.type || "text/plain";
        stream.push(tiddlerInfo.tiddler.text || "", (this.contentTypeInfo[type] || { encoding: "utf8" }).encoding);
        // Push null to indicate the end of the stream
        stream.push(null);
      };
      return {
        revision_id: tiddlerInfo.revision_id,
        bag_name: bag_name,
        stream: stream,
        type: tiddlerInfo.tiddler.type || "text/plain"
      };
    }

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

    // Save the tiddler to the specified bag
    var { revision_id } = await this.saveBagTiddlerFields(
      tiddlerFields, bag.bag_name, attachment_hash
    );

    return { revision_id, bag_name: bag.bag_name };
  }


  private async saveBagTiddlerFields(
    tiddlerFields: TiddlerFields,
    bag_name: PrismaField<"Bags", "bag_name">,
    attachment_hash: PrismaField<"Tiddlers", "attachment_hash">
  ) {
    const [deletion, creation] = this.saveBagTiddlerFields_PrismaArray(tiddlerFields, bag_name, attachment_hash);
    await deletion;
    return await creation;
  }

  /*
  Returns {revision_id:,bag_name:}
  */
  async deleteRecipeTiddler(
    recipe_name: PrismaField<"Recipes", "recipe_name">,
    title: PrismaField<"Tiddlers", "title">
  ) {

    const bag = await this.getRecipeWritableBag(recipe_name, title);

    if (!bag.tiddlers.length) throw new UserError("Cannot delete tiddler from non-top bag");

    const [deletion, creation] = this.deleteBagTiddler_PrismaArray(title, bag.bag_name);
    await deletion;
    const { revision_id } = await creation;
    return { revision_id, bag_name: bag.bag_name };
  }


}
