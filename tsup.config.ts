import { defineConfig } from 'tsup';
const entry = [
  // 'packages/events/src/index.ts',
  // 'packages/commander/src/index.ts',
  // 'packages/server/src/index.ts',
  'packages/mws/src/index.ts',

];
export default defineConfig({
  entry,
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
  // dts: { entry, },
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
});
