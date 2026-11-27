# Changelog

Meaningful changes are recorded here. Source publication and a tagged GitHub release are separate events; no release or deployment is implied by a version heading alone.

## 0.7.0 - 2026-11-27

### Added

- Blunder refutation explainer: reviews compute and annotate the opponent's punishment sequence for inaccuracies, mistakes, misses, and blunders, with an on-board punishment arrow and explanation banner.
- 1-click online game sync: import recent games directly from public Chess.com and Lichess user archives or direct game links with zero API keys or account requirements.
- Tactical threat visualizer: null-move passing search detects and renders opponent threats with dedicated animated threat arrows.
- Interactive "Fix Your Blunders" practice mode: replay mistakes directly on the board with instant move validation, piece hints, and solution reveals.
- Blunder puzzle exports: export mistakes from any game review as a multi-chapter PGN study collection or spaced-repetition Anki flashcard CSV (`Front,Back,Tags`).

## 0.6.1 - 2026-11-27

### Fixed

- Android launcher icons and splash screens are regenerated from committed master SVGs with pixel verification, replacing the near-blank rasters that shipped in 0.6.0.
- The Windows executable now carries the knight icon and file/product version metadata stamped at build time.

### Added

- Committed master icon artwork (`assets/icons/`): app tile SVG, adaptive foreground SVG, and multi-resolution `.ico`.
- `npm run icons:make` (Android PNGs) and `npm run icons:windows` (ICO) regenerate all rasters with opaque-coverage gates.

## 0.6.0 - Unreleased

### Added

- Alive review experience: chess.com-style identity badges for every move label, animated evaluation bar and chart reveals, turning-point markers, piece landing motion, pulsing check highlight, best-move arrow draw-in, and a synthesized zero-asset sound engine with a persisted mute toggle.
- Offline on-device Stockfish engine: a Web Worker runs the bundled single-threaded Lite build with zero server dependency, automatic fallback when the engine service is unreachable, and honest single-threaded warnings.
- Android app shell (Capacitor, `lab.openchess.app`) with original launcher/splash artwork, status-bar theming, move haptics, and back-button exit confirm. Debug APKs build on GitHub Actions.
- Desktop single-file executable builder (Node SEA): double-click `.exe` starts the loopback service and opens the workspace; Windows smoke test runs a real search.
- Native build matrix workflow (`.github/workflows/native.yml`) covering the APK and the Windows executable on every relevant change.
- Delivered mates and near-perfect sacrifices now earn the brilliant label; thresholds stay documented and heuristic.
- Full offline game reviews: sequential on-device searches assembled with the shared review module, so the APK reviews games with identical classification semantics.
- Release APK and Windows desktop bundle attached to draft releases, with optional release signing via secrets.

### Fixed

- PGN import falls back to the shared parser when the API is unreachable, so offline imports keep working.
- Comparisons and benchmarks explain they need the engine service instead of failing mid-run when only the offline engine exists.
- Android back button exits via the native App API (double-tap) instead of the no-op `window.close()`.
- The offline engine worker bundles in-process with a pinned esbuild instead of shelling out to a transitive binary.

### Compatibility

No API or bundle contract changes. Review results gain an optional `warnings` array for provenance notes. The content security policy gains `worker-src 'self'` and script `wasm-unsafe-eval` for the offline engine; `.wasm` responses carry `application/wasm`. See [migration notes](docs/migration-0.6.md).

## 0.5.0 - Unreleased

### Added

- Frozen benchmark Suite v1 (`openchesslab-suite-v1`): three append-only positions with a SHA-256 content hash, recorded on exact-suite runs only.
- Tamper-evident experiment bundles (`.oclb.json`): suite, engines, settings, environment, measured rows, and notes under one canonical checksum.
- Bundle export in the UI and via `GET /api/jobs/:id/export?format=bundle` for completed benchmarks, plus suite provenance in results.
- Standalone dependency-free bundle verifier (`node scripts/verify-bundle.mjs`, with `--json` mode) and headless regression CLI (`node scripts/regress.mjs`) with honest exit codes and no strength claims.
- Copy-paste GitHub Actions workflow for engine repos (`examples/engine-regression.yml`) with pinned actions and candidate-bundle upload.
- Reproducibility guide, UCI pitfalls guide for engine authors, and 0.5 migration notes, all linked from the in-app documentation.

### Fixed

- Bundle verification is order-independent: results are deep-canonicalized at every nesting level, so any producer's key order hashes identically.
- Suite claims are cross-checked against measured rows in `verifyBundle`, the standalone verifier, and the regression CLI. False suite attachments no longer verify.
- The regression CLI verifies the baseline bundle (shape, suite, and content hash) before trusting its rows for disagreement gates.
- The regression CLI fails closed on bare/unknown `--fail-on` gates, malformed `--server` URLs, and contradictory `--print-bundle --json` output modes.
- The UI attaches and labels Suite v1 only when the stored ref and measured rows fully agree; unknown claims are labeled unverified.
- `createBundle` copies the suite block instead of aliasing caller state, and refuses multi-PV or rowless results instead of rewriting them.

### Compatibility

`BenchmarkResult` may include an optional `suite` reference. Export adds `format=bundle` for benchmarks (reviews reject it with 409). These additions are backward compatible for consumers that tolerate optional fields. See [migration notes](docs/migration-0.5.md).

## 0.4.0 - Unreleased

### Added

- Expanded documented review labels: brilliant, great, best, excellent, good, book, inaccuracy, mistake, miss, and blunder.
- Transparent per-side review accuracy, move counts, average confident loss, game-phase context, and a curated opening-name lookup.
- Full review reports in the interface with accuracy summaries, label totals, uncertainty visibility, and expanded CSV exports.
- Advertised engine-option discovery and validated custom UCI options for analysis, reviews, and benchmarks.
- Hardware-aware Threads/Hash recommendations with written reasoning and one-click application.
- Guided local-engine registry builder that validates names/paths and generates configuration without browser upload or execution.

### Fixed

- Review summaries no longer conflate uncertain estimates with confident blunder/mistake counts.
- Custom engine options cannot override core Threads/Hash/MultiPV settings or send unadvertised values silently.

### Compatibility

`Classification` now has ten documented values. Review annotations include `phase` and `bookMove`; review results may include `summary`. Request settings may include optional validated `options`. These additions are backward compatible for consumers that tolerate unknown labels and optional fields. See [migration notes](docs/migration-0.4.md).

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
