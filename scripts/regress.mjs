/**
 * Headless engine regression check against a running OpenChessLab server.
 *
 * Usage:
 *   node scripts/regress.mjs --baseline baseline.oclb.json --engine my-engine-id \
 *     [--suite openchesslab-suite-v1] [--depth 8] [--threads 1] [--hash 16] \
 *     [--server http://127.0.0.1:3001] [--token ...] [--print-bundle] \
 *     [--fail-on depth-limited|missing-stats|disagreement:CP] [--json]
 *
 * The script re-runs the baseline's suite (or Suite v1) with the candidate
 * engine, downloads the candidate bundle, and compares honestly:
 * - same suite hash required, else exit 2 with an explanation
 * - no Elo, no pass/fail on strength — only reported failures:
 *   crashes/timeouts (job failed), unconfirmed depth, missing stats,
 *   and opt-in eval-disagreement thresholds.
 *
 * The script never writes files: persist the candidate with
 * `--print-bundle > candidate.oclb.json` (shell redirect). With
 * --print-bundle, stdout carries only the bundle JSON while human progress
 * goes to stderr; the exit code still reports the gate verdict.
 *
 * Exit codes:
 *   0  candidate completed; all enabled gates passed
 *   1  a gate failed (see output), or the candidate job failed
 *   2  usage/config error, baseline invalid, or suite mismatch
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';

const raw = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = raw.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return fallback;
  const value = raw[index + 1];
  if (value === undefined || value.startsWith('--')) return fallback;
  return value;
};
const has = (name) => raw.includes(`--${name}`);
const failOn = raw
  .filter((arg, index) => raw[index - 1] === '--fail-on')
  .flatMap((value) => value.split(','));

const baselinePath = flag('baseline');
const engineId = flag('engine');
const suiteId = flag('suite', 'openchesslab-suite-v1');
const suiteVersion = Number(flag('suite-version', '1'));
const depth = Number(flag('depth', '8'));
const threads = Number(flag('threads', '1'));
const hash = Number(flag('hash', '16'));
let server;
try {
  server = new URL(flag('server', 'http://127.0.0.1:3001'));
} catch {
  server = null;
}
const token = flag('token', process.env.OPENCHESSLAB_API_TOKEN ?? '');
const printBundle = has('print-bundle');
const asJson = has('json');

const report = (verdict) => {
  if (asJson) console.log(JSON.stringify(verdict, null, 2));
  else {
    for (const line of verdict.lines) console.log(line);
    if (verdict.failures.length) {
      console.log('FAILURES:');
      for (const failure of verdict.failures) console.log(`  - ${failure}`);
    }
  }
  process.exitCode = verdict.exitCode;
};

/**
 * Validate a bundle before it is trusted: full shape, suite hash, content
 * hash, and suite↔rows correspondence. Mirrors verify-bundle.mjs; throws.
 */
const verifyBundleFile = (bundle, label) => {
  if (!bundle || typeof bundle !== 'object') throw new Error(`${label} is not a bundle object.`);
  if (bundle.format !== 'openchesslab-experiment-bundle' || bundle.bundleVersion !== 1)
    throw new Error(`${label} is not an experiment bundle v1 file.`);
  if (typeof bundle.runId !== 'string' || bundle.runId !== bundle.result?.id)
    throw new Error(`${label} runId does not match its result.id.`);
  if (!Array.isArray(bundle.result?.rows) || !bundle.result.rows.length)
    throw new Error(`${label} bundle contains no measured rows.`);
  if (!/^[0-9a-f]{64}$/.test(bundle.sha256 ?? ''))
    throw new Error(`${label} sha256 is not 64 lowercase hex characters.`);
  if (bundle.suite?.sha256) {
    const { id, version, positions } = bundle.suite;
    const suiteHash = createHash('sha256')
      .update(JSON.stringify({ id, version, positions }), 'utf8')
      .digest('hex');
    if (suiteHash !== bundle.suite.sha256)
      throw new Error(`${label} suite hash does not match its positions.`);
    const suiteFens = new Set(positions.map((position) => position?.fen));
    const rowFens = new Set(bundle.result.rows.map((row) => row?.fen));
    const missing = [...suiteFens].filter((fen) => !rowFens.has(fen)).length;
    const extra = [...rowFens].filter((fen) => !suiteFens.has(fen)).length;
    if (missing || extra)
      throw new Error(
        `${label} suite claim does not match measured rows (${missing} missing, ${extra} non-suite).`,
      );
  }
  const { sha256, ...unsigned } = bundle;
  const payload = JSON.stringify({
    format: unsigned.format,
    bundleVersion: unsigned.bundleVersion,
    runId: unsigned.runId,
    appVersion: unsigned.appVersion,
    createdAt: unsigned.createdAt,
    suite: unsigned.suite,
    engines: unsigned.engines,
    settings: unsigned.settings,
    environment: unsigned.environment,
    result: unsigned.result,
    notes: unsigned.notes,
  });
  if (createHash('sha256').update(payload, 'utf8').digest('hex') !== sha256)
    throw new Error(`${label} content hash mismatch: the file was corrupted or tampered.`);
  return bundle;
};

