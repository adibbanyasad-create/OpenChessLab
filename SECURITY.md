# Security Policy

## Supported Scope

OpenChessLab 0.2.x is a single-user, local-first application. It includes defensive controls and automated checks, but has not received an independent security audit. It is not a hardened public multi-tenant service. See the changelog and migration notes before upgrading an API client from 0.1.

## Private Reporting

For the upstream repository, use [GitHub private vulnerability reporting](https://github.com/adibbanyasad-create/OpenChessLab/security/advisories/new), not a public issue. Fork owners must configure their own private reporting channel and verify it before inviting reports.

No monitored email address, staffed security team, or response SLA is claimed. If the private reporting channel is unavailable, contact the repository owner privately without putting exploit details in a public thread. Never include secrets or sensitive PGNs in public reports.

Include affected versions, the trust boundary involved, expected/actual behavior, impact, and a minimal non-sensitive description. Coordinate disclosure with the owner. Do not test against other people's instances or publish working attack automation.

## Deployment Boundary

- The production server binds to loopback by default. The development Vite server binds to all interfaces for workspace previews and should run only on trusted networks.
- For remote private access, use HTTPS, an explicit host allowlist, a strong `OPENCHESSLAB_API_TOKEN`, firewall/access controls, and OS/container CPU/RAM limits.
- Do not expose the unauthenticated API to the internet. Host/origin checks are defense in depth, not user authentication.
- Tokens gate the whole server, not individual users or jobs. There is no multi-user authorization, tenant isolation, encrypted database, or session-account system.
- The configured UCI engines are trusted executables. They run with the server user's OS privileges and are not contained by a sandbox. Do not install untrusted engines.

## Implemented Defenses

- Strict Zod schemas and chess-position validation at API boundaries; request-size and rate limits.
- Executable allowlisting from a bounded administrator-owned registry file. Requests select engine IDs only; `spawn` never uses a shell. The registry is read through one file descriptor so a swapped file cannot bypass its byte limit.
- Host validation and same-origin checks for mutations; no broad CORS policy.
- Optional online bearer-token comparison using constant-time byte comparison, with unequal token lengths rejected without exceptions. This API token is a shared server credential, not a salted password database; rate limits and server-side secrecy are also required. Credentials and engine paths are not returned by the registry API.
- Bounded requested hash, threads, depth, positions, PGN length, job count, and concurrent tasks.
- Per-search and whole-job deadlines, cancellation, process cleanup, bounded stdout buffering, and drained stderr.
- Errors without raw process paths, stderr, or server stack traces in API responses.
- CSP, MIME-sniffing protection, no-referrer policy, and restricted browser capability policies. Framing is self-only by default. Additional trusted frame origins require explicit `FRAME_ANCESTORS` configuration; do not enable preview allowances on a standalone deployment.
- CSV formula-prefix escaping for untrusted string cells.
- Dependency audits, static CodeQL workflow configuration, scheduled regression checks, pinned action/container revisions, and read-only default CI permissions. Check Actions for actual execution outcomes; configuration alone is not evidence of a successful scan.

## Privacy

There are no analytics integrations, external font requests, cloud analysis calls, or remote PGN uploads outside the application's own server. A remote deployment receives its clients' games and positions; the word local does not mean that a remote preview executes on the user's laptop.

The active game and up to 20 benchmark records are stored in browser local storage; tokens use tab-scoped session storage, with an in-memory fallback if storage is blocked. Records include FENs and engine/runtime metadata. These stores are not encrypted at rest. Clear history removes saved benchmark records only. Close other OpenChessLab tabs first; in-memory views are not synchronized. To remove all local state, clear the site's browser data and reload. Downloaded exports must be handled separately. Restarting the server removes job results; completed results also expire or are evicted under bounded retention.

Server access logs include method, route, request ID, and connection metadata. Application code does not log request bodies or bearer tokens, but operators must audit reverse-proxy logging separately.

## Remaining Risks

Resource settings are not strict process-level quotas. An engine can allocate beyond requested hash, consume CPU, spawn its own children, or access files. Host-level sandboxing and resource limits are the operator's responsibility. A five-minute job may still perform substantial computation. A shared API token is not suitable for mutually untrusted users.

Dependency audits only identify known registry advisories. Passing them and automated tests does not prove the absence of vulnerabilities. Keep Node, dependencies, browsers, and engine binaries updated, and review changes before redeployment.
