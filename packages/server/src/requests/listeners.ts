import { existsSync, readFileSync } from 'node:fs';
import { ok } from "node:assert";
import { createServer, IncomingMessage, Server, ServerResponse } from "node:http";
import { createSecureServer, Http2SecureServer, Http2ServerRequest, Http2ServerResponse } from "node:http2";
import { AllowedMethods, BodyFormats, Router } from "./router";
import Debug from "debug";
import { ServerRequest } from './StateObject';


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


const debugDefining = Debug("mws:router:defining");
function defineRoute(
  parent: { $o?: any; method: any; } | typeof ROOT_ROUTE,
  route: RouteDef,
  handler: (state: any) => any
) {

  if (route.bodyFormat && !BodyFormats.includes(route.bodyFormat))
    throw new Error("Invalid bodyFormat: " + route.bodyFormat);
  if (!route.method.every(e => (parent === ROOT_ROUTE ? AllowedMethods : parent.method).includes(e)))
    throw new Error("Invalid method: " + route.method);
  if (route.path.source[0] !== "^")
    throw new Error("Path regex must start with ^");

  if (parent !== ROOT_ROUTE) {
    // the typing is too complicated if we add childRoutes
    if (!(parent as any).childRoutes) (parent as any).childRoutes = [];
    (parent as any).childRoutes.push(route);
  }

  (route as ServerRoute).defineRoute = (...args: [any, any]) => defineRoute(route, ...args);

  (route as ServerRoute).handler = handler;

  debugDefining(route.method, route.path.source);

  return route as any;
}

const ROOT_ROUTE: unique symbol = Symbol("ROOT_ROUTE");

export const rootRoute = defineRoute(ROOT_ROUTE, {
  method: AllowedMethods,
  path: /^/,
  denyFinal: true,
}, async (state: ServerRequest) => {

});
