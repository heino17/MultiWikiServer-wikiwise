import { rootRoute } from "../router";
import AuthRoutes from "./auth";

/** 
 * The root route is specially defined in router.ts, 
 * so we don't really need to do anything here except 
 * setup the child routes. 
 */
export default function RootRoute(root: rootRoute) {
  AuthRoutes(root);
}
