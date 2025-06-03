import { Router } from "./router";
import { StateObject } from "./StateObject";
import { AllowedMethods, BodyFormats } from "./utils";
import Debug from "debug";
import { serverEvents } from "./ServerEvents";

const debug = Debug("mws:router:defining");

export async function makeRouter() {

  const rootRoute = defineRoute(ROOT_ROUTE, {
    method: AllowedMethods,
    path: /^/,
    denyFinal: true,
  }, async (state: StateObject) => {

  });

  await serverEvents.emitAsync("listen.routes", rootRoute)
  await serverEvents.emitAsync("listen.routes.fallback", rootRoute)

  const router = new Router(rootRoute);

  await serverEvents.emitAsync("listen.router", router);

  return router;
}



export function defineRoute(
  parent: { $o?: any; method: any; } | typeof ROOT_ROUTE,
  route: RouteDef,
  handler: (state: any) => any
) {

  if (route.bodyFormat && !BodyFormats.includes(route.bodyFormat))
    throw new Error("Invalid bodyFormat: " + route.bodyFormat);
  if (!route.method.every(e => (parent === ROOT_ROUTE ? AllowedMethods : parent.method).includes(e)))
    throw new Error("Invalid method: " + route.method);
  if (route.path.source[0] !== "^")
    throw new Error("Path regex must start with ^");

  if (parent !== ROOT_ROUTE) {
    // the typing is too complicated if we add childRoutes
    if (!(parent as any).childRoutes) (parent as any).childRoutes = [];
    (parent as any).childRoutes.push(route);
  }

  (route as ServerRoute).defineRoute = (...args: [any, any]) => defineRoute(route, ...args);

  (route as ServerRoute).handler = handler;

  debug(route.method, route.path.source);

  return route as any;
}
export const ROOT_ROUTE: unique symbol = Symbol("ROOT_ROUTE");

