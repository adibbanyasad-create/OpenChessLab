import { useEffect, useRef } from 'react';
import { Download, FileDown, List, Sparkles, Square } from 'lucide-react';
import type { GameData, GameMove, ReviewResult } from '../../shared/types';

export function MoveList({
  game,
  ply,
  setPly,
  review,
  busy,
  progress,
  onReview,
  onExport,
  onExportReview,
}: {
  game: GameData;
  ply: number;
  setPly: (ply: number) => void;
  review?: ReviewResult;
  busy: boolean;
  progress?: string;
  onReview: () => void;
  onExport: () => void;
  onExportReview?: () => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const grouped = new Map<number, { w?: GameMove; b?: GameMove }>();
  for (const move of game.moves) {
    const number = Number(move.before.split(' ')[5]);
    const group = grouped.get(number) ?? {};
    group[move.color] = move;
    grouped.set(number, group);
  }
  useEffect(() => {
    const parent = scroll.current;
    const active = parent?.querySelector<HTMLElement>('[aria-current="step"]');
    if (parent && active) {
      const top = active.offsetTop;
      if (
        top < parent.scrollTop ||
        top + active.offsetHeight > parent.scrollTop + parent.clientHeight
      )
        parent.scrollTop = Math.max(0, top - parent.clientHeight / 2);
    }
  }, [ply]);
  return (
    <section className="card notation-card">
      <div className="card-heading">
        <h3>
          <List size={16} />
          Game notation
        </h3>
        <div className="notation-actions">
          {review && onExportReview && (
            <button
              className="icon-button small"
              onClick={onExportReview}
              aria-label="Export review CSV"
              title="Export review CSV"
            >
              <FileDown size={15} />
            </button>
          )}
          <button
            className="icon-button small"
            onClick={onExport}
            aria-label="Export PGN"
            title="Export PGN"
          >
            <Download size={15} />
          </button>
        </div>
      </div>
      <div className="notation-scroll" ref={scroll}>
        {game.moves.length ? (
          [...grouped].map(([number, moves]) => (
            <div className="move-row" key={number}>
              <span className="move-number">{number}.</span>
              {(['w', 'b'] as const).map((color) => {
                const move = moves[color];
                const annotation = review?.annotations.find(
                  (candidate) => candidate.ply === move?.ply,
                );
                return move ? (
                  <button
                    className={`notation-move ${move.ply === ply ? 'current' : ''} ${annotation?.classification ?? ''}`}
                    aria-current={move.ply === ply ? 'step' : undefined}
                    aria-label={`Go to move ${number}${color === 'w' ? '.' : '...'} ${move.san}`}
                    key={color}
                    onClick={() => setPly(move.ply)}
                    title={
                      annotation
                        ? annotation.uncertain
                          ? 'Uncertain estimate: an adjacent evaluation did not confirm its requested depth'
                          : `${annotation.classification}: ${annotation.lossCp} cp estimated loss`
                        : move.san
                    }
                  >
                    <span>{move.san}</span>
                    {annotation?.uncertain && <span className="move-annotation uncertain">~</span>}
                    {annotation &&
                      !annotation.uncertain &&
                      ['blunder', 'mistake', 'inaccuracy'].includes(annotation.classification) && (
                        <span className="move-annotation">
                          {annotation.classification === 'blunder'
                            ? '??'
                            : annotation.classification === 'mistake'
                              ? '?'
                              : '?!'}
                        </span>
                      )}
                  </button>
                ) : (
                  <span key={color} />
                );
              })}
            </div>
          ))
        ) : (
          <div className="notation-empty">
            An open board. A fresh perspective.
            <br />
            <span>Play a move or import a game to begin.</span>
          </div>
        )}
      </div>
      <div className="review-footer">
        {review && (
          <div className="review-summary">
            {(['inaccuracy', 'mistake', 'blunder'] as const).map((kind) => (
              <span className={kind} key={kind}>
                <i />
                {
                  review.annotations.filter(
                    (annotation) => !annotation.uncertain && annotation.classification === kind,
                  ).length
                }{' '}
                {kind === 'inaccuracy' ? 'inaccuracies' : `${kind}s`}
              </span>
            ))}
            {review.annotations.some((annotation) => annotation.uncertain) && (
              <span
                className="uncertain"
                title="Moves whose adjacent evaluations did not confirm the requested depth"
              >
                <i />~ uncertain estimates
              </span>
            )}
          </div>
        )}
        {busy && (
          <p className="tiny muted review-progress" role="status">
            {progress}
          </p>
        )}
        <button className="button review-button" disabled={!game.moves.length} onClick={onReview}>
          {busy ? <Square size={13} /> : <Sparkles size={15} />}
          {busy ? 'Stop game review' : review ? 'Review again' : 'Review this game'}
          {!busy && <span>Spot the turning points</span>}
        </button>
      </div>
    </section>
  );
}
