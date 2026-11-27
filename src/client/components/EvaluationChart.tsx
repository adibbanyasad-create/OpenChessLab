import { Activity, ArrowUpRight } from 'lucide-react';
import { formatScore, scoreCp } from '../../shared/chess';
import type { ReviewResult, Score } from '../../shared/types';

export function EvaluationChart({
  review,
  ply,
  total,
  current,
  onSelect,
  onReview,
  busy,
}: {
  review?: ReviewResult;
  ply: number;
  total: number;
  current?: Score;
  onSelect: (ply: number) => void;
  onReview: () => void;
  busy: boolean;
}) {
  const width = 640,
    height = 112;
  const points = review?.scores ?? (current ? [{ ply, score: current }] : []);
  const x = (move: number) => 12 + (move / Math.max(1, total)) * (width - 24);
  const y = (score: Score) =>
    height / 2 - (Math.max(-600, Math.min(600, scoreCp(score))) / 600) * (height / 2 - 12);
  const path = points
    .map((point, index) => `${index ? 'L' : 'M'} ${x(point.ply)} ${y(point.score)}`)
    .join(' ');
  return (
    <section className="card evaluation-card">
      <div className="card-heading">
        <h3>
          <Activity size={16} />
          Evaluation timeline
        </h3>
        <span className="muted tiny">White's perspective</span>
      </div>
      <div className="evaluation-chart">
        <div className="chart-scale">
          <span>+6</span>
          <span>0</span>
          <span>-6</span>
        </div>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={
            review
              ? 'Game evaluation by half-move. Values are clipped to six pawns.'
              : 'Current evaluation. Review the game for a complete timeline.'
          }
        >
          <defs>
            <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4c9068" stopOpacity=".20" />
              <stop offset="100%" stopColor="#4c9068" stopOpacity=".02" />
            </linearGradient>
          </defs>
          {[14, height / 2, height - 14].map((line) => (
            <line
              key={line}
              x1="0"
              y1={line}
              x2={width}
              y2={line}
              className={line === height / 2 ? 'chart-zero' : 'chart-grid'}
            />
          ))}
          {review && points.length > 1 && (
            <>
              <path
                d={`${path} L ${x(total)} ${height} L ${x(0)} ${height} Z`}
                fill="url(#chart-fill)"
                className="chart-area"
              />
              <path
                d={path}
                fill="none"
                stroke="#38815c"
                strokeWidth="2.5"
                strokeLinejoin="round"
                className="chart-line"
                pathLength={100}
              />
            </>
          )}
          {points.map((point) => {
            const annotation = review?.annotations.find((candidate) => candidate.ply === point.ply);
            const marker =
              annotation && !annotation.uncertain
                ? annotation.classification === 'blunder'
                  ? '??'
                  : annotation.classification === 'brilliant'
                    ? '!!'
                    : annotation.classification === 'mistake' ||
                        annotation.classification === 'miss'
                      ? '?'
                      : annotation.classification === 'inaccuracy'
                        ? '?!'
                        : annotation.classification === 'great' ||
                            annotation.classification === 'excellent'
                          ? '!'
                          : null
                : null;
            return (
              <g key={point.ply}>
                <circle
                  cx={x(point.ply)}
                  cy={y(point.score)}
                  r={point.ply === ply ? 4 : 2}
                  fill={marker && marker.includes('?') ? '#9c524a' : '#2a7651'}
                >
                  <title>
                    Half-move {point.ply}: {formatScore(point.score)}
                  </title>
                </circle>
                {marker && (
                  <text
                    x={x(point.ply)}
                    y={Math.max(12, y(point.score) - 8)}
                    textAnchor="middle"
                    className={`chart-marker ${marker.includes('?') ? 'bad' : 'good'}`}
                  >
                    {marker}
                  </text>
                )}
              </g>
            );
          })}
          <line
            x1={x(ply)}
            y1="5"
            x2={x(ply)}
            y2={height - 5}
            stroke="#718779"
            strokeDasharray="3 4"
            opacity=".5"
          />
          {review?.scores.map((point) => (
            <rect
              key={point.ply}
              x={x(point.ply) - 8}
              y="0"
              width="16"
              height={height}
              fill="transparent"
              tabIndex={0}
              role="button"
              aria-label={`Go to half-move ${point.ply}, evaluation ${formatScore(point.score)}`}
              onClick={() => onSelect(point.ply)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(point.ply);
                }
              }}
            />
          ))}
        </svg>
        {!review && (
          <button className="chart-callout" onClick={onReview} disabled={busy || total === 0}>
            {busy ? 'Building your game review...' : 'See the whole game. Run a review.'}
            <ArrowUpRight size={14} />
          </button>
        )}
      </div>
      <div className="chart-footer">
        <span>Opening</span>
        <span>
          {review
            ? `${review.scores.length} positions analyzed`
            : 'Only measured evaluations are shown'}
        </span>
        <span>Move {Math.ceil(total / 2)}</span>
      </div>
    </section>
  );
}
