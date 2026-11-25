import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const sections = [
  'OpenChessLab - third-party production dependency license inventory',
  'Application code is MIT. Dependencies retain their own licenses.',
  'Stockfish is a separately executed GPL-3.0 engine; see THIRD_PARTY_NOTICES.md.',
];
let count = 0;
for (const [path, entry] of Object.entries(lock.packages)) {
  // Vite injects a small runtime preload helper into the distributed browser bundle.
  if (!path.startsWith('node_modules/') || (entry.dev && path !== 'node_modules/vite')) continue;
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
  } catch {
    continue;
  }
  const names = await readdir(path);
  const licenses = names.filter((name) => /^(licen[cs]e|copying|ofl)([.\-_].*)?$/i.test(name));
  const texts = [];
  for (const name of licenses) {
    try {
      texts.push(`File: ${name}\n${await readFile(join(path, name), 'utf8')}`);
    } catch {
      /* Some packages use a directory for per-file license notices. */
    }
  }
  sections.push(
    `\n${'='.repeat(72)}\n${manifest.name}@${manifest.version}\nDeclared license: ${JSON.stringify(manifest.license ?? entry.license ?? 'not declared')}\n${texts.join('\n\n') || 'No top-level license file was included in this package. Consult its published source and package metadata.'}`,
  );
  count++;
}
await writeFile('dist/THIRD_PARTY_LICENSES.txt', sections.join('\n') + '\n');
console.log(`Recorded license metadata and available notices for ${count} dependency packages.`);
