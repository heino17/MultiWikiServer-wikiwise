import { resolve } from 'node:path';

export async function context(rootdir, publicdir) {
  const esbuild = await import('esbuild');
  return await esbuild.context({
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
  });
}