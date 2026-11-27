// Generates Android launcher icons and splash drawables from the committed
// master SVG artwork (assets/icons/) using resvg, a pure-Rust SVG renderer
// with zero browser or system dependencies. Every raster is pixel-verified
// (dimensions + non-trivial opaque coverage) before it replaces the committed
// file, so a broken render can never silently ship a blank icon again.
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(import.meta.dirname, '..');
const res = join(root, 'android/app/src/main/res');
const masterIcon = await readFile(join(root, 'assets/icons/openchesslab-icon.svg'));
const masterForeground = await readFile(join(root, 'assets/icons/openchesslab-foreground.svg'));

function render(svg, width, height) {
  const rendered = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: 'rgba(0,0,0,0)',
  }).render();
  if (rendered.width !== width || rendered.height !== height)
    throw new Error(
      `Renderer produced ${rendered.width}x${rendered.height}, want ${width}x${height}.`,
    );
  return rendered;
}

function opaqueFraction(rendered) {
  const pixels = rendered.pixels;
  let opaque = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 200) opaque++;
  return opaque / (rendered.width * rendered.height);
}

async function rasterizeVerified(svg, pngPath, width, height, minFraction, label) {
  const rendered = render(svg, width, height);
  const fraction = opaqueFraction(rendered);
  if (fraction < minFraction)
    throw new Error(
      `${label}: only ${(fraction * 100).toFixed(1)}% opaque, need ${(minFraction * 100).toFixed(1)}%.`,
    );
  await writeFile(pngPath, rendered.asPng());
  console.log(`${label}: ${width}x${height}, ${(fraction * 100).toFixed(1)}% opaque.`);
}

// Legacy + round icons per density (full-bleed artwork; the frame is round).
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, size] of Object.entries(densities)) {
  const dir = join(res, `mipmap-${density}`);
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) {
    await rasterizeVerified(masterIcon, join(dir, name), size, size, 0.5, `${density}/${name}`);
  }
  // Adaptive foregrounds are always 432px with a transparent field.
  await rasterizeVerified(
    masterForeground,
    join(dir, 'ic_launcher_foreground.png'),
    432,
    432,
    0.02,
    `${density}/foreground`,
  );
}

// Splash screens: light field with the centered tile.
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
const masterText = masterIcon.toString('utf8');
const tileInner = masterText.slice(masterText.indexOf('>') + 1, masterText.lastIndexOf('</svg>'));
for (const [dir, [width, height]] of Object.entries(splashSizes)) {
  const side = Math.round(Math.min(width, height) * 0.24);
  const x = Math.round((width - side) / 2);
  const y = Math.round((height - side) / 2);
  const scale = (side / 512).toFixed(4);
  const art = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#f7f8f5"/><g transform="translate(${x},${y}) scale(${scale})">${tileInner}</g></svg>`;
  await rasterizeVerified(
    Buffer.from(art),
    join(res, dir, 'splash.png'),
    width,
    height,
    0.9,
    `splash ${dir}`,
  );
}

// Vector fallback for the adaptive-icon foreground (used on API 26+).
await writeFile(
  join(res, 'drawable-v24/ic_launcher_foreground.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="432" android:viewportHeight="432">\n  <group android:translateX="54" android:translateY="66" android:scaleX="5.0625" android:scaleY="5.0625">\n    <path android:fillColor="#00000000" android:pathData="M19,47h29M22,41h23l-3,-11 3,-7 -10,-9 -7,1 -1,6 -10,11 9,3 7,-8 -2,14" android:strokeColor="#ffffff" android:strokeWidth="4.6" android:strokeLineJoin="round" android:strokeLineCap="round"/>\n    <path android:fillColor="#ffffff" android:pathData="M33,22a2.4,2.4 0 1,0 4.8,0a2.4,2.4 0 1,0 -4.8,0"/>\n  </group>\n</vector>\n`,
);
console.log('Launcher artwork regenerated and pixel-verified.');
