# Contributing

Thank you for wanting to help. A contribution is anything that makes the project better: a bug report, an idea, a translation fix, a documentation correction, or a code change sent as a pull request.

## How this project works

The project is **human-led and AI-built**: the maintainer decides direction, requirements and design, and AI coding agents write the code (see [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md)). Because of that:

- **Open an issue before a large change.** Describe the problem or the idea first, so effort is not spent on something that does not fit the product. The product scope is in [docs/PRODUCT.md](docs/PRODUCT.md), and what is already planned is in [docs/WORK_ITEMS.md](docs/WORK_ITEMS.md).
- Small fixes (typos, a clearly wrong translation, a one-line bug) can go straight to a pull request.
- The maintainer makes the final decision on what is merged, and may ask for changes or reimplement a fix in the project's own style.

## Before you send code

- `pnpm install` enables a git hook that runs the type check, the format check and the link check of the Markdown you commit. Run `pnpm test` yourself as well (and `pnpm typecheck`, `pnpm format:check` whenever you like). UI changes should also run the related Electron UI tests (`pnpm test:ui:changed`).
- Keep the change small and focused, in the style of the surrounding code; do not mix refactoring with a fix.
- Test with a **made-up sample folder**, never with someone's real collection. The app only views originals, and tests must not write outside their temporary folders.
- Interface text lives in `src/i18n/messages.json` with Simplified Chinese, English, Japanese and Spanish. Translations are welcome, and so are corrections by native speakers.

## Licence of contributions

By submitting code, documentation, translations or artwork for inclusion, you license your original contribution under the [M:orph Source-Available License 1.0](LICENSE). It permits free use and sharing, and sales of substantively modified versions; selling unchanged or superficially changed copies requires the author's written permission. You also grant Zeke Gan a worldwide, non-exclusive, perpetual, royalty-free right to use, modify, distribute and sublicense your original contribution under other terms, including commercial terms. You retain your copyright. This grant does not cover third-party material you do not own; identify that material and its license when contributing. The [name and logo policy](TRADEMARK.md) remains separate.

You keep the copyright of what you write, and you must only send work you have the right to share (not code copied from a project under an incompatible licence).

## Reporting a security problem

Please use the private route described in [SECURITY.md](SECURITY.md), not a public issue.
