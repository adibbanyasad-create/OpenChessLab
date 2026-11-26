# UCI Pitfalls for Engine Authors

Real failure modes OpenChessLab defends against, collected from the parser in
`src/server/uci.ts` and its fixture suite. If you are writing a UCI engine,
handling these correctly makes your engine work everywhere — not just here.

## 1. Scores Without Variations

Some engines emit `info score cp 31` with no `pv`. A score without a principal
variation is unactionable: there is no move to play or verify. OpenChessLab
requires a scored line to carry a legal PV; bare scores update nothing.

**Do:** always include `pv <moves>` with a score. **Don't:** send score-only
lines and assume the GUI will use them.

## 2. Statistics Arrive Separately

`info depth 8`, `info nodes 1500 nps 30000 time 50`, and the scored PV may
arrive as three different lines in any order. Parsers that expect one
complete `info` line per depth lose data or misattribute counters.

**Do:** treat each `info` line as a partial update. **Don't:** assume depth,
nodes, and score arrive together.

## 3. Never Borrow Depth Across Variations

In MultiPV mode, `info depth 9` without a `multipv` tag must not be applied to
PV 2 or PV 3. Unscoped depth is context for single-PV searches only; each
MultiPV line needs its own reported depth, or its depth is unknown (null).

**Do:** tag every MultiPV line with `multipv <n>` and its own `depth`.
**Don't:** emit one depth and expect clients to share it across lines.

## 4. Bounds Are Not Evaluations

`info score cp 31 lowerbound pv e2e4` is a search bound, not a position
evaluation. Using it as an exact score corrupts reviews, comparisons, and
opening analysis. OpenChessLab excludes bound-only lines from scored results
(and flips bound direction for Black-to-move normalization).

**Do:** send fail-soft bounds during search, then a final exact score.
**Don't:** finish a search with only a bound and call it the evaluation.

## 5. Mate Zero Needs a Winner

`mate 0` means the game is already over — but which side won? The sign
convention breaks down at zero distance. OpenChessLab represents terminal
mates with an explicit `winner` field (`w`/`b`) instead of guessing.

**Do:** prefer sending `bestmove (none)` on terminal positions per the spec.
**Don't:** send `score mate 0` without context and expect correct display.

## 6. `info string` Is Not Data

Text after the `string` keyword is human-readable commentary. Engines that log
numbers there (`info string hash 1024 nodes 5`) break naive token parsers.
OpenChessLab truncates every line at the `string` keyword before parsing.

**Do:** keep diagnostics in `info string ...` free of misleading keywords.
**Don't:** rely on clients parsing your log text as measurements.

## 7. Missing Means Null, Not Zero

An engine that omits `nodes`, `nps`, or `time` has reported nothing — not zero.
Coercing absence to zero fabricates a measurement (notably NPS, where nonzero
nodes over zero time is undefined, not infinite). OpenChessLab records absent
or invalid measurements as null and says so in warnings and exports.

**Do:** omit fields you don't track. **Don't:** send `nps 0` when you mean
"unknown" — and never divide by a zero time field.

## 8. Handshakes Can Stall or Lie

Engines may ignore `uci`, never send `uciok`, skip `readyok`, or exit mid-job.
Every wait needs a deadline, a kill path, and cleanup in a finally block.
OpenChessLab aborts handshakes after 15–20 s, kills unresponsive processes
after a grace period, and always closes the child — on success, error,
cancellation, timeout, or shutdown.

**Do:** answer `uci` → `uciok` and `isready` → `readyok` promptly, and exit
cleanly on `quit`. **Don't:** assume the GUI will wait forever.

## 9. Advertise Options Honestly

`option name Threads type spin default 1 min 1 max 512` is a contract. Engines
that advertise options they ignore (or reject values inside their own range)
cause silent misconfiguration. OpenChessLab validates custom options against
advertised types/ranges/choices and warns on anything unapplied.

**Do:** advertise exactly what you implement, with true min/max/default.
**Don't:** accept `setoption` silently and keep old behavior.

## 10. Reset State on `ucinewgame`

Benchmarks and reviews send `ucinewgame` + `isready` before every position and
expect a cold state. Engines that keep hash or game history across the reset
produce order-dependent results that look like noise — or cheating.

**Do:** clear transposition tables and repetition history on `ucinewgame`.
**Don't:** treat it as a no-op.

## Test Your Engine Here

Point OpenChessLab at your binary via `ENGINES_CONFIG`, run Suite v1, and read
the warnings: every item above surfaces as an explicit warning, null, or
failed job — never a silent wrong number. See
[configuration](configuration.md) and [reproducibility](reproducibility.md).
