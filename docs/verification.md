# Verification Report: 0.3.0

Verification date: **2026-11-26**. This report records the 0.3 candidate's observed checks, not a claim of production deployment or independent certification. Earlier reports are preserved as [0.2](verification-0.2.0.md) and [0.1](verification-0.1.0.md) snapshots.

## Executed Locally

| Check                                       | Observed result                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Formatting, linting, and strict type checks | Passed                                                                                                                                   |
| Local documentation link/image file targets | Passed; external URLs and heading anchors are not validated                                                                              |
| Unit/integration suite on Node 22.23.1      | 182 passed in 9 files                                                                                                                    |
| Chromium browser suite                      | 42 passed, 21 desktop and 21 mobile-profile tests                                                                                        |
| Responsive layout checks                    | Passed at 320, 768, 1024, and 1440 CSS pixels, plus the mobile profile                                                                   |
| Automated accessibility checks              | No violations in the tested analysis, import, history confirmation, experiment, and documentation states, including collapsed navigation |
| Production build                            | Passed, with secondary views and their validation code lazy-loaded                                                                       |
| Dependency audit                            | Zero known vulnerabilities reported by npm audit at the time of the check                                                                |
| Workflow syntax/configuration lint          | Unchanged workflow files were not re-linted separately in this batch                                                                     |
| Native UCI interoperability                 | Six real searches were inherited from the 0.2 report and were not repeated for the unchanged engine binaries in this batch               |

Core browser tests use the production build and real HTTP/engine jobs. Storage-edge tests use explicitly labeled fixture records, not fabricated application demo data. Desktop and mobile profiles use independent production servers so they do not consume each other's rate-limit budgets; rate limiting remains enabled.

## Coverage Scope

The V8 snapshot covers server and shared code, excluding the server process bootstrap. It does not claim UI statement coverage.

| Metric     | Observed coverage |
| ---------- | ----------------- |
| Statements | 95.70%            |
| Branches   | 88.34%            |
| Functions  | 97.63%            |
| Lines      | 97.02%            |

The gates remain 90% statements, 80% branches, 90% functions, and 90% lines. Client polling/storage/authentication helpers also have unit tests, and browser behavior is exercised end to end, but those are not silently included in the percentages above.

## Verified Changes

- Uncertain review annotations use an explicit flag and null loss when adjacent depth is unconfirmed.
- NPS is unavailable for nonzero-node instant searches instead of repeating a misleading rate.
- Benchmark results include optional per-position centipawn agreement metadata, while mates are counted separately.
- Custom single-FEN benchmark runs and server-backed review CSV exports work through real browser and API checks.
- Job polling recovers from bounded transient failures and surfaces repeated failures.
- Benchmark history preserves comparison data and avoids redundant storage rewrites for identical runs.

## Automation and Remaining Boundaries

This batch made no workflow changes. Docker, CodeQL, Node 24/26 matrix behavior, and the packaged-archive smoke check still depend on hosted execution or a separate local rerun; consult the actual Actions results before treating those checks as passed. A version tag or public release has not been manufactured.

Browser tests use Chromium and a mobile emulation profile, not real Android/iOS hardware. Firefox, Safari/WebKit, macOS/Windows runtime behavior, manual screen-reader certification, public multi-user hosting, and an independent security audit remain outside this verification claim. The application remains local/private-first.
