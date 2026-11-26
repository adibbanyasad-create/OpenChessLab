# Third-Party Notices

The MIT license at the repository root covers original OpenChessLab code, documentation, and SVG chess-piece artwork. It does not relicense third-party software, fonts, engine binaries, or neural networks.

## Stockfish

The pinned `stockfish@19.0.1` npm package supplies the full and Lite Stockfish 19 WASM engines. Engine code is **GPL-3.0**. The package describes its non-engine wrapper code as MIT. OpenChessLab launches engine files in a separate Node subprocess and communicates over UCI; the engine is not included in the frontend JavaScript bundle.

- Stockfish.js source and distribution: https://github.com/nmrugg/stockfish.js
- Exact distribution release: https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.1
- Upstream Stockfish source: https://github.com/official-stockfish/Stockfish
- GPL license text in the installed package: `node_modules/stockfish/Copying.txt` (or its package license file).

When redistributing the engine or a container that includes it, comply with GPL-3.0, including preserving notices and providing corresponding source under the applicable requirements. A source URL is useful attribution, not a substitute for assessing the source-provision obligations for your distribution. Do not label the entire engine-containing distribution as MIT-only. Added native engines retain their own licenses.

## Application Dependencies

- React, React DOM, Vite, Fastify and its plugins, Zod, react-markdown, and remark-gfm: MIT or their package-declared permissive licenses.
- chess.js: BSD-2-Clause.
- Lucide icon artwork/library: ISC.
- Inter: SIL Open Font License 1.1; served locally through `@fontsource-variable/inter`.
- IBM Plex Mono: SIL Open Font License 1.1; served locally through `@fontsource/ibm-plex-mono`.

The authoritative versions are in `package-lock.json`. `npm run build` generates `dist/THIRD_PARTY_LICENSES.txt` from installed production dependencies and Vite (whose preload helper is included in the browser bundle), preserving available license texts and declared identifiers. This inventory is distributed with release archives. Individual installed package manifests and license files remain authoritative.

## Example Game and Artwork

The Opera Game (Paul Morphy versus the Duke of Brunswick and Count Isouard, Paris, 1858) is used as a public-domain historical move sequence. No copyrighted annotation is reproduced. Its engine scores are calculated at runtime.

The project's chess pieces and brand icon are original SVG artwork included under the project MIT license. They are not a downloaded commercial piece set. No external photographs, stock imagery, or tracking pixels are used.
