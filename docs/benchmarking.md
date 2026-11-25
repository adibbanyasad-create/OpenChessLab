# Make a Fair Comparison

An engine experiment should produce evidence you can inspect. OpenChessLab records actual UCI output and measured time; it does not ship synthetic benchmark scores or imply that one run establishes engine strength.

## Run an Experiment

1. Choose Engine arena for the current board, or Benchmarks for the standard suite.
2. Select one to four configured engines.
3. Set the same requested depth, threads, and hash for all engines. MultiPV is fixed at one.
4. Start the run. Other application jobs must finish first; the engine manager admits the benchmark exclusively.
5. Inspect completed depth and warnings before comparing rows.
6. Download CSV or JSON. UI records are session-only; the server store is temporary.

The default suite contains the initial position, the Opera Game after 8...c6, and a rook endgame. These are transparent illustrative positions, **not a statistically validated strength or regression suite**. The API accepts your own named positions, up to eight per request.

## What Is Measured

`nodes` is the engine's cumulative reported searched nodes. `nps` is its reported nodes per second, not a server-derived estimate. Engines can count nodes differently, so NPS does not imply equal work or playing strength across implementations.

`engineTimeMs` is the engine's UCI time field. `wallTimeMs` is measured by the server from search preparation through bestmove. It includes `ucinewgame`, synchronization, transport, and PV handling; it excludes initial process startup, UCI handshake, neural-network loading, and initial option configuration.

The dashboard's peak throughput is the maximum reported NPS among completed rows. Total search time is the sum of measured search wall times. These are descriptive statistics of that run, not universal performance claims.

Each row includes requested depth, actual minimum completed depth, whether the time cap was reached, actual runtime engine name, effective UCI options, and warnings. Environment metadata includes OS, architecture, Node version, and logical CPU availability. It does not identify the CPU model, clock speed, thermal state, container limits, or every runtime flag; record those separately for publication.

## What Is Controlled

Engines and positions run sequentially. A separate process is created per engine per job. `ucinewgame` plus `isready` is sent before every position to request a state reset. Stockfish clears its game/hash state for this command; other engines control their own reset behavior, so verify it before publishing cold-hash comparisons. No warmup search is hidden in the measurements. Initial model/JIT warmup can influence the first search, even though startup is excluded from timing.

The application prevents its own concurrent jobs during a benchmark, but cannot stop unrelated machine activity. A separate OpenChessLab process could also contend for CPU. Run on an otherwise idle host and repeat your experiment.

## Interpret Carefully

- A search that reaches the 10-second time cap is not an equal-depth comparison. Do not label it as completing the requested depth.
- Multithreading is nondeterministic and can change the search tree and chosen move. Repeat runs and use distributions, not a single favorable value.
- Lite Stockfish has a smaller, weaker network than the full build. WASM execution is not an interchangeable substitute for a native architecture-optimized executable.
- A score disagreement is interesting evidence about that position and search, not proof of which engine is correct.
- Chess strength requires appropriate game matches, controls, and statistical methods. No Elo, tournament, or accuracy claim is generated here.

## Publish a Reproducible Result

Retain the JSON export, exact engine binary/version and network, input FENs, requested/effective settings, source revision, operating system, CPU model, available cores, memory, Node runtime, warmup policy, and background-load conditions. Repeat runs with a predefined sampling policy and report time-limited searches rather than dropping inconvenient results.

Do not compare the screenshots or verification suite's incidental timings as a hardware benchmark. Their purpose is to check the application, not rank engines.
