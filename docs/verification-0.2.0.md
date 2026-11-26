# Verification Report: 0.2.0

Verification date: **2026-11-25**. This report records the 0.2 maintenance candidate's observed checks, not a claim of production deployment or independent certification. The [0.1 report](verification-0.1.0.md) is retained as a historical snapshot.

## Executed Locally

| Check                                       | Observed result                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Formatting, linting, and strict type checks | Passed                                                                                                                                   |
| Local documentation link/image file targets | Passed; external URLs and heading anchors are not validated                                                                              |
| Unit/integration suite on Node 22.23.1      | 172 passed in 9 files                                                                                                                    |
| Same suite on Node 24.22.3                  | 172 passed in 9 files                                                                                                                    |
| Same suite on Node 26.13.1                  | 172 passed in 9 files                                                                                                                    |
| Chromium browser suite                      | 40 passed, 20 desktop and 20 mobile-profile tests                                                                                        |
| Responsive layout checks                    | Passed at 320, 768, 1024, and 1440 CSS pixels, plus the mobile profile                                                                   |
| Automated accessibility checks              | No violations in the tested analysis, import, history confirmation, experiment, and documentation states, including collapsed navigation |
| Production build                            | Passed, with secondary views and their validation code lazy-loaded                                                                       |
| Dependency audit                            | Zero known vulnerabilities reported by npm audit at the time of the check                                                                |
| Workflow syntax/configuration lint          | All four workflow files passed actionlint 1.7.12                                                                                         |
| Native UCI interoperability                 | Six real searches completed using the full and Lite Stockfish 19 WASM builds and native Ethereal 12.00                                   |

The native interoperability run used two real positions per engine, requested depth 8, two threads, and 32 MB of hash. It checked legal completed output, reported counters, actual options, and application-version metadata. The separately provisioned Ethereal binary is not part of the source or release archive. Incidental timings from this run are not a benchmark ranking.

Core browser tests use the production build and real HTTP/engine jobs. A cancellation test delays a real creation response to exercise cleanup. Storage-edge tests use explicitly labeled fixture records, not fabricated application demo data. Desktop and mobile profiles use independent production servers so they do not consume each other's rate-limit budgets; rate limiting remains enabled.

The local HTTP smoke check also passed against the running 0.2 application, including static assets and a real multithreaded Stockfish search. This is not a claim that the Docker image has run in this workspace.

The generated 0.2 archive passed its SHA-256 integrity check, a clean production-only dependency installation in a separate directory, and the packaged application's smoke test. The smoke test loaded that archive's own dependencies, served its compiled frontend bundle, and completed a real Stockfish depth-4 search.

The 0.2 archive was generated, its SHA-256 checksum checked, and its contents extracted into a separate directory. A clean `npm ci --omit=dev --ignore-scripts` installation and `node scripts/smoke-release.mjs .` passed there, including the compiled frontend bundle and a real Stockfish depth-4 search. This check used the archive's own production dependencies, not the development checkout's dependencies.

## Coverage Scope

The V8 snapshot covers server and shared code, excluding the server process bootstrap. It does not claim UI statement coverage.

| Metric     | Observed coverage |
| ---------- | ----------------- |
| Statements | 95.37%            |
| Branches   | 87.24%            |
| Functions  | 97.29%            |
| Lines      | 96.91%            |

The gates remain 90% statements, 80% branches, 90% functions, and 90% lines. Client persistence/authentication helpers also have unit tests, and browser behavior is exercised end to end, but those are not silently included in the percentages above.

## Verified Changes

- Missing or invalid optional measurements remain null, distinct from explicitly reported zero, through API serialization, display, and CSV/JSON exports.
- Statistics-only UCI records are accumulated without transferring counters between positions. Text messages and malformed numeric/variation fields do not become plausible measurements.
- Each MultiPV line keeps its own reported depth; another variation's depth is not borrowed. Unknown or lower depth is not attributed to an unproven timeout.
- FEN spacing is canonicalized consistently; castling rights, piece counts, and bounded counters are checked before engine use.
- Manual searches are cancelled when navigation/settings change. Late creation responses are cancelled without becoming stale UI results.
- Benchmark history survives reload when storage is available, remains bounded, validates stored data, distinguishes storage failures, and has explicit deletion behavior.
- Historical rows retain recorded engine identities and available app versions rather than taking current registry labels.
- Depth entry accepts empty editing states without silently changing the requested value; invalid drafts cannot start a run.
- Promotion/history dialogs isolate global shortcuts, and board focus is retained during keyboard moves and flips.
- Token removal and RequestInit header representations are handled consistently; bearer validation and API-route handling remain covered by integration tests.
- The in-app maintenance/migration guides and verification tables render correctly and remain keyboard accessible.
- Deadline and forced-process-cleanup paths, release-tag validation, and preserved PGN state when clearing benchmark history have regression coverage.

## Automation and Remaining Boundaries

Weekly regressions, dependency audits, CodeQL analysis, reviewed dependency/base-image updates, archive smoke checks, and a container HTTP/engine check are configured. They do not imply an autonomous agent watching the project between conversations, automatic code fixes, or safe automatic merging. See [maintenance](maintenance.md).

At the time of the local checks recorded above, the 0.2 workflows had not yet been executed on GitHub. Docker was not available in the workspace, and CodeQL was not run locally. Consult the actual hosted Actions results before treating those checks as passed. A version tag or public release has not been manufactured.

Browser tests use Chromium and a mobile emulation profile, not real Android/iOS hardware. Firefox, Safari/WebKit, macOS/Windows runtime behavior, manual screen-reader certification, public multi-user hosting, and an independent security audit remain outside this verification claim. The application remains local/private-first.
