import { documentFile, type FolderDetails } from './explorer'
import { imageTypes } from './images'
import { compatibleFieldTypes, httpUrl, validFieldValue } from './fields'
import { validStableQuery } from './query'
import { checkNotNewer, FORMAT_VERSION } from './upgrade'
import { withOnlyCells } from './cellLists'
import {
  MAX_MORE_CONDITIONS,
  MAX_TEXT_RULES,
  cellConditions,
  MAX_GROUP_MEMBERS,
  MAX_FALLBACKS,
  type Attribute,
  type FolderRecord,
  type Project,
} from './modelTypes'

const obj = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
// R-319: a Locale Emulator profile GUID (the only form passed to LEProc.exe -runas).
export const localeProfileId = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v)
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

function conditionShape(c: unknown): boolean {
  return (
    obj(c) &&
    id(c.attributeId) &&
    ['set', 'unset', 'equals', 'not-equals', 'gt', 'lt', 'within', 'older'].includes(c.operator) &&
    (['set', 'unset'].includes(c.operator)
      ? c.value === undefined
      : ['within', 'older'].includes(c.operator)
        ? integer(c.value, 1, 36500)
        : typeof c.value === 'boolean' ||
          (typeof c.value === 'number' && Number.isFinite(c.value)) ||
          text(c.value, 10000))
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
    (f.trueLabel === undefined ||
      (f.type === 'boolean' && text(f.trueLabel, 20) && f.trueLabel.trim().length > 0)) &&
    (f.falseLabel === undefined ||
      (f.type === 'boolean' && text(f.falseLabel, 20) && f.falseLabel.trim().length > 0)) &&
    // Yes and no must read differently, or neither the card nor search could tell them apart.
    (f.trueLabel === undefined ||
      f.falseLabel === undefined ||
      f.trueLabel.trim().toLocaleLowerCase() !== f.falseLabel.trim().toLocaleLowerCase()) &&
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
    (c.systemInfo === undefined ||
      ['category', 'files', 'size', 'playTime', 'lastPlayed', 'readProgress', 'lastRead'].includes(
        c.systemInfo
      )) &&
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
    (c.condition === undefined || conditionShape(c.condition)) &&
    (c.moreConditions === undefined ||
      (c.condition !== undefined &&
        Array.isArray(c.moreConditions) &&
        c.moreConditions.length >= 1 &&
        c.moreConditions.length <= MAX_MORE_CONDITIONS &&
        c.moreConditions.every(conditionShape))) &&
    (c.conditionMode === undefined ||
      (c.conditionMode === 'any' && c.moreConditions !== undefined)) &&
    (c.textRules === undefined ||
      (c.kind === 'static-text' &&
        Array.isArray(c.textRules) &&
        c.textRules.length >= 1 &&
        c.textRules.length <= MAX_TEXT_RULES &&
        c.textRules.every(
          (rule: unknown) => obj(rule) && conditionShape(rule.when) && text(rule.text, 1000)
        ))) &&
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
    ['exe', 'folder', 'file-app', 'url', 'shortcut', 'file'].includes(t.kind) &&
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
    // A bundled file (manual, readme) opens with its default application from inside the game folder (R-306).
    (t.kind !== 'file' || (t.args.length === 0 && t.relative === true && documentFile(t.path))) &&
    (t.localeEmulator === undefined ||
      (t.kind === 'exe' &&
        (typeof t.localeEmulator === 'boolean' || localeProfileId(t.localeEmulator)))) &&
    (t.kind === 'file-app'
      ? obj(t.application) &&
        text(t.application.path, 10000) &&
        /\.exe$/i.test(t.application.path) &&
        typeof t.application.relative === 'boolean' &&
        (!t.application.relative || relative(t.application.path))
      : t.application === undefined)
  )
}

