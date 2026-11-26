import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseInfo, parseUciOption, UciEngine, validateCustomOption } from '../../src/server/uci';
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
  it.each(['info string score cp 100 pv e2e4', 'bestmove e2e4', 'info currmove e2e4'])(
    'ignores non-search and invalid output',
    (line) => {
      expect(parseInfo(line, 'w')).toBeUndefined();
    },
  );
  it('limits nonnegative statistics and PV length', () => {
    const info = parseInfo(
      `info depth 2 score cp 0 nodes -1 nps -2 hashfull 2000 pv ${Array.from({ length: 100 }, () => 'e2e4').join(' ')}`,
      'w',
    );
    expect(info?.nodes).toBeUndefined();
    expect(info?.nps).toBeUndefined();
    expect(info?.hashfull).toBeUndefined();
    expect(info?.pv).toHaveLength(64);
  });
  it('accepts statistics-only messages without inventing a score', () => {
    expect(parseInfo('info depth 7 nodes 100 nps 5000 time 20', 'w')).toEqual({
      multiPv: 1,
      depth: 7,
      nodes: 100,
      nps: 5000,
      timeMs: 20,
    });
  });
  it('treats the rest of an info string message as text, not measurements', () => {
    expect(parseInfo('info depth 7 string nodes 123 score cp 500 pv e2e4', 'w')).toEqual({
      multiPv: 1,
      depth: 7,
    });
    expect(parseInfo('info string', 'w')).toBeUndefined();
  });
  it('accepts UCI whitespace without requiring a literal space after info', () => {
    expect(parseInfo('\tinfo\tdepth\t8\tscore\tcp\t31\tpv\te2e4\t', 'w')).toMatchObject({
      depth: 8,
      score: { type: 'cp', value: 31 },
      pv: ['e2e4'],
    });
  });
  it.each(['NaN', 'Infinity', '1.5', '9007199254740992', '0x10', '1e3'])(
    'ignores invalid counters: %s',
    (value) => {
      const info = parseInfo(`info score cp 10 nodes ${value} nps ${value} pv e2e4`, 'w');
      expect(info?.nodes).toBeUndefined();
      expect(info?.nps).toBeUndefined();
    },
  );
  it('does not turn an invalid score into a usable evaluation', () => {
    expect(parseInfo('info depth 7 score cp NaN pv e2e4', 'w')?.score).toBeUndefined();
    expect(parseInfo('info score other 3 pv e2e4', 'w')?.score).toBeUndefined();
    expect(parseInfo('info score cp 0x20 pv e2e4', 'w')?.score).toBeUndefined();
  });
  it.each(['0', '-1', 'two', '1025'])(
    'does not relabel an invalid MultiPV index as the best line',
    (value) => {
      expect(parseInfo(`info multipv ${value} score cp 30 pv e2e4`, 'w')).toBeUndefined();
    },
  );
  it('stops a PV at its first invalid token rather than joining unrelated moves', () => {
    expect(parseInfo('info score cp 10 pv e2e4 invalid e7e5', 'w')?.pv).toEqual(['e2e4']);
  });
  it('normalizes negative zero without losing the mate winner', () => {
    expect(Object.is(parseInfo('info score cp 0 pv e2e4', 'b')?.score?.value, -0)).toBe(false);
    expect(parseInfo('info score mate 0 pv e2e4', 'b')?.score).toEqual({
      type: 'mate',
      value: 0,
      winner: 'w',
    });
  });
});

