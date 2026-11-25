import { createRequire } from 'node:module';
import { isAbsolute, resolve } from 'node:path';
import { readFileSync, statSync } from 'node:fs';
import { z } from 'zod';
import type { EngineDescriptor } from '../shared/types.js';

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

export function loadEngines(configPath = process.env.ENGINES_CONFIG): EngineConfig[] {
  const require = createRequire(import.meta.url);
  const stockfish = require('stockfish') as { findEngine: (flavor: string) => string };
  const engines: EngineConfig[] = [
    {
      id: 'stockfish-lite',
      name: 'Stockfish 19 Lite',
      description: 'Small neural network. Fast starts, multithreaded WASM.',
      kind: 'wasm',
      command: process.execPath,
      args: [stockfish.findEngine('lite')],
    },
    {
      id: 'stockfish',
      name: 'Stockfish 19',
      description: 'Full neural network. Multithreaded WASM reference engine.',
      kind: 'wasm',
      command: process.execPath,
      args: [stockfish.findEngine('full')],
    },
  ];
  if (configPath) {
    const path = resolve(configPath);
    if (statSync(path).size > 65_536) throw new Error('Engine configuration exceeds 64 KB.');
    const configured = engineConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
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
    staticRoot: resolve('dist/client'),
  };
}
