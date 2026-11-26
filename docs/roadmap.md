# Roadmap

These are **unimplemented ideas**, not advertised capabilities or promises of a delivery date.

- Persistent variation trees, editable comments, and multi-game PGN collections.
- Repetition-aware UCI position histories and more explicit draw-claim semantics.
- Durable server-side experiment storage and multi-tab synchronization. Bounded browser-local history and one custom FEN per interface run are already implemented; multi-position custom suites remain API-only.
- Repeated-run sampling with confidence intervals for benchmark comparisons. Single-run centipawn spreads, frozen Suite v1, verifiable bundles, and a headless regression CLI are already implemented.
- Optional tablebase lookup with clear licensing and network/privacy controls.
- Richer comparative statistics, repeated-run sampling, and confidence intervals.
- Match scheduling and properly designed strength-testing workflows.
- Stronger OS sandboxing of engine processes and externally enforced CPU/RAM budgets.
- Broader browser/platform and assistive-technology verification.

Public multi-user hosting would require a separate authentication, authorization, isolation, persistence, and abuse-prevention design. It is not a matter of binding the current server to `0.0.0.0`.

Propose work through a focused issue explaining the user problem, expected behavior, security boundary, and a way to verify success. No roadmap item is represented as already shipped.
