import { describe, expect, it } from 'vitest';
import {
  BUNDLE_VERSION,
  bundleSha256,
  createBundle,
  verifyBundle,
  type ExperimentBundle,
} from '../../src/shared/bundles';
import { DEFAULT_POSITION } from '../../src/shared/chess';
import { SUITE_V1 } from '../../src/shared/suites';
import type { BenchmarkResult } from '../../src/shared/types';

const result = (overrides: Partial<BenchmarkResult> = {}): BenchmarkResult => ({
  id: '00000000-0000-4000-8000-000000000001',
  appVersion: '0.5.0',
  createdAt: '2026-11-26T00:00:00.000Z',
  settings: { depth: 8, threads: 1, hash: 16, multiPv: 1 },
  environment: { platform: 'linux', arch: 'x64', cpus: 2, node: 'v22.23.1' },
  suite: { id: SUITE_V1.id, version: SUITE_V1.version, sha256: SUITE_V1.sha256 },
  rows: [
    {
      engineId: 'fixture-engine',
      engineName: 'Explicit bundle fixture',
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
  comparisons: {
    [DEFAULT_POSITION]: { meanCp: 10, disagreementCp: null, mateCount: 0, missingScoreCount: 0 },
  },
  ...overrides,
});

const bundle = (overrides: Partial<BenchmarkResult> = {}): ExperimentBundle =>
  createBundle(result(overrides), {
    suite: {
      id: SUITE_V1.id,
      version: SUITE_V1.version,
      sha256: SUITE_V1.sha256,
      positions: SUITE_V1.positions,
    },
  });

describe('experiment bundles', () => {
  it('creates versioned bundles with stable content hashes', () => {
    const first = bundle();
    const second = bundle();
    expect(first.format).toBe('openchesslab-experiment-bundle');
    expect(first.bundleVersion).toBe(BUNDLE_VERSION);
    expect(first.sha256).toBe(second.sha256);
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(first.engines).toEqual([{ id: 'fixture-engine', name: 'Explicit bundle fixture' }]);
    expect(first.suite?.sha256).toBe(SUITE_V1.sha256);
    expect(bundleSha256(first)).toBe(first.sha256);
  });
  it('round-trips through JSON without losing null measurements', () => {
    const withNulls = bundle({
      rows: [
        {
          ...result().rows[0]!,
          depth: null,
          depthLimited: true,
          nodes: null,
          nps: null,
          engineTimeMs: null,
        },
      ],
    });
    const revived = verifyBundle(JSON.parse(JSON.stringify(withNulls)));
    expect(revived.ok).toBe(true);
    if (revived.ok) {
      expect(revived.bundle.result.rows[0]).toMatchObject({
        depth: null,
        nodes: null,
        nps: null,
        engineTimeMs: null,
      });
    }
  });
  it('detects tampering with any hashed field', () => {
    const tampered = bundle();
    tampered.result.rows[0]!.nodes = 999_999;
    const nodes = verifyBundle(tampered);
    expect(nodes.ok).toBe(false);
    if (!nodes.ok) expect(nodes.errors[0]).toContain('sha256 mismatch');

    const edited = bundle();
    edited.notes = 'sneaky edit';
    expect(verifyBundle(edited).ok).toBe(false);

    const swapped = bundle();
    (swapped.result.rows[0]!.score as { value: number }).value = 500;
    expect(verifyBundle(swapped).ok).toBe(false);
  });
  it('rejects malformed bundles with structured errors instead of throwing', () => {
    expect(verifyBundle(null).ok).toBe(false);
    expect(verifyBundle({}).ok).toBe(false);
    const wrongFormat = { ...bundle(), format: 'something-else' };
    const format = verifyBundle(wrongFormat);
    expect(format.ok).toBe(false);
    if (!format.ok) expect(format.errors[0]).toContain('format');

    const mismatched = bundle();
    mismatched.runId = '00000000-0000-4000-8000-000000000002';
    // Re-sign over schema order so the failure is the id mismatch, not the hash.
    const reparsed = JSON.parse(JSON.stringify(mismatched)) as Record<string, unknown>;
    delete reparsed.sha256;
    mismatched.sha256 = bundleSha256(reparsed as Omit<ExperimentBundle, 'sha256'>);
    const ids = verifyBundle(mismatched);
    expect(ids.ok).toBe(false);
    if (!ids.ok) expect(ids.errors.join(' ')).toContain('runId');
  });
  it('supports custom-position runs with a null suite', () => {
    const custom = createBundle(result({ suite: undefined }), { suite: null });
    expect(custom.suite).toBeNull();
    expect(verifyBundle(JSON.parse(JSON.stringify(custom))).ok).toBe(true);
  });
  it('sorts engines deterministically for stable hashes', () => {
    const two = result({
      rows: [
        result().rows[0]!,
        { ...result().rows[0]!, engineId: 'aaa-engine', engineName: 'AAA fixture' },
      ],
    });
    const created = createBundle(two, { suite: null });
    expect(created.engines.map((engine) => engine.id)).toEqual(['aaa-engine', 'fixture-engine']);
    expect(verifyBundle(created).ok).toBe(true);
  });
});
