// Builds the desktop executable with Node's Single Executable Application
// (SEA) support: bundles the desktop entry point plus the full dependency
// graph into one file, generates a SEA blob, injects it into a copy of the
// Node binary, and stages the companions one file cannot embed (web client,
// engine scripts, engine runtime).
// Layout assumptions are asserted (never guessed): dist/server/desktop.js,
// dist/client/index.html, and node_modules/stockfish must exist from `build`.
//
// Usage: node scripts/build-desktop.mjs [--out <dir>] [--name <base>]
// Output: <out>/<base>(.exe on Windows), companions, plus .sha256 sidecars.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  constants,
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : fallback;
};
const outDir = resolve(root, flag('--out', 'dist/desktop'));
const baseName = flag('--name', 'OpenChessLab');
const isWindows = process.platform === 'win32';
const binaryName = isWindows ? `${baseName}.exe` : baseName;

async function required(path, label) {
  try {
    const info = await stat(path);
    if (!info.isFile() && !info.isDirectory()) throw new Error('not found');
  } catch {
    throw new Error(`Desktop build needs ${label} at ${path}. Run "npm run build" first.`);
  }
}

await required(join(root, 'dist/server/desktop.js'), 'the compiled desktop entry point');
await required(join(root, 'dist/client/index.html'), 'the built web client');
await required(join(root, 'node_modules/stockfish'), 'the installed stockfish package');
await mkdir(outDir, { recursive: true });
await mkdir(join(root, '.cache'), { recursive: true });
const work = join(root, '.cache', `sea-${Date.now()}-${process.pid}`);
await mkdir(work, { recursive: true });

try {
  // 1. Bundle the desktop entry point and every runtime dependency.
  // esbuild runs in-process (no shell, no binary lookup) so the build works
  // identically on Linux, macOS, and Windows runners.
  const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const bundlePath = join(work, 'desktop.bundle.cjs');
  const { buildSync } = await import('esbuild');
  try {
    buildSync({
      entryPoints: [join(root, 'dist/server/desktop.js')],
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'cjs',
      outfile: bundlePath,
      define: { __OPENCHESSLAB_VERSION__: JSON.stringify(version) },
      logLevel: 'warning',
    });
  } catch (error) {
    throw new Error('Desktop esbuild bundle failed.', { cause: error });
  }
  const code = await readFile(bundlePath, 'utf8');
  if (!code.includes('Desktop bundle is missing its embedded marker asset'))
    throw new Error('Desktop bundle is missing the desktop entry point.');

  // 2. Generate the SEA blob with an embedded marker asset.
  const markerPath = join(work, 'sea-marker.txt');
  await writeFile(markerPath, `openchesslab-sea ${version}\n`);
  const seaConfig = {
    main: bundlePath,
    output: join(work, 'sea-prep.blob'),
    assets: { 'openchesslab-sea': markerPath },
  };
  const configPath = join(work, 'sea-config.json');
  await writeFile(configPath, JSON.stringify(seaConfig));
  execFileSync(process.execPath, ['--experimental-sea-config', configPath], { stdio: 'inherit' });

  // 3. Inject the blob into a copy of the running Node binary.
  const binaryPath = join(outDir, binaryName);
  await copyFile(process.execPath, binaryPath);
  const injected = spawnSync(
    process.execPath,
    [
      join(root, 'node_modules/postject/dist/cli.js'),
      binaryPath,
      'NODE_SEA_BLOB',
      seaConfig.output,
      '--sentinel-fuse',
      'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    ],
    { encoding: 'utf8' },
  );
  if (injected.error || injected.status !== 0)
    throw new Error(injected.error?.message ?? injected.stderr);

  // 3b. On Windows, stamp the executable icon + version metadata with the
  // pure-JS resedit library (in-process: no external binary that can hang).
  // Other platforms keep the Node default icon.
  if (isWindows) {
    const stamped = spawnSync(
      process.execPath,
      [join(root, 'scripts/stamp-windows-icon.mjs'), binaryPath, version],
      { encoding: 'utf8', timeout: 120_000 },
    );
    if (stamped.error || stamped.status !== 0)
      throw new Error(
        `Icon stamping failed (signal ${stamped.signal ?? 'none'}): ${stamped.stdout ?? ''}${stamped.error?.message ?? stamped.stderr}`,
      );
    console.log((stamped.stdout ?? '').trim());
  }

  // 4. Stage the runtime companions the single file cannot embed: the web
  // client, the Stockfish engine scripts, and a Node runtime for engines.
  const companions = [
    ['dist/client', 'client'],
    ['node_modules/stockfish/bin/stockfish-19-lite.js', 'engines/stockfish-19-lite.js'],
    ['node_modules/stockfish/bin/stockfish-19-lite.wasm', 'engines/stockfish-19-lite.wasm'],
    ['node_modules/stockfish/bin/stockfish-19.js', 'engines/stockfish-19.js'],
    ['node_modules/stockfish/bin/stockfish-19.wasm', 'engines/stockfish-19.wasm'],
  ];
  for (const [from, to] of companions) {
    const source = join(root, from);
    const target = join(outDir, to);
    await required(source, `the ${from} companion`);
    await rm(target, { recursive: true, force: true });
    await cp(source, target, { recursive: true });
  }
  await copyFile(process.execPath, join(outDir, isWindows ? 'node-runtime.exe' : 'node-runtime'));
  // The engine scripts are CommonJS: without a nearby package.json declaring
  // module type they load as CJS under the runtime. The staged tree has no
  // package.json, so Node treats .js as CJS by default — but be explicit so a
  // parent directory's "type": "module" can never flip the engines to ESM.
  await writeFile(join(outDir, 'engines', 'package.json'), '{"type":"commonjs"}\n');
  console.log('Staged desktop companions: client/, engines/, node-runtime.');

  // 5. Record integrity metadata next to the binary.
  const digest = createHash('sha256')
    .update(await readFile(binaryPath))
    .digest('hex');
  await writeFile(join(outDir, `${binaryName}.sha256`), `${digest}  ${binaryName}\n`);
  console.log(`Desktop executable ready: ${binaryPath}`);
  console.log(`SHA-256: ${digest}`);
} finally {
  await rm(work, { recursive: true, force: true });
}

await access(join(outDir, binaryName), constants.X_OK);
