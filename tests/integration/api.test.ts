import { setTimeout as wait } from 'node:timers/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { apiTokensMatch, createApp } from '../../src/server/app';
import { loadConfig } from '../../src/server/config';
import { APP_VERSION } from '../../src/server/version';
import { BENCHMARK_POSITIONS, DEFAULT_POSITION, parseGame } from '../../src/shared/chess';
import type { AnalysisResult, BenchmarkResult, Job, ReviewResult } from '../../src/shared/types';

let app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  app = await createApp({ rateLimit: false });
});
afterAll(async () => {
  await app.close();
});

async function finish(id: string, server = app): Promise<Job> {
  for (let attempt = 0; attempt < 500; attempt++) {
    const response = await server.inject({ method: 'GET', url: `/api/jobs/${id}` });
    expect(response.statusCode).toBe(200);
    const job = response.json<Job>();
    if (job.status !== 'running') return job;
    await wait(50);
  }
  throw new Error('Integration job did not finish within 25 seconds.');
}

describe('HTTP API and security boundaries', () => {
  it('retains sanitized validation errors when the production static plugin is enabled', async () => {
    const builtApp = await createApp({
      config: { ...loadConfig(), staticRoot: resolve('tests/fixtures/static') },
      rateLimit: false,
    });
    try {
      const invalid = await builtApp.inject({
        method: 'POST',
        url: '/api/analysis',
        payload: { fen: 'invalid' },
      });
      expect(invalid.statusCode).toBe(400);
      expect(Object.keys(invalid.json())).toEqual(['error']);
      expect((await builtApp.inject('/')).body).toContain('Static integration fixture');
      expect((await builtApp.inject('/workspace')).body).toContain('Static integration fixture');
      expect((await builtApp.inject('/missing.js')).statusCode).toBe(404);
      expect((await builtApp.inject('/api/missing')).statusCode).toBe(404);
      const root = await builtApp.inject('/api');
      expect(root.statusCode).toBe(404);
      expect(root.headers['content-type']).toContain('application/json');
    } finally {
      await builtApp.close();
    }
  });
  it('reports service health without pretending to probe engines', async () => {
    const response = await app.inject('/api/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', version: APP_VERSION, requiresAuth: false });
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    expect(response.headers['content-security-policy']).not.toContain('arena.ai');
  });
  it('lists two configured engines without executable paths or arguments', async () => {
    const response = await app.inject('/api/engines');
    const body = response.json();
    expect(body.engines).toHaveLength(2);
    expect(response.body).not.toContain('command');
    expect(response.body).not.toContain(process.execPath);
  });
  it('parses a PGN through the API', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/games/parse',
      payload: { pgn: '1. e4 e5 2. Nf3 Nc6 *' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().moves).toHaveLength(4);
  });
  it.each([
    ['/api/analysis', { fen: 'not a FEN' }],
    ['/api/analysis', { fen: DEFAULT_POSITION, engineId: 'unknown' }],
    ['/api/analysis', { fen: DEFAULT_POSITION, threads: 100 }],
    ['/api/analysis', { fen: DEFAULT_POSITION, command: '/bin/example' }],
    ['/api/games/parse', { pgn: 'not a game' }],
    ['/api/reviews', { pgn: '*' }],
  ])('rejects malformed %s requests before starting jobs', async (url, payload) => {
    const response = await app.inject({ method: 'POST', url: url as string, payload });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBeTypeOf('string');
    expect(response.body).not.toContain('stack');
  });
  it('rejects disallowed hosts and cross-origin mutations', async () => {
    expect(
      (await app.inject({ url: '/api/health', headers: { host: 'untrusted.example' } })).statusCode,
    ).toBe(403);
    const response = await app.inject({
      method: 'POST',
      url: '/api/games/parse',
      headers: { origin: 'https://untrusted.example' },
      payload: { pgn: '1. e4 *' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/games/parse',
          headers: { origin: 'http://localhost' },
          payload: { pgn: '1. e4 *' },
        })
      ).statusCode,
    ).toBe(200);
  });
  it('rejects oversized bodies and unknown job IDs', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/games/parse',
      payload: { pgn: 'x'.repeat(300_001) },
    });
    expect(response.statusCode).toBe(413);
    expect((await app.inject('/api/jobs/00000000-0000-4000-8000-000000000001')).statusCode).toBe(
      404,
    );
    expect((await app.inject('/api/jobs/not-an-id')).statusCode).toBe(400);
  });
  it('gates API data and mutations with an optional token while retaining health', async () => {
    const token = 'this-is-a-test-only-token-123456789';
    const protectedApp = await createApp({
      config: { ...loadConfig(), apiToken: token },
      rateLimit: false,
    });
    try {
      expect((await protectedApp.inject('/api/health')).statusCode).toBe(200);
      expect((await protectedApp.inject('/api/engines')).statusCode).toBe(401);
      expect(
        (
          await protectedApp.inject({
            url: '/api/engines',
            headers: { authorization: 'Bearer wrong' },
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await protectedApp.inject({
            url: '/api/engines',
            headers: { authorization: `Bearer ${token}` },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (
          await protectedApp.inject({
            url: '/api/engines',
            headers: { authorization: `bearer ${token}` },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await protectedApp.inject({ url: '/api/engines', headers: { authorization: token } }))
          .statusCode,
      ).toBe(401);
      expect(
        (
          await protectedApp.inject({
            url: '/api/engines',
            headers: { authorization: `Basic ${token}` },
          })
        ).statusCode,
      ).toBe(401);
    } finally {
      await protectedApp.close();
    }
  });
  it('compares bearer tokens without length-dependent exceptions or timing shortcuts', () => {
    const token = 'this-is-a-test-only-token-123456789';
    expect(apiTokensMatch(token, token)).toBe(true);
    expect(apiTokensMatch(token, 'wrong')).toBe(false);
    expect(apiTokensMatch(token, `${token}x`)).toBe(false);
    expect(apiTokensMatch(token, token.slice(0, -1))).toBe(false);
    expect(apiTokensMatch(token, '')).toBe(false);
  });
  it('rate-limits job creation even for rejected input', async () => {
    const limited = await createApp();
    try {
      let status = 0;
      for (let i = 0; i < 31; i++)
        status = (
          await limited.inject({
            method: 'POST',
            url: '/api/analysis',
            payload: { fen: 'invalid' },
          })
        ).statusCode;
      expect(status).toBe(429);
    } finally {
      await limited.close();
    }
  });
});

describe('actual Stockfish jobs', () => {
  it('returns the canonical FEN that was actually searched', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/analysis',
      payload: {
        fen: DEFAULT_POSITION.replaceAll(' ', '  '),
        depth: 2,
        multiPv: 1,
        hash: 16,
      },
    });
    expect(created.statusCode).toBe(202);
    const job = await finish(created.json<Job>().id);
    expect(job.status, job.error).toBe('completed');
    expect((job.result as AnalysisResult).fen).toBe(DEFAULT_POSITION);
  });
  it('analyzes with multiple PVs and applies real hash/thread settings', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/analysis',
      payload: { fen: DEFAULT_POSITION, depth: 8, threads: 2, hash: 32, multiPv: 3 },
    });
    expect(created.statusCode).toBe(202);
    const job = await finish(created.json<Job>().id);
    expect(job.status, job.error).toBe('completed');
    const result = job.result as AnalysisResult;
    expect(result.engineName).toContain('Stockfish');
    expect(result.lines).toHaveLength(3);
    expect(result.effectiveOptions).toEqual({ Threads: 2, Hash: 32, MultiPV: 3 });
    expect(result.completedDepth).toBeGreaterThanOrEqual(8);
    expect(result.lines[0]?.nodes).toBeGreaterThan(0);
    expect(result.lines[0]?.nps).toBeGreaterThan(0);
    const chess = new Chess();
    expect(
      chess.move({ from: result.bestMove!.slice(0, 2), to: result.bestMove!.slice(2, 4) }),
    ).toBeTruthy();
    expect((await app.inject(`/api/jobs/${job.id}/export`)).statusCode).toBe(409);
  });
  it('compares the full and Lite engines using measured rows and exports', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/benchmarks',
      payload: {
        engineIds: ['stockfish-lite', 'stockfish'],
        positions: [BENCHMARK_POSITIONS[0], BENCHMARK_POSITIONS[2]],
        depth: 6,
        threads: 1,
        hash: 16,
      },
    });
    expect(created.statusCode, created.body).toBe(202);
    const job = await finish(created.json<Job>().id);
    expect(job.status, job.error).toBe('completed');
    const result = job.result as BenchmarkResult;
    expect(result.rows).toHaveLength(4);
    expect(result.appVersion).toBe(APP_VERSION);
    expect(new Set(result.rows.map((row) => row.engineId)).size).toBe(2);
    for (const row of result.rows) {
      expect(row.engineName).toContain('Stockfish');
      expect(row.nps).toBeGreaterThan(0);
      expect(row.nodes).toBeGreaterThan(0);
      expect(row.wallTimeMs).toBeGreaterThanOrEqual(0);
      expect(row.depth).toBeGreaterThanOrEqual(6);
      expect(row.effectiveOptions.Hash).toBe(16);
    }
    const csv = await app.inject(`/api/jobs/${job.id}/export?format=csv`);
    expect(csv.statusCode).toBe(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.body).toContain('effective_options');
    expect(csv.body.trim().split('\r\n')).toHaveLength(5);
    const json = await app.inject(`/api/jobs/${job.id}/export?format=json`);
    expect(json.json()).toEqual(result);
    expect(result.environment.cpus).toBeGreaterThan(0);
  });
  it('reviews a real short game and identifies the mating blunder', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/reviews',
      payload: { pgn: '1. f3 e5 2. g4 Qh4# 0-1', depth: 6, hash: 16 },
    });
    expect(created.statusCode).toBe(202);
    const job = await finish(created.json<Job>().id);
    expect(job.status, job.error).toBe('completed');
    const result = job.result as ReviewResult;
    expect(result.scores).toHaveLength(5);
    expect(result.annotations).toHaveLength(4);
    expect(result.scores.at(-1)?.score).toEqual({ type: 'mate', value: 0, winner: 'b' });
    expect(result.annotations.find((move) => move.san === 'g4')?.classification).toBe('blunder');
  });
  it('represents terminal checkmate without invented search nodes', async () => {
    const fen = parseGame('1. f3 e5 2. g4 Qh4# 0-1').positions.at(-1)!;
    const created = await app.inject({
      method: 'POST',
      url: '/api/analysis',
      payload: { fen, depth: 4 },
    });
    const job = await finish(created.json<Job>().id);
    expect(job.status, job.error).toBe('completed');
    const result = job.result as AnalysisResult;
    expect(result.terminal).toBe(true);
    expect(result.bestMove).toBeNull();
    expect(result.lines[0]?.nodes).toBe(0);
    expect(result.lines[0]?.score).toEqual({ type: 'mate', value: 0, winner: 'b' });
  });
  it('cancels a running search and allows a subsequent exclusive job', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/analysis',
      payload: { fen: DEFAULT_POSITION, depth: 24, multiPv: 5 },
    });
    const id = created.json<Job>().id;
    const cancelled = await app.inject({ method: 'DELETE', url: `/api/jobs/${id}` });
    expect(cancelled.json<Job>().status).toBe('cancelled');
    const next = await app.inject({
      method: 'POST',
      url: '/api/benchmarks',
      payload: { engineIds: ['stockfish-lite'], positions: [BENCHMARK_POSITIONS[0]], depth: 2 },
    });
    expect(next.statusCode).toBe(202);
    await app.inject({ method: 'DELETE', url: `/api/jobs/${next.json<Job>().id}` });
  });
});

