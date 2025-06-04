import EventEmitter from "events";
import type * as commander from "commander";
import type { RouteMatch, Router } from "./requests/router";
import type { Listener, ListenerHTTP, ListenerHTTPS } from "./requests/listeners";
import type { BaseCommand, CommandClass, CommandFile } from "./commands/BaseCommand";
import type { Streamer } from "./requests/streamer";
import { IncomingMessage, ServerResponse } from "http";
import { Http2ServerRequest, Http2ServerResponse } from "http2";
import { ServerRequest } from "./requests/StateObject";
import { Z2 } from "./routes/zodRoute";
// the keys in the arrays are labels which get used for the 
// argument names when the tuple is used in a function definition
export interface ServerEventsMap {
  "zod.make": [zod: Z2<any>]
  "cli.register": [commands: Record<string, CommandFile>]
  "cli.commander": [commander.Command]
  "cli.execute.before": [
    name: string,
    params: string[],
    options: Record<string, string | boolean>,
    instance: BaseCommand
  ]
  "cli.execute.after": [
    name: string,
    params: string[],
    options: Record<string, string | boolean>,
    instance: BaseCommand
  ]
  "listen.router": [listen: BaseCommand, router: Router]
  "listen.routes": [listen: BaseCommand, rootRoute: ServerRoute]
  "listen.routes.fallback": [listen: BaseCommand, rootRoute: ServerRoute]
  "listen.options": [listen: BaseCommand, listeners: Listener[]]
  "listen.instances": [listen: BaseCommand, instances: (ListenerHTTPS | ListenerHTTP)[]]
  "request.middleware": [router: Router, req: IncomingMessage | Http2ServerRequest, res: ServerResponse | Http2ServerResponse, options: Listener]
  "request.streamer": [router: Router, streamer: Streamer]
  "request.state": [router: Router, state: ServerRequest, streamer: Streamer]
  "request.handle": [state: ServerRequest, route: RouteMatch[]]
  "request.fallback": [state: ServerRequest, route: RouteMatch[]]

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
 * To find all references to a specific event, 
 * use find all occurrences on the event name string.
 * 
 * The listener function is awaited, but the return value is ignored. 
 * 
 * If any listener throws, the await rejects, and the error is 
 * caught by the nearest error handler, if one exists. 
 */
export const serverEvents = new ServerEvents();


