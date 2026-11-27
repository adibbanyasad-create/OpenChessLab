import { describe, expect, it } from 'vitest';
import { parseGame } from '../../src/shared/chess.js';
import { assembleReview } from '../../src/shared/review.js';
import { exportBlunderAnkiCsv, exportBlunderStudyPgn } from '../../src/shared/study.js';

describe('tactical blunder study and anki exports', () => {
  const game = parseGame('1. f3 e5 2. g4 Qh4# 0-1');
  const positions = [
    { score: { type: 'cp' as const, value: 20 }, depth: 10, depthLimited: false, bestMove: 'e2e4' },
    {
      score: { type: 'cp' as const, value: -10 },
      depth: 10,
      depthLimited: false,
      bestMove: 'e7e5',
    },
    {
      score: { type: 'cp' as const, value: -30 },
      depth: 10,
      depthLimited: false,
      bestMove: 'd2d4',
    },
    {
      score: { type: 'mate' as const, value: 1, winner: 'b' as const },
      depth: 10,
      depthLimited: false,
      bestMove: 'd8h4',
      san: ['Qh4#'],
    },
    {
      score: { type: 'mate' as const, value: 0, winner: 'b' as const },
      depth: 10,
      depthLimited: false,
      bestMove: null,
    },
  ];
  const review = assembleReview(
    game,
    positions,
    'test-engine',
    { depth: 10, threads: 1, hash: 16, multiPv: 1 },
    50,
  );

  it('exports blunder positions as PGN study chapters', () => {
    const pgn = exportBlunderStudyPgn(game, review);
    expect(pgn).toContain('[SetUp "1"]');
    expect(pgn).toContain('[FEN "');
    expect(pgn).toContain('played g4 which was a blunder');
    expect(pgn).toContain("Opponent's refutation: Qh4#.");
    expect(pgn).toContain('2. d4 *'); // The engine's recommended best move for White
  });

  it('exports blunder flashcards into Anki CSV format', () => {
    const csv = exportBlunderAnkiCsv(game, review);
    expect(csv).toContain('Front,Back,Tags');
    expect(csv).toContain('White to move');
    expect(csv).toContain('g4</span> (blunder)');
    expect(csv).toContain('Best move:');
    expect(csv).toContain('d4</span>');
    expect(csv).toContain('Opponent punishment:');
    expect(csv).toContain('Qh4#</strong>');
    expect(csv).toContain('openchesslab blunder-puzzle blunder white');
  });

  it('returns empty string when review has no blunders or mistakes', () => {
    const cleanGame = parseGame('1. e4 e5 *');
    const cleanPositions = [
      {
        score: { type: 'cp' as const, value: 20 },
        depth: 10,
        depthLimited: false,
        bestMove: 'e2e4',
      },
      {
        score: { type: 'cp' as const, value: 15 },
        depth: 10,
        depthLimited: false,
        bestMove: 'e7e5',
      },
      {
        score: { type: 'cp' as const, value: 10 },
        depth: 10,
        depthLimited: false,
        bestMove: 'g1f3',
      },
    ];
    const cleanReview = assembleReview(
      cleanGame,
      cleanPositions,
      'test-engine',
      { depth: 10, threads: 1, hash: 16, multiPv: 1 },
      10,
    );
    expect(exportBlunderStudyPgn(cleanGame, cleanReview)).toBe('');
    expect(exportBlunderAnkiCsv(cleanGame, cleanReview)).toBe('Front,Back,Tags\r\n');
  });
});
