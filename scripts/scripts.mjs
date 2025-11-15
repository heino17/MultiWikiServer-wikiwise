//@ts-check

// Cross-platform build and development scripts for Windows, Mac, and Linux
// start: `SKIPDTS=1 tsup && ENABLE_DEV_SERVER=1 node mws.dev.mjs`
// docs: `ENABLE_DOCS_ROUTE=1 npm start`
// postinstall: `PRISMA_CLIENT_FORCE_WASM=true prisma generate`

/// <reference lib="es2023" />
/// <reference types="node" />

import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { start, events, run, removeRecursive, run_bin } from "./helpers.mjs";
import { join } from "path";

(async function(arg) {
  switch(arg) {
    case "start":
      await run("tsup", {});
      await run_bin({
        DEVHTTPS: "yes",
        PORT: "4201",
        DEVSERVER: true ? "watch" : "build",
      });
      break;
    case "live":
      await run_bin({
        DEVHTTPS: "yes",
        PORT: "4201",
      });
      break;
    case "build":
      await run("tsup", {});
      await run_bin({
        CLIENT_BUILD: "1"
      });
      break;
    case "build-prod": {
      if(!process.env.SKIP_TSUP) await run("tsup", {});
      await run_bin({ CLIENT_BUILD: "1", BUILD_ENV: "production" });
      await run("tsup", { BUILD_ENV: "runtime" });
      if(!process.env.SKIP_AUDIT) await run("npm audit", {}).catch(() => {});
      break;
    }
    case "schema:generate": {
      await run("tsup", {});
      await run_bin({ RUNSCHEMA: "1" });
      const schemas = JSON.parse(readFileSync("schema.prisma.json", "utf8"));
      await run("prisma validate", { "DATABASE_URL": "postgres://test" }, schemas[0].path);

      for(const { path, output, kysely } of schemas) {
        await run("prisma format", {}, path);
        if(output) {
          await run("prisma generate", { PRISMA_CLIENT_FORCE_WASM: "true" }, path);
          const outputFolder = join(path, output);
          for(const file of readdirSync(outputFolder)) {
            if(file.endsWith(".node")) rmSync(join(outputFolder, file));
          }
        }
      }
      break;
    }
    case "prisma:generate:oldjsclient": {
      const prismaFolder = "prisma";
      console.log("Generating Prisma client...");
      // remove the old client - cross-platform
      removeRecursive(join(prismaFolder, "client"));
      await start(`prisma generate --schema=${prismaFolder}/schema.prisma`, [], {
        PRISMA_CLIENT_FORCE_WASM: "true"
      });
      console.log("Formatting Prisma client...");
      await start(`prettier --write ${prismaFolder}/client/*.js ${prismaFolder}/client/*/*.js`);
      // remove the .node files, we don't need them in the client - cross-platform
      console.log("Removing .node files from Prisma client...");
      readdirSync(`${prismaFolder}/client`).forEach(file => {
        if(file.endsWith(".node")) {
          const filePath = join(`${prismaFolder}/client`, file);
          console.log(`Removing ${filePath}`);
          if(existsSync(filePath)) rmSync(filePath, { force: true });
        }
      });
      console.log("Updating Prisma client package.json...");
      /** @type {any} */
      const pkg = JSON.parse(readFileSync(join(prismaFolder, "client/package.json")).toString());
      pkg.name = "@tiddlywiki/mws-prisma";
      pkg.private = true;
      writeFileSync(join(prismaFolder, "client/package.json"), JSON.stringify(pkg, null, 2));
      console.log("Prisma client generated.");
      break;
    }
    case "prisma:migrate":
      await start("prisma migrate dev", [
        "--schema", "prisma/schema.prisma",
        "--create-only",
        "--skip-generate"
      ], {
        DATABASE_URL: "file:test.sqlite"
      });
      break;
    default:
      console.log("nothing ran");
  }
})(process.argv[2]).catch((e) => {
  if(e) console.log("caught error", e);
  process.exitCode = 1;
});

const exit = (/** @type {any} */ code) => { events.emit("exit", code); };
process.on("SIGTERM", exit);
process.on("SIGINT", exit);
process.on("SIGHUP", exit);

