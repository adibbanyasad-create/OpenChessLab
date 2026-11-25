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

export function parseInfo(line: string, turn: 'w' | 'b'): Omit<EngineLine, 'san'> | undefined {
  if (!line.startsWith('info ') || line.startsWith('info string ')) return;
  const tokens = line.trim().split(/\s+/);
  const number = (name: string, fallback = 0): number => {
    const index = tokens.indexOf(name);
    if (index < 0) return fallback;
    const value = Number(tokens[index + 1]);
    return Number.isSafeInteger(value) ? value : fallback;
  };
  const index = tokens.indexOf('score');
  const type = tokens[index + 1];
  const rawScore = Number(tokens[index + 2]);
  const pvIndex = tokens.indexOf('pv');
  if (
    index < 0 ||
    !['cp', 'mate'].includes(type ?? '') ||
    !Number.isSafeInteger(rawScore) ||
    Math.abs(rawScore) > 100_000 ||
    pvIndex < 0
  )
    return;
  const value = rawScore * (turn === 'w' ? 1 : -1);
  const score: Score =
    type === 'cp'
      ? { type: 'cp', value }
      : {
          type: 'mate',
          value,
          winner: rawScore > 0 ? turn : turn === 'w' ? 'b' : 'w',
        };
  const rawBound = tokens.includes('lowerbound')
    ? 'lower'
    : tokens.includes('upperbound')
      ? 'upper'
      : undefined;
  const bound = turn === 'b' && rawBound ? (rawBound === 'lower' ? 'upper' : 'lower') : rawBound;
  return {
    depth: Math.max(0, number('depth')),
    seldepth: Math.max(0, number('seldepth')),
    multiPv: Math.max(1, number('multipv', 1)),
    score,
    nodes: Math.max(0, number('nodes')),
    nps: Math.max(0, number('nps')),
    timeMs: Math.max(0, number('time')),
    hashfull: Math.max(0, Math.min(1000, number('hashfull'))),
    pv: tokens
      .slice(pvIndex + 1, pvIndex + 65)
      .filter((move) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)),
    ...(bound ? { bound } : {}),
  };
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
      fen,
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
    let lastUpdate = 0;
    const infoListener = (line: string) => {
      const parsed = parseInfo(line, chess.turn());
      if (!parsed || parsed.bound || parsed.multiPv > (this.effectiveOptions.MultiPV ?? 1)) return;
      const san = pvToSan(fen, parsed.pv);
      if (!san.length) return;
      variations.set(parsed.multiPv, { ...parsed, pv: parsed.pv.slice(0, san.length), san });
      if (performance.now() - lastUpdate >= 100) {
        onProgress?.([...variations.values()].sort((a, b) => a.multiPv - b.multiPv));
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
      const lines = [...variations.values()].sort((a, b) => a.multiPv - b.multiPv);
      if (!lines.length) throw new EngineError('Engine returned no scored principal variation.');
      const completedDepth = Math.min(...lines.map((line) => line.depth));
      const depthLimited = completedDepth < settings.depth;
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
          ...(depthLimited ? ['Time limit reached before the requested depth.'] : []),
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
