import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import { timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { z, ZodError } from 'zod';
import { analysisSchema, benchmarkSchema, pgnSchema, reviewSchema } from '../shared/schemas.js';
import { LIMITS } from '../shared/limits.js';
import { parseGame, validPosition } from '../shared/chess.js';
import { benchmarkCsv, reviewCsv } from '../shared/csv.js';
import { createBundle } from '../shared/bundles.js';
import { BENCHMARK_SUITES } from '../shared/suites.js';
import type { BenchmarkResult, ReviewResult } from '../shared/types.js';
import { loadConfig, loadEngines, type EngineConfig, type ServerConfig } from './config.js';
import { AppError } from './errors.js';
import { recommendHardware } from './hardware.js';
import { JobManager } from './jobs.js';
import { analyzePosition, reviewGame, runBenchmark } from './tasks.js';
import { UciEngine } from './uci.js';
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

export function apiTokensMatch(expected: string, supplied: string): boolean {
  // lgtm[js/insufficient-password-hash] This bearer credential is already an
  // online high-entropy server secret protected by rate limits, HTTPS/TLS
  // expectations, and fixed-length timingSafeEqual comparison. A salted
  // offline password hash would add no meaningful protection and would imply
  // multi-user password storage that this local-first service does not have.
  // Both values are bounded visible-ASCII bearer tokens. Rejecting unequal byte
  // lengths up front avoids Node's differently sized buffer error while leaving the
  // remaining comparison in timingSafeEqual.
  const expectedBytes = Buffer.from(expected, 'utf8');
  const suppliedBytes = Buffer.from(supplied, 'utf8');
  return (
    expectedBytes.byteLength === suppliedBytes.byteLength &&
    timingSafeEqual(expectedBytes, suppliedBytes)
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
      return validPosition(fen).fen();
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
    const route = request.routeOptions.url;
    const apiRequest = route?.startsWith('/api/') || /^\/api(?:\/|\?|$)/.test(request.url);
    if (config.apiToken && apiRequest && route !== '/api/health') {
      const supplied =
        /^Bearer ([\x21-\x7e]+)$/i.exec(request.headers.authorization ?? '')?.[1] ?? '';
      if (!apiTokensMatch(config.apiToken, supplied))
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
    // script-src 'wasm-unsafe-eval' allows the bundled offline Stockfish
    // WebAssembly engine to compile while still blocking eval() and inline
    // scripts. Plain 'unsafe-eval' is deliberately not used.
    reply.header(
      'Content-Security-Policy',
      `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors ${config.frameAncestors}`,
    );
    if (/^\/api(?:\/|\?|$)/.test(_request.url) || _request.routeOptions.url?.startsWith('/api/'))
      reply.header('Cache-Control', 'no-store');
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
  app.get('/api/hardware/recommendations', async () => recommendHardware());
  app.get('/api/engines/:id/options', costly, async (request) => {
    const { id } = z.object({ id: z.string().min(1).max(64) }).parse(request.params);
    const engine = lookupEngine(id);
    const probe = new UciEngine(engine);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      try {
        await probe.start({ depth: 1, threads: 1, hash: 16, multiPv: 1 }, controller.signal);
        return { id: engine.id, ...probe.capabilities() };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        502,
        'The engine did not respond to option discovery. Check the server-side engine configuration.',
      );
    } finally {
      await probe.close();
    }
  });

  app.post('/api/games/parse', async (request) => {
    const { pgn } = z.object({ pgn: pgnSchema }).strict().parse(request.body);
    return checkPgn(pgn);
  });

  app.post('/api/analysis', costly, async (request, reply) => {
    const input = analysisSchema.parse(request.body);
    input.fen = checkFen(input.fen);
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
    input.positions = input.positions.map((position) => ({
      ...position,
      fen: checkFen(position.fen),
    }));
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
      .object({ format: z.enum(['csv', 'json', 'bundle']).default('csv') })
      .strict()
      .parse(request.query);
    const job = jobs.get(jobId(request.params));
    if (job.status !== 'completed' || !job.result)
      throw new AppError(409, 'Only completed jobs can be exported.');
    if (job.kind !== 'benchmark' && job.kind !== 'review')
      throw new AppError(409, 'Only completed benchmarks and reviews can be exported.');
    if (format === 'bundle' && job.kind !== 'benchmark')
      throw new AppError(409, 'Experiment bundles are available for completed benchmarks only.');
    reply.header(
      'Content-Disposition',
      `attachment; filename="openchesslab-${job.id}.${format === 'bundle' ? 'oclb.json' : format}"`,
    );
    if (format === 'json') return reply.type('application/json').send(job.result);
    if (format === 'bundle') {
      const result = job.result as BenchmarkResult;
      const suite = result.suite
        ? (BENCHMARK_SUITES.find(
            (candidate) =>
              candidate.id === result.suite?.id && candidate.version === result.suite.version,
          ) ?? null)
        : null;
      return reply.type('application/json').send(
        createBundle(result, {
          suite: suite
            ? {
                id: suite.id,
                version: suite.version,
                sha256: suite.sha256,
                positions: suite.positions,
              }
            : null,
        }),
      );
    }
    const csv =
      job.kind === 'benchmark'
        ? benchmarkCsv(job.result as BenchmarkResult)
        : reviewCsv(job.result as ReviewResult);
    return reply.type('text/csv; charset=utf-8').send(csv);
  });

  if (existsSync(config.staticRoot)) {
    await app.register(fastifyStatic, {
      root: config.staticRoot,
      maxAge: 0,
      // The offline engine's WebAssembly binary must compile in the browser;
      // instantiateStreaming requires the application/wasm MIME type.
      setHeaders: (reply, path) => {
        if (path.endsWith('.wasm')) reply.header('Content-Type', 'application/wasm');
      },
    });
    app.setNotFoundHandler((request, reply) => {
      if (
        request.method === 'GET' &&
        !/^\/api(?:\/|\?|$)/.test(request.url) &&
        !/\.[a-z0-9]+(?:\?|$)/i.test(request.url)
      )
        return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'Not found.' });
    });
  }

  return app;
}
