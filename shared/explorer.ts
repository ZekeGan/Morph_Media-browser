import { visibleCells } from './layouts'
import type { MetadataSourceId } from './sources'
import type { StableQuery } from './query'
import type { Notice } from './notifications'
import type { Attribute, Cell, Snapshot } from './model'
export type BrowseMode = 'CARD' | 'TREE' | 'TABLE'
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
  fileRootId?: string
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
}
export interface SubtitlePrefs {
  offset: number
  size: number
  bottom: number
  color: string
  background: string
  encoding: 'utf-8' | 'big5' | 'shift_jis'
}
export interface FolderDetails {
  cellImages?: Record<string, string>
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
    }
  >
  subtitles?: { id: string; name: string; relativePath: string }[]
}
export type ActionKind = 'exe' | 'folder' | 'file-app' | 'url'
export interface ActionTemplate {
  id: string
  label: string
  kind: ActionKind
  color: string
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
  kind: 'image' | 'video' | 'audio' | 'subtitle' | 'folder' | 'other' | 'archive' | 'pdf'
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
  | {
      action: 'bindTarget'
      rowId: string
      revision: number
      templateId: string
      args: string[]
      url?: string
    }
  | { action: 'runTarget'; rowId: string; templateId: string }
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
  probe?: { kind: 'zip' | 'rar' | '7z' | 'gzip' | 'html' | 'empty' | 'media' | 'unknown' }
  preview?: MetadataPreview
  imagePreview?: { token: string; image: string; name: string; size: number }
  cancelled?: boolean
  notice?: Notice
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
export const contentCells = (
  project: { cells: Cell[]; contentCells?: Record<string, Cell[]>; mediaSourceCategory?: string },
  category: string
) =>
  project.contentCells?.[
    category === 'media' && project.mediaSourceCategory ? project.mediaSourceCategory : category
  ] ?? visibleCells(project).filter((c) => ['name', 'path'].includes(c.kind))
