// Offline engine worker: runs the bundled single-threaded Stockfish WASM build
// inside a Web Worker with zero server dependency. Used by the installable
// apps (APK/EXE) and as a fallback when the engine service is unreachable.
//
// NOTE: this file uses a `.ts` suffix but is written dependency-free on
// purpose: Vite ships classic workers verbatim, so every import this file
// declares would arrive in the browser unresolved. Keep it that way.
//
// Protocol (all messages are plain JSON-serializable objects):
//   main -> worker: { id, type: 'start', fen, depth, multiPv, timeLimitMs }
//   main -> worker: { id, type: 'stop' }
//   worker -> main: { id, type: 'progress', lines }
//   worker -> main: { id, type: 'done', result } | { id, type: 'error', message }

import { Chess } from 'chess.js';
import { pvToSan, validPosition } from '../shared/chess.js';
import {
  applyOfflineInfo,
  completedOfflineDepth,
  createOfflineSearch,
  parseUciInfo,
  snapshotOfflineLines,
  type OfflineSearchState,
} from '../shared/uci-parse.js';
import type { AnalysisResult, Score, SearchSettings } from '../shared/types.js';

export interface OfflineStartRequest {
  id: string;
  type: 'start';
  fen: string;
  depth: number;
  multiPv: number;
  timeLimitMs: number;
}

export interface OfflineStopRequest {
  id: string;
  type: 'stop';
}

export interface OfflineProgress {
  id: string;
  type: 'progress';
  lines: ReturnType<typeof snapshotOfflineLines>;
}

export interface OfflineDone {
  id: string;
  type: 'done';
  result: AnalysisResult;
}

export interface OfflineFailure {
  id: string;
  type: 'error';
  message: string;
}

const ENGINE_NAME = 'Stockfish 19 Lite (offline)';

interface WorkerScope {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
  importScripts: (...urls: string[]) => void;
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void;
  location: { href: string };
  stockfishListener?: (line: string) => void;
}

declare const self: WorkerScope;

let engineLoaded = false;
let engineLoading: Promise<void> | null = null;
let engineInput: ((event: { data: string }) => void) | null = null;
let active:
  | {
      id: string;
      settings: SearchSettings;
      state: OfflineSearchState;
      chess: Chess;
      started: number;
      timer: ReturnType<typeof setTimeout> | undefined;
      lastUpdate: number;
    }
  | undefined;

function loadEngine(): Promise<void> {
  engineLoading ??= (async () => {
    // The engine files are copied to dist/client/engine by
    // scripts/copy-offline-engine.mjs during the build. The worker bundle
    // lives under /assets, so resolve from the origin root instead. The
    // client passes the WASM URL in the worker URL hash, which importScripts
    // preserves on self.location for the engine to read.
    const base = new URL('/engine/', self.location.href).href;
    const wasm = `${base}stockfish-19-lite-single.wasm`;
    const probe = await fetch(wasm, { method: 'HEAD' }).catch(() => null);
    if (!probe?.ok) throw new Error('Offline engine files are missing from this build.');
    // The engine reads its WASM URL from its own script URL hash: it falls
    // back to <script-url-minus-.js>.wasm when no hash is present. It only
    // installs its UCI handler when none is set, so clear ours first.
    const previousHandler: unknown = self.onmessage;
    self.onmessage = null;
    self.importScripts(`${base}stockfish-19-lite-single.js#${encodeURIComponent(wasm)},`);
    const installed: unknown = self.onmessage;
    if (typeof installed !== 'function' || installed === previousHandler) {
      self.onmessage = previousHandler as (event: MessageEvent) => void;
      throw new Error('Offline engine script did not register a message handler.');
    }
    engineInput = (installed as (event: { data: string }) => void).bind(self);
    self.onmessage = dispatchMessage;
    engineLoaded = true;
  })().catch((error: unknown) => {
    engineLoading = null;
    throw error instanceof Error ? error : new Error('Could not load the offline engine.');
  });
  return engineLoading;
}

