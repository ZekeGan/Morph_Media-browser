import { dateOrText } from '../shared/fields'
import { stabilizeQuery, type QueryField } from '../shared/query'
import { projectImageCells } from '../shared/layouts'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  DATA_DIR,
  defaultCells,
  validateFolder,
  validateProject,
  withoutGroupCells,
  type Project,
  type ProjectInput,
  type FolderRecord,
  type Snapshot,
  type ScanProgress,
  type CleanupPreview,
  type CleanupResult,
  type LinkedProject,
  type ProjectRemovalPreview,
} from '../shared/model'
import {
  atomicJson,
  ensureFolder,
  exists,
  folderFile,
  keyPath,
  message,
  missing,
  projectFile,
  readFolder,
  readJson,
  relPath,
  safePath,
  saveFolder,
  within,
} from './files'
import { detectGame, insideAppBundle } from './game-detection'
import { identifyImage } from '../shared/images'
import type { FieldDeletionPreview, FullRemovalPreview } from '../shared/model'
import { managedTree, type Change, type ManagedFile } from './maintenance'
import * as fieldRemovalFns from './library-field-removal'
import * as removalFns from './library-removal'
import * as exportFns from './library-export'
import * as cleanupFns from './library-cleanup'
import * as scanFns from './library-scan'
import { isNewerFormat } from '../shared/upgrade'
export interface PlanEntry {
  dir: string
  record: FolderRecord
  files: { path: string; hash: string }[]
}
interface Plan {
  preview: CleanupPreview
  entries: PlanEntry[]
  rowId?: string
  projectId?: string
}
export class Library {
  refs: { projectId: string; root: string }[] = []
  plans = new Map<string, Plan>()
  removalPlans = new Map<
    string,
    {
      preview: ProjectRemovalPreview
      root: string
      records: { dir: string; record: FolderRecord }[]
      files: { path: string; hash: string }[]
      definitions: string[]
      rootFiles?: { path: string; hash: string }[]
    }
  >()
  fieldPlans = new Map<
    string,
    {
      preview: FieldDeletionPreview
      changes: Change[]
      guards: ManagedFile[]
      refs: string
      scope: string
      absent: string[]
    }
  >()
  fullPlans = new Map<
    string,
    {
      preview: FullRemovalPreview
      tree: Awaited<ReturnType<typeof managedTree>>
      refs: string
      guards: ManagedFile[]
      absent: string[]
    }
  >()
  cancelled = false
  hiddenKnown = new Set<string>()
  importPlans = new Map<string, exportFns.ImportPlan>()
  tail: Promise<unknown> = Promise.resolve()
  state: Snapshot = {
    projects: [],
    rows: [],
    problems: [],
    progress: { visited: 0, created: 0, errors: 0, active: false, cancelled: false },
  }
  constructor(
    readonly userData: string,
    readonly progress: (p: ScanProgress) => void = () => {},
    readonly hide = true
  ) {}
  // A single queue owns every mutation. cancelScan intentionally bypasses it.
  run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation)
    this.tail = next.catch(() => {})
    return next
  }
  snapshot() {
    return structuredClone(this.state)
  }
  cancelScan() {
    this.cancelled = true
  }
  get registry() {
    return path.join(this.userData, 'poc-projects.json')
  }
  async init() {
    await fs.mkdir(this.userData, { recursive: true })
    if (await exists(this.registry)) {
      const refs = await readJson(this.registry)
      if (
        !Array.isArray(refs) ||
        !refs.every(
          (r) =>
            typeof r.projectId === 'string' &&
            /^[\w-]+$/.test(r.projectId) &&
            typeof r.root === 'string' &&
            path.isAbsolute(r.root)
        )
      )
        throw new Error('本機專案清單損壞；原檔保留，可從專案根重新連結')
      this.refs = refs
    }
    return this.scan()
  }
  async persistRefs() {
    await atomicJson(this.registry, this.refs)
  }
  linked(projectId: string): LinkedProject {
    const linked = this.state.projects.find((p) => p.projectId === projectId)
    if (!linked?.project || linked.error) throw new Error('專案不可用，請重新連結或重新掃描')
    return linked
  }
  async currentProject(linked: LinkedProject) {
    const file = projectFile(linked.root, linked.projectId)
    await safePath(linked.root, file)
    const p = await readJson(file)
    validateProject(p)
    if (p.projectId !== linked.projectId) throw new Error('專案 ID 不符')
    return p
  }
  async protectedAncestor(dir: string) {
    if (insideAppBundle(dir)) return dir
    let parent = path.dirname(dir)
    while (parent !== path.dirname(parent)) {
      await safePath(parent, parent)
      const record = await readFolder(parent).catch((e) => {
        if (missing(e)) return undefined
        throw e
      })
      // Saved/manual boundaries always apply, including overlapping project roots.
      // Unregistered runtime boundaries also apply to deep internal paths.
      const state = record?.details?.boundary
      if (state?.state !== 'not-game' && (state || (await detectGame(parent)))) return parent
      parent = path.dirname(parent)
    }
    return undefined
  }
  async create(root: string, input: ProjectInput) {
    root = await fs.realpath(root)
    const protectedBy = await this.protectedAncestor(root)
    if (protectedBy) throw new Error(`此位置受遊戲／App 邊界保護，請選擇外層資料夾：${protectedBy}`)
    const p: Project = {
      kind: 'media-viewer.project',
      schemaVersion: 1,
      projectId: randomUUID(),
      rootFolderId: 'pending',
      revision: 1,
      name: input.name,
      depth: input.depth,
      fieldBindings: [],
      cells: defaultCells(randomUUID),
      list: { itemsPerRow: 3, pageSize: 100 },
      excludedRelativePaths: [],
    }
    validateProject(p)
    p.cardView = { mode: 'single', level: 1 }
    if (input.scanAll) p.scanAll = true
    p.rootFolderId = (await ensureFolder(root, this.hide)).record.folderId
    const file = projectFile(root, p.projectId)
    await safePath(root, file)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await atomicJson(file, p)
    this.refs.push({ root, projectId: p.projectId })
    await this.persistRefs()
    return this.scan()
  }
  // Projects whose definitions already live in this folder, so a new project can offer to bring them back.
  // Only definitions `link` would accept are offered; `linked` means linked at this very folder (a project
  // moved from another place is still offered, because linking replaces its missing old location).
  async projectsAt(root: string) {
    const found: { projectId: string; name: string; linked: boolean }[] = []
    try {
      root = await fs.realpath(root)
      const rootId = (await readFolder(root)).folderId,
        dir = path.join(root, DATA_DIR, 'projects')
      for (const name of (await fs.readdir(dir))
        .filter((n) => /^[\w-]+\.json$/.test(n))
        .slice(0, 50))
        try {
          const file = path.join(dir, name)
          await safePath(root, file)
          if ((await fs.stat(file)).size > 2 * 1024 * 1024) continue
          const project = (await readJson(file)) as Project
          validateProject(project)
          if (name !== `${project.projectId}.json` || project.rootFolderId !== rootId) continue
          found.push({
            projectId: project.projectId,
            name: project.name,
            linked: this.refs.some(
              (ref) => ref.projectId === project.projectId && keyPath(ref.root) === keyPath(root)
            ),
          })
        } catch {
          // Unreadable or foreign files are not offered.
        }
    } catch {
      // No folder record or no project folder: nothing to bring back.
    }
    return found
  }
  async link(root: string) {
    root = await fs.realpath(root)
    let record: FolderRecord
    try {
      record = await readFolder(root)
    } catch (error) {
      if (isNewerFormat(error)) throw error
      await safePath(root, `${folderFile(root)}.bak`)
      if (!(await exists(`${folderFile(root)}.bak`))) {
        if (missing(error))
          throw new Error(
            '此位置沒有可重新連結的根記錄或備份；若專案已移除或清理，請重新新增專案，封存設定不會自動還原'
          )
        throw new Error(`根記錄無法讀取且沒有復原備份；原檔保留：${message(error)}`)
      }
      const backup = await readJson(`${folderFile(root)}.bak`)
      validateFolder(backup)
      record = backup
    }
    const dir = path.join(root, DATA_DIR, 'projects')
    await safePath(root, dir)
    const names = await fs.readdir(dir),
      found: Project[] = []
    for (const name of new Set(
      names.filter((n) => /^[\w-]+\.json(\.bak)?$/.test(n)).map((n) => n.replace(/\.bak$/, ''))
    )) {
      await safePath(root, path.join(dir, name))
      let p: Project
      try {
        const current = withoutGroupCells(await readJson(path.join(dir, name)))
        validateProject(current)
        p = current
      } catch (error) {
        if (isNewerFormat(error)) throw error
        await safePath(root, path.join(dir, `${name}.bak`))
        const backup = withoutGroupCells(await readJson(path.join(dir, `${name}.bak`)))
        validateProject(backup)
        p = backup
      }
      if (p.rootFolderId !== record.folderId || name !== `${p.projectId}.json`)
        throw new Error('專案與根資料夾身分不符')
      const old = this.refs.find((r) => r.projectId === p.projectId)
      if (old && keyPath(old.root) !== keyPath(root) && (await exists(old.root)))
        throw new Error('同一專案的原根仍存在；若是搬移，先取消舊連結後再連結新位置')
      found.push(p)
    }
    if (!found.length) throw new Error('此根沒有可攜專案設定；可新增專案讀取子資料夾原值')
    for (const p of found)
      this.refs = [
        ...this.refs.filter((r) => r.projectId !== p.projectId),
        { root, projectId: p.projectId },
      ]
    await this.persistRefs()
    return this.scan()
  }
  async unlink(projectId: string) {
    this.refs = this.refs.filter((p) => p.projectId !== projectId)
    await this.persistRefs()
    return this.scan()
  }
  async maintenanceRecovery(token: string, roots: string[]) {
    if (roots.some((root) => within(root, this.userData)))
      throw new Error('本機復原區位於修改範圍內，操作未執行')
    const parent = path.join(this.userData, 'maintenance-backups')
    await safePath(this.userData, parent)
    await fs.mkdir(parent, { recursive: true })
    return path.join(parent, token)
  }
  fieldScope() {
    return fieldRemovalFns.fieldScope(this)
  }
  async previewDeleteField(projectId: string, attributeId: string): Promise<FieldDeletionPreview> {
    return fieldRemovalFns.previewDeleteField(this, projectId, attributeId)
  }
  async deleteField(token: string) {
    return fieldRemovalFns.deleteField(this, token)
  }
  async previewFullRemoval(projectId: string): Promise<FullRemovalPreview> {
    return removalFns.previewFullRemoval(this, projectId)
  }
  async fullRemoveProject(token: string): Promise<CleanupResult> {
    return removalFns.fullRemoveProject(this, token)
  }
  async exportProject(projectId: string, dest: string, appVersion: string) {
    return exportFns.exportProject(this, projectId, dest, appVersion)
  }
  async previewProjectImport(bundle: string, root: string) {
    return exportFns.previewProjectImport(this, bundle, root)
  }
  async applyProjectImport(token: string, overwrite: boolean) {
    return exportFns.applyProjectImport(this, token, overwrite)
  }
  async removableRoot(
    root: string,
    projectId: string
  ): Promise<{ path: string; hash: string }[] | undefined> {
    return removalFns.removableRoot(this, root, projectId)
  }
  async previewRemoveProject(projectId: string): Promise<ProjectRemovalPreview> {
    return removalFns.previewRemoveProject(this, projectId)
  }
  async removeProject(token: string): Promise<CleanupResult> {
    return removalFns.removeProject(this, token)
  }
  async saveProject(next: Project) {
    validateProject(next)
    const linked = this.linked(next.projectId),
      current = await this.currentProject(linked)
    // Upgrade old saved strings only during an explicit project save. Resolve
    // against the old aliases before a rename; never infer an ambiguous identity.
    if (next.savedSearches?.some((search) => !search.queryAst)) {
      const fields: QueryField[] = []
      for (const entry of this.state.projects) {
        const project = entry.projectId === current.projectId ? current : entry.project
        if (!project) continue
        const known = new Map(
          project.fieldBindings.map((field) => [
            field.attributeId,
            {
              key: field.alias,
              type: field.type,
              attributeId: field.attributeId,
              projectId: entry.projectId,
            },
          ])
        )
        for (const row of this.state.rows.filter((row) => row.projectId === entry.projectId))
          for (const attribute of [
            ...(row.record?.attributes ?? []),
            ...(row.record?.projectOverrides[entry.projectId] ?? []),
          ])
            if (!known.has(attribute.attributeId))
              known.set(attribute.attributeId, {
                key: attribute.key,
                type: attribute.type,
                attributeId: attribute.attributeId,
                projectId: entry.projectId,
              })
        fields.push(...known.values())
      }
      next = {
        ...next,
        savedSearches: next.savedSearches.map((search) => {
          if (search.queryAst) return search
          try {
            return {
              ...search,
              queryAst: stabilizeQuery(
                search.query,
                current.savedSearches?.some(
                  (old) => old.id === search.id && old.query === search.query
                )
                  ? fields
                  : fields.map((field) =>
                      field.projectId === next.projectId
                        ? {
                            ...field,
                            key:
                              next.fieldBindings.find(
                                (binding) => binding.attributeId === field.attributeId
                              )?.alias ?? field.key,
                          }
                        : field
                    )
              ),
            }
          } catch {
            return search
          }
        }),
      }
    }
    if (await this.protectedAncestor(linked.root))
      throw new Error('專案位於遊戲／App 邊界內，無法修改設定')
    if (
      next.rootFolderId !== current.rootFolderId ||
      JSON.stringify(next.excludedRelativePaths) !== JSON.stringify(current.excludedRelativePaths)
    )
      throw new Error('根身分與清理排除須由受控操作修改')
    await atomicJson(
      projectFile(linked.root, next.projectId),
      { ...next, revision: next.revision + 1 },
      next.revision
    )
    if (
      JSON.stringify([next.scanAll, next.depth, next.traversal]) !==
      JSON.stringify([current.scanAll, current.depth, current.traversal])
    )
      return this.scan()
    linked.project = { ...structuredClone(next), revision: next.revision + 1 }
    return this.snapshot()
  }
  async scan() {
    return scanFns.scan(this)
  }
  row(rowId: string, writable = false) {
    const row = (this.state.structure ?? this.state.rows).find((r) => r.rowId === rowId)
    if (!row) throw new Error('資料已更新，請重新選取')
    if (writable && (row.error || row.duplicate || row.stopped || row.readonly || !row.record))
      throw new Error('此項目前不可寫入，請先處理問題或重新啟用')
    return row
  }
  async checkedRow(rowId: string, writable = false) {
    const row = this.row(rowId, writable),
      root = this.linked(row.projectId).root
    await safePath(root, row.path)
    if (writable && (insideAppBundle(row.path) || (await this.protectedAncestor(row.path))))
      throw new Error('此位置受遊戲／App 邊界保護，無法寫入')
    if (row.record) {
      const current = await readFolder(row.path)
      if (current.folderId !== row.record.folderId)
        throw new Error('目前位置已是另一資料夾，請重新掃描')
    }
    return row
  }
  async readableRow(rowId: string) {
    const row = await this.checkedRow(rowId)
    if (
      !row.record ||
      row.readonly ||
      row.stopped ||
      row.error ||
      row.duplicate ||
      (await this.protectedAncestor(row.path))
    )
      throw new Error('此資料夾尚未建立有效記錄或受遊戲邊界保護')
    return row
  }
  async refreshRecord(rowId: string) {
    const row = await this.checkedRow(rowId),
      record = await readFolder(row.path)
    for (const item of new Set([...(this.state.structure ?? []), ...this.state.rows]))
      if (keyPath(item.path) === keyPath(row.path)) item.record = structuredClone(record)
    return this.snapshot()
  }
  async visit(rowId: string) {
    return scanFns.visit(this, rowId)
  }
  async saveValues(rowId: string, revision: number, values: Record<string, string>) {
    const row = await this.checkedRow(rowId, true),
      p = this.linked(row.projectId).project!
    const record = await readFolder(row.path)
    const allowed = new Map([
      // Only text fields: a number, date or other typed field is never stored as text here (R-247).
      ...p.fieldBindings
        .filter((f) => f.type === 'string')
        .map((f) => [f.attributeId, f.alias] as const),
      ...record.attributes
        .filter((a) => a.type === 'string')
        .map((a) => [a.attributeId, a.key] as const),
    ])
    for (const [attributeId, value] of Object.entries(values)) {
      if (p.fieldBindings.some((f) => f.attributeId === attributeId && f.type !== 'string'))
        throw new Error('欄位型別不符，不自動轉換')
      if (!allowed.has(attributeId) || typeof value !== 'string' || value.length > 10000)
        throw new Error('文字欄位不合法或超過 10,000 字')
      const old = record.attributes.find((a) => a.attributeId === attributeId)
      // A date saved before the field became text is replaced by the text (R-240); other types are never converted.
      if (old && !dateOrText(old.type, 'string')) throw new Error('欄位型別不符，不自動轉換')
      if (!old && !value) continue
      record.attributes = [
        ...record.attributes.filter((a) => a.attributeId !== attributeId),
        { attributeId, key: allowed.get(attributeId)!, type: 'string', value, source: 'manual' },
      ]
    }
    await saveFolder(row.path, record, revision)
    return this.scan()
  }
  async addImage(rowId: string, revision: number, source: string, cellId?: string) {
    const row = await this.checkedRow(rowId, true),
      record = await readFolder(row.path),
      bytes = await fs.readFile(source)
    const cell =
      cellId === undefined
        ? undefined
        : projectImageCells(
            this.state.projects.find((p) => p.projectId === row.projectId)!.project!
          ).find((c) => c.cellId === cellId)
    if (cellId !== undefined && !cell) throw new Error('圖片組件不存在，請先保存版面')
    const identified = identifyImage(bytes),
      media = identified ? [identified.ext, identified.mime] : undefined
    if (!media) throw new Error('圖片格式未支援，請使用 PNG、JPEG、GIF、WebP、BMP、AVIF 或 ICO')
    if (record.revision !== revision) throw new Error('版本衝突，請重新載入後再選圖')
    const assetId = randomUUID(),
      relativePath = `assets/${assetId}.${media[0]}`,
      target = path.join(row.path, DATA_DIR, relativePath)
    await safePath(row.path, target)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, bytes, { flag: 'wx' })
    record.assets.push({
      assetId,
      relativePath,
      originalName: path.basename(source),
      mediaType: media[1],
    })
    if (cell) {
      record.details ??= { schemaVersion: 1 }
      record.details.cellImages ??= {}
      record.details.cellImages[cell.attributeId ?? cell.cellId] = assetId
    }
    try {
      await saveFolder(row.path, record, revision)
    } catch (e) {
      await fs.unlink(target)
      throw e
    }
    return this.scan()
  }
  async asset(rowId: string, assetId: string) {
    const row = await this.checkedRow(rowId),
      record = await readFolder(row.path),
      asset = record.assets.find((a) => a.assetId === assetId)
    if (!asset) throw new Error('圖片不存在')
    const file = path.join(row.path, DATA_DIR, asset.relativePath)
    await safePath(row.path, file)
    return { file, mediaType: asset.mediaType }
  }
  async resume(rowId: string) {
    const row = this.row(rowId)
    if (row.readonly || (await this.protectedAncestor(row.path)))
      throw new Error('此資料夾受遊戲／App 邊界保護')
    for (const linked of this.state.projects)
      if (linked.project && !linked.error && within(linked.root, row.path)) {
        const p = await this.currentProject(linked),
          rel = relPath(linked.root, row.path)
        await atomicJson(
          projectFile(linked.root, p.projectId),
          {
            ...p,
            revision: p.revision + 1,
            excludedRelativePaths: p.excludedRelativePaths.filter((r) => r !== rel),
          },
          p.revision
        )
      }
    return this.scan()
  }
  async copyIdentity(rowId: string) {
    const row = await this.checkedRow(rowId),
      record = await readFolder(row.path)
    if (row.readonly || (await this.protectedAncestor(row.path)))
      throw new Error('此資料夾受遊戲／App 邊界保護')
    if (!row.duplicate) throw new Error('此項不是重複 ID')
    if (this.refs.some((r) => keyPath(r.root) === keyPath(row.path)))
      throw new Error('副本本身是專案根；先取消此根專案連結，再於父專案處理副本')
    record.folderId = randomUUID()
    record.revision++
    await atomicJson(folderFile(row.path), record, record.revision - 1)
    return this.scan()
  }
  async restore(rowId: string) {
    return cleanupFns.restore(this, rowId)
  }
  async restoreProject(projectId: string) {
    return cleanupFns.restoreProject(this, projectId)
  }
  async previewCleanup(
    rowId?: string,
    scope: 'folder' | 'private' | 'all' = 'folder'
  ): Promise<CleanupPreview> {
    return cleanupFns.previewCleanup(this, rowId, scope)
  }
  async cleanup(token: string, restart: boolean): Promise<CleanupResult> {
    return cleanupFns.cleanup(this, token, restart)
  }
}
