
import { DataChecks } from "../../utils";
import { RecipeManager } from "../managers/manager-recipes";
import { UserManager } from "../managers/manager-users";
import { registerZodRoutes, RouterKeyMap, RouterRouteMap, zodManage } from "../../router";
import { SiteConfig } from "../../ServerState";

export { UserManager, UserManagerMap } from "./manager-users";
export { RecipeManager, RecipeManagerMap } from "./manager-recipes";

export const ManagerRoutes = (root: rootRoute, config: SiteConfig) => {
  StatusManager.defineRoutes(root, config);
  RecipeManager.defineRoutes(root, config);
  UserManager.defineRoutes(root, config);
};

export const StatusKeyMap: RouterKeyMap<StatusManager, true> = {
  index_json: true,
}

export type StatusManagerMap = RouterRouteMap<StatusManager>;

export class StatusManager {

  static defineRoutes(root: rootRoute, config: SiteConfig) {
    registerZodRoutes(root, new StatusManager(config), Object.keys(StatusKeyMap));
  }

  checks: DataChecks;

  constructor(private config: SiteConfig) {
    this.checks = new DataChecks(config)
  }

  index_json = zodManage(z => z.undefined(), async (state, prisma) => {

    const { isAdmin, user_id, username, role_ids } = state.user;

    const OR = this.checks.getBagWhereACL({ permission: "READ", user_id, role_ids });

    const clientPlugins = [...state.tiddlerCache.pluginFiles.keys()];
    const corePlugins = state.tiddlerCache.requiredPlugins;

    const bagList = await prisma.bags.findMany({
      include: {
        _count: isAdmin ? undefined : {
          select: {
            acl: {
              where: {
                permission: "ADMIN",
                role_id: { in: role_ids }
              }
            }
          }
        },
        acl: true,
      },
      where: isAdmin ? undefined : { OR }
    });

    const recipeList = await prisma.recipes.findMany({
      include: {
        recipe_bags: {
          select: { bag_id: true, position: true, with_acl: true, },
          orderBy: { position: "asc" }
        },
        acl: true,
        _count: isAdmin ? undefined : {
          select: {
            acl: {
              where: {
                permission: "ADMIN",
                role_id: { in: role_ids }
              }
            }
          }
        },
      },
      where: isAdmin ? undefined : {
        OR: [
          { recipe_bags: { every: { bag: { OR } } } },
          user_id && { owner_id: { equals: user_id, not: null } }
        ].filter(e => e)
      }
    });

    const userListUser = !isAdmin && await prisma.users.findMany({
      select: { user_id: true, username: true }
    });

    const userListAdmin = !!isAdmin && await prisma.users.findMany({
      select: { user_id: true, username: true, email: true, roles: true, last_login: true, created_at: true }
    });

    const roleList = await prisma.roles.findMany();

    return {
      bagList,
      recipeList,
      isAdmin,
      user_id,
      userListUser,
      userListAdmin,
      roleList,
      username,
      clientPlugins,
      corePlugins,
      isLoggedIn: state.user.isLoggedIn,
      allowAnonReads: false,
      allowAnonWrites: false,
      versions: state.router.versions,
    }
  });


}

