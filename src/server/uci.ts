import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { pvToSan, validPosition } from '../shared/chess.js';
import type { AnalysisResult, EngineLine, Score, SearchSettings } from '../shared/types.js';
import type { EngineConfig } from './config.js';
import { EngineError } from './errors.js';

interface SpinOption {
  min: number;
  max: number;
}
interface Waiter {
  accept: (line: string) => boolean;
  resolve: (line: string) => void;
  reject: (error: Error) => void;
}

type UciInfo = Partial<Omit<EngineLine, 'san'>> & { multiPv: number };

export function parseInfo(line: string, turn: 'w' | 'b'): UciInfo | undefined {
  const tokens = line.trim().split(/\s+/);
  if (tokens[0] !== 'info') return;
  const textStart = tokens.indexOf('string');
  if (textStart >= 0) tokens.length = textStart;
  const number = (name: string, maximum = Number.MAX_SAFE_INTEGER): number | undefined => {
    const index = tokens.indexOf(name);
    if (index < 0) return;
    const raw = tokens[index + 1];
    if (!raw || !/^\d+$/.test(raw)) return;
    const value = Number(raw);
    return Number.isSafeInteger(value) && value >= 0 && value <= maximum ? value : undefined;
  };
  const multiPv = number('multipv', 1024);
  if (tokens.includes('multipv') && (multiPv === undefined || multiPv < 1)) return;
  const info: UciInfo = { multiPv: multiPv ?? 1 };
  for (const [field, keyword, maximum] of [
    ['depth', 'depth', 1024],
    ['seldepth', 'seldepth', 4096],
    ['nodes', 'nodes', Number.MAX_SAFE_INTEGER],
    ['nps', 'nps', Number.MAX_SAFE_INTEGER],
    ['timeMs', 'time', Number.MAX_SAFE_INTEGER],
    ['hashfull', 'hashfull', 1000],
  ] as const) {
    const value = number(keyword, maximum);
    if (value !== undefined) info[field] = value;
  }
  const index = tokens.indexOf('score');
  const type = tokens[index + 1];
  const scoreText = tokens[index + 2] ?? '';
  const rawScore = Number(scoreText);
  const pvIndex = tokens.indexOf('pv');
  if (
    index >= 0 &&
    /^[+-]?\d+$/.test(scoreText) &&
    ['cp', 'mate'].includes(type ?? '') &&
    Number.isSafeInteger(rawScore) &&
    Math.abs(rawScore) <= 100_000
  ) {
    const value = rawScore === 0 ? 0 : rawScore * (turn === 'w' ? 1 : -1);
    info.score =
      type === 'cp'
        ? { type: 'cp', value }
        : {
            type: 'mate',
            value,
            winner: rawScore > 0 ? turn : turn === 'w' ? 'b' : 'w',
          };
  }
  const rawBound = tokens.includes('lowerbound')
    ? 'lower'
    : tokens.includes('upperbound')
      ? 'upper'
      : undefined;
  if (rawBound) info.bound = turn === 'b' ? (rawBound === 'lower' ? 'upper' : 'lower') : rawBound;
  if (pvIndex >= 0) {
    info.pv = [];
    for (const move of tokens.slice(pvIndex + 1, pvIndex + 65)) {
      if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) break;
      info.pv.push(move);
    }
  }
  return Object.keys(info).length > 1 ? info : undefined;
}

export class UciEngine {
  private child?: ChildProcessWithoutNullStreams;
  private failure?: Error;
  private exited = false;
  private buffer = '';
  private waiters = new Set<Waiter>();
  private listeners = new Set<(line: string) => void>();
  private options = new Map<string, SpinOption>();
  private closing?: Promise<void>;
  private runtimeName: string;
  private settings?: SearchSettings;
  private effectiveOptions: Record<string, number> = {};
  private warnings: string[] = [];

  constructor(private readonly config: EngineConfig) {
    this.runtimeName = config.name;
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    for (const waiter of [...this.waiters]) waiter.reject(error);
    this.child?.kill('SIGKILL');
  }

  private onLine(line: string): void {
    if (line.startsWith('id name ')) this.runtimeName = line.slice(8, 128);
    const option = /^option name (.+?) type spin .*?min (-?\d+) max (-?\d+)/.exec(line);
    if (option?.[1])
      this.options.set(option[1].toLowerCase(), { min: Number(option[2]), max: Number(option[3]) });
    for (const waiter of [...this.waiters]) if (waiter.accept(line)) waiter.resolve(line);
    for (const listener of this.listeners) listener(line);
  }