/** Parse argv-level config errors before touching the network. */
const usage = [];
if (!baselinePath) usage.push('Missing --baseline <bundle.oclb.json>.');
if (!engineId) usage.push('Missing --engine <engine-id> (a server-registry id, never a path).');
if (!server) usage.push('--server must be a valid URL (loopback http(s) only).');
else {
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(server.hostname))
    usage.push('Refusing non-loopback --server. Run against a local OpenChessLab instance.');
  if (!['http:', 'https:'].includes(server.protocol)) usage.push('Server URL must be http(s).');
}
if (!Number.isInteger(suiteVersion) || suiteVersion < 1)
  usage.push('--suite-version must be a positive integer.');
if (!Number.isInteger(depth) || depth < 1 || depth > 24)
  usage.push('--depth must be an integer 1-24.');
if (![1, 2, 3, 4].includes(threads)) usage.push('--threads must be 1-4.');
if (![16, 32, 64, 128, 256, 512].includes(hash)) usage.push('--hash must be 16-512 MB.');
if (flag('output', undefined) !== undefined)
  usage.push('The --output file flag was removed: use --print-bundle > candidate.oclb.json.');
if (printBundle && asJson)
  usage.push(
    '--print-bundle and --json are mutually exclusive: stdout can carry only one document.',
  );
// Fail-open gates are worse than no gates: a bare or misspelled --fail-on
// must error, never silently run with zero gates.
if (raw.includes('--fail-on') && !failOn.length)
  usage.push('--fail-on needs a value: depth-limited, missing-stats, disagreement:<cp>.');
