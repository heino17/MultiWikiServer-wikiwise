import "@tiddlywiki/utils";
import { serverEvents } from "@tiddlywiki/events";
import { createRootRoute, Router, ServerRoute, type RouteMatch } from "./router";
import { ListenerBase, ListenerHTTP, ListenerHTTPS, ListenOptions } from "./listeners";
import type { Streamer } from "./streamer";
import type { IncomingMessage, ServerResponse } from "http";
import type { Http2ServerRequest, Http2ServerResponse } from "http2";
import type { ServerRequest } from "./StateObject";
import { Z2, zod as z } from "./Z2";

export * from "./listeners";
export * from "./router";
export * from "./SendError";
export * from "./StateObject";
export * from "./streamer";
export * from "./utils";
export * from "./Z2";
export * from "./zodRegister";
export * from "./zodRoute";

/**
 * 
 * Runs the following events in order:
 * - `"zod.make"`
 */
export async function startup() {
  await serverEvents.emitAsync("zod.make", Z2);
}
let exiting = false;
const exit = async (signal: any) => {
  if (exiting) return;
  exiting = true;
  console.log(` Server exiting due to ${signal}...`);
  console.time("Server exit");
  await serverEvents.emitAsync("exit");
  console.timeEnd("Server exit");
  await new Promise<void>((r) => setTimeout(r, 5000));
  console.log("Server exit timeout reached, forcing exit.");
  console.log("Exiting process...");
  process.exit(0);
};

// process.on("SIGINT", exit);
// process.on("SIGTERM", exit);
// process.on("SIGHUP", exit);

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
  secureServerOptions: z.any(),
  secure: z.boolean().optional(),
  redirect: z.number().optional(),
}).strict().array();

export async function startListening(
  router: Router,
  options: Partial<ListenOptions>[] = []
) {

  const listenerCheck = listenOptionsCheck.safeParse(options);

  if (!listenerCheck.success) {
    console.log("Invalid listener options: ");
    console.log(options);
    const errorString = Z2.prettifyError(listenerCheck.error).toString();
    console.log(errorString);
    throw new Error("Invalid listener options: " + errorString);
  }

  const listenInstances = listenerCheck.data.map(e => {

    if (!e.key !== !e.cert) {
      throw new Error("Both key and cert are required for HTTPS");
    }

    const options2: ListenOptions = {
      port: e.port ?? process.env.PORT ?? "8080",
      host: e.host ?? "localhost",
      prefix: e.prefix ?? "",
      secure: e.secure ?? false,
      key: e.key,
      cert: e.cert,
      redirect: e.redirect,
      secureServerOptions: e.secureServerOptions
    }

    return (e.secureServerOptions || e.key && e.cert)
      ? new ListenerHTTPS(router, options2)
      : new ListenerHTTP(router, options2);

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
    "exit": []
  }
}

declare global { const STREAM_ENDED: unique symbol; }
const STREAM_ENDED: unique symbol = Symbol("STREAM_ENDED");
(global as any).STREAM_ENDED = STREAM_ENDED;