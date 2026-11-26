# Migrating to 0.2

Version 0.2 improves measurement integrity and experiment retention. Review these changes before updating a programmatic consumer of the 0.1 API.

## Missing Is Not Zero

Optional engine measurements are now `number | null`:

- Analysis lines: `depth`, `seldepth`, `nodes`, `nps`, `timeMs`, and `hashfull`.
- Analysis results: `completedDepth`.
- Review score points: `depth`.
- Benchmark rows: `depth`, `nodes`, `nps`, and `engineTimeMs`.

The engine must still supply a valid score and legal principal variation. Missing statistics are not inferred from elapsed wall time, and invalid counters are not clamped into plausible measurements. The API uses null, CSV uses empty cells, and the UI shows an unavailable marker. A reported zero remains zero. Terminal rule-based outcomes still explicitly record zero search work.

Update calculations to exclude unknown values rather than treating them as zero:

```ts
const reportedRates = result.rows.flatMap((row) => (row.nps === null ? [] : [row.nps]));
const peakNps = reportedRates.length ? Math.max(...reportedRates) : null;
```

Version 0.1 could represent an absent counter as zero. Existing exports cannot be retroactively corrected without the original engine output. Do not relabel those zeros as independently verified measurements.

## Depth and Position Semantics

`depthLimited` now means the requested depth was not confirmed, either because a reported depth was lower or because no depth was reported. It does not prove that a time cap caused the search to end. Per-search time caps and hard deadlines remain enforced.

FENs are canonicalized before searching and the returned FEN represents that canonical position. Extra printable spacing is normalized. Inconsistent castling rights are checked after normalization. Half-move and full-move counters above 1,000,000 are rejected for bounded engine interoperability.

## Provenance and History

New benchmark results include `appVersion`; CSV appends an `app_version` column after the existing columns. The field is optional in stored/exported result types so earlier reports remain identifiable as having an unrecorded application version. Never substitute the currently running version into an old report.

Benchmark results now persist in the browser when available, bounded to 20 records and 1 MB. Restored records undergo schema validation. Recorded engine names and versions are displayed instead of the current engine registry's labels. Results are not synchronized across devices or open tabs. Close other tabs before clearing history and export important data.

Manual analysis is cancelled on navigation/settings changes even with Live analysis off. Late creation responses are still handled so their server jobs can be cancelled. Stopped searches are explicitly identified in the interface.

## Runtime and Maintenance

Node 22.12+, 24, and 26 are supported targets, with Node 24 recommended. CI includes archive/container smoke checks and weekly regressions. CodeQL and dependency checks are scheduled separately. Upstream actions and the Node container image are pinned to reviewed revisions; dependency updates remain reviewable PRs.

Read the [maintenance guide](maintenance.md) and [verification report](verification.md) for the exact execution status of these checks. Configuration alone is not proof that a hosted workflow has passed.
