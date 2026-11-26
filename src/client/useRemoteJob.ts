import { useCallback, useEffect, useRef, useState } from 'react';
import type { Job, JobResult } from '../shared/types';
import { api, followJob } from './api';

export function useRemoteJob<T extends JobResult>() {
  const [job, setJob] = useState<Job<T>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stopped, setStopped] = useState(false);
  const current = useRef<{ controller: AbortController; id?: string } | null>(null);
  const sequence = useRef(0);

  const cancel = useCallback(async () => {
    sequence.current++;
    const active = current.current;
    current.current = null;
    active?.controller.abort();
    setStopped(true);
    setBusy(false);
    if (active?.id) await api(`/jobs/${active.id}`, { method: 'DELETE' }).catch(() => undefined);
  }, []);

  const run = useCallback(async (path: string, payload: unknown): Promise<T | undefined> => {
    const previous = current.current;
    const runSequence = ++sequence.current;
    setStopped(false);
    current.current = null;
    previous?.controller.abort();
    if (previous?.id)
      await api(`/jobs/${previous.id}`, { method: 'DELETE' }).catch(() => undefined);
    if (runSequence !== sequence.current) return;
    const active: { controller: AbortController; id?: string } = {
      controller: new AbortController(),
    };
    current.current = active;
    setBusy(true);
    setError('');
    setJob(undefined);
    try {
      // Always receive the job ID so an abort during creation can still cancel the server job.
      const created = await api<Job<T>>(path, { method: 'POST', body: JSON.stringify(payload) });
      active.id = created.id;
      if (active.controller.signal.aborted || runSequence !== sequence.current) {
        await api(`/jobs/${created.id}`, { method: 'DELETE' }).catch(() => undefined);
        return;
      }
      const result = await followJob(created, active.controller.signal, (next) => {
        if (runSequence === sequence.current) setJob(next);
      });
      return runSequence === sequence.current ? result : undefined;
    } catch (reason) {
      if (!active.controller.signal.aborted && runSequence === sequence.current)
        setError(reason instanceof Error ? reason.message : 'Unable to reach the engine service.');
      if (active.id) await api(`/jobs/${active.id}`, { method: 'DELETE' }).catch(() => undefined);
    } finally {
      if (runSequence === sequence.current) {
        setBusy(false);
        current.current = null;
      }
    }
  }, []);

  useEffect(
    () => () => {
      sequence.current++;
      const active = current.current;
      active?.controller.abort();
      if (active?.id)
        void api(`/jobs/${active.id}`, { method: 'DELETE', keepalive: true }).catch(
          () => undefined,
        );
    },
    [],
  );

  return { job, busy, error, stopped, run, cancel };
}
