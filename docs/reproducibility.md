# Reproducible Experiments

A benchmark screenshot proves nothing. An OpenChessLab experiment bundle (`.oclb.json`)
records everything needed to re-run and audit a result: the exact suite, engine
identities, settings, environment, measured rows, and a SHA-256 checksum.

## Suites Are Frozen

A suite is an append-only list of named positions with a content hash:

```json
{ "id": "openchesslab-suite-v1", "version": 1, "positions": [...] }
```

`openchesslab-suite-v1` (hash `46ee1d217a1f…`) contains three illustrative
positions — starting position, Opera Game move 9, rook endgame. These cover
opening, middlegame, and endgame phases. They are **not** a statistically
validated strength suite; see [benchmarking](benchmarking.md).

Published suites never change. New positions require a new suite version.
`runBenchmark` records suite identity only when the requested positions match a
published suite exactly, in order. Anything else is honestly labeled a custom
run with no suite.

## Bundle Format v1

Export any completed benchmark as a bundle:

- UI: **Bundle** button next to JSON/CSV exports.
- API: `GET /api/jobs/:id/export?format=bundle` (benchmark jobs only).
- File: `openchesslab-<run-id>.oclb.json`.

The bundle contains `format`, `bundleVersion`, `runId`, `appVersion`,
`createdAt`, the full `suite` (or null), `engines`, `settings`, `environment`,
the complete `result`, optional `notes`, and a `sha256` over everything else
in canonical key order. Missing measurements stay null inside the hash —
there is no way to "fill in" data without breaking the checksum.

## Verify a Bundle

Anyone can audit a bundle with the dependency-free verifier (copy the single
file anywhere; no install needed):

```bash
node scripts/verify-bundle.mjs run.oclb.json
node scripts/verify-bundle.mjs run.oclb.json --json
```

Exit 0 means the bundle parses, validates, and matches its checksum. Exit 1
reports structured errors: wrong format, suite tampering, or content edits.

Verification is strict by design:

- Key order does not matter: producers deep-canonicalize every level, so any
  emitter's JSON hashes identically.
- Suite claims are cross-checked: a suite bundle must contain exactly the
  suite's positions — no missing rows, no extra rows, no renamed positions
  smuggled under a trusted hash. Custom runs carry a null suite instead.
- The suite block's own hash is recomputed, and the embedded result's suite
  ref must agree with the bundle-level suite.

## Regress an Engine in CI

Engine authors can gate pull requests on stability with the headless CLI:

```bash
node scripts/regress.mjs \
  --baseline baseline.oclb.json \
  --engine candidate \
  --depth 8 \
  --fail-on depth-limited,missing-stats,disagreement:50 \
  --print-bundle > candidate.oclb.json
```

The CLI never writes files itself: `--print-bundle` sends only the candidate
bundle JSON to stdout (human progress goes to stderr), so the shell redirect
captures a clean `.oclb.json` file and the exit code still reports the gate
verdict.

It re-runs the baseline's suite against a local server, requires the same
suite hash, and compares honestly: crashes and timeouts fail the job;
`depth-limited` fails unconfirmed searches; `missing-stats` fails omitted
nodes/NPS/time; `disagreement:<cp>` fails same-engine eval drift beyond a
threshold. Exit 0 passes, 1 fails a gate, 2 signals usage/config errors.

See [examples/engine-regression.yml](../examples/engine-regression.yml) for a
copy-paste GitHub Actions workflow with pinned actions and bundle upload.

## What Bundles Do Not Claim

- No Elo, no strength rating, no tournament result.
- Single-run descriptive statistics only; repeat runs yourself.
- Environment records OS/arch/CPUs/Node — not CPU model, clocks, thermals,
  or container limits. Record those separately for publication.
- A verified checksum proves the file is intact, not that the run was fair.
  Publish your baseline, candidate, settings, and hardware together.
