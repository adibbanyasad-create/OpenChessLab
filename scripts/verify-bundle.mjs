/**
 * Verify an OpenChessLab experiment bundle (.oclb.json).
 *
 * Usage:
 *   node scripts/verify-bundle.mjs path/to/run.oclb.json [--json]
 *
 * Exit 0 when the bundle parses, validates, and its SHA-256 matches.
 * Exit 1 with human-readable errors otherwise. No network, no engines.
 *
 * This script is dependency-free on purpose: engine authors and reviewers
 * can copy this single file anywhere to audit a bundle.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const args = process.argv.slice(2).filter((arg) => arg !== '--json');
const asJson = process.argv.slice(2).includes('--json');
const fail = (errors) => {
  if (asJson) console.log(JSON.stringify({ ok: false, errors }));
  else for (const error of errors) console.error(`error: ${error}`);
  process.exitCode = 1;
};

if (args.length !== 1) {
  fail(['Usage: node scripts/verify-bundle.mjs <bundle.oclb.json> [--json]']);
} else {
  let bundle;
  try {
    bundle = JSON.parse(await readFile(args[0], 'utf8'));
  } catch {
    fail([`Could not read or parse ${args[0]} as JSON.`]);
  }
  if (bundle !== undefined) {
    const errors = [];
    if (!bundle || typeof bundle !== 'object') errors.push('Bundle must be a JSON object.');
    else {
      if (bundle.format !== 'openchesslab-experiment-bundle')
        errors.push('format must be "openchesslab-experiment-bundle".');
      if (bundle.bundleVersion !== 1) errors.push('bundleVersion must be 1.');
      if (typeof bundle.runId !== 'string') errors.push('runId must be a string.');
      if (bundle.runId !== bundle.result?.id) errors.push('runId does not match result.id.');
      if (!Array.isArray(bundle.result?.rows) || !bundle.result.rows.length)
        errors.push('result.rows must be a non-empty array.');
      if (!Array.isArray(bundle.engines) || !bundle.engines.length)
        errors.push('engines must be a non-empty array.');
      if (!/^[0-9a-f]{64}$/.test(bundle.sha256 ?? ''))
        errors.push('sha256 must be 64 lowercase hex characters.');
    }
    if (!errors.length && bundle.suite?.sha256) {
      const { id, version, positions } = bundle.suite;
      if (!Array.isArray(positions) || !positions.length)
        errors.push('suite.positions must be a non-empty array.');
      else if (typeof id !== 'string' || typeof version !== 'number')
        errors.push('suite.id and suite.version must be a string and a number.');
      else {
        const recomputed = createHash('sha256')
          .update(JSON.stringify({ id, version, positions }), 'utf8')
          .digest('hex');
        if (recomputed !== bundle.suite.sha256)
          errors.push(
            `suite sha256 mismatch: claims ${bundle.suite.sha256.slice(0, 12)}… but positions hash to ${recomputed.slice(0, 12)}….`,
          );
      }
      if (!errors.length) {
        // A suite claim is only meaningful when the measured rows are
        // exactly the suite's positions.
        const suiteFens = new Set(positions.map((position) => position?.fen));
        const rowFens = new Set(bundle.result.rows.map((row) => row?.fen));
        const missing = [...suiteFens].filter((fen) => !rowFens.has(fen)).length;
        const extra = [...rowFens].filter((fen) => !suiteFens.has(fen)).length;
        if (missing || extra)
          errors.push(
            `Suite claim does not match measured rows (${missing} missing, ${extra} non-suite). A suite bundle must contain exactly the suite positions.`,
          );
      }
    }
    if (!errors.length) {
      const { sha256, ...unsigned } = bundle;
      // Canonical key order must match src/shared/bundles.ts bundlePayload().
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
      const recomputed = createHash('sha256').update(payload, 'utf8').digest('hex');
      if (recomputed !== sha256)
        errors.push(
          `sha256 mismatch: bundle claims ${String(sha256).slice(0, 12)}… but content hashes to ${recomputed.slice(0, 12)}…. The bundle was edited after export or corrupted in transit.`,
        );
    }
    if (errors.length) fail(errors);
    else if (asJson) {
      console.log(
        JSON.stringify({
          ok: true,
          runId: bundle.runId,
          suite: bundle.suite
            ? `${bundle.suite.id} v${bundle.suite.version} ${bundle.suite.sha256.slice(0, 12)}…`
            : null,
          engines: bundle.engines,
          rows: bundle.result.rows.length,
          sha256: bundle.sha256,
        }),
      );
    } else {
      console.log(`Bundle OK: ${args[0]}`);
      console.log(`  run:      ${bundle.runId}`);
      console.log(
        `  suite:    ${bundle.suite ? `${bundle.suite.id} v${bundle.suite.version} (${bundle.suite.sha256.slice(0, 12)}…)` : 'custom positions (no suite)'}`,
      );
      console.log(
        `  engines:  ${bundle.engines.map((engine) => `${engine.id} (${engine.name})`).join(', ')}`,
      );
      console.log(`  searches: ${bundle.result.rows.length}`);
      console.log(`  sha256:   ${bundle.sha256}`);
    }
  }
}
