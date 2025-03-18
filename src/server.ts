import "./StateObject"; // <- load this first so it waits for streamer to be defined
import "./streamer";
import "./router";
import "./global";
import * as http2 from 'node:http2';
import * as net from "node:net";
import * as opaque from "@serenity-kit/opaque";
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Streamer } from "./streamer";
import { Router } from './router';
import * as sessions from "./routes/services/sessions";
import * as attacher from "./routes/services/attachments";
import { resolve } from "node:path";
import { ok } from "node:assert";

export * from "./routes/services/sessions";

declare module 'node:net' {
  interface Socket {
    // this comment gets prepended to the other comment for this property, thus the hanging sentance.
    /** Not defined on net.Socket instances. 
     * 
     * On tls.Socket instances,  */
    encrypted?: boolean;
  }
}

export class ListenerBase {
  constructor(
    public server: http2.Http2SecureServer | Server,
    public router: Router,
    public bindInfo: string,
  ) {
    this.server.on("request", (
      req: IncomingMessage | http2.Http2ServerRequest,
      res: ServerResponse | http2.Http2ServerResponse
    ) => {
      // I'm not sure if this is necessary or not
      if (!req.socket.encrypted) req.socket.destroy();
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
      console.log('Server listening on ' + bindInfo + ' 🚀');
    });
  }

  handleRequest(
    req: IncomingMessage | http2.Http2ServerRequest,
    res: ServerResponse | http2.Http2ServerResponse
  ) {
    const streamer = new Streamer(req, res, this.router);
    this.router.handle(streamer).catch(streamer.catcher);
  }
}

export class ListenerHTTPS extends ListenerBase {
  constructor(router: Router, config: MWSConfig["listeners"][number]) {
    const { port, host } = config;
    if (port && typeof port !== "number") throw new Error("If specified, port must be a number");
    const bindInfo = host ? `${host}:${port}` : `${port}`;
    ok(config.key && existsSync(config.key), "Key file not found");
    ok(config.cert && existsSync(config.cert), "Cert file not found");
    const key = readFileSync(config.key);
    const cert = readFileSync(config.cert);
    super(http2.createSecureServer({ key, cert, allowHTTP1: true, }), router, bindInfo);
    if (port) this.server.listen(port, host);
  }

}

export class ListenerHTTP extends ListenerBase {
  /** Create an http1 server */
  constructor(router: Router, config: MWSConfig["listeners"][number]) {
    const { port, host } = config;
    if (port && typeof port !== "number") throw new Error("If specified, port must be a number");
    const bindInfo = host ? `${host}:${port}` : `${port}`;
    super(createServer(), router, bindInfo);
    if (port) this.server.listen(port, host);
  }
}

export interface MWSConfig {
  listeners: {
    /** The key file for the HTTPS server. If either key or cert are set, both are required, and HTTPS is enforced. */
    key?: string
    /** The cert file for the HTTPS server. If either key or cert are set, both are required, and HTTPS is enforced. */
    cert?: string
    /** The port to listen on. If not specified, listen will not be called. */
    port?: number
    /** The hostname to listen on. If this is specified, then port is required. */
    host?: string
  }[]
  enableDevServer?: boolean
  /** The key file for the password encryption. If this key changes, all passwords will be invalid and need to be changed. */
  passwordMasterKey: string
  config: MWSConfigConfig
  /** 
   * The session manager class registers the login handler routes and sets the auth user 
   */
  SessionManager?: typeof sessions.SessionManager;
  /** 
   * The attachment service class is used by routes to handle attachments
   */
  AttachmentService?: typeof attacher.AttachmentService;

  onListenersCreated?: (listeners: ListenerBase[]) => void
}

/**
 * 
```
import startServer from "./src/server.ts";

startServer({
  // enableDevServer: true,
  passwordMasterKey: "./localpass.key",
  listeners: [{
    key: "./localhost.key",
    cert: "./localhost.crt",
    port: 5000,
  }],
  config: {
    wikiPath: "./editions/mws",
    allowAnonReads: false,
    allowAnonWrites: false,
    allowUnreadableBags: false,
  },
});

```
 */
export default async function startServer(config: MWSConfig) {
  // await lazy-loaded or async models
  await opaque.ready;

  if (!config.passwordMasterKey) {
    throw new Error("passwordMasterKey is required");
  }

  if (config.passwordMasterKey && !existsSync(config.passwordMasterKey)) {
    writeFileSync(config.passwordMasterKey, opaque.server.createSetup());
    console.log("Password master key created at", config.passwordMasterKey);
  }

  const router = await Router.makeRouter(
    config.config,
    readFileSync(config.passwordMasterKey, "utf8").trim(),
    config.enableDevServer ?? false,
    config.SessionManager || sessions.SessionManager,
    config.AttachmentService || attacher.AttachmentService
  ).catch(e => {
    console.log(e.stack);
    throw "Router failed to load";
  });


  const listeners = config.listeners.map(e => {
    if (!e.key !== !e.cert) {
      throw new Error("Both key and cert are required for HTTPS");
    }

    const listener = e.key && e.cert
      ? new ListenerHTTPS(router, e)
      : new ListenerHTTP(router, e);

    return listener;
  });

  config.onListenersCreated?.(listeners);

}

export interface MWSConfigConfig {
  /** Path to the mws datafolder. */
  readonly wikiPath: string
  /** If true, allow users that aren't logged in to read. */
  readonly allowAnonReads?: boolean
  /** If true, allow users that aren't logged in to write. */
  readonly allowAnonWrites?: boolean
  /** If true, recipes will allow access to a user who does not have read access to all its bags. */
  readonly allowUnreadableBags?: boolean
  /** If true, files larger than `this * 1024` will be saved to disk alongside the database instead of in the database. */
  readonly saveLargeTextToFileSystem?: number;


}
