import { setupDevServer } from "./setupDevServer";
import { Router } from "./router";
import RootRoute from "../routes";
import { StateObject } from "../routes/StateObject";
import { ServerState } from "../ServerState";
import { AllowedMethods, BodyFormats, Route, RouteOptAny } from "../utils";
import Debug from "debug";

const debug = Debug("mws:router:defining");

export async function makeRouter(
  config: ServerState
) {

  const sendDevServer = await setupDevServer(config);

  const rootRoute = defineRoute(ROOT_ROUTE, {
    method: AllowedMethods,
    path: /^/,
    denyFinal: true,
  }, async (state: StateObject) => {
    // real world example of a parent route being useful:
    state.sendDevServer = sendDevServer.bind(undefined, state);
  });

  await RootRoute(rootRoute, config);

  return new Router(rootRoute, config);
}



export function defineRoute(
  parent: { $o?: any; method: any; } | typeof ROOT_ROUTE,
  route: RouteOptAny,
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

  (route as any).defineRoute = (...args: [any, any]) => defineRoute(route, ...args);

  (route as Route).handler = handler;

  debug(route.method, route.path.source);

  return route as any; // this is usually ignored except for the root route.
}
export const ROOT_ROUTE: unique symbol = Symbol("ROOT_ROUTE");

