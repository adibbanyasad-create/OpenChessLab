import { describe, expect, it } from 'vitest';
import {
  BUNDLE_VERSION,
  bundleSha256,
  createBundle,
  verifyBundle,
  type ExperimentBundle,
} from '../../src/shared/bundles';
import { SUITE_V1 } from '../../src/shared/suites';
import type { BenchmarkResult } from '../../src/shared/types';

const rowFor = (position: { name: string; fen: string }) => ({
  engineId: 'fixture-engine',
  engineName: 'Explicit bundle fixture',
  position: position.name,
  fen: position.fen,
  depth: 8,
  requestedDepth: 8,
  depthLimited: false,
  nodes: 100,
  nps: 2000,
  engineTimeMs: 50,
  wallTimeMs: 55,
  score: { type: 'cp' as const, value: 10 },
  bestMove: 'e2e4',
  effectiveOptions: { Threads: 1, Hash: 16, MultiPV: 1 },
  warnings: [],
});

// Consistent fixture: one row per Suite v1 position, matching the suite ref.
const result = (overrides: Partial<BenchmarkResult> = {}): BenchmarkResult => ({
  id: '00000000-0000-4000-8000-000000000001',
  appVersion: '0.5.0',
  createdAt: '2026-11-26T00:00:00.000Z',
  settings: { depth: 8, threads: 1, hash: 16, multiPv: 1 },
  environment: { platform: 'linux', arch: 'x64', cpus: 2, node: 'v22.23.1' },
  suite: { id: SUITE_V1.id, version: SUITE_V1.version, sha256: SUITE_V1.sha256 },
  rows: SUITE_V1.positions.map((position) => ({ ...rowFor(position) })),
  comparisons: Object.fromEntries(
    SUITE_V1.positions.map((position) => [
      position.fen,
      { meanCp: 10, disagreementCp: null, mateCount: 0, missingScoreCount: 0 },
    ]),
  ),
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
    // Null preservation is orthogonal to suites: single row, no suite claim.
    const withNulls = createBundle(
      result({
        suite: undefined,
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
      }),
      { suite: null },
    );
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
  it('verifies regardless of producer key order at every nesting level', () => {
    const base = result().rows[0]!;
    const shuffled: Record<string, unknown> = {};
    for (const key of Object.keys(base).reverse()) shuffled[key] = base[key as keyof typeof base];
    // Shuffle nested orders AND the top-level settings/environment/rows keys.
    const input = {
      rows: [shuffled],
      environment: { node: 'v22.23.1', cpus: 2, arch: 'x64', platform: 'linux' },
      settings: { multiPv: 1, hash: 16, threads: 1, depth: 8 },
      createdAt: result().createdAt,
      appVersion: result().appVersion,
      id: result().id,
    } as unknown as BenchmarkResult;
    const created = createBundle(input, { suite: null });
    expect(verifyBundle(JSON.parse(JSON.stringify(created))).ok).toBe(true);
    // Same content, canonical order → identical hash.
    const ordered = result({ suite: undefined, rows: [base], comparisons: undefined });
    expect(created.sha256).toBe(createBundle(ordered, { suite: null }).sha256);
  });
  it('rejects suite claims that do not match measured rows', () => {
    const sneaky = result({
      rows: [
        {
          ...result().rows[0]!,
          fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
        },
      ],
    });
    const claimed = createBundle(sneaky, {
      suite: {
        id: SUITE_V1.id,
        version: SUITE_V1.version,
        sha256: SUITE_V1.sha256,
        positions: SUITE_V1.positions,
      },
    });
    const verdict = verifyBundle(JSON.parse(JSON.stringify(claimed)));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.errors[0]).toContain('does not match measured rows');
  });
  it('rejects bundles whose suite block hash is forged', () => {
    const good = bundle();
    good.suite!.sha256 = '0'.repeat(64);
    // Re-sign content so the failure is the suite hash, not the content hash.
    const reparsed = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
    delete reparsed.sha256;
    good.sha256 = bundleSha256(reparsed as Omit<ExperimentBundle, 'sha256'>);
    const verdict = verifyBundle(good);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.errors[0]).toContain('Suite sha256 mismatch');
  });
  it('rejects embedded result suite refs that disagree with the bundle suite', () => {
    const good = bundle();
    good.result.suite = { id: 'other-suite', version: 9, sha256: '1'.repeat(64) };
    const reparsed = JSON.parse(JSON.stringify(good)) as Record<string, unknown>;
    delete reparsed.sha256;
    good.sha256 = bundleSha256(reparsed as Omit<ExperimentBundle, 'sha256'>);
    const verdict = verifyBundle(good);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.errors[0]).toContain('disagrees with bundle suite');
  });
  it('copies the suite block instead of aliasing caller state', () => {
    const positions = SUITE_V1.positions.map((position) => ({ ...position }));
    const created = createBundle(result(), {
      suite: { id: SUITE_V1.id, version: 1, sha256: SUITE_V1.sha256, positions },
    });
    positions[0]!.name = 'Mutated after bundling';
    created.suite!.positions[0]!.name = 'Mutated inside bundle';
    expect(SUITE_V1.positions[0]!.name).toBe('Starting position');
    expect(positions[0]!.name).toBe('Mutated after bundling');
    expect(created.suite!.positions[0]!.name).toBe('Mutated inside bundle');
  });
  it('refuses to bundle multi-PV or rowless results instead of rewriting them', () => {
    expect(() =>
      createBundle(result({ settings: { depth: 8, threads: 1, hash: 16, multiPv: 3 } }), {
        suite: null,
      }),
    ).toThrow('multiPv must be 1');
    expect(() => createBundle(result({ rows: [] }), { suite: null })).toThrow(
      'at least one measured row',
    );
  });
});
