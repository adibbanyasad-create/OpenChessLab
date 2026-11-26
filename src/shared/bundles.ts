import { z } from 'zod';
import { fenSchema } from './schemas.js';
import { sha256Hex } from './sha256.js';
import type {
  BenchmarkComparison,
  BenchmarkResult,
  BenchmarkRow,
  Score,
  SearchSettings,
} from './types.js';

/**
 * ExperimentBundle v1: a self-describing, tamper-evident record of one
 * benchmark run. Anyone holding the bundle can re-run the same suite +
 * settings and compare measured rows, or verify the SHA-256 to detect edits.
 *
 * Design rules:
 * - Missing measurements stay null; the hash covers them as null.
 * - No Elo, no strength claims, no inferred statistics — only recorded data.
 * - The `sha256` covers everything except itself (canonical JSON, fixed keys).
 */

export const BUNDLE_VERSION = 1 as const;

export interface BundleEngine {
  id: string;
  name: string;
}

export interface BundleSuiteRef {
  id: string;
  version: number;
  sha256: string;
  positions: { name: string; fen: string }[];
}

export interface BundleEnvironment {
  platform: string;
  arch: string;
  cpus: number;
  node: string;
}

export interface ExperimentBundle {
  format: 'openchesslab-experiment-bundle';
  bundleVersion: 1;
  runId: string;
  appVersion: string | null;
  createdAt: string;
  suite: BundleSuiteRef | null;
  engines: BundleEngine[];
  settings: SearchSettings;
  environment: BundleEnvironment;
  result: BenchmarkResult;
  notes: string | null;
  sha256: string;
}

const positionSchema = z.object({ name: z.string(), fen: z.string() }).strict();

const suiteRefSchema = z
  .object({
    id: z.string().min(1).max(64),
    version: z.number().int().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    positions: z.array(positionSchema).min(1).max(8),
  })
  .strict();

const scoreSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cp'), value: z.number().int() }).strict(),
  z
    .object({
      type: z.literal('mate'),
      value: z.number().int(),
      winner: z.enum(['w', 'b']),
    })
    .strict(),
]);

const rowSchema = z
  .object({
    engineId: z.string(),
    engineName: z.string(),
    position: z.string(),
    fen: fenSchema,
    depth: z.number().int().nullable(),
    requestedDepth: z.number().int(),
    depthLimited: z.boolean(),
    nodes: z.number().int().nonnegative().nullable(),
    nps: z.number().int().nonnegative().nullable(),
    engineTimeMs: z.number().int().nonnegative().nullable(),
    wallTimeMs: z.number().int().nonnegative(),
    score: scoreSchema,
    bestMove: z
      .string()
      .regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/)
      .nullable(),
    effectiveOptions: z.record(z.string(), z.number().int().nonnegative()),
    warnings: z.array(z.string()),
  })
  .strict()
  .passthrough();

const comparisonSchema = z
  .object({
    meanCp: z.number().nullable(),
    disagreementCp: z.number().int().nonnegative().nullable(),
    mateCount: z.number().int().nonnegative(),
    missingScoreCount: z.number().int().nonnegative(),
  })
  .strict()
  .passthrough();

