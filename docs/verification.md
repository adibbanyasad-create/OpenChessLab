# Verification Report: 0.4.0

Verification date: **2026-11-26**. This report records the 0.4 candidate's observed checks, not a claim of production deployment or independent certification. Earlier reports are preserved as [0.3](verification-0.3.0.md), [0.2](verification-0.2.0.md), and [0.1](verification-0.1.0.md) snapshots.

## Executed Locally

| Check                                       | Observed result                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Formatting, linting, and strict type checks | Passed                                                                                                                                   |
| Local documentation link/image file targets | Passed; external URLs and heading anchors are not validated                                                                              |
| Unit/integration suite on Node 22.23.1      | 192 passed in 11 files                                                                                                                   |
| Chromium browser suite                      | 42 passed, 21 desktop and 21 mobile-profile tests                                                                                        |
| Responsive layout checks                    | Passed at 320, 768, 1024, and 1440 CSS pixels, plus the mobile profile                                                                   |
| Automated accessibility checks              | No violations in the tested analysis, import, history confirmation, experiment, and documentation states, including collapsed navigation |
| Production build                            | Passed, with secondary views and their validation code lazy-loaded                                                                       |
| Dependency audit                            | Zero known vulnerabilities reported by npm audit at the time of the check                                                                |
| Release packaging                           | Archive generated, SHA-256 verified, and clean production-install smoke check passed                                                     |

Core browser tests use the production build and real HTTP/engine jobs. Desktop and mobile profiles use independent production servers so they do not consume each other's rate-limit budgets; rate limiting remains enabled.

## Coverage Scope

The V8 snapshot covers server and shared code, excluding the server process bootstrap. It does not claim UI statement coverage.

| Metric     | Observed coverage |
| ---------- | ----------------- |
| Statements | 95.70%            |
| Branches   | 88.34%            |
| Functions  | 97.63%            |
| Lines      | 97.02%            |

The gates remain 90% statements, 80% branches, 90% functions, and 90% lines. Client helpers also have unit tests, and browser behavior is exercised end to end, but those are not silently included in the percentages above.

## Verified Changes

- Expanded review labels, accuracy summaries, phases, opening names, and review exports are covered by unit, API, and browser tests.
- Advertised UCI options, custom option validation, and hardware recommendations are covered by protocol, API, unit, and browser checks.
- The guided engine-registry dialog validates names/paths and generates configuration without uploading or executing files.
- Existing review-uncertainty, measurement-integrity, benchmark-history, cancellation, accessibility, and export behavior remains green.

## Automation and Remaining Boundaries

This batch made no workflow changes. Node 24/26 matrix behavior, Docker, CodeQL, and packaged-archive behavior still depend on hosted execution or a separate local rerun; consult the actual Actions results before treating those checks as passed. A version tag or public release has not been manufactured.

Native Windows `.exe` and Android APK packaging were explicitly requested but are not included in this change. This Linux workspace has no Docker, Java, or Android SDK, and the repository has no Windows/Android CI runners or signing configuration. Those artifacts require a separate native-packaging design, hosted runners, signing secrets, and execution evidence; their absence is documented rather than faked.

Browser tests use Chromium and a mobile emulation profile, not real Android/iOS hardware. Firefox, Safari/WebKit, macOS/Windows runtime behavior, manual screen-reader certification, public multi-user hosting, and an independent security audit remain outside this verification claim. The application remains local/private-first.
