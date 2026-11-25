import { afterEach, describe, expect, it, vi } from 'vitest';
import { JobManager } from '../../src/server/jobs';
import { EngineError } from '../../src/server/errors';
import { LIMITS } from '../../src/shared/limits';
import type { ReviewResult } from '../../src/shared/types';

const result: ReviewResult = {
  engineId: 'fixture',
  settings: { depth: 1, threads: 1, hash: 16, multiPv: 1 },
  scores: [],
  annotations: [],
  elapsedMs: 0,
};
const pending = (signal: AbortSignal): Promise<ReviewResult> =>
  new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });

afterEach(() => vi.useRealTimers());

describe('bounded job admission and lifecycle', () => {
  it('allows two analyses and rejects a third instead of queueing', async () => {
    const jobs = new JobManager();
    try {
      jobs.create('analysis', pending);
      jobs.create('review', pending);
      expect(() => jobs.create('analysis', pending)).toThrow('Both engine slots');
    } finally {
      await jobs.close();
    }
  });
  it('requires exclusive access in both directions for benchmarks', async () => {
    const jobs = new JobManager();
    const analysis = jobs.create('analysis', pending);
    expect(() => jobs.create('benchmark', pending)).toThrow('Benchmarks run in isolation');
    await jobs.cancel(analysis.id);
    const benchmark = jobs.create('benchmark', pending);
    expect(() => jobs.create('analysis', pending)).toThrow('Benchmarks run in isolation');
    expect(() => jobs.create('benchmark', pending)).toThrow('Benchmarks run in isolation');
    await jobs.cancel(benchmark.id);
    await jobs.close();
  });
  it('waits for cancellation cleanup and frees the engine slot', async () => {
    const jobs = new JobManager();
    let cleaned = false;
    const first = jobs.create('analysis', async (signal) => {
      try {
        return await pending(signal);
      } finally {
        cleaned = true;
      }
    });
    await jobs.cancel(first.id);
    expect(cleaned).toBe(true);
    expect(jobs.get(first.id).status).toBe('cancelled');
    expect(jobs.get(first.id).finishedAt).toBeDefined();
    const next = jobs.create('benchmark', async () => result);
    await vi.waitFor(() => expect(jobs.get(next.id).status).toBe('completed'));
    expect(jobs.get(next.id).result).toEqual(result);
    await jobs.close();
  });
  it('retains safe engine errors but does not expose unexpected error details', async () => {
    const log = vi.fn();
    const jobs = new JobManager(log);
    const expected = jobs.create('analysis', async () => {
      throw new EngineError('Engine response timed out.');
    });
    const unexpected = jobs.create('analysis', async () => {
      throw new Error('/private/config/token');
    });
    await vi.waitFor(() => expect(jobs.get(unexpected.id).status).toBe('failed'));
    expect(jobs.get(expected.id).error).toBe('Engine response timed out.');
    expect(jobs.get(unexpected.id).error).not.toContain('private');
    expect(log).toHaveBeenCalledTimes(2);
    await jobs.close();
  });
  it('records progress and expires finished jobs', async () => {
    vi.useFakeTimers();
    const jobs = new JobManager();
    const job = jobs.create('analysis', async (_signal, update) => {
      update({ completed: 1, total: 2, message: 'Halfway' });
      return result;
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(jobs.get(job.id).progress).toMatchObject({
      completed: 2,
      total: 2,
      message: 'Complete',
    });
    await vi.advanceTimersByTimeAsync(LIMITS.jobTtlMs + 1);
    expect(() => jobs.get(job.id)).toThrow('Job not found');
    await jobs.close();
  });
  it('turns a whole-job timeout into failure rather than user cancellation', async () => {
    vi.useFakeTimers();
    const jobs = new JobManager();
    const job = jobs.create('analysis', pending);
    await vi.advanceTimersByTimeAsync(LIMITS.jobTimeoutMs + 1);
    expect(jobs.get(job.id).status).toBe('failed');
    expect(jobs.get(job.id).error).toContain('five-minute');
    await jobs.close();
  });
  it('bounds retention and evicts old finished records', async () => {
    vi.useFakeTimers();
    const jobs = new JobManager();
    const first = jobs.create('analysis', async () => result);
    await vi.advanceTimersByTimeAsync(1);
    let last = first;
    for (let i = 0; i < LIMITS.maxJobs; i++) {
      last = jobs.create('analysis', async () => result);
      await vi.advanceTimersByTimeAsync(1);
    }
    expect(() => jobs.get(first.id)).toThrow('Job not found');
    expect(jobs.get(last.id).status).toBe('completed');
    await jobs.close();
  });
});
