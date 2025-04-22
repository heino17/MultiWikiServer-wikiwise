
import { request } from "http";
import { resolve } from "path";
import { StateObject } from "./StateObject";
import { dist_resolve } from "./utils";



export async function setupDevServer<T extends StateObject>(enableDevServer: string | undefined) {

  if (!enableDevServer) {
    return async function sendProdServer(state: T) {

      const rootdir = dist_resolve('../react-user-mgmt/public');
      // use sendFile directly instead of having the dev server send it
      return state.sendFile(200, {}, {
        root: rootdir,
        reqpath: state.url === "/" ? "/index.html" : state.url,
        on404: () => state.sendFile(200, {}, { reqpath: "/index.html", root: rootdir, })
      });
    };
  } else {
    const esbuild = await import("esbuild");

    const rootdir = resolve(enableDevServer, 'react-user-mgmt');

    let ctx = await esbuild.context({
      entryPoints: [resolve(rootdir, 'src/main.tsx')],
      bundle: true,
      target: 'es2020',
      platform: 'browser',
      jsx: 'automatic',
      outdir: resolve(rootdir, 'public'),
      minify: true,
      sourcemap: true,
    });

    const { port } = await ctx.serve({
      servedir: resolve(rootdir, 'public'),
      fallback: resolve(rootdir, 'public/index.html'),
    });

    return async function sendDevServer(state: T) {
      const proxyRes = await new Promise<import("http").IncomingMessage>((resolve, reject) => {
        const headers = { ...state.headers };
        delete headers[":method"];
        delete headers[":path"];
        delete headers[":authority"];
        delete headers[":scheme"];
        headers.host = "localhost";
        const proxyReq = request({
          hostname: "localhost",
          port: port,
          path: state.url,
          method: state.method,
          headers,
        }, resolve);
        state.reader.pipe(proxyReq, { end: true });
      });

      const { statusCode, headers } = proxyRes;
      if (statusCode === 404 || !statusCode) {
        proxyRes.resume();
        return state.sendEmpty(404, { 'Content-Type': 'text/html' });
      } else {
        return state.sendStream(statusCode as number, headers, proxyRes);
      }

    };
  }
}
