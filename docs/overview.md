# Welcome to OpenChessLab

Chess rewards curiosity. OpenChessLab gives that curiosity a place to work: one board, transparent engine output, and experiments you can inspect rather than simply trust.

## Three Ways to Explore

**Analysis board** is your day-to-day workspace. Import a game, load a FEN, or play a move. Watch the engine's evaluations and principal variations, then review the game to find its turning points.

**Engine arena** compares UCI engines on your current position. The bundled full and Lite Stockfish 19 builds use different neural networks. Compare their actual evaluations rather than assuming equal behavior.

**Benchmarks** runs an opening, middlegame, and rook endgame sequentially. Look at completed depth, total nodes, reported NPS, and measured search time. Export raw data before making claims about performance.

## Local First, by Design

The application needs no account or external analysis service. The browser talks only to its own server. That server runs engines on the machine where OpenChessLab is installed. In a remote preview, that means the preview server, not your laptop.

Your active PGN is saved in browser storage when available. Engine jobs live in server memory temporarily; benchmark results stay in the current UI session. Use the export buttons to preserve work.

## Open by Design

Application code, documentation, and original SVG pieces are MIT licensed. Stockfish is a separate GPL-3.0 process; its license is not changed by this project. Third-party notices are included in the repository and generated distribution.

There are no made-up users, rankings, speed claims, or community statistics. The example on the analysis board is Paul Morphy's public-domain Opera Game from Paris, 1858. Engine evaluations are calculated when you open the workspace.

## Find Your Next Step

- [Get the application running](installation.md).
- [Learn the analysis workspace](usage.md).
- [Configure your engine](configuration.md).
- [Make fair comparisons](benchmarking.md).
- [Read the architecture](architecture.md).
- [Contribute a focused improvement](../CONTRIBUTING.md).
