import { Chess } from 'chess.js';

// A small curated opening-name table based on public-domain opening move orders.
// It is intentionally limited and transparent: unknown lines return undefined
// rather than guessing an ECO code or invented opening name.
const OPENINGS: { eco?: string; name: string; uci: string[] }[] = [
  { eco: 'C50', name: 'Italian Game', uci: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'] },
  { eco: 'C60', name: 'Ruy Lopez', uci: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5'] },
  {
    eco: 'C50',
    name: 'Evans Gambit Accepted Variation',
    uci: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'b2b4'],
  },
  {
    eco: 'C44',
    name: "King's Pawn Game: Ponziani Opening",
    uci: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'c2c3'],
  },
  { eco: 'C45', name: 'Scotch Game', uci: ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'd2d4'] },
  { eco: 'C41', name: 'Philidor Defense', uci: ['e2e4', 'e7e5', 'g1f3', 'd7d6'] },
  { eco: 'B01', name: 'Scandinavian Defense', uci: ['e2e4', 'd7d5'] },
  { eco: 'B20', name: 'Sicilian Defense', uci: ['e2e4', 'c7c5'] },
  { eco: 'B12', name: 'Caro-Kann Defense', uci: ['e2e4', 'c7c6'] },
  { eco: 'C00', name: 'French Defense', uci: ['e2e4', 'e7e6'] },
  { eco: 'D00', name: "Queen's Pawn Game", uci: ['d2d4', 'd7d5'] },
  { eco: 'D06', name: "Queen's Gambit Declined", uci: ['d2d4', 'd7d5', 'c2c4', 'e7e6'] },
  { eco: 'D02', name: 'London System', uci: ['d2d4', 'd7d5', 'c1f4'] },
  { eco: 'A00', name: 'Ware Defense', uci: ['e2e4', 'a7a5'] },
  { eco: 'B00', name: "Owen's Defense", uci: ['e2e4', 'b7b6'] },
  { eco: 'C00', name: 'French Defense: Normal Variation', uci: ['e2e4', 'e7e6', 'd2d4', 'd7d5'] },
  { eco: 'E60', name: "King's Indian Defense", uci: ['d2d4', 'g8f6', 'c2c4', 'g7g6'] },
  { eco: 'E00', name: 'New Indian Defense', uci: ['d2d4', 'g8f6', 'c2c4', 'e7e6'] },
  { eco: 'A10', name: 'English Opening', uci: ['c2c4'] },
  { eco: 'A00', name: 'Bird Opening', uci: ['f2f4'] },
  { eco: 'A04', name: 'Reti Opening', uci: ['g1f3'] },
  { eco: 'C20', name: "King's Pawn Opening", uci: ['e2e4'] },
  { eco: 'D00', name: "Queen's Pawn Opening", uci: ['d2d4'] },
];

export function identifyOpening(
  uciMoves: string[],
): { name: string; eco?: string; plies: number } | undefined {
  let best: { name: string; eco?: string; plies: number } | undefined;
  for (const opening of OPENINGS) {
    if (opening.uci.length > uciMoves.length) continue;
    const matches = opening.uci.every((move, index) => uciMoves[index] === move);
    if (matches && (!best || opening.uci.length > best.plies)) {
      best = {
        name: opening.name,
        ...(opening.eco ? { eco: opening.eco } : {}),
        plies: opening.uci.length,
      };
    }
  }
  return best;
}

export function openingBookPlies(uciMoves: string[]): number {
  return identifyOpening(uciMoves)?.plies ?? 0;
}

export function openingFromMoves(
  moves: { from: string; to: string; promotion?: string }[],
): { name: string; eco?: string; plies: number } | undefined {
  const chess = new Chess();
  const uci: string[] = [];
  for (const move of moves) {
    try {
      chess.move({ from: move.from, to: move.to, promotion: move.promotion });
      uci.push(`${move.from}${move.to}${move.promotion ?? ''}`);
    } catch {
      break;
    }
  }
  return identifyOpening(uci);
}
