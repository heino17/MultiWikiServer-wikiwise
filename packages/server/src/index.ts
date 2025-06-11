import { serverEvents } from "@tiddlywiki/events";
import type { RouteMatch, Router } from "./router";
import type { Listener } from "./listeners";
import type { Streamer } from "./streamer";
import type { IncomingMessage, ServerResponse } from "http";
import type { Http2ServerRequest, Http2ServerResponse } from "http2";
import type { ServerRequest } from "./StateObject";
import { Z2 } from "./zodRoute";

export * from "./listeners";
export * from "./router";
export * from "./StateObject";
export * from "./streamer";
export * from "./utils";
export * from "./zodRegister";
export * from "./zodRoute";
export * as zod from "zod";

/**
 * 
 * Runs the following events in order:
 * - `"zod.make"`
 */
export async function startup() {
  await serverEvents.emitAsync("zod.make", Z2);
}

declare module "@tiddlywiki/events" {
  interface ServerEventsMap {
    "zod.make": [zod: Z2<any>]
    "request.middleware": [router: Router, req: IncomingMessage | Http2ServerRequest, res: ServerResponse | Http2ServerResponse, options: Listener]
    "request.streamer": [router: Router, streamer: Streamer]
    "request.state": [router: Router, state: ServerRequest, streamer: Streamer]
    "request.handle": [state: ServerRequest, route: RouteMatch[]]
    "request.fallback": [state: ServerRequest, route: RouteMatch[]]
  }
}

declare global { const STREAM_ENDED: unique symbol; }
const STREAM_ENDED: unique symbol = Symbol("STREAM_ENDED");
(global as any).STREAM_ENDED = STREAM_ENDED;