function send(command: string): void {
  if (!engineLoaded || !engineInput) throw new Error('Offline engine is not running.');
  engineInput({ data: command });
}

function finishActive(bestMove: string | null): void {
  if (!active) return;
  const { id, settings, state, chess, started, timer } = active;
  if (timer) clearTimeout(timer);
  active = undefined;
  const fen = chess.fen();
  if (
    !bestMove ||
    !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove) ||
    !pvToSan(fen, [bestMove]).length
  ) {
    const failure: OfflineFailure = {
      id,
      type: 'error',
      message: 'Offline engine returned an invalid best move.',
    };
    self.postMessage(failure);
    return;
  }
  const lines = snapshotOfflineLines(state);
  if (!lines.length) {
    const failure: OfflineFailure = {
      id,
      type: 'error',
      message: 'Offline engine returned no scored principal variation.',
    };
    self.postMessage(failure);
    return;
  }
  const completedDepth = completedOfflineDepth(lines);
  const depthLimited = completedDepth === null || completedDepth < settings.depth;
  if (
    state.statistics.timeMs === 0 &&
    state.statistics.nodes !== null &&
    state.statistics.nodes > 0
  )
    state.statistics.nps = null;
  for (const line of lines) line.nps = state.statistics.nps;
  const missing = [
    ...(completedDepth === null ? ['depth'] : []),
    ...(['nodes', 'nps', 'timeMs'] as const).filter((key) => state.statistics[key] === null),
  ];
  const result: AnalysisResult = {
    engineId: 'stockfish-offline',
    engineName: ENGINE_NAME,
    fen,
    settings,
    effectiveOptions: { MultiPV: settings.multiPv },
    warnings: [
      'Offline search on this device: single-threaded build, results may differ from server runs.',
      ...(depthLimited ? ['The search ended without confirming the requested depth.'] : []),
      ...(missing.length
        ? [`Engine did not report: ${missing.join(', ')}. Missing measurements are null, not zero.`]
        : []),
    ],
    lines,
    bestMove,
    wallTimeMs: Math.round(performance.now() - started),
    completedDepth,
    depthLimited,
    terminal: false,
  };
  const done: OfflineDone = { id, type: 'done', result };
  self.postMessage(done);
}

function onEngineLine(line: string): void {
  if (!active) return;
  if (line === 'info WillOutputEngineDownloadProgress') return;
  if (line.startsWith('bestmove ')) {
    const bestMove = line.split(/\s+/)[1] ?? null;
    if (bestMove === '(none)') {
      finishActive(null);
      return;
    }
    finishActive(bestMove);
    return;
  }
  const parsed = parseUciInfo(line, active.chess.turn());
  if (!parsed) return;
  applyOfflineInfo(
    active.state,
    parsed,
    (pv) => pvToSan(active!.chess.fen(), pv),
    active.settings.multiPv,
  );
  const now = performance.now();
  if (active.state.variations.size && now - active.lastUpdate >= 150) {
    active.lastUpdate = now;
    const progress: OfflineProgress = {
      id: active.id,
      type: 'progress',
      lines: snapshotOfflineLines(active.state),
    };
    self.postMessage(progress);
  }
}

