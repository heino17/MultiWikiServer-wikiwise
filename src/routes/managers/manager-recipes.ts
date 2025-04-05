import { BaseKeyMap, BaseManager, BaseManagerMap, } from "../BaseManager";

// https://crates.io/crates/indradb


export const RecipeKeyMap: BaseKeyMap<RecipeManager, true> = {
  index_json: true,

  bag_create: true,
  bag_update: true,
  bag_upsert: true,
  bag_delete: true,
  bag_acl_update: true,

  recipe_create: true,
  recipe_update: true,
  recipe_upsert: true,
  recipe_delete: true,
  recipe_acl_update: true,

}

export type RecipeManagerMap = BaseManagerMap<RecipeManager>;

export class RecipeManager extends BaseManager {

  index_json = this.ZodRequest(z => z.undefined(), async () => {

    const { isAdmin, user_id, username } = this.user ?? {};

    const OR = this.checks.getBagWhereACL({ permission: "READ", user_id, });

    const bagList = await this.prisma.bags.findMany({
      include: {
        _count: {
          select: {
            acl: {
              where: {
                permission: "ADMIN",
                role: { users: { some: { user_id } } }
              }
            }
          }
        },
        owner: { select: { username: true } },
        acl: true,
      },
      where: isAdmin ? {} : { OR }
    });

    const recipeList = await this.prisma.recipes.findMany({
      include: {
        owner: { select: { username: true } },
        recipe_bags: {
          select: { bag_id: true, position: true, with_acl: true, },
          orderBy: { position: "asc" }
        },
        acl: true,
      },
      where: isAdmin ? {} : { recipe_bags: { every: { bag: { OR } } } }
    });

    const userList = !isAdmin ? null : await this.prisma.users.findMany({
      select: { user_id: true, username: true, email: true, roles: true, last_login: true, created_at: true }
    });

    const roleList = await this.prisma.roles.findMany();

    return {
      bagList,
      recipeList,
      isAdmin,
      user_id,
      userList,
      roleList,
      username,
      firstGuestUser: !!this.firstGuestUser,
      isLoggedIn: !!this.user,
      allowAnonReads: this.config.allowAnonReads,
      allowAnonWrites: this.config.allowAnonWrites,
    }
  });

  recipe_create = this.ZodRequest(z => z.object({
    recipe_name: z.string(),
    description: z.string(),
    bag_names: z.array(z.object({ bag_name: z.string(), with_acl: z.boolean() })),
    owner_id: z.prismaField("Recipes", "owner_id", "number", true).optional(),
    isCreate: z.literal(true).default(true),
  }), async (input) => {
    return await this.recipeCreateOrUpdate(input);
  });
  recipe_update = this.ZodRequest(z => z.object({
    recipe_name: z.string(),
    description: z.string(),
    bag_names: z.array(z.object({ bag_name: z.string(), with_acl: z.boolean() })),
    owner_id: z.prismaField("Recipes", "owner_id", "number", true).optional(),
    isCreate: z.literal(false).default(false),
  }), async (input) => {
    return await this.recipeCreateOrUpdate(input);
  });

  recipe_upsert = this.ZodRequest(z => z.object({
    recipe_name: z.string(),
    description: z.string(),
    bag_names: z.array(z.object({ bag_name: z.string(), with_acl: z.boolean() })),
    owner_id: z.prismaField("Recipes", "owner_id", "number", true).optional(),
    isCreate: z.boolean(),
  }), async (input) => {
    return await this.recipeCreateOrUpdate(input);
  });

  bag_create = this.ZodRequest(z => z.object({
    bag_name: z.string(),
    description: z.string(),
    is_plugin: z.boolean(),
    owner_id: z.prismaField("Bags", "owner_id", "number", true).optional(),
    isCreate: z.literal(true).default(true),
  }), async (input) => {
    return await this.bagCreateOrUpdate(input);
  });

