# Architecture

## One Application, Clear Boundaries

OpenChessLab is a TypeScript application, not a fleet of services. A small shared layer keeps chess semantics consistent between the browser and the API. Fastify serves the production assets and API from one origin; Vite provides the development interface and API proxy.

`src/client` contains React components, application state, original SVG pieces, and a cancellable job client. `src/shared` defines discriminated score types, strict Zod request schemas, chess.js utilities, review classification, and CSV serialization. `src/server` implements validation, the allowlisted registry, UCI process transport, bounded jobs, and sequential search tasks.

## Request Lifecycle

1. Host and origin validation run before body parsing. Optional bearer authentication protects API requests.
2. Fastify enforces body/rate limits. A strict Zod schema rejects extra properties and invalid resource settings.
3. chess.js validates a position or PGN. Additional position checks reject a side-not-to-move king left in check.
4. The registry resolves a trusted engine ID. The job manager admits the job only within concurrency and exclusivity limits.
5. A UCI engine process starts with `shell: false`. It completes `uci` and `isready` handshakes, advertises options, and receives validated settings.
6. A search requests a game/hash state reset with `ucinewgame`, synchronizes, sends `position fen`, and requests depth plus a time limit.
7. Parsed `info` lines become White-normalized scores and legal SAN variations. Progress snapshots are throttled to about 10/second; the browser polls at 500 ms.
8. A completed result is stored in memory. On success, error, cancellation, timeout, or shutdown, the process is closed; an unresponsive process is killed after a short grace period.

## Score Semantics

UCI scores are normally from the side-to-move perspective. The parser normalizes centipawns and signed mate distances to White. Mate scores also carry `winner`, avoiding ambiguity at zero distance. Black-to-move bounds reverse direction when normalized. Bound-only score lines are not used as exact PV evaluations.

Principal variations are validated by replaying legal moves from the same FEN and converting them to SAN. At most 32 SAN moves are retained. Invalid suffixes are dropped; an invalid best move fails the job. Terminal checkmate, stalemate, and insufficient-material positions have explicit outcomes and no invented search work.

The UCI parser accepts partial information records. Search-wide counters are accumulated separately from scored variations, so a later nodes/NPS/time record updates the final result without changing a PV's evaluation or its recorded depth. Unscoped depth records can supply context for a single-PV search; in MultiPV mode a variation must report its own depth. One variation's depth is never borrowed for another. All counters are reset per position. Absent or invalid measurements become null; explicit zeros remain zero. Text after the UCI `string` keyword is excluded from numeric parsing. A lower or unknown completed depth is reported without guessing why an engine stopped.

Each position is searched independently. The server does not reconstruct repetition history or implement a new chess engine. Draw-claim handling and alternative variation-tree history are not represented as implemented features.

## Job Lifecycle

Jobs transition from `running` to `completed`, `failed`, or `cancelled`. They have random UUIDs, timestamps, bounded progress snapshots, optional typed results, and sanitized errors. An AbortController links cancellation and deadlines to every handshake/search wait. The task's finally block always closes its engine.

At most two non-benchmark jobs run concurrently. A benchmark needs an idle manager and excludes other jobs until cleanup ends. Cancellation waits for task cleanup before replying. No process is reused across separate jobs, preventing hidden cross-request options or hash state.

The registry holds at most 100 jobs. Expiry and oldest-finished eviction run on access/admission; this is a bounded in-memory store, not durable persistence. Multiple server replicas would have separate job registries and require sticky routing. Multi-replica operation is not supported in this version.

## Browser State

The active main line and half-move index are saved as PGN in local storage and revalidated on restore. Making a move from an earlier position creates a replacement continuation. Browser state never stores live process handles.

The experiment view lazily loads a bounded benchmark-history store. A versioned schema validates restored records, preserving recorded engine names and application-version metadata. At most 20 runs and 1 MB are written. Unavailable/full storage falls back to an in-memory session with a visible warning; failed deletion is reported rather than claimed successful. History is local to a browser origin, not a synchronized database. Close other tabs before clearing it and export research records for long-term use.

`useRemoteJob` coordinates creation, polling, cancellation, and stale-response suppression. Live analysis is debounced so navigating quickly does not spawn a search for every intermediate position. Manual searches are also cancelled when their position/settings change. Late creation responses are still received so the server job can be cancelled by ID. Only results matching the current FEN and settings are displayed. Review results are tied to the exact PGN that was reviewed.

Dialogs use native modal focus management. The board supports pointer and keyboard input, legal destination hints, drag/drop, promotion, and accessible square names. Responsive layouts retain the same capabilities on mobile.

Global shortcuts do not run behind native dialogs, including promotion and history confirmation. Focus is retained across keyboard moves and board flips. Secondary views and their validation code are lazy-loaded rather than added to the initial board bundle.

## Performance Decisions

- Server-side UCI keeps engine binaries and neural networks out of the browser bundle.
- Progress is bounded and throttled; no raw engine output accumulates in a job.
- A fixed job limit prevents unbounded queues and memory growth.
- Each benchmark requests a state reset and runs sequentially; engine startup is excluded from search timing. Custom engines determine their own reset behavior.
- Fonts, piece artwork, and application assets are served locally. There are no third-party tracking requests.
- Build artifacts use Vite content hashing, compression-friendly static assets, and an explicit production build.

## Security Boundary

The browser is untrusted. Validation and engine allowlisting are server responsibilities. Engines and the registry file are trusted administrator-controlled inputs. Spawn does not invoke a shell. Headers restrict active content and external connections. Framing is self-only by default; preview framing requires explicit `FRAME_ANCESTORS` configuration. No global CORS allowance is added.

This is a local or privately hosted single-user tool. A reverse proxy with TLS and access control, optional API token, and OS resource restrictions are required for more exposed deployments. See [security](../SECURITY.md).
