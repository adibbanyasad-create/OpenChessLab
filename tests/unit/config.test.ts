import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, loadEngines } from '../../src/server/config';

afterEach(() => vi.unstubAllEnvs());

describe('server configuration', () => {
  it('uses loopback and explicit safe defaults', () => {
    for (const variable of [
      'HOST',
      'PORT',
      'ALLOWED_HOSTS',
      'OPENCHESSLAB_API_TOKEN',
      'FRAME_ANCESTORS',
    ])
      vi.stubEnv(variable, undefined);
    expect(loadConfig()).toMatchObject({
      host: '127.0.0.1',
      port: 3001,
      allowedHosts: ['localhost', '127.0.0.1', '[::1]'],
      apiToken: undefined,
    });
  });
  it('parses an explicit host, port, token and normalized allowlist', () => {
    vi.stubEnv('HOST', '0.0.0.0');
    vi.stubEnv('PORT', '4200');
    vi.stubEnv('ALLOWED_HOSTS', ' LOCALHOST, .example.internal ');
    vi.stubEnv('OPENCHESSLAB_API_TOKEN', 'a-test-token-of-sufficient-length');
    expect(loadConfig()).toMatchObject({
      host: '0.0.0.0',
      port: 4200,
      allowedHosts: ['localhost', '.example.internal'],
    });
  });
  it.each(['0', '65536', 'invalid', '1.5'])('rejects invalid port %s', (port) => {
    vi.stubEnv('PORT', port);
    expect(() => loadConfig()).toThrow();
  });
  it.each(['short', ' '.repeat(30), 'x'.repeat(513), 'x'.repeat(24) + '\n'])(
    'rejects unusable or short API tokens',
    (token) => {
      vi.stubEnv('OPENCHESSLAB_API_TOKEN', token);
      expect(() => loadConfig()).toThrow('24-512 visible ASCII');
    },
  );
  it('does not interpret an empty configured host as a wildcard bind', () => {
    vi.stubEnv('HOST', '');
    expect(() => loadConfig()).toThrow();
  });
  it('requires explicit opt-in for preview framing', () => {
    vi.stubEnv('FRAME_ANCESTORS', undefined);
    expect(loadConfig().frameAncestors).toBe("'self'");
    vi.stubEnv('FRAME_ANCESTORS', "'self' https://arena.ai https://*.arena.ai");
    expect(loadConfig().frameAncestors).toContain('https://arena.ai');
  });
  it.each(['', "'none' 'self'", "'self'; invalid", 'http://example.com'])(
    'rejects invalid framing policy',
    (value) => {
      vi.stubEnv('FRAME_ANCESTORS', value);
      expect(() => loadConfig()).toThrow('FRAME_ANCESTORS');
    },
  );
});

describe('administrator-owned engine registry', () => {
  it('loads a native configuration alongside built-in engines', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openchesslab-config-'));
    try {
      const path = join(directory, 'engines.json');
      await writeFile(
        path,
        JSON.stringify([
          {
            id: 'research',
            name: 'Research engine',
            command: process.execPath,
            args: ['research.js'],
          },
        ]),
      );
      const configured = loadEngines(path);
      expect(configured).toHaveLength(3);
      expect(configured[2]).toMatchObject({
        id: 'research',
        kind: 'native',
        command: process.execPath,
        args: ['research.js'],
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it.each([
    [{ id: 'stockfish', name: 'Collision', command: process.execPath }],
    [{ id: 'relative', name: 'Relative', command: './engine' }],
    [{ id: 'arguments', name: 'Unsafe separator', command: process.execPath, args: ['one\ntwo'] }],
    [{ id: 'unknown', name: 'Extra property', command: process.execPath, shell: true }],
  ])('rejects ambiguous or invalid registry entries', async (entry) => {
    const directory = await mkdtemp(join(tmpdir(), 'openchesslab-config-'));
    try {
      const path = join(directory, 'engines.json');
      await writeFile(path, JSON.stringify([entry]));
      expect(() => loadEngines(path)).toThrow();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('bounds the configuration file before parsing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'openchesslab-config-'));
    try {
      const path = join(directory, 'engines.json');
      await writeFile(path, ' '.repeat(65_537));
      expect(() => loadEngines(path)).toThrow('64 KB');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
