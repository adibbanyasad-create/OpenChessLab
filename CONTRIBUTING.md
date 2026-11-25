# Contributing to OpenChessLab

Useful software grows through clear, focused changes. Help improve chess correctness, engine interoperability, accessible workflows, tests, documentation, or measured performance. There is no invented contributor history or requirement to join a community service.

## Before You Start

Read the [Code of Conduct](CODE_OF_CONDUCT.md), [architecture](docs/architecture.md), and [security policy](SECURITY.md). Search existing issues once the repository is published. For a large architectural change, open a proposal before investing in a large implementation.

Never open a public issue with secrets or details of a potentially exploitable security problem. Use private vulnerability reporting once enabled by the repository owner.

## Development Setup

```bash
npm ci
npm run dev
```

Open `http://localhost:5173`. Use Node 22.12+ or 24. More setup details are in [the development guide](docs/development.md).

## Change Standards

- Keep a change focused. Avoid speculative abstractions and compatibility layers without a real consumer.
- Use strict TypeScript and runtime validation at external boundaries. Do not silence errors with `any` or unexplained suppression comments.
- Add a regression test for a bug fix. Cover engine failure/cancellation paths, not just the successful search.
- Keep engine command paths in the administrator-controlled registry. Never expose shell commands, executable paths, engine uploads, or raw UCI from browser inputs.
- Preserve White-perspective score semantics and actual versus requested depth.
- Do not fabricate engine statistics, popularity, benchmark outcomes, or community activity. Clearly label illustrative fixtures as test fixtures.
- Check keyboard navigation, reduced-motion settings, narrow screens, and useful error messages for UI changes.
- Document changed API behavior and user-visible limits. Update the changelog for meaningful changes.
- Preserve licenses and notices for dependencies and bundled assets.

## Before Opening a Pull Request

```bash
npm run check
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm run security
```

Describe the problem, the implementation, and the commands actually run. Mention untested environments and limits instead of claiming blanket coverage. Include screenshots for visual changes and raw reproducible data for performance claims.

Use the supplied pull request template. CI must pass before merging, and a maintainer should review behavior, cancellation, error handling, and security implications. Contributors cannot bypass checks by editing a policy file.

## Contribution License

By submitting original contributions for inclusion, you agree to license them under the project's MIT license. Do not submit code you cannot license this way. Third-party code and engine redistribution require compatible notices and independent review of their licenses.
