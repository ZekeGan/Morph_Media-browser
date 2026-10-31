# Changelog

The application version is independent of portable record `schemaVersion`.

## 0.24.0 — 2026-11-02

- A single click on a folder (card, table row or tree node) now shows that folder's details in the right panel without entering it; a double click still enters it. Game info is visible while the center stays where it is.

## 0.23.0 — 2026-11-02

- New "launch game" cell for game projects: a button on the card that starts the game with the folder's bound launch file (disabled with a hint while nothing is bound, confirmation before starting, same validation as the game page).

## 0.22.0 — 2026-11-02

- Cover and image cells have a third fit, "show everything, fill the gaps with a blurred background" (`blur`). Game cover cells use it by default, so tall and wide covers are no longer cropped (titles stay visible); cells that explicitly chose "fill and crop" or "show whole" keep their choice.

## 0.21.0 — 2026-11-02

- Video playback failures now say the likely cause (a ZIP/RAR/7z archive or web page named like a video, or an empty file) and offer "open with the default player" and "show in File Explorer".
- Game page: a candidate game gets "confirm as a game" / "not a game" buttons, and a missing launch file explains why Launch is unavailable with a shortcut to set it.
- Editor: "+ New field" is a button opening a dialog (the form was below the fold), the title and hints use one term ("積木編輯器").
- The panel's back/forward icons repeat the center's only when the panel covers the center; paper theme tabs have readable contrast; the tree minimap appears only for larger trees; an empty favorites section is one line; the search dialog explains saved searches and the disabled save button; the create dialog no longer shows "unsaved" while merely open; the narrow-window veil is lighter.

## 0.20.2 — 2026-11-01

- The folder icon in the right panel header now opens the folder in Windows Explorer (it used to only navigate inside the app, which looked like "nothing happened").

## 0.20.1 — 2026-11-01

- Video previews are now generated at up to 480 px (was 160×90) and JPEG quality 85, so they stay sharp at tile size; previously cached low-resolution video previews are regenerated automatically.

## 0.20.0 — 2026-11-01

- Game detection now recognises Japanese visual-novel engines (Artemis, AI6WIN, BGI/Ethornell, ONScripter/NScripter, RealLive/AVG32, SiglusEngine, YU-RIS, Nitroplus NPA), and lists `.npk`-packaged and Steam releases of unknown engines as candidates. A game folder is now protected instead of publishing its internal folders (backups, patches, `files`, `data`) as folders of their own.

## 0.19.0 — 2026-11-01

- Opening a project lists the root's folders instead of one lone root card; a folder without subfolders shows its own card instead of an empty page.
- CARD display settings (levels, cards per row, page size) moved into one "card display settings" popover with a summary button, freeing a toolbar row.
- On narrow windows the overlaid right panel dims the folder list behind it, and clicking the dimmed area closes the panel.
- Create-project dialog: the default name follows the interface language (it showed English in Chinese), and a line says what is still missing before "create" is enabled.

## 0.18.1 — 2026-11-01

- Tooling only: `pnpm shot` can switch the real app theme (`--theme dark|glass|paper`), stay on the home screen (`--home`), click a button (`--click`) and press a key (`--press`).

## 0.18.0 — 2026-11-01

- Error and recovery experience: system errors (permission, file in use, disk full, not found, offline, revision conflict) now say what happened and what to do next, with the original text under "technical details".
- Uncaught async failures show a toast instead of vanishing; interrupted work (aborts) stays quiet.
- A render failure shows a recovery screen with a reload button instead of a blank window, and a crashed renderer reloads automatically.
- Docs: stale references to removed groups, tests and the drawer cleaned up; architecture and test tables list the split editor and browse components.

## 0.17.2 — 2026-11-01

- Refactor only: `BrowseWorkspace.tsx` (1450 → 999 lines) is split into `BrowseToolbar.tsx` and `BrowsePanel.tsx`; behavior is unchanged.

## 0.17.1 — 2026-11-01

- Refactor only: the CELL editor is split into `Editor.tsx` (1632 → 847 lines), `EditorInspector.tsx` and `EditorPalette.tsx`; behavior is unchanged.
- Tests: cell-editor-ui retries missed drags instead of failing on a busy machine.

## 0.17.0 — 2026-11-01

- CELL: long-text wrapping (name, path and text cells), text size (S/M/L) and alignment for every cell, decimals and unit text for number cells, and greater/less display conditions for number and date fields.

