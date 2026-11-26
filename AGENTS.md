# Working on OpenChessLab

Keep changes focused, explain behavioral tradeoffs, and distinguish measured results from assumptions.

- Read `docs/architecture.md`, `docs/api.md`, and `SECURITY.md` before changing engine execution or HTTP boundaries.
- Run `npm ci`, `npm run check`, `npm run test:coverage`, and `npm run build`. Run `npm run test:e2e` for browser changes; install Chromium and its OS libraries first.
- UCI processes are trusted local executables selected by server-owned IDs. Never accept executable paths, shell commands, or arbitrary UCI commands from HTTP input.
- Always close engine processes in a finally block. Preserve cancellation, resource limits, deadlines, and benchmark exclusivity.
- Scores use White's perspective. Mate-zero needs an explicit winner. Missing measurements are null, not fabricated zeros or inferred NPS.
- Statistics may arrive separately from scored PVs. Do not carry counters between positions or label an early engine stop as a confirmed time-limit event.
- Validate persisted browser data, preserve actual engine/version provenance, and make storage failures and deletion outcomes explicit.
- Add regression coverage for fixes, including failure paths. Fixtures must be clearly labeled and must not appear as application demo measurements.
- Update the changelog and API migration notes for contract changes. Preserve historical verification reports and only claim checks that actually ran.
- Do not auto-merge dependency PRs, push release tags, or publish packages without maintainer approval. Do not fabricate users, stars, contributors, or benchmark results.
- Automated scheduled checks are not an autonomous maintainer and are not a security certification.
