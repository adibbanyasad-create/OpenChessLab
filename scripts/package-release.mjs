import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const { version } = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version))
  throw new Error('Invalid release version.');
const filename = `OpenChessLab-${version}.tar.gz`;
const entries = [
  'src',
  'AGENTS.md',
  'tests',
  'scripts',
  'docs',
  'examples',
  'public',
  'dist',
  '.github',
  'package.json',
  'package-lock.json',
  'index.html',
  'vite.config.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'tsconfig.json',
  'tsconfig.server.json',
  'eslint.config.js',
  '.prettierrc.json',
  '.prettierignore',
  '.gitignore',
  '.editorconfig',
  '.nvmrc',
  '.env.example',
  'Dockerfile',
  '.dockerignore',
  'engines.example.json',
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'CHANGELOG.md',
];
await mkdir(join(root, '.cache'), { recursive: true });
const staging = await mkdtemp(join(root, '.cache', 'release-'));
try {
  const destination = join(staging, 'OpenChessLab');
  await mkdir(destination);
  for (const entry of entries)
    await cp(join(root, entry), join(destination, entry), { recursive: true });
  const packed = spawnSync('tar', ['-czf', join(root, filename), '-C', staging, 'OpenChessLab'], {
    encoding: 'utf8',
  });
  if (packed.error || packed.status !== 0) throw new Error(packed.error?.message ?? packed.stderr);
  const checksum = createHash('sha256')
    .update(await readFile(join(root, filename)))
    .digest('hex');
  await writeFile(join(root, 'SHA256SUMS.txt'), `${checksum}  ${filename}\n`);
  console.log(
    `Created ${filename} with source, locked dependencies, production build, docs, tests, workflows, and license notices.`,
  );
  console.log(`SHA-256: ${checksum}`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
