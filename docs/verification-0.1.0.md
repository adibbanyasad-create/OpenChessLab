# Verification Report: 0.1.0

Version: **0.1.0 source snapshot**. Verification date: **2026-11-25**.

This report distinguishes checks actually executed in the development workspace from configured automation and unverified deployment targets. It is not an independent audit, security certification, chess-strength evaluation, or evidence of public adoption.

## Environment

- Linux x64, Debian 12 userspace, with two logical CPUs available to the process.
- Node.js 22.23.1 and a separately provisioned Node.js 24.22.3 runtime.
- npm 10.9.8; versions of project dependencies are recorded in `package-lock.json`.
- Playwright 1.65.1 and its installed Chromium browser; desktop and Pixel 7 device-emulation profiles.
- Root privileges were unavailable. Chromium and its missing Debian shared libraries were provisioned under an ignored workspace cache; browser checks were run with explicit `PLAYWRIGHT_BROWSERS_PATH` and `LD_LIBRARY_PATH`.

## Executed Checks

| Check                                         | Observed result                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| ESLint and React hook rules                   | Passed; warnings are errors                                                                                         |
| Strict TypeScript client/shared/server checks | Passed                                                                                                              |
| Unit and integration suite, Node 22.23.1      | **122 passed in 7 files**                                                                                           |
| Same unit and integration suite, Node 24.22.3 | **122 passed in 7 files**                                                                                           |
| Chromium browser workflows                    | **30 passed**, 15 desktop and 15 mobile                                                                             |
| Responsive overflow checks                    | Passed at 320, 768, 1024, and 1440 CSS pixels, plus the mobile device profile                                       |
| Automated axe checks                          | Zero violations in tested analysis, import, experiment, and documentation states; collapsed navigation also checked |
| Production build                              | Passed; real static frontend and API served together                                                                |
| Dependency audit                              | **0 known vulnerabilities** reported by npm audit at verification time                                              |
| GitHub workflow static validation             | `actionlint` 1.7.12 passed for all three workflow files                                                             |
| Release tag/version validation                | Matching `v0.1.0` passed the local guard                                                                            |
| README screenshots                            | Captured from real completed Stockfish searches, not mock API data                                                  |

The suite exercises real Stockfish processes. Test-only protocol fixtures deliberately simulate errors and are never displayed as engine benchmarks. Browser workflows use the production build and real HTTP API, not stubbed engine responses.

Automated accessibility checks cover WCAG 2 A/AA and 2.1 AA rules supported by axe in the tested states. Passing these checks is not a claim of complete WCAG compliance or real-device/assistive-technology certification.

## Release Archive

The release archive was also extracted into a separate directory and installed with `npm ci --omit=dev --ignore-scripts`. Its own production dependencies resolved locally, the compiled frontend and module asset returned successfully, and `node scripts/smoke-release.mjs .` completed a real Stockfish depth-4 search. The archive's SHA-256 checksum was checked independently. Source, tests, workflows, the lockfile, documentation, build artifacts, and license notices were inspected in the archive; dependency directories, private configuration, caches, and Git metadata were not included.

## Measured Coverage

`npm run test:coverage` produced the following V8 coverage snapshot for **server and shared code**, excluding the server entry-point process bootstrap:

| Metric     | Coverage |
| ---------- | -------- |
| Statements | 94.43%   |
| Branches   | 84.51%   |
| Functions  | 95.37%   |
| Lines      | 96.24%   |

The configured coverage gates are 90% statements, 80% branches, 90% functions, and 90% lines. React UI code is exercised by browser tests but is not included in these coverage percentages. These numbers do not imply that every OS, engine, or failure timing has been covered.

## Verified Implemented Features

- Real UCI startup, `isready` synchronization, advertised option discovery, depth-bounded search, scored PV parsing, and engine termination.
- Full and Lite Stockfish 19 WASM execution, including applied hash, threads, and MultiPV settings.
- A separate native **Ethereal 12.00** interoperability check through the administrator registry and benchmark API: two positions, depth 8, two threads, 32 MB hash, and real scores/nodes/NPS. The external engine binary is not bundled in the source or release archive. This was a functional interoperability check, not a performance ranking.
- White-perspective centipawn and mate normalization, including terminal mate zero with an explicit winner.
- Single-game PGN import by paste and file upload; FEN import with invalid-position feedback; main-line navigation and branching.
- Legal pointer moves, desktop drag-and-drop, mobile touch selection, keyboard board input, flip controls, castling, en passant, and underpromotion.
- Real principal variations in SAN, configurable search settings, live analysis, and cancellation of running server work.
- Game review using actual engine searches, centipawn-loss labels, terminal outcome handling, and an interactive evaluation timeline. A short mating game is checked end to end; threshold and color semantics have unit coverage.
- Sequential comparisons, the three-position benchmark suite, session result retention, JSON and CSV downloads, and actual versus requested depth reporting.
- PGN export, exact FEN clipboard copy, workspace restoration, corrupt-storage recovery, and token fallback when session storage is blocked.
- Request schema, size, host/origin, optional authentication, rate, registry, concurrency, expiry, and output-limit controls.
- Readable production error responses, executable-path exclusion from engine descriptors, and CSV formula-prefix protection.
- Complete documentation, original MIT-licensed piece artwork, application MIT license, and third-party license inventory generation.

## Review and Repair Loop

Implementation was followed by repeated source review, real-engine runs, and regression testing. Problems found and repaired included:

- Production static-plugin registration freezing the wrong Fastify error handler and causing validation failures to return 500 instead of 400.
- Equivalent default-port origins being rejected by a literal host comparison.
- Stale client-job updates and cancellation ordering risks; position/settings keys and sequence guards now isolate displayed search state.
- Mate-zero ambiguity, inconsistent castling rights, impossible piece counts, and formula-like CSV string prefixes.
- Modal focus restoration, preserving board focus across successive keyboard moves, and move-list scrolling relative to the wrong offset parent.
- A broad SVG style unintentionally enlarging the chart's action icon.
- Low-contrast supporting text, unnamed collapsed navigation, and keyboard-inaccessible horizontal result tables.
- Default framing allowances that were wider than necessary; preview framing is now an explicit opt-in.
- Runtime version strings drifting from package metadata; UI and API now derive the version from the package manifest.
- Documentation links leaving the in-app guide for missing local files.
- Release archives omitting reproducible-install metadata; the release packer now includes the lockfile and complete source using an explicit allowlist.

The browser's initial JavaScript bundle was reduced from approximately 178 KB to approximately 100 KB gzipped by lazy-loading secondary views and keeping server validation code out of the browser bundle. Those are measured build sizes, not network-latency or engine-speed claims.

## Not Yet Verified

- Actual execution of GitHub-hosted Actions, public repository creation, uploaded releases, branch protection, and private security reporting. The available GitHub CLI was not authenticated.
- Docker image execution, macOS/Windows runtime behavior, Firefox, Safari/WebKit, and real mobile hardware.
- Manual screen-reader certification, independent penetration testing, or a formal security audit.
- Public multi-user operation, durable server storage, engine strength/Elo measurement, tablebase integration, and tournament scheduling. These are not implemented features.

The live workspace preview is a private verification convenience, not a claimed production deployment. The standalone server remains loopback-first and self-framing-only by default. See [security](../SECURITY.md), [benchmark methodology](benchmarking.md), and [publication instructions](publishing.md).
