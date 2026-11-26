import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, followJob, getToken, setToken } from '../../src/client/api';
import { suiteLabel } from '../../src/client/pages/Experiments';
import { SUITE_V1 } from '../../src/shared/suites';
import type { BenchmarkResult, Job } from '../../src/shared/types';

afterEach(() => {
  setToken('');
  vi.unstubAllGlobals();
});

it('keeps authentication usable in memory when browser session storage is blocked', () => {
  vi.stubGlobal('sessionStorage', {
    getItem: () => {
      throw new Error('Storage blocked');
    },
    setItem: () => {
      throw new Error('Storage blocked');
    },
    removeItem: () => {
      throw new Error('Storage blocked');
    },
  });
  setToken('a-test-only-session-token');
  expect(getToken()).toBe('a-test-only-session-token');
  setToken('');
  expect(getToken()).toBe('');
});

it('honors explicit removal of a token from available session storage', () => {
  const values = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  setToken('a-test-only-session-token');
  expect(getToken()).toBe('a-test-only-session-token');
  values.clear();
  expect(getToken()).toBe('');
});

it.each([
  { headers: new Headers({ 'X-Request-Test': 'preserved' }) },
  { headers: [['X-Request-Test', 'preserved']] },
  { headers: { 'X-Request-Test': 'preserved' } },
] as { headers: HeadersInit }[])(
  'preserves all supported RequestInit header representations',
  async ({ headers }) => {
    vi.stubGlobal('sessionStorage', { getItem: () => 'a-test-only-session-token' });
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
      const sent = new Headers(options?.headers);
      expect(sent.get('X-Request-Test')).toBe('preserved');
      expect(sent.get('Authorization')).toBe('Bearer a-test-only-session-token');
      expect(sent.get('Content-Type')).toBe('application/json');
      return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/test', { method: 'POST', body: '{}', headers })).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  },
);

it('provides a useful error when an unavailable server returns non-JSON content', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('Unavailable', { status: 503 })),
  );
  await expect(api('/health')).rejects.toThrow('Request failed (503)');
});

it('retries transient job polling failures without ending the search', async () => {
  vi.useFakeTimers();
  try {
    vi.stubGlobal('sessionStorage', { getItem: () => null });
    const running: Job = {
      id: '00000000-0000-4000-8000-000000000001',
      kind: 'analysis',
      status: 'running',
      createdAt: '2026-11-26T00:00:00.000Z',
      progress: { completed: 0, total: 1, message: 'Searching...' },
    };
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        if (calls <= 2) return new Response('Unavailable', { status: 503 });
        return new Response(JSON.stringify({ ...running, status: 'cancelled' }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    const seen: string[] = [];
    const pending = expect(
      followJob(running, new AbortController().signal, (job) => seen.push(job.status)),
    ).resolves.toBeUndefined();
    await vi.runAllTimersAsync();
    await pending;
    expect(calls).toBe(3);
    expect(seen).toEqual(['running', 'cancelled']);
  } finally {
    vi.useRealTimers();
  }
});

it('surfaces repeated polling failures instead of polling forever', async () => {
  vi.useFakeTimers();
  try {
    vi.stubGlobal('sessionStorage', { getItem: () => null });
    const running: Job = {
      id: '00000000-0000-4000-8000-000000000002',
      kind: 'analysis',
      status: 'running',
      createdAt: '2026-11-26T00:00:00.000Z',
      progress: { completed: 0, total: 1, message: 'Searching...' },
    };
    const fetchMock = vi.fn(async () => new Response('Unavailable', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = expect(
      followJob(running, new AbortController().signal, () => undefined),
    ).rejects.toThrow('Request failed (503)');
    await vi.runAllTimersAsync();
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(6);
  } finally {
    vi.useRealTimers();
  }
});

describe('experiment suite labels', () => {
  const base: BenchmarkResult = {
    id: '00000000-0000-4000-8000-000000000001',
    createdAt: '2026-11-26T00:00:00.000Z',
    settings: { depth: 8, threads: 1, hash: 16, multiPv: 1 },
    environment: { platform: 'linux', arch: 'x64', cpus: 2, node: 'v22.23.1' },
    rows: SUITE_V1.positions.map((position) => ({
      engineId: 'fixture',
      engineName: 'Explicit label fixture',
      position: position.name,
      fen: position.fen,
      depth: 8,
      requestedDepth: 8,
      depthLimited: false,
      nodes: 1,
      nps: 1,
      engineTimeMs: 1,
      wallTimeMs: 1,
      score: { type: 'cp' as const, value: 0 },
      bestMove: null,
      effectiveOptions: {},
      warnings: [],
    })),
  };
  it('labels fully verified known suites as fact', () => {
    expect(
      suiteLabel({
        ...base,
        suite: { id: SUITE_V1.id, version: 1, sha256: SUITE_V1.sha256 },
      }),
    ).toBe(`Suite openchesslab-suite-v1 v1 / ${SUITE_V1.sha256.slice(0, 12)}…`);
  });
  it('marks mismatched or unknown suite claims as unverified', () => {
    expect(
      suiteLabel({
        ...base,
        rows: base.rows.slice(0, 2),
        suite: { id: SUITE_V1.id, version: 1, sha256: SUITE_V1.sha256 },
      }),
    ).toBe('Suite openchesslab-suite-v1 v1 (claim not verified)');
    expect(
      suiteLabel({ ...base, suite: { id: 'future-suite', version: 2, sha256: '0'.repeat(64) } }),
    ).toBe('Suite future-suite v2 (claim not verified)');
  });
  it('labels runs without suite refs as custom', () => {
    expect(suiteLabel(base)).toBe('Custom positions (no suite)');
  });
});
