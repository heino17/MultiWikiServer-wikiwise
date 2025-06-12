import { existsSync, readFileSync } from 'node:fs';
import { ok } from "node:assert";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { createSecureServer, Http2SecureServer, Http2ServerRequest, Http2ServerResponse } from "node:http2";
import { Router } from "./router";

export class ListenerBase {

  constructor(
    public server: Http2SecureServer | Server,
    public router: Router,
    public bindInfo: string,
    public options: ListenOptions,
  ) {

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
  constructor(router: Router, config: ListenOptions) {
    const { port = process.env.PORT, host, prefix = "" } = config;
    const bindInfo = host ? `HTTP ${host} ${port} ${prefix}` : `HTTP ${port} ${prefix}`;
    ok(config.key && existsSync(config.key), "Key file not found at " + config.key);
    ok(config.cert && existsSync(config.cert), "Cert file not found at " + config.cert);
    const key = readFileSync(config.key), cert = readFileSync(config.cert);
    super(createSecureServer({ key, cert, allowHTTP1: true, }), router, bindInfo, config);

  }

}

export class ListenerHTTP extends ListenerBase {
  /** Create an http1 server */
  constructor(router: Router, config: ListenOptions) {
    const { port, host, prefix = "" } = config;
    const bindInfo = host ? `HTTP ${host} ${port} ${prefix}` : `HTTP ${port} ${prefix}`;
    super(createServer(), router, bindInfo, config);
  }
}

export interface ListenOptions {
  port?: string;
  host?: string;
  prefix?: string;
  key?: string;
  cert?: string;
  secure?: boolean;
  redirect?: number;
}


