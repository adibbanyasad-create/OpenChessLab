// Generates Android launcher icons and splash drawables from the original
// OpenChessLab knight mark as dependency-free SVG files, then rasterizes the
// mipmap PNGs with Chromium headless (already a devDependency via Playwright).
// Falls back to keeping generated SVGs only if rasterization is unavailable.
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const res = join(root, 'android/app/src/main/res');

const knight = (stroke, width) =>
  `<path d="M19 47h29M22 41h23l-3-11 3-7-10-9-7 1-1 6-10 11 9 3 7-8-2 14" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/><circle cx="33" cy="22" r="1.6" fill="${stroke}"/>`;

const foreground = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}"><g transform="translate(0,2)">${knight('#ffffff', 4.2)}</g></svg>`;

const splash = (width, height) => {
  const s = Math.min(width, height) * 0.24;
  const x = (width - s) / 2;
  const y = (height - s) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#f7f8f5"/><g transform="translate(${x},${y}) scale(${s / 64})"><rect x="2" y="2" width="60" height="60" rx="16" fill="#267251"/>${knight('#ffffff', 3)}</g></svg>`;
};

async function rasterize(svgPath, pngPath, width, height) {
  const html = join(tmpdir(), `ocl-shot-${Date.now()}-${Math.floor(Math.random() * 1e6)}.html`);
  await writeFile(
    html,
    `<!doctype html><html><body style="margin:0"><img src="file://${svgPath}" width="${width}" height="${height}"></body></html>`,
  );
  const shot = spawnSync(
    'node',
    [
      '-e',
      `import('playwright').then(async ({ chromium }) => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: ${width}, height: ${height} } }); await p.goto('file://${html}'); await p.locator('img').screenshot({ path: '${pngPath}' }); await b.close(); });`,
    ],
    { encoding: 'utf8' },
  );
  await rm(html, { force: true });
  if (shot.error || shot.status !== 0) throw new Error(shot.error?.message ?? shot.stderr);
}

const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
// Foreground layer is 432dp safe-zone artwork scaled per density.
const foregroundSizes = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 };
const splashSizes = {
  drawable: [480, 320],
  'drawable-land-hdpi': [800, 480],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-hdpi': [480, 800],
  'drawable-port-mdpi': [320, 480],
  'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920],
};

await mkdir(join(tmpdir(), 'ocl-icons'), { recursive: true });
const tmp = join(tmpdir(), 'ocl-icons');
for (const [density, size] of Object.entries(densities)) {
  const dir = join(res, `mipmap-${density}`);
  const svgPath = join(tmp, `icon-${density}.svg`);
  await writeFile(
    svgPath,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}"><rect width="64" height="64" rx="16" fill="#267251"/>${knight('#ffffff', 3)}</svg>`,
  );
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    try {
      await rasterize(svgPath, join(dir, name), size, size);
    } catch (error) {
      console.warn(`Could not rasterize ${dir}/${name}: ${String(error).slice(0, 120)}`);
    }
  }
  const fgPath = join(tmp, `fg-${density}.svg`);
  await writeFile(fgPath, foreground(foregroundSizes[density]));
  try {
    await rasterize(fgPath, join(dir, 'ic_launcher_foreground.png'), 432, 432);
  } catch {
    console.warn(`Could not rasterize ${dir}/ic_launcher_foreground.png.`);
  }
}
for (const [dir, [width, height]] of Object.entries(splashSizes)) {
  const svgPath = join(tmp, `splash-${dir}.svg`);
  await writeFile(svgPath, splash(width, height));
  try {
    await rasterize(svgPath, join(res, dir, 'splash.png'), width, height);
  } catch {
    console.warn(`Could not rasterize ${dir}/splash.png.`);
  }
}
// Vector fallback for the adaptive-icon foreground (used on API 26+).
await writeFile(
  join(res, 'drawable-v24/ic_launcher_foreground.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="64" android:viewportHeight="64">\n  <path android:fillColor="#00000000" android:pathData="M19,47h29M22,41h23l-3,-11 3,-7 -10,-9 -7,1 -1,6 -10,11 9,3 7,-8 -2,14" android:strokeColor="#ffffff" android:strokeWidth="4.2" android:strokeLineJoin="round"/>\n  <path android:fillColor="#ffffff" android:pathData="M33,22a1.6,1.6 0 1,0 3.2,0a1.6,1.6 0 1,0 -3.2,0"/>\n</vector>\n`,
);
const remaining = (await readdir(tmp)).length;
console.log(`Launcher artwork staged (${remaining} temp SVGs in ${tmp}).`);
