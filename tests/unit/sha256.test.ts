import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/shared/sha256';

describe('dependency-free SHA-256', () => {
  it.each(['', 'a', 'abc', 'The quick brown fox jumps over the lazy dog', '0'.repeat(1000)])(
    'matches Node crypto for %j',
    (input) => {
      expect(sha256Hex(input)).toBe(createHash('sha256').update(input, 'utf8').digest('hex'));
    },
  );
  it('matches Node crypto for multibyte input', () => {
    const input = '♞ OpenChessLab ♜ — π ≈ 3.14159 — emoji 🎲';
    expect(sha256Hex(input)).toBe(createHash('sha256').update(input, 'utf8').digest('hex'));
  });
  it('matches Node crypto for exactly one padded block boundary (55, 56, 64 bytes)', () => {
    for (const length of [55, 56, 63, 64, 65, 119, 120, 128]) {
      const input = 'x'.repeat(length);
      expect(sha256Hex(input)).toBe(createHash('sha256').update(input, 'utf8').digest('hex'));
    }
  });
});
