import { formatScore } from './chess.js';
import type { BenchmarkResult } from './types.js';

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
    ]
      .map(csvCell)
      .join(','),
  );
  return [headers.join(','), ...rows].join('\r\n') + '\r\n';
}
