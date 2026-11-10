import type { ActionTemplate, FolderDetails } from './explorer'
import type { Notice } from './notifications'
import { imageTypes } from './images'
import { compatibleFieldTypes, httpUrl, validFieldValue } from './fields'
import { validStableQuery, type StableQuery } from './query'
import { checkNotNewer, FORMAT_VERSION } from './upgrade'
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
  systemInfo?: 'category' | 'files' | 'size'
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
  condition?: {
    attributeId: string
    operator: 'set' | 'unset' | 'equals' | 'not-equals' | 'gt' | 'lt'
    value?: string | number | boolean
  }
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
  }[]
  cells: Cell[]
  list: { itemsPerRow: number; pageSize: number }
  excludedRelativePaths: string[]
  contentCells?: Record<string, Cell[]>
  actionTemplates?: ActionTemplate[]
  layoutPresets?: { id: string; name: string; cells: Cell[] }[]
  // Styles saved by name in this project: applied to a component they replace its whole style.
  stylePresets?: { id: string; name: string; style: Cell['style'] }[]
  activeLayoutId?: string
  folderLayouts?: Record<string, string>
  // Card layout preset applied to every folder of a kind (book, game, media, general) unless the folder picks its own.
  kindLayouts?: Record<string, string>
  scanAll?: boolean
  cardView?: { mode: 'multi' | 'single'; level: number | 'all' }
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

const obj = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const id = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[a-zA-Z0-9_-]{1,100}$/.test(v) &&
  !['__proto__', 'constructor', 'prototype'].includes(v)
const integer = (v: unknown, min: number, max: number) =>
  Number.isInteger(v) && Number(v) >= min && Number(v) <= max
const text = (v: unknown, max = 10000): v is string => typeof v === 'string' && v.length <= max
const relative = (v: unknown): v is string =>
  text(v) &&
  !v.startsWith('/') &&
  !v.includes('\\') &&
  !v.includes(':') &&
  !v.split('/').includes('..')
const attribute = (a: unknown): a is Attribute =>
  obj(a) &&
  id(a.attributeId) &&
  text(a.key, 100) &&
  text(a.type, 40) &&
  text(a.source, 100) &&
  'value' in a &&
  (!['boolean', 'enum', 'url', 'date'].includes(a.type) || validFieldValue(a.type, a.value)) &&
  (a.sourceRecord === undefined ||
    (obj(a.sourceRecord) &&
      id(a.sourceRecord.provider) &&
      text(a.sourceRecord.url, 2048) &&
      /^https:\/\//.test(a.sourceRecord.url) &&
      text(a.sourceRecord.fetchedAt, 40) &&
      Number.isFinite(Date.parse(a.sourceRecord.fetchedAt))))

function validAsset(a: unknown): boolean {
  return (
    obj(a) &&
    id(a.assetId) &&
    relative(a.relativePath) &&
    /^assets\/[a-zA-Z0-9_-]+\.(png|jpg|webp|gif|bmp|avif|ico)$/.test(a.relativePath) &&
    text(a.originalName, 255) &&
    Object.values(imageTypes).includes(a.mediaType)
  )
}

function validFieldBinding(f: unknown): boolean {
  return (
    obj(f) &&
    text(f.alias, 100) &&
    id(f.attributeId) &&
    text(f.type, 40) &&
    (f.type !== 'enum' ||
      (Array.isArray(f.options) &&
        f.options.length > 0 &&
        f.options.length <= 100 &&
        new Set(f.options).size === f.options.length &&
        f.options.every((option: unknown) => text(option, 100) && option.trim().length > 0))) &&
    (f.optionColors === undefined ||
      (f.type === 'enum' &&
        obj(f.optionColors) &&
        Object.entries(f.optionColors).every(
          ([option, color]) =>
            (f.options as string[]).includes(option) &&
            typeof color === 'string' &&
            /^#[0-9a-f]{6}$/i.test(color)
        )))
  )
}

