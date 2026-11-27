import { createRequire } from 'node:module';

// The version is injected at bundle time for SEA builds (see
// scripts/build-desktop.mjs --define) and read from package.json otherwise,
// so the desktop executable never needs the manifest on disk.
declare const __OPENCHESSLAB_VERSION__: string | undefined;

function resolveVersion(): string {
  if (typeof __OPENCHESSLAB_VERSION__ === 'string' && __OPENCHESSLAB_VERSION__) {
    return __OPENCHESSLAB_VERSION__;
  }
  const manifest = createRequire(typeof __filename === 'string' ? __filename : import.meta.url)(
    '../../package.json',
  ) as { version: string };
  return manifest.version;
}

export const APP_VERSION = resolveVersion();
