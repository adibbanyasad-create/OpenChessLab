# Changelog

Meaningful changes are recorded here. Source publication and a tagged GitHub release are separate events; no release or deployment is implied by a version heading alone.

## 0.3.0 - Unreleased

### Fixed

- Review annotations are uncertain with a null loss when either adjacent evaluation did not confirm its requested depth, instead of inventing blunders from timed-out searches.
- NPS is unavailable when an engine reports nonzero nodes in zero reported milliseconds, instead of repeating a misleading calculated rate.
- Job polling survives transient request failures with a bounded retry policy, then surfaces repeated failures instead of ending or hanging silently.
- Benchmark history preserves optional comparison records and avoids rewriting storage when an identical completed run is saved again.

### Added

- Per-position engine-agreement summaries using centipawn-only means/spreads, with mate evaluations counted rather than averaged.
- Custom single-FEN benchmark experiments in the interface, with client-side validation and server-side schema enforcement.
- Server-backed review CSV/JSON exports with explicit ply, evaluation, classification, loss, uncertainty, and best-move fields.
- Regression coverage for uncertain reviews, comparison statistics, instant-search NPS, polling recovery, custom positions, review exports, and stored comparisons.

### Compatibility

Review annotations add `uncertain: boolean` and permit `lossCp: null` for uncertain estimates. Benchmark results may include optional per-position `comparisons`. Consumers should exclude uncertain losses and null statistics from averages. See [migration notes](docs/migration-0.3.md).

## 0.2.0 - Unreleased

### Fixed

- Optional UCI measurements are null when absent or invalid, not invented zeros. Separate statistics records are merged without carrying data between positions.
- UCI text messages, malformed numeric fields, invalid MultiPV indices, and invalid PV suffixes cannot masquerade as valid measurements or lines.
- Early engine stops are reported as unconfirmed requested depth, without assuming a time-limit event.
- FEN spacing is canonicalized consistently, castling checks use canonical fields, and counters are bounded before engine use.
- Manual searches are cancelled on navigation/settings changes. Stopped states, delayed creation responses, and stale results have explicit regression coverage.
- Native promotion/history dialogs isolate global shortcuts. Board focus survives keyboard moves and flips, including non-element keyboard-event targets.
- Benchmark depth entry preserves empty/invalid drafts instead of silently changing values. Results keep their recorded engine names rather than current registry labels.
- Explicit token removal is respected, all supported RequestInit header representations are preserved, and bearer schemes are validated consistently.
- Bearer-token comparison avoids length-dependent exceptions and reads the bounded engine registry through one file descriptor, resolving two CodeQL warnings without changing API behavior.

### Added

- Validated browser-local benchmark history with a 20-run/1 MB bound, storage-failure fallback, and explicit clear-history behavior.
- Application-version metadata in new benchmark reports and an appended CSV column.
- Node 26 verification/support alongside Node 22 and 24, with Node 24 as the development/container default.
- Weekly regression checks, static CodeQL configuration, pinned current GitHub Actions, clean archive smoke checks in ordinary CI, and a container HTTP/engine check.
- A pinned multi-platform container base, reviewed Docker update proposals, local documentation-link checks, maintenance guidance, and coding-agent instructions.
- Additional unit, API, browser, cancellation, storage, and protocol regression tests.

### Compatibility

Optional numeric response fields are nullable in 0.2. See [migration notes](docs/migration-0.2.md) before upgrading API consumers. Browser history is local and best-effort, not synchronized or encrypted persistence.

## 0.1.0 - Initial Public Source Snapshot (2026-11-25)

### Added

- Local-first React/TypeScript analysis workspace with a responsive, keyboard-operable chessboard and original SVG pieces.
- PGN and FEN import, legal moves, promotion, main-line navigation, board flipping, FEN/PGN export, and browser workspace restoration.
- Stockfish 19 full and Lite UCI subprocesses, server-side native-engine registry, live evaluations, principal variations, configurable depth/hash/threads, and cancellation.
- Per-position game reviews, evaluation timelines, and explicitly heuristic move-quality labels.
- Isolated sequential engine comparisons and benchmarks with real nodes/NPS, measured time, actual settings, warnings, and CSV/JSON export.
- Bounded job management, strict API validation, host/origin checks, optional API tokens, output limits, deadlines, and security headers.
- Unit, API, engine, and browser test infrastructure; CI, dependency auditing, and tag-triggered release workflows.
- User/developer documentation, MIT application license, engine licensing notices, and contribution/community templates.

### Known Boundaries

- Single standard-chess main line, temporary server state, finite-depth heuristic review, and FEN-only position searches.
- No cloud accounts, multi-tenant hosting, Elo/tournament measurements, tablebase service, or persistent variation trees.
