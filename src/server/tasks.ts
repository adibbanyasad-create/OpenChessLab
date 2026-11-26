import { availableParallelism, arch, platform } from 'node:os';
import { performance } from 'node:perf_hooks';
import {
  classifyMove,
  gamePhase,
  meanScoreCp,
  reviewAccuracy,
  scoreDisagreementCp,
} from '../shared/chess.js';
import { openingFromMoves } from '../shared/openings.js';
import { identifySuite } from '../shared/suites.js';
import type { AnalysisRequest, BenchmarkRequest, ReviewRequest } from '../shared/schemas.js';
import type { BenchmarkResult, GameData, JobProgress, ReviewResult } from '../shared/types.js';
import type { EngineConfig } from './config.js';
import { UciEngine } from './uci.js';
import { APP_VERSION } from './version.js';

type Progress = (progress: JobProgress) => void;

export async function analyzePosition(
  config: EngineConfig,
  request: AnalysisRequest,
  signal: AbortSignal,
  progress: Progress,
) {
  const engine = new UciEngine(config);
  try {
    await engine.start(request, signal);
    return await engine.analyze(request.fen, signal, (lines) => {
      progress({
        completed: 0,
        total: 1,
        message: lines[0]?.depth == null ? 'Searching...' : `Searching depth ${lines[0].depth}...`,
        lines,
      });
    });
  } finally {
    await engine.close();
  }
}

export async function reviewGame(
  config: EngineConfig,
  request: ReviewRequest,
  game: GameData,
  signal: AbortSignal,
  progress: Progress,
): Promise<ReviewResult> {
  const engine = new UciEngine(config);
  const started = performance.now();
  const { depth, threads, hash, multiPv } = request;
  const result: ReviewResult = {
    engineId: config.id,
    settings: { depth, threads, hash, multiPv },
    scores: [],
    annotations: [],
    elapsedMs: 0,
  };
  try {
    await engine.start(request, signal);
    const opening = openingFromMoves(game.moves);
    let previous: Awaited<ReturnType<UciEngine['analyze']>> | undefined;
    for (const [ply, fen] of game.positions.entries()) {
      signal.throwIfAborted();
      progress({
        completed: ply,
        total: game.positions.length,
        message: `Reviewing position ${ply + 1} of ${game.positions.length}`,
      });
      const analysis = await engine.analyze(fen, signal, undefined, 1_500);
      const score = analysis.lines[0]!.score;
      result.scores.push({
        ply,
        score,
        depth: analysis.completedDepth,
        depthLimited: analysis.depthLimited,
      });
      const move = game.moves[ply - 1];
      if (previous && move) {
        const uci = move.from + move.to + (move.promotion ?? '');
        // A classification is only meaningful when both adjacent evaluations reached
        // their requested depth. Otherwise report the move as uncertain instead of
        // inventing a blunder/mistake from a timed-out search.
        const uncertain = previous.depthLimited || analysis.depthLimited;
        const before = previous.lines[0]!.score;
        const mateOpportunityMissed =
          before.type === 'mate' && before.winner === move.color && score.type !== 'mate';
        const sacrifice =
          !uncertain &&
          previous.bestMove === uci &&
          before.type === 'cp' &&
          score.type === 'cp' &&
          Math.abs(score.value) > 150 &&
          (move.san.includes('x') || move.san.includes('+'));
        result.annotations.push({
          ply,
          san: move.san,
          bestMove: previous.bestMove,
          phase: gamePhase(ply, game.positions.length - 1),
          bookMove: ply <= (opening?.plies ?? 0),
          ...classifyMove(before, score, move.color, previous.bestMove === uci, uncertain, {
            bookMove: ply <= (opening?.plies ?? 0),
            mateOpportunityMissed,
            sacrifice,
          }),
        });
      }
      previous = analysis;
    }
    const summarize = (color: 'w' | 'b') => {
      const moves = result.annotations.filter((_, index) => game.moves[index]?.color === color);
      const losses = moves.map((annotation) => annotation.lossCp);
      const counts = {
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
      for (const annotation of moves) counts[annotation.classification]++;
      const confident = losses.filter((loss): loss is number => loss !== null);
      return {
        color,
        moves: moves.length,
        confidentMoves: confident.length,
        uncertainMoves: moves.length - confident.length,
        averageLossCp: confident.length
          ? Math.round((confident.reduce((sum, loss) => sum + loss, 0) / confident.length) * 10) /
            10
          : null,
        accuracy: reviewAccuracy(losses),
        counts,
      };
    };
    result.summary = {
      ...(opening ? { opening } : {}),
      white: summarize('w'),
      black: summarize('b'),
    };
    result.elapsedMs = Math.round(performance.now() - started);
    return result;
  } finally {
    await engine.close();
  }
}

export async function runBenchmark(
  configs: EngineConfig[],
  request: BenchmarkRequest,
  signal: AbortSignal,
  progress: Progress,
  id: string,
): Promise<BenchmarkResult> {
  const { depth, threads, hash, multiPv } = request;
  const suite = identifySuite(request.positions);
  const result: BenchmarkResult = {
    id,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    settings: { depth, threads, hash, multiPv },
    rows: [],
    ...(suite ? { suite: { id: suite.id, version: suite.version, sha256: suite.sha256 } } : {}),
    environment: {
      platform: platform(),
      arch: arch(),
      cpus: availableParallelism(),
      node: process.version,
    },
  };
  const total = configs.length * request.positions.length;
  // Sequential execution prevents the application from measuring its own CPU contention.
  for (const config of configs) {
    signal.throwIfAborted();
    const engine = new UciEngine(config);
    try {
      await engine.start(request, signal);
      for (const position of request.positions) {
        progress({
          completed: result.rows.length,
          total,
          message: `${config.name} / ${position.name}`,
        });
        const analysis = await engine.analyze(position.fen, signal, undefined, 10_000);
        const line = analysis.lines[0]!;
        result.rows.push({
          engineId: config.id,
          engineName: analysis.engineName,
          position: position.name,
          fen: analysis.fen,
          depth: analysis.completedDepth,
          requestedDepth: request.depth,
          depthLimited: analysis.depthLimited,
          nodes: line.nodes,
          nps: line.nps,
          engineTimeMs: line.timeMs,
          wallTimeMs: analysis.wallTimeMs,
          score: line.score,
          bestMove: analysis.bestMove,
          effectiveOptions: analysis.effectiveOptions,
          warnings: analysis.warnings,
        });
      }
    } finally {
      await engine.close();
    }
  }
  const byPosition = new Map<string, (typeof result.rows)[number][]>();
  for (const row of result.rows) {
    const group = byPosition.get(row.fen) ?? [];
    group.push(row);
    byPosition.set(row.fen, group);
  }
  result.comparisons = Object.fromEntries(
    [...byPosition].map(([fen, rows]) => {
      const scores = rows.map((row) => row.score);
      return [
        fen,
        {
          meanCp: meanScoreCp(scores),
          disagreementCp: scoreDisagreementCp(scores),
          mateCount: scores.filter((score) => score.type === 'mate').length,
          missingScoreCount: 0,
        },
      ];
    }),
  );
  return result;
}
