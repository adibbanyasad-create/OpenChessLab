# Migrating to 0.4

Version 0.4 expands game-review reporting and engine configurability without changing the 0.2/0.3 measurement model.

## Review Labels and Summaries

`Classification` now includes:

`brilliant | great | best | excellent | good | book | inaccuracy | mistake | miss | blunder`

Additional classification rules are documented in [usage](usage.md). Do not assume these labels match chess.com's proprietary review system.

Review annotations add:

- `phase: 'opening' | 'middlegame' | 'endgame'`
- `bookMove: boolean`

Review results may include an optional `summary` with:

- An opening name from the small built-in table, or no opening when unmatched.
- Per-side move totals, confident/uncertain counts, average confident loss, accuracy, and label totals.

Accuracy is `100 * e^(-0.004 * average confident loss)` and excludes uncertain moves. Older results omit this summary; do not infer it from current settings.

## Engine Options

Request settings may include:

```ts
options?: Record<string, string | number | boolean>;
```

At most 32 entries are accepted. Only options actually advertised by the selected engine are applied. Unknown, mistyped, out-of-range, multiline, and button values are ignored with warnings. `Threads`, `Hash`, and `MultiPV` remain separate validated settings and cannot be overridden through this object.

Use `GET /api/engines/:id/options` to discover valid names, types, ranges, and choices. Use `GET /api/hardware/recommendations` for transparent Threads/Hash starting points. Recommendations include their reasons and conservative fallbacks; they are not performance guarantees.

## Exports

Review CSV now appends `phase` and `book_move` after the existing columns:

`ply,evaluation_white,move,classification,loss_cp,uncertain,phase,book_move,best_move`

Parse by header name rather than column position where possible.
