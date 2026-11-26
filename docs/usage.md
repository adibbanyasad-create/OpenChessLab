# Your Analysis Workspace

## Start with a Game

The default workspace opens the Opera Game after 8...c6. It is a historical example, not a fake user game. Live analysis starts after the engine service connects.

Choose **Import game** to paste a PGN or upload a `.pgn` file. The importer accepts one standard-chess game, up to 256 KB and 400 half-moves. Comments and variations may be parsed by chess.js, but only the main line is shown and edited. Use **Load FEN** for a standalone position.

**New analysis** offers the initial position or the Opera Game. It replaces the active workspace; export your PGN first if you want to retain it. Browser storage restores the latest workspace on reload, when storage is available.

## Explore the Board

- Click or tap a piece, then a legal destination. Dots show legal moves; rings indicate captures.
- On desktop, drag a piece to its destination.
- Choose queen, rook, bishop, or knight when a pawn promotes.
- Click game notation or use the controls below the board to navigate. Making a new move replaces the continuation after the selected position; there is no persistent variation tree.
- Flip the board or toggle the best-move arrow. Select a principal variation to play its **first move**.
- Copy the current FEN or export the game's PGN. Game details shows metadata and the exact current FEN.

## Read the Engine

Evaluations always use **White's perspective**. `+0.50` favors White by half a pawn; `-0.50` favors Black. `M3` means a reported forced mate for White in three engine-reported moves; `-M3` favors Black. A terminal checkmate is displayed as `M0` or `-M0` with a separately represented winner.

Principal variations are legal SAN continuations of the current FEN. During a search, scores can change and different variations can temporarily be at different depths. The finished result reports the minimum completed depth across displayed lines. Bound-only engine scores are not used as exact evaluations.

Missing measurements appear as unavailable, not as measured zeros. An engine can report counters on separate UCI lines; the latest reported search-wide values are used. If depth is unknown, it remains unknown. A search ending before its requested depth is not automatically described as a timeout.

**Nodes / sec** and **Search time** in the analysis panel come from UCI `info`. The benchmark export also includes separately measured wall-clock search time. Neither number includes initial engine startup.

Depth is a target, not a guarantee. The server caps each interactive search at eight seconds plus a hard-response grace period. Unconfirmed requested depths are marked explicitly. Turn Live analysis off to navigate without starting another search, then use Analyze manually. Manual searches are cancelled when you navigate or change their settings; the Stop action has a visible stopped state.

Hash and threads are set only if the engine advertises the corresponding UCI spin option. Actual applied options are recorded. Unsupported options produce a warning; the engine's own default is retained.

## Review a Game

Select **Review this game** to analyze the main line. Live analysis pauses so it does not compete with review searches. The interface uses the selected engine and settings, with MultiPV 1 and depth capped at 10. The API permits review depth up to 14 and a maximum of 200 half-moves.

The evaluation timeline appears after a completed review. Select a point to navigate to that half-move. Unreviewed games show only the currently measured score, not invented historical evaluations. The chart clips display values at six pawns; actual values remain in the review data.

Labels estimate centipawn loss for the player who moved, comparing the evaluation before and after the move. A move matching the prior principal variation's best move is labeled best. Remaining estimated losses are clamped to zero and classified as follows:

- Below 50 cp: good.
- 50-99 cp: inaccuracy.
- 100-199 cp: mistake.
- 200 cp or more: blunder.

Mate scores use a signed 10,000 cp surrogate for this heuristic. Changing a mate distance for the same winner does not incur a loss. These labels are depth-dependent; they are not centipawn accuracy, win probability, or a strength rating. Positions whose requested depth was not confirmed are marked in the result. FEN-only searches do not include repetition history.

## Keyboard Controls

- Left / Right: previous / next half-move.
- Home / End: initial / final position.
- F: flip board.
- A: return to the analysis workspace.
- ?: shortcut guide.
- Escape: close a dialog.
- On the focused board: arrow keys move between squares; Enter or Space selects a piece or destination.

Shortcuts do not intercept typing inside inputs or any open dialog, including promotion and history confirmation. Board focus is retained across keyboard moves and flips. The board, controls, imports, and promotion choices are keyboard reachable.

## Keep Experiment Records

Completed comparisons and benchmarks are saved in this browser when storage is available, up to 20 runs and 1 MB. The run selector restores them across navigation and reload. Recorded engine names, dates, settings, and available application versions remain attached to the original run; changing the currently installed engine does not relabel old results.

Use Export CSV or JSON for durable research records. The Clear history control asks for confirmation and removes only locally saved benchmarks, not your PGN, downloaded files, or server job records. Close other OpenChessLab tabs first because their in-memory views are not synchronized. If storage is blocked, full, or corrupt, the interface explains the problem instead of claiming a save or deletion succeeded.
