import { rootRoute, Router } from "../router";
import AuthRoutes from "./auth";
import { TWRoutes } from "./tw-test";

/** 
 * The root route is specially defined in router.ts, 
 * so we don't really need to do anything here except 
 * setup the child routes. 
 */
export default function RootRoute(router: Router, root: rootRoute) {
  AuthRoutes(router, root);
  TWRoutes(router, root);
}
