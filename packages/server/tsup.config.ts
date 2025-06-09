/// <reference types="node" />
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  outDir: "dist",
  external: [
    "tiddlywiki",
    "esbuild",
    "env-cmd",
    "zod-to-ts"
  ],
  tsconfig: "tsconfig.json",
  keepNames: true,
  dts: process.env.SKIPDTS ? false : true,          // Generate type declaration files
  sourcemap: true,     // Generate source maps for debugging
  clean: true,         // Clean the output directory before each build
  minify: false,       // Set to true if you want minification
  splitting: false,     // Code splitting only if we need to lazy import
  cjsInterop: true,
  /*
    Enabling this option will fill in some code when building esm/cjs to make it work, 
    such as __dirname which is only available in the cjs module and import.meta.url 
    which is only available in the esm module

    - When building the cjs bundle, it will compile `import.meta.url` as 
      ```
      typeof document === "undefined" 
        ? new URL("file:" + __filename).href 
        : document.currentScript && document.currentScript.src || new URL("main.js", document.baseURI).href
      ```
    - When building the esm bundle, it will compile `__dirname` as 
      ```
      path.dirname(fileURLToPath(import.meta.url))
      ```
   */
  shims: true,        // Add shims for Node.js built-in modules
  metafile: true,

  banner: (ctx) => ctx.format === "esm" ? {
    js: `import 'source-map-support/register.js';`,
  } : {
    js: `require('source-map-support/register');`,
  },
});
