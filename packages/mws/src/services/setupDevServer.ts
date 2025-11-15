import { existsSync, rm, rmSync, writeFileSync } from "fs";
// import { buildOptions } from "./context";
import { request } from "http";
import { readFile } from "fs/promises";
import { basename, join, relative, resolve } from "path";
import { dist_resolve, SendError, SendErrorReasonData, ServerRequest } from "@tiddlywiki/server";
import { createHash } from "crypto";

import { BuildOptions, BuildResult } from "esbuild";
import { serverEvents } from "@tiddlywiki/events";
import { Streamer } from "@tiddlywiki/server";
import { objNumberSort } from "@tiddlywiki/server";


export type ServerToReactAdmin
  = { [k in keyof ServerToReactAdminMap]?: ServerToReactAdminMap[k] }
  | null

export interface ServerToReactAdminMap {
  sendError: ReturnType<SendError<keyof SendErrorReasonData>["toJSON"]>,
}

export interface SendAdmin {
  (state: ServerRequest, status: number, serverResponse: ServerToReactAdmin): Promise<typeof STREAM_ENDED>;
}


const DEV_HOST = process.env.MWS_DEV_HOST || "127.0.0.20";



async function buildOptions({ rootdir, publicdir, entryHash }: { rootdir: string; publicdir: string; entryHash: boolean; }) {
  const { default: fn } = await import(resolve(rootdir, "esbuild.options.mjs"));
  const result = await fn({ rootdir, publicdir });
  console.log(result);
  result.options.metafile = true;
  result.options.entryNames = entryHash ? '[name]-[hash]' : undefined;
  return result;
}


function parseMetafileEntryPoints({ entryPoints, result, publicdir }: {
  entryPoints: { in: string; out: string; }[];
  result: BuildResult<BuildOptions & { metafile: true }>;
  publicdir: string;
}) {
  const entryPointsLookup = new Map(
    entryPoints.map(({ in: v, out: k }, index) =>
      [relative(process.cwd(), v), { name: k, index }] as const
    )
  );
  const outputs = Object.entries(result.metafile.outputs);
  const entryPointsInfo = outputs.filter(([k, v]) =>
    v.entryPoint && entryPointsLookup.has(v.entryPoint)
  ).sort(objNumberSort(([k, v]) =>
    entryPointsLookup.get(v.entryPoint!)!.index
  ));
  const js = entryPointsInfo.map(e =>
    relative(publicdir, e[0])
  );
  const css = entryPointsInfo.filter(([k, v]) =>
    v.cssBundle && result.metafile.outputs[v.cssBundle]
  ).map(e =>
    relative(publicdir, e[1].cssBundle!)
  );

  writeFileSync(resolve(publicdir, "stats.json"), JSON.stringify(result.metafile));

  const maxwidth = outputs.reduce((a, [b]) => Math.max(a, b.length), 0);

  console.log("Build", relative(process.cwd(), publicdir), "output the following files");

  outputs.forEach(([k, v]) => {
    const { bytes } = v;
    let bytes2 = bytes, unit = 0;
    while (bytes2 > 1024) { bytes2 /= 1024; unit++; }
    const unitStr = ["B", "KB", "MB", "GB"][unit];
    console.log(`  ${k.padEnd(maxwidth, " ")}: ${(bytes2.toFixed(2) + " " + unitStr).padStart(10, " ")}`);
  });

  return { js, css };
}

const css_placer = "  <!-- CSS entry files -->";
const js_placer = "  <!-- JS entry files -->";
async function generateHtml({ js, css, publicdir, rootdir }: {
  js: string[];
  css: string[];
  rootdir: string;
  publicdir: string;
}) {
  const jsStrings = js.map(e => `  <script type="module" src="${"$$js:pathPrefix$$"}/${e}"></script>`).join("\n");
  const cssStrings = css.map(e => `  <link rel="stylesheet" href="${"$$js:pathPrefix$$"}/${e}" />`).join("\n");

  const indexFile = (await readFile(join(rootdir, "index.html"), "utf8"))
    .replaceAll(css_placer, () => cssStrings)
    .replaceAll(js_placer, () => jsStrings);

  writeFileSync(publicdir + ".html", indexFile);
}


