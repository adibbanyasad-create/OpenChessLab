import { describe, expect, it } from 'vitest';
import { BENCHMARK_POSITIONS, validPosition } from '../../src/shared/chess';
import {
  BENCHMARK_SUITES,
  SUITE_V1,
  findSuite,
  identifySuite,
  matchesSuite,
  verifySuiteHash,
} from '../../src/shared/suites';

describe('frozen benchmark suites', () => {
  it('freezes Suite v1 positions, hash, and validity', () => {
    expect(SUITE_V1).toMatchObject({ id: 'openchesslab-suite-v1', version: 1 });
    expect(SUITE_V1.positions).toHaveLength(3);
    expect(SUITE_V1.positions).toEqual(BENCHMARK_POSITIONS);
    expect(SUITE_V1.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(verifySuiteHash(SUITE_V1)).toBe(true);
    for (const { fen } of SUITE_V1.positions) expect(() => validPosition(fen)).not.toThrow();
  });
  it('detects any tampering with suite identity', () => {
    expect(verifySuiteHash({ ...SUITE_V1, version: 2 })).toBe(false);
    expect(
      verifySuiteHash({
        ...SUITE_V1,
        positions: [...SUITE_V1.positions, { name: 'Extra', fen: SUITE_V1.positions[0]!.fen }],
      }),
    ).toBe(false);
    expect(
      verifySuiteHash({
        ...SUITE_V1,
        positions: SUITE_V1.positions.map((position, index) =>
          index === 0 ? { ...position, name: 'Renamed' } : position,
        ),
      }),
    ).toBe(false);
  });
  it('matches only exact position lists in order', () => {
    expect(matchesSuite(SUITE_V1, SUITE_V1.positions)).toBe(true);
    expect(matchesSuite(SUITE_V1, [...SUITE_V1.positions].reverse())).toBe(false);
    expect(matchesSuite(SUITE_V1, SUITE_V1.positions.slice(0, 2))).toBe(false);
    expect(identifySuite(SUITE_V1.positions)).toBe(SUITE_V1);
    expect(identifySuite([{ name: 'Other', fen: SUITE_V1.positions[0]!.fen }])).toBeUndefined();
  });
  it('resolves suites by id with latest-version default', () => {
    expect(findSuite('openchesslab-suite-v1')).toBe(SUITE_V1);
    expect(findSuite('openchesslab-suite-v1', 1)).toBe(SUITE_V1);
    expect(findSuite('openchesslab-suite-v1', 99)).toBeUndefined();
    expect(findSuite('unknown')).toBeUndefined();
    expect(BENCHMARK_SUITES).toContain(SUITE_V1);
  });
});
