import EventEmitter from "events";
import type { ServerState, SiteConfig } from "./ServerState";
import type { TW } from "tiddlywiki";
import type * as commander from "commander";
import type { ListenerRaw } from "./commands/listen";
import type { Router } from "./listen/router";
import type { ListenerHTTP, ListenerHTTPS } from "./listen/listeners";
import type { CommandFile } from "./utils";
// the keys in the arrays are labels which get used for the 
// argument names when the tuple is used in a function definition
export interface ServerEventsMap {
  "cli.commands.register": [commands: Record<string, CommandFile>]
  "cli.commander": [commander.Command]
  "cli.command.parsed": [cmd: string, params: string[], options: {}]
  "server.create.after": [state: ServerState, $tw: TW]
  "server.init.after": [state: ServerState]
  "listen.options": [listeners: ListenerRaw[], config: SiteConfig]
  "listen.routes": [rootRoute: rootRoute, config: SiteConfig]
  /** Called after all listen.routes handlers complete so fallback routes can be safely added. */
  "listen.routes.fallback": [rootRoute: rootRoute, config: SiteConfig]
  "listen.router": [router: Router]
  "listen.instances": [instances: (ListenerHTTPS | ListenerHTTP)[]]
}

export class ServerEvents extends EventEmitter<ServerEventsMap> {
  /** Use emitAsync instead */
  override emit!: never;

  async emitAsync<K>(
    eventName: keyof ServerEventsMap | K,
    ...args: K extends keyof ServerEventsMap ? ServerEventsMap[K] : never
  ) {
    await Promise.all(this.listeners(eventName).map(e => e(...args)));
  }
}
/**
 * Server events used throughout the entire server.
 * 
 * The listener function is awaited, but the return value is ignored. 
 * 
 * If any listener throws, the await rejects, and the error is 
 * caught by the nearest error handler, if one exists. 
 */
export const serverEvents = new ServerEvents();


