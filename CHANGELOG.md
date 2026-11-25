# Changelog

Meaningful changes are recorded here. This initial source snapshot is prepared for release as 0.1.0; a public GitHub release has not been asserted or fabricated.

## 0.1.0 - Unreleased

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
