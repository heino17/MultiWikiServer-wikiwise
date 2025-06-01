import { AllowedMethods, ZodAssert } from "../utils";
import { Prisma, PrismaClient } from "@prisma/client";
import { ManagerRoutes } from "./managers";
import { WikiRoutes } from "./managers/wiki-routes";
import { DocsRoute } from "./tw-routes";
import { SiteConfig } from "../ServerState";
import { SessionManager } from "../services/sessions";
import { registerCacheRoutes } from "./cache";
import { StateObject } from "./StateObject";

declare global {
  const ENABLE_UNSAFE_PRISMA_ROUTE: any;
  const ENABLE_DOCS_ROUTE: any;
}

export default async function RootRoute(root: rootRoute, config: SiteConfig) {

  // const adminRoute = root.defineRoute({
  //   method: AllowedMethods,
  //   path: /^\/admin/,
  //   denyFinal: true,
  // }, async (state: StateObject) => {
  //   // do admin route checks here
  // });

  // const wikiRoute = root.defineRoute({
  //   method: AllowedMethods,
  //   path: /^\/wiki/,
  //   denyFinal: true,
  // }, async (state: StateObject) => {
  //   // do wiki route checks here
  // });

  await SessionManager.defineRoutes(root);
  if (process.env.ENABLE_DOCS_ROUTE)
    await DocsRoute(root, "/mws-docs", false);
  await WikiRoutes.defineRoutes(root);
  await ManagerRoutes(root, config);
  await registerCacheRoutes(root, config);


  if (process.env.ENABLE_UNSAFE_PRISMA_ROUTE)
    definePrismaRoute(root, config);

  // fallback route 

  root.defineRoute({
    method: ['GET'],
    path: /^\/.*/,
    bodyFormat: "stream",
  }, async state => {
    await state.sendDevServer();
    return STREAM_ENDED;
  });




}

function definePrismaRoute(root: rootRoute, config: SiteConfig) {
  root.defineRoute({
    method: ["POST"],
    path: /^\/prisma$/,
    bodyFormat: "json",
  }, async (state) => {
    ZodAssert.data(state, z => z.object({
      table: z.string(),
      action: z.string(),
      arg: z.any(),
    }));
    await state.$transaction(async prisma => {
      // DEV: this just lets the client directly call the database. 
      // TODO: it's just for dev purposes and will be removed later. 
      // DANGER: it circumvents all security and can totally rewrite the ACL.
      const p: any = prisma;
      const table = p[state.data.table];
      if (!table) throw new Error(`No such table`);
      const fn = table[state.data.action];
      if (!fn) throw new Error(`No such table or action`);
      console.log(state.data.arg);
      return state.sendJSON(200, await fn.call(table, state.data.arg));
    });
    return STREAM_ENDED;
  });
}

class ProxyPromise {
  static getErrorStack(t: ProxyPromise) { return t.#error.stack; }
  action: any;
  table: any;
  arg: any;
  #error = new Error("An error occured for this request");
  constructor({ action, table, arg }: Omit<ProxyPromise, "#error">) {
    this.action = action;
    this.table = table;
    this.arg = arg;
    Object.defineProperty(this, "toJSON", {
      configurable: true,
      enumerable: true,
      value: () => ({
        action: this.action,
        table: this.table,
        arg: this.arg,
        dbnulls: this.arg.data && findValueInObject(this.arg.data, e => e === Prisma.DbNull),
        jsnulls: this.arg.data && findValueInObject(this.arg.data, e => e === Prisma.JsonNull),
      })
    })
  }
}

function findValueInObject(val: any, predicate: (val: any) => boolean, keys: string[] = [], paths: string[] = []): any {
  if (predicate(val)) {
    paths.push(keys.join("/"));
    return paths;
  }
  if (val && typeof val === "object") {
    for (const key of Object.keys(val)) {
      if (!val.hasOwnProperty(key)) continue;
      findValueInObject(val[key], predicate, [...keys, key], paths);
    }
  }
  console.log(paths, keys);
  return paths;
}

function capitalize<T extends string>(table: T): Capitalize<T> {
  return table.slice(0, 1).toUpperCase() + table.slice(1) as any;
}


const argproxy: {
  [Table in keyof PrismaClient]: {
    [Action in keyof PrismaClient[Table]]:
    PrismaClient[Table][Action] extends (...args: any) => any
    ? <T extends Parameters<PrismaClient[Table][Action]>[0]>(arg: T) => {
      table: Table,
      action: Action,
      arg: T,
      result: Awaited<ReturnType<PrismaClient[Table][Action]>>,
    }
    : never
  }
} = (() => new Proxy<any>({}, {
  get(target: any, table: any) {
    return target[table] = target[table] || new Proxy<any>({}, {
      get(target: any, action: any) {
        return target[action] = target[action] || ((arg: any) => {
          return new ProxyPromise({ action, table: capitalize(table) as any, arg });
        })
      },
    })
  },
}))();