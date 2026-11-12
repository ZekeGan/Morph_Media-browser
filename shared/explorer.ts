import { visibleCells } from './layouts'
import type { MetadataSourceId } from './sources'
import type { StableQuery } from './query'
import type { Notice } from './notifications'
import type { Attribute, Cell, Snapshot } from './model'
export type BrowseMode = 'CARD' | 'TREE' | 'TABLE'
// The file list's own choices in the right panel, kept per project so they survive closing the panel or the project.
export interface MediaPrefs {
  scope?: 'current' | 'descendants'
  filter?: 'all' | 'video' | 'image' | 'audio' | 'other'
  view?: 'masonry' | 'tiles' | 'list'
  grouped?: boolean
}
export interface BrowseState {
  mode: BrowseMode
  location: string
  locations?: Partial<Record<BrowseMode, string>>
  widths: Record<string, number>
  columnOrder?: string[]
  hiddenColumns?: string[]
  treeCollapsed?: string[]
  panelWidth: number
  panelVisible?: boolean
  /** Legacy: settings always dock in the right panel now; kept so older saved preferences stay valid. */
  settingsDock?: boolean
  detailId?: string
  contentMode?: 'folders' | 'files'
  filePresentation?: 'tiles' | 'groups' | 'list'
  fileScope?: 'current' | 'descendants'
  // Game projects: show every folder or only the ones that are game boundaries.
  gameFilter?: 'all' | 'boundaries'
  media?: MediaPrefs
  scroll?: number
  scrolls?: Partial<Record<BrowseMode, number>>
  viewport?: { x: number; y: number; zoom: number }
}
export interface GameBoundary {
  state: 'root' | 'not-game' | 'candidate'
  engines: string[]
  evidence: string[]
}
export interface ReadingPrefs {
  mode?: 'image' | 'manga'
  page?: number
  fit?: 'height' | 'width' | 'original'
  spread?: boolean
  rtl?: boolean
  firstSingle?: boolean
  // R-256: webtoon mode (pages in one continuous column), its width in percent of the window, and whether the
  // "looks like a webtoon" suggestion was already answered for this book.
  webtoon?: boolean
  webtoonWidth?: number
  webtoonAsked?: boolean
}
// R-282: the place in a text book (chapter, and the share of that chapter read), the share of the whole book, when
// it was last read, and the user's bookmarks.
export interface NovelProgress {
  chapter: number
  position: number
  percent: number
  updated: string
  bookmarks?: { chapter: number; position: number; label: string }[]
}
// A text book as the novel reader gets it: plain text chapters (TXT) or chapter XHTML with image addresses (EPUB).
export interface NovelBook {
  format: 'txt' | 'epub'
  title: string
  encoding: string
  chapters: { title: string; text?: string; html?: string; path?: string }[]
  images?: Record<string, string>
}
export interface SubtitlePrefs {
  offset: number
  size: number
  bottom: number
  color: string
  background: string
  encoding: 'utf-8' | 'big5' | 'shift_jis'
}
export const gameExtras = ['steam', 'store', 'save'] as const
export type GameExtra = (typeof gameExtras)[number]
export interface FolderDetails {
  // Set by hand; without it the kind is detected (see shared/kind.ts).
  kind?: import('./kind').FolderKind
  cellImages?: Record<string, string>
  // Game actions whose button is not shown in this folder's action row.
  hiddenActions?: string[]
  // R-315: the game page's own buttons are hidden until the eye in the game settings shows them.
  shownExtras?: GameExtra[]
  schemaVersion: 1
  boundary?: GameBoundary
  bannerAssetId?: string
  reading?: ReadingPrefs
  playback?: Record<
    string,
    { time: number; subtitle?: string; settings?: Record<string, SubtitlePrefs> }
  >
  targets?: Record<
    string,
    {
      kind: ActionKind
      path: string
      relative: boolean
      args: string[]
      application?: { path: string; relative: boolean }
      // EXE actions only (R-309, R-319): start through Locale Emulator's LEProc.exe; true is its
      // default (Japanese) profile, a GUID one of the profiles made in Locale Emulator (Simplified Chinese…).
      localeEmulator?: true | string
    }
  >
  // R-282: where each text book in the folder was left, by file name.
  novels?: Record<string, NovelProgress>
  // R-305: the save folder the user picked when it could not be worked out from the engine.
  saveFolder?: { path: string; relative: boolean }
  subtitles?: { id: string; name: string; relativePath: string }[]
}
// 'shortcut': a .lnk/.url file inside the game folder, opened through the system so its own arguments and compatibility settings apply.
// 'file': a file inside the game folder (a manual, a readme) opened with the system's default application (R-306).
export type ActionKind = 'exe' | 'folder' | 'file-app' | 'url' | 'shortcut' | 'file'
// A 'file' action opens documents only: opening a program or script this way would run it. CHM help files are left out:
// they can carry scripts and start programs.
export const documentFile = (name: string) => /\.(pdf|html?|txt|md|rtf)$/i.test(name)
export interface ActionTemplate {
  id: string
  label: string
  kind: ActionKind
  color: string
}
// Actions that start the game (as opposed to opening a folder or a web page); the launch cell offers these.
export const launchTemplates = (project: { actionTemplates?: ActionTemplate[] }) =>
  gameActionTemplates(project).filter((t) => ['exe', 'file-app', 'shortcut'].includes(t.kind))
