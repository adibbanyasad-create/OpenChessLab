import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const run = (args: string[]) =>
  spawnSync(process.execPath, ['scripts/regress.mjs', ...args], { encoding: 'utf8' });

describe('regression CLI argument gates', () => {
  it('rejects the removed --output file flag with a migration hint', () => {
    const result = run([
      '--baseline',
      'b.json',
      '--engine',
      'e',
      '--output',
      'candidate.oclb.json',
    ]);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('--print-bundle > candidate.oclb.json');
  });
  it('accepts --print-bundle and proceeds to the baseline', () => {
    const result = run(['--baseline', 'b.json', '--engine', 'e', '--print-bundle']);
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
  it('rejects malformed server URLs as usage errors, not crashes', () => {
    const result = run(['--baseline', 'b.json', '--engine', 'e', '--server', '::::']);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('--server must be a valid URL');
    expect(result.stderr).not.toContain('SyntaxError');
  });
  it('rejects non-integer suite versions', () => {
    const result = run(['--baseline', 'b.json', '--engine', 'e', '--suite-version', 'abc']);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('--suite-version must be a positive integer.');
  });
  it('never runs with fail-open gates: bare or unknown --fail-on errors', () => {
    const bare = run(['--baseline', 'b.json', '--engine', 'e', '--fail-on']);
    expect(bare.status).toBe(2);
    expect(bare.stdout).toContain('--fail-on needs a value');
    const unknown = run(['--baseline', 'b.json', '--engine', 'e', '--fail-on', 'strength,elo']);
    expect(unknown.status).toBe(2);
    expect(unknown.stdout).toContain('Unknown gate "strength"');
    const negative = run(['--baseline', 'b.json', '--engine', 'e', '--fail-on', 'disagreement:-5']);
    expect(negative.status).toBe(2);
    expect(negative.stdout).toContain('Unknown gate "disagreement:-5"');
  });
  it('rejects contradictory --print-bundle --json output modes', () => {
    const result = run(['--baseline', 'b.json', '--engine', 'e', '--print-bundle', '--json']);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('mutually exclusive');
  });
  it('rejects tampered baselines before running anything', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oclb-regress-'));
    const path = join(dir, 'baseline.oclb.json');
    writeFileSync(
      path,
      JSON.stringify({ format: 'openchesslab-experiment-bundle', bundleVersion: 1 }),
    );
    const result = run(['--baseline', path, '--engine', 'e']);
    expect(result.status).toBe(2);
    expect(result.stdout).toContain('Baseline');
  });
});