async function startSearch(request: OfflineStartRequest): Promise<void> {
  if (active) {
    try {
      send('stop');
    } catch {
      /* A stale search is already gone; continue with the new one. */
    }
    if (active.timer) clearTimeout(active.timer);
    const stale: OfflineFailure = { id: active.id, type: 'error', message: 'Search superseded.' };
    self.postMessage(stale);
    active = undefined;
  }
  const fen = request.fen;
  const chess = validPosition(fen);
  const depth = Math.max(1, Math.min(24, Math.floor(request.depth) || 1));
  const multiPv = Math.max(1, Math.min(5, Math.floor(request.multiPv) || 1));
  const timeLimitMs = Math.max(200, Math.min(30_000, Math.floor(request.timeLimitMs) || 2_000));
  const settings: SearchSettings = { depth, threads: 1, hash: 16, multiPv };
  if (chess.isCheckmate() || chess.isStalemate() || chess.isInsufficientMaterial()) {
    const score: Score = chess.isCheckmate()
      ? { type: 'mate', value: 0, winner: chess.turn() === 'w' ? 'b' : 'w' }
      : { type: 'cp', value: 0 };
    const done: OfflineDone = {
      id: request.id,
      type: 'done',
      result: {
        engineId: 'stockfish-offline',
        engineName: ENGINE_NAME,
        fen: chess.fen(),
        settings,
        effectiveOptions: { MultiPV: multiPv },
        warnings: ['Terminal position: no search was needed.'],
        lines: [
          {
            depth: 0,
            seldepth: 0,
            multiPv: 1,
            score,
            nodes: 0,
            nps: 0,
            timeMs: 0,
            hashfull: 0,
            pv: [],
            san: [],
          },
        ],
        bestMove: null,
        wallTimeMs: 0,
        completedDepth: 0,
        depthLimited: false,
        terminal: true,
      },
    };
    self.postMessage(done);
    return;
  }
  await loadEngine();
  active = {
    id: request.id,
    settings,
    state: createOfflineSearch(),
    chess,
    started: performance.now(),
    timer: undefined,
    lastUpdate: 0,
  };
  send('uci');
  send('ucinewgame');
  send(`position fen ${chess.fen()}`);
  send(`go depth ${depth} movetime ${timeLimitMs}`);
  active.timer = setTimeout(() => {
    if (!active || active.id !== request.id) return;
    try {
      send('stop');
    } catch {
      /* Engine already gone; the watchdog below reports it. */
    }
    setTimeout(() => {
      if (active?.id === request.id) {
        const id = active.id;
        if (active.timer) clearTimeout(active.timer);
        active = undefined;
        const failure: OfflineFailure = {
          id,
          type: 'error',
          message: 'Offline engine did not answer in time.',
        };
        self.postMessage(failure);
      }
    }, 3_000);
  }, timeLimitMs + 5_000);
}

function dispatchMessage(event: MessageEvent<OfflineStartRequest | OfflineStopRequest>) {
  const message = event.data;
  if (!message || typeof message !== 'object') return;
  if (message.type === 'stop') {
    if (active?.id === message.id) {
      try {
        send('stop');
      } catch {
        /* Already stopped. */
      }
      if (active.timer) clearTimeout(active.timer);
      const id = active.id;
      active = undefined;
      const failure: OfflineFailure = { id, type: 'error', message: 'Search stopped.' };
      self.postMessage(failure);
    }
    return;
  }
  if (message.type === 'start') {
    startSearch(message).catch((error: unknown) => {
      const failure: OfflineFailure = {
        id: message.id,
        type: 'error',
        message: error instanceof Error ? error.message : 'Offline search failed.',
      };
      self.postMessage(failure);
    });
  }
}

// Until the engine script installs its own handler, control messages wait.
self.onmessage = (event: MessageEvent<OfflineStartRequest | OfflineStopRequest>) => {
  if (!engineLoaded) {
    const message = event.data;
    if (message?.type === 'start') {
      loadEngine()
        .then(() => dispatchMessage(event))
        .catch((error: unknown) => {
          const failure: OfflineFailure = {
            id: message.id,
            type: 'error',
            message: error instanceof Error ? error.message : 'Offline engine failed to load.',
          };
          self.postMessage(failure);
        });
    }
    return;
  }
  dispatchMessage(event);
};

// The Stockfish script answers with postMessage(string), which arrives here
// as a message event on this same scope. Engine lines are strings; our own
// protocol replies are objects posted below, which we must not feed back.
self.addEventListener('message', (event: MessageEvent) => {
  if (typeof event.data === 'string') onEngineLine(event.data);
});

const workerPostMessage = self.postMessage.bind(self);
self.postMessage = ((message: unknown) => {
  if (typeof message === 'string') {
    onEngineLine(message);
    return;
  }
  workerPostMessage(message);
}) as typeof self.postMessage;
