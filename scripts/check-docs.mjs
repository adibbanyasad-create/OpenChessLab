import { readdir, readFile, access } from 'node:fs/promises';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pending = [root, join(root, 'docs'), join(root, '.github')];
const errors = [];
let checked = 0;
while (pending.length) {
  const directory = pending.pop();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (directory !== root) pending.push(path);
      continue;
    }
    if (extname(path) !== '.md') continue;
    const text = (await readFile(path, 'utf8')).replace(/```[\s\S]*?```/g, '');
    for (const match of text.matchAll(/!?\[[^\]\n]*\]\(([^)\s]+)(?:\s+"[^"\n]*")?\)/g)) {
      const link = match[1];
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(link)) continue;
      const name = link.split(/[?#]/)[0];
      if (!name) continue;
      try {
        const target = resolve(dirname(path), decodeURIComponent(name));
        const local = relative(root, target);
        if (
          isAbsolute(local) ||
          local === '..' ||
          local.startsWith('../') ||
          local.startsWith('..\\')
        )
          throw new Error('Link leaves the repository.');
        await access(target);
        checked++;
      } catch {
        errors.push(`${relative(root, path)}: ${link}`);
      }
    }
  }
}
if (errors.length) throw new Error(`Invalid local documentation links:\n${errors.join('\n')}`);
console.log(
  `Checked ${checked} local Markdown link/image targets. External URLs and heading anchors are not checked.`,
);
