// start: `SKIPDTS=1 tsup && ENABLE_DEV_SERVER=1 node mws.dev.mjs`
// docs: `ENABLE_DOCS_ROUTE=1 npm start`
// postinstall: `PRISMA_CLIENT_FORCE_WASM=true prisma generate`

import { spawn } from "child_process";
import { writeFileSync } from "fs";

const workspaces = [
  "packages/server",
  "packages/mws",
  "packages/react-admin",
  "packages/tiddlywiki-types",
  "plugins/client"
];

switch(process.argv[2]) {
  case "install":
    // run npm install in each workspace
    await start("npm install", []);
    for(const ws of workspaces) {
      console.log("================================")
      await start("npm install", [], {}, { cwd: ws });
    }
    break;
  case "tsc":
    // run tsc in each workspace
    await start("npm run tsc", []).catch(console.log);
    for(const ws of workspaces) {
      console.log("================================")
      await start("npm run tsc", [], {}, { cwd: ws }).catch(console.log);
    }
    break;
  case "start":
    // don't wait on tsc, it's just for checking types
    // await start("npm run tsc", []);
    await start("tsup --silent", [], {
      SKIPDTS: "1"
    });
    await start("node --trace-uncaught mws.dev.mjs", process.argv.slice(3), {
      ENABLE_DEV_SERVER: "1",
      ENABLE_EXTERNAL_PLUGINS: "1",
    });
    break;
  case "docs":
    // call this directly rather than going through npm start
    start("node scripts.mjs start", [], {
      ENABLE_DOCS_ROUTE: "1"
    });
    break;
  case "prisma:generate":
    start("prisma generate", [], {
      PRISMA_CLIENT_FORCE_WASM: "true"
    });
    break;
  case "client-types": {
    const res = await start("node --trace-uncaught mws.dev.mjs", ["build-types"], {}, {
      pipeOut: true,
    });
    writeFileSync("packages/react-admin/src/server-types.ts", res);
    break;
  }
  case "build:types": {
    await start("npx tsc -p tsconfig.types.json", []);
    break;
  }
  default:
    console.log("nothing ran");
}


function start(cmd, args, env2 = {}, { cwd = process.cwd(), pipeOut } = {}) {
  const cp = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env2, },
    shell: true,
    stdio: ["pipe", pipeOut ? "pipe" : "inherit", "inherit"],
  });
  cp.stdin.end();
  if(pipeOut) {

    return new Promise((r, c) => {
      const chunks = [];
      cp.stdout.on("data", (data) => {
        chunks.push(data);
      });
      cp.stdout.on("end", () => {
        r(chunks.map(e => e.toString()).join(""));
      });
      // if any process errors it will immediately exit the script
      cp.on("exit", (code) => {
        if(code) c(code);
      });
    });
  } else {
    return new Promise((r, c) => {
      // if any process errors it will immediately exit the script
      cp.on("exit", (code) => { if(code) c(code); else r(); });
    });
  }


}