// The action a launch cell starts: its chosen one, else the default launch action, else the first one that can launch.
export const launchTemplate = (
  project: { actionTemplates?: ActionTemplate[] },
  actionId?: string
) => {
  const all = launchTemplates(project)
  return (
    all.find((t) => t.id === actionId) ?? all.find((t) => t.id === 'default-launch-game') ?? all[0]
  )
}
// What a launch cell starts for one folder: its action, or the first fallback action that this folder has a target for
// (some games start from an EXE, others from a shortcut). With none bound, the main action is reported so the cell
// shows it as not bound yet.
export const launchChoice = (
  project: { actionTemplates?: ActionTemplate[] },
  actionId: string | undefined,
  fallbackIds: string[] | undefined,
  targets: Record<string, { kind: string }> | undefined
) => {
  const main = launchTemplate(project, actionId),
    all = launchTemplates(project),
    chain = [main, ...(fallbackIds ?? []).map((id) => all.find((t) => t.id === id))].filter(
      (t): t is ActionTemplate => !!t
    )
  return chain.find((t) => targets?.[t.id]?.kind === t.kind) ?? main
}
export const gameActionTemplates = (project: {
  actionTemplates?: ActionTemplate[]
}): ActionTemplate[] =>
  project.actionTemplates ?? [
    { id: 'default-launch-game', label: '啟動遊戲', kind: 'exe', color: '#168c77' },
  ]
export interface MediaEntry {
  id: string
  name: string
  kind: 'image' | 'video' | 'audio' | 'subtitle' | 'folder' | 'other' | 'archive' | 'pdf' | 'text'
  size: number
  modified: number
  mime: string
  url: string
  thumb?: string
  hidden?: boolean
}
export interface ContentResult {
  entries: MediaEntry[]
  notices: string[]
  nextCursor?: string
  total?: number
}
export interface OverviewEntry extends MediaEntry {
  rowId: string
  folderName: string
  sourcePath: string
}
export interface OverviewResult {
  entries: OverviewEntry[]
  notices: string[]
  nextCursor?: string
  complete: boolean
  foldersVisited: number
  foldersTotal: number
}
export interface SearchHit {
  rowId: string
  projectId: string
  name: string
  path: string
  matched: string[]
}
export interface SearchResult {
  resolvedQuery?: string
  hits: SearchHit[]
  total: number
  fields: { key: string; type: string; projectId: string; attributeId: string }[]
  incomplete: string[]
  parsed: string
  index: string
}
export interface MetadataPreview {
  provider?: MetadataSourceId
  token: string
  title: string
  source: string
  values: { key: string; type: string; value: unknown }[]
  image?: string
}
export type ExplorerRequest =
  | { action: 'archive'; rowId: string; fileId: string }
  | {
      action: 'overview'
      rowId: string
      scope: 'current' | 'descendants'
      limit?: number
      cursor?: string
    }
  | { action: 'openExternal'; url: string }
  // Playback failure help: classify a file by its first bytes, open it with the system default app, or show it in Explorer.
  | { action: 'fileProbe' | 'openFile' | 'revealFile'; rowId: string; fileId: string }
  | {
      action: 'search'
      query: string
      queryAst?: StableQuery
      projectId?: string
      offset?: number
      limit?: number
    }
  | { action: 'content'; rowId: string; limit?: number; cursor?: string }
  | { action: 'visit'; rowId: string }
  | { action: 'attributes'; rowId: string; revision: number; values: Attribute[]; private: boolean }
  | {
      action: 'batch'
      rows: { rowId: string; revision: number }[]
      attributeId: string
      value: unknown
      mode: 'replace' | 'add' | 'remove'
    }
  | { action: 'reading'; rowId: string; revision: number; prefs: ReadingPrefs }
  | {
      action: 'folderKind'
      rowId: string
      revision: number
      kind: import('./kind').FolderKind | null
    }
  | {
      action: 'folderKinds'
      rows: { rowId: string; revision: number }[]
      kind: import('./kind').FolderKind | null
    }
  | {
      action: 'playback'
      rowId: string
      revision: number
      fileId: string
      time: number
      subtitle?: string
      settings?: SubtitlePrefs
    }
  | {
      action: 'boundary'
      rowId: string
      revision: number
      state: 'root' | 'not-game' | 'candidate'
      traverse?: boolean
    }
  | { action: 'banner'; rowId: string; revision: number; assetId: string }
  | { action: 'cellImage'; rowId: string; revision: number; cellId: string; assetId: string | null }
  | { action: 'deleteImage'; rowId: string; revision: number; assetId: string }
  | {
      action: 'bindTarget'
      rowId: string
      revision: number
      templateId: string
      args: string[]
      url?: string
      // File name (not a path) of a shortcut inside the game folder, for 'shortcut' actions.
      shortcut?: string
      // EXE actions: start through Locale Emulator (R-309).
      localeEmulator?: boolean
    }
  | {
      action: 'actionVisible'
      rowId: string
      revision: number
      templateId: string
      visible: boolean
    }
  | { action: 'listShortcuts'; rowId: string }
  | { action: 'runTarget'; rowId: string; templateId: string }
  // R-305–R-310: what the game folder offers beyond its bound actions, worked out by main.
  | { action: 'gameExtras'; rowId: string }
  | { action: 'runExtra'; rowId: string; extra: 'steam' | 'store' | 'save' }
  | { action: 'chooseSaveFolder'; rowId: string; revision: number; clear?: boolean }
  // R-306: bind a suggested file (by its name in the game folder) as an action.
  | { action: 'addSuggestion'; rowId: string; revision: number; name: string }
  | { action: 'chooseLocaleEmulator'; clear?: boolean }
  | { action: 'chooseFlashPlayer'; clear?: boolean }
  | {
      action: 'targetLocale'
      rowId: string
      revision: number
      templateId: string
      value: boolean | string
    }
  // R-282: open a text book, and keep where it was left.
  // R-285: website keys. Values only ever travel from the window to main, never back.
  | { action: 'keyStatus' }
  | { action: 'setKey'; site: string; values: Record<string, string> }
  | { action: 'clearKey'; site: string }
  | { action: 'testKey'; site: string }
  | { action: 'novel'; rowId: string; fileId: string }
  // Only this book's place changes, so main writes it against the record's current revision.
  | { action: 'novelProgress'; rowId: string; fileId: string; progress: NovelProgress }
  | {
      action: 'subtitle'
      rowId: string
      fileId?: string
      externalToken?: string
      import?: boolean
      encoding?: string
    }
  | { action: 'chooseSubtitle'; rowId: string }
  | { action: 'imageUrlPreview'; url: string }
  | { action: 'imageUrlApply'; rowId: string; revision: number; token: string; cover: boolean }
  | { action: 'metadataPreview'; source: string; provider?: MetadataSourceId }
  | {
      action: 'metadataApply'
      rowId: string
      revision: number
      token: string
      keys: string[]
      image: boolean
      mode?: 'fill' | 'replace'
    }
  | { action: 'rebuildIndex' }
