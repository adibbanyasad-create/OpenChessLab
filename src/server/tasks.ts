import { availableParallelism, arch, platform } from 'node:os';
import { performance } from 'node:perf_hooks';
import { meanScoreCp, scoreDisagreementCp } from '../shared/chess.js';
import { assembleReview, type PositionAnalysis } from '../shared/review.js';
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
  const positions: PositionAnalysis[] = [];
  try {
    await engine.start(request, signal);
    for (const [ply, fen] of game.positions.entries()) {
      signal.throwIfAborted();
      progress({
        completed: ply,
        total: game.positions.length,
        message: `Reviewing position ${ply + 1} of ${game.positions.length}`,
      });
      const analysis = await engine.analyze(fen, signal, undefined, 1_500);
      positions.push({
        score: analysis.lines[0]!.score,
        depth: analysis.completedDepth,
        depthLimited: analysis.depthLimited,
        bestMove: analysis.bestMove,
      });
    }
    return {
      ...assembleReview(
        game,
        positions,
        config.id,
        { depth, threads, hash, multiPv },
        Math.round(performance.now() - started),
      ),
      warnings: [],
    };
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
