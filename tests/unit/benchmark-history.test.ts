import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_POSITION } from '../../src/shared/chess';
import type { BenchmarkResult } from '../../src/shared/types';

const KEY = 'ocl-benchmarks-v1';
const fixture = (index = 1): BenchmarkResult => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
  createdAt: '2026-11-25T00:00:00.000Z',
  settings: { depth: 8, threads: 1, hash: 16, multiPv: 1 },
  environment: { platform: 'linux', arch: 'x64', cpus: 2, node: 'v22.23.1' },
  rows: [
    {
      engineId: 'fixture',
      engineName: 'Explicit test fixture',
      position: 'Initial position',
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

let storage: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  storage = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('bounded local benchmark history', () => {
  it('starts empty without manufacturing example measurements', async () => {
    const { readBenchmarkHistory } = await import('../../src/client/benchmarkHistory');
    expect(readBenchmarkHistory()).toEqual({ runs: [], persistent: true, warning: '' });
  });
  it('saves and restores the exact reported engine version and nullable metrics', async () => {
    const result = fixture();
    result.rows[0]!.nodes = null;
    result.rows[0]!.nps = null;
    result.rows[0]!.engineTimeMs = null;
    const { saveBenchmarkRun } = await import('../../src/client/benchmarkHistory');
    expect(saveBenchmarkRun(result).persistent).toBe(true);
    vi.resetModules();
    const { readBenchmarkHistory } = await import('../../src/client/benchmarkHistory');
    expect(readBenchmarkHistory().runs).toEqual([result]);
  });
  it('deduplicates run IDs and retains only the newest 20 records', async () => {
    const { saveBenchmarkRun, readBenchmarkHistory } =
      await import('../../src/client/benchmarkHistory');
    for (let index = 1; index <= 25; index++) saveBenchmarkRun(fixture(index));
    saveBenchmarkRun(fixture(25));
    expect(readBenchmarkHistory().runs).toHaveLength(20);
    expect(readBenchmarkHistory().runs[0]?.id).toBe(fixture(25).id);
    expect(readBenchmarkHistory().runs.at(-1)?.id).toBe(fixture(6).id);
    expect(JSON.parse(storage.get(KEY)!).runs).toHaveLength(20);
  });
  it('preserves recorded comparisons and engine provenance when saving', async () => {
    const result = fixture();
    result.comparisons = {
      [DEFAULT_POSITION]: {
        meanCp: 12.5,
        disagreementCp: 25,
        mateCount: 0,
        missingScoreCount: 0,
      },
    };
    const { saveBenchmarkRun, readBenchmarkHistory } =
      await import('../../src/client/benchmarkHistory');
    expect(saveBenchmarkRun(result).runs[0]?.comparisons).toEqual(result.comparisons);
    expect(readBenchmarkHistory().runs[0]?.rows[0]?.engineName).toBe('Explicit test fixture');
  });
  it('keeps the stored copy when an identical run is saved again', async () => {
    const { saveBenchmarkRun } = await import('../../src/client/benchmarkHistory');
    saveBenchmarkRun(fixture());
    const before = storage.get(KEY);
    expect(saveBenchmarkRun(fixture()).persistent).toBe(true);
    expect(storage.get(KEY)).toBe(before);
  });
  it.each(['{broken', '{}', '{"version":2,"runs":[]}', 'x'.repeat(1_000_001)])(
    'rejects malformed or oversized storage without crashing or silently deleting it',
    async (raw) => {
      storage.set(KEY, raw);
      const { readBenchmarkHistory } = await import('../../src/client/benchmarkHistory');
      const history = readBenchmarkHistory();
      expect(history.runs).toEqual([]);
      expect(history.warning).toContain('unavailable or invalid');
      expect(storage.get(KEY)).toBe(raw);
    },
  );
  it('does not trust malformed records inside an otherwise valid envelope', async () => {
    const result = fixture();
    storage.set(
      KEY,
      JSON.stringify({
        version: 1,
        runs: [{ ...result, rows: [{ ...result.rows[0], nps: 'fast' }] }],
      }),
    );
    const { readBenchmarkHistory } = await import('../../src/client/benchmarkHistory');
    expect(readBenchmarkHistory().runs).toEqual([]);
  });
  it('keeps completed results usable when persistent storage is blocked', async () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Blocked');
      },
      setItem: () => {
        throw new Error('Blocked');
      },
      removeItem: () => {
        throw new Error('Blocked');
      },
    });
    const { saveBenchmarkRun, readBenchmarkHistory } =
      await import('../../src/client/benchmarkHistory');
    const result = fixture();
    expect(saveBenchmarkRun(result).persistent).toBe(false);
    expect(readBenchmarkHistory().runs).toEqual([result]);
    expect(readBenchmarkHistory().warning).toContain('session only');
  });
  it('keeps oversized history in memory without replacing the last successful saved copy', async () => {
    const { saveBenchmarkRun, readBenchmarkHistory } =
      await import('../../src/client/benchmarkHistory');
    for (let index = 1; index <= 4; index++) {
      const result = fixture(index);
      result.rows = Array.from({ length: 32 }, () => ({
        ...result.rows[0]!,
        warnings: Array.from({ length: 20 }, () => 'x'.repeat(500)),
      }));
      const previous = storage.get(KEY);
      const saved = saveBenchmarkRun(result);
      if (!saved.persistent) expect(storage.get(KEY)).toBe(previous);
    }
    expect(readBenchmarkHistory().persistent).toBe(false);
    expect(readBenchmarkHistory().runs).toHaveLength(4);
    expect(JSON.parse(storage.get(KEY)!).runs.length).toBeGreaterThan(0);
    expect(JSON.parse(storage.get(KEY)!).runs.length).toBeLessThan(4);
    expect(readBenchmarkHistory().warning).toContain('session only');
  });
  it('clears only benchmark data, leaving the active game alone', async () => {
    storage.set('ocl-workspace-v1', 'private game state');
    const { saveBenchmarkRun, clearBenchmarkHistory, readBenchmarkHistory } =
      await import('../../src/client/benchmarkHistory');
    saveBenchmarkRun(fixture());
    expect(clearBenchmarkHistory().runs).toEqual([]);
    expect(readBenchmarkHistory().runs).toEqual([]);
    expect(storage.has(KEY)).toBe(false);
    expect(storage.get('ocl-workspace-v1')).toBe('private game state');
  });
  it('does not claim stored data was deleted when deletion fails', async () => {
    const { saveBenchmarkRun, clearBenchmarkHistory } =
      await import('../../src/client/benchmarkHistory');
    saveBenchmarkRun(fixture());
    vi.stubGlobal('localStorage', {
      removeItem: () => {
        throw new Error('Blocked');
      },
    });
    const result = clearBenchmarkHistory();
    expect(result.runs).toHaveLength(1);
    expect(result.warning).toContain('Could not clear');
    expect(storage.has(KEY)).toBe(true);
  });
});