## 0.16.0 — 2026-11-01

- CELL editor: rename fields from the field list or the inspector (display name only; duplicate names refused inline).
- Single-choice options in use cannot be removed (usage counts shown); enum display conditions compare against a dropdown of the options.
- Inspector grouped into collapsible Content / Condition / Position / Style sections with the remove button beside the title; position inputs keep X + width within 12 columns.
- Clearer names and hints: "版面文字" (layout text) vs "文字欄位" (text field), one-line purpose tooltips, field-type descriptions in the new-field form, and guidance when nothing is selected or the canvas is empty.

## 0.15.1 — 2026-11-01

- Tooling only: `.gitattributes` normalizes line endings to LF; `pnpm test:ui:smoke` / `test:ui:changed` pick UI tests by changed files; `pnpm shot` takes a screenshot of sample data in one command; test helpers report failures and delete their own folders.

## 0.15.0 — 2026-11-01

- Remove CELL groups (older projects load without them) and the video project autoplay/auto-next fields.
- Game page toolbar: below 620px the boundary-folder filter becomes an icon menu so tools no longer overlap.
- History navigation keeps working while folder settings are open; settings follow the folder.

## 0.14.0 — 2026-11-01

- Folder settings always dock into the right panel as a tab (drawer and dock toggle removed), follow the folder being viewed, and have a close icon in the tab row.
- Copy full path now works (clipboard write moved to the main process).
- Manga page no longer repeats the folder name and path; the game page uses the same spacing and framing as other folder pages.
- The game boundary-folder filter moved into the top toolbar, next to the layout selector.

## 0.13.5 — 2026-11-01

- Error toasts no longer show Electron's "Error invoking remote method" prefix; only the cause is shown.
- The folder page's subfolder list is height-limited and scrolls, so a folder with many subfolders no longer pushes its files out of view.
- Tests: workspace-ui, workspace-polish-ui, media-feedback-ui, gallery-performance-ui, appearance-ui and video-player-ui follow the current folder page, playback queue and inline CARD controls; drag-and-drop steps retry instead of flaking; add `pnpm test:ui:all` and remove the historical media-final-ui and ui-smoke harnesses.

## 0.13.4 — 2026-11-01

- Fix the right panel collapsing to zero width for video folders (mixed media browser inside the video panel), so the file list is readable again.
- Tests: remove obsolete editing-ui, stages-ui, shell-ui and the video auto-next/lifecycle groups; update appearance-ui and video-player-ui to the unified folder page and fix a reset race.

## 0.13.3 — 2026-11-01

- Group editing is visibly distinct (accent border and tinted bar), shows the group's 12 × N capacity with used and free rows, and the group inspector states the minimum height set by its contents.

## 0.13.2 — 2026-11-01

- Add Prettier as a dev dependency with format and format:check scripts, and format all TypeScript sources and tests (formatting only, no behaviour change).

## 0.13.1 — 2026-11-01

- DocumentViewer now uses the shared full-window overlay frame.
- Fix the folder settings drawer losing its accessible name after the dock toggle was added (the toggle moved into the drawer body).

## 0.13.0 — 2026-11-01

- Fix non-game folders in game projects showing a bare name/path card; every folder page now shares the details / subfolders / files frame.
- Add one-level CELL groups with an inner editing mode.
- Refactor: RightPanel frame, shared overlay-frame, FileMenu and ViewToggle components, shared UI test harness.

## 0.12.0 — 2026-11-01

- Folder settings can be docked as a tab in the right panel (content | settings) with a per-project preference; narrow windows fall back to the drawer.

## 0.11.1 — 2026-11-01

- Fix the game cover cell and image cells not filling their container when resized; add an image fit option (fill/crop or show whole) with fill as the default for game covers.

## 0.11.0 — 2026-11-01

- Queue panel: the toolbar badge is no longer clipped, both tabs share list/image views, auto-advance is an icon toggle, and counts read "N items" / "N files".
- Add a game cover image URL import (preview, confirm, portable asset) with main-process download limits that reject private addresses, credentials, unsupported content and oversized files.
- Add the "game cover" base cell for game projects in the block editor.
- Add DLsite as a metadata source (exact product URL; FANZA is not supported).
- File context menu with file info; friendly file type names; aligned folder text in the reader toolbar; pagination buttons get accessible names; narrow media toolbars can switch the display mode from the more-options menu.
- Remove the obsolete media-ui test and stale video-viewer queue assertions.

