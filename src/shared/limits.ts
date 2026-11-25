export const LIMITS = {
  pgnBytes: 256_000,
  gamePlies: 400,
  reviewPlies: 200,
  maxDepth: 24,
  reviewDepth: 14,
  maxThreads: 4,
  maxHash: 512,
  maxPositions: 8,
  jobTtlMs: 30 * 60_000,
  jobTimeoutMs: 5 * 60_000,
  maxJobs: 100,
} as const;
