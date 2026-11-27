import type { EngineLine, Score } from './types.js';

// Browser-safe UCI info-line parsing shared by the server transport and the
// offline Web Worker engine. Scores are normalized to White's perspective:
// centipawns flip sign for Black to move, and mate distances keep an explicit
// winner so mate-zero is never ambiguous.

export interface ParsedInfo {
  multiPv: number;
  depth?: number;
  seldepth?: number;
  nodes?: number;
  nps?: number;
  timeMs?: number;
  hashfull?: number;
  score?: Score;
  bound?: 'lower' | 'upper';
  pv?: string[];
}

const MAX_UCI_NUMBER = 1_000_000_000_000_000;

function boundedNumber(tokens: string[], name: string, maximum: number): number | undefined {
  const index = tokens.indexOf(name);
  if (index < 0) return undefined;
  const raw = tokens[index + 1];
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) return undefined;
  return value;
}

export function parseUciInfo(line: string, turn: 'w' | 'b'): ParsedInfo | undefined {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'info') return undefined;
  const textStart = tokens.indexOf('string');
  if (textStart >= 0) tokens.length = textStart;
  const multiPv = boundedNumber(tokens, 'multipv', 1024);
  if (tokens.includes('multipv') && (multiPv === undefined || multiPv < 1)) return undefined;
  const info: ParsedInfo = { multiPv: multiPv ?? 1 };
  const depth = boundedNumber(tokens, 'depth', 1024);
  if (depth !== undefined) info.depth = depth;
  const seldepth = boundedNumber(tokens, 'seldepth', 4096);
  if (seldepth !== undefined) info.seldepth = seldepth;
  const nodes = boundedNumber(tokens, 'nodes', MAX_UCI_NUMBER);
  if (nodes !== undefined) info.nodes = nodes;
  const nps = boundedNumber(tokens, 'nps', MAX_UCI_NUMBER);
  if (nps !== undefined) info.nps = nps;
  const timeMs = boundedNumber(tokens, 'time', MAX_UCI_NUMBER);
  if (timeMs !== undefined) info.timeMs = timeMs;
  const hashfull = boundedNumber(tokens, 'hashfull', 1000);
  if (hashfull !== undefined) info.hashfull = hashfull;
  const index = tokens.indexOf('score');
  const type = tokens[index + 1];
  const scoreText = tokens[index + 2] ?? '';
  const rawScore = Number(scoreText);
  if (
    index >= 0 &&
    /^[+-]?\d+$/.test(scoreText) &&
    (type === 'cp' || type === 'mate') &&
    Number.isSafeInteger(rawScore) &&
    Math.abs(rawScore) <= 100_000
  ) {
    const value = rawScore === 0 ? 0 : rawScore * (turn === 'w' ? 1 : -1);
    info.score =
      type === 'cp'
        ? { type: 'cp', value }
        : { type: 'mate', value, winner: rawScore > 0 ? turn : turn === 'w' ? 'b' : 'w' };
  }
  const rawBound = tokens.includes('lowerbound')
    ? 'lower'
    : tokens.includes('upperbound')
      ? 'upper'
      : undefined;
  if (rawBound) info.bound = turn === 'b' ? (rawBound === 'lower' ? 'upper' : 'lower') : rawBound;
  const pvIndex = tokens.indexOf('pv');
  if (pvIndex >= 0) {
    const pv: string[] = [];
    for (const move of tokens.slice(pvIndex + 1, pvIndex + 65)) {
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) break;
      pv.push(move);
    }
    if (pv.length) info.pv = pv;
  }
  return Object.keys(info).length > 1 ? info : undefined;
}

export interface OfflineLine extends Omit<EngineLine, 'san'> {
  san: string[];
}

export interface OfflineSearchState {
  variations: Map<number, OfflineLine>;
  statistics: Pick<EngineLine, 'nodes' | 'nps' | 'timeMs' | 'hashfull'>;
  depth: number | null;
  seldepth: number | null;
}

export function createOfflineSearch(): OfflineSearchState {
  return {
    variations: new Map(),
    statistics: { nodes: null, nps: null, timeMs: null, hashfull: null },
    depth: null,
    seldepth: null,
  };
}

// Applies one parsed info record to the search state. Mirrors the server's
// accumulation rules: statistics ride separately from scored variations, one
// variation's depth is never borrowed for another, bound-only lines are not
// scored, and missing measurements stay null.
export function applyOfflineInfo(
  state: OfflineSearchState,
  parsed: ParsedInfo,
  toSan: (pv: string[]) => string[],
  multiPv: number,
): void {
  const singlePv = multiPv <= 1;
  if (singlePv && parsed.multiPv === 1 && !parsed.score && !parsed.pv) {
    if (parsed.depth !== undefined) state.depth = parsed.depth;
    if (parsed.seldepth !== undefined) state.seldepth = parsed.seldepth;
  }
  for (const key of ['nodes', 'nps', 'timeMs', 'hashfull'] as const) {
    if (parsed[key] !== undefined) state.statistics[key] = parsed[key] ?? null;
  }
  if (!parsed.score || !parsed.pv?.length || parsed.bound || parsed.multiPv > multiPv) return;
  const san = toSan(parsed.pv);
  if (!san.length) return;
  state.variations.set(parsed.multiPv, {
    depth: parsed.depth ?? (singlePv ? state.depth : null),
    seldepth: parsed.seldepth ?? (singlePv ? state.seldepth : null),
    multiPv: parsed.multiPv,
    score: parsed.score,
    nodes: state.statistics.nodes,
    nps: state.statistics.nps,
    timeMs: state.statistics.timeMs,
    hashfull: state.statistics.hashfull,
    pv: parsed.pv.slice(0, san.length),
    san,
  });
}

export function snapshotOfflineLines(state: OfflineSearchState): OfflineLine[] {
  return [...state.variations.values()]
    .sort((a, b) => a.multiPv - b.multiPv)
    .map((variation) => ({ ...variation, ...state.statistics }));
}

export function completedOfflineDepth(lines: OfflineLine[]): number | null {
  const depths = lines.map((line) => line.depth);
  if (!depths.length || depths.some((value) => value === null)) return null;
  return Math.min(...(depths as number[]));
}