  private send(command: string): void {
    if (this.failure) throw this.failure;
    if (!this.child || this.exited || !this.child.stdin.writable)
      throw new EngineError('Engine is not running.');
    if (/[\r\n\0]/.test(command)) throw new EngineError('Invalid UCI command.');
    this.child.stdin.write(command + '\n');
  }

  private waitFor(
    accept: (line: string) => boolean,
    command: string,
    timeoutMs: number,
    signal: AbortSignal,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      if (this.failure) {
        reject(this.failure);
        return;
      }
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        this.waiters.delete(waiter);
      };
      const waiter: Waiter = {
        accept,
        resolve: (line) => {
          cleanup();
          resolve(line);
        },
        reject: (error) => {
          cleanup();
          reject(error);
        },
      };
      const onAbort = () =>
        waiter.reject(
          signal.reason instanceof Error ? signal.reason : new EngineError('Search cancelled.'),
        );
      const timer = setTimeout(
        () =>
          waiter.reject(
            new EngineError('Engine response timed out. The process has been stopped.'),
          ),
        timeoutMs,
      );
      this.waiters.add(waiter);
      signal.addEventListener('abort', onAbort, { once: true });
      try {
        this.send(command);
      } catch (error) {
        waiter.reject(
          error instanceof Error ? error : new EngineError('Could not send UCI command.'),
        );
      }
    });
  }

  async start(settings: SearchSettings, signal: AbortSignal): Promise<void> {
    if (this.child) throw new EngineError('Engine has already been started.');
    signal.throwIfAborted();
    this.settings = {
      depth: settings.depth,
      threads: settings.threads,
      hash: settings.hash,
      multiPv: settings.multiPv,
    };
    this.child = spawn(this.config.command, this.config.args, {
      shell: false,
      windowsHide: true,
      stdio: 'pipe',
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      if (this.buffer.length > 262_144) {
        this.fail(new EngineError('Engine output exceeded the safety limit.'));
        return;
      }
      let end: number;
      while ((end = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, end).trim();
        this.buffer = this.buffer.slice(end + 1);
        this.onLine(line);
      }
    });
    // Drain stderr without retaining unbounded or potentially sensitive engine output.
    this.child.stderr.resume();
    this.child.stdin.on('error', () =>
      this.fail(new EngineError('The engine input stream closed unexpectedly.')),
    );
    this.child.on('error', () =>
      this.fail(
        new EngineError('Could not start the engine. Check the server-side engine configuration.'),
      ),
    );
    this.child.on('exit', () => {
      this.exited = true;
      if (!this.closing) this.fail(new EngineError('The engine exited unexpectedly.'));
    });
    await this.waitFor((line) => line === 'uciok', 'uci', 20_000, signal);
    for (const [name, value] of Object.entries({
      Threads: settings.threads,
      Hash: settings.hash,
      MultiPV: settings.multiPv,
    })) {
      const option = this.options.get(name.toLowerCase());
      if (!option) {
        this.warnings.push(`${name} is not advertised by this engine; its default is used.`);
        continue;
      }
      if (value < option.min || value > option.max)
        throw new EngineError(
          `${name} must be between ${option.min} and ${option.max} for this engine.`,
        );
      this.send(`setoption name ${name} value ${value}`);
      this.effectiveOptions[name] = value;
    }
    await this.waitFor((line) => line === 'readyok', 'isready', 15_000, signal);
  }

  async analyze(
    fen: string,
    signal: AbortSignal,
    onProgress?: (lines: EngineLine[]) => void,
    timeLimitMs = 8_000,
  ): Promise<AnalysisResult> {
    signal.throwIfAborted();
    const settings = this.settings;
    if (!settings) throw new EngineError('Start the engine before searching.');
    const chess = validPosition(fen);
    const started = performance.now();
    const base = {
      engineId: this.config.id,
      engineName: this.runtimeName,
      fen: chess.fen(),
      settings,
      effectiveOptions: { ...this.effectiveOptions },
      warnings: [...this.warnings],
    };
    if (chess.isCheckmate() || chess.isStalemate() || chess.isInsufficientMaterial()) {
      const score: Score = chess.isCheckmate()
        ? { type: 'mate', value: 0, winner: chess.turn() === 'w' ? 'b' : 'w' }
        : { type: 'cp', value: 0 };
      const line: EngineLine = {
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
      };
      return {
        ...base,
        lines: [line],
        bestMove: null,
        wallTimeMs: 0,
        completedDepth: 0,
        depthLimited: false,
        terminal: true,
      };
    }
    this.send('ucinewgame');
    await this.waitFor((line) => line === 'readyok', 'isready', 5_000, signal);
    this.send(`position fen ${chess.fen()}`);
    const variations = new Map<number, EngineLine>();
    const statistics: Pick<EngineLine, 'nodes' | 'nps' | 'timeMs' | 'hashfull'> = {
      nodes: null,
      nps: null,
      timeMs: null,
      hashfull: null,
    };
    let depth: number | null = null;
    let seldepth: number | null = null;
    const singlePv = (this.effectiveOptions.MultiPV ?? 1) === 1;
    const snapshot = () =>
      [...variations.values()]
        .sort((a, b) => a.multiPv - b.multiPv)
        .map((variation) => ({ ...variation, ...statistics }));
    let lastUpdate = 0;
    const infoListener = (line: string) => {
      const parsed = parseInfo(line, chess.turn());
      if (!parsed) return;
      // A PV's own depth must not become an inferred measurement for another PV.
      if (singlePv && parsed.multiPv === 1 && !parsed.score && !parsed.pv) {
        if (parsed.depth !== undefined) depth = parsed.depth;
        if (parsed.seldepth !== undefined) seldepth = parsed.seldepth;
      }
      for (const key of ['nodes', 'nps', 'timeMs', 'hashfull'] as const) {
        if (parsed[key] !== undefined) statistics[key] = parsed[key];
      }
      if (
        parsed.score &&
        parsed.pv?.length &&
        !parsed.bound &&
        parsed.multiPv <= (this.effectiveOptions.MultiPV ?? 1)
      ) {
        const san = pvToSan(fen, parsed.pv);
        if (san.length)
          variations.set(parsed.multiPv, {
            depth: parsed.depth ?? (singlePv ? depth : null),
            seldepth: parsed.seldepth ?? (singlePv ? seldepth : null),
            multiPv: parsed.multiPv,
            score: parsed.score,
            ...statistics,
            pv: parsed.pv.slice(0, san.length),
            san,
          });
      }
      if (variations.size && performance.now() - lastUpdate >= 100) {
        onProgress?.(snapshot());
        lastUpdate = performance.now();
      }
    };
    this.listeners.add(infoListener);
    try {
      const best = await this.waitFor(
        (line) => line.startsWith('bestmove '),
        `go depth ${settings.depth} movetime ${timeLimitMs}`,
        timeLimitMs + 5_000,
        signal,
      );
      const bestMove = best.split(/\s+/)[1] ?? null;
      if (
        !bestMove ||
        !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(bestMove) ||
        !pvToSan(fen, [bestMove]).length
      )
        throw new EngineError('Engine returned an invalid best move.');
      const lines = snapshot();
      if (!lines.length) throw new EngineError('Engine returned no scored principal variation.');
      const depths = lines.map((line) => line.depth);
      const completedDepth = depths.every((value) => value !== null) ? Math.min(...depths) : null;
      const depthLimited = completedDepth === null || completedDepth < settings.depth;
      const missing = [
        ...(completedDepth === null ? ['depth'] : []),
        ...(['nodes', 'nps', 'timeMs'] as const).filter((key) => statistics[key] === null),
      ];
      return {
        ...base,
        lines,
        bestMove,
        completedDepth,
        depthLimited,
        terminal: false,
        wallTimeMs: Math.round(performance.now() - started),
        warnings: [
          ...base.warnings,
          ...(depthLimited ? ['The search ended without confirming the requested depth.'] : []),
          ...(missing.length
            ? [
                `Engine did not report: ${missing.join(', ')}. Missing measurements are null, not zero.`,
              ]
            : []),
        ],
      };
    } finally {
      this.listeners.delete(infoListener);
    }
  }

  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closing = new Promise((resolve) => {
      const child = this.child;
      if (!child || this.exited || !child.pid) {
        resolve();
        return;
      }
      for (const waiter of [...this.waiters]) waiter.reject(new EngineError('Engine stopped.'));
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
      }, 200);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      if (child.stdin.writable) child.stdin.write('quit\n', () => undefined);
      else child.kill('SIGKILL');
    });
    return this.closing;
  }
}
