# Development Guide

## Local Setup

Use Node 22.12+, 24, or 26, npm, and a browser. Node 24 is the default in `.nvmrc`; CI covers all three supported majors. Run `npm ci` from the root. The checked-in lockfile is the reproducible dependency definition; avoid casual lockfile churn. Read [AGENTS.md](../AGENTS.md) for repository-specific invariants when using coding assistants.

```bash
npm run dev
```

Vite runs on port 5173 and proxies `/api` to the API watcher on 3001. The production server instead serves Vite's built files from `dist/client`. All browser API URLs are relative. When changing the API port for development, update the local Vite proxy configuration as well.

## Working Commands

- `npm run format`: format source, tests, documentation, and workflows with Prettier.
- `npm run format:check`: verify formatting without editing.
- `npm run lint`: ESLint and React hook checks; warnings fail the command.
- `npm run typecheck`: strict TypeScript validation of client, shared code, tests, and the NodeNext server.
- `npm test`: deterministic unit tests, protocol fixtures, HTTP integration, and real Stockfish searches.
- `npm run test:watch`: watch the unit/integration suite.
- `npm run test:coverage`: V8 coverage of server and shared logic; inspect `coverage/index.html`.
- `npm run build`: compile the Node server, build the browser application, and generate third-party license notices.
- `npm run test:e2e`: start separate production instances on 4173 (desktop) and 4174 (mobile), retaining production rate limits without letting profiles consume each other's budget. Both ports must be free; existing servers are not reused.
- `npm run docs:check`: validate local inline Markdown link and image file targets. External URLs and heading anchors are not checked.
- `npm run smoke:http -- http://127.0.0.1:3001`: check a running local production instance's version, static bundle, and real multithreaded UCI analysis. This script deliberately rejects non-loopback targets.
- `npm run security`: audit locked production and development dependencies; high/critical advisories fail.
- `npm run release:pack`: produce the built application archive for a GitHub release. This does not publish to npm or GitHub.
- `npm run capture:ui`: capture the README screenshot from a running instance and a real completed engine search. Set `OPENCHESSLAB_URL` if it is not running on `http://127.0.0.1:3001`.

Install the test browser and its OS dependencies before browser testing:

```bash
npx playwright install --with-deps chromium
npm run build
npm run test:e2e
```

If the environment cannot install system libraries, provide an isolated browser runtime and set `PLAYWRIGHT_BROWSERS_PATH` and, on Linux, `LD_LIBRARY_PATH` consistently. Do not modify application code to skip browser checks. The verification report records any environment-specific setup used for this source snapshot.

## Tests and Their Boundaries

Unit tests cover PGN/FEN transformations, special moves, score/mate semantics, review thresholds, strict schemas, CSV serialization, UCI parsing, process errors, and job lifecycle/limits.

Protocol fixtures are deliberately simple test programs. They exercise supported/unsupported options, partial output, startup/search interruption, invalid output, missing executables, and cleanup. Their made-up node counts are never used by the application or presented as real engine benchmarks.

Integration tests launch the actual pinned full and Lite Stockfish builds and assert properties of valid searches, not exact scores or timing values. They verify review, terminal positions, exports, authentication, rate limiting, and origin/host behavior through Fastify's injection interface.

Playwright launches the built application and real engines. Core workflows do not use mocked engine responses. A cancellation race test delays an actual creation response; isolated storage-rendering tests use explicitly labeled fixtures for corrupt or missing data. The suite checks imports, legal input, keyboard navigation, modal isolation, promotion, state restoration, reviews, comparisons, downloads, responsive layouts, and automated accessibility. Mobile tests use Chromium device emulation, not real iOS/Android hardware. Automated accessibility checks do not replace manual assistive-technology testing.

## Making Changes

Read the [architecture](architecture.md) before changing the UCI lifecycle. Never retain an engine after its owning job completes, and always close it in a finally block. Changes to score normalization should include both sides to move, signed mate distances, terminal mate zero, and bound directions.

Client changes must not display a prior position's score as current. Cancellation must suppress stale polling responses, including jobs created while a cancellation is in flight. Requests must stay bounded even if the browser navigates away.

Document new environment variables and schema limits. Use measured evidence for performance claims. Keep benchmark startup, engine-reported time, and wall-clock search time distinct.

## Reviewing a Pull Request

Run the commands you report. Inspect error and cancellation paths, check request trust boundaries, and verify that persisted browser state is validated. Review external dependencies and license obligations. Do not accept screenshots as proof that API behavior works, or a passing unit suite as proof of browser behavior.

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the contribution process, [maintenance](maintenance.md) for recurring checks, and [publishing](publishing.md) for releases.
