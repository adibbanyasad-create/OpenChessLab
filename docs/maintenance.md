# Maintaining OpenChessLab

Maintenance should produce useful fixes and verifiable evidence, not artificial activity. The project includes recurring checks, but no agent is promised to watch or rewrite the repository continuously between conversations.

## What Runs Automatically

- **Continuous Integration:** pushes to main, pull requests, a weekly schedule, and manual dispatch. The configured matrix covers Node 22, 24, and 26 with formatting, lint, type, local-documentation-link, unit/integration, coverage, build, and dependency-audit checks.
- **Browser checks:** production servers with real engines, desktop/mobile workflows, and automated accessibility checks. The two profiles have separate instances and retain the normal rate limits.
- **Distribution checks:** an archive is generated, its checksum verified, production-only dependencies installed in a separate directory, and a real Stockfish search performed from the extracted build.
- **Container checks:** the pinned Node 24 image is built, started with CPU/RAM limits and a loopback-only port, and checked over HTTP with a real multithreaded engine search. The image is not automatically published to a registry.
- **Dependency Security:** weekly known-advisory audits plus lockfile changes and manual dispatch.
- **CodeQL Security Review:** configured JavaScript/TypeScript static analysis on pushes, pull requests, a weekly schedule, and manual dispatch. This is not an exploit scanner or a security certification.
- **Dependabot:** weekly update proposals for npm packages, GitHub Actions, and the Docker base image. Lower-risk development updates may be grouped; major changes still need individual review. Node typings stay aligned with the oldest supported runtime.

Scheduled runs depend on GitHub Actions availability, repository settings, and platform policies. Check the Actions tab and configure your own notifications. No automatic source edits, automatic dependency merges, public issue spam, or background agent work are implied.

## When a Check Fails

1. Read the specific failed job and distinguish a product regression from infrastructure or package-registry trouble.
2. Reproduce the failing test with the pinned dependencies and the reported runtime. Keep real engine measurements separate from fixture data.
3. Add a focused regression test, make the smallest correct fix, and rerun the applicable checks.
4. Review changes to executable selection, cancellation, output bounds, authentication, origin/host checks, and persisted data particularly carefully.
5. Never fix a test by disabling security boundaries, inventing engine output, or weakening an assertion without understanding why it was wrong.
6. For a suspected security vulnerability, use private reporting rather than publishing sensitive details in an issue.

The stable `All Checks Passed` CI status includes quality, browser, and container jobs. CodeQL runs separately; require its check as well when enabling branch protection. Do not assume a successful dependency-update bot run means the application tests passed, or vice versa.

## Dependency Updates

Inspect the upstream change, compatibility requirements, and license. Engine/network changes can alter evaluations and benchmark behavior, so retain their identities and do not compare new results to an unlabeled historical baseline. Run the real-engine integration suite, browser tests, and package smoke check before merging.

Container base images and action revisions are pinned rather than silently following mutable tags. Review update PRs and rebuild regularly; pinning does not itself supply future security fixes. Do not blindly upgrade TypeScript or runtime typings past the supported toolchain just to eliminate an outdated-package listing.

## Release Checklist

```bash
npm ci
npm run format:check
npm run check
npm run test:coverage
npm run build
npm run test:e2e
npm run security
npm run release:pack
```

Verify the generated checksum, extract the archive into a separate directory, install with `npm ci --omit=dev --ignore-scripts`, and run `node scripts/smoke-release.mjs .` there. Check the actual hosted container and CodeQL outcomes as well as local results.

Update the changelog, migration notes, and verification report. Preserve older reports instead of overwriting history with a new claim. A maintainer must approve version tags and review the resulting draft release, notices, and engine redistribution obligations before publication. Do not infer that a passing build is a hosted application deployment.

## Data and Community Responsibilities

Browser history is a convenience, not a durable research database. Keep exports and exact engine binaries/settings for reproducibility. Close other app tabs before clearing saved results; downloaded files and temporary server job records are separate stores.

Respond to real issues, document real improvements, and invite genuine user feedback. Provide the private conduct-reporting contact required by the Code of Conduct before soliciting broad community participation. Do not invent an email address, moderation team, users, downloads, stars, or contributor activity.