export interface ExplorerResponse {
  overview?: OverviewResult
  snapshot?: Snapshot
  content?: ContentResult
  search?: SearchResult
  subtitle?: { token: string; name: string; text: string; portable: boolean }
  shortcuts?: string[]
  extras?: GameExtras
  novel?: NovelBook
  keys?: Record<string, import('./keys').KeyStatus>
  localeEmulator?: string
  flashPlayer?: string
  probe?: { kind: 'zip' | 'rar' | '7z' | 'gzip' | 'html' | 'empty' | 'media' | 'unknown' }
  preview?: MetadataPreview
  imagePreview?: { token: string; image: string; name: string; size: number }
  cancelled?: boolean
  notice?: Notice
}
// Game page extras (R-305–R-310). Paths stay in main; the window only learns what can be offered.
export interface GameExtras {
  // Steam App ID from steam_appid.txt or the folder's Steam source; steamReady is false when no Steam is installed.
  steamAppId?: string
  steamReady: boolean
  storeUrl?: string
  // R-316: the store's name for the button ("Open in Steam").
  storeSite?: string
  // Where the save folder comes from: worked out from the engine, picked by the user, or not known.
  save: 'engine' | 'user' | 'none'
  saveEngine?: string
  // Bundled tools and manuals at the top of the game folder, not yet bound as actions.
  suggestions: { name: string; role: 'config' | 'manual' }[]
  localeEmulator: boolean
  // R-319: the profiles made in Locale Emulator (LEConfig.xml next to LEProc.exe), by GUID.
  localeProfiles?: { guid: string; name: string }[]
  // R-320: whether a Flash player is set, so an .swf action can start.
  flashPlayer?: boolean
}
export interface ExplorerApi {
  request(request: ExplorerRequest): Promise<ExplorerResponse>
  dropSubtitle(rowId: string, file: File): Promise<ExplorerResponse>
}
export const newDetails = (): FolderDetails => ({ schemaVersion: 1 })
export const defaultSubtitle = (): SubtitlePrefs => ({
  offset: 0,
  size: 24,
  bottom: 8,
  color: '#ffffff',
  background: '#000000',
  encoding: 'utf-8',
})
export const isFieldKind = (kind: string) => kind.startsWith('field-')
export const cellType = (kind: string) =>
  ({
    'field-text': 'string',
    'field-tags': 'tags',
    'field-number': 'number',
    'field-date': 'datetime',
    'field-boolean': 'boolean',
    'field-enum': 'enum',
    'field-url': 'url',
    'field-date-only': 'date',
  })[kind] ?? 'string'
// Content templates are kept per folder kind (book, game, media, general).
export const contentCells = (
  project: { cells: Cell[]; contentCells?: Record<string, Cell[]> },
  kind: string
) =>
  project.contentCells?.[kind] ??
  visibleCells(project).filter((c) => ['name', 'path'].includes(c.kind))