## 0.10.0 — 2026-11-01

- Queue: single click only plays (unqueued files are trial playback); right-click, Ctrl/Shift multi-select and Shift+arrows add to the queue; the queue entry moves to the top toolbar; the queue panel offers list and image views.
- Fix the mini player moving the native window when dragged over the title bar.
- Add a collapsed folder-details section and a shared subfolder list across media and manga pages.
- Archive legacy POC and stage documents under docs/archive; add CLAUDE.md for Claude Code.
- Commit previously pending game-detection, navigation and App changes.

## 0.9.0 — 2026-10-30

- Add a unified media workspace with source-aware cross-folder browsing, collapsible source groups and virtualized file layouts.
- Add shared audio/video playback, cross-project mixed queues, independent duplicate entries, drag ordering, removal and optional auto-advance.
- Add a draggable in-app mini player with edge snapping, background playback and playback continuity across project and window changes.
- Add MP3 playback and embedded artwork extraction; fix StrictMode source cleanup that left music duration at zero and playback unresponsive.
- Display audio volume on a 0–100 scale and improve the visibility of unfilled slider tracks across themes.
- Share folder back/forward history across panes and accept both native and DOM mouse side-button events with duplicate suppression.
- Add per-project conversion previews, atomic backups and original-category restoration; preserve project/folder identity, templates and original media.
- Retire legacy categories from project creation while keeping compatible reads and applicable single-file previews.
- Keep unsupported files visible without opening unsupported full-screen previews; retain queue transitions, source validation and file visibility controls.
- Refine Agent task batching, focused reading and verification rules; expand controlled-data and Electron UI regression coverage.

Known follow-ups: S9–S12 cover manual-only queue addition, folder-details presentation, queue UI redesign and mini-player dragging near the native title bar. These requests are recorded but are not included as implemented fixes. Physical mouse drivers, sound output and other platforms still require user acceptance.

Portable record `schemaVersion` remains 1. Optional `mediaSourceCategory` preserves legacy template selection during conversion. No bulk scan, migration or cleanup of actual user collections accompanies this release.

## 0.8.0 — 2026-10-29

- Consolidate folder/file tools, expose CARD controls inline and add persistent TABLE column visibility.
- Redesign saved searches with inline creation, matching and deletion while preserving stable query identities.
- Add status badges, rating/progress displays, field-value copying and conditional CELL content using existing field types.
- Correct palette and canvas drag coordinates; improve editor and folder-settings layout and shared overlay backgrounds.
- Add explicit game launch defaults, application/file and URL actions, per-action arguments, contextual settings and drag ordering.
- Fix shared reader hit areas, directional navigation, page selection and zoom reset; preserve manga work boundaries in file overview.
- Add confirmed field deletion and full project-data removal with impact previews, verified external backups and guarded recovery.
- Streamline Agent instructions and task navigation; add controlled data and Electron regression coverage.

Portable record schemaVersion remains 1 with optional validated capabilities. Original media is retained; no actual collection migration or scan accompanies this release. Music playback, nested containers and native macOS game launching remain deferred.

## 0.7.0 — 2026-10-29

- Add dark, glass-white and paper themes, five UI languages, shared SVG icons and system-language defaults.
- Add a paged, virtualized file overview with thumbnails, source grouping, full-path lists and source-aware previews.
- Fix large file-list scroll crashes caused by deferred event access; show an empty state for filters with no matches.
- Add read-only ZIP/CBZ image reading and the native Chromium PDF viewer without extracting or modifying original documents.
- Add static-text, spacer and cached system-information components, plus boolean, enum, URL and date-only fields.
- Add layout creation, copying, renaming, deletion, draft protection, undo/redo and per-folder assignment to project schemes.
- Add settings export/import with an explicit allowlist, difference previews, merge/replace modes and recoverable backups.
- Expand metadata selection to 11 grouped, no-key sources with provenance, fill/replace previews and manual-value protection; exclude IGDB and TMDB.
- Redesign video controls with hover volume, inline subtitle groups, playback speed, fullscreen and optional cancellable auto-next.
- Add stable saved-query field identities and numeric/date comparisons; preserve ambiguous legacy queries for explicit review.
- Strengthen embedded NW.js/WOLF runtime boundaries and ancestor protection; refactor validation, playback and search-index synchronization.
- Add controlled-data and Electron UI regression coverage, including image/video lists with 1,200 files each.

