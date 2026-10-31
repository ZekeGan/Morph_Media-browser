import type { ActionTemplate, FolderDetails } from './explorer'
import type { Notice } from './notifications'
import { imageTypes } from './images'
import { httpUrl, validFieldValue } from './fields'
import { validStableQuery, type StableQuery } from './query'
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
  | 'group'
export interface Cell {
  cellId: string
  kind: CellKind
  attributeId?: string
  grid: { x: number; y: number; w: number; h: number }
  style: { textColor: string; backgroundColor: string }
  text?: string
  systemInfo?: 'category' | 'files' | 'size'
  presentation?: 'badge' | 'rating' | 'progress'
  imageFit?: 'contain' | 'cover'
  // Only on kind 'group': one level of child cells laid out on the group's own 12-column grid.
  cells?: Cell[]
  maximum?: number
  copyValue?: boolean
  condition?: {
    attributeId: string
    operator: 'set' | 'unset' | 'equals' | 'not-equals'
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
  legacySourceId?: string
  kind: 'media-viewer.project'
  schemaVersion: 1
  projectId: string
  rootFolderId: string
  revision: number
  name: string
  mediaCategory: string
  depth: { mode: 'through' | 'exact'; level: number }
  fieldBindings: { alias: string; attributeId: string; type: string; options?: string[] }[]
  cells: Cell[]
  list: { itemsPerRow: number; pageSize: number }
  excludedRelativePaths: string[]
  contentCells?: Record<string, Cell[]>
  actionTemplates?: ActionTemplate[]
  mediaSourceCategory?: 'album' | 'video' | 'music' | 'other'
  layoutPresets?: { id: string; name: string; cells: Cell[] }[]
  activeLayoutId?: string
  folderLayouts?: Record<string, string>
  scanAll?: boolean
  videoAutoplay?: boolean
  videoAutoNext?: boolean
  cardView?: { mode: 'multi' | 'single'; level: number | 'all' }
  traversal?: Record<string, boolean>
  savedSearches?: { id: string; name: string; query: string; queryAst?: StableQuery }[]
}
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
  legacyAvailable: boolean
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
  projects: { projectId: string; name: string; root: string }[]
  skipped: string[]
  recoveryPath: string
}
export interface ProjectInput {
  name: string
  mediaCategory: string
  depth: Project['depth']
  scanAll?: boolean
}
export interface LegacyPreview {
  token: string
  projects: { id: string; name: string; root: string; values: number }[]
  warnings: string[]
}
export interface LegacyImportResult {
  imported: string[]
  warnings: string[]
  backup: string
}
export type Request =
  | {
      action:
        | 'snapshot'
        | 'scan'
        | 'cancelScan'
        | 'link'
        | 'cleanupAllPreview'
        | 'legacyPreview'
        | 'chooseRoot'
    }
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
  | { action: 'legacyImport'; token: string; ids: string[]; depth: Project['depth'] }
export interface Response {
  snapshot: Snapshot
  preview?: CleanupPreview
  cleanup?: CleanupResult
  removalPreview?: ProjectRemovalPreview
  removal?: CleanupResult
  fullRemovalPreview?: FullRemovalPreview
  fieldDeletionPreview?: FieldDeletionPreview
  recoveryPath?: string
  legacy?: LegacyPreview
  notice?: Notice
  cancelled?: boolean
  rootSelection?: { token: string; path: string }
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
        f.options.every((option: unknown) => text(option, 100) && option.trim().length > 0)))
  )
}

export const allCells = (cells: Cell[]): Cell[] =>
  cells.flatMap((c) => (c.kind === 'group' ? [c, ...(c.cells ?? [])] : [c]))
const overlaps = (cells: { grid: Cell['grid'] }[]) =>
  cells.some((a, i) =>
    cells
      .slice(i + 1)
      .some(
        ({ grid: b }) =>
          a.grid.x < b.x + b.w &&
          a.grid.x + a.grid.w > b.x &&
          a.grid.y < b.y + b.h &&
          a.grid.y + a.grid.h > b.y
      )
  )
