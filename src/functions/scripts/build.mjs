// Bundles each function into packages/bridge/<name>/index.js so DigitalOcean
// receives a single self-contained CommonJS file per function (no node_modules
// upload, no remote build). `main` is the exported handler project.yml names.
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';

const FUNCTIONS = ['wrap', 'unwrap', 'status', 'config'];

await Promise.all(
  FUNCTIONS.map(async (name) => {
    const outdir = `packages/bridge/${name}`;
    await mkdir(outdir, { recursive: true });
    await build({
      entryPoints: [`src/functions/${name}.ts`],
      outfile: `${outdir}/index.js`,
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      sourcemap: false,
      logLevel: 'info',
    });
  }),
);