async function make_index_file({ publicdir, pathPrefix, serverResponseJSON }: {
  publicdir: string; pathPrefix: string; serverResponseJSON: string;
}) {
  pathPrefix = (pathPrefix).replaceAll("</script>", "<\\/script>").toString();
  serverResponseJSON = (serverResponseJSON).replaceAll("</script>", "<\\/script>").toString();
  return Buffer.from((await readFile(publicdir + ".html", "utf8"))
    .replaceAll("$$js:pathPrefix$$", pathPrefix)
    .replaceAll("`$$js:pathPrefix:stringify$$`", JSON.stringify(pathPrefix))
    .replaceAll("`$$js:embeddedServerResponse:stringify$$`", serverResponseJSON),
    "utf8");
}


export async function setupClientBuild({ rootdir, publicdir }: { rootdir: string; publicdir: string; }): Promise<SendAdmin> {

  if (process.env.DEVSERVER === "watch") return await startDevServer({ rootdir, publicdir });

  if (process.env.DEVSERVER === "build") await runBuildOnce({ rootdir, publicdir });

  // const publicdir = makepublicdir(key);
  if (!existsSync(publicdir)) throw new Error(`${publicdir} does not exist`);

  return async function sendProdServer(state, status, serverResponse) {
    const sendIndex = () => state.sendFile(200, {}, {
      root: publicdir,
      reqpath: "/index.html"
    });
    // use sendFile directly instead of having the dev server send it
    return state.sendFile(200, {}, {
      root: publicdir,
      reqpath: state.url,
      on404: sendIndex,
      onDir: sendIndex,
    });
  };

}


export async function runBuildOnce({ rootdir, publicdir }: { rootdir: string; publicdir: string; }) {
  const timeTag = `Building client ${relative(process.cwd(), rootdir)}`;
  console.time(timeTag);
  if (existsSync(publicdir)) rmSync(publicdir, { recursive: true });
  const esbuild = await import('esbuild');
  const { options, entryPoints } = await buildOptions({ rootdir, publicdir, entryHash: true });

  // errors cause this to reject
  const result = await esbuild.build(options);
  console.timeEnd(timeTag);

  const { js, css } = parseMetafileEntryPoints({ entryPoints, result, publicdir });

  await generateHtml({ js, css, rootdir, publicdir });

  return result;
}



async function startDevServer({ rootdir, publicdir }: { rootdir: string; publicdir: string; }): Promise<SendAdmin> {

  if (!existsSync(rootdir)) throw new Error("rootdir does not exist");
  if (existsSync(publicdir)) rmSync(publicdir, { recursive: true });

  const esbuild = await import('esbuild');

  const { options, entryPoints } = await buildOptions({ rootdir, publicdir, entryHash: false });

  const ctx = await esbuild.context(options);

  const { port } = await ctx.serve({
    servedir: publicdir,
    host: DEV_HOST,
  });

  async function rebuild() {
    if (existsSync(publicdir)) rmSync(publicdir, { recursive: true });
    // errors cause this to reject
    const result = await ctx.rebuild();
    const { css, js } = parseMetafileEntryPoints({ entryPoints, result, publicdir });
    await generateHtml({ js, css, rootdir, publicdir });
  }

  serverEvents.on("exit", () => ctx.dispose());

  await rebuild();

  return async function sendDevServer(state: Streamer, status: number, serverResponse: ServerToReactAdmin) {
    // this will rebuild the html on page load
    // if the build fails, esbuild will serve the error so we just ignore it

    if (state.headers["sec-fetch-dest"] === "document") await rebuild().catch(() => { });

    const proxyRes = await new Promise<import("http").IncomingMessage>((resolve, reject) => {
      const headers = { ...state.headers };
      delete headers[":method"];
      delete headers[":path"];
      delete headers[":authority"];
      delete headers[":scheme"];
      headers.host = "localhost";
      const proxyReq = request({
        hostname: DEV_HOST,
        port: port,
        path: state.url,
        method: state.method,
        headers,
      }, resolve);
      state.reader.pipe(proxyReq, { end: true });
    });
    const { statusCode, headers } = proxyRes;
    if (statusCode === 404) {
      return state.sendBuffer(200, {
        "content-type": "text/html",
      }, await make_index_file({
        publicdir,
        pathPrefix: state.pathPrefix,
        serverResponseJSON: JSON.stringify(serverResponse)
      }));
    } else {
      return state.sendStream(statusCode as number, headers, proxyRes);
    }

  };
}

