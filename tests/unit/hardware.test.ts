import { describe, expect, it } from 'vitest';
import { recommendHardware } from '../../src/server/hardware';

describe('hardware recommendations', () => {
  it('reserves one CPU and scales hash conservatively with memory', () => {
    const recommendation = recommendHardware(8, 16 * 1_024 * 1_048_576);
    expect(recommendation).toMatchObject({ threads: 4, hashMb: 512, logicalCpus: 8 });
    expect(recommendation.reasons.join(' ')).toContain('Reserves one');
  });

  it('handles small and unknown machines without exceeding safety limits', () => {
    expect(recommendHardware(1, 256 * 1_048_576)).toMatchObject({ threads: 1, hashMb: 32 });
    expect(recommendHardware(4, null)).toMatchObject({
      threads: 3,
      hashMb: 64,
      totalMemoryMb: null,
    });
    expect(recommendHardware(0, -1)).toMatchObject({ threads: 1, logicalCpus: 1 });
  });
});
