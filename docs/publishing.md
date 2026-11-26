# Publish OpenChessLab

This repository is prepared for GitHub under the name **OpenChessLab**. A local source tree, workflow, or release script is not proof that a public repository, deployment, or successful hosted CI run exists.

## Before Publication

1. Review all source, licenses, dependency notices, security guidance, and the verification report.
2. Run `npm ci`, `npm run format:check`, `npm run check`, `npm run build`, `npm run test:e2e`, and `npm run security`.
3. Inspect `git status` and the intended diff. Never add `.env`, private registry files, tokens, private games, `node_modules`, browser caches, or test output.
4. Decide who owns the repository, reviews changes, handles security reports, and receives private conduct reports. Supply a real private conduct-reporting contact before inviting community participation.
5. Confirm the MIT license covers your original contributions and review GPL obligations for any engine-containing distribution.

## Create the GitHub Repository

Install and authenticate the GitHub CLI as the account that will own the repository:

```bash
gh auth login
gh auth status
```

From the project root, initialize a repository only if one does not already exist. Review the output of status and diff before committing:

```bash
git init -b main
git status --short
git add .
git diff --cached --stat
git diff --cached
git commit -m "Initial OpenChessLab release candidate"
gh repo create OpenChessLab --public --source=. --remote=origin --push \
  --description "A local-first chess analysis and UCI engine experimentation workspace"
```

The `git add .` step is appropriate only after inspecting ignored files and verifying that the tree contains no secrets or unrelated work. Do not force-push or overwrite an existing repository. If `OpenChessLab` already exists in the selected account, inspect and choose the correct existing remote rather than replacing it.

Do not invent a repository URL before the CLI returns the real one. After creation, update repository metadata and optional README links with that exact URL.

## Configure GitHub

- Enable GitHub Actions and verify the actual first CI run. The project does not need deployment or cloud-engine secrets.
- Protect `main`: require a pull request, review where maintainers are available, and the stable `All Checks Passed` status. Keep bypass permissions limited.
- Enable Dependabot alerts, security updates, and private vulnerability reporting. Test that the private reporting channel is actually available.
- Provide the private conduct-reporting contact described in the Code of Conduct. Do not imply an unstaffed inbox is monitored.
- Set repository topics such as `chess`, `stockfish`, `uci`, `typescript`, and `chess-analysis` if appropriate.
- Review default workflow permissions; they are read-only except the trusted tag-triggered release job's contents-write permission.

CI is configured for Node 22, 24, and 26, Chromium desktop/mobile checks, a clean archive installation, and a Linux container smoke test. CodeQL runs separately. Check the actual workflow outcomes before asserting that a release is ready.

## Prepare a Release

1. Confirm all checks pass on the commit you intend to tag.
2. Update `package.json`, regenerate the lockfile as needed, and replace the matching Unreleased changelog heading with a real release date.
3. Review and commit the version/changelog change through the normal contribution process.
4. Create and push a version tag that exactly matches the package version:

```bash
git tag v0.2.0
git push origin v0.2.0
```

The release workflow checks the tag, installs locked dependencies, runs formatting/lint/types/tests/audit/browser checks, builds the application, and produces `OpenChessLab-VERSION.tar.gz` with a SHA-256 checksum. It creates a **draft GitHub release** for a maintainer to inspect and publish. It does not publish to npm or deploy a server.

The archive extracts into `OpenChessLab/` and includes complete source, tests, workflows, documentation, the production build, and `package-lock.json`, but not `node_modules`, engine binaries, private configuration, or browser caches. Inside that directory, run `npm ci --omit=dev` followed by `npm start`; installation downloads the separate GPL-licensed Stockfish dependency. Use `npm ci` without `--omit=dev` for source development. The packer uses an explicit file/directory allowlist and requires a `tar` executable; it is exercised on Linux.

Verify the archive's contents, checksum, runtime startup, notices, corresponding-source obligations for redistributed engines, and release notes before pressing Publish. Do not claim a benchmark, supported platform, or deployment that was not actually verified.

## What This Snapshot Does Not Claim

No public GitHub URL, stars, users, downloads, contributors, running CI checks, published release, or production deployment is manufactured. Publication requires an authenticated account with appropriate permissions. The owner's real GitHub output is the source of truth.
