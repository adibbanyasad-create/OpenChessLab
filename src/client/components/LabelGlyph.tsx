import type { Classification } from '../../shared/types';

export const LABEL_META: Record<
  Classification,
  { glyph: string; label: string; tone: 'win' | 'lean-win' | 'neutral' | 'lean-loss' | 'loss' }
> = {
  brilliant: { glyph: '!!', label: 'Brilliant', tone: 'win' },
  great: { glyph: '!', label: 'Great', tone: 'win' },
  best: { glyph: '★', label: 'Best', tone: 'lean-win' },
  excellent: { glyph: '✓', label: 'Excellent', tone: 'lean-win' },
  good: { glyph: '·', label: 'Good', tone: 'neutral' },
  book: { glyph: '▤', label: 'Book', tone: 'neutral' },
  inaccuracy: { glyph: '?!', label: 'Inaccuracy', tone: 'lean-loss' },
  mistake: { glyph: '?', label: 'Mistake', tone: 'loss' },
  miss: { glyph: '×', label: 'Miss', tone: 'loss' },
  blunder: { glyph: '??', label: 'Blunder', tone: 'loss' },
};

export function LabelGlyph({
  classification,
  uncertain,
  size = 15,
}: {
  classification: Classification;
  uncertain?: boolean;
  size?: number;
}) {
  const meta = LABEL_META[classification];
  return (
    <span
      className={`label-glyph tone-${meta.tone} kind-${classification}${uncertain ? ' is-uncertain' : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.62) }}
      role="img"
      aria-label={uncertain ? `${meta.label} (uncertain estimate)` : meta.label}
      title={uncertain ? `${meta.label}: uncertain estimate` : meta.label}
    >
      {uncertain ? '~' : meta.glyph}
    </span>
  );
}
