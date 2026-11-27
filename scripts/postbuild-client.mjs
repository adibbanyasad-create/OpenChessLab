// Client post-build steps, run after `vite build`:
// 1. Copy the single-threaded Stockfish Lite engine (JS + WASM, no
//    SharedArrayBuffer needed) next to the built bundle for the offline
//    Web Worker engine.
// 2. Bundle the offline engine worker with esbuild into a dependency-free
//    IIFE classic worker. Vite ships classic workers verbatim (imports
//    unresolved) and keeps the .ts suffix, which browsers refuse to execute
//    as a worker; esbuild output is a single self-contained .js file. The
//    hashed reference in the main bundle is patched to match.
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const require = createRequire(join(root, 'package.json'));
const findEngine = require('stockfish').findEngine;
const engineJs = findEngine('lite-single');
const engineWasm = engineJs.replace(/\.js$/, '.wasm');
const outDir = join(root, 'dist/client/engine');
await mkdir(outDir, { recursive: true });
await copyFile(engineJs, join(outDir, 'stockfish-19-lite-single.js'));
await copyFile(engineWasm, join(outDir, 'stockfish-19-lite-single.wasm'));
console.log('Copied offline Stockfish Lite engine to dist/client/engine.');

const assets = join(root, 'dist/client/assets');
const workerFiles = (await readdir(assets)).filter(
  (name) => name.startsWith('engine-worker-') && !name.endsWith('.map'),
);
if (workerFiles.length !== 1)
  throw new Error(`Expected exactly one engine-worker bundle, found ${workerFiles.length}.`);
const from = workerFiles[0];
const bundled = spawnSync(
  join(root, 'node_modules/.bin/esbuild'),
  [
    join(root, 'src/client/engine-worker.ts'),
    '--bundle',
    '--format=iife',
    '--platform=browser',
    '--target=es2023',
    '--minify',
    '--log-level=warning',
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, shell: process.platform === 'win32' },
);
if (bundled.error || bundled.status !== 0)
  throw new Error(bundled.error?.message ?? bundled.stderr);
const code = bundled.stdout;
if (!code || /^\s*import[\s{]/m.test(code))
  throw new Error('Engine worker bundle still contains unresolved imports.');
const digest = createHash('sha256').update(code).digest('hex').slice(0, 8);
const to = `engine-worker-${digest}.js`;
await rm(join(assets, from), { force: true });
try {
  await rm(join(assets, `${from}.map`), { force: true });
} catch {
  /* Sourcemaps are best effort; the bundle must still ship. */
}
await writeFile(join(assets, to), code);
const entries = (await readdir(assets)).filter((name) => /^index-.*\.js$/.test(name));
let patched = 0;
for (const entry of entries) {
  const path = join(assets, entry);
  const text = await readFile(path, 'utf8');
  if (!text.includes(from)) continue;
  await writeFile(path, text.replaceAll(from, to));
  patched++;
}
if (!patched) throw new Error('Engine worker reference was not found in the client bundle.');
console.log(`Bundled offline engine worker as ${to} and patched ${patched} reference(s).`);
