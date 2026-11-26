import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const run = (args: string[]) =>
  spawnSync(process.execPath, ['scripts/regress.mjs', ...args], { encoding: 'utf8' });

describe('regression CLI argument gates', () => {
  it('rejects output paths escaping the working directory', () => {
    for (const output of ['../escape.oclb.json', '/tmp/evil.oclb.json']) {
      const result = run(['--baseline', 'b.json', '--engine', 'e', '--output', output]);
      expect(result.status).toBe(2);
      expect(result.stdout).toContain('--output must stay inside the working directory.');
    }
    // A backslash is a path separator on Windows (escape → rejected) but a
    // plain filename character on POSIX (stays inside → proceeds to baseline).
    const backslash = run(['--baseline', 'b.json', '--engine', 'e', '--output', '..\\e.oclb.json']);
    expect(backslash.status).toBe(2);
    if (process.platform === 'win32') {
      expect(backslash.stdout).toContain('--output must stay inside the working directory.');
    } else {
      expect(backslash.stdout).toContain("ENOENT: no such file or directory, open 'b.json'");
    }
  });
  it('rejects output paths without the bundle extension', () => {
    const result = run(['--baseline', 'b.json', '--engine', 'e', '--output', 'candidate.json']);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('--output must be a path of at most 256 characters');
  });
  it('rejects invalid resource settings before touching the network', () => {
    const depth = run(['--baseline', 'b.json', '--engine', 'e', '--depth', '99']);
    expect(depth.status).toBe(2);
    expect(depth.stdout).toContain('--depth must be an integer 1-24.');
    const remote = run([
      '--baseline',
      'b.json',
      '--engine',
      'e',
      '--server',
      'http://example.com:3001',
    ]);
    expect(remote.status).toBe(2);
    expect(remote.stdout).toContain('Refusing non-loopback --server.');
  });
  it('requires baseline and engine identifiers', () => {
    const result = run(['--engine', 'e']);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('Missing --baseline');
  });
});
