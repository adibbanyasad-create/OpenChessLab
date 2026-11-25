import { z } from 'zod';
import { LIMITS } from './limits.js';

export const fenSchema = z
  .string()
  .trim()
  .min(15)
  .max(150)
  .regex(/^[\x20-\x7e]+$/, 'FEN must be one line of printable ASCII.');
export const pgnSchema = z.string().trim().min(1, 'Paste a PGN game first.').max(LIMITS.pgnBytes);
export const engineIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9-]+$/);
const settingsShape = {
  depth: z.number().int().min(1).max(LIMITS.maxDepth).default(14),
  threads: z.number().int().min(1).max(LIMITS.maxThreads).default(1),
  hash: z.number().int().min(16).max(LIMITS.maxHash).default(64),
  multiPv: z.number().int().min(1).max(5).default(3),
};

export const analysisSchema = z
  .object({
    fen: fenSchema,
    engineId: engineIdSchema.default('stockfish-lite'),
    ...settingsShape,
  })
  .strict();

export const reviewSchema = z
  .object({
    pgn: pgnSchema,
    engineId: engineIdSchema.default('stockfish-lite'),
    ...settingsShape,
    depth: z.number().int().min(1).max(LIMITS.reviewDepth).default(10),
    multiPv: z.literal(1).default(1),
  })
  .strict();

export const benchmarkSchema = z
  .object({
    engineIds: z
      .array(engineIdSchema)
      .min(1)
      .max(4)
      .refine((ids) => new Set(ids).size === ids.length, 'Engine IDs must be unique.'),
    positions: z
      .array(z.object({ name: z.string().trim().min(1).max(80), fen: fenSchema }).strict())
      .min(1)
      .max(LIMITS.maxPositions),
    ...settingsShape,
    multiPv: z.literal(1).default(1),
  })
  .strict();

export type AnalysisRequest = z.infer<typeof analysisSchema>;
export type ReviewRequest = z.infer<typeof reviewSchema>;
export type BenchmarkRequest = z.infer<typeof benchmarkSchema>;