describe('UCI option discovery', () => {
  it('parses spin, check, combo, string, and button options', () => {
    expect(parseUciOption('option name Threads type spin default 1 min 1 max 512')).toEqual({
      name: 'Threads',
      option: { type: 'spin', value: 1, min: 1, max: 512 },
    });
    expect(parseUciOption('option name Ponder type check default false')).toEqual({
      name: 'Ponder',
      option: { type: 'check', value: false },
    });
    expect(
      parseUciOption('option name Style type combo default Solid var Solid var Normal var Risky'),
    ).toEqual({
      name: 'Style',
      option: { type: 'combo', value: 'Solid', choices: ['Solid', 'Normal', 'Risky'] },
    });
    expect(parseUciOption('option name SyzygyPath type string default <empty>')).toEqual({
      name: 'SyzygyPath',
      option: { type: 'string', value: '<empty>' },
    });
    expect(parseUciOption('option name Clear Hash type button')).toEqual({
      name: 'Clear Hash',
      option: { type: 'button' },
    });
  });

  it('rejects malformed or unbounded option advertisements', () => {
    expect(parseUciOption('option name Threads type spin default 1 min 8 max 2')).toBeUndefined();
    expect(parseUciOption('option name Ponder type check default maybe')).toBeUndefined();
    expect(
      parseUciOption('option name Style type combo default Missing var Solid'),
    ).toBeUndefined();
    expect(parseUciOption(`option name ${'x'.repeat(300)} type button`)).toBeUndefined();
    expect(parseUciOption('option name Mystery type unknown default 1')).toBeUndefined();
  });

  it('validates custom values against advertised ranges and choices', () => {
    const spin = { type: 'spin', value: 1, min: 1, max: 4 } as const;
    expect(validateCustomOption('Threads', spin, 2)).toEqual({
      command: 'setoption name Threads value 2',
      value: 2,
    });
    expect(typeof validateCustomOption('Threads', spin, 99)).toBe('string');
    expect(
      typeof validateCustomOption(
        'Style',
        { type: 'combo', value: 'Solid', choices: ['Solid', 'Risky'] },
        'Unknown',
      ),
    ).toBe('string');
    expect(typeof validateCustomOption('Clear Hash', { type: 'button' }, 'anything')).toBe(
      'string',
    );
    expect(typeof validateCustomOption('Path', { type: 'string', value: '' }, 'bad\nvalue')).toBe(
      'string',
    );
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
  it.each(['crash', 'bad-move', 'no-score', 'oversized', 'bound-only'])(
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
  it('merges separate statistics messages into the completed scored variation', async () => {
    const engine = fixture('split-statistics');
    try {
      await engine.start(settings, AbortSignal.timeout(3000));
      const result = await engine.analyze(DEFAULT_POSITION, AbortSignal.timeout(3000));
      expect(result.lines[0]).toMatchObject({
        depth: 8,
        seldepth: 12,
        nodes: 1500,
        nps: 30000,
        timeMs: 50,
        hashfull: 7,
      });
      expect(result.warnings).toEqual([]);
    } finally {
      await engine.close();
    }
  });
  it('treats NPS as unavailable when an engine reports nonzero nodes in zero time', async () => {
    const engine = fixture('instant-search');
    try {
      await engine.start(settings, AbortSignal.timeout(3000));
      const result = await engine.analyze(DEFAULT_POSITION, AbortSignal.timeout(3000));
      expect(result.lines[0]).toMatchObject({ nodes: 1500, timeMs: 0, nps: null });
      expect(result.warnings.join(' ')).toContain('zero search time');
    } finally {
      await engine.close();
    }
  });
  it('represents unreported measurements as null, not measured zero', async () => {
    const engine = fixture('missing-statistics');
    try {
      await engine.start(settings, AbortSignal.timeout(3000));
      const result = await engine.analyze(DEFAULT_POSITION, AbortSignal.timeout(3000));
      expect(result.lines[0]).toMatchObject({
        nodes: null,
        nps: null,
        timeMs: null,
        hashfull: null,
        seldepth: null,
      });
      expect(result.completedDepth).toBe(8);
      expect(result.warnings.join(' ')).toContain('Missing measurements are null, not zero');
    } finally {
      await engine.close();
    }
  });
  it('does not carry metrics from the previous position into a new search', async () => {
    const engine = fixture('reset-statistics');
    try {
      await engine.start(settings, AbortSignal.timeout(3000));
      expect(
        (await engine.analyze(DEFAULT_POSITION, AbortSignal.timeout(3000))).lines[0]?.nps,
      ).toBe(20000);
      const second = await engine.analyze(DEFAULT_POSITION, AbortSignal.timeout(3000));
      expect(second.lines[0]?.nps).toBeNull();
      expect(second.lines[0]?.nodes).toBeNull();
    } finally {
      await engine.close();
    }
  });
  it('keeps an explicitly reported zero distinct from an absent measurement', async () => {
    const engine = fixture('zero-statistics');
    try {
      await engine.start(settings, AbortSignal.timeout(3000));
      const result = await engine.analyze(DEFAULT_POSITION, AbortSignal.timeout(3000));
      expect(result.lines[0]).toMatchObject({ nodes: 0, nps: 0, timeMs: 0, hashfull: 0 });
      expect(result.warnings).toEqual([]);
    } finally {
      await engine.close();
    }
  });
  it('records an unknown completed depth without claiming a time limit was reached', async () => {
    const engine = fixture('missing-depth');
    try {
      await engine.start(settings, AbortSignal.timeout(3000));
      const result = await engine.analyze(DEFAULT_POSITION, AbortSignal.timeout(3000));
      expect(result.completedDepth).toBeNull();
      expect(result.depthLimited).toBe(true);
      expect(result.warnings.join(' ')).toContain('depth');
      expect(result.warnings.join(' ')).not.toContain('Time limit reached');
    } finally {
      await engine.close();
    }
  });
  it('retains each PV depth while applying the latest total search counters', async () => {
    const engine = fixture('multiple-lines');
    try {
      await engine.start({ ...settings, multiPv: 2 }, AbortSignal.timeout(3000));
      const result = await engine.analyze(DEFAULT_POSITION, AbortSignal.timeout(3000));
      expect(result.lines.map((line) => line.depth)).toEqual([8, 7]);
      expect(result.lines.map((line) => line.nodes)).toEqual([2000, 2000]);
      expect(result.completedDepth).toBe(7);
      expect(result.depthLimited).toBe(true);
    } finally {
      await engine.close();
    }
  });
  it("does not borrow another variation's depth when an engine omits it", async () => {
    const engine = fixture('unknown-pv-depth');
    try {
      await engine.start({ ...settings, multiPv: 3 }, AbortSignal.timeout(3000));
      const result = await engine.analyze(DEFAULT_POSITION, AbortSignal.timeout(3000));
      expect(result.lines.map((line) => line.depth)).toEqual([8, 7, null]);
      expect(result.completedDepth).toBeNull();
      expect(result.depthLimited).toBe(true);
    } finally {
      await engine.close();
    }
  });
  it('does not assign an unscoped depth record to multiple different variations', async () => {
    const engine = fixture('unscoped-multipv-depth');
    try {
      await engine.start({ ...settings, multiPv: 2 }, AbortSignal.timeout(3000));
      const result = await engine.analyze(DEFAULT_POSITION, AbortSignal.timeout(3000));
      expect(result.lines.map((line) => line.depth)).toEqual([8, null]);
      expect(result.lines.map((line) => line.seldepth)).toEqual([null, null]);
      expect(result.completedDepth).toBeNull();
    } finally {
      await engine.close();
    }
  });
  it('enforces a response deadline when an engine ignores its search time limit', async () => {
    const engine = fixture('stall');
    try {
      await engine.start(settings, AbortSignal.timeout(3000));
      await expect(
        engine.analyze(DEFAULT_POSITION, AbortSignal.timeout(8000), undefined, 10),
      ).rejects.toThrow('response timed out');
    } finally {
      await engine.close();
    }
  });
  it('terminates an engine that ignores quit', async () => {
    const engine = fixture('ignore-quit');
    await engine.start(settings, AbortSignal.timeout(3000));
    const start = Date.now();
    await engine.close();
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
