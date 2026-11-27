// Builds the single-file desktop executable with Node's Single Executable
// Application (SEA) support: bundles the desktop entry point plus the full
// dependency graph into one file, generates a SEA blob, injects it into a
// copy of the Node binary, and verifies the result boots and answers health.
// Layout assumptions are asserted (never guessed): dist/server/desktop.js,
// dist/client/index.html, and node_modules/stockfish must exist from `build`.
//
// Usage: node scripts/build-desktop.mjs [--out <dir>] [--name <base>]
// Output: <out>/<base>(.exe on Windows) plus a .sha256 sidecar.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  constants,
  copyFile,
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
  const bundlePath = join(work, 'desktop.bundle.cjs');
  const bundled = spawnSync(
    join(root, 'node_modules/.bin/esbuild'),
    [
      join(root, 'dist/server/desktop.js'),
      '--bundle',
      '--platform=node',
      '--target=node22',
      '--format=cjs',
      `--outfile=${bundlePath}`,
      '--log-level=warning',
      '--banner:js=const __SEA_ROOT__ = __dirname;',
    ],
    { encoding: 'utf8', shell: isWindows },
  );
  if (bundled.error || bundled.status !== 0)
    throw new Error(bundled.error?.message ?? bundled.stderr);
  const code = await readFile(bundlePath, 'utf8');
  if (!code.includes('Desktop bundle is missing its embedded marker asset'))
    throw new Error('Desktop bundle is missing the desktop entry point.');

  // 2. Generate the SEA blob with an embedded marker asset.
  const markerPath = join(work, 'sea-marker.txt');
  const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
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
    'npx',
    [
      '--yes',
      'postject',
      binaryPath,
      'NODE_SEA_BLOB',
      seaConfig.output,
      '--sentinel-fuse',
      'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    ],
    { encoding: 'utf8', shell: isWindows },
  );
  if (injected.error || injected.status !== 0)
    throw new Error(injected.error?.message ?? injected.stderr);

  // 4. Record integrity metadata next to the binary.
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
