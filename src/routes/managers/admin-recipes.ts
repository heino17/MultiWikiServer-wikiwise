import { admin } from "./admin-utils";
import { DataChecks, RouterKeyMap, RouterRouteMap } from "../../utils";
import { AuthUser } from "../../services/sessions";
import { SiteConfig } from "../../ServerState";
import { registerZodRoutes } from "../zodRegister";
import { serverEvents } from "../../ServerEvents";

// https://crates.io/crates/indradb

serverEvents.on("listen.routes", (root: rootRoute, config: SiteConfig) => {
  RecipeManager.defineRoutes(root, config);
});

export const RecipeKeyMap: RouterKeyMap<RecipeManager, true> = {

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

export type RecipeManagerMap = RouterRouteMap<RecipeManager>;

export class RecipeManager {

  static defineRoutes(root: rootRoute, config: SiteConfig) {
    registerZodRoutes(root, new RecipeManager(config), Object.keys(RecipeKeyMap));
  }

  checks: DataChecks;

  constructor(private config: SiteConfig) {

    this.checks = new DataChecks(config)
  }

  recipe_create = admin(z => z.object({
    recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    description: z.prismaField("Recipes", "description", "string"),
    bag_names: z.array(z.object({ bag_name: z.string(), with_acl: z.boolean() })),
    plugin_names: z.string().array(),
    owner_id: z.prismaField("Recipes", "owner_id", "string", true).optional(),
    skip_required_plugins: z.prismaField("Recipes", "skip_required_plugins", "boolean"),
    skip_core: z.prismaField("Recipes", "skip_core", "boolean"),
    isCreate: z.literal(true).default(true),
  }), async (state, prisma) => {
    return await this.recipeCreateOrUpdate(state.data, prisma, state.user);
  });
  recipe_update = admin(z => z.object({
    recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    description: z.prismaField("Recipes", "description", "string"),
    bag_names: z.array(z.object({ bag_name: z.string(), with_acl: z.boolean() })),
    plugin_names: z.string().array(),
    owner_id: z.prismaField("Recipes", "owner_id", "string", true).optional(),
    skip_required_plugins: z.prismaField("Recipes", "skip_required_plugins", "boolean"),
    skip_core: z.prismaField("Recipes", "skip_core", "boolean"),
    isCreate: z.literal(false).default(false),
  }), async (state, prisma) => {
    return await this.recipeCreateOrUpdate(state.data, prisma, state.user);
  });

  recipe_upsert = admin(z => z.object({
    recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    description: z.prismaField("Recipes", "description", "string"),
    bag_names: z.array(z.object({ bag_name: z.string(), with_acl: z.boolean() })),
    plugin_names: z.string().array(),
    owner_id: z.prismaField("Recipes", "owner_id", "string", true).optional(),
    skip_required_plugins: z.prismaField("Recipes", "skip_required_plugins", "boolean"),
    skip_core: z.prismaField("Recipes", "skip_core", "boolean"),
    isCreate: z.boolean(),
  }), async (state, prisma) => {
    return await this.recipeCreateOrUpdate(state.data, prisma, state.user);
  });

  bag_create = admin(z => z.object({
    bag_name: z.prismaField("Bags", "bag_name", "string"),
    description: z.prismaField("Bags", "description", "string"),
    owner_id: z.prismaField("Bags", "owner_id", "string", true).optional(),
    isCreate: z.literal(true).default(true),
  }), async (state, prisma) => {
    return await this.bagCreateOrUpdate(state.data, prisma, state.user);
  });

  bag_update = admin(z => z.object({
    bag_name: z.prismaField("Bags", "bag_name", "string"),
    description: z.prismaField("Bags", "description", "string"),
    owner_id: z.prismaField("Bags", "owner_id", "string", true).optional(),
    isCreate: z.literal(false).default(false),
  }), async (state, prisma) => {
    return await this.bagCreateOrUpdate(state.data, prisma, state.user);
  });

  bag_upsert = admin(z => z.object({
    bag_name: z.prismaField("Bags", "bag_name", "string"),
    description: z.prismaField("Bags", "description", "string"),
    owner_id: z.prismaField("Bags", "owner_id", "string", true).optional(),
    isCreate: z.boolean(),
  }), async (state, prisma) => {
    return await this.bagCreateOrUpdate(state.data, prisma, state.user);
  });

  async recipeCreateOrUpdate({ bag_names, description, owner_id, recipe_name, isCreate, plugin_names, skip_core, skip_required_plugins }: {
    recipe_name: PrismaField<"Recipes", "recipe_name">,
    description: PrismaField<"Recipes", "description">,
    bag_names: { bag_name: string, with_acl: boolean }[],
    owner_id?: PrismaField<"Recipes", "owner_id"> | null,
    plugin_names: PrismaJson.Recipes_plugin_names,
    skip_required_plugins: PrismaField<"Recipes", "skip_required_plugins">,
    skip_core: PrismaField<"Recipes", "skip_core">,
    isCreate: boolean,
  }, prisma: PrismaTxnClient, user: AuthUser) {
    const existing = await prisma.recipes.findUnique({ where: { recipe_name }, });

    this.assertCreateOrUpdate({ user, type: "recipe", isCreate, owner_id, existing, });

    const { isAdmin, user_id } = user;

    const OR = isAdmin ? undefined : this.checks.getWhereACL({ permission: "ADMIN", user_id, });

    const bags = new Map(
      await prisma.bags.findMany({
        where: { bag_name: { in: bag_names.map(e => e.bag_name) } },
      }).then(bags => bags.map(bag => [bag.bag_name as string, bag]))
    );

    const missing = bag_names.filter(e => !bags.has(e.bag_name));
    if (missing.length) throw "Some bags not found: " + JSON.stringify(missing);

    const bagsAcl = new Map((await prisma.bags.findMany({
      where: { bag_name: { in: bag_names.map(e => e.bag_name) }, OR },
    })).map(bag => [bag.bag_name as string, bag]));

    const createBags = bag_names.map((bag, position) => ({
      bag_id: bags.get(bag.bag_name)!.bag_id,
      with_acl: bagsAcl.has(bag.bag_name) && bag.with_acl,
      position,
    }));

    if (existing) {
      await prisma.recipes.update({
        where: { recipe_name },
        data: {
          description,
          owner_id: isAdmin ? owner_id : undefined,
          skip_core,
          skip_required_plugins,
          plugin_names,
          recipe_bags: { deleteMany: {}, }
        }
      });
      await prisma.recipes.update({
        where: { recipe_name },
        data: {
          recipe_bags: {
            create: createBags
          }
        }
      });
      return existing;
    } else {

      return await prisma.recipes.create({
        data: {
          recipe_name,
          description,
          recipe_bags: { create: createBags },
          plugin_names,
          owner_id: isAdmin ? owner_id : user_id,
          skip_core,
          skip_required_plugins
        },
      });
    }
  }

  async bagCreateOrUpdate({ bag_name, description, owner_id, isCreate }: {
    bag_name: PrismaField<"Bags", "bag_name">,
    description: PrismaField<"Bags", "description">,
    owner_id?: PrismaField<"Bags", "owner_id"> | null,
    isCreate: boolean,
  }, prisma: PrismaTxnClient, user: AuthUser) {
    const existing = await prisma.bags.findUnique({
      where: { bag_name },
      select: { owner_id: true }
    });

    this.assertCreateOrUpdate({ type: "bag", isCreate, owner_id, existing, user });

    const { isAdmin, user_id } = user;

    return await prisma.bags.upsert({
      where: { bag_name },
      update: {
        description,
        owner_id: isAdmin ? owner_id : undefined //undefined leaves the value as-is
      },
      create: {
        bag_name,
        description,
        owner_id: isAdmin ? owner_id : user_id
      },
    });

  }


  assertCreateOrUpdate({
    existing, isCreate, owner_id, type, user
  }: {
    user: AuthUser,
    isCreate: boolean,
    owner_id?: PrismaField<"Users", "user_id"> | null,
    existing: { owner_id: PrismaField<"Users", "user_id"> | null } | null
    type: "recipe" | "bag"
  }) {
    // check user_id just to be safe because we depend on it for an additional check here and elsewhere
    // user_id 0 is also not a valid user_id and only used for anonymous users
    if (!user.isLoggedIn || !user.user_id)
      throw "User not authenticated";

    const { isAdmin, user_id } = user;

    if (!isAdmin && owner_id !== undefined)
      throw "owner_id is only valid for admins";

    if (existing && isCreate)
      throw `A ${type} with this name already exists`;

    if (existing && !isAdmin && existing.owner_id !== user_id)
      throw `User does not own the ${type} and is not an admin`;

  }

  recipe_delete = admin(z => z.object({
    recipe_name: z.string(),
  }), async (state, prisma) => {
    const { recipe_name } = state.data;

    if (!state.user.isLoggedIn) throw "User not authenticated";

    const recipe = await prisma.recipes.findUnique({
      where: { recipe_name },
    });

    if (!recipe) throw "Recipe not found";

    const { isAdmin, user_id } = state.user;

    if (!isAdmin && recipe.owner_id !== user_id)
      throw "User does not own the recipe and is not an admin";

    await prisma.recipes.delete({
      where: { recipe_name }
    });

    return null;
  });

  bag_delete = admin(z => z.object({
    bag_name: z.string(),
  }), async (state, prisma) => {
    const { bag_name } = state.data;

    if (!state.user.isLoggedIn) throw "User not authenticated";

    const bag = await prisma.bags.findUnique({
      where: { bag_name },
      include: { _count: { select: { tiddlers: true } } }
    });

    if (!bag) throw "Bag not found";

    const { isAdmin, user_id } = state.user;

    if (!isAdmin && bag.owner_id !== user_id)
      throw "User does not own the bag and is not an admin";

    if (bag._count.tiddlers)
      throw "Bag has tiddlers added and can no longer be deleted.";

    await prisma.bags.delete({
      where: { bag_name }
    });

    return null;
  });

  //   Partial<{
  //     role_id: number | null;
  //     permission: "READ" | "WRITE" | "ADMIN";
  // }>[]
  recipe_acl_update = admin(z => z.object({
    recipe_name: z.prismaField("Recipes", "recipe_name", "string"),
    acl: z.array(z.object({
      role_id: z.prismaField("Roles", "role_id", "string"),
      permission: z.enum(["READ", "WRITE", "ADMIN"]),
    })),
  }), async (state, prisma) => {
    const { recipe_name, acl } = state.data;

    if (!state.user.isLoggedIn) throw "User not authenticated";

    const recipe = await prisma.recipes.findUnique({
      where: { recipe_name }
    });

    if (!recipe) throw "Recipe not found";

    const { isAdmin, user_id } = state.user;

    if (!isAdmin && recipe.owner_id !== user_id)
      throw "User does not own the recipe and is not an admin";

    const distinct = new Set(acl.map(acl => JSON.stringify([acl.role_id, acl.permission])));

    const { recipe_id } = recipe;

    await prisma.recipeAcl.deleteMany({
      where: { recipe_id }
    });

    await prisma.recipeAcl.createMany({
      data: Array.from(distinct).map(e => {
        const [role_id, permission] = JSON.parse(e);
        return { recipe_id, role_id, permission };
      })
    });

    return null;
  });

  bag_acl_update = admin(z => z.object({
    bag_name: z.prismaField("Bags", "bag_name", "string"),
    acl: z.array(z.object({
      role_id: z.prismaField("Roles", "role_id", "string"),
      permission: z.enum(["READ", "WRITE", "ADMIN"]),
    })),
  }), async (state, prisma) => {
    const { bag_name, acl } = state.data;

    if (!state.user.isLoggedIn) throw "User not authenticated";

    const bag = await prisma.bags.findUnique({
      where: { bag_name },
      include: { acl: true }
    });

    if (!bag) throw "Bag not found";

    const { isAdmin, user_id } = state.user;

    if (!isAdmin && bag.owner_id !== user_id)
      throw "User does not own the bag and is not an admin";

    const distinct = new Set(acl.map(acl => JSON.stringify([acl.role_id, acl.permission])));

    const { bag_id } = bag;

    await prisma.bagAcl.deleteMany({
      where: { bag_id }
    });

    await prisma.bagAcl.createMany({
      data: Array.from(distinct).map(e => {
        const [role_id, permission] = JSON.parse(e);
        return { bag_id, role_id, permission };
      })
    });

    return null;
  });


}