import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

const base = new URL(process.argv[2] ?? 'http://127.0.0.1:3001');
assert.ok(
  ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname),
  'This smoke check is for a local test instance only.',
);
assert.ok(['http:', 'https:'].includes(base.protocol));
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const request = async (path, options = {}) => {
  const response = await fetch(new URL(path, base), {
    ...options,
    signal: AbortSignal.timeout(5000),
  });
  assert.ok(response.ok, `${path}: HTTP ${response.status}`);
  return response;
};

let health;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    health = await (await request('/api/health')).json();
    break;
  } catch (error) {
    if (attempt === 29) throw error;
    await setTimeout(500);
  }
}
assert.equal(health.version, manifest.version);
assert.equal(health.status, 'ok');
const html = await (await request('/')).text();
const script = html.match(/src="([^"]+\.js)"/);
assert.ok(script, 'Production HTML must reference a JavaScript bundle.');
await request(script[1]);
const created = await (
  await request('/api/analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      depth: 4,
      threads: 2,
      hash: 16,
      multiPv: 1,
    }),
  })
).json();
let job = created;
try {
  for (let attempt = 0; job.status === 'running' && attempt < 100; attempt++) {
    await setTimeout(200);
    job = await (await request(`/api/jobs/${created.id}`)).json();
  }
  assert.equal(job.status, 'completed', job.error);
  assert.ok(job.result.engineName.includes('Stockfish'));
  assert.ok(job.result.lines[0].nodes > 0 && job.result.lines[0].nps > 0);
  assert.equal(job.result.effectiveOptions.Threads, 2);
  assert.equal(job.result.effectiveOptions.Hash, 16);
  console.log(
    `HTTP smoke check passed: v${health.version}, production assets and real multithreaded Stockfish analysis.`,
  );
} finally {
  if (job.status === 'running') await request(`/api/jobs/${created.id}`, { method: 'DELETE' });
}