function validCell(c: unknown): boolean {
  return (
    obj(c) &&
    id(c.cellId) &&
    [
      'name',
      'path',
      'field-text',
      'field-tags',
      'field-number',
      'field-date',
      'field-boolean',
      'field-enum',
      'field-url',
      'field-date-only',
      'static-text',
      'spacer',
      'system-info',
      'image',
      'divider',
      'open-folder',
      'game-cover',
      'game-launch',
    ].includes(c.kind) &&
    (c.text === undefined || text(c.text, 10000)) &&
    (c.systemInfo === undefined || ['category', 'files', 'size'].includes(c.systemInfo)) &&
    (c.presentation === undefined ||
      (c.presentation === 'badge' && ['field-enum', 'field-boolean'].includes(c.kind)) ||
      (['rating', 'progress'].includes(c.presentation) && c.kind === 'field-number')) &&
    (c.imageFit === undefined ||
      (['contain', 'cover', 'blur'].includes(c.imageFit) &&
        ['image', 'game-cover'].includes(c.kind))) &&
    (c.fallbackIds === undefined ||
      (c.kind.startsWith('field-') &&
        Array.isArray(c.fallbackIds) &&
        c.fallbackIds.length >= 1 &&
        c.fallbackIds.length <= MAX_FALLBACKS &&
        c.fallbackIds.every(id) &&
        new Set([c.attributeId, ...c.fallbackIds]).size === c.fallbackIds.length + 1)) &&
    (c.groupId === undefined ||
      (c.kind.startsWith('field-') && id(c.groupId) && c.fallbackIds === undefined)) &&
    (c.actionId === undefined || (c.kind === 'game-launch' && id(c.actionId))) &&
    (c.imageIndex === undefined || (c.kind === 'image' && integer(c.imageIndex, 1, 999))) &&
    (c.fallbackActionIds === undefined ||
      (c.kind === 'game-launch' &&
        Array.isArray(c.fallbackActionIds) &&
        c.fallbackActionIds.length >= 1 &&
        c.fallbackActionIds.length <= MAX_FALLBACKS &&
        c.fallbackActionIds.every(id) &&
        new Set([c.actionId, ...c.fallbackActionIds]).size === c.fallbackActionIds.length + 1)) &&
    (c.scroll === undefined ||
      (typeof c.scroll === 'boolean' &&
        ['field-text', 'field-tags', 'static-text'].includes(c.kind))) &&
    (c.wrap === undefined ||
      (typeof c.wrap === 'boolean' && ['field-text', 'name', 'path'].includes(c.kind))) &&
    (c.unit === undefined || (c.kind === 'field-number' && text(c.unit, 20))) &&
    (c.unitPosition === undefined ||
      (c.kind === 'field-number' && ['prefix', 'suffix'].includes(c.unitPosition))) &&
    (c.decimals === undefined || (c.kind === 'field-number' && integer(c.decimals, 0, 6))) &&
    (c.maximum === undefined ||
      (c.kind === 'field-number' &&
        typeof c.maximum === 'number' &&
        Number.isFinite(c.maximum) &&
        c.maximum > 0 &&
        c.maximum <= 1e9)) &&
    (c.copyValue === undefined ||
      (c.kind.startsWith('field-') && typeof c.copyValue === 'boolean')) &&
    (c.condition === undefined ||
      (obj(c.condition) &&
        id(c.condition.attributeId) &&
        ['set', 'unset', 'equals', 'not-equals', 'gt', 'lt'].includes(c.condition.operator) &&
        (['set', 'unset'].includes(c.condition.operator)
          ? c.condition.value === undefined
          : typeof c.condition.value === 'boolean' ||
            (typeof c.condition.value === 'number' && Number.isFinite(c.condition.value)) ||
            text(c.condition.value, 10000)))) &&
    (!c.kind.startsWith('field-') || id(c.attributeId)) &&
    (c.kind !== 'image' || c.attributeId === undefined || id(c.attributeId)) &&
    obj(c.grid) &&
    integer(c.grid.x, 0, 11) &&
    integer(c.grid.y, 0, 99) &&
    integer(c.grid.w, 1, 12) &&
    integer(c.grid.h, 1, 100) &&
    c.grid.x + c.grid.w <= 12 &&
    c.grid.y + c.grid.h <= 100 &&
    validStyle(c.style) &&
    (c.tagColors === undefined || (c.tagColors === 'namespace' && c.kind === 'field-tags')) &&
    (c.tagPrefix === undefined || (typeof c.tagPrefix === 'boolean' && c.kind === 'field-tags'))
  )
}

