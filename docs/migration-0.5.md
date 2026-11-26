# Migrating to 0.5

Version 0.5 adds verifiable experiment infrastructure. All changes are additive;
0.4 consumers that tolerate unknown fields keep working.

## Suite Identity

`BenchmarkResult` may include an optional `suite` reference:

```ts
suite?: { id: string; version: number; sha256: string };
```

It is present only when the requested positions matched a published suite
exactly, in order. Older results omit it; do not infer suite membership from
position counts. The UI selector now labels the standard positions as
"Suite v1 / 3 positions".

## Bundle Export

`GET /api/jobs/:id/export?format=bundle` returns an `ExperimentBundle` v1
(`.oclb.json`) for completed benchmark jobs. Reviews reject this format with 409. See [reproducibility](reproducibility.md) for the schema, canonical hash,
and the standalone verifier.

## Browser History

Stored benchmark runs may include the optional `suite` reference. The storage
key (`ocl-benchmarks-v1`), bounds (20 runs / 1 MB), and validation behavior
are unchanged; unknown fields outside the schema still invalidate a record.

## No Measurement Changes

Score semantics, null-vs-zero rules, MultiPV discipline, review labels, and
CSV column order are unchanged from 0.4. The benchmark CSV gains no columns;
use JSON or bundle export for suite data.
