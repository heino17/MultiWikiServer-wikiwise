import { existsSync, readFileSync } from 'node:fs';
import { Router } from "./router";
import { ok } from "node:assert";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { createSecureServer, Http2SecureServer, Http2ServerRequest, Http2ServerResponse } from "node:http2";
import { ListenerRaw } from '../commands/listen';
import { SiteConfig } from '../ServerState';
import { t as try_ } from "try";
import { Streamer } from './streamer';
import { makeRouter } from './makeRouter';


export async function startListeners(listeners: ListenerRaw[], config: SiteConfig) {



  const router = await makeRouter(
    config,
  ).catch(e => {
    console.log(e.stack);
    throw "Router failed to load";
  });

  return listeners.map(e => {

    if (!e.key !== !e.cert) {
      throw new Error("Both key and cert are required for HTTPS");
    }

    return e.key && e.cert
      ? new ListenerHTTPS(router, e)
      : new ListenerHTTP(router, e);

  });
}



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
    if (!options.prefix)
      options.prefix = "";
    else if (typeof options.prefix !== "string")
      throw new Error("Listener path prefix must be a string or falsy.");
    else if (!options.prefix.startsWith("/"))
      throw new Error("Listener path prefix must start with a slash, or be falsy");
    else if (options.prefix.endsWith("/"))
      throw new Error("Listener path prefix must NOT end with a slash")

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

    const [ok, err, streamer] = try_(() => new Streamer(
      req, res, this.options.prefix,
      !!(this.options.key && this.options.cert || this.options.secure)
    ));

    if (!ok) {
      if (err === STREAM_ENDED) return;
      res.writeHead(500, { "x-reason": "handle incoming request" }).end();
      throw err;
    }

    this.router.handle(streamer).catch(streamer.catcher);

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


