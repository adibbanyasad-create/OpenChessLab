export type Score =
  { type: 'cp'; value: number } | { type: 'mate'; value: number; winner: 'w' | 'b' };
export type Classification = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

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

export interface SearchSettings {
  depth: number;
  threads: number;
  hash: number;
  multiPv: number;
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

export interface ReviewAnnotation {
  ply: number;
  san: string;
  classification: Classification;
  lossCp: number;
  bestMove: string | null;
}

export interface ReviewResult {
  engineId: string;
  settings: SearchSettings;
  scores: { ply: number; score: Score; depth: number | null; depthLimited: boolean }[];
  annotations: ReviewAnnotation[];
  elapsedMs: number;
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

export interface BenchmarkResult {
  id: string;
  appVersion?: string;
  createdAt: string;
  settings: SearchSettings;
  rows: BenchmarkRow[];
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
