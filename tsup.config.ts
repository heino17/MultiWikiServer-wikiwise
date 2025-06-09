import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['packages/mws/src/index.ts'],
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
  dts: process.env.SKIPDTS ? false : true,
  keepNames: true,
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  cjsInterop: true,
  shims: true,
  metafile: true,
  banner: (ctx) => ctx.format === "esm" ? {
    js: `import {createRequire as __createRequire} from 'module'; const require=__createRequire(import.meta.url);import 'source-map-support/register.js';`,
  } : {
    js: `require('source-map-support/register');`,
  },
  esbuildOptions(options, context) {
    options.conditions = [
      "tsup",
      "esbuild",
      "build",
    ]
  },
});
