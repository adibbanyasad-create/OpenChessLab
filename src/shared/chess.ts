import { Chess, DEFAULT_POSITION, validateFen, type Square } from 'chess.js';
import { LIMITS } from './limits.js';
import type { Classification, GameData, Score } from './types.js';

export { DEFAULT_POSITION };

export const OPERA_PGN = `[Event "A Night at the Opera"]
[Site "Paris, France"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke of Brunswick & Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6
7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7
12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7
16. Qb8+ Nxb8 17. Rd8# 1-0`;

export const BENCHMARK_POSITIONS = [
  { name: 'Starting position', fen: DEFAULT_POSITION },
  {
    name: 'Opera Game, move 9',
    fen: 'rn2kb1r/pp2qppp/2p2n2/4p3/2B1P3/1QN5/PPP2PPP/R1B1K2R w KQkq - 0 9',
  },
  { name: 'Rook endgame', fen: '8/5pk1/6p1/3R3p/7P/5KP1/8/6r1 w - - 0 1' },
];

export function validPosition(fen: string): Chess {
  if (fen.length > 150 || /[^\x20-\x7e]/.test(fen))
    throw new Error('FEN must be a single printable line.');
  const validation = validateFen(fen);
  if (!validation.ok) throw new Error(validation.error ?? 'Invalid FEN.');
  const fields = fen.trim().split(/\s+/);
  if (
    [fields[4], fields[5]].some(
      (value) => !Number.isSafeInteger(Number(value)) || Number(value) > LIMITS.fenCounter,
    )
  ) {
    throw new Error(`FEN counters must be integers no greater than ${LIMITS.fenCounter}.`);
  }
  const chess = new Chess(fen);
  const pieces = chess
    .board()
    .flat()
    .filter((piece) => piece !== null);
  for (const color of ['w', 'b'] as const) {
    if (
      pieces.filter((piece) => piece.color === color).length > 16 ||
      pieces.filter((piece) => piece.color === color && piece.type === 'p').length > 8
    ) {
      throw new Error('Invalid position: a side has too many pieces or pawns for standard chess.');
    }
  }
  const rights = chess.fen().split(' ')[2] ?? '-';
  for (const [right, color, kingSquare, rookSquare] of [
    ['K', 'w', 'e1', 'h1'],
    ['Q', 'w', 'e1', 'a1'],
    ['k', 'b', 'e8', 'h8'],
    ['q', 'b', 'e8', 'a8'],
  ] as const) {
    if (!rights.includes(right)) continue;
    const king = chess.get(kingSquare),
      rook = chess.get(rookSquare);
    if (king?.type !== 'k' || king.color !== color || rook?.type !== 'r' || rook.color !== color) {
      throw new Error(
        'Invalid position: castling rights require the king and rook on their original squares.',
      );
    }
  }
  const enemyKing = pieces.find((piece) => piece.type === 'k' && piece.color !== chess.turn());
  if (enemyKing && chess.isAttacked(enemyKing.square, chess.turn())) {
    throw new Error('Invalid position: the side that just moved left its king in check.');
  }
  return chess;
}

export function parseGame(pgn: string): GameData {
  if (new TextEncoder().encode(pgn).length > LIMITS.pgnBytes)
    throw new Error('PGN exceeds the 256 KB limit.');
  if (!pgn.trim()) throw new Error('Paste a PGN game first.');
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch {
    throw new Error(
      'Unable to read this PGN. Check the headers and move notation; import one game at a time.',
    );
  }
  const moves = chess.history({ verbose: true });
  if (moves.length > LIMITS.gamePlies)
    throw new Error(`Games are limited to ${LIMITS.gamePlies} half-moves.`);
  const initialFen = moves[0]?.before ?? chess.fen();
  validPosition(initialFen);
  validPosition(chess.fen());
  return {
    headers: chess.getHeaders(),
    pgn: chess.pgn({ maxWidth: 80 }),
    initialFen,
    positions: [initialFen, ...moves.map((move) => move.after)],
    moves: moves.map((move, i) => ({
      ply: i + 1,
      san: move.san,
      from: move.from,
      to: move.to,
      color: move.color,
      ...(move.promotion ? { promotion: move.promotion } : {}),
      before: move.before,
      after: move.after,
    })),
  };
}

export function gameFromFen(fen: string): GameData {
  const chess = validPosition(fen);
  return parseGame(chess.pgn() || '*');
}

export function branchGame(game: GameData, ply: number, uci: string): GameData {
  const chess = new Chess(game.initialFen);
  for (const [key, value] of Object.entries(game.headers)) {
    if (!['Result', 'SetUp', 'FEN'].includes(key)) chess.setHeader(key, value);
  }
  for (const move of game.moves.slice(0, ply)) chess.move(move.san);
  const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  if (!move) throw new Error('That move is not legal in this position.');
  chess.setHeader('Result', chess.isCheckmate() ? (chess.turn() === 'w' ? '0-1' : '1-0') : '*');
  return parseGame(chess.pgn());
}

export function pvToSan(fen: string, pv: string[]): string[] {
  const chess = new Chess(fen);
  const san: string[] = [];
  for (const uci of pv.slice(0, 32)) {
    try {
      const move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      san.push(move.san);
    } catch {
      break;
    }
  }
  return san;
}

export function scoreCp(score: Score): number {
  return score.type === 'cp' ? score.value : score.winner === 'w' ? 10_000 : -10_000;
}

export function formatScore(score?: Score): string {
  if (!score) return '\u2014';
  if (score.type === 'mate') return `${score.winner === 'b' ? '-' : ''}M${Math.abs(score.value)}`;
  return `${score.value > 0 ? '+' : ''}${(score.value / 100).toFixed(2)}`;
}

export function scoreDescription(score?: Score): string {
  if (!score) return 'Waiting for the engine';
  if (score.type === 'mate') return `${score.winner === 'w' ? 'White' : 'Black'} has a forced mate`;
  if (Math.abs(score.value) < 25) return 'The position is balanced';
  const side = score.value > 0 ? 'White' : 'Black';
  return `${side} ${Math.abs(score.value) < 90 ? 'is slightly better' : Math.abs(score.value) < 220 ? 'has an advantage' : 'is winning'}`;
}

export function classifyMove(
  before: Score,
  after: Score,
  color: 'w' | 'b',
  playedBest = false,
): { classification: Classification; lossCp: number } {
  const lossCp = Math.max(
    0,
    Math.round((scoreCp(before) - scoreCp(after)) * (color === 'w' ? 1 : -1)),
  );
  if (playedBest) return { classification: 'best', lossCp: 0 };
  return {
    lossCp,
    classification:
      lossCp >= 200 ? 'blunder' : lossCp >= 100 ? 'mistake' : lossCp >= 50 ? 'inaccuracy' : 'good',
  };
}

export function squareName(file: number, rank: number): Square {
  return `${'abcdefgh'[file]}${rank}` as Square;
}
