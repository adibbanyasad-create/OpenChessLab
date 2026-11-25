import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  BENCHMARK_POSITIONS,
  branchGame,
  classifyMove,
  DEFAULT_POSITION,
  formatScore,
  gameFromFen,
  OPERA_PGN,
  parseGame,
  pvToSan,
  scoreCp,
  scoreDescription,
  validPosition,
} from '../../src/shared/chess';

describe('PGN and FEN', () => {
  it('imports the complete Opera Game and its terminal checkmate', () => {
    const game = parseGame(OPERA_PGN);
    expect(game.moves).toHaveLength(33);
    expect(game.positions).toHaveLength(34);
    expect(game.headers.White).toBe('Paul Morphy');
    expect(new Chess(game.positions.at(-1)).isCheckmate()).toBe(true);
    expect(game.moves.at(-1)?.san).toBe('Rd8#');
  });
  it('uses the real Opera position in the benchmark suite', () => {
    expect(BENCHMARK_POSITIONS[1]?.fen).toBe(parseGame(OPERA_PGN).positions[16]);
    for (const { fen } of BENCHMARK_POSITIONS) expect(() => validPosition(fen)).not.toThrow();
  });
  it('retains nonstandard FEN positions through a PGN round trip', () => {
    const fen = '8/5pk1/6p1/3R3p/7P/5KP1/8/6r1 b - - 0 42';
    const game = gameFromFen(fen);
    expect(game.initialFen).toBe(fen);
    expect(game.moves).toHaveLength(0);
    expect(parseGame(game.pgn).initialFen).toBe(fen);
  });
  it('creates a valid empty initial-position game', () => {
    const game = gameFromFen(DEFAULT_POSITION);
    expect(game.positions).toEqual([DEFAULT_POSITION]);
    expect(game.moves).toEqual([]);
  });
  it.each(['', '1. potato', '[White "Broken"]\n1. e4 e5 2. Ke8', 'x'.repeat(256_001)])(
    'rejects malformed or oversized PGN',
    (pgn) => {
      expect(() => parseGame(pgn)).toThrow();
    },
  );
  it.each([
    '8/8/8/8/8/8/8/8 w - - 0 1',
    '8/8/8/8/8/8/4k3/4K3 w - - 0 1',
    DEFAULT_POSITION + '\nquit',
  ])('rejects invalid positions', (fen) => {
    expect(() => validPosition(fen)).toThrow();
  });
  it('replaces the old continuation when branching, and clears the old result', () => {
    const branch = branchGame(parseGame(OPERA_PGN), 2, 'f1c4');
    expect(branch.moves.map((move) => move.san)).toEqual(['e4', 'e5', 'Bc4']);
    expect(branch.headers.Result).toBe('*');
    expect(branch.positions).toHaveLength(4);
  });
  it('rejects illegal moves', () => {
    expect(() => branchGame(gameFromFen(DEFAULT_POSITION), 0, 'e2e5')).toThrow();
  });
  it('rejects multiple games rather than merging their moves', () => {
    expect(() => parseGame('1. e4 e5 * 1. d4 d5 *')).toThrow('one game at a time');
    expect(() => parseGame('[Event "One"]\n\n1. e4 *\n\n[Event "Two"]\n\n1. d4 *')).toThrow(
      'one game at a time',
    );
  });
  it('rejects impossible piece counts and inconsistent castling rights', () => {
    expect(() => validPosition('4k3/8/8/8/8/8/8/4K3 w KQ - 0 1')).toThrow('castling rights');
    expect(() => validPosition('4k3/8/8/8/8/P7/PPPPPPPP/4K3 w - - 0 1')).toThrow('too many');
    expect(() => validPosition('4k3/8/8/8/NNNNNNNN/PPPPPPPP/4K3/8 w - - 0 1')).toThrow('too many');
  });
  it('handles castling, en passant, and underpromotion', () => {
    expect(
      branchGame(gameFromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'), 0, 'e1g1').moves[0]?.san,
    ).toBe('O-O');
    const ep = branchGame(gameFromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1'), 0, 'e5d6');
    expect(ep.moves[0]?.san).toBe('exd6');
    expect(new Chess(ep.positions[1]).get('d5')).toBeUndefined();
    expect(
      branchGame(gameFromFen('7k/P7/6K1/8/8/8/8/8 w - - 0 1'), 0, 'a7a8n').moves[0]?.promotion,
    ).toBe('n');
  });
  it('converts a legal PV prefix and stops at an invalid continuation', () => {
    expect(pvToSan(DEFAULT_POSITION, ['e2e4', 'e7e5', 'g1f3', 'a8a1', 'b8c6'])).toEqual([
      'e4',
      'e5',
      'Nf3',
    ]);
  });
});

describe('score semantics', () => {
  it('formats centipawns and terminal mate winners unambiguously', () => {
    expect(formatScore({ type: 'cp', value: 35 })).toBe('+0.35');
    expect(formatScore({ type: 'cp', value: -100 })).toBe('-1.00');
    expect(formatScore({ type: 'cp', value: 0 })).toBe('0.00');
    expect(formatScore({ type: 'mate', value: 0, winner: 'b' })).toBe('-M0');
    expect(formatScore({ type: 'mate', value: 3, winner: 'w' })).toBe('M3');
    expect(formatScore()).toBe('\u2014');
  });
  it.each([
    [49, 'good'],
    [50, 'inaccuracy'],
    [99, 'inaccuracy'],
    [100, 'mistake'],
    [199, 'mistake'],
    [200, 'blunder'],
  ] as const)('classifies a %i cp White loss as %s', (loss, kind) => {
    expect(
      classifyMove({ type: 'cp', value: 100 }, { type: 'cp', value: 100 - loss }, 'w'),
    ).toEqual({ classification: kind, lossCp: loss });
  });
  it('normalizes losses for Black, ignores apparent gains, and identifies the best move', () => {
    expect(
      classifyMove({ type: 'cp', value: -50 }, { type: 'cp', value: 160 }, 'b').classification,
    ).toBe('blunder');
    expect(classifyMove({ type: 'cp', value: 0 }, { type: 'cp', value: 80 }, 'w').lossCp).toBe(0);
    expect(
      classifyMove({ type: 'cp', value: 100 }, { type: 'cp', value: -300 }, 'w', true),
    ).toEqual({ classification: 'best', lossCp: 0 });
  });
  it('does not confuse zero-distance mate with a draw', () => {
    expect(scoreCp({ type: 'mate', value: 0, winner: 'b' })).toBe(-10_000);
    expect(scoreDescription({ type: 'mate', value: 0, winner: 'b' })).toContain('Black');
    expect(
      classifyMove(
        { type: 'mate', value: 3, winner: 'w' },
        { type: 'mate', value: 1, winner: 'w' },
        'w',
      ).lossCp,
    ).toBe(0);
  });
});