const resultSchema = z
  .object({
    id: z.string(),
    appVersion: z.string().optional(),
    createdAt: z.string(),
    settings: z
      .object({
        depth: z.number().int(),
        threads: z.number().int(),
        hash: z.number().int(),
        multiPv: z.number().int(),
      })
      .strict()
      .passthrough(),
    rows: z.array(rowSchema).min(1),
    comparisons: z.record(z.string(), comparisonSchema).optional(),
    suite: z
      .object({
        id: z.string(),
        version: z.number().int(),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .strict()
      .optional(),
    environment: z
      .object({
        platform: z.string(),
        arch: z.string(),
        cpus: z.number().int(),
        node: z.string(),
      })
      .strict()
      .passthrough(),
  })
  .strict()
  .passthrough();

export const bundleSchema: z.ZodType<ExperimentBundle> = z
  .object({
    format: z.literal('openchesslab-experiment-bundle'),
    bundleVersion: z.literal(1),
    runId: z.uuid(),
    appVersion: z.string().min(1).max(64).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    suite: suiteRefSchema.nullable(),
    engines: z
      .array(z.object({ id: z.string().min(1).max(64), name: z.string().min(1).max(120) }).strict())
      .min(1)
      .max(4),
    settings: z
      .object({
        depth: z.number().int().min(1).max(24),
        threads: z.number().int().min(1).max(4),
        hash: z.number().int().min(16).max(512),
        multiPv: z.literal(1),
      })
      .strict()
      .passthrough(),
    environment: z
      .object({
        platform: z.string().min(1).max(32),
        arch: z.string().min(1).max(32),
        cpus: z.number().int().min(1).max(65_536),
        node: z.string().min(1).max(64),
      })
      .strict(),
    result: resultSchema,
    notes: z.string().max(2000).nullable(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

/** Canonical payload: every field except `sha256`, in fixed key order. */
export function bundlePayload(bundle: Omit<ExperimentBundle, 'sha256'>): string {
  return JSON.stringify({
    format: bundle.format,
    bundleVersion: bundle.bundleVersion,
    runId: bundle.runId,
    appVersion: bundle.appVersion,
    createdAt: bundle.createdAt,
    suite: bundle.suite,
    engines: bundle.engines,
    settings: bundle.settings,
    environment: bundle.environment,
    result: bundle.result,
    notes: bundle.notes,
  });
}

export function bundleSha256(bundle: Omit<ExperimentBundle, 'sha256'>): string {
  return sha256Hex(bundlePayload(bundle));
}

/** Rebuild a score in canonical key order. */
function canonicalScore(score: Score): Score {
  return score.type === 'cp'
    ? { type: 'cp', value: score.value }
    : { type: 'mate', value: score.value, winner: score.winner };
}

/** Rebuild settings in canonical key order, preserving validated extras. */
function canonicalSettings(settings: SearchSettings): SearchSettings {
  const { depth, threads, hash, multiPv, options } = settings;
  return {
    depth,
    threads,
    hash,
    multiPv,
    ...(options === undefined ? {} : { options: { ...options } }),
  };
}

/** Rebuild one benchmark row in canonical key order. */
function canonicalRow(row: BenchmarkRow): BenchmarkRow {
  return {
    engineId: row.engineId,
    engineName: row.engineName,
    position: row.position,
    fen: row.fen,
    depth: row.depth,
    requestedDepth: row.requestedDepth,
    depthLimited: row.depthLimited,
    nodes: row.nodes,
    nps: row.nps,
    engineTimeMs: row.engineTimeMs,
    wallTimeMs: row.wallTimeMs,
    score: canonicalScore(row.score),
    bestMove: row.bestMove,
    effectiveOptions: { ...row.effectiveOptions },
    warnings: [...row.warnings],
  };
}

function canonicalComparison(comparison: BenchmarkComparison): BenchmarkComparison {
  return {
    meanCp: comparison.meanCp,
    disagreementCp: comparison.disagreementCp,
    mateCount: comparison.mateCount,
    missingScoreCount: comparison.missingScoreCount,
  };
}

/**
 * Rebuild a benchmark result in canonical key order at every level, so the
 * content hash is stable no matter what key order the producer emitted.
 * `verifyBundle` re-parses through the same schema, which emits the same
 * order — that is what makes round-trips verify.
 */
export function canonicalResult(result: BenchmarkResult): BenchmarkResult {
  return {
    id: result.id,
    ...(result.appVersion === undefined ? {} : { appVersion: result.appVersion }),
    createdAt: result.createdAt,
    settings: canonicalSettings(result.settings),
    rows: result.rows.map(canonicalRow),
    ...(result.comparisons === undefined
      ? {}
      : {
          comparisons: Object.fromEntries(
            Object.entries(result.comparisons).map(([fen, comparison]) => [
              fen,
              canonicalComparison(comparison),
            ]),
          ),
        }),
    ...(result.suite === undefined
      ? {}
      : {
          suite: {
            id: result.suite.id,
            version: result.suite.version,
            sha256: result.suite.sha256,
          },
        }),
    environment: {
      platform: result.environment.platform,
      arch: result.environment.arch,
      cpus: result.environment.cpus,
      node: result.environment.node,
    },
  };
}

/**
 * Build a bundle from a completed benchmark result. Never invents data.
 */
export function createBundle(
  result: BenchmarkResult,
  options: {
    suite?: {
      id: string;
      version: number;
      sha256: string;
      positions: { name: string; fen: string }[];
    } | null;
    notes?: string | null;
  } = {},
): ExperimentBundle {
  const engines = [...new Map(result.rows.map((row) => [row.engineId, row.engineName])).entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.id.localeCompare(b.id));
  if (result.settings.multiPv !== 1)
    throw new Error('Bundles require single-PV benchmark results (multiPv must be 1).');
  if (!result.rows.length) throw new Error('Bundles require at least one measured row.');
  const canonical = canonicalResult(result);
  // Copy the suite block: aliasing the caller's object would let later
  // mutations corrupt shared constants (e.g. SUITE_V1.positions).
  const suite = options.suite
    ? {
        id: options.suite.id,
        version: options.suite.version,
        sha256: options.suite.sha256,
        positions: options.suite.positions.map((position) => ({ ...position })),
      }
    : null;
  const unsigned = {
    format: 'openchesslab-experiment-bundle' as const,
    bundleVersion: BUNDLE_VERSION,
    runId: result.id,
    appVersion: result.appVersion ?? null,
    createdAt: result.createdAt,
    suite,
    engines,
    settings: { ...canonicalSettings(result.settings), multiPv: 1 as const },
    environment: { ...canonical.environment },
    result: canonical,
    notes: options.notes ?? null,
  };
  return { ...unsigned, sha256: bundleSha256(unsigned) };
}

export type BundleVerification =
  { ok: true; bundle: ExperimentBundle } | { ok: false; errors: string[] };

/** Parse + validate + verify hash. Returns structured errors, never throws. */
export function verifyBundle(input: unknown): BundleVerification {
  const parsed = bundleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join('.') || 'bundle'}: ${issue.message}`),
    };
  }
  const bundle = parsed.data;
  const { sha256, ...unsigned } = bundle;
  const recomputed = bundleSha256(unsigned);
  if (recomputed !== sha256) {
    return {
      ok: false,
      errors: [
        `sha256 mismatch: bundle claims ${sha256.slice(0, 12)}… but content hashes to ${recomputed.slice(0, 12)}…. The bundle was edited after export or corrupted in transit.`,
      ],
    };
  }
  if (bundle.runId !== bundle.result.id) {
    return { ok: false, errors: ['runId does not match result.id.'] };
  }
  if (bundle.suite) {
    // The suite's own content hash must be valid — otherwise a producer
    // could ship arbitrary positions under a trusted suite id.
    const suiteHash = sha256Hex(
      JSON.stringify({
        id: bundle.suite.id,
        version: bundle.suite.version,
        positions: bundle.suite.positions,
      }),
    );
    if (suiteHash !== bundle.suite.sha256) {
      return {
        ok: false,
        errors: [
          `Suite sha256 mismatch: claims ${bundle.suite.sha256.slice(0, 12)}… but positions hash to ${suiteHash.slice(0, 12)}….`,
        ],
      };
    }
    // A suite claim is only meaningful when the measured rows are exactly
    // the suite's positions. Otherwise anyone could attach Suite v1 to an
    // unrelated run and it would still "verify".
    const suiteFens = new Set(bundle.suite.positions.map((position) => position.fen));
    const rowFens = new Set(bundle.result.rows.map((row) => row.fen));
    const missing = [...suiteFens].filter((fen) => !rowFens.has(fen));
    const extra = [...rowFens].filter((fen) => !suiteFens.has(fen));
    if (missing.length || extra.length) {
      const details = [
        ...(missing.length ? [`missing suite positions: ${missing.length}`] : []),
        ...(extra.length ? [`non-suite positions: ${extra.length}`] : []),
      ].join('; ');
      return {
        ok: false,
        errors: [
          `Suite claim does not match measured rows (${details}). A suite bundle must contain exactly the suite positions.`,
        ],
      };
    }
    const resultSuite = bundle.result.suite;
    if (
      resultSuite &&
      (resultSuite.id !== bundle.suite.id ||
        resultSuite.version !== bundle.suite.version ||
        resultSuite.sha256 !== bundle.suite.sha256)
    ) {
      return { ok: false, errors: ['Embedded result suite ref disagrees with bundle suite.'] };
    }
  }
  return { ok: true, bundle };
}