function validGroup(c: Record<string, unknown>): boolean {
  const cells = c.cells as unknown,
    grid = c.grid as Cell['grid'] | undefined
  return (
    Array.isArray(cells) &&
    cells.length <= 50 &&
    !!grid &&
    cells.every(
      (child) =>
        validCell(child) &&
        (child as Cell).kind !== 'group' &&
        (child as Cell).grid.y + (child as Cell).grid.h <= grid.h
    ) &&
    !overlaps(cells as Cell[])
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
      'group',
    ].includes(c.kind) &&
    (c.kind === 'group' ? validGroup(c) : c.cells === undefined) &&
    (c.text === undefined || text(c.text, 10000)) &&
    (c.systemInfo === undefined || ['category', 'files', 'size'].includes(c.systemInfo)) &&
    (c.presentation === undefined ||
      (c.presentation === 'badge' && ['field-enum', 'field-boolean'].includes(c.kind)) ||
      (['rating', 'progress'].includes(c.presentation) && c.kind === 'field-number')) &&
    (c.imageFit === undefined ||
      (['contain', 'cover'].includes(c.imageFit) && ['image', 'game-cover'].includes(c.kind))) &&
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
        ['set', 'unset', 'equals', 'not-equals'].includes(c.condition.operator) &&
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
    obj(c.style) &&
    /^#[0-9a-f]{6}$/i.test(c.style.textColor) &&
    (c.style.backgroundColor === 'transparent' || /^#[0-9a-f]{6}$/i.test(c.style.backgroundColor))
  )
}

function validTargetEntry([k, t]: [string, unknown]): boolean {
  return (
    id(k) &&
    obj(t) &&
    ['exe', 'folder', 'file-app', 'url'].includes(t.kind) &&
    text(t.path, 10000) &&
    typeof t.relative === 'boolean' &&
    (!t.relative || relative(t.path)) &&
    Array.isArray(t.args) &&
    t.args.length <= 100 &&
    t.args.every((a: unknown) => text(a, 10000) && !String(a).includes('\0')) &&
    (t.kind !== 'url' || t.args.length === 0) &&
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
  if (
    !obj(v) ||
    v.kind !== 'media-viewer.folder' ||
    v.schemaVersion !== 1 ||
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
  if (!obj(v) || v.schemaVersion !== 1 || JSON.stringify(v).length > 2000000)
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
  if (obj(v) && v.videoAutoplay !== undefined && typeof v.videoAutoplay !== 'boolean')
    throw new Error('影片自動播放設定不合法')
  if (obj(v) && v.videoAutoNext !== undefined && typeof v.videoAutoNext !== 'boolean')
    throw new Error('影片接續播放設定不合法')
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
    v.schemaVersion !== 1 ||
    !id(v.projectId) ||
    !id(v.rootFolderId) ||
    !integer(v.revision, 1, Number.MAX_SAFE_INTEGER) ||
    !text(v.name, 100) ||
    !v.name.trim() ||
    !text(v.mediaCategory, 40) ||
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
    !v.cells.every(validCell) ||
    allCells(v.cells).length > 50
  )
    throw new Error('專案設定不合法或版本不支援')
  if (
    new Set(allCells(v.cells).map((c) => c.cellId)).size !== allCells(v.cells).length ||
    new Set(v.fieldBindings.map((f) => f.alias.toLowerCase())).size !== v.fieldBindings.length
  )
    throw new Error('組件 ID 或欄位別名重複')
  if (
    v.mediaCategory !== 'game' &&
    [
      ...allCells(v.cells),
      ...(Array.isArray(v.layoutPresets)
        ? v.layoutPresets.flatMap((p: { cells?: unknown }) =>
            Array.isArray(p?.cells) ? p.cells : []
          )
        : []),
      ...(obj(v.contentCells)
        ? Object.values(v.contentCells).flatMap((cells) => (Array.isArray(cells) ? cells : []))
        : []),
    ].some((c: unknown) => obj(c) && c.kind === 'game-cover')
  )
    throw new Error('遊戲封面組件只能用於遊戲專案')
  for (const cell of allCells(v.cells))
    if (cell.condition) {
      const condition = cell.condition
      const field = v.fieldBindings.find((field) => field.attributeId === condition.attributeId)
      if (
        !field ||
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
  if (
    v.mediaSourceCategory !== undefined &&
    !['album', 'video', 'music', 'other'].includes(v.mediaSourceCategory)
  )
    throw new Error('媒體來源分類不合法')
  if (v.contentCells !== undefined) {
    if (
      !obj(v.contentCells) ||
      !Object.keys(v.contentCells).every((k) =>
        ['manga', 'album', 'game', 'video', 'other'].includes(k)
      )
    )
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
          ['exe', 'folder', 'file-app', 'url'].includes(t.kind) &&
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
export function fieldValue(row: FolderRow, attributeId: string): unknown {
  const override = row.record?.projectOverrides[row.projectId]?.find(
    (a) => a.attributeId === attributeId
  )
  return (override ?? row.record?.attributes.find((a) => a.attributeId === attributeId))?.value
}
