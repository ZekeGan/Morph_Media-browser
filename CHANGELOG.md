# Changelog

The application version is independent of portable record `schemaVersion`.

## Version guide

| Versions | Theme |
| --- | --- |
| 0.39 | Folder settings redesign (import inside Data, sticky save bar, image thumbnails and delete, "still to add" card, test launch), one top-bar refresh button, smaller package, translation fixes |
| 0.38 | First packaged Windows build (installer and portable) |
| 0.36 – 0.37 | M:orph identity, mark and icon; GPL-3.0 licence and name policy; five-language README; code split into modules; release tidy-up |
| 0.35 | Component styles: weight, italic, borders, corners, presets, tag and choice colours |
| 0.32 – 0.34 | Faster folder listing, tag "+N", per-game button hiding, search through fallback fields, help tooltips, paste-only source import |
| 0.26 – 0.31 | Remembered browse settings, fallback fields and actions, E-Hentai / ExHentai tag namespaces, scrollable cells, n-th image cell |
| 0.22 – 0.25 | Blurred cover fit, launch-game cell, single-click preview, shortcut (Locale Emulator) actions |
| 0.20 – 0.21 | Japanese visual-novel engine detection, video failure help, UI audit fixes |

## Unreleased

- Game detection: confirmed the Godot rule and fixed it with a test: an EXE with its own `.pck` is Godot; a lone EXE (single-file export with an embedded PCK), a `.pak` file or an unrelated `.pck` is not a game, and a folder can still be marked as a game by hand; `Scene.pck` with `Gameexe.dat` stays SiglusEngine. No detection code changed.
- README: the Traditional Chinese README is replaced by the maintainer's revised text (features, per-feature sections, download status, alpha notice), with the screenshots, theme row and the two mermaid diagrams put back; the Releases link points to the new repository name. The English and Japanese READMEs are not changed yet.
- Documentation: new `docs/RELEASING.md` sets the stages (alpha has no tags and no public release; beta, which only the maintainer can declare, gets tags and pre-releases; stable from 1.0.0), the release steps and how `release/` is tidied. `docs/DATA_FORMAT.md` now specifies automatic data upgrades (not implemented yet): portable records upgrade in memory when read and are written back only on their next save, `%APPDATA%` upgrades at start-up after a backup, and data from a newer version is shown read-only. Decision C-119; the project rules, workflow template and document index point to them.
- Documentation: both user guides no longer describe a project "category" (each folder works out its own type); the English guide follows the new project dialog (create from a folder, import, link) and gains three screenshots; the repository URL in `package.json` points to the new repository name; `pnpm shot:docs` and the licence files are listed in the implementation guide and the document index; an old verification note in `UI_RULES.md` is removed and the video player comparison notes which versions it was written for.
- Licence: GPL-3.0-only (no "or any later version") with the name and logo policy. The policy defines the official builds (the Releases page) and forbids presenting a copy as official or as sold or endorsed by the author; the notice covers documentation and sample images; contributors also allow the maintainer to license their contributions under other terms, so selling builds or a commercial licence stays possible later. The three READMEs say that the GPL allows selling copies with their source but not under the name or logo.
- Documentation: the architecture is drawn as mermaid diagrams (data path from folders to the screen, and the renderer / preload / main layers with storage) in `docs/ARCHITECTURE.md`, replacing `architecture.svg`; the Traditional Chinese README shows a simplified data-flow diagram and a three-layer diagram.
- Documentation screenshots: `pnpm shot:docs` rebuilds the eight images in `docs/images/` from a generated sample library (flat covers drawn by the script, fictional titles, no personal paths). The Traditional Chinese README and user guide now use them.
- Fix: a tag cell that is not in the first row of a card showed only a "+N" badge, because the tags were measured against the wrong box. The tag list now measures against itself.
- README: the Traditional Chinese README is rewritten for first-time users (what it is, why use it, download placeholder with the unsigned-build note, features, data storage, developer section); the Simplified Chinese and Spanish READMEs are removed and the language bars of the remaining three now link only English, Traditional Chinese and Japanese. The app's own interface languages are unchanged.
- Problems and recovery: a "Games to confirm" group lists folders that look like games but nobody has confirmed, with "Confirm game ROOT" and "This is not a game" on each, so they can be settled without opening each folder's settings.
- Layout editor: a selected component can be duplicated (the copy goes under the last component and gets its own image slot), and the landing spot of a dragged component is drawn in the theme's accent colour.
- Game toolbar editor: the button colour is picked from a row of ten ready-made swatches (the chosen one shows a tick), "custom colour" opens an inline picker instead of a drop-down that landed below the dialog, and a preview button shows the label in the chosen colour.
- The version number is shown in the app: "v0.39.0" in the status bar and "M:orph 0.39.0" at the bottom of Application settings (read from package.json when the interface is built).
- Problems and recovery: scan messages that only say a game folder is protected ("inside is not written to") are no longer counted as problems; they sit in a folded "Game folder protection notes" section with an explanation, so the status bar and the dialog only show things that need doing.
- Motion: dialogs, menus and popovers share one short pop-in; sidebar group actions, row-info and column-hide buttons fade instead of popping; groups ease open and the chevron turns; the narrow-window scrim, status text and settings tabs fade in; entering a folder fades the list; reordering table columns slides them to their new place. All of it stops under reduced motion. The hidden-sidebar peek no longer nudges the page when it opens or closes.
- Layout editor (formerly "block editor"): the title now says "Layout editor" like the toolbar button; an empty card offers three starting templates (simple, with rating and tags, game card); the component list is grouped (information to show, layout helpers) with the game-only components folded away unless the project has a game; the title shows an unsaved dot and the cancel button reads "Discard changes" ("Close" when nothing changed); only the Content section of the settings starts open.
- Right panel opening: its code is fetched while the app is idle, recently seen folder listings are kept so reopening shows at once, and an outline of the page replaces the empty "loading" line.
- Game detection: CRYENGINE, Adventure Game Studio, MonoGame／FNA／XNA, Source, Source 2, Adobe AIR, DOSBox bundles and PC-98 emulator collections (candidates until checked against real folders).
- Problems and recovery: the status bar says how many problems there are (or that there are none); the dialog groups them (project location lost, duplicate folder ID, damaged record, recording stopped) with a plain explanation and the fixing button on each item, folder names jump to the folder, and raw error text is folded under "Technical details".
- Project sidebar: while hidden, resting the pointer on the left edge (or its button) lays it over the page without moving anything; picking a project or Esc puts it away, and a pin button opens it for good.
- Removed the importer for data from the very first versions (the "older data" section and dialog) and the old category names for content templates; project files keep loading, old templates under those names are just no longer used.
- Folder details: the location shows only the last two folders (the hover title and the copy button still give the whole path).
- Packages are written to `release/morph <version>/` (one folder per version; the 0.38.0 files moved to `release/morph 0.38.0/`).
- Housekeeping: the folder settings Advanced tab and the folders table were split out of their big files (`FolderAdvanced.tsx`, `FolderTable.tsx`).
- Folder details: the location now shows the folder's full path (wrapping instead of only its name), and a "Data source" row lists the website(s) the data was imported from as links that open in the browser (on every kind of folder page); the line above the game field table is gone and its rows name the site instead.
- Game field table: imported fields show plain names (Source URL, Circle / brand ID, Work ID, …; the stored code is a hover hint), the source column shows the site's name instead of repeating the whole address on every row, and a "Data from: DLsite" line above the table names the site once (rows from other places, such as typed by hand, still say so).
- Folder settings: explanations that only matter sometimes moved into "?" hints (folder type reason, layout priority, shared / this-project effect, settings backup scope, per-type default layouts); the layout dropdown's first option now names the layout in force. The scan-boundary block says in plain words what was found and what each button does, with the raw detection evidence tucked under "Why it was detected".
- Selecting and un-selecting a folder is instant: a folder that can be visited as-is is shown in the panel at once while its visit runs behind it (a refused visit goes back to the previous folder), and clearing the selection no longer waits for a double-click timer.
- Files view groups: space between the heading line and its files, and between tile rows.
- Clicking the selected folder again (or pressing Esc) clears the selection and the right panel goes back to the folder the path bar is on; a double click still enters the folder.
- Files view: air between list rows and above each group heading (which now has a divider line).
- Folders table: the dragged column dims, the drop line is thicker and fades in, the moved column flashes once, a hover button hides a column, and the column picker is a labelled "Columns" button.
- Settings backups: only the newest 30 restore points are kept (older ones are deleted when a new one is made).
- Project settings: "Remove project" and "Remove all project data" are one section with a choice (this project's data only, or also clear shared data, which lists the other projects it may affect); "Export project data" moved here from the sidebar menu (Data tab).
- New project dialog: a third choice, "Link an existing project" (replaces the separate re-link buttons on the home page and in Application settings). Application settings, Data and backup: only settings backup (export, import, collapsed restore points), older data (when found) and Dangerous actions are left.
- Housekeeping: the test output folder is pruned automatically (anything older than a day is removed when `pnpm test`, `pnpm shot` or the UI runner starts; `pnpm clean:test` removes all of it). It had grown to 5 GB.
- Fixed: the folder settings Advanced tab showed nothing because the record details and the collapsed Dangerous actions section had been placed inside the "record recovery" block that only appears for broken folders.
- Narrow windows: the layout editor button stays visible (icon only) and only the layout dropdown folds away; the card display button no longer shows the per-row count.
- Toolbar: the controls keep the same places in every view (folders | files, view mode, the view's own tools on the left; scope, columns, folder settings on the right), so switching card / table / tree no longer makes anything jump. Controls share one height and type size, wrap instead of overlapping in narrow windows, and the card / table / tree, thumbnails / groups / list and edit-layout buttons are icon-only with a tooltip. The two scope settings now share one "Scope" button.
- Files view follows the path bar: the separate scope-folder dropdown is gone, switching from a selected folder goes there first, group headings enter their folder, and the path bar's folder count only shows in the folders view.
- Right panel: a single click shows the folder at once, the panel is only opened or closed by you (the "open content automatically" setting is removed), hidden-panel cards and rows have a "show folder content" icon, the panel title has "Open this folder", unsaved folder settings are resolved inside the panel instead of a dialog, and the duplicate settings gear and long settings tab title are gone.
- Application settings: two pages, General (language and theme apply as soon as you choose) and Data and backup (project data, settings backup, a collapsed Dangerous actions section with every description). Folder and project settings also collapse their destructive actions.
- New project dialog: one door with a switch between "Create from a folder" and "Import exported project data" (both folders are chosen in the dialog before the preview); the folder name becomes the default project name. The sidebar and home page no longer carry a separate import button.
- Empty projects get an "Add common fields" button (rating, tags, status, notes) in folder settings and the layout editor; the toolbar's pencil is now a labelled layout button.
- Folder type, steps 3 to 5: card layouts can be set per folder type (project settings, with a note on the priority folder > type > project), project categories and media conversion are removed (new projects no longer ask for one), export format version 2 upgrades older exports on import, and folders can be marked in the list (Ctrl / Shift click) and given a type in bulk.
- Game field table: when the panel is narrow each field becomes a small card (name and source on one line, value below) instead of a column of single characters.
- Folder type, step 2: Folder settings (game tab, scan boundary, cover and launch hints, images), the comic reader default and the folder content view now follow the folder's type instead of the project category. A project's category still supplies the default (manga project → book, game project → game) when nothing else tells, so existing projects look the same; setting a folder's type by hand now changes its features in any project.
- Folder type, step 1: every folder now has a type (game, book / comic, video / audio, general) that is detected from a detected game boundary, an existing comic reading mode, or the files inside (unsure means general), and can be set by hand in Folder settings → Data. Nothing else changes behaviour yet; later steps make the UI follow the folder type instead of the project category.
- One-click project data export / import: the project menu has "Export project data" (a folder with a verified manifest plus the project's records, images and subtitles, no media), and Application settings → Links and maintenance has "Import project data" (preview first, existing records kept, overwrites backed up, rolled back on failure). Imports pass through a versioned migration hook so older exports can be upgraded when the data model changes.
- Folder settings: the scan-boundary block (mark as game root, etc.) is only shown for game projects or when a game was detected in the folder; non-game projects also get a short "game detected, internals protected" note with a shortcut to those settings.
- Folder settings, round three: the panel remembers the tab you were on when you switch folders; the Shared / This project switch moved from Advanced into the Data tab with a line explaining its effect; the website-import preview is now a current-vs-new table with a sticky action bar; the saved-images list became an always-open image library that shows where each image is used; game actions that are not bound yet get an accent border. (Source notes under fields, Ctrl+S to save and the danger-zone divider arrived in the same batch.)
## 0.39.0 — 2026-11-03

- Folder settings, round two: a "Still to add" card lists what a folder lacks (launch file, cover, work data) with a button that jumps to the right place; the path is one slim line and the duplicate "open in Explorer" button is gone (the panel header icon remains); an empty project shows an "Add field" button; each game action has a "test launch" icon and its target path sits on one line.
- Folder settings redesign (fewer steps): website import now sits at the top of the Data tab instead of its own tab; a sticky Save / Discard bar with an unsaved count appears at the bottom (plus a dot on the Data tab); image and game-cover choices are a thumbnail that opens a menu to pick a saved image, import a new one or clear it.
- Fixed 161 Simplified Chinese interface strings that ended in garbled characters; a data test now rejects corrupted characters in any language.
- Folder settings: saved images can now be deleted (Images tab → Saved images → Delete image). A confirmation lists the components/cover that use it; the image entry, its cover/component references and its managed file are removed in one safe write, and your original media files are never touched.
- One refresh button: the folder toolbar's "Rescan" and the right panel's "Refresh" buttons are merged into a single "Refresh" button in the top bar next to the application settings; it rescans the current project and reloads the right-hand content.
- UI test runner (`pnpm test:ui:*`, `test:workspace`) now guarantees a current build: it prints the `out/` build time and runs `pnpm build` first when `out/` is missing or older than `src/`, `shared/`, `electron/` or the build config, so a stale build can no longer show old UI.
- Packaging: electron-builder now ships only the app's five UI locales (`electronLanguages`), dropping unused Chromium language packs, and renderer-only libraries (bundled by Vite already) moved to `devDependencies` so they are no longer copied into `app.asar` a second time (`app.asar` 47 MB → 4 MB; unpacked app 402 MB → 316 MB). The app's own translations are unaffected.
- Game folder panel: the field table's columns (field / source) can be resized by dragging the header separators; widths are remembered on this computer.
- Watching UI tests (`MEDIA_VIEWER_TEST_VISIBLE=1`) no longer takes over your screen: the test window is half transparent, click-through and never activated, so the window you are using keeps the focus.
- Fixed thumbnails and video/audio not loading when running `pnpm dev` (React 19 StrictMode re-attaches the same element after its `src` was cleared on detach): the gallery image, video and audio refs now restore the source. Packaged and production builds were not affected.
- Folder settings: a choice (single-select) field now has an "Add option" box under its dropdown, so a new option no longer needs a trip to the block editor. The option is saved to the project (shared by every folder) and selected for this folder; the folder's own value still needs the usual save.
- UI tests no longer stall on native Windows message boxes (e.g. "discard unsaved changes?"): the test launcher answers them automatically; a test that checks a prompt installs its own stub.
- Docs: end-user guide (English and Traditional Chinese), portable data format reference, architecture diagram, English contributor overview, and a superseded-decisions index in `DECISIONS.md`; `WORK_ITEMS.md` refreshed. The pending-UI test now waits for the back-to-top button to disappear instead of racing React 19's update.
- Merged Dependabot updates (React 19, Electron 45, `@types/node` 26, `tsx`, GitHub Actions) were checked: after importing a settings package the page reload was blocked by a native "discard unsaved changes?" dialog, because React 19 no longer applies a state update made after an `await` before a timer callback runs. The import now commits the state first (`flushSync`) and then reloads.
- UI tests no longer pop windows over your work: in test mode (`MEDIA_VIEWER_TEST_DATA`) the app window is fully transparent, click-through, not activated and not in the taskbar, yet still rendered normally. Set `MEDIA_VIEWER_TEST_VISIBLE=1` to watch a test run.
- `pnpm clean:test` and the test runner skip folders that are still in use instead of failing.
- README (all languages) now says the project is close to its first release instead of being in an early development stage; `SECURITY.md` no longer mentions an early-development state.
- Workflow: changes are collected here and the version number is only raised when a release is made. A shared git hook (`.githooks/pre-commit`, enabled by `pnpm install`) runs the type check, the format check and the link check of the Markdown being committed; slow tests stay manual.
- The UI test runner first stops Electron processes left over from an interrupted run (only those started from this project's `node_modules`). CI also runs the UI smoke tests in a separate, non-blocking job and uploads the screenshots on failure.
- `src/index.html`, `release/` and `build/` are ignored by Prettier, so formatting no longer touches them.
- `CLAUDE.md` and the workflow prompt record the new rules: push after passing checks and ask only for minor/major version bumps, acceptance checklist with screenshots for every batch, independent review only for high-risk changes, translations in the same batch, and suggesting a new conversation after a big topic.

## 0.38.0 — 2026-11-02

- First packaged build: `pnpm dist` creates `release/Morph-Setup-<version>.exe` (installer) and `release/Morph-Portable-<version>.exe` (no installation) with electron-builder; `pnpm dist:dir` only makes the unpacked folder. The licence, notice and name policy files are placed next to the program. The builds are not code-signed, so Windows SmartScreen will warn on first run.

## 0.37.2 — 2026-11-02

- Public-release tidy-up: the documentation no longer names the maintainer's real game folders or collection paths (examples use neutral sample names, tests included), and the AI-generated reference pictures in `docs/design/explorations` were removed.
- README notes that some supported sites carry adult content and that using them is up to the user; added `SECURITY.md` (private vulnerability reporting), `CONTRIBUTING.md` and a weekly Dependabot configuration.
- `AGENTS.md` now only points to `CLAUDE.md`, which is the single source of the working rules.
- 76 interface strings that nothing references any more were removed from the translation file; unused imports were removed and `noUnusedLocals` is now on.
- Theme contrast is checked by a test (WCAG AA for text pairs in all three themes); the secondary text colour of the glass and paper themes is slightly darker to pass.

## 0.37.1 — 2026-11-02

- `Library` and `Explorer` were split by feature into sibling modules (scan, field removal, project removal, cleanup, legacy import; content, streaming and thumbnails, external sources, overview). The classes keep thin wrappers, so callers and behaviour are unchanged.
- The UI test runner deletes the files a passing run created in `.test-output` (failures keep theirs); `pnpm clean:test` clears the leftovers of earlier runs and keeps the fixtures cache.
- README: states that the project is human-led and the code is written by AI coding agents.

## 0.37.0 — 2026-11-02

- Open-source licensing: the code is GPL-3.0-or-later (`LICENSE`, `NOTICE.md`); the name "M:orph" and the logo are excluded and covered by `TRADEMARK.md`, so a modified version cannot just swap the logo and be published as the official one.
- README in English, Traditional Chinese, Simplified Chinese, Japanese and Spanish, with a language switcher.
- Package renamed to `morph` (product name "Morph"); the window title is "M:orph". The data folder in `%APPDATA%` stays `media-viewer` so no settings are lost, and the hidden `.media-viewer` record folder is unchanged.

## 0.36.0 — 2026-11-02

- New product identity: **M:orph** (subtitle "Media Browser"). The mark — a blocky M with the colon in its notch — replaces the book icon in the title bar and is drawn in the current text colour, so it suits all three themes.
- Windows app icon: `build/icon.ico` (16 to 256 px, with a heavier drawing for the small sizes) and `build/icon.png`, used for the taskbar and Alt+Tab; `scripts/render-icons.cjs` regenerates them from `docs/brand`.
- README rewritten around the new name and mark (light and dark versions on GitHub).

## 0.35.0 — 2026-11-02

- More component styles in the editor's Style section: five text sizes, text weight (light/normal/bold), italic, underline and strikethrough, vertical alignment, and a "More styles" group with padding, corner radius, border (thickness and colour), opacity, line spacing and letter spacing.
- Ready-made looks (heading, secondary note, highlight) and "clear styles (keep colours)" from one menu.
- Tag cells can colour tags by category (female, male, language…) and hide the category prefix.
- Single-choice fields can give each option its own badge colour.

## 0.34.0 — 2026-11-02

- Importing information from a website now needs only the address: the source is recognised from it (shown as a badge), and "Get preview" is enabled only for a known site. The separate source picker is gone.

## 0.33.2 — 2026-11-02

- Moved the file type table and the file probe out of the explorer module into `electron/media-files.ts` (no behaviour change).

## 0.33.1 — 2026-11-02

- Added a GitHub Actions workflow (Windows) that runs typecheck, format check and the data tests on every push.
- The UI test runner repeats a failing test once and marks a second-run pass as FLAKY.
- The legacy import code no longer uses untyped data.

## 0.33.0 — 2026-11-02

- Explanations moved into small "?" icons with tooltips instead of text lines in settings, the component inspector and the new fallback sections.
- Game boundaries are marked with a flag icon (cards, table, tree); the words are in the tooltip.
- The editor's field list shows the previewed folder's current value for each field on one line (full value on hover), so the real data is visible without placing a component.
- New interface strings are translated into all languages; the Windows ACL test uses absolute system paths.

## 0.32.1 — 2026-11-02

- A game's action row now shows only the buttons that are bound in that folder; the eye icon in the folder settings can still hide any of them for that game. An action that is not bound yet has its eye disabled with an explanation.

## 0.32.0 — 2026-11-02

- Opening a folder in the right panel is much faster on Windows: the hidden/system-attribute check no longer starts a new PowerShell for every listing (about 0.6 s each); one helper is kept running and started when the app opens.
- Tag cells that do not scroll show the tags that fit followed by a "+N" badge, with the full list in the tooltip.
- Game folder settings: an eye icon on each action hides or shows that button in this game's action row (the binding is kept).
- Searching a field also finds values stored in the fallback fields that cells list after it, without indexing anything extra.

## 0.31.0 — 2026-11-02

- Image cells can show the folder's n-th image file (sorted by name, direct files only) when no picture was picked by hand for that folder; useful for manga (first page) while media folders keep picking by hand. A folder without that image shows an empty placeholder.

## 0.30.0 — 2026-11-02

- Text, tag and layout-text cells have an option "scroll when the content is long": the cell keeps its height and its content scrolls (mouse wheel or keyboard) instead of being cut off.

## 0.29.0 — 2026-11-02

- E-Hentai and ExHentai are treated as one site: both import into the same `eh-` fields (fields saved earlier under `exh-` are taken over on the next import).
- Gallery tags are also split by namespace into their own fields: language, parody, character, artist, group, cosplayer, female, male, mixed, other and reclass. The full tag list is kept as before.

## 0.28.0 — 2026-11-02

- The launch-game cell can list fallback actions: it starts the first action that the folder has a target bound for, so one cell covers games started from an EXE and games started from a shortcut. The button shows the label of the action actually used.

## 0.27.1 — 2026-11-02

- Fallback fields can also be picked from the fields that exist in the folders' records but are not in the project yet (they are added to the project when chosen).
- Palette drag picture is now drawn by the app and follows the cursor with its middle under the pointer, instead of the system picture that landed below it.

## 0.27.0 — 2026-11-02

- Field cells can list fallback fields: the first field in order that has a value is shown, so one cell can cover the same meaning from different source sites (Steam, DLsite…) without copying data.
- Dragging a component from the palette now keeps the cursor in the middle of the dragged picture instead of leaving it hanging below.

## 0.26.0 — 2026-11-02

- The folder-list filter (all folders / boundary folders) and the right panel's file scope (current folder / with subfolders), file type, layout and source grouping are now saved per project and restored after closing the panel or leaving the project.

## 0.25.0 — 2026-11-02

- New action type "shortcut" for game folders: pick a `.lnk`/`.url` that sits inside the game folder (for example one made by Locale Emulator) and run it through the system, keeping its own arguments.
- The launch-game cell can choose which action it starts, and falls back to another launcher when the default launch action was deleted.
- Launch arguments: Windows paths pasted with single backslashes are accepted, and other JSON mistakes get a plain explanation with an example.
- The "new field" dialog lost its extra blank space and divider.

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