  bag_update = this.ZodRequest(z => z.object({
    bag_name: z.string(),
    description: z.string(),
    is_plugin: z.boolean(),
    owner_id: z.prismaField("Bags", "owner_id", "number", true).optional(),
    isCreate: z.literal(false).default(false),
  }), async (input) => {
    return await this.bagCreateOrUpdate(input);
  });

  bag_upsert = this.ZodRequest(z => z.object({
    bag_name: z.string(),
    description: z.string(),
    is_plugin: z.boolean(),
    owner_id: z.prismaField("Bags", "owner_id", "number", true).optional(),
    isCreate: z.boolean(),
  }), async (input) => {
    return await this.bagCreateOrUpdate(input);
  });

  async recipeCreateOrUpdate({ bag_names, description, owner_id, recipe_name, isCreate }: {
    recipe_name: string,
    description: string,
    bag_names: { bag_name: string, with_acl: boolean }[],
    owner_id?: number | null,
    isCreate: boolean,
  }) {
    const existing = await this.prisma.recipes.findUnique({
      where: { recipe_name },
    });

    this.assertCreateOrUpdate({ type: "recipe", isCreate, owner_id, existing, });

    const { isAdmin, user_id } = this.user;

    const OR = this.checks.getWhereACL({ permission: "ADMIN", user_id, });

    const bags = new Map(
      await this.prisma.bags.findMany({
        where: { bag_name: { in: bag_names.map(e => e.bag_name) } },
      }).then(bags => bags.map(bag => [bag.bag_name as string, bag]))
    );

    const missing = bag_names.filter(e => !bags.has(e.bag_name));
    if (missing.length) throw "Some bags not found: " + JSON.stringify(missing);

    const bagsAcl = new Map(
      await this.prisma.bags.findMany({
        where: { bag_name: { in: bag_names.map(e => e.bag_name) }, OR },
      }).then(bags => bags.map(bag => [bag.bag_name as string, bag]))
    );

    const createBags = bag_names.map((bag, position) => ({
      bag_id: bags.get(bag.bag_name)!.bag_id,
      with_acl: bagsAcl && bagsAcl.has(bag.bag_name) && bag.with_acl,
      position,
    }));

    if (existing) {
      await this.prisma.recipes.update({
        where: { recipe_name },
        data: {
          description,
          owner_id: isAdmin ? owner_id : undefined,
          recipe_bags: {
            deleteMany: {},
          }
        }
      });
      await this.prisma.recipes.update({
        where: { recipe_name },
        data: {
          recipe_bags: {
            create: createBags
          }
        }
      });
      return existing;
    } else {

      return await this.prisma.recipes.create({
        data: {
          recipe_name,
          description,
          recipe_bags: { create: createBags },
          owner_id: isAdmin ? owner_id : user_id
        },
      });
    }
  }

  async bagCreateOrUpdate({ bag_name, description, is_plugin, owner_id, isCreate }: {
    bag_name: string,
    description: string,
    is_plugin: boolean,
    owner_id?: number | null,
    isCreate: boolean,
  }) {
    const existing = await this.prisma.bags.findUnique({
      where: { bag_name },
      select: { owner_id: true }
    });

    this.assertCreateOrUpdate({ type: "bag", isCreate, owner_id, existing });

    const { isAdmin, user_id } = this.user;

    return await this.prisma.bags.upsert({
      where: { bag_name },
      update: {
        description,
        is_plugin,
        owner_id: isAdmin ? owner_id : undefined //undefined leaves the value as-is
      },
      create: {
        bag_name,
        description,
        is_plugin,
        owner_id: isAdmin ? owner_id : user_id
      },
    });

  }


  assertCreateOrUpdate({
    existing, isCreate, owner_id, type
  }: {
    isCreate: boolean,
    owner_id?: number | null,
    existing: { owner_id: PrismaField<"Users", "user_id"> | null } | null
    type: "recipe" | "bag"
  }): asserts this is { user: { isAdmin: boolean, user_id: number } } {
    // check user_id just to be safe because we depend on it for an additional check here and elsewhere
    if (!this.user || !this.user.user_id)
      throw "User not authenticated";

    const { isAdmin, user_id } = this.user;

    if (!isAdmin && owner_id !== undefined)
      throw "owner_id is only valid for admins";

    if (existing && isCreate)
      throw `A ${type} with this name already exists`;

    if (existing && !isAdmin && existing.owner_id !== user_id)
      throw `User does not own the ${type} and is not an admin`;

  }

