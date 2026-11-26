import { describe, expect, it } from 'vitest';
import { identifyOpening, openingFromMoves } from '../../src/shared/openings';

describe('opening identification', () => {
  it('identifies known openings by longest matching move order', () => {
    expect(identifyOpening(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6'])).toEqual({
      name: 'Ruy Lopez',
      eco: 'C60',
      plies: 5,
    });
    expect(identifyOpening(['d2d4', 'd7d5', 'c2c4', 'e7e6'])).toEqual({
      name: "Queen's Gambit Declined",
      eco: 'D06',
      plies: 4,
    });
  });

  it('returns undefined for unknown or invalid continuations instead of guessing', () => {
    expect(identifyOpening(['h2h4', 'h7h5'])).toBeUndefined();
    expect(identifyOpening([])).toBeUndefined();
    expect(
      openingFromMoves([
        { from: 'e2', to: 'e4' },
        { from: 'e7', to: 'e5' },
        { from: 'a1', to: 'a8' },
      ]),
    ).toEqual({ name: "King's Pawn Opening", eco: 'C20', plies: 1 });
  });
});
