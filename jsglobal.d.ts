import { IncomingMessage as HTTPIncomingMessage, ServerResponse as HTTPServerResponse } from "http";
import { } from "./server";
import { Router } from "./router";
import { Prisma, PrismaClient } from "@prisma/client";
import { DefaultArgs } from "@prisma/client/runtime/library";
import "./src/startup";
import { SqlTiddlerStore } from "./store/sql-tiddler-store";
import { StateObject } from "./StateObject";
import { Http2ServerRequest, Http2ServerResponse } from "http2";

declare global {
  const $tw: $TW;

  interface Wiki extends Record<string, any> {

  }
  interface Boot extends Record<string, any> {

  }
  interface Tiddler extends Record<string, any> {

  }


  interface $TW {
    // nothing is allowed to access the global. It must come from the state.
    mws: never;
    // mws: {
    //   store: SqlTiddlerStore<unknown>;
    //   serverManager: ServerManager;
    //   router: Router;
    //   connection: PrismaClient;
    //   databasePath: string;
    //   transaction: <T extends "DEFERRED" | "IMMEDIATE">(type: T, callback: (store: SqlTiddlerStore<T>) => Promise<void>) => Promise<void>;
    // }
  }

  interface $TW {
    loadTiddlersFromPath: any;
    loadPluginFolder: any;
    getLibraryItemSearchPaths: any;
    wiki: Wiki;
    utils: {
      [x: string]: any;
      decodeURIComponentSafe(str: string): string;
      each<T>(object: T[], callback: (value: T, index: number, object: T[]) => void): void;
      each<T>(object: Record<string, T>, callback: (value: T, key: string, object: Record<string, T>) => void): void;
      parseJSONSafe(str: string, defaultJSON?: any): any;
      parseNumber(string: string): number;
      parseNumber(string: string | null): number | null;
    };
    modules: {
      [x: string]: any;
      forEachModuleOfType: (moduleType: string, callback: (title: string, module: any) => void) => void;
    }
    boot: any;
    config: any;
    node: any;
    hooks: any;
    sjcl: any;
    Wiki: { new(): Wiki };
    Tiddler: { new(fields: Record<string, any>): Tiddler };

  }




  type HTTPVerb = "GET" | "OPTIONS" | "HEAD" | "PUT" | "POST" | "DELETE";

  interface IncomingMessage extends HTTPIncomingMessage {
    url: string;
    method: string;
    headers: {
      //@ts-ignore
      "set-cookie"?: string[];
      [x: string]: string | undefined;
    }
  }

  interface ServerResponse extends HTTPServerResponse { }

  type PrismaTxnClient = Omit<PrismaClient<Prisma.PrismaClientOptions, never, DefaultArgs>, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">
  interface ServerRoute {
    path: RegExp;
    handler: ServerRouteHandler<number>;
    method?: string;
    useACL?: boolean;
    /** this is required if useACL is true */
    entityName?: string;
    csrfDisable?: boolean;
    bodyFormat?: ServerRouteBodyFormat;
  }
  type ServerRouteBodyFormat = "string" | "www-form-urlencoded" | "buffer" | "stream";
  interface ServerRouteHandler<P extends number, F extends ServerRouteBodyFormat = "string"> {
    (
      this: ServerRoute,
      req: IncomingMessage | Http2ServerRequest,
      res: ServerResponse | Http2ServerResponse,
      state: StateObject
    ): Promise<void>;
  }


  interface ACL_Middleware_Helper {
    /**
     * 
     * @param {IncomingMessage | Http2ServerRequest} request 
     * @param {ServerResponse | Http2ServerResponse} response 
     * @param {StateObject} state 
     * @param {string | null} entityType 
     * @param {string} permissionName 
     * @returns 
     */
    (
      request: IncomingMessage | Http2ServerRequest, 
      response: ServerResponse | Http2ServerResponse, 
      state: StateObject, 
      entityType: string | null, 
      permissionName: string
    ): Promise<undefined>;
  }

}


export { };