// R-282: a text book's place, kept under its file name inside the folder.
function validNovelEntry(name: string, p: unknown): boolean {
  const ratio = (value: unknown) => typeof value === 'number' && value >= 0 && value <= 1
  return (
    text(name, 255) &&
    !/[\\/\0]/.test(name) &&
    obj(p) &&
    Object.keys(p).every((k) =>
      ['chapter', 'position', 'percent', 'updated', 'bookmarks'].includes(k)
    ) &&
    integer(p.chapter, 0, 100000) &&
    ratio(p.position) &&
    ratio(p.percent) &&
    typeof p.updated === 'string' &&
    !Number.isNaN(Date.parse(p.updated)) &&
    (p.bookmarks === undefined ||
      (Array.isArray(p.bookmarks) &&
        p.bookmarks.length <= 500 &&
        p.bookmarks.every(
          (b: unknown) =>
            obj(b) &&
            Object.keys(b).length === 3 &&
            integer(b.chapter, 0, 100000) &&
            ratio(b.position) &&
            text(b.label, 200)
        )))
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
  if (
    v.shownExtras !== undefined &&
    (!Array.isArray(v.shownExtras) ||
      !v.shownExtras.every((x: unknown) => ['steam', 'store', 'save'].includes(x as string)) ||
      new Set(v.shownExtras).size !== v.shownExtras.length)
  )
    throw new Error('遊戲操作顯示設定不合法')
  if (v.kind !== undefined && !['game', 'book', 'media', 'general'].includes(v.kind))
    throw new Error('資料夾類型不合法')
  if (v.browseAs !== undefined && !['work', 'collection'].includes(v.browseAs))
    throw new Error('瀏覽方式不合法')
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
      (v.reading.webtoonWidth !== undefined && !integer(v.reading.webtoonWidth, 30, 100)) ||
      ['spread', 'rtl', 'firstSingle', 'webtoon', 'webtoonAsked'].some(
        (k) => v.reading[k] !== undefined && typeof v.reading[k] !== 'boolean'
      ))
  )
    throw new Error('閱讀設定不合法')
  if (v.targets && (!obj(v.targets) || !Object.entries(v.targets).every(validTargetEntry)))
    throw new Error('任務設定不合法')
  if (
    v.novels !== undefined &&
    (!obj(v.novels) ||
      Object.keys(v.novels).length > 10000 ||
      !Object.entries(v.novels).every(([name, p]) => validNovelEntry(name, p)))
  )
    throw new Error('小說閱讀紀錄不合法')
  if (
    v.saveFolder !== undefined &&
    (!obj(v.saveFolder) ||
      !text(v.saveFolder.path, 10000) ||
      typeof v.saveFolder.relative !== 'boolean' ||
      (v.saveFolder.relative && !relative(v.saveFolder.path)) ||
      // Outside the game it must be a local drive path; a network share would be contacted when opened.
      (!v.saveFolder.relative && !/^[A-Za-z]:[\\/]/.test(v.saveFolder.path)))
  )
    throw new Error('存檔資料夾設定不合法')
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
          (v.cardView.works !== undefined && typeof v.cardView.works !== 'boolean') ||
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
    for (const condition of cellConditions(cell)) {
      const field = v.fieldBindings.find((field) => field.attributeId === condition.attributeId)
      if (
        !field ||
        (['within', 'older'].includes(condition.operator) &&
          !['date', 'datetime'].includes(field.type)) ||
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
    for (const preset of v.layoutPresets) validateProject(withOnlyCells(v, preset.cells))
  } else if (v.activeLayoutId !== undefined) throw new Error('方案清單不存在')
  if (v.contentCover !== undefined && typeof v.contentCover !== 'boolean')
    throw new Error('內容模板封面設定不合法')
  if (v.bookPresets !== undefined) {
    if (
      !Array.isArray(v.bookPresets) ||
      !v.bookPresets.length ||
      v.bookPresets.length > 30 ||
      new Set(v.bookPresets.map((p) => p?.id)).size !== v.bookPresets.length ||
      new Set(
        v.bookPresets.map((p) => (typeof p?.name === 'string' ? p.name.toLocaleLowerCase() : p))
      ).size !== v.bookPresets.length ||
      !v.bookPresets.every((p) => obj(p) && id(p.id) && text(p.name, 100) && p.name.trim())
    )
      throw new Error('漫畫模板不合法或名稱重複')
    if (!id(v.bookPresetId) || !v.bookPresets.some((p) => p.id === v.bookPresetId))
      throw new Error('漫畫預設模板不存在')
    for (const preset of v.bookPresets) validateProject(withOnlyCells(v, preset.cells))
  } else if (v.bookPresetId !== undefined) throw new Error('漫畫模板清單不存在')
  if (
    v.folderBookPresets !== undefined &&
    (!obj(v.folderBookPresets) ||
      Object.keys(v.folderBookPresets).length > 50000 ||
      !Object.entries(v.folderBookPresets).every(([folder, preset]) => id(folder) && id(preset)))
  )
    throw new Error('資料夾漫畫模板指定不合法')
  if (v.contentCells !== undefined) {
    if (!obj(v.contentCells) || !Object.keys(v.contentCells).every((k) => /^[a-z]{2,20}$/.test(k)))
      throw new Error('內容模板不合法')
    for (const cells of Object.values(v.contentCells)) validateProject(withOnlyCells(v, cells))
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
          ['exe', 'folder', 'file-app', 'url', 'shortcut', 'file'].includes(t.kind) &&
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
