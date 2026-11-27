# Migrating to 0.6

Version 0.6 adds the alive review experience, the offline engine, and native
packaging. There are no API or bundle contract changes. Review results gain
an optional `warnings` array (offline reviews note their single-threaded
provenance there); consumers that tolerate unknown fields are unaffected.

## Content Security Policy

The server CSP gains two directives for the offline engine worker:

- `worker-src 'self'` so the analysis page may spawn its bundled worker.
- `script-src 'wasm-unsafe-eval'` so the Stockfish WebAssembly module may
  compile. Plain `eval()` and inline scripts stay blocked.

If you run OpenChessLab behind your own proxy with a custom CSP, add these
two sources or offline analysis will fail while server analysis keeps
working.

## WebAssembly MIME Type

`.wasm` responses now carry `Content-Type: application/wasm`, which
`WebAssembly.instantiateStreaming` requires. Proxies that strip or rewrite
content types will break the offline engine; server analysis is unaffected.

## Review Labels

`brilliant` is now also awarded for delivered mates (mate-in-1 or faster)
and for sacrifices within 15 cp of perfect. Counts in stored review exports
are historical facts; only new reviews use the widened rule.

## Native Packages

- Android: debug APKs are unsigned CI artifacts for sideloading and testing,
  not Play releases. They run analysis and full game reviews on-device with
  the offline engine; comparisons and benchmarks need the engine service.
  Release APKs attach to draft releases and use `ANDROID_*` signing secrets
  when configured, else the debug key for testing only.
- Desktop: the `.exe` embeds the server and opens the system browser. Engine
  searches spawn `OPENCHESSLAB_NODE` when set, else the launched runtime.
  The Windows bundle (exe, client, engines, runtime) attaches to releases.

See [installation](installation.md) for platform setup and
[usage](usage.md) for the review label reference.
