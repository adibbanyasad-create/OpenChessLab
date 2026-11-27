import { useCallback, useEffect, useRef, useState } from 'react';
import type { AnalysisResult, EngineLine } from '../shared/types';
import type {
  OfflineDone,
  OfflineFailure,
  OfflineProgress,
  OfflineStartRequest,
} from './engine-worker';

// Client-side handle for the offline Stockfish Web Worker. Mirrors the
// useRemoteJob shape (job state, busy, error, stopped, run, cancel) so the
// analysis view can swap engines without changing its data flow.

let worker: Worker | null = null;
let workerFailed = false;

function getWorker(): Worker | null {
  if (worker || workerFailed || typeof Worker === 'undefined') return worker;
  try {
    // Classic worker on purpose: the Stockfish script loads through
    // importScripts, which module workers do not support. The engine reads
    // its WASM URL from the worker's own location hash at import time.
    const url = new URL('./engine-worker.ts', import.meta.url);
    url.hash = `#${encodeURIComponent(new URL('/engine/stockfish-19-lite-single.wasm', url).href)},`;
    worker = new Worker(url, { type: 'classic' });
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

export function isOfflineEngineAvailable(): boolean {
  return typeof Worker !== 'undefined' && !workerFailed;
}

export function useOfflineJob() {
  const [lines, setLines] = useState<EngineLine[]>([]);
  const [result, setResult] = useState<AnalysisResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stopped, setStopped] = useState(false);
  const current = useRef<{ id: string; finish: (result?: AnalysisResult) => void } | null>(null);
  const sequence = useRef(0);

  useEffect(() => {
    const instance = getWorker();
    if (!instance) return;
    const onMessage = (event: MessageEvent<OfflineProgress | OfflineDone | OfflineFailure>) => {
      const message = event.data;
      const live = current.current;
      if (!live || !message || message.id !== live.id) return;
      if (message.type === 'progress') setLines(message.lines);
      else if (message.type === 'done') {
        current.current = null;
        setLines(message.result.lines);
        setResult(message.result);
        setBusy(false);
        live.finish(message.result);
      } else {
        current.current = null;
        setBusy(false);
        if (message.message === 'Search stopped.' || message.message === 'Search superseded.') {
          setStopped(true);
        } else {
          setError(message.message);
        }
        live.finish(undefined);
      }
    };
    const onError = () => {
      workerFailed = true;
      const live = current.current;
      current.current = null;
      setBusy(false);
      setError('The offline engine failed to start on this device.');
      live?.finish(undefined);
    };
    instance.addEventListener('message', onMessage);
    instance.addEventListener('error', onError);
    return () => {
      instance.removeEventListener('message', onMessage);
      instance.removeEventListener('error', onError);
    };
  }, []);

  const cancel = useCallback(() => {
    sequence.current++;
    const live = current.current;
    current.current = null;
    setBusy(false);
    setStopped(true);
    if (live) {
      getWorker()?.postMessage({ id: live.id, type: 'stop' });
      live.finish(undefined);
    }
  }, []);

  const run = useCallback(
    (request: {
      fen: string;
      depth: number;
      multiPv: number;
      timeLimitMs?: number;
    }): Promise<AnalysisResult | undefined> => {
      const instance = getWorker();
      if (!instance) {
        setError('Offline analysis needs Web Workers, which this browser blocks.');
        return Promise.resolve(undefined);
      }
      const previous = current.current;
      if (previous) {
        instance.postMessage({ id: previous.id, type: 'stop' });
        previous.finish(undefined);
      }
      sequence.current++;
      const id =
        typeof crypto?.randomUUID === 'function'
          ? crypto.randomUUID()
          : `offline-${Date.now()}-${sequence.current}`;
      return new Promise<AnalysisResult | undefined>((resolve) => {
        current.current = { id, finish: resolve };
        setBusy(true);
        setStopped(false);
        setError('');
        setLines([]);
        setResult(undefined);
        const start: OfflineStartRequest = {
          id,
          type: 'start',
          fen: request.fen,
          depth: request.depth,
          multiPv: request.multiPv,
          timeLimitMs: request.timeLimitMs ?? 2_000,
        };
        instance.postMessage(start);
      });
    },
    [],
  );

  useEffect(
    () => () => {
      sequence.current++;
      const live = current.current;
      current.current = null;
      if (live) {
        getWorker()?.postMessage({ id: live.id, type: 'stop' });
        live.finish(undefined);
      }
    },
    [],
  );

  return { lines, result, busy, error, stopped, run, cancel };
}
