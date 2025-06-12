import { serverEvents } from "@tiddlywiki/events";
import { createRootRoute, Router, ServerRoute, type RouteMatch } from "./router";
import { ListenerBase, ListenerHTTP, ListenerHTTPS, ListenOptions } from "./listeners";
import type { Streamer } from "./streamer";
import type { IncomingMessage, ServerResponse } from "http";
import type { Http2ServerRequest, Http2ServerResponse } from "http2";
import type { ServerRequest } from "./StateObject";
import { Z2 } from "./zodRoute";
import { z } from "zod";
import { fromError } from "zod-validation-error";

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

const listenOptionsCheck = z.object({
  port: z.string().optional(),
  host: z.string().optional(),
  prefix: z.string().optional()
    .transform(prefix => prefix || "")
    .refine((prefix) => !prefix || prefix.startsWith("/"),
      "Listener path prefix must start with a slash or be falsy")
    .refine((prefix) => !prefix.endsWith("/"),
      "Listener path prefix must NOT end with a slash"),
  key: z.string().optional(),
  cert: z.string().optional(),
  secure: z.boolean().optional(),
  redirect: z.number().optional(),
}).strict().array();

export async function startListening(
  router: Router,
  options: ListenOptions[] = []
) {

  const listenerCheck = listenOptionsCheck.safeParse(options);

  if (!listenerCheck.success) {
    console.log("Invalid listener options: ");
    console.log(options);
    const errorString = fromError(listenerCheck.error).toString();
    console.log(errorString);
    throw new Error("Invalid listener options: " + errorString);
  }

  const listenInstances = listenerCheck.data.map(e => {

    if (!e.key !== !e.cert) {
      throw new Error("Both key and cert are required for HTTPS");
    }

    return e.key && e.cert
      ? new ListenerHTTPS(router, e)
      : new ListenerHTTP(router, e);

  });

  return listenInstances;

}

declare module "@tiddlywiki/events" {
  interface ServerEventsMap {
    "zod.make": [zod: Z2<any>]
    "request.middleware": [router: Router, req: IncomingMessage | Http2ServerRequest, res: ServerResponse | Http2ServerResponse, options: ListenOptions]
    "request.streamer": [router: Router, streamer: Streamer]
    "request.state": [router: Router, state: ServerRequest, streamer: Streamer]
    "request.handle": [state: ServerRequest, route: RouteMatch[]]
    "request.fallback": [state: ServerRequest, route: RouteMatch[]]
  }
}

declare global { const STREAM_ENDED: unique symbol; }
const STREAM_ENDED: unique symbol = Symbol("STREAM_ENDED");
(global as any).STREAM_ENDED = STREAM_ENDED;