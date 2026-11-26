import { z } from 'zod';
import type { BenchmarkResult } from '../shared/types';

const KEY = 'ocl-benchmarks-v1';
const MAX_RUNS = 20;
const MAX_BYTES = 1_000_000;
const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const metric = counter.nullable();
const score = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cp'), value: z.number().int().min(-100_000).max(100_000) }).strict(),
  z
    .object({
      type: z.literal('mate'),
      value: z.number().int().min(-100_000).max(100_000),
      winner: z.enum(['w', 'b']),
    })
    .strict(),
]);

const resultSchema: z.ZodType<BenchmarkResult> = z
  .object({
    id: z.uuid(),
    appVersion: z.string().min(1).max(64).optional(),
    createdAt: z.iso.datetime({ offset: true }),
    settings: z
      .object({
        depth: z.number().int().min(1).max(24),
        threads: z.number().int().min(1).max(4),
        hash: z.number().int().min(16).max(512),
        multiPv: z.literal(1),
      })
      .strict(),
    rows: z
      .array(
        z
          .object({
            engineId: z.string().regex(/^[a-z0-9-]{1,64}$/),
            engineName: z.string().min(1).max(120),
            position: z.string().min(1).max(80),
            fen: z.string().min(15).max(150),
            depth: z.number().int().min(0).max(1024).nullable(),
            requestedDepth: z.number().int().min(1).max(24),
            depthLimited: z.boolean(),
            nodes: metric,
            nps: metric,
            engineTimeMs: metric,
            wallTimeMs: counter,
            score,
            bestMove: z
              .string()
              .regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)
              .nullable(),
            effectiveOptions: z.record(z.string().min(1).max(64), counter),
            warnings: z.array(z.string().max(500)).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(32),
    environment: z
      .object({
        platform: z.string().min(1).max(32),
        arch: z.string().min(1).max(32),
        cpus: z.number().int().min(1).max(65_536),
        node: z.string().min(1).max(64),
      })
      .strict(),
  })
  .strict();

const historySchema = z
  .object({ version: z.literal(1), runs: z.array(resultSchema).max(MAX_RUNS) })
  .strict();
export interface BenchmarkHistory {
  runs: BenchmarkResult[];
  persistent: boolean;
  warning: string;
}
let current: BenchmarkHistory | undefined;

export function readBenchmarkHistory(): BenchmarkHistory {
  if (current) return current;
  try {
    const raw = localStorage.getItem(KEY);
    if (
      raw !== null &&
      (raw.length > MAX_BYTES || new TextEncoder().encode(raw).length > MAX_BYTES)
    )
      throw new Error('History is too large.');
    const runs = raw === null ? [] : historySchema.parse(JSON.parse(raw)).runs;
    current = { runs, persistent: true, warning: '' };
  } catch {
    current = {
      runs: [],
      persistent: false,
      warning:
        'Saved history is unavailable or invalid. You can still run experiments and export their results.',
    };
  }
  return current;
}

export function saveBenchmarkRun(result: BenchmarkResult): BenchmarkHistory {
  const validated = resultSchema.parse(result);
  const runs = [
    validated,
    ...readBenchmarkHistory().runs.filter((run) => run.id !== validated.id),
  ].slice(0, MAX_RUNS);
  current = { runs, persistent: false, warning: '' };
  try {
    const serialized = JSON.stringify({ version: 1, runs });
    if (new TextEncoder().encode(serialized).length > MAX_BYTES)
      throw new Error('History is too large.');
    localStorage.setItem(KEY, serialized);
    current.persistent = true;
  } catch {
    current.warning =
      'Browser storage is unavailable or full. These results are kept for this session only; export them before reloading.';
  }
  return current;
}

export function clearBenchmarkHistory(): BenchmarkHistory {
  try {
    localStorage.removeItem(KEY);
    current = { runs: [], persistent: true, warning: '' };
  } catch {
    current = {
      ...readBenchmarkHistory(),
      persistent: false,
      warning:
        "Could not clear saved history. Use your browser's site-data settings to remove stored results.",
    };
  }
  return current;
}
