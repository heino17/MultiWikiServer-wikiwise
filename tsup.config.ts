import { spawn } from 'child_process';
import { writeFileSync } from 'fs';
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    // events: 'packages/events/src/index.ts',
    // commander: 'packages/commander/src/index.ts',
    // server: 'packages/server/src/index.ts',
    mws: 'packages/mws/src/index.ts',
  },
  tsconfig: "tsconfig.base.json",
  format: ['esm'],
  outDir: "dist",
  external: [
    "tiddlywiki",
    "esbuild",
    "env-cmd",
    "zod-to-ts",
    "@prisma/client",
    "@prisma/adapter-libsql",
    "@prisma/adapter-better-sqlite3",
    "@serenity-kit/opaque",
  ],
  dts: false,
  keepNames: true,
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  cjsInterop: true,
  shims: true,
  metafile: true,
  banner: (ctx) => ctx.format === "esm" ? {
    js: [
      "import {createRequire as __createRequire} from 'module';",
      "const require=__createRequire(import.meta.url);",
      "import 'source-map-support/register.js';",
    ].join("\n")
  } : ctx.format === "cjs" ? {
    js: [
      "require('source-map-support/register');",
    ].join("\n")
  } : {},
  esbuildOptions(options, context) {
    options.conditions = [
      "tsup",
      "esbuild",
      "build",
    ]
  },
  async onSuccess() {
    const tag = "TSC ⚡️ done";
    console.time(tag);
    writeFileSync("dist/mws.d.ts", [
      "import './types.d.ts';",
      "export * from 'packages/mws/src/index';",
    ].join("\n"));
    console.log("TSC dist/mws.d.ts");
    const code = await start("node scripts.mjs build:types", []).catch((code) => code);
    console.log("TSC dist/types.d.ts");
    console.timeEnd(tag);
    if(code) process.exit(code);
  },
});

function start(cmd, args, env2 = {}, { cwd = process.cwd() } = {}) {
  const cp = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env2, },
    shell: true,
    stdio: ["inherit", "inherit", "inherit"],
  });
  return new Promise<void>((r, c) => {
    // if any process errors it will immediately exit the script
    cp.on("exit", (code) => { if (code) c(code); else r(); });
  });
}