Portable record `schemaVersion` remains 1. No bulk migration or scan of actual user collections is performed by this version bump.

Known limitations: live metadata-site/login access, media-format and game-engine variants still need real samples. Native macOS game launching is not implemented. Music playback, cloud sync and nested component groups remain deferred. See `docs/WORK_ITEMS.md`.

## 0.6.0 — 2026-10-27

- Add group renaming, drag ordering and contextual hover actions in the project sidebar.
- Synchronize CARD/TABLE/TREE folder locations with backslash breadcrumbs; add draggable TABLE columns and collapsible TREE branches.
- Refine CARD display controls, folder settings tabs and advanced data-management options.
- Add CELL dividers, Delete-key removal, multiple optional image slots and clearer field/component palettes.
- Keep manga content layouts independent of CARD layouts; add validated Steam metadata preview/import alongside E-Hentai.
- Add project-removal previews, verified local recovery copies and safe cleanup of unused empty root metadata; preserve shared data, other projects and original media.
- Improve recreation/relink errors around missing folder records and archived project settings without silently replacing recoverable identities.
- Extend recognized game-runtime layouts and ancestor-boundary protection, including nested Tyrano deployments and macOS app bundles.
- Add progressive album/manga content loading, viewport-based gallery rendering and asynchronous thumbnail decoding over scoped media streams.
- Prioritize cached thumbnails, coalesce duplicate work, skip cancelled queued jobs and throttle cache maintenance; stabilize image geometry while scrolling.
- Improve manga fullscreen reading, zoom/pan, page selection and spread transitions; keep navigation icons fixed when RTL key bindings change.
- Add per-project video autoplay preferences, release playback sources on navigation and combine subtitle settings under an icon-only video settings menu.
- Remove resume prompts and full-video control shading; support horizontal mouse-wheel scrolling in the video strip.
- Simplify folder search, move advanced controls out of the primary flow and reduce routine success notifications.
- Remove the default TITLE field from new projects, retain existing data and expose F12 DevTools access.
- Update focused documentation and controlled-data regression, reader and gallery-performance coverage.

Portable record `schemaVersion` remains 1. No bulk migration of user collections is performed by this version bump.

Known limitations: some embedded NW.js and unpacked/mixed WOLF RPG layouts remain unrecognized. Native macOS game launching is not implemented; app-bundle detection does not imply launch support. See `docs/WORK_ITEMS.md` for outstanding work.

## 0.5.0 — 2026-10-27

- Add CARD-only layout presets and display controls, with multi-level/all-depth and single-level browsing.
- Keep TREE branches visible when opening content; retain folder-by-folder navigation in TABLE.
- Add independent content panes, persistent visibility, a root-content default and separate folder settings.
- Refine sidebar drag ordering, hover actions, combined settings and a neutral bottom create command.
- Separate folder selection from project creation; order the form by name, category, folder and group.
- Check folder records and game boundaries before navigation; never create records as a navigation side effect.
- Restore the game cover, custom actions and field-table layout.
- Add Chromium thumbnail decoding fallback, coalesced requests, recoverable caches and original-image fallback; extend image recognition to BMP, AVIF and ICO.
- Normalize fractional resize values before validating and saving workspace preferences.
- Exclude case-renamed metadata directories from all-depth scans on Windows.
- Preserve legacy scan limits until explicitly expanded; add optional, backward-compatible project/display preferences without bulk migration.

## 0.4.0 — prior milestone, backfilled on 2026-10-27

This development milestone previously remained at version 0.3.0. These notes
document the implemented work; no historical release or Git tag is implied.

- Introduce the desktop shell, project groups, favorites and manual ordering.
- Add CARD/TABLE/TREE browsing, typed fields, SQLite substring search, saved searches and batch edits.
- Add album/manga viewers, game detection/actions, video playback and SRT/VTT subtitles.
- Add E-Hentai metadata preview/import and portable media-specific preferences.
- Split heavy viewers into lazy-loaded chunks and retain portable records as the source of truth.

## 0.3.0 — initial POC

- Electron + React + Vite folder viewer, portable folder metadata and custom CELL layouts.
- Recovery, reconnect, cleanup and controlled-data acceptance tests.
