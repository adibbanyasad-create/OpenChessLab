import { randomUUID } from 'node:crypto';
import { LIMITS } from '../shared/limits.js';
import type { Job, JobKind, JobProgress, JobResult } from '../shared/types.js';
import { AppError, EngineError } from './errors.js';

type Task = (
  signal: AbortSignal,
  progress: (progress: JobProgress) => void,
  id: string,
) => Promise<JobResult>;

export class JobManager {
  private jobs = new Map<string, Job>();
  private active = new Map<
    string,
    { controller: AbortController; kind: JobKind; done: Promise<void> }
  >();

  constructor(private readonly reportError: (error: unknown) => void = () => undefined) {}

  private prune(forAdmission = false): void {
    for (const [id, job] of this.jobs) {
      if (
        !this.active.has(id) &&
        job.finishedAt &&
        Date.now() - Date.parse(job.finishedAt) > LIMITS.jobTtlMs
      )
        this.jobs.delete(id);
    }
    while (this.jobs.size > LIMITS.maxJobs - (forAdmission ? 1 : 0)) {
      const oldest = [...this.jobs.keys()].find((id) => !this.active.has(id));
      if (!oldest) break;
      this.jobs.delete(oldest);
    }
  }

  create(kind: JobKind, task: Task): Job {
    this.prune(true);
    if (this.active.size >= 2)
      throw new AppError(
        429,
        'Both engine slots are busy. Stop a running job or try again shortly.',
      );
    if (
      (kind === 'benchmark' && this.active.size > 0) ||
      [...this.active.values()].some((job) => job.kind === 'benchmark')
    ) {
      throw new AppError(
        409,
        'Benchmarks run in isolation. Wait for the current engine job to finish.',
      );
    }
    const controller = new AbortController();
    const job: Job = {
      id: randomUUID(),
      kind,
      status: 'running',
      createdAt: new Date().toISOString(),
      progress: { completed: 0, total: 1, message: 'Starting engine...' },
    };
    this.jobs.set(job.id, job);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new EngineError('Job exceeded the five-minute safety limit.'));
    }, LIMITS.jobTimeoutMs);
    const done = Promise.resolve().then(async () => {
      try {
        const result = await task(
          controller.signal,
          (progress) => {
            if (job.status === 'running') job.progress = progress;
          },
          job.id,
        );
        controller.signal.throwIfAborted();
        job.result = result;
        job.status = 'completed';
        job.progress = { ...job.progress, completed: job.progress.total, message: 'Complete' };
      } catch (error) {
        if (controller.signal.aborted && !timedOut) job.status = 'cancelled';
        else {
          job.status = 'failed';
          job.error =
            error instanceof EngineError || error instanceof AppError
              ? error.message
              : 'The engine job failed. Check the server logs.';
          this.reportError(error);
        }
      } finally {
        clearTimeout(timer);
        job.finishedAt = new Date().toISOString();
        this.active.delete(job.id);
      }
    });
    this.active.set(job.id, { controller, kind, done });
    return job;
  }

  get(id: string): Job {
    this.prune();
    const job = this.jobs.get(id);
    if (!job)
      throw new AppError(
        404,
        'Job not found. Finished jobs expire after 30 minutes or server restart.',
      );
    return job;
  }

  async cancel(id: string): Promise<Job> {
    const job = this.get(id);
    const active = this.active.get(id);
    if (active) {
      job.status = 'cancelled';
      active.controller.abort(new EngineError('Search cancelled.'));
      await active.done;
    }
    return job;
  }

  async close(): Promise<void> {
    for (const { controller } of this.active.values())
      controller.abort(new EngineError('Server is shutting down.'));
    await Promise.all([...this.active.values()].map(({ done }) => done));
  }
}
