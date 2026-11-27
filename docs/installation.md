# Installation

## Requirements

- Node.js 22.12 or later in the 22.x line, Node.js 24.x, or Node.js 26.x; npm 10 or later. Node 24 is the recommended development runtime.
- A modern browser supporting WebAssembly, native dialogs, Fetch, and CSS Grid. Server-backed search runs engine WebAssembly in Node; the offline engine runs the same Stockfish build in a Web Worker on the device.
- Enough RAM for the Node server, the selected neural network, and requested hash. Two concurrent searches can each request 512 MB of hash; additional engine memory is required.
- Network access for the initial npm install. The Stockfish dependency is approximately 205 MB unpacked and contains full and Lite builds.

## Run a Production Build

From the repository root:

```bash
npm ci
npm run build
npm start
```

Visit `http://127.0.0.1:3001`. Fastify serves both the application and `/api`. No separate engine installation is needed for the two bundled Stockfish builds.

The server runs in the foreground. Ctrl+C cancels active jobs and closes engine processes. `npm start` requires an existing build.

## Development

```bash
npm ci
npm run dev
```

Visit `http://localhost:5173`. Vite serves React and proxies `/api` to `127.0.0.1:3001`; TypeScript watch mode restarts the API after server edits. The Vite development server listens on all interfaces for preview compatibility, so run it only on a trusted network or add a local firewall. The production server defaults to loopback.

## Private Remote Use

Set these variables in the environment before starting the server:

```bash
HOST=0.0.0.0 PORT=3001 \
ALLOWED_HOSTS=chess.example.internal \
OPENCHESSLAB_API_TOKEN=replace-with-a-long-random-secret \
npm start
```

Use your own hostname and a generated secret, not this example value. A reverse proxy must preserve the incoming Host header and serve HTTPS. Browser API requests are always relative to the application's origin. Enter the token in Connection settings.

`ALLOWED_HOSTS` is a comma-separated hostname allowlist without schemes or ports. A leading dot allows subdomains, such as `.e2b.app` for a private Arena preview; use the exact hostname instead where possible. Host allowlisting is not authentication. See [security](../SECURITY.md).

In PowerShell, set each variable using `$env:PORT = "3001"` before `npm start`. The supplied `.env.example` is a reference; dotenv files are not automatically loaded. Node's `--env-file` can be used with the built server if desired.

## Container Configuration

The Dockerfile builds the frontend and backend and runs as the unprivileged `node` user. Its Node 24 base image is pinned by multi-platform digest; Dependabot proposes reviewed base-image updates. CI includes a Linux container build and a real HTTP/Stockfish smoke check. See the verification report for which checks have actually executed, and verify your own host's resource and network configuration.

```bash
docker build -t openchesslab:local .
docker run --rm --init -p 127.0.0.1:3001:3001 \
  --memory=2g --cpus=2 openchesslab:local
```

Do not publish the container port on all host interfaces without authentication, TLS, and network controls. Set engine settings to fit the container's resource limits.

## Native Packages

**Android APK (debug, for testing):** built by the `Native Builds` GitHub
workflow — no local SDK needed. Download the `openchesslab-debug-apk`
artifact, sideload it on a device running Android 7.0 (API 24) or later, and
the workspace opens with the offline engine ready. Debug builds use a
throwaway CI signature, so reinstall rather than update across builds, and
never publish them to Google Play. Reviews, benchmarks, and custom server
engines need the desktop/server build below.

To build locally with Android Studio or the command-line tools:

```bash
npm ci
npm run build
npx cap sync android
cd android && ./gradlew :app:assembleDebug
```

The APK lands in `android/app/build/outputs/apk/debug/`.

**Desktop executable (Windows):** the same workflow builds
`OpenChessLab.exe` with Node's Single Executable Application support and
smoke-tests it with a real search. Double-click it: the loopback service
starts and the workspace opens in the default browser. Close the console
window to stop the service. Searches spawn engine scripts with
`OPENCHESSLAB_NODE` when set, else the launched runtime.

To build locally on the target OS:

```bash
npm ci
npm run build
node scripts/build-desktop.mjs
node scripts/smoke-desktop.mjs dist/desktop/OpenChessLab.exe
```

The binary and its `.sha256` sidecar land in `dist/desktop/`. Cross-OS
builds are not supported: build the `.exe` on Windows.

## Troubleshooting

**Connection needed:** verify that the server is running, the port is correct, and the API token matches. The development proxy expects API port 3001.

**Host is not allowed:** add the real browser-facing hostname to `ALLOWED_HOSTS`. Do not disable the check to solve a reverse-proxy mismatch.

**Engine timed out:** use the Lite engine, lower the requested depth, or check CPU/RAM contention. A hard timeout stops the process; it does not fabricate a score.

**Requested depth was not confirmed:** the engine stopped early or did not report a complete depth. A time cap is one possible reason, not an inferred certainty. Inspect reported depth and warnings instead of treating the result as the requested depth.

**An engine statistic is unavailable:** the engine omitted it or reported an invalid value. OpenChessLab does not invent a measurement. JSON uses null and CSV uses an empty cell for that value.

**Benchmark history was not saved:** browser storage may be blocked or full. The current session still shows the result; export JSON/CSV before reloading. History is not a cross-device or synchronized multi-tab database.

**Browser tests cannot start:** run `npx playwright install --with-deps chromium`; headless Chromium also needs its system libraries. Use `PLAYWRIGHT_BROWSERS_PATH` consistently if placing browsers in a non-default cache.

**Empty or stale build:** run `npm ci` and `npm run build` from the project root. Do not use a development server as a public production service.