describe('optional UCI measurements through the API', () => {
  it('exports absent statistics as null JSON values and empty CSV cells', async () => {
    const fixtureApp = await createApp({
      rateLimit: false,
      engines: [
        {
          id: 'fixture-stats',
          name: 'Test fixture',
          description: 'Protocol testing only',
          kind: 'native',
          command: process.execPath,
          args: [resolve('tests/fixtures/uci-engine.mjs'), 'missing-statistics'],
        },
      ],
    });
    try {
      const created = await fixtureApp.inject({
        method: 'POST',
        url: '/api/benchmarks',
        payload: {
          engineIds: ['fixture-stats'],
          positions: [{ name: 'Start', fen: DEFAULT_POSITION }],
          depth: 8,
          hash: 32,
        },
      });
      expect(created.statusCode).toBe(202);
      const job = await finish(created.json<Job>().id, fixtureApp);
      expect(job.status, job.error).toBe('completed');
      const result = job.result as BenchmarkResult;
      expect(result.rows[0]).toMatchObject({ nodes: null, nps: null, engineTimeMs: null });
      const json = await fixtureApp.inject(`/api/jobs/${job.id}/export?format=json`);
      expect(json.json<BenchmarkResult>().rows[0]?.nps).toBeNull();
      const csv = await fixtureApp.inject(`/api/jobs/${job.id}/export?format=csv`);
      expect(csv.body.split('\r\n')[1]!.split(',').slice(9, 12)).toEqual(['', '', '']);
      expect(csv.body).toContain('Missing measurements are null');
    } finally {
      await fixtureApp.close();
    }
  });
});