for (const gate of failOn) {
  if (gate !== 'depth-limited' && gate !== 'missing-stats' && !/^disagreement:\d+$/.test(gate))
    usage.push(
      `Unknown gate "${gate}": use depth-limited, missing-stats, or disagreement:<nonnegative-cp>.`,
    );
}
if (usage.length) {
  report({ exitCode: 2, lines: ['Usage errors:'], failures: usage });
} else {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const request = async (path, options = {}) => {
    const response = await fetch(new URL(path, server), {
      ...options,
      headers,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`${path}: HTTP ${response.status} ${body.slice(0, 200)}`);
    }
    return response;
  };

  try {
    // The baseline's rows drive the disagreement gate, so a tampered
    // baseline must fail here — never silently shift the comparison.
    const baseline = verifyBundleFile(JSON.parse(await readFile(baselinePath, 'utf8')), 'Baseline');
    if (!baseline.suite || baseline.suite.id !== suiteId || baseline.suite.version !== suiteVersion)
      throw new Error(
        `Baseline suite is ${baseline.suite ? `${baseline.suite.id} v${baseline.suite.version}` : 'custom/none'}; ` +
          `requested ${suiteId} v${suiteVersion}. Re-run with matching suites — different positions are not comparable.`,
      );
    const positions = baseline.suite.positions;
    const lines = [
      `Baseline: ${baselinePath} (${baseline.suite.id} v${baseline.suite.version}, ${baseline.suite.sha256.slice(0, 12)}…)`,
      `Candidate engine: ${engineId} @ depth ${depth}, ${threads} thread(s), ${hash} MB`,
    ];

    const created = await (
      await request('/api/benchmarks', {
        method: 'POST',
        body: JSON.stringify({ engineIds: [engineId], positions, depth, threads, hash }),
      })
    ).json();
    let job = created;
    for (let attempt = 0; job.status === 'running' && attempt < 1500; attempt++) {
      await setTimeout(200);
      try {
        job = await (await request(`/api/jobs/${created.id}`)).json();
      } catch {
        /* transient poll failure: keep waiting within the overall budget */
      }
    }
    if (job.status === 'running') {
      // One last status check: the job may have finished between the final
      // poll and the budget expiry — report its real outcome, not a timeout.
      try {
        job = await (await request(`/api/jobs/${created.id}`)).json();
      } catch {
        /* fall through to cancellation below */
      }
    }
    if (job.status === 'running') {
      await request(`/api/jobs/${created.id}`, { method: 'DELETE' }).catch(() => undefined);
      throw new Error('Candidate job did not finish within 5 minutes; it was cancelled.');
    }
    if (job.status !== 'completed')
      throw new Error(`Candidate job ${job.status}: ${job.error ?? 'no detail'}.`);
    const downloaded = await (await request(`/api/jobs/${created.id}/export?format=bundle`)).json();
    // Verify the downloaded bundle before trusting it: a corrupt or tampered
    // HTTP response must fail here, never pass as a valid experiment record.
    const candidate = verifyBundleFile(downloaded, 'Candidate');
    lines.push(
      `Candidate: ${candidate.sha256.slice(0, 12)}… (${candidate.result.rows.length} searches)`,
    );

    // Honest gates: only what was actually measured.
    const failures = [];
    const stats = { depthLimited: 0, missingStats: 0, maxDisagreementCp: null };
    for (const row of candidate.result.rows) {
      if (row.depthLimited) stats.depthLimited++;
      if (row.nodes === null || row.nps === null || row.engineTimeMs === null) stats.missingStats++;
    }
    const disagreements = Object.values(candidate.result.comparisons ?? {})
      .map((comparison) => comparison.disagreementCp)
      .filter((value) => value !== null);
    // Single-engine candidate: compare each row against the baseline's same-engine rows.
    const baselineByFen = new Map(
      (baseline.result.rows ?? [])
        .filter((row) => row.engineId === engineId)
        .map((row) => [row.fen, row]),
    );
    let comparedRows = 0;
    let maxAbsScoreDeltaCp = 0;
    for (const row of candidate.result.rows) {
      const base = baselineByFen.get(row.fen);
      if (!base) continue;
      if (row.score.type === 'cp' && base.score.type === 'cp') {
        comparedRows++;
        maxAbsScoreDeltaCp = Math.max(
          maxAbsScoreDeltaCp,
          Math.abs(row.score.value - base.score.value),
        );
      }
    }
    lines.push(
      `Rows: ${candidate.result.rows.length}, depth-limited: ${stats.depthLimited}, missing stats: ${stats.missingStats}, ` +
        (comparedRows
          ? `max |Δeval| vs baseline ${engineId}: ${maxAbsScoreDeltaCp} cp over ${comparedRows} row(s)`
          : `no same-engine baseline rows for ${engineId} (first run for this engine?)`),
    );
    if (failOn.includes('depth-limited') && stats.depthLimited > 0)
      failures.push(`${stats.depthLimited} search(es) did not confirm the requested depth.`);
    if (failOn.includes('missing-stats') && stats.missingStats > 0)
      failures.push(`${stats.missingStats} search(es) omitted nodes/NPS/time.`);
    for (const gate of failOn.filter((entry) => entry.startsWith('disagreement:'))) {
      const limit = Number(gate.split(':')[1]);
      if (!Number.isInteger(limit) || limit < 0) {
        failures.push(`Invalid gate ${gate}: use disagreement:<nonnegative-cp>.`);
        continue;
      }
      if (!comparedRows) {
        failures.push(`Gate ${gate} needs same-engine baseline rows; none found.`);
        continue;
      }
      if (maxAbsScoreDeltaCp > limit)
        failures.push(
          `Max |Δeval| ${maxAbsScoreDeltaCp} cp exceeds ${limit} cp over ${comparedRows} row(s). Investigate before merging.`,
        );
    }
    if (disagreements.length) stats.maxDisagreementCp = Math.max(...disagreements);
    lines.push(
      failures.length
        ? 'Result: FAIL — see failures above. No strength claim is made.'
        : 'Result: PASS — candidate completed and all enabled gates passed. This checks stability, not playing strength.',
    );
    // With --print-bundle, stdout carries ONLY the bundle JSON so a shell
    // redirect captures a clean .oclb.json file; human progress goes to
    // stderr instead. The script itself never touches the file system.
    if (printBundle && !asJson) {
      for (const line of lines) console.error(line);
      for (const failure of failures) console.error(`FAILURE: ${failure}`);
      console.log(JSON.stringify(candidate));
      process.exitCode = failures.length ? 1 : 0;
    } else {
      report({ exitCode: failures.length ? 1 : 0, lines, failures, stats });
    }
  } catch (error) {
    report({
      exitCode: 2,
      lines: ['Regression check could not run:'],
      failures: [error instanceof Error ? error.message : String(error)],
    });
  }
}
