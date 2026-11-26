import { formatScore } from './chess.js';
import type { BenchmarkResult, ReviewResult } from './types.js';

export function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const text =
    typeof value === 'string' && /^(?:[\s\uFEFF]*[=+\-@]|[\t\r\n])/.test(value)
      ? `'${value}`
      : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function benchmarkCsv(result: BenchmarkResult): string {
  const headers = [
    'run_id',
    'created_at',
    'engine_id',
    'engine_name',
    'position',
    'fen',
    'requested_depth',
    'completed_depth',
    'depth_limited',
    'nodes',
    'nps',
    'engine_time_ms',
    'wall_time_ms',
    'evaluation_white',
    'best_move',
    'requested_threads',
    'requested_hash_mb',
    'effective_options',
    'warnings',
    'platform',
    'arch',
    'logical_cpus',
    'node',
    'app_version',
  ];
  const rows = result.rows.map((row) =>
    [
      result.id,
      result.createdAt,
      row.engineId,
      row.engineName,
      row.position,
      row.fen,
      row.requestedDepth,
      row.depth,
      row.depthLimited,
      row.nodes,
      row.nps,
      row.engineTimeMs,
      row.wallTimeMs,
      formatScore(row.score),
      row.bestMove,
      result.settings.threads,
      result.settings.hash,
      JSON.stringify(row.effectiveOptions),
      row.warnings.join('; '),
      result.environment.platform,
      result.environment.arch,
      result.environment.cpus,
      result.environment.node,
      result.appVersion ?? null,
    ]
      .map(csvCell)
      .join(','),
  );
  return [headers.join(','), ...rows].join('\r\n') + '\r\n';
}

export function reviewCsv(result: ReviewResult): string {
  const headers = [
    'ply',
    'evaluation_white',
    'move',
    'classification',
    'loss_cp',
    'uncertain',
    'phase',
    'book_move',
    'best_move',
  ];
  const annotationByPly = new Map(
    result.annotations.map((annotation) => [annotation.ply, annotation]),
  );
  const rows = result.scores.map((point) => {
    const annotation = annotationByPly.get(point.ply);
    return [
      point.ply,
      formatScore(point.score),
      annotation?.san ?? null,
      annotation?.classification ?? null,
      annotation?.lossCp ?? null,
      annotation ? annotation.uncertain : null,
      annotation?.phase ?? null,
      annotation ? annotation.bookMove : null,
      annotation?.bestMove ?? null,
    ]
      .map(csvCell)
      .join(',');
  });
  return [headers.join(','), ...rows].join('\r\n') + '\r\n';
}
