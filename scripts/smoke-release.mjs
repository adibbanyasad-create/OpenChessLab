import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout } from 'node:timers/promises';

const root = resolve(process.argv[2] ?? '.');
const require = createRequire(join(root, 'package.json'));
assert.ok(
  require.resolve('stockfish').startsWith(join(root, 'node_modules') + sep),
  "Install this archive's production dependencies first.",
);
const { createApp } = await import(pathToFileURL(join(root, 'dist/server/app.js')).href);
const { loadEngines } = await import(pathToFileURL(join(root, 'dist/server/config.js')).href);
const app = await createApp({
  config: {
    host: '127.0.0.1',
    port: 3001,
    allowedHosts: ['localhost'],
    frameAncestors: "'self'",
    staticRoot: join(root, 'dist/client'),
  },
  engines: loadEngines(''),
  rateLimit: false,
});
try {
  const health = await app.inject('/api/health');
  assert.equal(health.statusCode, 200);
  assert.equal(health.json().version, require('./package.json').version);
  const document = await app.inject('/');
  assert.equal(document.statusCode, 200);
  const script = document.body.match(/src="([^"]+\.js)"/);
  assert.ok(script, 'The built frontend must reference its module bundle.');
  assert.equal((await app.inject(script[1])).statusCode, 200);
  const response = await app.inject({
    method: 'POST',
    url: '/api/analysis',
    payload: {
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      depth: 4,
      threads: 1,
      hash: 16,
      multiPv: 1,
    },
  });
  assert.equal(response.statusCode, 202, response.body);
  let job = response.json();
  for (let attempt = 0; job.status === 'running' && attempt < 300; attempt++) {
    await setTimeout(50);
    job = (await app.inject(`/api/jobs/${job.id}`)).json();
  }
  assert.equal(job.status, 'completed', job.error);
  assert.ok(job.result.engineName.includes('Stockfish'));
  assert.ok(job.result.lines[0].nodes > 0 && job.result.lines[0].nps > 0);
  assert.equal(job.result.effectiveOptions.Hash, 16);
  console.log(
    `Release smoke check passed: v${health.json().version}, production assets, and a real Stockfish depth-4 search.`,
  );
} finally {
  await app.close();
}
