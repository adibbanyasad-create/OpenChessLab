import type { PieceSymbol } from 'chess.js';

// Original vector artwork; included under the application's MIT license.
export function ChessPiece({ type, color }: { type: PieceSymbol; color: 'w' | 'b' }) {
  const fill = color === 'w' ? '#fffdf3' : '#293b32';
  const stroke = color === 'w' ? '#3b4b3e' : '#14291f';
  const shine = color === 'w' ? '#ffffff' : '#738577';
  return (
    <svg viewBox="0 0 48 48" className={`chess-piece ${color}`} aria-hidden="true">
      <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {type === 'p' && (
          <>
            <circle cx="24" cy="12.5" r="6" />
            <path d="M19 19c-3 3-4 6-2 8l3 2-3 8h14l-3-8 3-2c2-2 1-5-2-8Z" />
            <path d="M15 36h18l3 5H12Z" />
            <path d="M19 23h10" stroke={shine} strokeWidth="1.2" />
          </>
        )}
        {type === 'r' && (
          <>
            <path d="M12 8h6v5h4V8h4v5h4V8h6v12l-5 4 1 12H16l1-12-5-4Z" />
            <path d="M14 20h20M17 25h14M15 35h18l3 6H12Z" />
            <path d="M19 28v5M18 17h12" stroke={shine} strokeWidth="1.2" />
          </>
        )}
        {type === 'n' && (
          <>
            <path d="m15 35 3-7 10-7-7 1-5 5-7-4 6-10 7-3 1-6 6 5c9 1 12 10 9 18l-5 9Z" />
            <path d="m12 22 4 1M23 12l7 5-3 11M15 36h19l3 5H11Z" />
            <circle cx="21" cy="15" r="1.3" fill={stroke} stroke="none" />
            <path d="M32 14c4 5 3 12-1 18" fill="none" stroke={shine} strokeWidth="1.2" />
          </>
        )}
        {type === 'b' && (
          <>
            <circle cx="24" cy="6.5" r="2.5" />
            <path d="M24 9c-5 5-10 9-9 14 1 4 5 5 9 5s8-1 9-5c1-5-4-9-9-14Z" />
            <path d="m26 12-4 9M19 28l-3 8h16l-3-8M14 36h20l3 5H11Z" />
            <path d="M20 25h8" stroke={shine} strokeWidth="1.2" />
          </>
        )}
        {type === 'q' && (
          <>
            <path d="m10 15 6 18h16l6-18-9 8-5-12-5 12Z" />
            <circle cx="10" cy="13" r="3" />
            <circle cx="24" cy="8" r="3" />
            <circle cx="38" cy="13" r="3" />
            <path d="M16 31h16v5H16ZM14 36h20l3 5H11Z" />
            <path d="M19 28h10" stroke={shine} strokeWidth="1.2" />
          </>
        )}
        {type === 'k' && (
          <>
            <path d="M24 3v10m-4-6h8" fill="none" strokeWidth="2.6" />
            <path d="M24 16c-7-8-15-2-12 5l6 11h12l6-11c3-7-5-13-12-5Z" />
            <path d="M24 14v13M17 31h14v5H17ZM14 36h20l3 5H11Z" />
            <path d="M16 18c-2 3 3 8 4 10m8 0 4-9" fill="none" stroke={shine} strokeWidth="1.2" />
          </>
        )}
      </g>
    </svg>
  );
}

export function BrandMark() {
  return (
    <span className="brand-mark">
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path
          d="M10 32h22M13 27h17l-2-8 2-5-7-7-5 1-1 4-7 8 6 2 5-6-1 11"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="22" cy="12" r="1" fill="currentColor" />
      </svg>
    </span>
  );
}
