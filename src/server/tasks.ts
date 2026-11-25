import { availableParallelism, arch, platform } from 'node:os';
import { performance } from 'node:perf_hooks';
import { classifyMove } from '../shared/chess.js';
import type { AnalysisRequest, BenchmarkRequest, ReviewRequest } from '../shared/schemas.js';
import type { BenchmarkResult, GameData, JobProgress, ReviewResult } from '../shared/types.js';
import type { EngineConfig } from './config.js';
import { UciEngine } from './uci.js';

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
        message: `Searching depth ${lines[0]?.depth ?? 0}...`,
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
        result.annotations.push({
          ply,
          san: move.san,
          bestMove: previous.bestMove,
          ...classifyMove(previous.lines[0]!.score, score, move.color, previous.bestMove === uci),
        });
      }
      previous = analysis;
    }
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
  const result: BenchmarkResult = {
    id,
    createdAt: new Date().toISOString(),
    settings: { depth, threads, hash, multiPv },
    rows: [],
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
          fen: position.fen,
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
  return result;
}
