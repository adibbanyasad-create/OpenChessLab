import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseInfo, UciEngine } from '../../src/server/uci';
import { DEFAULT_POSITION } from '../../src/shared/chess';

const fixture = (mode = 'normal') =>
  new UciEngine({
    id: 'fixture',
    name: 'Test engine',
    description: 'Protocol fixture, not a chess engine',
    kind: 'native',
    command: process.execPath,
    args: [resolve('tests/fixtures/uci-engine.mjs'), mode],
  });
const settings = { depth: 8, threads: 1, hash: 32, multiPv: 1 };

describe('UCI info parsing', () => {
  it('normalizes Black centipawns and bound direction', () => {
    const info = parseInfo(
      'info depth 12 seldepth 19 score cp 120 lowerbound nodes 30000 nps 500000 time 60 pv e7e5 g1f3',
      'b',
    );
    expect(info?.score).toEqual({ type: 'cp', value: -120 });
    expect(info?.bound).toBe('upper');
    expect(info?.nodes).toBe(30000);
    expect(info?.multiPv).toBe(1);
  });
  it.each([
    ['w', 3, 'w', 3],
    ['w', -3, 'b', -3],
    ['b', 3, 'b', -3],
    ['b', -3, 'w', 3],
    ['w', 0, 'b', 0],
  ] as const)('normalizes mate for %s with score %i', (turn, value, winner, normalized) => {
    expect(parseInfo(`info depth 7 score mate ${value} pv e2e4`, turn)?.score).toEqual({
      type: 'mate',
      value: normalized,
      winner,
    });
  });
  it.each([
    'info string score cp 100 pv e2e4',
    'info depth 7 score cp NaN pv e2e4',
    'info depth 7 nodes 100',
    'bestmove e2e4',
    'info score other 3 pv e2e4',
  ])('ignores non-search and invalid output', (line) => {
    expect(parseInfo(line, 'w')).toBeUndefined();
  });
  it('limits nonnegative statistics and PV length', () => {
    const info = parseInfo(
      `info depth 2 score cp 0 nodes -1 nps -2 hashfull 2000 pv ${Array.from({ length: 100 }, () => 'e2e4').join(' ')}`,
      'w',
    );
    expect(info?.nodes).toBe(0);
    expect(info?.nps).toBe(0);
    expect(info?.hashfull).toBe(1000);
    expect(info?.pv).toHaveLength(64);
  });
});

describe('UCI process lifecycle', () => {
  it('handles fragmented CRLF output and converts PVs to SAN', async () => {
    const engine = fixture('fragmented');
    try {
      await engine.start(settings, AbortSignal.timeout(3000));
      const result = await engine.analyze(DEFAULT_POSITION, AbortSignal.timeout(3000));
      expect(result.lines[0]?.san).toEqual(['e4', 'e5', 'Nf3']);
      expect(result.effectiveOptions).toEqual({ Threads: 1, Hash: 32, MultiPV: 1 });
      expect(result.depthLimited).toBe(false);
      expect(result.engineName).toBe('Test UCI fixture');
    } finally {
      await engine.close();
      await engine.close();
    }
  });
  it.each(['crash', 'bad-move', 'no-score', 'oversized'])(
    'fails safely for %s output',
    async (mode) => {
      const engine = fixture(mode);
      try {
        await engine.start(settings, AbortSignal.timeout(3000));
        await expect(engine.analyze(DEFAULT_POSITION, AbortSignal.timeout(3000))).rejects.toThrow();
      } finally {
        await engine.close();
      }
    },
  );
  it('reports unsupported options rather than pretending they were applied', async () => {
    const engine = fixture('unsupported');
    try {
      await engine.start(settings, AbortSignal.timeout(3000));
      const result = await engine.analyze(DEFAULT_POSITION, AbortSignal.timeout(3000));
      expect(result.effectiveOptions).toEqual({});
      expect(result.warnings).toHaveLength(3);
    } finally {
      await engine.close();
    }
  });
  it('respects the advertised option range', async () => {
    const engine = fixture();
    try {
      await expect(
        engine.start({ ...settings, threads: 4 }, AbortSignal.timeout(3000)),
      ).rejects.toThrow('Threads must be between 1 and 2');
    } finally {
      await engine.close();
    }
  });
  it('cancels a stalled search', async () => {
    const engine = fixture('stall');
    try {
      await engine.start(settings, AbortSignal.timeout(3000));
      await expect(engine.analyze(DEFAULT_POSITION, AbortSignal.timeout(40))).rejects.toThrow();
    } finally {
      await engine.close();
    }
  });
  it('cancels an incomplete handshake', async () => {
    const engine = fixture('no-handshake');
    try {
      await expect(engine.start(settings, AbortSignal.timeout(60))).rejects.toThrow();
    } finally {
      await engine.close();
    }
  });
  it('handles a missing executable with a sanitized error', async () => {
    const engine = new UciEngine({
      id: 'missing',
      name: 'Missing',
      description: '',
      kind: 'native',
      command: '/nonexistent/openchesslab-engine',
      args: [],
    });
    try {
      await expect(engine.start(settings, AbortSignal.timeout(3000))).rejects.toThrow(
        'Could not start the engine',
      );
    } finally {
      await engine.close();
    }
  });
});
