# Security Policy

## Supported Scope

OpenChessLab 0.1.x is a single-user, local-first application. This source snapshot includes defensive controls and automated checks, but has not received an independent security audit. It is not a hardened public multi-tenant service.

## Private Reporting

After publishing the repository, its owner should enable GitHub **Private vulnerability reporting** under Settings > Code security. Report a suspected vulnerability with the repository's private security advisory workflow, not a public issue. The publishing checklist requires verifying this before announcing the project.

No private reporting destination, monitored email address, security team, or response SLA is claimed before the repository exists. Until a private channel is established, contact the repository owner privately without including exploit details in a public thread. Never include secrets or sensitive PGNs in public reports.

Include affected versions, the trust boundary involved, expected/actual behavior, impact, and a minimal non-sensitive description. Coordinate disclosure with the owner. Do not test against other people's instances or publish working attack automation.

## Deployment Boundary

- The production server binds to loopback by default. The development Vite server binds to all interfaces for workspace previews and should run only on trusted networks.
- For remote private access, use HTTPS, an explicit host allowlist, a strong `OPENCHESSLAB_API_TOKEN`, firewall/access controls, and OS/container CPU/RAM limits.
- Do not expose the unauthenticated API to the internet. Host/origin checks are defense in depth, not user authentication.
- Tokens gate the whole server, not individual users or jobs. There is no multi-user authorization, tenant isolation, encrypted database, or session-account system.
- The configured UCI engines are trusted executables. They run with the server user's OS privileges and are not contained by a sandbox. Do not install untrusted engines.

## Implemented Defenses

- Strict Zod schemas and chess-position validation at API boundaries; request-size and rate limits.
- Executable allowlisting from server configuration. Requests select engine IDs only; `spawn` never uses a shell.
- Host validation and same-origin checks for mutations; no broad CORS policy.
- Optional bearer authentication with constant-time digest comparison. Credentials and engine paths are not returned by the registry API.
- Bounded requested hash, threads, depth, positions, PGN length, job count, and concurrent tasks.
- Per-search and whole-job deadlines, cancellation, process cleanup, bounded stdout buffering, and drained stderr.
- Errors without raw process paths, stderr, or server stack traces in API responses.
- CSP, MIME-sniffing protection, no-referrer policy, and restricted browser capability policies. Framing is self-only by default. Additional trusted frame origins require explicit `FRAME_ANCESTORS` configuration; do not enable preview allowances on a standalone deployment.
- CSV formula-prefix escaping for untrusted string cells.
- Dependency audit workflows, dependency-update configuration, regression tests, and read-only default CI permissions.

## Privacy

There are no analytics integrations, external font requests, cloud analysis calls, or remote PGN uploads outside the application's own server. A remote deployment receives its clients' games and positions; the word local does not mean that a remote preview executes on the user's laptop.

The active game is stored in browser local storage, tokens in tab-scoped session storage, and engine jobs in server memory. These stores are not encrypted at rest. Clearing browser site data removes saved PGN/token state. Restarting the server removes job results; completed results also expire or are evicted under bounded retention.

Server access logs include method, route, request ID, and connection metadata. Application code does not log request bodies or bearer tokens, but operators must audit reverse-proxy logging separately.

## Remaining Risks

Resource settings are not strict process-level quotas. An engine can allocate beyond requested hash, consume CPU, spawn its own children, or access files. Host-level sandboxing and resource limits are the operator's responsibility. A five-minute job may still perform substantial computation. A shared API token is not suitable for mutually untrusted users.

Dependency audits only identify known registry advisories. Passing them and automated tests does not prove the absence of vulnerabilities. Keep Node, dependencies, browsers, and engine binaries updated, and review changes before redeployment.
