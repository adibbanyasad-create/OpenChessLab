// Stamps the knight icon + version metadata into a Windows executable using
// the pure-JS resedit library (no external binaries, no hangs). Reads icon
// PNGs out of assets/icons/openchesslab-icon.ico and replaces the first icon
// group plus the version resource.
//
// Usage: node scripts/stamp-windows-icon.mjs <exe-path> <version>
// Exits nonzero on any failure; verifies the stamp by re-reading resources.
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Data, NtExecutable, NtExecutableResource, Resource } from 'resedit';

const root = resolve(import.meta.dirname, '..');
const [exePath, version] = process.argv.slice(2);
if (!exePath || !version || !/^\d+\.\d+\.\d+$/.test(version)) {
  throw new Error('Usage: node scripts/stamp-windows-icon.mjs <exe-path> <x.y.z>');
}
const [major, minor, patch] = version.split('.').map(Number);

const ico = await readFile(join(root, 'assets/icons/openchesslab-icon.ico'));
if (ico.readUInt16LE(0) !== 0 || ico.readUInt16LE(2) !== 1)
  throw new Error('Master .ico container is corrupt.');
const count = ico.readUInt16LE(4);
if (count < 1) throw new Error('Master .ico container holds no images.');
const icons = [];
for (let index = 0; index < count; index++) {
  const entry = 6 + index * 16;
  const width = ico.readUInt8(entry) || 256;
  const height = ico.readUInt8(entry + 1) || 256;
  const bytes = ico.readUInt32LE(entry + 8);
  const offset = ico.readUInt32LE(entry + 12);
  const png = ico.subarray(offset, offset + bytes);
  if (png[0] !== 0x89 || png[1] !== 0x50) throw new Error(`ICO entry ${index} is not a PNG image.`);
  // PNG payloads ride as raw icon items; IconItem is BMP-only.
  icons.push(
    Data.RawIconItem.from(
      png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
      width,
      height,
      32,
    ),
  );
}

// The Node binary ships Authenticode-signed; modifying resources invalidates
// that signature by design, so parse with the certificate ignored.
const executable = NtExecutable.from(await readFile(exePath), { ignoreCert: true });
const resources = NtExecutableResource.from(executable);
Resource.IconGroupEntry.replaceIconsForResource(resources.entries, 1, 1033, icons);
const [fileMajor, fileMinor, filePatch] = [major, minor, patch];
const versionInfo = Resource.VersionInfo.create(
  1033,
  {
    fileVersionMS: (fileMajor << 16) | fileMinor,
    fileVersionLS: (filePatch << 16) | 0,
    productVersionMS: (fileMajor << 16) | fileMinor,
    productVersionLS: (filePatch << 16) | 0,
    fileFlagsMask: 0,
    fileFlags: 0,
    fileOS: 0x40004,
    fileType: 1,
    fileSubtype: 0,
    fileDateMS: 0,
    fileDateLS: 0,
  },
  [
    {
      lang: 1033,
      codepage: 1200,
      values: {
        CompanyName: 'OpenChessLab',
        FileDescription: 'OpenChessLab - local-first chess analysis workspace',
        FileVersion: `${fileMajor}.${fileMinor}.${filePatch}.0`,
        ProductName: 'OpenChessLab',
        ProductVersion: `${fileMajor}.${fileMinor}.${filePatch}.0`,
      },
    },
  ],
);
versionInfo.outputToResourceEntries(resources.entries);
executable.setResource(resources.entries);
await writeFile(exePath, Buffer.from(executable.generate()));

// Verify by re-reading: the icon group and version strings must be present.
const check = NtExecutable.from(await readFile(exePath), { ignoreCert: true });
const checkResources = NtExecutableResource.from(check);
const groups = Resource.IconGroupEntry.fromEntries(checkResources.entries);
if (!groups.length) throw new Error('Stamp verification failed: no icon group found.');
const items = groups[0].getIconItemsFromEntries(checkResources.entries);
if (items.length !== icons.length)
  throw new Error(`Stamp verification failed: ${items.length}/${icons.length} icons present.`);
const text = (await readFile(exePath)).toString('latin1');
for (const needle of ['OpenChessLab', `${fileMajor}.${fileMinor}.${filePatch}.0`]) {
  if (!text.includes(needle)) throw new Error(`Stamp verification failed: ${needle} missing.`);
}
console.log(
  `Stamped ${items.length} icons + version ${fileMajor}.${fileMinor}.${filePatch}.0 into ${exePath}.`,
);
