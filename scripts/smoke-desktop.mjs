// Boots a desktop executable produced by scripts/build-desktop.mjs, waits for
// /api/health, runs one real depth-2 analysis through the bundled server,
// then shuts the process down. Usage:
//   node scripts/smoke-desktop.mjs <path-to-binary> [port]
// Exits nonzero with the child output attached on any failure.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

const binary = process.argv[2];
assert.ok(binary, 'Usage: node scripts/smoke-desktop.mjs <path-to-binary> [port]');
const port = Number(process.argv[3] ?? 3210);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536, 'Port must be 1-65535.');
const base = `http://127.0.0.1:${port}`;
const output = [];

const child = spawn(binary, [], {
  env: {
    ...process.env,
    PORT: String(port),
    HOST: '127.0.0.1',
    ALLOWED_HOSTS: '127.0.0.1,localhost',
    OPENCHESSLAB_NO_BROWSER: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
child.stdout.on('data', (chunk) => output.push(chunk.toString()));
child.stderr.on('data', (chunk) => output.push(chunk.toString()));
const failed = (message) => {
  throw new Error(`${message}\n--- desktop output ---\n${output.join('').slice(-4000)}`);
};
try {
  let health;
  for (let attempt = 0; attempt < 100; attempt++) {
    await setTimeout(200);
    if (child.exitCode !== null) failed(`Desktop process exited early with ${child.exitCode}.`);
    try {
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        health = await response.json();
        break;
      }
    } catch {
      /* Still booting. */
    }
  }
  if (!health) failed('Desktop service never answered /api/health.');
  assert.equal(health.status, 'ok');
  const created = await (
    await fetch(`${base}/api/analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        depth: 2,
        threads: 1,
        hash: 16,
        multiPv: 1,
      }),
      signal: AbortSignal.timeout(10_000),
    })
  ).json();
  assert.ok(created.id, 'Analysis job was not created.');
  let job = created;
  for (let attempt = 0; job.status === 'running' && attempt < 200; attempt++) {
    await setTimeout(200);
    job = await (
      await fetch(`${base}/api/jobs/${created.id}`, { signal: AbortSignal.timeout(5000) })
    ).json();
  }
  if (job.status !== 'completed') failed(`Desktop analysis ended as ${job.status}.`);
  assert.ok(job.result.bestMove, 'Desktop analysis returned no best move.');
  console.log(
    `Desktop smoke check passed: v${health.version}, real depth-2 search, best move ${job.result.bestMove}.`,
  );
} finally {
  child.kill('SIGTERM');
  await setTimeout(500);
  if (child.exitCode === null) child.kill('SIGKILL');
}
