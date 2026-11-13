import type { ActionTemplate, FolderDetails } from './explorer'
import type { Notice } from './notifications'
import type { StableQuery } from './query'
export const DATA_DIR = '.media-viewer'
export type CellKind =
  | 'name'
  | 'path'
  | 'field-text'
  | 'field-tags'
  | 'field-number'
  | 'field-date'
  | 'field-boolean'
  | 'field-enum'
  | 'field-url'
  | 'field-date-only'
  | 'static-text'
  | 'spacer'
  | 'system-info'
  | 'image'
  | 'divider'
  | 'open-folder'
  | 'game-cover'
  | 'game-launch'
export interface Cell {
  cellId: string
  kind: CellKind
  attributeId?: string
  // Field cells only: further fields of the same type, tried in order when the ones before are empty.
  fallbackIds?: string[]
  // Field cells only: show a field group (its first member with a value); attributeId is then one of its members.
  groupId?: string
  grid: { x: number; y: number; w: number; h: number }
  style: {
    textColor: string
    backgroundColor: string
    // Optional text scale and alignment; absent means the default size and the kind's usual alignment.
    fontSize?: 'xsmall' | 'small' | 'medium' | 'large' | 'xlarge'
    align?: 'left' | 'center' | 'right'
    valign?: 'top' | 'center' | 'bottom'
    weight?: 'light' | 'normal' | 'bold'
    italic?: boolean
    underline?: boolean
    strike?: boolean
    lineHeight?: 'tight' | 'loose'
    letterSpacing?: 'wide'
    padding?: 'compact' | 'roomy'
    radius?: 'small' | 'large'
    // Border: a colour and a thickness; both are needed for a border to show.
    borderColor?: string
    borderWidth?: 'thin' | 'thick'
    opacity?: 'soft' | 'faint'
  }
  // Tag cells only: colour tags by their namespace (female:, male:…) and whether the prefix is shown.
  tagColors?: 'namespace'
  tagPrefix?: boolean
  text?: string
  // Long text: wrap onto several lines instead of one truncated line (name, path and text-field cells).
  wrap?: boolean
  // Long text and tag lists: keep the cell's height and let its content scroll instead of being cut off.
  scroll?: boolean
  // Number cells only: unit text shown before or after the value (plain presentation) and fixed decimals.
  unit?: string
  unitPosition?: 'prefix' | 'suffix'
  decimals?: number
  // playTime / lastPlayed: games started from M:orph (R-308), from the local play record.
  // readProgress / lastRead: the text book read most recently in the folder (R-282).
  systemInfo?:
    'category' | 'files' | 'size' | 'playTime' | 'lastPlayed' | 'readProgress' | 'lastRead'
  presentation?: 'badge' | 'rating' | 'progress'
  // 'blur': the whole picture, with its own blurred copy filling the leftover space.
  imageFit?: 'contain' | 'cover' | 'blur'
  maximum?: number
  // Launch cell only: which action template it starts; absent means the default launch action.
  actionId?: string
  // Launch cell only: further actions tried in order when the folder has no target for the ones before.
  fallbackActionIds?: string[]
  // Image cell only: without a picture chosen for the folder, show its n-th image file (by name, 1-based).
  imageIndex?: number
  copyValue?: boolean
  condition?: CellCondition
  // More conditions (R-239): with `condition` they must all hold, or any one with conditionMode 'any'.
  moreConditions?: CellCondition[]
  conditionMode?: 'any'
  // Layout text only (R-239): the first rule whose condition holds gives the text; otherwise `text` is shown.
  textRules?: { when: CellCondition; text: string }[]
}
// "within" / "older": a date or date-and-time field compared with today, `value` in days (R-239).
export interface CellCondition {
  attributeId: string
  operator: 'set' | 'unset' | 'equals' | 'not-equals' | 'gt' | 'lt' | 'within' | 'older'
  value?: string | number | boolean
}
export const MAX_MORE_CONDITIONS = 4
export const MAX_TEXT_RULES = 10
// Every condition a cell reads: its display conditions and its text rules.
export function cellConditions(cell: Cell): CellCondition[] {
  return [
    ...(cell.condition ? [cell.condition] : []),
    ...(cell.moreConditions ?? []),
    ...(cell.textRules ?? []).map((rule) => rule.when),
  ]
}
export interface SourceRecord {
  provider: string
  url: string
  fetchedAt: string
}
export interface Attribute {
  attributeId: string
  key: string
  type: string
  value: unknown
  source: string
  sourceRecord?: SourceRecord
}
export interface Asset {
  assetId: string
  relativePath: string
  originalName: string
  mediaType: string
}
export interface FolderRecord {
  kind: 'media-viewer.folder'
  schemaVersion: 1
  folderId: string
  revision: number
  attributes: Attribute[]
  projectOverrides: Record<string, Attribute[]>
  assets: Asset[]
  details?: FolderDetails
}
export interface Project {
  kind: 'media-viewer.project'
  schemaVersion: 1
  projectId: string
  rootFolderId: string
  revision: number
  name: string
  depth: { mode: 'through' | 'exact'; level: number }
  fieldBindings: {
    alias: string
    attributeId: string
    type: string
    options?: string[]
    // Enum fields: a badge colour per option (hex).
    optionColors?: Record<string, string>
    // Yes/no fields: the text shown for true and false (1-20 characters); absent means the usual yes/no.
    trueLabel?: string
    falseLabel?: string
  }[]
  cells: Cell[]
  list: { itemsPerRow: number; pageSize: number }
  excludedRelativePaths: string[]
  contentCells?: Record<string, Cell[]>
  // R-362: the book template holds its own cover; without it an older edited template is shown with the
  // cover drawn beside it, as before.
  contentCover?: boolean
  // R-363: several book templates; the project default is bookPresetId (contentCells.book holds its
  // cells too), and a folder may use another one (folderBookPresets, by folder ID).
  bookPresets?: { id: string; name: string; cells: Cell[] }[]
  bookPresetId?: string
  folderBookPresets?: Record<string, string>
  actionTemplates?: ActionTemplate[]
  layoutPresets?: { id: string; name: string; cells: Cell[] }[]
  // Styles saved by name in this project: applied to a component they replace its whole style.
  stylePresets?: { id: string; name: string; style: Cell['style'] }[]
  activeLayoutId?: string
  folderLayouts?: Record<string, string>
  // Card layout preset applied to every folder of a kind (book, game, media, general) unless the folder picks its own.
  kindLayouts?: Record<string, string>
  scanAll?: boolean
  // R-340: works shows every work below the current folder (category folders passed through); level then limits depth.
  cardView?: { mode: 'multi' | 'single'; level: number | 'all'; works?: boolean }
  traversal?: Record<string, boolean>
  savedSearches?: { id: string; name: string; query: string; queryAst?: StableQuery }[]
  // Fields holding the same kind of data from different sources, shown as one: the first member with a value.
  fieldGroups?: FieldGroup[]
  // A folder's chosen member per group (folder ID → group ID → attribute ID); this project only.
  groupSources?: Record<string, Record<string, string>>
}
export interface FieldGroup {
  groupId: string
  name: string
  memberIds: string[]
}
export const MAX_GROUP_MEMBERS = 20
export interface LinkedProject {
  projectId: string
  root: string
  project?: Project
  error?: string
}
export interface FolderRow {
  rowId: string
  path: string
  name: string
  depth: number
  projectId: string
  record?: FolderRecord
  error?: string
  stopped: boolean
  duplicate: boolean
  structural?: boolean
  readonly?: boolean
  boundary?: { engines: string[]; evidence: string[]; state: string }
  // R-340: the files directly inside, counted while scanning (not saved); absent where the scan did not look inside.
  contents?: { images: number; videos: number; audio: number; texts: number; total: number }
}
export interface ScanProgress {
  visited: number
  created: number
  errors: number
  active: boolean
  cancelled: boolean
}
export interface Snapshot {
  projects: LinkedProject[]
  rows: FolderRow[]
  problems: string[]
  structure?: FolderRow[]
  progress: ScanProgress
}
export interface CleanupPreview {
  token: string
  paths: string[]
  skipped: string[]
  count: number
  scope: 'folder' | 'private' | 'all'
}
export interface CleanupResult {
  removed: number
  failed: string[]
  skipped: string[]
}
export interface ProjectRemovalPreview {
  token: string
  projectId: string
  name: string
  paths: string[]
  skipped: string[]
  privateCount: number
  rootCleanup?: boolean
  recoveryPath?: string
}
export interface FullRemovalPreview {
  token: string
  projectId: string
  name: string
  root: string
  paths: string[]
  skipped: string[]
  affectedProjects: { projectId: string; name: string; root: string }[]
  recoveryPath: string
}
// R-364: what unifying a field's text values to its date type would change.
export interface FieldUnifyPreview {
  token: string
  attributeId: string
  name: string
  to: 'date' | 'datetime'
  folders: number
  values: number
  unreadable: { path: string; value: string }[]
  recoveryPath: string
}
export interface FieldDeletionPreview {
  token: string
  attributeId: string
  name: string
  fields: number
  folders: number
  values: number
  references: number
  layouts: number
  tables: number
  searches: number
  backups: number
  // Field groups (by name) the field is taken out of.
  groups?: string[]
  projects: { projectId: string; name: string; root: string }[]
  skipped: string[]
  recoveryPath: string
}
export interface ProjectInput {
  name: string
  depth: Project['depth']
  scanAll?: boolean
}
export type Request =
  | {
      action: 'snapshot' | 'scan' | 'cancelScan' | 'chooseRoot'
    }
  | { action: 'link'; rootToken?: string }
  | { action: 'create'; input: ProjectInput; rootToken?: string }
  | { action: 'saveProject'; project: Project }
  | { action: 'unlink'; projectId: string }
  | { action: 'removeProjectPreview'; projectId: string }
  | { action: 'removeProject'; token: string }
  | { action: 'fullRemovalPreview'; projectId: string }
  | { action: 'fullRemoval'; token: string }
  | { action: 'deleteFieldPreview'; projectId: string; attributeId: string }
  | { action: 'deleteField'; token: string }
  | { action: 'unifyFieldPreview'; projectId: string; attributeId: string }
  | { action: 'unifyField'; token: string }
  | { action: 'copyFieldValue'; rowId: string; attributeId: string }
  | { action: 'copyPath'; rowId: string }
  | { action: 'restoreProject'; projectId: string }
  | { action: 'saveFolder'; rowId: string; revision: number; values: Record<string, string> }
  | { action: 'image'; rowId: string; revision: number; cellId?: string }
  | { action: 'open' | 'restore' | 'copyIdentity' | 'resume'; rowId: string }
  | { action: 'cleanupPreview'; rowId: string; scope: 'folder' | 'private' }
  | { action: 'cleanup'; token: string; restart: boolean }
  | { action: 'createBackup' | 'listBackups' }
  | { action: 'deleteBackup' | 'exportBackup'; id: string }
  | { action: 'previewBackup'; id?: string }
  | { action: 'locateBackup'; token: string; projectId: string }
  | { action: 'restoreBackup'; token: string; settings: boolean; projects: string[] }
export interface Response {
  snapshot: Snapshot
  preview?: CleanupPreview
  cleanup?: CleanupResult
  removalPreview?: ProjectRemovalPreview
  removal?: CleanupResult
  fullRemovalPreview?: FullRemovalPreview
  fieldDeletionPreview?: FieldDeletionPreview
  fieldUnifyPreview?: FieldUnifyPreview
  recoveryPath?: string
  backup?: import('./backup').BackupPreview
  backups?: import('./backup').BackupEntry[]
  restored?: { projects: string[]; failed: string[]; settings: boolean; settingsUndo?: string }
  notice?: Notice
  cancelled?: boolean
  rootSelection?: RootSelection
}
// A folder picked in the native dialog; `existing` lists projects whose definitions already live in it.
export interface RootSelection {
  token: string
  path: string
  existing?: { projectId: string; name: string; linked: boolean }[]
}
export interface MediaApi {
  request(request: Request): Promise<Response>
  onProgress(callback: (progress: ScanProgress) => void): () => void
}
export const MAX_FALLBACKS = 5
