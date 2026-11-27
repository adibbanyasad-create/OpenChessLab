import { describe, expect, it } from 'vitest';
import {
  applyOfflineInfo,
  completedOfflineDepth,
  createOfflineSearch,
  parseUciInfo,
  snapshotOfflineLines,
} from '../../src/shared/uci-parse';

describe('browser-safe UCI info parsing', () => {
  it('normalizes centipawn scores to White perspective', () => {
    expect(parseUciInfo('info depth 8 score cp 31 pv e2e4', 'w')?.score).toEqual({
      type: 'cp',
      value: 31,
    });
    expect(parseUciInfo('info depth 8 score cp 31 pv e2e4', 'b')?.score).toEqual({
      type: 'cp',
      value: -31,
    });
  });
  it('keeps mate-zero winners explicit', () => {
    expect(parseUciInfo('info score mate 0 pv e2e4', 'w')?.score).toEqual({
      type: 'mate',
      value: 0,
      winner: 'b',
    });
    expect(parseUciInfo('info score mate -2 pv e2e4', 'b')?.score).toEqual({
      type: 'mate',
      value: 2,
      winner: 'w',
    });
  });
  it('ignores info string text and bound-only lines for scoring', () => {
    expect(parseUciInfo('info string depth 99 score cp 500', 'w')).toBeUndefined();
    const bound = parseUciInfo('info depth 8 score cp 31 lowerbound pv e2e4', 'w');
    expect(bound?.bound).toBe('lower');
    const state = createOfflineSearch();
    applyOfflineInfo(state, bound!, () => ['e4'], 1);
    expect(state.variations.size).toBe(0);
  });
  it('accumulates split statistics without borrowing depth across PVs', () => {
    const state = createOfflineSearch();
    for (const line of [
      'info depth 8 seldepth 12',
      'info nodes 1500 nps 30000 time 50 hashfull 7',
      'info depth 8 multipv 1 score cp 31 pv e2e4 e7e5',
      'info multipv 2 score cp 20 pv d2d4 d7d5',
    ]) {
      const parsed = parseUciInfo(line, 'w');
      if (parsed) applyOfflineInfo(state, parsed, (pv) => pv.map(() => 'e4'), 2);
    }
    const lines = snapshotOfflineLines(state);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ depth: 8, nodes: 1500, nps: 30000 });
    expect(lines[1]?.depth).toBeNull();
    expect(completedOfflineDepth(lines)).toBeNull();
  });
  it('rejects malformed multipv indices and invalid PV suffixes', () => {
    expect(parseUciInfo('info multipv 0 score cp 10 pv e2e4', 'w')).toBeUndefined();
    const parsed = parseUciInfo('info depth 8 score cp 10 pv e2e4 bogus e7e5', 'w');
    expect(parsed?.pv).toEqual(['e2e4']);
  });
});
