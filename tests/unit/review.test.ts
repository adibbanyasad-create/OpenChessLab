import { describe, expect, it } from 'vitest';
import { parseGame } from '../../src/shared/chess';
import {
  annotateMove,
  assembleReview,
  emptyCounts,
  summarizePlayer,
} from '../../src/shared/review';
import type { PositionAnalysis } from '../../src/shared/review';

const cp = (value: number, bestMove: string | null = 'e2e4'): PositionAnalysis => ({
  score: { type: 'cp', value },
  depth: 10,
  depthLimited: false,
  bestMove,
});

describe('shared review assembly', () => {
  it('builds empty label totals for every classification', () => {
    expect(emptyCounts()).toEqual({
      brilliant: 0,
      great: 0,
      best: 0,
      excellent: 0,
      good: 0,
      book: 0,
      inaccuracy: 0,
      mistake: 0,
      miss: 0,
      blunder: 0,
    });
  });
  it('marks moves uncertain when either adjacent evaluation is unconfirmed', () => {
    const game = parseGame('1. e4 e5 *');
    const move = game.moves[0]!;
    const annotation = annotateMove(
      move,
      { ...cp(20, 'd2d4'), depthLimited: true },
      cp(15),
      game.positions.length - 1,
      0,
    );
    expect(annotation.uncertain).toBe(true);
    expect(annotation.lossCp).toBeNull();
  });
  it('requires exactly one analyzed position per ply', () => {
    const game = parseGame('1. e4 e5 *');
    expect(() =>
      assembleReview(
        game,
        [cp(10)],
        'test-engine',
        {
          depth: 10,
          threads: 1,
          hash: 16,
          multiPv: 1,
        },
        5,
      ),
    ).toThrow('exactly one analyzed position per ply');
  });
  it('assembles scores, annotations, and per-side summaries identically everywhere', () => {
    const game = parseGame('1. f3 e5 2. g4 Qh4# 0-1');
    const positions = [
      cp(20, 'e2e4'),
      cp(-10, 'e7e5'),
      cp(-30, 'd7d5'),
      cp(-200, 'd8h4'),
      {
        score: { type: 'mate' as const, value: 0, winner: 'b' as const },
        depth: 10,
        depthLimited: false,
        bestMove: null,
      },
    ];
    const result = assembleReview(
      game,
      positions,
      'test-engine',
      { depth: 10, threads: 1, hash: 16, multiPv: 1 },
      42,
    );
    expect(result.scores).toHaveLength(5);
    expect(result.annotations).toHaveLength(4);
    expect(result.annotations.map((annotation) => annotation.ply)).toEqual([1, 2, 3, 4]);
    expect(result.annotations[3]?.san).toBe('Qh4#');
    expect(result.summary?.white.moves).toBe(2);
    expect(result.summary?.black.moves).toBe(2);
    expect(result.summary?.white.confidentMoves).toBe(2);
    expect(result.summary?.black.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.elapsedMs).toBe(42);
    expect(result.engineId).toBe('test-engine');
  });
  it('summarizes confident and uncertain moves per side without inventing losses', () => {
    const game = parseGame('1. e4 e5 *');
    const annotations = [
      annotateMove(game.moves[0]!, cp(20), cp(15), game.positions.length - 1, 99),
      annotateMove(
        game.moves[1]!,
        { ...cp(15, 'g8f6'), depthLimited: true },
        { ...cp(10), depthLimited: true },
        game.positions.length - 1,
        0,
      ),
    ];
    const white = summarizePlayer(annotations, ['w', 'b'], 'w');
    const black = summarizePlayer(annotations, ['w', 'b'], 'b');
    expect(white).toMatchObject({ moves: 1, confidentMoves: 1, uncertainMoves: 0 });
    expect(white.counts.book).toBe(1);
    expect(black).toMatchObject({ moves: 1, confidentMoves: 0, uncertainMoves: 1 });
    expect(black.averageLossCp).toBeNull();
    expect(black.accuracy).toBeNull();
  });
});
