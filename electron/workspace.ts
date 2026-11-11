import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { atomicJson, missing, readJson, safePath } from './files'
import {
  defaultWorkspace,
  isPlayOrder,
  sectionIds,
  sectionProjects,
  type WorkspaceCommand,
  type WorkspacePrefs,
  type WorkspaceState,
} from '../shared/workspace'
import { isThemeId } from '../shared/themes'
import { isLocaleId, systemLocale } from '../shared/locales'
import { exportSettings, importSettings, mergeSettings } from './settings-package'
import { checkNotNewer, FORMAT_VERSION, isNewerFormat, upgradeFormat } from '../shared/upgrade'

const key = (v: unknown): v is string =>
  typeof v === 'string' &&
  /^[\w-]{1,100}$/.test(v) &&
  !['__proto__', 'constructor', 'prototype'].includes(v)
const integer = (v: unknown, min: number, max = Number.MAX_SAFE_INTEGER) =>
  Number.isInteger(v) && Number(v) >= min && Number(v) <= max
const object = (v: unknown): v is Record<string, any> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
function groupName(v: unknown): string {
  if (typeof v !== 'string' || !v.trim() || v.trim().length > 60 || /[\x00-\x1f]/.test(v))
    throw new Error('群組名稱需為 1～60 個字，不能含控制字元')
  return v.trim()
}
export function validateWorkspace(v: unknown): asserts v is WorkspacePrefs {
  checkNotNewer('workspace', v)
  if (
    !object(v) ||
    v.schemaVersion !== FORMAT_VERSION.workspace ||
    !integer(v.revision, 0) ||
    !integer(v.nextOrder, 1) ||
    !integer(v.sidebarWidth, 200, 360) ||
    typeof v.sidebarHidden !== 'boolean' ||
    !object(v.collapsed) ||
    typeof v.collapsed.favorites !== 'boolean' ||
    typeof v.collapsed.recent !== 'boolean' ||
    !Array.isArray(v.groups) ||
    v.groups.length > 1000 ||
    !v.groups.every(
      (g) =>
        object(g) &&
        key(g.id) &&
        typeof g.name === 'string' &&
        groupName(g.name) === g.name &&
        typeof g.collapsed === 'boolean'
    ) ||
    !object(v.projects) ||
    Object.keys(v.projects).length > 50000
  )
    throw new Error('側欄設定格式不合法')
  if (v.theme !== undefined && !isThemeId(v.theme)) throw new Error('主題設定不合法')
  if (v.locale !== undefined && !isLocaleId(v.locale)) throw new Error('語言設定不合法')
  if (
    v.fileVisibility !== undefined &&
    (!object(v.fileVisibility) ||
      typeof v.fileVisibility.hidden !== 'boolean' ||
      typeof v.fileVisibility.dotfiles !== 'boolean')
  )
    throw new Error('檔案顯示設定不合法')
  if (
    v.videoAudio !== undefined &&
    (!object(v.videoAudio) ||
      !Number.isFinite(v.videoAudio.volume) ||
      v.videoAudio.volume < 0 ||
      v.videoAudio.volume > 1 ||
      typeof v.videoAudio.muted !== 'boolean')
  )
    throw new Error('影片音量設定不合法')
  if (v.playOrder !== undefined && !isPlayOrder(v.playOrder)) throw new Error('播放順序設定不合法')
  const groups = new Set(v.groups.map((g) => g.id)),
    names = new Set(v.groups.map((g) => g.name.toLocaleLowerCase()))
  if (
    groups.size !== v.groups.length ||
    names.size !== v.groups.length ||
    !Object.entries(v.projects).every(
      ([id, p]) =>
        key(id) &&
        object(p) &&
        (p.groupId === null || groups.has(p.groupId)) &&
        typeof p.favorite === 'boolean' &&
        integer(p.addedOrder, 1) &&
        p.addedOrder < v.nextOrder
    )
  )
    throw new Error('側欄群組或專案引用不合法')
  if (v.collapsed.unclassified !== undefined && typeof v.collapsed.unclassified !== 'boolean')
    throw new Error('未分類設定不合法')
  if (
    v.sections !== undefined &&
    (!Array.isArray(v.sections) ||
      new Set(v.sections).size !== v.sections.length ||
      !v.sections.every((id) => ['favorites', 'unclassified', ...groups].includes(id)))
  )
    throw new Error('群組順序不合法')
  if (
    v.projectOrder !== undefined &&
    (!object(v.projectOrder) ||
      !Object.entries(v.projectOrder).every(
        ([id, list]) =>
          key(id) &&
          Array.isArray(list) &&
          list.length <= 50000 &&
          new Set(list).size === list.length &&
          list.every(key)
      ))
  )
    throw new Error('專案順序不合法')
  if (
    v.browse !== undefined &&
    (!object(v.browse) ||
      !Object.entries(v.browse).every(
        ([id, b]) =>
          key(id) &&
          object(b) &&
          ['CARD', 'TABLE', 'TREE'].includes(b.mode) &&
          typeof b.location === 'string' &&
          b.location.length <= 10000 &&
          integer(b.panelWidth, 280, 1000) &&
          object(b.widths) &&
          Object.entries(b.widths).every(([k, w]) => key(k) && integer(w, 80, 1000)) &&
          (b.scroll === undefined ||
            (typeof b.scroll === 'number' && b.scroll >= 0 && b.scroll < 1e9)) &&
          (b.viewport === undefined ||
            (object(b.viewport) &&
              ['x', 'y', 'zoom'].every(
                (k) => typeof b.viewport[k] === 'number' && Number.isFinite(b.viewport[k])
              ) &&
              b.viewport.zoom >= 0.05 &&
              b.viewport.zoom <= 4))
      ))
  )
    throw new Error('瀏覽設定不合法')
  if (
    v.browse &&
    Object.values(v.browse).some(
      (b) =>
        !object(b) ||
        (b.contentMode !== undefined && !['folders', 'files'].includes(b.contentMode)) ||
        (b.filePresentation !== undefined &&
          !['tiles', 'groups', 'list'].includes(b.filePresentation)) ||
        (b.fileScope !== undefined && !['current', 'descendants'].includes(b.fileScope)) ||
        (b.gameFilter !== undefined && !['all', 'boundaries'].includes(b.gameFilter)) ||
        (b.media !== undefined &&
          (!object(b.media) ||
            (b.media.scope !== undefined && !['current', 'descendants'].includes(b.media.scope)) ||
            (b.media.filter !== undefined &&
              !['all', 'video', 'image', 'audio', 'other'].includes(b.media.filter)) ||
            (b.media.view !== undefined && !['masonry', 'tiles', 'list'].includes(b.media.view)) ||
            (b.media.grouped !== undefined && typeof b.media.grouped !== 'boolean')))
    )
  )
    throw new Error('檔案總覽偏好不合法')
  if (
    v.browse &&
    Object.values(v.browse).some(
      (b) =>
        !object(b) ||
        (b.scrolls !== undefined &&
          (!object(b.scrolls) ||
            !Object.entries(b.scrolls).every(
              ([mode, value]) =>
                ['CARD', 'TREE', 'TABLE'].includes(mode) &&
                typeof value === 'number' &&
                value >= 0 &&
                value < 1e9
            )))
    )
  )
    throw new Error('捲動位置不合法')
  if (
    v.browse &&
    Object.values(v.browse).some(
      (b) =>
        !object(b) ||
        (b.panelVisible !== undefined && typeof b.panelVisible !== 'boolean') ||
        (b.settingsDock !== undefined && typeof b.settingsDock !== 'boolean') ||
        (b.detailId !== undefined && !key(b.detailId)) ||
        (b.locations !== undefined &&
          (!object(b.locations) ||
            !Object.entries(b.locations).every(
              ([k, p]) =>
                ['CARD', 'TREE', 'TABLE'].includes(k) && typeof p === 'string' && p.length <= 10000
            )))
    )
  )
    throw new Error('瀏覽位置或內容面板設定不合法')
  if (
    v.browse &&
    Object.values(v.browse).some(
      (b) =>
        !object(b) ||
        (b.treeCollapsed !== undefined &&
          (!Array.isArray(b.treeCollapsed) ||
            b.treeCollapsed.length > 50000 ||
            new Set(b.treeCollapsed).size !== b.treeCollapsed.length ||
            !b.treeCollapsed.every(key)))
    )
  )
    throw new Error('樹狀收合設定不合法')
  if (
    v.browse &&
    Object.values(v.browse).some(
      (b) =>
        !object(b) ||
        (b.hiddenColumns !== undefined &&
          (!Array.isArray(b.hiddenColumns) ||
            b.hiddenColumns.length > 1002 ||
            b.hiddenColumns.includes('name') ||
            new Set(b.hiddenColumns).size !== b.hiddenColumns.length ||
            !b.hiddenColumns.every(key)))
    )
  )
    throw new Error('表格欄位顯示不合法')
  if (
    v.browse &&
    Object.values(v.browse).some(
      (b) =>
        !object(b) ||
        (b.columnOrder !== undefined &&
          (!Array.isArray(b.columnOrder) ||
            b.columnOrder.length > 1003 ||
            new Set(b.columnOrder).size !== b.columnOrder.length ||
            !b.columnOrder.every(key)))
    )
  )
    throw new Error('表格欄位順序不合法')
}
// Settings backups are restore points made before an import or a restore; only the newest ones stay (the list shows
// 30 anyway). Only files named like a backup are ever touched.
export async function pruneSettingBackups(root: string, keep = 30) {
  const dir = path.join(root, 'workspace-backups')
  await safePath(root, dir)
  const names = (await fs.readdir(dir).catch(() => [] as string[])).filter((name) =>
      /^[0-9a-f-]{36}\.json$/i.test(name)
    ),
    dated = []
  for (const name of names) {
    const file = path.join(dir, name)
    await safePath(root, file)
    dated.push({ file, time: (await fs.stat(file)).mtimeMs })
  }
  dated.sort((a, b) => b.time - a.time)
  for (const old of dated.slice(keep)) await fs.unlink(old.file).catch(() => {})
}
export class WorkspaceStore {
  readonly file: string
  private prefs = defaultWorkspace()
  private error?: string
  private onDisk = false
  private tail: Promise<unknown> = Promise.resolve()
  private importPlan?: { token: string; revision: number; prefs: WorkspacePrefs }
  constructor(
    private root: string,
    private languages?: readonly string[]
  ) {
    this.file = path.join(root, 'workspace-ui.json')
  }
  async init() {
    await fs.mkdir(this.root, { recursive: true })
    try {
      await safePath(this.root, this.file)
      const raw = await readJson(this.file),
        value = upgradeFormat('workspace', raw)
      validateWorkspace(value)
      this.prefs = value
      this.onDisk = true
      // App data is upgraded once at start-up, after the file as the older version wrote it is kept.
      if (value !== raw) {
        await this.keepBeforeUpgrade()
        await this.commit(structuredClone(value))
      }
    } catch (error) {
      // Settings a newer version wrote stay untouched: they are shown, but nothing is saved over them.
      if (isNewerFormat(error)) this.error = (error as Error).message
      else if (!missing(error))
        this.error = `側欄設定無法讀取，原檔保留；暫用預設且停止保存。${String(error)}`
    }
    if (!this.error && !this.prefs.locale && this.languages)
      await this.commit({ ...this.prefs, locale: systemLocale(this.languages) })
  }
  private run<T>(fn: () => Promise<T>) {
    const next = this.tail.then(fn)
    this.tail = next.catch(() => {})
    return next
  }
  private state(): WorkspaceState {
    return { prefs: structuredClone(this.prefs), ...(this.error ? { error: this.error } : {}) }
  }
  private sync(next: WorkspacePrefs, ids: string[]) {
    for (const id of ids) {
      if (!key(id)) throw new Error('專案身分不合法')
      if (!Object.hasOwn(next.projects, id))
        next.projects[id] = { groupId: null, favorite: false, addedOrder: next.nextOrder++ }
    }
  }
  private async commit(next: WorkspacePrefs) {
    next.revision = this.prefs.revision + 1
    validateWorkspace(next)
    await safePath(this.root, this.file)
    await atomicJson(this.file, next, this.onDisk ? this.prefs.revision : undefined)
    this.prefs = next
    this.onDisk = true
  }
  // The file as an older version wrote it, kept beside the setting backups before the start-up upgrade.
  private async keepBeforeUpgrade() {
    const dir = path.join(this.root, 'workspace-backups')
    await fs.mkdir(dir, { recursive: true })
    const copy = path.join(dir, `before-upgrade-${Date.now()}.json`)
    await safePath(this.root, copy)
    await fs.copyFile(this.file, copy, fs.constants.COPYFILE_EXCL)
  }
  private async backup() {
    const id = randomUUID(),
      dir = path.join(this.root, 'workspace-backups'),
      file = path.join(dir, id + '.json')
    await safePath(this.root, dir)
    await fs.mkdir(dir, { recursive: true })
    await safePath(this.root, file)
    await atomicJson(file, {
      kind: 'media-viewer.settings-backup',
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      prefs: this.prefs,
    })
    await pruneSettingBackups(this.root).catch(() => {})
    return id
  }
  read(ids: string[]): Promise<WorkspaceState> {
    return this.run(async () => {
      const next = structuredClone(this.prefs)
      this.sync(next, ids)
      if (this.error) {
        this.prefs = next
        return this.state()
      }
      if (next.nextOrder !== this.prefs.nextOrder) await this.commit(next)
      return this.state()
    })
  }
  update(command: WorkspaceCommand, ids: string[]): Promise<WorkspaceState> {
    return this.run(async () => {
      if (this.error) throw new Error(this.error)
      if (!object(command)) throw new Error('無效的側欄操作')
      const next = structuredClone(this.prefs)
      this.sync(next, ids)
      const group = (id: string) => {
        const g = next.groups.find((g) => g.id === id)
        if (!g) throw new Error('群組不存在')
        return g
      }
      const project = (id: string) => {
        if (!ids.includes(id) || !Object.hasOwn(next.projects, id)) throw new Error('專案尚未連結')
        return next.projects[id]
      }
      const bool = (v: unknown) => {
        if (typeof v !== 'boolean') throw new Error('設定值必須為布林')
        return v
      }
      const name = (v: unknown, except?: string) => {
        const n = groupName(v)
        if (
          next.groups.some(
            (g) => g.id !== except && g.name.toLocaleLowerCase() === n.toLocaleLowerCase()
          )
        )
          throw new Error('群組名稱已存在')
        return n
      }
      const orderProject = (id: string, section: string, before?: string) => {
        project(id)
        const members = sectionProjects(ids, next, section)
        if (
          !members.includes(id) ||
          (before !== undefined && (!members.includes(before) || before === id))
        )
          throw new Error('排序目標不合法')
        const list = members.filter((v) => v !== id)
        list.splice(before ? list.indexOf(before) : list.length, 0, id)
        next.projectOrder ??= {}
        next.projectOrder[section] = list
      }
      switch (command.action) {
        case 'exportPackage':
          return { ...this.state(), settingsPackage: exportSettings(next) }
        case 'previewPackage': {
          const incoming = importSettings(command.value)
          validateWorkspace(incoming)
          const token = randomUUID()
          this.importPlan = { token, revision: this.prefs.revision, prefs: incoming }
          const current = exportSettings(next).prefs,
            value = exportSettings(incoming).prefs
          const changes = Object.keys(value)
            .filter(
              (field) =>
                JSON.stringify(current[field as keyof WorkspacePrefs]) !==
                JSON.stringify(value[field as keyof WorkspacePrefs])
            )
            .map((field) => ({
              field,
              current: current[field as keyof WorkspacePrefs],
              incoming: value[field as keyof WorkspacePrefs],
            }))
          return { ...this.state(), importPreview: { token, changes } }
        }
        case 'applyPackage': {
          const plan = this.importPlan
          if (
            !plan ||
            plan.token !== command.token ||
            plan.revision !== this.prefs.revision ||
            !['merge', 'replace'].includes(command.mode)
          )
            throw new Error('設定匯入預覽已失效，請重新預覽')
          const imported = mergeSettings(next, plan.prefs, command.mode)
          this.sync(imported, ids)
          validateWorkspace(imported)
          const backupId = await this.backup()
          await this.commit(imported)
          this.importPlan = undefined
          return { ...this.state(), backupId }
        }
        case 'restorePackage': {
          if (typeof command.backupId !== 'string' || !/^[0-9a-f-]{36}$/i.test(command.backupId))
            throw new Error('復原身分不合法')
          const file = path.join(this.root, 'workspace-backups', command.backupId + '.json')
          await safePath(this.root, file)
          const saved = await readJson(file)
          if (
            !object(saved) ||
            saved.kind !== 'media-viewer.settings-backup' ||
            saved.schemaVersion !== 1
          )
            throw new Error('復原備份不合法')
          const restored = structuredClone(upgradeFormat('workspace', saved.prefs))
          validateWorkspace(restored)
          this.sync(restored, ids)
          const backupId = await this.backup()
          await this.commit(restored)
          this.importPlan = undefined
          return { ...this.state(), backupId }
        }
        case 'listBackups': {
          const dir = path.join(this.root, 'workspace-backups')
          await safePath(this.root, dir)
          const names = await fs.readdir(dir).catch((error) => {
              if (missing(error)) return []
              throw error
            }),
            backups = []
          for (const name of names
            .filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name))
            .slice(-1000)) {
            const file = path.join(dir, name)
            await safePath(this.root, file)
            const stat = await fs.stat(file)
            backups.push({ id: name.slice(0, -5), createdAt: stat.mtime.toISOString() })
          }
          return {
            ...this.state(),
            backups: backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 30),
          }
        }
        case 'fileVisibility':
          next.fileVisibility = {
            hidden: bool(command.value?.hidden),
            dotfiles: bool(command.value?.dotfiles),
          }
          break
        case 'videoAudio':
          if (!object(command.value)) throw new Error('影片音量設定不合法')
          next.videoAudio = structuredClone(command.value)
          break
        case 'playOrder':
          if (!isPlayOrder(command.value)) throw new Error('播放順序設定不合法')
          next.playOrder = command.value
          break
        case 'appearance':
          if (!isThemeId(command.theme) || !isLocaleId(command.locale))
            throw new Error('外觀設定不合法')
          next.theme = command.theme
          next.locale = command.locale
          break
        case 'browse': {
          project(command.projectId)
          const value = structuredClone(command.value)
          // Pointer coordinates can be fractional at Windows display scaling.
          if (object(value)) {
            if (
              typeof value.panelWidth === 'number' &&
              Number.isFinite(value.panelWidth) &&
              value.panelWidth >= 280 &&
              value.panelWidth <= 1000
            )
              value.panelWidth = Math.round(value.panelWidth)
            if (object(value.widths))
              for (const [id, width] of Object.entries(value.widths))
                if (
                  typeof width === 'number' &&
                  Number.isFinite(width) &&
                  width >= 80 &&
                  width <= 1000
                )
                  value.widths[id] = Math.round(width)
          }
          next.browse ??= {}
          next.browse[command.projectId] = value
          break
        }
        case 'createGroup': {
          const ids = sectionIds(next),
            id = randomUUID()
          next.groups.push({ id, name: name(command.name), collapsed: false })
          ids.splice(ids.indexOf('unclassified'), 0, id)
          next.sections = ids
          break
        }
        case 'renameGroup':
          group(command.id).name = name(command.name, command.id)
          break
        case 'removeGroup':
          group(command.id)
          next.groups = next.groups.filter((g) => g.id !== command.id)
          next.sections = sectionIds(next)
          if (next.projectOrder) delete next.projectOrder[command.id]
          for (const p of Object.values(next.projects))
            if (p.groupId === command.id) p.groupId = null
          break
        case 'collapseGroup':
          group(command.id).collapsed = bool(command.value)
          break
        case 'moveProject':
          if (command.groupId !== null) group(command.groupId)
          project(command.projectId).groupId = command.groupId
          orderProject(command.projectId, command.groupId ?? 'unclassified', command.beforeId)
          break
        case 'reorderSections': {
          const all = sectionIds(next)
          if (
            !Array.isArray(command.ids) ||
            command.ids.length !== all.length ||
            new Set(command.ids).size !== all.length ||
            !command.ids.every((id) => all.includes(id))
          )
            throw new Error('群組排序需包含全部群組且不可重複')
          next.sections = command.ids
          break
        }
        case 'reorderProject':
          if (!sectionIds(next).includes(command.sectionId)) throw new Error('群組不存在')
          orderProject(command.projectId, command.sectionId, command.beforeId)
          break
        case 'favorite':
          project(command.projectId).favorite = bool(command.value)
          break
        case 'collapseSection':
          if (!['favorites', 'unclassified'].includes(command.section)) throw new Error('未知區塊')
          next.collapsed[command.section] = bool(command.value)
          break
        case 'layout':
          if (command.sidebarWidth !== undefined) {
            if (!integer(command.sidebarWidth, 200, 360)) throw new Error('欄寬需為 200～360')
            next.sidebarWidth = command.sidebarWidth
          }
          if (command.sidebarHidden !== undefined) next.sidebarHidden = bool(command.sidebarHidden)
          break
        default:
          throw new Error('不支援的側欄操作')
      }
      await this.commit(next)
      return this.state()
    })
  }
}
