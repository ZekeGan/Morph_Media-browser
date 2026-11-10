# M:orph overview for contributors

[繁體中文索引](README.md) · English

M:orph (Media Browser) is a Windows-first desktop app (Electron + React + Vite, pnpm) for browsing folders of media, manga and games as cards, tables or a tree. It is human-led and AI-built; the working rules live in [CLAUDE](../CLAUDE.md), and most design documents are written in Traditional Chinese.

## Principles

- **View only.** It never moves, renames or deletes original files just for browsing.
- **Portable records are the source of truth.** Each managed folder keeps a `.media-viewer/folder.json`; the SQLite search index is a rebuildable copy. See [DATA_FORMAT](DATA_FORMAT.md).
- **Data and appearance are separate.** Projects define a card layout once; folders only carry data.
- **Game roots are protected.** No records are created inside a detected game.
- **Strict Electron boundary.** `contextIsolation` and sandbox are on, `nodeIntegration` is off; only `main` touches the file system.

## Where things are

The data flow and the process boundary are drawn in [ARCHITECTURE](ARCHITECTURE.md#資料流與邊界).

| Area | Entry points |
| --- | --- |
| Main process, IPC, file access | `electron/main.ts`, `electron/preload.ts`, `electron/library.ts`, `electron/explorer.ts` |
| Shared contracts and validation | `shared/model.ts`, `shared/explorer.ts`, `shared/workspace.ts` |
| UI | `src/App.tsx`, `src/browse/BrowseWorkspace.tsx`, `src/editor/Editor.tsx` |

Module responsibilities: [ARCHITECTURE](ARCHITECTURE.md#按問題找入口). Decisions and what superseded what: [DECISIONS](DECISIONS.md). End-user documentation: [User guide](USER_GUIDE.md).

## Commands

`pnpm dev`, `pnpm build`, `pnpm typecheck`, `pnpm test` (data tests), `pnpm test:ui:smoke` (core UI flows), `pnpm format:check`. Details: [IMPLEMENTATION](IMPLEMENTATION.md).

## Naming

The product name is M:orph, but identifiers kept for data compatibility still say `media-viewer` (hidden `.media-viewer` folders, `kind` values, `%APPDATA%\media-viewer`).
