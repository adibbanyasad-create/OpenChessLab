export type Score =
  { type: 'cp'; value: number } | { type: 'mate'; value: number; winner: 'w' | 'b' };
export type Classification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

export interface GameMove {
  ply: number;
  san: string;
  from: string;
  to: string;
  color: 'w' | 'b';
  promotion?: string;
  before: string;
  after: string;
}

export interface GameData {
  headers: Record<string, string>;
  pgn: string;
  initialFen: string;
  positions: string[];
  moves: GameMove[];
}

export interface EngineDescriptor {
  id: string;
  name: string;
  description: string;
  kind: 'wasm' | 'native';
}

export type UciOption =
  | { name: string; type: 'spin'; value: number; min: number; max: number }
  | { name: string; type: 'check'; value: boolean }
  | { name: string; type: 'combo'; value: string; choices: string[] }
  | { name: string; type: 'string'; value: string }
  | { name: string; type: 'button' };

export interface EngineCapabilities {
  id: string;
  name: string;
  options: UciOption[];
  warnings: string[];
}

export interface SearchSettings {
  depth: number;
  threads: number;
  hash: number;
  multiPv: number;
  options?: Record<string, string | number | boolean>;
}

export interface HardwareRecommendation {
  threads: number;
  hashMb: number;
  logicalCpus: number;
  totalMemoryMb: number | null;
  reasons: string[];
}

export interface EngineLine {
  depth: number | null;
  seldepth: number | null;
  multiPv: number;
  score: Score;
  nodes: number | null;
  nps: number | null;
  timeMs: number | null;
  hashfull: number | null;
  pv: string[];
  san: string[];
  bound?: 'lower' | 'upper';
}

export interface AnalysisResult {
  engineId: string;
  engineName: string;
  fen: string;
  settings: SearchSettings;
  effectiveOptions: Record<string, number>;
  warnings: string[];
  lines: EngineLine[];
  bestMove: string | null;
  wallTimeMs: number;
  completedDepth: number | null;
  depthLimited: boolean;
  terminal: boolean;
}

export interface ReviewRefutation {
  punishmentMove: string;
  punishmentSan: string;
  lineSan: string[];
}

export interface ReviewAnnotation {
  ply: number;
  san: string;
  classification: Classification;
  lossCp: number | null;
  bestMove: string | null;
  uncertain: boolean;
  phase: 'opening' | 'middlegame' | 'endgame';
  bookMove: boolean;
  refutation?: ReviewRefutation;
}

export interface ReviewPlayerSummary {
  color: 'w' | 'b';
  moves: number;
  confidentMoves: number;
  uncertainMoves: number;
  averageLossCp: number | null;
  accuracy: number | null;
  counts: Record<Classification, number>;
}

export interface ReviewSummary {
  opening?: { name: string; eco?: string; plies: number };
  white: ReviewPlayerSummary;
  black: ReviewPlayerSummary;
}

export interface ReviewResult {
  engineId: string;
  settings: SearchSettings;
  scores: { ply: number; score: Score; depth: number | null; depthLimited: boolean }[];
  annotations: ReviewAnnotation[];
  summary?: ReviewSummary;
  elapsedMs: number;
  warnings?: string[];
}

export interface BenchmarkComparison {
  meanCp: number | null;
  disagreementCp: number | null;
  mateCount: number;
  missingScoreCount: number;
}

export interface BenchmarkRow {
  engineId: string;
  engineName: string;
  position: string;
  fen: string;
  depth: number | null;
  requestedDepth: number;
  depthLimited: boolean;
  nodes: number | null;
  nps: number | null;
  engineTimeMs: number | null;
  wallTimeMs: number;
  score: Score;
  bestMove: string | null;
  effectiveOptions: Record<string, number>;
  warnings: string[];
}

export interface BenchmarkSuiteRef {
  id: string;
  version: number;
  sha256: string;
}

export interface BenchmarkResult {
  id: string;
  appVersion?: string;
  createdAt: string;
  settings: SearchSettings;
  rows: BenchmarkRow[];
  comparisons?: Record<string, BenchmarkComparison>;
  suite?: BenchmarkSuiteRef;
  environment: { platform: string; arch: string; cpus: number; node: string };
}

export type JobResult = AnalysisResult | ReviewResult | BenchmarkResult;
export type JobKind = 'analysis' | 'review' | 'benchmark';
export type JobStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface JobProgress {
  completed: number;
  total: number;
  message: string;
  lines?: EngineLine[];
}

export interface Job<T extends JobResult = JobResult> {
  id: string;
  kind: JobKind;
  status: JobStatus;
  createdAt: string;
  finishedAt?: string;
  progress: JobProgress;
  result?: T;
  error?: string;
}
