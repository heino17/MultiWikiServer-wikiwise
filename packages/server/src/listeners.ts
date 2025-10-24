import { existsSync, readFileSync } from 'node:fs';
import { ok } from "node:assert";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { createSecureServer, Http2SecureServer, Http2ServerRequest, Http2ServerResponse } from "node:http2";
import { Router } from "./router";
import { serverEvents } from '@tiddlywiki/events';
import { GenericRequest, GenericResponse } from './streamer';

export class ListenerBase {

  constructor(
    public server: Http2SecureServer | Server,
    public router: Router,
    public bindInfo: string,
    public options: ListenOptions,
  ) {
    serverEvents.on("exit", async () => {
      await new Promise<any>((resolve) => {
        this.server.close(resolve);
      });
      console.log("HTTPS server closed");
    });
    this.server.on("request", (
      req: GenericRequest,
      res: GenericResponse
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
          process.exit(4);
          break;
        case 'EADDRINUSE':
          console.error(bindInfo + ' is already in use');
          process.exit(4);
          break;
        default:
          throw error;
      }

    });
    this.server.on('listening', () => {
      const address = this.server.address();
      console.log(`Listening on`, address, options.prefix);
    });
    const { host, port } = options;
    if (port === "0") {
      this.server.listen(undefined, host);
    } else if (port && +port) {
      this.server.listen(+port, host);
    } else {
      this.server.listen(8080, host);
    }

  }

  handleRequest(
    req: GenericRequest,
    res: GenericResponse
  ) {
    this.router.handle(req, res, this.options);
  }

}

export class ListenerHTTPS extends ListenerBase {
  constructor(router: Router, config: ListenOptions) {
    const { port, host, prefix } = config;
    const bindInfo = `HTTPS ${host} ${port} ${prefix}`;
    ok(config.key && existsSync(config.key), "Key file not found at " + config.key);
    ok(config.cert && existsSync(config.cert), "Cert file not found at " + config.cert);
    const key = readFileSync(config.key), cert = readFileSync(config.cert);
    super(createSecureServer({ key, cert, allowHTTP1: true, }), router, bindInfo, config);

  }

}

export class ListenerHTTP extends ListenerBase {
  /** Create an http1 server */
  constructor(router: Router, config: ListenOptions) {
    const { port, host, prefix } = config;
    const bindInfo = `HTTP ${host} ${port} ${prefix}`;
    super(createServer(), router, bindInfo, config);
  }
}

export interface ListenOptions {
  port: string;
  host: string;
  prefix: string;
  secure: boolean;
  key?: string;
  cert?: string;
  redirect?: number;
}


