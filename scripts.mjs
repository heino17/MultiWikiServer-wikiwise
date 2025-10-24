// Cross-platform build and development scripts for Windows, Mac, and Linux
// start: `SKIPDTS=1 tsup && ENABLE_DEV_SERVER=1 node mws.dev.mjs`
// docs: `ENABLE_DOCS_ROUTE=1 npm start`
// postinstall: `PRISMA_CLIENT_FORCE_WASM=true prisma generate`

/// <reference lib="es2023" />
/// <reference types="node" />
//@ts-check


import { spawn } from "child_process";
import { EventEmitter } from "events";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync, renameSync } from "fs";
import * as path from "path";
import * as os from "os";
const events = new EventEmitter();
const prismaFolder = "prisma";

// Cross-platform helper functions
const isWindows = os.platform() === "win32";

/**
 * Cross-platform file/directory removal
 * @param {string} targetPath 
 */
function removeRecursive(targetPath) {
  if(existsSync(targetPath)) {
    rmSync(targetPath, { recursive: true, force: true });
  }
}

/**
 * Cross-platform move/rename operation
 * @param {string} oldPath 
 * @param {string} newPath 
 */
function moveFile(oldPath, newPath) {
  try {
    if(existsSync(oldPath)) {
      // Remove target if it exists
      if(existsSync(newPath)) {
        removeRecursive(newPath);
      }
      renameSync(oldPath, newPath);
      console.log(`Moved ${oldPath} to ${newPath}`);
    } else {
      console.log(`Source path ${oldPath} does not exist, skipping move`);
    }
  } catch(error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Failed to move ${oldPath} to ${newPath}:`, errorMessage);
    throw error;
  }
}

(async function run(arg) {
  switch(arg) {
    case "start":
      // don't wait on tsc, it's just for checking types
      // await start("npm run tsc", []);
      await start("tsup --silent", [], {
        SKIPDTS: "1"
      });
      await start("node --trace-uncaught --trace-warnings mws.dev.mjs", process.argv.slice(3), {
        ENABLE_DEV_SERVER: "mws",
        ENABLE_EXTERNAL_PLUGINS: "1",
      });
      break;
    case "docs":
      // call this directly rather than going through npm start
      process.env.ENABLE_DOCS_ROUTE = "1";
      await run("start");
      break;
    case "prisma:generate":

      console.log("Generating Prisma client...");
      // remove the old client - cross-platform
      removeRecursive(path.join(prismaFolder, "client"));
      await start(`prisma generate --schema=${prismaFolder}/schema.prisma`, [], {
        PRISMA_CLIENT_FORCE_WASM: "true"
      });
      console.log("Formatting Prisma client...");
      await start(`prettier --write ${prismaFolder}/client/*.js ${prismaFolder}/client/*/*.js`);
      // remove the .node files, we don't need them in the client - cross-platform
      console.log("Removing .node files from Prisma client...");
      readdirSync(`${prismaFolder}/client`).forEach(file => {
        if(file.endsWith(".node")) {
          const filePath = path.join(`${prismaFolder}/client`, file);
          console.log(`Removing ${filePath}`);
          if(existsSync(filePath)) rmSync(filePath, { force: true });
        }
      });
      console.log("Updating Prisma client package.json...");
      /** @type {any} */
      const pkg = JSON.parse(readFileSync(path.join(prismaFolder, "client/package.json")).toString());
      pkg.name = "@tiddlywiki/mws-prisma";
      pkg.private = true;
      writeFileSync(path.join(prismaFolder, "client/package.json"), JSON.stringify(pkg, null, 2));
      console.log("Prisma client generated.");
      break;
    case "prisma:migrate":
      await start("prisma migrate dev", [
        "--schema", "prisma/schema.prisma",
        "--create-only",
        "--skip-generate"
      ], {
        DATABASE_URL: "file:test.sqlite"
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
      await start("npx tsc -p tsconfig.types.json", process.argv.slice(3));
      break;
    }
    case "dev-quick-reset": {
      // "rm -rf dev/wiki/store && DEBUG= npm start init-store",
      removeRecursive("dev/wiki/store");
      await start("npm start init-store");
      break;
    } 
    case "test": {
      // "test:pack": "(git clean -dfx tests && npm pack --pack-destination tests && cd tests && npm install && npm install ./tiddlywiki-mws-$npm_package_version.tgz --no-save && npm test)",
      // "test": "(git clean -dfx tests && cd tests && npm install .. --no-save && npm test)",
      // "fulltest": "mv node_modules node_modules_old; npm run test:pack; mv node_modules_old node_modules",


      await Promise.resolve().then(async () => {
        // Cross-platform move operation
        moveFile("node_modules", "node_modules_off");
      }).then(async () => {
        await start("git clean -dfx tests");
        const filesFolder = path.resolve("create-package/files");
        const testsFolder = path.resolve("tests");
        mkdirSync(testsFolder, { recursive: false });
        // copy files into the folder
        console.log(`Copying files`);
        readdirSync(filesFolder).forEach(file => {
          const oldPath = path.join(filesFolder, file);
          if(!statSync(oldPath).isFile()) return;
          const newPath = path.join(testsFolder, file);
          if(existsSync(newPath)) {
            console.log(`File ${file} already exists. Skipping...`);
            return;
          }
          console.log(`├─ ${file}`);
          writeFileSync(newPath, readFileSync(oldPath));
        });
        await start("npm pack --pack-destination tests");
        // Read package.json to get version for cross-platform compatibility
        const packageJson = JSON.parse(readFileSync("package.json").toString());
        const packageVersion = packageJson.version;
        await start(`npm install ./tiddlywiki-mws-${packageVersion}.tgz tiddlywiki`, [], {}, { cwd: "tests" });
      }).then(async () => {
        await start("npx mws init-store", [], {}, { cwd: "tests" });
      }).finally(async () => {
        // Cross-platform move operation
        moveFile("node_modules_off", "node_modules");
      });
      break;
    }
    default:
      console.log("nothing ran");
  }
})(process.argv[2]).catch(console.log);

const exit = (/** @type {any} */ code) => { events.emit("exit", code); };
process.on("SIGTERM", exit);
process.on("SIGINT", exit);
process.on("SIGHUP", exit);

/**
 * 

 * 
 * @overload
 * @param {string} cmd
 * @param {string[]} [args]
 * @param {NodeJS.ProcessEnv} [env2]
 * @param {{cwd?: string, pipeOut: true}} [options]
 * @returns {Promise<string>}
 * 
 * @overload
 * @param {string} cmd
 * @param {string[]} [args]
 * @param {NodeJS.ProcessEnv} [env2]
 * @param {{cwd?: string, pipeOut?: false}} [options]
 * @returns {Promise<void>}
 * 
 * @param {string} cmd
 * @param {string[]} [args]
 * @param {NodeJS.ProcessEnv} [env2]
 * @param {{cwd?: string, pipeOut?: boolean}} [options]
 */
function start(cmd, args = [], env2 = {}, { cwd = process.cwd(), pipeOut } = {}) {
  // Cross-platform shell execution
  const shell = isWindows ? true : true; // Use shell on all platforms
  const cp = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env2, },
    shell,
    stdio: ["inherit", pipeOut ? "pipe" : "inherit", "inherit"],
  });

  events.on("exit", (code) => { cp.kill(code); });

  if(pipeOut) {
    return new Promise((r, c) => {
      /** @type {any[]} */
      const chunks = [];
      cp.stdout?.on("data", (data) => {
        chunks.push(data);
      });
      cp.stdout?.on("end", () => {
        r(chunks.map(e => e.toString()).join(""));
      });
      // if any process errors it will immediately exit the script
      cp.on("exit", (code) => {
        if(code) c(code);
      });
    });
  } else {
    return /** @type {Promise<void>} */(new Promise((r, c) => {
      // if any process errors it will immediately exit the script
      cp.on("exit", (code) => { if(code) c(code); else r(); });
    }));
  }
}


