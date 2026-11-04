<h1 align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/brand/morph-mark-dark.svg">
    <img src="docs/brand/morph-mark-light.svg" alt="M:orph" width="96">
  </picture>
  <br>
  M:orph
</h1>

<p align="center"><strong>Media Browser</strong><br><em>Same data, any shape.</em></p>

<p align="center">
  English · <a href="README.zh-TW.md">繁體中文</a> · <a href="README.ja.md">日本語</a>
</p>

M:orph is a Windows-first desktop app for browsing large collections of folders — manga, albums, videos, music, and games — as cards, tables or trees. You point a **project** at a root folder, and the app turns every matching sub-folder into a record you can describe, search and lay out the way you like. It only **views** your data: originals are never moved, renamed or deleted for the sake of browsing.

**Data and presentation are kept apart.** What you know about a folder (title, tags, rating, where it came from) is stored with the folder; how it looks is a layout you design once and apply to the whole project.

> **Human-led, AI-built.** A human leads the project — direction, requirements, design decisions and review — while AI coding agents (OpenAI Codex, then Anthropic's Claude Code) write the code under that direction.
>
> The project is **close to its first release**. Current version: **0.39.0** ([changelog](CHANGELOG.md)).

---

## What it does

**Browse**

- Three modes over the same data: **CARD**, **TABLE** and **TREE**, with per-project memory of filters, scope and view settings.
- A right-hand panel shows the selected folder without leaving the list: details, files, subfolders, and a reader or player for what is inside.
- Search across every field with a rebuildable local index (substring, AND / OR / exclude, number and date comparisons, saved queries).

**Design the card**

- A block editor places **components** on a grid: names, paths, text, tags, numbers, ratings, dates, choices, links, images, dividers, and game components (cover, launch button).
- Style each component: size, weight, italic / underline / strikethrough, alignment, colours, padding, corners, border, opacity, line and letter spacing, plus ready-made looks. Tags can be coloured by category and choices can have their own colours.
- Long values stay tidy: ellipsis, wrapping, a **+N** tag badge, or a scrollable cell.
- **Fallback fields**: one component can list several fields (for example the title from Steam, DLsite and your own notes) and shows the first one that has a value. Search follows the same chain.
- Real-data preview inside the editor, several named layouts per project, and a layout per content type.

**View and play**

- Album masonry and a full-screen image reader; manga reader with spreads and right-to-left reading; video player with subtitles (SRT / VTT), resume and a cross-project audio / video queue; PDF, ZIP and CBZ in the app.
- When a video cannot be decoded the app explains why (for example a renamed archive) and offers to open it with the system player.

**Games**

- Detects game folders (including many Japanese visual-novel engines) and protects their insides: the app never creates records inside a game.
- Launch actions per game: EXE with arguments, folders, files, URLs, and **shortcuts** (so a Locale Emulator shortcut keeps its own settings). A launch component can fall back from one action to another, and each game can hide buttons it does not use.

**Fill in the data**

- Paste a page address and the source is recognised automatically: E-Hentai / ExHentai, Steam, DLsite, VNDB, Bangumi, AniList, Hitomi, Pixiv, MusicBrainz, Open Library and Wikimedia Commons. Review the preview, then choose which fields to import. Nothing is fetched unless you ask. Some of these sites carry adult content; whether to use them is entirely up to you, and each site's own terms apply.

**Look and language**

- Three themes (dark, frosted glass, warm paper) and five interface languages (Traditional Chinese, Simplified Chinese, English, Japanese, Spanish).

---

## How your data is kept

```text
Folders ──→ portable folder records ──┐
                                      ├──→ project layout → components on screen
Project root ──→ portable settings ───┘
                  │ both are the source of truth
                  └──→ SQLite search index (rebuildable at any time)
```

- Each managed folder carries a hidden `.media-viewer` record, so a folder can move to another place or device and still know what it is. Your original files are left alone. (The folder name is part of the data format and kept from before the product was renamed.)
- Writes are atomic and recoverable; clean-up removes only what the app created, with a preview first.
- Values are shared between projects by default; a private override has to be created on purpose.
- Electron runs with context isolation and a sandbox; the renderer cannot read arbitrary paths or run commands.

---

## Getting started

Requires Node.js 24 and pnpm 10.

```bash
pnpm install
pnpm dev
```

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the app in development mode |
| `pnpm build` | Type-check and build |
| `pnpm typecheck` | Type-check only |
| `pnpm test` | Data and logic tests |
| `pnpm test:ui:changed` / `:smoke` / `:all` | Electron UI tests (changed files / core set / everything) |
| `pnpm format` / `pnpm format:check` | Prettier |
| `pnpm dist` | Build the Windows installer and a portable exe into `release/morph <version>/` |
| `pnpm shot <game\|manga\|album\|other>` | Screenshot the app with built-in sample data |

Details of verification are in [IMPLEMENTATION](docs/IMPLEMENTATION.md). GitHub Actions runs the type-check, format check and data tests on every push.

---

## Tech stack

Electron · React 18 · Vite 7 · TypeScript · Mantine 8 · Node SQLite (search index) · Playwright (UI tests)

---

## Documentation

The design documents are written mainly in Traditional Chinese.

- [Documentation index](docs/README.md) — find the right document for a task.
- [Product scope](docs/PRODUCT.md) and [architecture](docs/ARCHITECTURE.md).
- [Current work and known limits](docs/WORK_ITEMS.md), [decisions](docs/DECISIONS.md).
- [Contributing](CONTRIBUTING.md) and [security policy](SECURITY.md) (report vulnerabilities privately).
- Contributors and coding agents: read [CLAUDE.md](CLAUDE.md) (Claude Code) or [AGENTS.md](AGENTS.md) (Codex) first. Early POC material is kept in [docs/archive](docs/archive/) and is not a current specification.

---

## License

Copyright (C) 2024–2026 Zeke Gan. The source code is free software under the **GNU General Public License, version 3 or (at your option) any later version** — see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md). Modified versions must stay open under the same license and keep the notices.

**The name and the logo are not part of that license.** A modified version may not use the name "M:orph" or the M:orph logo, and may not be published as the official one just by changing the logo or the name. See the [name and logo policy](TRADEMARK.md).

M:orph is not affiliated with any of the websites it can read from; their names belong to their owners.

---

## Author

**Zeke Gan** — [GitHub](https://github.com/ZekeGan)
