import { readFile } from 'node:fs/promises';

const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const expected = `v${version}`;
if (process.env.GITHUB_REF_NAME !== expected) {
  throw new Error(`Release tag must match package.json: expected ${expected}.`);
}
console.log(`Release version verified: ${expected}`);
