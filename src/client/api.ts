import type { Job, JobResult } from '../shared/types';

let memoryToken = '';

export function getToken(): string {
  try {
    return sessionStorage.getItem('ocl-token') ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

export function setToken(token: string): void {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem('ocl-token', token);
    else sessionStorage.removeItem('ocl-token');
  } catch {
    /* Storage can be disabled in private browser contexts. */
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)])
      : AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function followJob<T extends JobResult>(
  initial: Job<T>,
  signal: AbortSignal,
  update: (job: Job<T>) => void,
): Promise<T | undefined> {
  let job = initial;
  update(job);
  while (job.status === 'running') {
    await delay(500, signal);
    job = await api<Job<T>>(`/jobs/${job.id}`, { signal });
    update(job);
  }
  if (job.status === 'failed') throw new Error(job.error ?? 'Engine job failed.');
  return job.status === 'completed' ? job.result : undefined;
}

export function downloadFile(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
