import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const run = (args: string[]) =>
  spawnSync(process.execPath, ['scripts/regress.mjs', ...args], { encoding: 'utf8' });

describe('regression CLI argument gates', () => {
  it('accepts only bare bundle file names for --output', () => {
    for (const output of [
      '../escape.oclb.json',
      '/tmp/evil.oclb.json',
      'sub/dir.oclb.json',
      '..\\evil.oclb.json',
      'candidate.json',
      'evil name.oclb.json',
      `${'a'.repeat(120)}.oclb.json`,
    ]) {
      const result = run(['--baseline', 'b.json', '--engine', 'e', '--output', output]);
      expect(result.status, output).toBe(2);
      expect(result.stdout, output).toContain('--output must be a bare file name');
    }
  });
  it('accepts a valid bare bundle name and proceeds to the baseline', () => {
    const result = run([
      '--baseline',
      'b.json',
      '--engine',
      'e',
      '--output',
      'candidate-pr-1.oclb.json',
    ]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain("ENOENT: no such file or directory, open 'b.json'");
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
