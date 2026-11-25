import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Chess, type PieceSymbol, type Square } from 'chess.js';
import { formatScore, scoreCp, squareName } from '../../shared/chess';
import type { Score } from '../../shared/types';
import { ChessPiece } from './ChessPiece';
import { Modal } from './Modal';

const names: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export function ChessBoard({
  fen,
  flipped,
  onMove,
  score,
  lastMove,
  bestMove,
  showArrow,
}: {
  fen: string;
  flipped: boolean;
  onMove: (uci: string) => void;
  score?: Score;
  lastMove?: { from: string; to: string };
  bestMove?: string | null;
  showArrow: boolean;
}) {
  const chess = new Chess(fen);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square }>();
  const [focused, setFocused] = useState<Square>('e4');
  const legal = selected ? chess.moves({ square: selected, verbose: true }) : [];
  const squares = Array.from({ length: 64 }, (_, index) =>
    squareName(
      flipped ? 7 - (index % 8) : index % 8,
      flipped ? Math.floor(index / 8) + 1 : 8 - Math.floor(index / 8),
    ),
  );
  const select = (square: Square, from = selected) => {
    if (from) {
      const moves = chess.moves({ square: from, verbose: true });
      const move = moves.find((candidate) => candidate.to === square);
      if (move) {
        if (move.isPromotion()) setPromotion({ from, to: square });
        else onMove(from + square);
        setSelected(null);
        return;
      }
    }
    setSelected(chess.get(square)?.color === chess.turn() && square !== selected ? square : null);
  };
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, square: Square) => {
    const offsets: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -8,
      ArrowDown: 8,
    };
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    const next = squares[squares.indexOf(square) + offset];
    if (next) {
      setFocused(next);
      document.getElementById(`square-${next}`)?.focus();
    }
  };
  const whiteShare = score
    ? Math.max(5, Math.min(95, 50 + 45 * Math.tanh(scoreCp(score) / 450)))
    : 50;
  const point = (square: string) => {
    const file = 'abcdefgh'.indexOf(square[0] ?? 'a');
    const rank = Number(square[1]);
    return {
      x: (flipped ? 7 - file : file) * 100 + 50,
      y: (flipped ? rank - 1 : 8 - rank) * 100 + 50,
    };
  };
  const arrowFrom = bestMove ? point(bestMove.slice(0, 2)) : undefined;
  const arrowTo = bestMove ? point(bestMove.slice(2, 4)) : undefined;
  return (
    <div className="board-with-eval">
      <div
        className={`evaluation-bar ${flipped ? 'flipped' : ''}`}
        aria-label={
          score
            ? `Evaluation ${whiteShare > 50 ? 'favors White' : whiteShare < 50 ? 'favors Black' : 'is balanced'}`
            : 'Evaluation not yet available'
        }
      >
        <div className="eval-white" style={{ height: `${whiteShare}%` }} />
        <span>{formatScore(score)}</span>
      </div>
      <div
        className="chessboard"
        role="group"
        aria-label={`Interactive chessboard, ${chess.turn() === 'w' ? 'White' : 'Black'} to move`}
      >
        {squares.map((square, index) => {
          const piece = chess.get(square);
          const isDark = ((index % 8) + Math.floor(index / 8)) % 2 === 1;
          const target = legal.some((move) => move.to === square);
          const checked = piece?.type === 'k' && piece.color === chess.turn() && chess.isCheck();
          return (
            <button
              key={square}
              id={`square-${square}`}
              type="button"
              className={`square ${isDark ? 'dark' : 'light'} ${selected === square ? 'selected' : ''} ${lastMove?.from === square || lastMove?.to === square ? 'last-move' : ''} ${checked ? 'in-check' : ''}`}
              aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'White' : 'Black'} ${names[piece.type]}` : ' empty'}${target ? ', legal destination' : ''}`}
              aria-pressed={selected === square}
              tabIndex={focused === square ? 0 : -1}
              onFocus={() => setFocused(square)}
              onKeyDown={(event) => onKey(event, square)}
              onClick={() => select(square)}
              draggable={Boolean(piece && piece.color === chess.turn())}
              onDragStart={(event) => {
                event.dataTransfer.setData('text/plain', square);
                event.dataTransfer.effectAllowed = 'move';
                setSelected(square);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const from = event.dataTransfer.getData('text/plain');
                if (/^[a-h][1-8]$/.test(from)) select(square, from as Square);
              }}
            >
              {index % 8 === 0 && <span className="rank-label">{square[1]}</span>}
              {index >= 56 && <span className="file-label">{square[0]}</span>}
              {piece && <ChessPiece type={piece.type} color={piece.color} />}
              {target && <span className={piece ? 'legal-ring' : 'legal-dot'} />}
            </button>
          );
        })}
        {showArrow && arrowFrom && arrowTo && (
          <svg viewBox="0 0 800 800" className="board-arrow" aria-hidden="true">
            <defs>
              <marker
                id="arrowhead"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="3.2"
                markerHeight="3.2"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
            </defs>
            <line
              x1={arrowFrom.x}
              y1={arrowFrom.y}
              x2={arrowTo.x}
              y2={arrowTo.y}
              stroke="currentColor"
              strokeWidth="18"
              strokeLinecap="round"
              markerEnd="url(#arrowhead)"
              style={{ '--arrow-opacity': 0.62 } as CSSProperties}
            />
          </svg>
        )}
      </div>
      {promotion && (
        <Modal
          title="Choose your promotion"
          description="Which piece should your pawn become?"
          onClose={() => setPromotion(undefined)}
        >
          <div className="promotion-choices">
            {(['q', 'r', 'b', 'n'] as const).map((type) => (
              <button
                key={type}
                className="promotion-choice"
                aria-label={`Promote to ${names[type]}`}
                onClick={() => {
                  onMove(promotion.from + promotion.to + type);
                  setPromotion(undefined);
                }}
              >
                <ChessPiece type={type} color={chess.turn()} />
                <span>{names[type]}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
