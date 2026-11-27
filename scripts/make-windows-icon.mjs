// Builds assets/icons/openchesslab-icon.ico (multi-resolution Windows icon)
// from the committed master SVG using resvg. Every size is pixel-verified
// before packing so a broken render can never ship a blank icon.
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const root = resolve(import.meta.dirname, '..');
const masterIcon = await readFile(join(root, 'assets/icons/openchesslab-icon.svg'));

function render(size) {
  const rendered = new Resvg(masterIcon, {
    fitTo: { mode: 'width', value: size },
    background: 'rgba(0,0,0,0)',
  }).render();
  if (rendered.width !== size || rendered.height !== size)
    throw new Error(
      `Renderer produced ${rendered.width}x${rendered.height}, want ${size}x${size}.`,
    );
  const pixels = rendered.pixels;
  let opaque = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 200) opaque++;
  const fraction = opaque / (size * size);
  if (fraction < 0.5)
    throw new Error(`Icon ${size}px: only ${(fraction * 100).toFixed(1)}% opaque, need 50.0%.`);
  console.log(`Icon ${size}px: ${(fraction * 100).toFixed(1)}% opaque.`);
  return rendered.asPng();
}

// ICO container: ICONDIR + ICONDIRENTRY per size + PNG payloads. Vista+
// loaders accept PNG-compressed entries, which resvg emits directly.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = [];
for (const size of sizes) images.push(await render(size));
const headerSize = 6 + 16 * images.length;
const header = Buffer.alloc(headerSize);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = headerSize;
images.forEach((png, index) => {
  const size = sizes[index];
  const entry = 6 + index * 16;
  header.writeUInt8(size >= 256 ? 0 : size, entry);
  header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
  header.writeUInt8(0, entry + 2);
  header.writeUInt8(0, entry + 3);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile(
  join(root, 'assets/icons/openchesslab-icon.ico'),
  Buffer.concat([header, ...images]),
);
console.log(`Wrote assets/icons/openchesslab-icon.ico (${sizes.join('/')}).`);
