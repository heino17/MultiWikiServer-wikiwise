import { existsSync, readFileSync } from 'node:fs';
import { Router } from "./router";
import { ok } from "node:assert";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { createSecureServer, Http2SecureServer, Http2ServerRequest, Http2ServerResponse } from "node:http2";
import { makeRouter } from './makeRouter';
import { serverEvents } from './ServerEvents';
import { z } from "zod";
import { fromError } from 'zod-validation-error';


export async function startListeners(listenOptions: ListenerRaw[]) {
  const listenerCheck = z.object({
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
    secure: z.enum(["true", "false", "yes", "no"]).optional()
  }).strict().array().safeParse(listenOptions);

  if (!listenerCheck.success) {
    console.log("Invalid listener options: ");
    console.log(listenOptions);
    console.log(fromError(listenerCheck.error).toString());
    process.exit();
  }

  await serverEvents.emitAsync("listen.options", listenerCheck.data);

  const router = await makeRouter();

  const listenInstances = listenOptions.map(e => {

    if (!e.key !== !e.cert) {
      throw new Error("Both key and cert are required for HTTPS");
    }

    return e.key && e.cert
      ? new ListenerHTTPS(router, e)
      : new ListenerHTTP(router, e);

  });

  await serverEvents.emitAsync("listen.instances", listenInstances);



}

export type ListenerRaw = {
  [key in
  | "port"
  | "host"
  | "prefix"
  | "key"
  | "cert"
  | "secure"
  | "redirect"
  ]?: string | undefined
};

export interface Listener extends ListenerRaw {
  prefix: string; // this is always a string
}

export class ListenerBase {
  public options: Listener;
  constructor(
    public server: Http2SecureServer | Server,
    public router: Router,
    public bindInfo: string,
    options: ListenerRaw,
  ) {


    this.options = options as Listener;

    this.server.on("request", (
      req: IncomingMessage | Http2ServerRequest,
      res: ServerResponse | Http2ServerResponse
    ) => {
      this.handleRequest(req, res);
    });
    this.server.on('error', (error: NodeJS.ErrnoException) => {

      if (error.syscall !== 'listen') {
        throw error;
      }

      // handle specific listen errors with friendly messages
      switch (error.code) {
        case 'EACCES':
          console.error(bindInfo + ' requires elevated privileges');
          process.exit();
          break;
        case 'EADDRINUSE':
          console.error(bindInfo + ' is already in use');
          process.exit();
          break;
        default:
          throw error;
      }

    });
    this.server.on('listening', () => {
      const address = this.server.address();
      console.log(`Listening on`, address, options.prefix);
    });
    const { host = "localhost", port = "" } = options;
    if (port === "0") {
      this.server.listen(undefined, host);
    } else if (+port) {
      this.server.listen(+port, host);
    } else {
      this.server.listen(8080, host);
    }
  }

  handleRequest(
    req: IncomingMessage | Http2ServerRequest,
    res: ServerResponse | Http2ServerResponse
  ) {
    this.router.handle(req, res, this.options);
  }

}

export class ListenerHTTPS extends ListenerBase {
  constructor(router: Router, config: ListenerRaw) {
    const { port = process.env.PORT, host, prefix } = config;
    const bindInfo = host ? `HTTP ${host} ${port} ${prefix}` : `HTTP ${port} ${prefix}`;
    ok(config.key && existsSync(config.key), "Key file not found at " + config.key);
    ok(config.cert && existsSync(config.cert), "Cert file not found at " + config.cert);
    const key = readFileSync(config.key), cert = readFileSync(config.cert);
    super(createSecureServer({ key, cert, allowHTTP1: true, }), router, bindInfo, config);

  }

}

export class ListenerHTTP extends ListenerBase {
  /** Create an http1 server */
  constructor(router: Router, config: ListenerRaw) {
    const { port, host, prefix } = config;
    const bindInfo = host ? `HTTP ${host} ${port} ${prefix}` : `HTTP ${port} ${prefix}`;
    super(createServer(), router, bindInfo, config);
  }
}


