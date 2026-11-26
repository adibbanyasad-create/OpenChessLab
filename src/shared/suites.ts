import { DEFAULT_POSITION } from './chess.js';
import { sha256Hex } from './sha256.js';

/**
 * A frozen, content-addressed benchmark suite.
 *
 * Suites are append-only: a published suite id/version/positions tuple must
 * never change. New positions require a new suite version. The SHA-256 over
 * the canonical JSON form lets anyone verify they ran the exact same suite.
 */
export interface BenchmarkSuite {
  id: string;
  version: number;
  title: string;
  description: string;
  positions: { name: string; fen: string }[];
  sha256: string;
}

function suiteHash(
  id: string,
  version: number,
  positions: { name: string; fen: string }[],
): string {
  return sha256Hex(JSON.stringify({ id, version, positions }));
}

function freezeSuite(
  id: string,
  version: number,
  title: string,
  description: string,
  positions: { name: string; fen: string }[],
): BenchmarkSuite {
  return {
    id,
    version,
    title,
    description,
    positions: positions.map((position) => ({ ...position })),
    sha256: suiteHash(id, version, positions),
  };
}

/**
 * OpenChessLab Suite v1: three transparent illustrative positions covering
 * opening, middlegame, and endgame phases. This is NOT a statistically
 * validated strength suite — see docs/benchmarking.md. It exists so engine
 * authors can run the exact same positions and compare measured rows.
 */
export const SUITE_V1 = freezeSuite(
  'openchesslab-suite-v1',
  1,
  'OpenChessLab Suite v1',
  'Opening, middlegame, and rook-endgame illustration positions. Single-run descriptive statistics only; not a strength rating.',
  [
    { name: 'Starting position', fen: DEFAULT_POSITION },
    {
      name: 'Opera Game, move 9',
      fen: 'rn2kb1r/pp2qppp/2p2n2/4p3/2B1P3/1QN5/PPP2PPP/R1B1K2R w KQkq - 0 9',
    },
    { name: 'Rook endgame', fen: '8/5pk1/6p1/3R3p/7P/5KP1/8/6r1 w - - 0 1' },
  ],
);

/** Every published suite, newest last. Never remove entries. */
export const BENCHMARK_SUITES: BenchmarkSuite[] = [SUITE_V1];

export function findSuite(id: string, version?: number): BenchmarkSuite | undefined {
  const candidates = BENCHMARK_SUITES.filter((suite) => suite.id === id);
  if (version === undefined) return candidates.at(-1);
  return candidates.find((suite) => suite.version === version);
}

/** True when the given positions are exactly this suite's positions, in order. */
export function matchesSuite(
  suite: BenchmarkSuite,
  positions: { name: string; fen: string }[],
): boolean {
  return (
    positions.length === suite.positions.length &&
    positions.every(
      (position, index) =>
        position.name === suite.positions[index]?.name &&
        position.fen === suite.positions[index]?.fen,
    )
  );
}

/** Identify which published suite (if any) a position list matches exactly. */
export function identifySuite(
  positions: { name: string; fen: string }[],
): BenchmarkSuite | undefined {
  return BENCHMARK_SUITES.find((suite) => matchesSuite(suite, positions));
}

/** Recompute the content hash for verification (constant shape, no options). */
export function verifySuiteHash(suite: BenchmarkSuite): boolean {
  return suiteHash(suite.id, suite.version, suite.positions) === suite.sha256;
}
