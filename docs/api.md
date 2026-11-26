# API Reference

All routes are relative to the application's origin. Request and response bodies are JSON, except CSV exports. Send `Content-Type: application/json` for POST requests. When the server has `OPENCHESSLAB_API_TOKEN`, send `Authorization: Bearer <token>` on every API route except health.

Request schemas are exported from `src/shared/schemas.ts`. Response interfaces are in `src/shared/types.ts`. Extra request properties are rejected. Errors have the shape `{ "error": "Readable explanation." }` without stack traces or executable paths.

## Health and Engines

`GET /api/health` returns `status`, application `version`, and `requiresAuth`. It verifies the API is reachable; it does not claim every configured executable is working.

`GET /api/engines` returns `{ engines: [...] }` with ID, name, description, and kind (`wasm` or `native`). Executable paths and arguments are never returned.

`GET /api/engines/:id/options` returns the runtime engine name, up to 128 advertised UCI options, and startup warnings. A nonresponsive engine returns 502 with a sanitized message. Unknown engine IDs return 400.

`GET /api/hardware/recommendations` returns conservative suggested Threads/Hash values, detected CPU/RAM facts, and written reasons. Unknown memory produces a conservative default, not an invented capacity.

## PGN Parsing

`POST /api/games/parse`

```json
{ "pgn": "1. e4 e5 2. Nf3 Nc6 *" }
```

Returns normalized PGN, headers, `initialFen`, ordered `positions`, and verbose main-line `moves`. Position index zero is the initial board; each subsequent index is the position after that half-move. Moves include SAN, from/to, color, optional promotion, and before/after FENs.

## Analyze a Position

`POST /api/analysis` returns HTTP 202 and a job snapshot.

```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  "engineId": "stockfish-lite",
  "depth": 14,
  "threads": 1,
  "hash": 64,
  "multiPv": 3
}
```

Only `fen` is required; other defaults match the example. `hash` is in MB. Range limits are documented in [configuration](configuration.md).

A completed `AnalysisResult` includes `engineId`, the runtime `engineName`, `fen`, requested `settings`, actual `effectiveOptions`, `warnings`, `lines`, `bestMove`, measured `wallTimeMs`, `completedDepth`, `depthLimited`, and `terminal`.

The returned FEN is canonicalized by the chess library and is the position actually sent to the engine. Extra printable spacing is normalized; inconsistent castling rights, impossible piece counts, and counters above 1,000,000 are rejected.

Each line has depth, selective depth, MultiPV index, normalized score, total nodes, reported NPS, reported `timeMs`, hash fullness (per mille), legal UCI moves in `pv`, and corresponding `san` strings. `bestMove` uses UCI coordinate notation, including a promotion suffix. Terminal results can have no best move and zero search work.

Starting in 0.2, `depth`, `seldepth`, `nodes`, `nps`, `timeMs`, and `hashfull` are nullable. `completedDepth` can also be null. Missing or invalid measurements are not replaced with zero or inferred from other counters. Search-wide counters can arrive in separate UCI `info` messages; the result retains the latest reported values while preserving each scored PV's own depth. `info string` text is never interpreted as measurements. `depthLimited` means the requested depth was not confirmed, not proof that a time cap was the reason. See [migration notes](migration-0.2.md).

## Review a Game

`POST /api/reviews` returns HTTP 202 and a review job.

```json
{
  "pgn": "1. f3 e5 2. g4 Qh4# 0-1",
  "engineId": "stockfish-lite",
  "depth": 10,
  "threads": 1,
  "hash": 64,
  "multiPv": 1
}
```

Requires a nonempty main line of at most 200 half-moves. Maximum review depth is 14, and MultiPV must be 1. The result contains `scores` indexed by ply and move `annotations` with classification, estimated loss, SAN, uncertainty flag, and the prior position's best move. Each score records reported depth (or null) and whether the requested depth was not confirmed. An annotation is uncertain when either adjacent position is unconfirmed; uncertain losses are null rather than fabricated blunder values. See [usage](usage.md) for classification caveats.

## Benchmark or Compare

`POST /api/benchmarks` returns HTTP 202 and a benchmark job.

```json
{
  "engineIds": ["stockfish-lite", "stockfish"],
  "positions": [
    {
      "name": "Initial position",
      "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    }
  ],
  "depth": 12,
  "threads": 1,
  "hash": 64,
  "multiPv": 1
}
```

Select 1-4 unique engine IDs and 1-8 valid positions. MultiPV must be 1. Runs are sequential and exclusive within this server. A busy server returns 409 rather than silently adding competing searches.

New results contain an ID, `appVersion`, timestamp, requested settings, environment metadata, per-position `comparisons`, and one row per engine/position. Rows include requested/reported depth, score, best move, engine-reported nodes/NPS/time, measured wall time, effective options, and warnings. Reported depth, nodes, NPS, and engine time can be null. Wall-clock time is measured by the server. Older exports may omit `appVersion` or `comparisons`; do not guess them from the current server version. Comparison entries key each canonical FEN to a centipawn mean, centipawn spread, mate count, and reserved missing-score count. Mate scores are counted, not averaged into centipawn statistics.

## Poll and Cancel

`GET /api/jobs/:id` returns the latest snapshot. Poll approximately every 500 ms, not in a tight loop.

```json
{
  "id": "a UUID returned by POST",
  "kind": "analysis",
  "status": "running",
  "createdAt": "an ISO timestamp",
  "progress": { "completed": 0, "total": 1, "message": "Searching depth..." }
}
```

Statuses are `running`, `completed`, `failed`, and `cancelled`. Terminal jobs include `finishedAt`; completed jobs include `result`; failed jobs include a sanitized `error`. A cancellation can briefly be observed before `finishedAt` while process cleanup is underway.

`DELETE /api/jobs/:id` cancels a running job and waits for engine cleanup. Cancelling an already-finished retained job is harmless. Unknown/expired jobs return 404. A server restart clears all jobs. At most 100 records are retained, and finished records expire after 30 minutes or can be evicted earlier at capacity.

## Export Results

`GET /api/jobs/:id/export?format=csv` downloads a completed benchmark or review as CSV. `format=json` returns its complete result. Exporting an unfinished job or an unsupported job kind returns 409. Review CSV contains ply, White-perspective evaluation, move, classification, estimated centipawn loss, explicit uncertainty, and the prior position's best move.

CSV strings that begin with spreadsheet formula markers are escaped. Columns include settings, actual options, warnings, timestamps, and environment. Export JSON when you need exact structured values, especially scores and option maps.

Missing measurements are empty CSV cells, corresponding to null in JSON. The `app_version` column is appended to the existing columns. A true reported zero remains zero. Do not coerce empty CSV cells to measured zero in downstream analysis.

## Error Statuses

- 400: malformed PGN/FEN, invalid schema, unknown engine, or invalid resource setting.
- 401: missing or incorrect configured API token.
- 403: disallowed Host or cross-origin mutation.
- 404: unknown route or absent/expired job.
- 409: benchmark exclusivity or invalid export state.
- 413: body too large.
- 415: unsupported request content type.
- 429: request rate or active-job limit exceeded.
- 500: unexpected internal error; details are logged server-side, not exposed in the response.

Engine startup/search failures occur asynchronously and are represented by a failed job rather than pretending a 202 response guarantees a successful search.
