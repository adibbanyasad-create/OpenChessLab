import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createBundle } from '../../src/shared/bundles';
import { DEFAULT_POSITION } from '../../src/shared/chess';
import { SUITE_V1 } from '../../src/shared/suites';
import type { BenchmarkResult } from '../../src/shared/types';

/** The standalone verifier must agree with the TypeScript implementation. */
const fixtureResult = (): BenchmarkResult => ({
  id: '00000000-0000-4000-8000-000000000001',
  appVersion: '0.5.0',
  createdAt: '2026-11-26T00:00:00.000Z',
  settings: { depth: 8, threads: 1, hash: 16, multiPv: 1 },
  environment: { platform: 'linux', arch: 'x64', cpus: 2, node: 'v22.23.1' },
  suite: { id: SUITE_V1.id, version: SUITE_V1.version, sha256: SUITE_V1.sha256 },
  rows: [
    {
      engineId: 'fixture-engine',
      engineName: 'Explicit script fixture',
      position: 'Starting position',
      fen: DEFAULT_POSITION,
      depth: 8,
      requestedDepth: 8,
      depthLimited: false,
      nodes: 100,
      nps: 2000,
      engineTimeMs: 50,
      wallTimeMs: 55,
      score: { type: 'cp', value: 10 },
      bestMove: 'e2e4',
      effectiveOptions: { Threads: 1, Hash: 16, MultiPV: 1 },
      warnings: [],
    },
  ],
});

const runVerifier = (bundle: unknown, extra: string[] = []) => {
  const dir = mkdtempSync(join(tmpdir(), 'oclb-verify-'));
  const path = join(dir, 'test.oclb.json');
  writeFileSync(path, JSON.stringify(bundle));
  return spawnSync(process.execPath, ['scripts/verify-bundle.mjs', path, ...extra], {
    encoding: 'utf8',
  });
};

describe('standalone bundle verifier script', () => {
  it('accepts bundles created by the application', () => {
    const bundle = createBundle(fixtureResult(), {
      suite: {
        id: SUITE_V1.id,
        version: SUITE_V1.version,
        sha256: SUITE_V1.sha256,
        positions: SUITE_V1.positions,
      },
    });
    const result = runVerifier(bundle);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Bundle OK');
    expect(result.stdout).toContain(SUITE_V1.sha256.slice(0, 12));
  });
  it('accepts null-suite bundles and reports machine output with --json', () => {
    const withoutSuite = fixtureResult();
    delete withoutSuite.suite;
    const bundle = createBundle(withoutSuite, { suite: null });
    const result = runVerifier(bundle, ['--json']);
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, suite: null, rows: 1 });
  });
  it('rejects tampered content with a hash mismatch', () => {
    const bundle = createBundle(fixtureResult(), { suite: null });
    bundle.result.rows[0]!.nodes = 424242;
    const result = runVerifier(bundle);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('sha256 mismatch');
  });
  it('rejects tampered suite positions independently', () => {
    const bundle = createBundle(fixtureResult(), {
      suite: {
        id: SUITE_V1.id,
        version: SUITE_V1.version,
        sha256: SUITE_V1.sha256,
        positions: SUITE_V1.positions,
      },
    });
    bundle.suite!.positions[0]!.name = 'Renamed position';
    const result = runVerifier(bundle);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('suite sha256 mismatch');
  });
  it('rejects wrong-format files and missing arguments', () => {
    expect(runVerifier({ format: 'nope' }).status).toBe(1);
    const usage = spawnSync(process.execPath, ['scripts/verify-bundle.mjs'], { encoding: 'utf8' });
    expect(usage.status).toBe(1);
    expect(usage.stderr).toContain('Usage:');
    const missing = spawnSync(process.execPath, ['scripts/verify-bundle.mjs', '/nope.json'], {
      encoding: 'utf8',
    });
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain('Could not read');
  });
});