// A component style: shared by cells and the project's saved styles.
function validStyle(style: any): boolean {
  return (
    obj(style) &&
    /^#[0-9a-f]{6}$/i.test(style.textColor) &&
    (style.backgroundColor === 'transparent' || /^#[0-9a-f]{6}$/i.test(style.backgroundColor)) &&
    (style.fontSize === undefined ||
      ['xsmall', 'small', 'medium', 'large', 'xlarge'].includes(style.fontSize)) &&
    (style.align === undefined || ['left', 'center', 'right'].includes(style.align)) &&
    (style.valign === undefined || ['top', 'center', 'bottom'].includes(style.valign)) &&
    (style.weight === undefined || ['light', 'normal', 'bold'].includes(style.weight)) &&
    ['italic', 'underline', 'strike'].every(
      (flag) => style[flag] === undefined || typeof style[flag] === 'boolean'
    ) &&
    (style.lineHeight === undefined || ['tight', 'loose'].includes(style.lineHeight)) &&
    (style.letterSpacing === undefined || style.letterSpacing === 'wide') &&
    (style.padding === undefined || ['compact', 'roomy'].includes(style.padding)) &&
    (style.radius === undefined || ['small', 'large'].includes(style.radius)) &&
    (style.borderColor === undefined || /^#[0-9a-f]{6}$/i.test(style.borderColor)) &&
    (style.borderWidth === undefined || ['thin', 'thick'].includes(style.borderWidth)) &&
    (style.opacity === undefined || ['soft', 'faint'].includes(style.opacity))
  )
}

function validTargetEntry([k, t]: [string, unknown]): boolean {
  return (
    id(k) &&
    obj(t) &&
    ['exe', 'folder', 'file-app', 'url', 'shortcut'].includes(t.kind) &&
    text(t.path, 10000) &&
    typeof t.relative === 'boolean' &&
    (!t.relative || relative(t.path)) &&
    Array.isArray(t.args) &&
    t.args.length <= 100 &&
    t.args.every((a: unknown) => text(a, 10000) && !String(a).includes('\0')) &&
    (t.kind !== 'url' || t.args.length === 0) &&
    // A shortcut carries its own arguments and lives inside the game folder, so the record only keeps its relative name.
    (t.kind !== 'shortcut' ||
      (t.args.length === 0 && t.relative === true && /^[^\\/]+\.(lnk|url)$/i.test(t.path))) &&
    (t.kind !== 'url' || (httpUrl(t.path) && t.relative === false)) &&
    (t.kind === 'file-app'
      ? obj(t.application) &&
        text(t.application.path, 10000) &&
        /\.exe$/i.test(t.application.path) &&
        typeof t.application.relative === 'boolean' &&
        (!t.application.relative || relative(t.application.path))
      : t.application === undefined)
  )
}

function validSubtitleSettings(s: unknown): boolean {
  return (
    obj(s) &&
    typeof s.offset === 'number' &&
    Number.isFinite(s.offset) &&
    Math.abs(s.offset) <= 86400 &&
    integer(s.size, 10, 80) &&
    typeof s.bottom === 'number' &&
    s.bottom >= 0 &&
    s.bottom <= 80 &&
    /^#[0-9a-f]{6}$/i.test(s.color) &&
    /^#[0-9a-f]{6}$/i.test(s.background) &&
    ['utf-8', 'big5', 'shift_jis'].includes(s.encoding)
  )
}

function validPlaybackEntry([k, p]: [string, unknown]): boolean {
  return (
    id(k) &&
    obj(p) &&
    typeof p.time === 'number' &&
    Number.isFinite(p.time) &&
    p.time >= 0 &&
    p.time < 1e9 &&
    (!p.subtitle || text(p.subtitle, 200)) &&
    (!p.settings || (obj(p.settings) && Object.values(p.settings).every(validSubtitleSettings)))
  )
}

export function validateFolder(v: unknown): asserts v is FolderRecord {
  checkNotNewer('folder', v)
  if (
    !obj(v) ||
    v.kind !== 'media-viewer.folder' ||
    v.schemaVersion !== FORMAT_VERSION.folder ||
    !id(v.folderId) ||
    !integer(v.revision, 1, Number.MAX_SAFE_INTEGER) ||
    !Array.isArray(v.attributes) ||
    !v.attributes.every(attribute) ||
    new Set(v.attributes.map((a) => a.attributeId)).size !== v.attributes.length ||
    !obj(v.projectOverrides) ||
    !Object.entries(v.projectOverrides).every(
      ([k, a]) => id(k) && Array.isArray(a) && a.every(attribute)
    ) ||
    !Array.isArray(v.assets) ||
    !v.assets.every(validAsset)
  )
    throw new Error('記錄損壞、版本不支援或不屬於本程式；原檔保留')
  if (v.details !== undefined) validateDetails(v.details)
}
export function validateDetails(v: unknown): asserts v is FolderDetails {
  checkNotNewer('details', v)
  if (!obj(v) || v.schemaVersion !== FORMAT_VERSION.details || JSON.stringify(v).length > 2000000)
    throw new Error('內容設定不合法')
  // Sections with truthy guards retain compatibility with existing null values.
  if (
    v.boundary &&
    (!obj(v.boundary) ||
      !['root', 'not-game', 'candidate'].includes(v.boundary.state) ||
      !Array.isArray(v.boundary.engines) ||
      !v.boundary.engines.every((x: unknown) => text(x, 100)) ||
      !Array.isArray(v.boundary.evidence) ||
      !v.boundary.evidence.every((x: unknown) => text(x, 500)))
  )
    throw new Error('遊戲邊界設定不合法')
  if (
    v.hiddenActions !== undefined &&
    (!Array.isArray(v.hiddenActions) ||
      v.hiddenActions.length > 100 ||
      !v.hiddenActions.every(id) ||
      new Set(v.hiddenActions).size !== v.hiddenActions.length)
  )
    throw new Error('遊戲操作顯示設定不合法')
  if (v.kind !== undefined && !['game', 'book', 'media', 'general'].includes(v.kind))
    throw new Error('資料夾類型不合法')
  if (v.bannerAssetId !== undefined && !id(v.bannerAssetId)) throw new Error('封面身分不合法')
  if (
    v.cellImages !== undefined &&
    (!obj(v.cellImages) ||
      Object.keys(v.cellImages).length > 1000 ||
      !Object.entries(v.cellImages).every(([slot, asset]) => id(slot) && id(asset)))
  )
    throw new Error('圖片組件設定不合法')
  if (
    v.reading &&
    (!obj(v.reading) ||
      (v.reading.mode !== undefined && !['image', 'manga'].includes(v.reading.mode)) ||
      (v.reading.page !== undefined && !integer(v.reading.page, 0, 1000000)) ||
      (v.reading.fit !== undefined && !['width', 'height', 'original'].includes(v.reading.fit)) ||
      ['spread', 'rtl', 'firstSingle'].some(
        (k) => v.reading[k] !== undefined && typeof v.reading[k] !== 'boolean'
      ))
  )
    throw new Error('閱讀設定不合法')
  if (v.targets && (!obj(v.targets) || !Object.entries(v.targets).every(validTargetEntry)))
    throw new Error('任務設定不合法')
  if (
    v.subtitles &&
    (!Array.isArray(v.subtitles) ||
      !v.subtitles.every(
        (s) =>
          obj(s) &&
          id(s.id) &&
          text(s.name, 255) &&
          relative(s.relativePath) &&
          /^subtitles\/[\w-]+\.(srt|vtt)$/.test(s.relativePath)
      ))
  )
    throw new Error('字幕記錄不合法')
  if (
    v.playback &&
    (!obj(v.playback) ||
      Object.keys(v.playback).length > 10000 ||
      !Object.entries(v.playback).every(validPlaybackEntry))
  )
    throw new Error('播放設定不合法')
}
export function validateProject(v: unknown): asserts v is Project {
  checkNotNewer('project', v)
  if (
    obj(v) &&
    ((v.scanAll !== undefined && typeof v.scanAll !== 'boolean') ||
      (v.cardView !== undefined &&
        (!obj(v.cardView) ||
          !['multi', 'single'].includes(v.cardView.mode) ||
          !(
            integer(v.cardView.level, 1, Number.MAX_SAFE_INTEGER) ||
            (v.cardView.mode === 'multi' && v.cardView.level === 'all')
          ))))
  )
    throw new Error('CARD 顯示範圍不合法')
  if (
    !obj(v) ||
    v.kind !== 'media-viewer.project' ||
    v.schemaVersion !== FORMAT_VERSION.project ||
    !id(v.projectId) ||
    !id(v.rootFolderId) ||
    !integer(v.revision, 1, Number.MAX_SAFE_INTEGER) ||
    !text(v.name, 100) ||
    !v.name.trim() ||
    !obj(v.depth) ||
    !['through', 'exact'].includes(v.depth.mode) ||
    !integer(v.depth.level, 1, 50) ||
    !obj(v.list) ||
    !integer(v.list.itemsPerRow, 1, 6) ||
    !integer(v.list.pageSize, 1, 500) ||
    !Array.isArray(v.excludedRelativePaths) ||
    !v.excludedRelativePaths.every(relative) ||
    !Array.isArray(v.fieldBindings) ||
    !v.fieldBindings.every(validFieldBinding) ||
    !Array.isArray(v.cells) ||
    v.cells.length > 50 ||
    !v.cells.every(validCell)
  )
    throw new Error('專案設定不合法或版本不支援')
  if (
    new Set(v.cells.map((c) => c.cellId)).size !== v.cells.length ||
    new Set(v.fieldBindings.map((f) => f.alias.toLowerCase())).size !== v.fieldBindings.length
  )
    throw new Error('組件 ID 或欄位別名重複')
  for (const cell of v.cells)
    if (cell.fallbackIds) {
      const type = v.fieldBindings.find((f) => f.attributeId === cell.attributeId)?.type,
        display = cell.kind === 'field-text' ? 'string' : cell.kind === 'field-tags' ? 'tags' : type
      if (
        !compatibleFieldTypes(display, type) ||
        cell.fallbackIds.some(
          (fallback: string) =>
            !compatibleFieldTypes(
              display,
              v.fieldBindings.find((f: { attributeId: string }) => f.attributeId === fallback)?.type
            )
        )
      )
        throw new Error('備用欄位必須存在且型別可相容顯示')
    }
  validateFieldGroups(v as Project)
  for (const cell of v.cells)
    if (cell.condition) {
      const condition = cell.condition
      const field = v.fieldBindings.find((field) => field.attributeId === condition.attributeId)
      if (
        !field ||
        (['gt', 'lt'].includes(condition.operator) &&
          (!['number', 'date', 'datetime'].includes(field.type) ||
            !validFieldValue(field.type, condition.value))) ||
        (['equals', 'not-equals'].includes(condition.operator) &&
          (!['string', 'enum', 'url', 'date', 'datetime', 'number', 'boolean'].includes(
            field.type
          ) ||
            !validFieldValue(
              field.type,
              condition.value,
              field.type === 'enum' ? undefined : field.options
            )))
      )
        throw new Error('組件顯示條件不合法')
    }
  if (
    v.folderLayouts !== undefined &&
    (!obj(v.folderLayouts) ||
      Object.keys(v.folderLayouts).length > 50000 ||
      !Object.entries(v.folderLayouts).every(([folder, preset]) => id(folder) && id(preset)))
  )
    throw new Error('資料夾版面指定不合法')
  if (
    v.kindLayouts !== undefined &&
    (!obj(v.kindLayouts) ||
      !Object.entries(v.kindLayouts).every(
        ([kind, preset]) => ['book', 'game', 'media', 'general'].includes(kind) && id(preset)
      ))
  )
    throw new Error('類型版面指定不合法')
  if (
    v.stylePresets !== undefined &&
    (!Array.isArray(v.stylePresets) ||
      v.stylePresets.length > 20 ||
      new Set(v.stylePresets.map((p) => p?.id)).size !== v.stylePresets.length ||
      new Set(
        v.stylePresets.map((p) =>
          typeof p?.name === 'string' ? p.name.trim().toLocaleLowerCase() : p
        )
      ).size !== v.stylePresets.length ||
      !v.stylePresets.every(
        (p) => obj(p) && id(p.id) && text(p.name, 40) && p.name.trim() && validStyle(p.style)
      ))
  )
    throw new Error('自訂樣式不合法或名稱重複')
  if (v.layoutPresets !== undefined) {
    if (
      !Array.isArray(v.layoutPresets) ||
      !v.layoutPresets.length ||
      v.layoutPresets.length > 30 ||
      new Set(v.layoutPresets.map((p) => p.id)).size !== v.layoutPresets.length ||
      new Set(
        v.layoutPresets.map((p) =>
          typeof p.name === 'string' ? p.name.toLocaleLowerCase() : p.name
        )
      ).size !== v.layoutPresets.length ||
      !v.layoutPresets.every((p) => obj(p) && id(p.id) && text(p.name, 100) && p.name.trim())
    )
      throw new Error('版面方案不合法或名稱重複')
    if (!id(v.activeLayoutId) || !v.layoutPresets.some((p) => p.id === v.activeLayoutId))
      throw new Error('作用中方案不存在')
    for (const preset of v.layoutPresets)
      validateProject({
        ...v,
        cells: preset.cells,
        layoutPresets: undefined,
        activeLayoutId: undefined,
        contentCells: undefined,
      })
  } else if (v.activeLayoutId !== undefined) throw new Error('方案清單不存在')
  if (v.contentCells !== undefined) {
    if (!obj(v.contentCells) || !Object.keys(v.contentCells).every((k) => /^[a-z]{2,20}$/.test(k)))
      throw new Error('內容模板不合法')
    for (const cells of Object.values(v.contentCells))
      validateProject({ ...v, cells, contentCells: undefined })
  }
  if (
    v.traversal !== undefined &&
    (!obj(v.traversal) ||
      !Object.entries(v.traversal).every(([k, b]) => id(k) && typeof b === 'boolean'))
  )
    throw new Error('遍歷偏好不合法')
  if (
    v.actionTemplates !== undefined &&
    (!Array.isArray(v.actionTemplates) ||
      v.actionTemplates.length > 30 ||
      new Set(v.actionTemplates.map((t) => t.id)).size !== v.actionTemplates.length ||
      !v.actionTemplates.every(
        (t) =>
          obj(t) &&
          id(t.id) &&
          text(t.label, 100) &&
          ['exe', 'folder', 'file-app', 'url', 'shortcut'].includes(t.kind) &&
          /^#[0-9a-f]{6}$/i.test(t.color)
      ))
  )
    throw new Error('任務版型不合法')
  if (
    v.savedSearches !== undefined &&
    (!Array.isArray(v.savedSearches) ||
      v.savedSearches.length > 100 ||
      !v.savedSearches.every(
        (s) =>
          obj(s) &&
          id(s.id) &&
          text(s.name, 100) &&
          (s.queryAst === undefined || validStableQuery(s.queryAst)) &&
          text(s.query, 2000)
      ))
  )
    throw new Error('常用搜尋不合法')
  for (let i = 0; i < v.cells.length; i++)
    for (let j = i + 1; j < v.cells.length; j++) {
      const a = v.cells[i].grid,
        b = v.cells[j].grid
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y)
        throw new Error('組件不能重疊')
    }
}
export function defaultCells(makeId: () => string, attributeId?: string): Cell[] {
  return (
    ['name', 'path', ...(attributeId ? ['field-text' as const] : []), 'open-folder'] as const
  ).map((kind, y) => ({
    cellId: makeId(),
    kind,
    ...(kind === 'field-text' ? { attributeId } : {}),
    grid: { x: 0, y, w: 12, h: 1 },
    style: { textColor: '#e4e6e8', backgroundColor: 'transparent' },
  }))
}
export const MAX_FALLBACKS = 5
// The type a field cell shows.
const kindTypes: Record<string, string> = {
  'field-text': 'string',
  'field-tags': 'tags',
  'field-number': 'number',
  'field-date': 'datetime',
  'field-boolean': 'boolean',
  'field-enum': 'enum',
  'field-url': 'url',
  'field-date-only': 'date',
}
function validateFieldGroups(v: Project) {
  const groups = v.fieldGroups
  if (groups === undefined) {
    if (v.cells.some((cell) => cell.groupId) || v.groupSources !== undefined)
      throw new Error('欄位群組不存在')
    return
  }
  const typeOf = (attributeId: string) =>
    v.fieldBindings.find((field) => field.attributeId === attributeId)?.type
  const aliases = new Set(v.fieldBindings.map((field) => field.alias.trim().toLocaleLowerCase()))
  if (
    !Array.isArray(groups) ||
    groups.length > 100 ||
    !groups.every(
      (g) =>
        obj(g) &&
        id(g.groupId) &&
        text(g.name, 100) &&
        g.name.trim().length > 0 &&
        !aliases.has(g.name.trim().toLocaleLowerCase()) &&
        Array.isArray(g.memberIds) &&
        g.memberIds.length >= 1 &&
        g.memberIds.length <= MAX_GROUP_MEMBERS &&
        g.memberIds.every((member) => id(member) && typeOf(member) !== undefined) &&
        g.memberIds.every((member) => compatibleFieldTypes(typeOf(g.memberIds[0]), typeOf(member)))
    ) ||
    new Set(groups.map((g) => g.groupId)).size !== groups.length ||
    new Set(groups.map((g) => g.name.trim().toLocaleLowerCase())).size !== groups.length ||
    new Set(groups.flatMap((g) => g.memberIds)).size !==
      groups.reduce((sum, g) => sum + g.memberIds.length, 0)
  )
    throw new Error('欄位群組不合法：成員須存在、型別相容、只屬一個群組，名稱不可重複')
  for (const cell of v.cells)
    if (cell.groupId) {
      const group = groups.find((g) => g.groupId === cell.groupId)
      if (
        !group ||
        !cell.attributeId ||
        !group.memberIds.includes(cell.attributeId) ||
        !compatibleFieldTypes(kindTypes[cell.kind], typeOf(group.memberIds[0]))
      )
        throw new Error('組件顯示的欄位群組不存在或型別不相容')
    }
  const sources = v.groupSources
  if (
    sources !== undefined &&
    (!obj(sources) ||
      Object.keys(sources).length > 50000 ||
      !Object.entries(sources).every(
        ([folder, chosen]) =>
          id(folder) &&
          obj(chosen) &&
          Object.entries(chosen).every(
            ([groupId, member]) =>
              id(groupId) &&
              groups.some((g) => g.groupId === groupId && g.memberIds.includes(member as string))
          )
      ))
  )
    throw new Error('資料夾指定的群組來源不合法')
}
// Removing a field from layouts: cells that show it alone and cells whose condition reads it go away,
// a cell with fallbacks moves on to its next field, and a fallback entry is simply dropped.
export function cellsWithoutField(cells: Cell[], attributeId: string): Cell[] {
  return cells.flatMap((cell) => {
    if (cell.condition?.attributeId === attributeId) return []
    const rest = (cell.fallbackIds ?? []).filter((id) => id !== attributeId)
    if (cell.attributeId === attributeId) {
      if (!rest.length) return []
      const { fallbackIds: _drop, ...plain } = cell
      return [
        {
          ...plain,
          attributeId: rest[0],
          ...(rest.length > 1 ? { fallbackIds: rest.slice(1) } : {}),
        },
      ]
    }
    if (rest.length === (cell.fallbackIds ?? []).length) return [cell]
    const { fallbackIds: _drop, ...plain } = cell
    return [rest.length ? { ...plain, fallbackIds: rest } : plain]
  })
}
export function fieldValue(row: FolderRow, attributeId: string): unknown {
  const override = row.record?.projectOverrides[row.projectId]?.find(
    (a) => a.attributeId === attributeId
  )
  return (override ?? row.record?.attributes.find((a) => a.attributeId === attributeId))?.value
}

// Group cells were removed; a project saved while they existed loads without them (children go with the group).
export function withoutGroupCells<T>(value: T): T {
  if (Array.isArray(value))
    return value
      .filter((item) => !(obj(item) && item.kind === 'group'))
      .map((item) => withoutGroupCells(item)) as T
  if (obj(value))
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, withoutGroupCells(item)])
    ) as T
  return value
}
