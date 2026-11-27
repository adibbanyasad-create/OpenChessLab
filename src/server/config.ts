import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { closeSync, existsSync, openSync, readSync, type PathLike } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { EngineDescriptor } from '../shared/types.js';

// Resolves a bundled Stockfish engine script without importing the whole
// `stockfish` package: the package's findEngine helper relies on its own
// on-disk layout, which does not survive bundling into one file.
function findBundledEngine(flavor: 'lite' | 'full'): string {
  const file = flavor === 'lite' ? 'stockfish-19-lite.js' : 'stockfish-19.js';
  const candidates = [
    // Desktop executable layout: engines/ beside the binary. Checked first
    // because import.meta is unavailable inside the bundled executable.
    join(dirname(process.execPath), 'engines', file),
  ];
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    // Development / server layout: <root>/node_modules/stockfish/bin.
    candidates.push(resolve(here, '..', '..', 'node_modules', 'stockfish', 'bin', file));
  } catch {
    /* Bundled runtime: import.meta has no URL; the engines/ check stands. */
  }
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  // Last resort: ask the installed package, when one is resolvable.
  try {
    const require = createRequire(import.meta.url);
    const stockfish = require('stockfish') as { findEngine: (flavor: string) => string };
    return stockfish.findEngine(flavor);
  } catch {
    throw new Error(
      `Cannot find ${file}. Set ENGINES_CONFIG or ship the engines/ directory beside the executable.`,
    );
  }
}

export interface EngineConfig extends EngineDescriptor {
  command: string;
  args: string[];
}

const engineConfigSchema = z
  .array(
    z
      .object({
        id: z.string().regex(/^[a-z0-9-]{1,64}$/),
        name: z.string().min(1).max(80),
        description: z.string().max(240).default('A locally configured UCI engine.'),
        command: z
          .string()
          .refine(isAbsolute, 'Engine commands must be absolute executable paths.'),
        args: z
          .array(
            z
              .string()
              .max(512)
              .regex(/^[^\r\n\0]*$/),
          )
          .max(16)
          .default([]),
      })
      .strict(),
  )
  .max(8);

export function readBoundedConfig(configPath: PathLike, maxBytes = 65_536): string {
  let fd: number | undefined;
  try {
    fd = openSync(configPath, 'r');
    const chunks: Buffer[] = [];
    let total = 0;
    while (total <= maxBytes) {
      const chunk = Buffer.alloc(Math.min(16_384, maxBytes + 1 - total));
      const read = readSync(fd, chunk, 0, chunk.length, null);
      if (read === 0) break;
      chunks.push(chunk.subarray(0, read));
      total += read;
    }
    if (total > maxBytes) throw new Error('Engine configuration exceeds 64 KB.');
    return Buffer.concat(chunks).toString('utf8');
  } catch (error) {
    if (error instanceof Error && error.message.includes('64 KB')) throw error;
    // Keep the cause for server-side troubleshooting while returning a sanitized message.
    throw new Error('Unable to read the engine configuration file.', { cause: error });
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* Descriptor cleanup is best effort. */
      }
    }
  }
}

export function loadEngines(configPath = process.env.ENGINES_CONFIG): EngineConfig[] {
  // Inside a single-executable build, process.execPath is the desktop app
  // itself, which cannot run engine scripts. OPENCHESSLAB_NODE points at a
  // real Node runtime; otherwise engine scripts run under execPath as usual.
  const nodeRuntime = process.env.OPENCHESSLAB_NODE?.trim() || process.execPath;
  const engines: EngineConfig[] = [
    {
      id: 'stockfish-lite',
      name: 'Stockfish 19 Lite',
      description: 'Small neural network. Fast starts, multithreaded WASM.',
      kind: 'wasm',
      command: nodeRuntime,
      args: [findBundledEngine('lite')],
    },
    {
      id: 'stockfish',
      name: 'Stockfish 19',
      description: 'Full neural network. Multithreaded WASM reference engine.',
      kind: 'wasm',
      command: nodeRuntime,
      args: [findBundledEngine('full')],
    },
  ];
  if (configPath) {
    // Read through one descriptor so an attacker swapping the registry file between a
    // separate stat() and read() cannot bypass the 64 KB bound.
    const path = resolve(configPath);
    const configured = engineConfigSchema.parse(JSON.parse(readBoundedConfig(path)));
    engines.push(...configured.map((engine) => ({ ...engine, kind: 'native' as const })));
  }
  if (new Set(engines.map((engine) => engine.id)).size !== engines.length)
    throw new Error('Engine IDs must be unique, including built-in IDs.');
  return engines;
}

export interface ServerConfig {
  host: string;
  port: number;
  allowedHosts: string[];
  frameAncestors: string;
  apiToken?: string;
  staticRoot: string;
}

export function loadConfig(): ServerConfig {
  const port = z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .parse(process.env.PORT ?? 3001);
  const apiToken = process.env.OPENCHESSLAB_API_TOKEN;
  if (apiToken && (apiToken.length < 24 || apiToken.length > 512 || /[^\x21-\x7e]/.test(apiToken)))
    throw new Error(
      'OPENCHESSLAB_API_TOKEN must contain 24-512 visible ASCII characters without spaces.',
    );
  const frames = (process.env.FRAME_ANCESTORS ?? "'self'").trim().split(/\s+/);
  if (
    frames.length > 16 ||
    frames.some(
      (frame) => !/^(?:'self'|'none'|https:\/\/(?:\*\.)?[a-z0-9.-]+(?::\d{1,5})?)$/i.test(frame),
    ) ||
    (frames.includes("'none'") && frames.length !== 1)
  ) {
    throw new Error(
      'FRAME_ANCESTORS must contain self, none, or space-separated HTTPS origins in CSP syntax.',
    );
  }
  return {
    host: z
      .string()
      .trim()
      .min(1)
      .max(253)
      .parse(process.env.HOST ?? '127.0.0.1'),
    port,
    allowedHosts: (process.env.ALLOWED_HOSTS ?? 'localhost,127.0.0.1,[::1]')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
    apiToken,
    frameAncestors: frames.join(' '),
    staticRoot: process.env.OPENCHESSLAB_STATIC_ROOT?.trim() || resolve('dist/client'),
  };
}
