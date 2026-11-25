import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { z, ZodError } from 'zod';
import { analysisSchema, benchmarkSchema, pgnSchema, reviewSchema } from '../shared/schemas.js';
import { LIMITS } from '../shared/limits.js';
import { parseGame, validPosition } from '../shared/chess.js';
import { benchmarkCsv } from '../shared/csv.js';
import type { BenchmarkResult } from '../shared/types.js';
import { loadConfig, loadEngines, type EngineConfig, type ServerConfig } from './config.js';
import { AppError } from './errors.js';
import { JobManager } from './jobs.js';
import { analyzePosition, reviewGame, runBenchmark } from './tasks.js';
import { APP_VERSION } from './version.js';

export function hostAllowed(host: string, allowed: string[]): boolean {
  let hostname: string;
  try {
    const parsed = new URL(`http://${host}`);
    if (
      parsed.username ||
      parsed.password ||
      parsed.pathname !== '/' ||
      parsed.search ||
      parsed.hash
    )
      return false;
    hostname = parsed.hostname.toLowerCase();
  } catch {
    return false;
  }
  return allowed.some((entry) =>
    entry.startsWith('.') ? hostname.endsWith(entry) : hostname === entry,
  );
}

export async function createApp(
  options: {
    config?: ServerConfig;
    engines?: EngineConfig[];
    logger?: boolean;
    rateLimit?: boolean;
  } = {},
) {
  const config = options.config ?? loadConfig();
  const engines = options.engines ?? loadEngines();
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 300_000,
    requestTimeout: 15_000,
    trustProxy: false,
  });
  const jobs = new JobManager((error) => app.log.error(error, 'Engine job failed'));
  const lookupEngine = (id: string) => {
    const engine = engines.find((candidate) => candidate.id === id);
    if (!engine)
      throw new AppError(400, 'Unknown engine. Choose an engine from the server registry.');
    return engine;
  };
  const checkFen = (fen: string) => {
    try {
      validPosition(fen);
    } catch (error) {
      throw new AppError(400, error instanceof Error ? error.message : 'Invalid position.');
    }
  };
  const checkPgn = (pgn: string) => {
    try {
      return parseGame(pgn);
    } catch (error) {
      throw new AppError(400, error instanceof Error ? error.message : 'Invalid PGN.');
    }
  };
  const jobId = (params: unknown) => z.object({ id: z.uuid() }).parse(params).id;

  // Register before awaited plugins can finalize route contexts.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join('.') || 'request'}: ${issue.message}`)
          .join('; '),
      });
    if (error instanceof AppError)
      return reply.code(error.statusCode).send({ error: error.message });
    const status =
      error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number'
        ? error.statusCode
        : 500;
    if (status >= 500) request.log.error(error, 'Request failed');
    return reply.code(status).send({
      error:
        status === 429
          ? 'Too many requests. Please wait a minute before trying again.'
          : status === 413
            ? 'Request exceeds the size limit.'
            : status === 415
              ? 'Use application/json for API requests.'
              : status >= 500
                ? 'Internal server error.'
                : 'Invalid request.',
    });
  });
  app.addHook('onClose', async () => {
    await jobs.close();
  });

  app.addHook('onRequest', async (request) => {
    const host = request.headers.host ?? '';
    if (!hostAllowed(host, config.allowedHosts))
      throw new AppError(403, 'Host is not allowed. Configure ALLOWED_HOSTS on the server.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin;
      let sameOrigin = !origin;
      try {
        if (origin) {
          const parsed = new URL(origin);
          sameOrigin =
            ['http:', 'https:'].includes(parsed.protocol) &&
            parsed.host === new URL(`${parsed.protocol}//${host}`).host;
        }
      } catch {
        sameOrigin = false;
      }
      if (!sameOrigin || request.headers['sec-fetch-site'] === 'cross-site')
        throw new AppError(403, 'Cross-origin requests are not allowed.');
    }
    if (
      config.apiToken &&
      request.url.startsWith('/api/') &&
      request.url.split('?')[0] !== '/api/health'
    ) {
      const supplied = request.headers.authorization?.replace(/^Bearer /, '') ?? '';
      const digest = (value: string) => createHash('sha256').update(value).digest();
      if (!timingSafeEqual(digest(supplied), digest(config.apiToken)))
        throw new AppError(
          401,
          'Authentication required. Add the server token in Connection settings.',
        );
    }
  });

  app.addHook('onSend', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Cross-Origin-Resource-Policy', 'same-origin');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors ${config.frameAncestors}`,
    );
    if (_request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });

  if (options.rateLimit !== false)
    await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });
  const costly =
    options.rateLimit === false
      ? {}
      : { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  app.get('/api/health', async () => ({
    status: 'ok',
    version: APP_VERSION,
    requiresAuth: Boolean(config.apiToken),
  }));
  app.get('/api/engines', async () => ({
    engines: engines.map(({ id, name, description, kind }) => ({ id, name, description, kind })),
  }));

  app.post('/api/games/parse', async (request) => {
    const { pgn } = z.object({ pgn: pgnSchema }).strict().parse(request.body);
    return checkPgn(pgn);
  });

  app.post('/api/analysis', costly, async (request, reply) => {
    const input = analysisSchema.parse(request.body);
    checkFen(input.fen);
    const engine = lookupEngine(input.engineId);
    const job = jobs.create('analysis', (signal, progress) =>
      analyzePosition(engine, input, signal, progress),
    );
    return reply.code(202).send(job);
  });

  app.post('/api/reviews', costly, async (request, reply) => {
    const input = reviewSchema.parse(request.body);
    const game = checkPgn(input.pgn);
    if (!game.moves.length)
      throw new AppError(400, 'Import or play at least one move before reviewing a game.');
    if (game.moves.length > LIMITS.reviewPlies)
      throw new AppError(400, `Reviews are limited to ${LIMITS.reviewPlies} half-moves.`);
    const engine = lookupEngine(input.engineId);
    const job = jobs.create('review', (signal, progress) =>
      reviewGame(engine, input, game, signal, progress),
    );
    return reply.code(202).send(job);
  });

  app.post('/api/benchmarks', costly, async (request, reply) => {
    const input = benchmarkSchema.parse(request.body);
    input.positions.forEach((position) => checkFen(position.fen));
    const selected = input.engineIds.map(lookupEngine);
    const job = jobs.create('benchmark', (signal, progress, id) =>
      runBenchmark(selected, input, signal, progress, id),
    );
    return reply.code(202).send(job);
  });

  app.get('/api/jobs/:id', async (request) => jobs.get(jobId(request.params)));
  app.delete('/api/jobs/:id', async (request) => jobs.cancel(jobId(request.params)));
  app.get('/api/jobs/:id/export', async (request, reply) => {
    const { format } = z
      .object({ format: z.enum(['csv', 'json']).default('csv') })
      .strict()
      .parse(request.query);
    const job = jobs.get(jobId(request.params));
    if (job.kind !== 'benchmark' || job.status !== 'completed' || !job.result)
      throw new AppError(409, 'Only completed benchmarks can be exported.');
    const result = job.result as BenchmarkResult;
    reply.header('Content-Disposition', `attachment; filename="openchesslab-${job.id}.${format}"`);
    return format === 'csv'
      ? reply.type('text/csv; charset=utf-8').send(benchmarkCsv(result))
      : reply.type('application/json').send(result);
  });

  if (existsSync(config.staticRoot)) {
    await app.register(fastifyStatic, { root: config.staticRoot, maxAge: 0 });
    app.setNotFoundHandler((request, reply) => {
      if (
        request.method === 'GET' &&
        !request.url.startsWith('/api/') &&
        !/\.[a-z0-9]+(?:\?|$)/i.test(request.url)
      )
        return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Not found.' });
    });
  }

  return app;
}
