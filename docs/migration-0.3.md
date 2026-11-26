# Migrating to 0.3

Version 0.3 keeps the 0.2 measurement model and fixes several cases where uncertain data could be mistaken for confident results.

## Uncertain Reviews

Review annotations now include:

- `uncertain: boolean`
- `lossCp: number | null`

An annotation is uncertain when either adjacent evaluation did not confirm its requested depth. Uncertain annotations use classification `good`, except when the player matched the prior best move, and always use a null loss. The interface shows `~` and excludes uncertain moves from inaccuracy/mistake/blunder totals.

```ts
const confidentLosses = result.annotations.flatMap((annotation) =>
  annotation.lossCp === null ? [] : [annotation.lossCp],
);
```

Do not coerce uncertain nulls to zero. That would turn an incomplete search into an apparently perfect move.

## Benchmark Comparisons

Benchmark results may include:

```ts
comparisons?: Record<string, BenchmarkComparison>;
```

Keys are canonical searched FENs. Each entry contains:

- `meanCp`: centipawn-only mean, or null with no centipawn scores.
- `disagreementCp`: maximum minus minimum centipawn score, or null with fewer than two centipawn scores.
- `mateCount`: number of mate evaluations.
- `missingScoreCount`: reserved and currently always zero.

Mate evaluations are counted, not included in means or spreads. Older results may omit `comparisons`; do not calculate agreement retroactively without recording that it came from an old export.

## Exports and Polling

`/api/jobs/:id/export` now supports completed reviews as well as benchmarks. Review CSV rows contain:

`ply,evaluation_white,move,classification,loss_cp,uncertain,best_move`

Uncertain rows have empty `loss_cp` cells and `true` uncertainty values. Exclude them from downstream accuracy calculations.

The browser job client retries transient polling failures up to five times before surfacing an error. API consumers should implement a similar bounded retry policy rather than treating one failed status request as a cancelled or failed job.

## Instant Searches

NPS is null when nonzero nodes arrive with zero reported engine milliseconds. That combination is explicitly warned rather than presented as an enormous throughput number. True zero-node/zero-time terminal outcomes remain explicit zeros.
