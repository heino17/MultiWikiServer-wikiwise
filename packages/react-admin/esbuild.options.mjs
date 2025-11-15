
import { basename, join, resolve } from 'node:path';
import { copy } from 'esbuild-plugin-copy';
import { existsSync } from 'node:fs';

/**
 * @template {import('esbuild').BuildOptions} T
 * @param {Promise<import('esbuild').SameShape<import('esbuild').BuildContext, T>>} options 
 * @returns 
 */
function optionsTyped(options) {
  return options;
}


export default async function({rootdir, publicdir}) {

  /** @type {{in: string; out: string;}[]} */
  const entryPoints = [
    // { in: resolve(rootdir, 'polyfill.ts'), out: "polyfill" },
    { in: resolve(rootdir, 'src/main.tsx'), out: "main" },
  ];

  entryPoints.forEach(e => {
    if(!existsSync(e.in))
      throw new Error(`Entry file for ${e.out} does not exist at ${e.in}`);
  });

  const options = optionsTyped({
    entryPoints: [resolve(rootdir, 'src/main.tsx')],
    bundle: true,
    target: 'es2020',
    platform: 'browser',
    jsx: 'automatic',
    outdir: publicdir,
    minify: true,
    sourcemap: true,
    metafile: true,
    splitting: true,
    format: "esm",
    plugins: [
      copy({
        assets: [{
          from: [join(rootdir, "public", "**/*")],
          to: ['.'],
        }, {
          from: [join(rootdir, "index.html")],
          to: ['../' + basename(publicdir) + ".html"]
        }],
      }),
    ]
  });

  return { options, entryPoints }
}