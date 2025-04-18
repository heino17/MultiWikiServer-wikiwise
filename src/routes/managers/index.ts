
import { RecipeKeyMap, RecipeManager } from "../managers/manager-recipes";
import { UserKeyMap, UserManager } from "../managers/manager-users";
import { SiteConfig } from "../router";

export { UserManager, UserManagerMap } from "./manager-users";
export { RecipeManager, RecipeManagerMap } from "./manager-recipes";

function isKeyOf<T extends Record<string, any>>(obj: T, key: string | number | symbol): key is keyof T {
  return key in obj;
}


export const ManagerRoutes = (root: rootRoute, config: SiteConfig) => {
  RecipeManager.defineRoutes(root, config);
  UserManager.defineRoutes(root, config);
};