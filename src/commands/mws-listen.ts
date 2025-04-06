
import { Commander, CommandInfo } from ".";
import { ok } from "assert";
import { existsSync, readFileSync } from "fs";
import { Server, IncomingMessage, ServerResponse, createServer } from "http";
import * as http2 from "node:http2";
import { Router } from "../routes/router";
import { MWSConfig } from "../server";
import { Streamer } from "../streamer";
import { createRequire } from 'node:module';


export class ListenerBase {
  constructor(
    public server: http2.Http2SecureServer | Server,
    public router: Router,
    public bindInfo: string
  ) {
    this.server.on("request", (
      req: IncomingMessage | http2.Http2ServerRequest,
      res: ServerResponse | http2.Http2ServerResponse
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
      console.log(`Listening on`, address);
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
    const bindInfo = host ? `HTTPS ${host} ${port}` : `HTTPS ${port}`;
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
    const bindInfo = host ? `HTTP ${host} ${port}` : `HTTP ${port}`;
    super(createServer(), router, bindInfo);
    if (port) this.server.listen(port, host);
  }
}


export const info: CommandInfo = {
  name: "mws-listen",
  synchronous: true,
};


export class Command {
  execute;
  get $tw() { return this.commander.$tw; }
  constructor(
    public params: string[],
    public commander: Commander,
    listenConfig: MWSConfig["listeners"],
  ) {
    if (this.params.length) throw `${info.name}: No parameters allowed. Please put listener options in the config file.`;

    this.execute = async () => {

      this.commander.addCommandTokens([
        "--mws-render-tiddlywiki5",
        "--mws-command-separator",
      ]);

      const router = await Router.makeRouter(
        this.commander,
        this.commander.config.enableDevServer
      ).catch(e => {
        console.log(e.stack);
        throw "Router failed to load";
      });

      const listeners = listenConfig.map(e => {
        if (!e.key !== !e.cert) {
          throw new Error("Both key and cert are required for HTTPS");
        }

        const listener = e.key && e.cert
          ? new ListenerHTTPS(router, e)
          : new ListenerHTTP(router, e);

        return listener;
      });

      await this.commander.config.onListenersCreated?.(listeners);
    };

  }

}