  recipe_delete = this.ZodRequest(z => z.object({
    recipe_name: z.string(),
  }), async ({ recipe_name }) => {

    if (!this.user) throw "User not authenticated";

    const recipe = await this.prisma.recipes.findUnique({
      where: { recipe_name },
    });

    if (!recipe) throw "Recipe not found";

    const { isAdmin, user_id } = this.user;

    if (!isAdmin && recipe.owner_id !== user_id)
      throw "User does not own the recipe and is not an admin";

    await this.prisma.recipes.delete({
      where: { recipe_name }
    });

    return null;
  });

  bag_delete = this.ZodRequest(z => z.object({
    bag_name: z.string(),
  }), async ({ bag_name }) => {

    if (!this.user) throw "User not authenticated";

    const bag = await this.prisma.bags.findUnique({
      where: { bag_name },
      include: { _count: { select: { tiddlers: true } } }
    });

    if (!bag) throw "Bag not found";

    const { isAdmin, user_id } = this.user;

    if (!isAdmin && bag.owner_id !== user_id)
      throw "User does not own the bag and is not an admin";

    if (bag._count.tiddlers)
      throw "Bag has tiddlers added and can no longer be deleted.";

    await this.prisma.bags.delete({
      where: { bag_name }
    });

    return null;
  });

  //   Partial<{
  //     role_id: number | null;
  //     permission: "READ" | "WRITE" | "ADMIN";
  // }>[]
  recipe_acl_update = this.ZodRequest(z => z.object({
    recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    acl: z.array(z.object({
      role_id: z.number().nullable(),
      permission: z.enum(["READ", "WRITE", "ADMIN"]),
    })),
  }), async ({ recipe_name, acl }) => {

    if (!this.user) throw "User not authenticated";

    const recipe = await this.prisma.recipes.findUnique({
      where: { recipe_name }
    });

    if (!recipe) throw "Recipe not found";

    const { isAdmin, user_id } = this.user;

    if (!isAdmin && recipe.owner_id !== user_id)
      throw "User does not own the recipe and is not an admin";

    const distinct = new Set(acl.map(acl => JSON.stringify([acl.role_id, acl.permission])));

    const { recipe_id } = recipe;

    await this.prisma.recipeAcl.deleteMany({
      where: { recipe_id }
    });

    await this.prisma.recipeAcl.createMany({
      data: Array.from(distinct).map(e => {
        const [role_id, permission] = JSON.parse(e);
        return { recipe_id, role_id, permission };
      })
    });

    return null;
  });

  bag_acl_update = this.ZodRequest(z => z.object({
    bag_name: z.prismaField("Bags", "bag_name", "string"),
    acl: z.array(z.object({
      role_id: z.number().nullable(),
      permission: z.enum(["READ", "WRITE", "ADMIN"]),
    })),
  }), async ({ bag_name, acl }) => {

    if (!this.user) throw "User not authenticated";

    const bag = await this.prisma.bags.findUnique({
      where: { bag_name },
      include: { acl: true }
    });

    if (!bag) throw "Bag not found";

    const { isAdmin, user_id } = this.user;

    if (!isAdmin && bag.owner_id !== user_id)
      throw "User does not own the bag and is not an admin";

    const distinct = new Set(acl.map(acl => JSON.stringify([acl.role_id, acl.permission])));

    const { bag_id } = bag;

    await this.prisma.bagAcl.deleteMany({
      where: { bag_id }
    });

    await this.prisma.bagAcl.createMany({
      data: Array.from(distinct).map(e => {
        const [role_id, permission] = JSON.parse(e);
        return { bag_id, role_id, permission };
      })
    });

    return null;
  });


}