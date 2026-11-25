# Configuration and Engines

## Server Environment

`HOST` defaults to `127.0.0.1`. `PORT` defaults to `3001` and must be an integer from 1 to 65535.

`ALLOWED_HOSTS` defaults to `localhost,127.0.0.1,[::1]`. List exact browser-facing hostnames, without ports or schemes. A leading dot permits subdomains; `.e2b.app` is supported for a private preview. Do not allow an untrusted domain wildcard.

`OPENCHESSLAB_API_TOKEN` is optional for local use and must contain 24-512 visible ASCII characters without spaces when set. All API endpoints except health require the token. Enter it in the interface's Connection settings; it stays in session storage, not persistent local storage. Generate it with a cryptographically secure tool. Use TLS outside loopback.

`ENGINES_CONFIG` points to a JSON registry loaded at startup. Environment files are not automatically read.

`FRAME_ANCESTORS` defaults to `'self'`, preventing third-party iframe embedding. For a trusted Arena preview, an operator can explicitly set it to `'self' https://arena.ai https://*.arena.ai`. Only CSP self/none keywords and HTTPS origins are accepted. Keep the restrictive default for standalone deployments.

## The Built-in Engines

**Stockfish 19 Lite** runs the multi-threaded Lite WASM build shipped by `stockfish@19.0.1`. A small neural network reduces startup and memory cost. This is the initial engine choice.

**Stockfish 19** runs the full-network multi-threaded WASM build from the same pinned package. It has a larger network and higher startup/memory cost. Lite is weaker; the two should not be represented as equivalent builds.

The server launches each via Node as a separate process and exchanges UCI lines through stdin/stdout. Browser cross-origin isolation is not required because engine WebAssembly executes on the server. The engines' GPL licensing is separate from the application's MIT licensing.

## Add a UCI Engine

Use `engines.example.json` as a starting point:

```json
[
  {
    "id": "my-engine",
    "name": "My experimental engine",
    "description": "Locally built UCI engine",
    "command": "/absolute/path/to/my-engine",
    "args": []
  }
]
```

Only an administrator with server filesystem access can edit this file. Browser requests select an ID; they never supply commands, paths, arguments, or raw UCI. Command paths must be absolute. On Windows, JSON backslashes must be escaped. An engine ID is a lowercase alphanumeric/hyphen string, at most 64 characters; IDs must be unique and cannot replace built-in IDs.

The registry allows at most eight additional engines. The executable must understand `uci`, `isready`, `ucinewgame`, `position fen`, `go depth ... movetime ...`, and `quit`, and return standard scored principal variations plus a legal `bestmove`. An engine omitting `Threads`, `Hash`, or `MultiPV` receives no corresponding setoption command, and the result records the missing option. Reported numeric ranges are respected rather than silently clamped.

```bash
ENGINES_CONFIG=/absolute/path/to/engines.local.json npm start
```

Engines are trusted local programs. A UCI subprocess is not sandboxed: it runs with the server's OS permissions. Do not configure executables from unknown sources or expose engine upload/installation endpoints.

`examples/engines.ethereal.json` shows an optional second engine family, using the path from Debian's `ethereal-chess` package. Install and verify the executable yourself before selecting that registry; the binary is not included in OpenChessLab. Native Ethereal 12.00 interoperability was checked separately in the verification environment, in addition to the two bundled Stockfish WASM builds.

## Resource Boundaries

- Interactive depth: 1-24; review API depth: 1-14; UI review depth: at most 10.
- Threads: 1-4; hash: 16-512 MB; MultiPV: 1-5.
- Interactive search: 8 seconds; review search: 1.5 seconds per position; benchmark search: 10 seconds per position. Engines also have a hard response deadline.
- Any job: at most 5 minutes including engine startup and cleanup.
- Two analysis/review jobs at once; benchmark jobs require exclusive use and execute engines and positions sequentially. Busy requests return 409 or 429 instead of accumulating an unbounded queue.
- At most 8 positions and 4 distinct engines per benchmark request.
- PGN: 256,000 UTF-8 bytes; 400 half-moves imported; 200 half-moves reviewed.
- At most 100 finished/running job records; finished records are pruned lazily after 30 minutes and older finished jobs can be evicted earlier at capacity.
- Request body: 300,000 bytes; default request rate: 300/minute per connecting IP; costly job routes: 30/minute per route and IP.

Memory caps apply to requested hash, not the whole engine process. Use OS/container resource controls if you need strict CPU or RAM quotas. Proxy clients share a rate-limit identity because untrusted forwarded IP headers are not accepted.
