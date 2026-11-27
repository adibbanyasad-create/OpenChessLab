import { classifyMove, gamePhase, reviewAccuracy } from './chess.js';
import { openingFromMoves } from './openings.js';
import type {
  Classification,
  GameData,
  ReviewAnnotation,
  ReviewPlayerSummary,
  ReviewResult,
  ReviewSummary,
  Score,
} from './types.js';

// Shared review assembly: identical classification, summaries, and uncertainty
// semantics for server reviews and offline on-device reviews. The caller
// supplies one analyzed position per ply; this module never searches.

export interface PositionAnalysis {
  score: Score;
  depth: number | null;
  depthLimited: boolean;
  bestMove: string | null;
  pv?: string[];
  san?: string[];
}

export function emptyCounts(): Record<Classification, number> {
  return {
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
  };
}

export function annotateMove(
  move: GameData['moves'][number],
  before: PositionAnalysis,
  after: PositionAnalysis,
  totalPlies: number,
  openingPlies: number,
): ReviewAnnotation {
  const uci = move.from + move.to + (move.promotion ?? '');
  // A classification is only meaningful when both adjacent evaluations reached
  // their requested depth. Otherwise report the move as uncertain instead of
  // inventing a blunder/mistake from a timed-out search.
  const uncertain = before.depthLimited || after.depthLimited;
  const mateOpportunityMissed =
    before.score.type === 'mate' &&
    before.score.winner === move.color &&
    after.score.type !== 'mate';
  const sacrifice =
    !uncertain &&
    before.bestMove === uci &&
    before.score.type === 'cp' &&
    after.score.type === 'cp' &&
    Math.abs(after.score.value) > 150 &&
    (move.san.includes('x') || move.san.includes('+'));
  const classified = classifyMove(before.score, after.score, move.color, before.bestMove === uci, uncertain, {
    bookMove: move.ply <= openingPlies,
    mateOpportunityMissed,
    sacrifice,
  });
  const isError = ['inaccuracy', 'mistake', 'miss', 'blunder'].includes(classified.classification);
  const refutation =
    isError && after.bestMove && after.san?.length
      ? {
          punishmentMove: after.bestMove,
          punishmentSan: after.san[0]!,
          lineSan: after.san.slice(0, 5),
        }
      : undefined;
  return {
    ply: move.ply,
    san: move.san,
    bestMove: before.bestMove,
    phase: gamePhase(move.ply, totalPlies),
    bookMove: move.ply <= openingPlies,
    ...(refutation ? { refutation } : {}),
    ...classified,
  };
}

export function summarizePlayer(
  annotations: ReviewAnnotation[],
  colors: ('w' | 'b')[],
  color: 'w' | 'b',
): ReviewPlayerSummary {
  const moves = annotations.filter((_, index) => colors[index] === color);
  const losses = moves.map((annotation) => annotation.lossCp);
  const counts = emptyCounts();
  for (const annotation of moves) counts[annotation.classification]++;
  const confident = losses.filter((loss): loss is number => loss !== null);
  return {
    color,
    moves: moves.length,
    confidentMoves: confident.length,
    uncertainMoves: moves.length - confident.length,
    averageLossCp: confident.length
      ? Math.round((confident.reduce((sum, loss) => sum + loss, 0) / confident.length) * 10) / 10
      : null,
    accuracy: reviewAccuracy(losses),
    counts,
  };
}

export function assembleReview(
  game: GameData,
  positions: PositionAnalysis[],
  engineId: string,
  settings: ReviewResult['settings'],
  elapsedMs: number,
): ReviewResult {
  if (positions.length !== game.positions.length)
    throw new Error('Review needs exactly one analyzed position per ply.');
  const opening = openingFromMoves(game.moves);
  const openingPlies = opening?.plies ?? 0;
  const totalPlies = game.positions.length - 1;
  const scores = positions.map((analysis, ply) => ({
    ply,
    score: analysis.score,
    depth: analysis.depth,
    depthLimited: analysis.depthLimited,
  }));
  const annotations: ReviewAnnotation[] = [];
  for (const [index, move] of game.moves.entries()) {
    const before = positions[index];
    const after = positions[index + 1];
    if (!before || !after) throw new Error('Review positions are incomplete.');
    annotations.push(annotateMove(move, before, after, totalPlies, openingPlies));
  }
  const colors = game.moves.map((move) => move.color);
  const summary: ReviewSummary = {
    ...(opening ? { opening } : {}),
    white: summarizePlayer(annotations, colors, 'w'),
    black: summarizePlayer(annotations, colors, 'b'),
  };
  return { engineId, settings, scores, annotations, summary, elapsedMs };
}
