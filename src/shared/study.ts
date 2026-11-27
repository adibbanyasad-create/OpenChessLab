import { pvToSan } from './chess.js';
import { csvCell } from './csv.js';
import type { GameData, ReviewResult } from './types.js';

/**
 * Exports all blunders, mistakes, and misses from a game review as a
 * study-ready PGN collection. Each puzzle starts from the FEN prior to the
 * error, annotates what was played and the refutation in comments, and provides
 * the engine's best move as the solution.
 */
export function exportBlunderStudyPgn(game: GameData, review: ReviewResult): string {
  const errors = review.annotations.filter(
    (annotation) =>
      !annotation.uncertain &&
      ['blunder', 'mistake', 'miss'].includes(annotation.classification) &&
      annotation.bestMove,
  );
  if (!errors.length) return '';

  const chapters: string[] = [];
  for (const annotation of errors) {
    const fenBefore = game.positions[annotation.ply - 1];
    if (!fenBefore) continue;
    const move = game.moves[annotation.ply - 1];
    const colorName = move?.color === 'w' ? 'White' : 'Black';
    const bestSan = pvToSan(fenBefore, [annotation.bestMove!])[0] ?? annotation.bestMove!;
    const refutationText = annotation.refutation
      ? ` Opponent's refutation: ${annotation.refutation.lineSan.join(' ')}.`
      : '';
    const lossText = annotation.lossCp !== null ? ` (lost ~${annotation.lossCp} cp)` : '';

    const headers = [
      `[Event "OpenChessLab Study: ${game.headers.Event || 'Game'} - Move ${Math.floor((annotation.ply - 1) / 2) + 1}"]`,
      `[Site "${game.headers.Site || 'Local'}"]`,
      `[Date "${game.headers.Date || '????.??.??'}"]`,
      `[Round "${annotation.ply}"]`,
      `[White "${game.headers.White || 'White'}"]`,
      `[Black "${game.headers.Black || 'Black'}"]`,
      `[Result "*"]`,
      `[SetUp "1"]`,
      `[FEN "${fenBefore}"]`,
    ];

    const comment = `{ ${colorName} played ${annotation.san} which was a ${annotation.classification}${lossText}.${refutationText} Best continuation was: }`;
    const moveNumber = Math.floor((annotation.ply - 1) / 2) + 1;
    const movePrefix = move?.color === 'w' ? `${moveNumber}. ` : `${moveNumber}... `;
    const body = `${comment}\n${movePrefix}${bestSan} *`;

    chapters.push(`${headers.join('\n')}\n\n${body}`);
  }

  return chapters.join('\n\n') + '\n';
}

/**
 * Exports all blunders, mistakes, and misses from a game review into a
 * standard Anki flashcard CSV (Front, Back, Tags) ready for spaced repetition.
 */
export function exportBlunderAnkiCsv(game: GameData, review: ReviewResult): string {
  const errors = review.annotations.filter(
    (annotation) =>
      !annotation.uncertain &&
      ['blunder', 'mistake', 'miss'].includes(annotation.classification) &&
      annotation.bestMove,
  );

  const headers = ['Front', 'Back', 'Tags'];
  const rows: string[] = [];

  for (const annotation of errors) {
    const fenBefore = game.positions[annotation.ply - 1];
    if (!fenBefore) continue;
    const move = game.moves[annotation.ply - 1];
    const colorName = move?.color === 'w' ? 'White' : 'Black';
    const bestSan = pvToSan(fenBefore, [annotation.bestMove!])[0] ?? annotation.bestMove!;
    const refutationText = annotation.refutation
      ? `<p class="refutation">Opponent punishment: <strong>${annotation.refutation.lineSan.join(' ')}</strong></p>`
      : '';
    const moveNumber = Math.floor((annotation.ply - 1) / 2) + 1;

    const front = `<div class="ocl-anki"><div class="badge">${colorName} to move</div><h3>Move ${moveNumber} Puzzle</h3><p>In game: <span class="error">${annotation.san}</span> (${annotation.classification})</p><pre class="fen">${fenBefore}</pre></div>`;
    const back = `<div class="ocl-anki"><h3>Best move: <span class="solution">${bestSan}</span></h3>${refutationText}</div>`;
    const tags = `openchesslab blunder-puzzle ${annotation.classification} ${move?.color === 'w' ? 'white' : 'black'}`;

    rows.push([front, back, tags].map(csvCell).join(','));
  }

  return [headers.join(','), ...rows].join('\r\n') + '\r\n';
}
