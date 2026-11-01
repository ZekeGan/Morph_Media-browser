import { parseQuery, stabilizeQuery, type QueryField } from '../shared/query'
import { projectImageCells } from '../shared/layouts'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import {
  DATA_DIR,
  defaultCells,
  validateFolder,
  validateProject,
  withoutGroupCells,
  type Project,
  type ProjectInput,
  type FolderRecord,
  type FolderRow,
  type Snapshot,
  type ScanProgress,
  type CleanupPreview,
  type CleanupResult,
  type LinkedProject,
  type LegacyPreview,
  type ProjectRemovalPreview,
} from '../shared/model'
import {
  atomicJson,
  ensureFolder,
  exists,
  fingerprint,
  folderFile,
  keyPath,
  message,
  missing,
  projectFile,
  readFolder,
  readJson,
  relPath,
  restoreJson,
  safePath,
  saveFolder,
  within,
} from './files'
import { hideDirectories } from './hidden'
import { detectGame, insideAppBundle, GameProbeLimit } from './game-detection'
import { identifyImage } from '../shared/images'
import type { LegacyImportResult } from '../shared/model'
import type { FieldDeletionPreview, FullRemovalPreview } from '../shared/model'
import {
  managedTree,
  applyMaintenance,
  withoutField,
  MaintenanceFailure,
  type Change,
  type ManagedFile,
} from './maintenance'

interface PlanEntry {
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
  private refs: { projectId: string; root: string }[] = []
  private plans = new Map<string, Plan>()
  private removalPlans = new Map<
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
  private fieldPlans = new Map<
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
  private fullPlans = new Map<
    string,
    {
      preview: FullRemovalPreview
      tree: Awaited<ReturnType<typeof managedTree>>
      refs: string
      guards: ManagedFile[]
      absent: string[]
    }
  >()
  private cancelled = false
  private hiddenKnown = new Set<string>()
  private legacyPlan?: { token: string; hash: string; views: any[] }
  private tail: Promise<unknown> = Promise.resolve()
  private state: Snapshot = {
    projects: [],
    rows: [],
    problems: [],
    progress: { visited: 0, created: 0, errors: 0, active: false, cancelled: false },
    legacyAvailable: false,
  }
  constructor(
    readonly userData: string,
    private progress: (p: ScanProgress) => void = () => {},
    private hide = true
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
  private get registry() {
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
    this.state.legacyAvailable = await exists(path.join(this.userData, 'app-data', 'view.json'))
    return this.scan()
  }
  private async persistRefs() {
    await atomicJson(this.registry, this.refs)
  }
  private linked(projectId: string): LinkedProject {
    const linked = this.state.projects.find((p) => p.projectId === projectId)
    if (!linked?.project || linked.error) throw new Error('專案不可用，請重新連結或重新掃描')
    return linked
  }
  private async currentProject(linked: LinkedProject) {
    const file = projectFile(linked.root, linked.projectId)
    await safePath(linked.root, file)
    const p = await readJson(file)
    validateProject(p)
    if (p.projectId !== linked.projectId) throw new Error('專案 ID 不符')
    return p
  }
  private async protectedAncestor(dir: string) {
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
      mediaCategory: input.mediaCategory,
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
  async link(root: string) {
    root = await fs.realpath(root)
    let record: FolderRecord
    try {
      record = await readFolder(root)
    } catch (error) {
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
      } catch {
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
  private async maintenanceRecovery(token: string, roots: string[]) {
    if (roots.some((root) => within(root, this.userData)))
      throw new Error('本機復原區位於修改範圍內，操作未執行')
    const parent = path.join(this.userData, 'maintenance-backups')
    await safePath(this.userData, parent)
    await fs.mkdir(parent, { recursive: true })
    return path.join(parent, token)
  }
  private fieldScope() {
    return JSON.stringify(
      (this.state.structure ?? this.state.rows)
        .map((row) => [
          row.projectId,
          keyPath(row.path),
          row.record?.folderId,
          row.readonly,
          row.stopped,
          row.error,
        ])
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    )
  }
  async previewDeleteField(projectId: string, attributeId: string): Promise<FieldDeletionPreview> {
    const linked = this.linked(projectId),
      binding = linked.project!.fieldBindings.find((field) => field.attributeId === attributeId)
    if (!binding) throw new Error('找不到自訂欄位，請重新載入')
    const token = randomUUID(),
      preview: FieldDeletionPreview = {
        token,
        attributeId,
        name: binding.alias,
        fields: 0,
        folders: 0,
        values: 0,
        references: 0,
        layouts: 0,
        tables: 0,
        searches: 0,
        backups: 0,
        projects: [],
        skipped: ['只處理已連結且已納入的可存取記錄；離線、未索引及外部副本不在範圍。'],
        recoveryPath: path.join(this.userData, 'maintenance-backups', token),
      }
    const changes: Change[] = [],
      guards: ManagedFile[] = [],
      affected = new Set<string>(),
      linkedIds = new Set(this.refs.map((ref) => ref.projectId))
    const fields: QueryField[] = []
    for (const ref of this.state.projects) {
      const known = new Map(
        ref.project?.fieldBindings.map((field) => [
          field.attributeId,
          {
            key: field.alias,
            type: field.type,
            attributeId: field.attributeId,
            projectId: ref.projectId,
          },
        ])
      )
      for (const row of (this.state.structure ?? this.state.rows).filter(
        (row) => row.projectId === ref.projectId
      ))
        for (const attribute of [
          ...(row.record?.attributes ?? []),
          ...(row.record?.projectOverrides[ref.projectId] ?? []),
        ])
          if (!known.has(attribute.attributeId))
            known.set(attribute.attributeId, {
              key: attribute.key,
              type: attribute.type,
              attributeId: attribute.attributeId,
              projectId: ref.projectId,
            })
      fields.push(...known.values())
    }
    const resolveSearches = (project: Project) => ({
      ...project,
      savedSearches: project.savedSearches?.map((search) => {
        if (search.queryAst) return search
        const available = [
          ...fields.filter(
            (field) =>
              field.projectId !== project.projectId ||
              !project.fieldBindings.some((binding) => binding.attributeId === field.attributeId)
          ),
          ...project.fieldBindings.map((field) => ({
            key: field.alias,
            type: field.type,
            attributeId: field.attributeId,
            projectId: project.projectId,
          })),
        ]
        try {
          return { ...search, queryAst: stabilizeQuery(search.query, available) }
        } catch (error) {
          const aliases = available
            .filter((field) => field.attributeId === attributeId)
            .map((field) => field.key.toLocaleLowerCase())
          let keys: string[] = []
          try {
            keys = parseQuery(search.query)
              .flat()
              .flatMap((term) => term.key ?? [])
          } catch {}
          if (
            keys.some(
              (key) => aliases.includes(key) || key.endsWith('@' + attributeId.toLocaleLowerCase())
            )
          )
            throw new Error(`常用搜尋「${search.name}」的欄位身分不明，請先修正：${message(error)}`)
          preview.skipped.push(`常用搜尋「${search.name}」無法解析，原樣保留；未宣稱其引用已清除`)
          return search
        }
      }),
    })
    for (const ref of this.state.projects) {
      if (!ref.project || ref.error) {
        preview.skipped.push(`${ref.root}: 專案不可用，保留`)
        continue
      }
      const file = projectFile(ref.root, ref.projectId)
      await safePath(ref.root, file)
      const project = await this.currentProject(ref),
        guard = { root: ref.root, path: file, hash: await fingerprint(file) }
      guards.push(guard)
      const next = withoutField(resolveSearches(project), attributeId)
      let changed =
        JSON.stringify(withoutField(project, attributeId)) !== JSON.stringify(project) ||
        next.savedSearches?.length !== project.savedSearches?.length
      if (changed) {
        preview.fields += project.fieldBindings.filter(
          (field) => field.attributeId === attributeId
        ).length
        preview.tables += project.fieldBindings.filter(
          (field) => field.attributeId === attributeId
        ).length
        const layouts = new Map<string, Project['cells']>([
          [project.activeLayoutId ?? 'default', project.cells],
          ...(project.layoutPresets?.map((p) => [p.id, p.cells] as const) ?? []),
          ...Object.entries(project.contentCells ?? {}).map(
            ([key, cells]) => ['content:' + key, cells] as const
          ),
        ])
        preview.layouts += [...layouts.values()]
          .flat()
          .filter(
            (cell) =>
              cell.attributeId === attributeId ||
              cell.fallbackIds?.includes(attributeId) ||
              cell.condition?.attributeId === attributeId
          ).length
        preview.searches += (project.savedSearches?.length ?? 0) - (next.savedSearches?.length ?? 0)
        changes.push({ ...guard, value: { ...next, revision: project.revision + 1 } })
      }
      const backup = file + '.bak'
      if (await exists(backup)) {
        await safePath(ref.root, backup)
        const old = await readJson(backup)
        validateProject(old)
        if (old.projectId !== project.projectId || old.rootFolderId !== project.rootFolderId)
          throw new Error('專案備份身分不符')
        const backupGuard = { root: ref.root, path: backup, hash: await fingerprint(backup) }
        guards.push(backupGuard)
        const stripped = withoutField(resolveSearches(old), attributeId)
        if (
          JSON.stringify(withoutField(old, attributeId)) !== JSON.stringify(old) ||
          stripped.savedSearches?.length !== old.savedSearches?.length
        ) {
          changes.push({ ...backupGuard, value: stripped })
          preview.backups++
          changed = true
        }
      }
      if (changed) {
        if (await this.protectedAncestor(ref.root))
          throw new Error('受影響專案位於保護邊界內，無法安全刪除欄位')
        affected.add(ref.projectId)
      }
    }
    const rows = [
      ...new Map(
        (this.state.structure ?? this.state.rows)
          .filter((row) => row.record && !row.readonly && !row.stopped && !row.error)
          .map((row) => [keyPath(row.path), row])
      ).values(),
    ]
    for (const row of rows) {
      await safePath(row.path, folderFile(row.path))
      const record = await readFolder(row.path),
        guard = {
          root: row.path,
          path: folderFile(row.path),
          hash: await fingerprint(folderFile(row.path)),
        }
      guards.push(guard)
      const attributes = [
        ...record.attributes,
        ...Object.entries(record.projectOverrides)
          .filter(([id]) => linkedIds.has(id))
          .flatMap(([, values]) => values),
      ].filter((value) => value.attributeId === attributeId)
      for (const [id, values] of Object.entries(record.projectOverrides))
        if (!linkedIds.has(id) && values.some((value) => value.attributeId === attributeId))
          preview.skipped.push(`${row.path}: 未連結專案 ${id} 的私有值保留，未納入刪除`)
      const strip = (source: FolderRecord) => {
        const next = structuredClone(source)
        next.attributes = next.attributes.filter((value) => value.attributeId !== attributeId)
        for (const id of Object.keys(next.projectOverrides)) {
          if (linkedIds.has(id))
            next.projectOverrides[id] = next.projectOverrides[id].filter(
              (value) => value.attributeId !== attributeId
            )
          else if (next.projectOverrides[id].some((value) => value.attributeId === attributeId))
            preview.skipped.push(`${row.path}: 未連結專案 ${id} 的私有值保留，未納入刪除`)
        }
        if (next.details?.cellImages) delete next.details.cellImages[attributeId]
        return next
      }
      let changed =
        attributes.length > 0 || Object.hasOwn(record.details?.cellImages ?? {}, attributeId)
      if (changed) {
        preview.values += attributes.filter(
          (a) =>
            a.value !== null &&
            a.value !== undefined &&
            a.value !== '' &&
            (!Array.isArray(a.value) || a.value.length > 0)
        ).length
        changes.push({ ...guard, value: { ...strip(record), revision: record.revision + 1 } })
      }
      const backup = folderFile(row.path) + '.bak'
      if (await exists(backup)) {
        await safePath(row.path, backup)
        const old = await readJson(backup)
        validateFolder(old)
        if (old.folderId !== record.folderId) throw new Error('資料夾備份身分不符')
        const backupGuard = { root: row.path, path: backup, hash: await fingerprint(backup) }
        guards.push(backupGuard)
        const stripped = strip(old)
        if (JSON.stringify(stripped) !== JSON.stringify(old)) {
          changes.push({ ...backupGuard, value: stripped })
          preview.backups++
          changed = true
        }
      }
      if (changed) {
        if (await this.protectedAncestor(row.path))
          throw new Error('受影響記錄位於保護邊界內，無法安全刪除欄位')
        preview.folders++
        for (const ref of this.state.projects)
          if (within(ref.root, row.path)) affected.add(ref.projectId)
      }
    }
    preview.projects = this.state.projects
      .filter((ref) => affected.has(ref.projectId))
      .map((ref) => ({
        projectId: ref.projectId,
        name: ref.project?.name ?? ref.projectId,
        root: ref.root,
      }))
    preview.references = preview.layouts + preview.tables + preview.searches
    preview.skipped = [...new Set(preview.skipped)]
    const absent: string[] = []
    for (const guard of guards.filter((guard) => !guard.path.endsWith('.bak')))
      if (!(await exists(guard.path + '.bak'))) absent.push(guard.path + '.bak')
    this.fieldPlans.clear()
    this.fieldPlans.set(token, {
      preview,
      changes,
      guards,
      refs: JSON.stringify(this.refs),
      scope: this.fieldScope(),
      absent,
    })
    return preview
  }
  async deleteField(token: string) {
    const plan = this.fieldPlans.get(token)
    this.fieldPlans.delete(token)
    if (!plan || plan.refs !== JSON.stringify(this.refs) || plan.scope !== this.fieldScope())
      throw new Error('欄位刪除預覽已失效，請重新預覽')
    const check = async () => {
      for (const file of plan.absent)
        if (await exists(file)) throw new Error('預覽後備份已變更，刪除未執行')
      for (const guard of plan.guards) {
        await safePath(guard.root, guard.path)
        if ((await fingerprint(guard.path)) !== guard.hash)
          throw new Error('預覽後資料已變更，刪除未執行')
      }
      for (const root of new Set(plan.changes.map((change) => change.root)))
        if (await this.protectedAncestor(root)) throw new Error('保護邊界已變更，刪除未執行')
    }
    await check()
    const recovery = await this.maintenanceRecovery(
      token,
      this.refs.map((ref) => ref.root)
    )
    await applyMaintenance(
      plan.changes,
      recovery,
      this.userData,
      this.refs.map((ref) => ref.root),
      check
    )
    await this.scan()
    return recovery
  }
  async previewFullRemoval(projectId: string): Promise<FullRemovalPreview> {
    const linked = this.linked(projectId)
    await this.currentProject(linked)
    if (await this.protectedAncestor(linked.root))
      throw new Error('此專案位於保護邊界內，只能取消連結')
    const token = randomUUID(),
      tree = await managedTree(linked.root),
      overlaps = this.state.projects.filter(
        (ref) =>
          ref.projectId !== projectId &&
          (within(linked.root, ref.root) || within(ref.root, linked.root))
      )
    const guards: ManagedFile[] = []
    for (const ref of this.refs)
      if (within(ref.root, linked.root) && !within(linked.root, ref.root)) {
        const file = projectFile(ref.root, ref.projectId)
        await safePath(ref.root, file)
        const value = await this.currentProject(ref)
        guards.push({ root: ref.root, path: file, hash: await fingerprint(file) })
        if (await exists(file + '.bak')) {
          await safePath(ref.root, file + '.bak')
          const backup = await readJson(file + '.bak')
          validateProject(backup)
          if (backup.projectId !== value.projectId || backup.rootFolderId !== value.rootFolderId)
            throw new Error('祖先專案備份身分不符')
          guards.push({
            root: ref.root,
            path: file + '.bak',
            hash: await fingerprint(file + '.bak'),
          })
        }
      }
    guards.push({
      root: this.userData,
      path: this.registry,
      hash: await fingerprint(this.registry),
    })
    if (await exists(this.registry + '.bak'))
      guards.push({
        root: this.userData,
        path: this.registry + '.bak',
        hash: await fingerprint(this.registry + '.bak'),
      })
    const preview: FullRemovalPreview = {
      token,
      projectId,
      name: linked.project!.name,
      root: linked.root,
      paths: tree.files.map((file) => file.path),
      skipped: [
        ...tree.skipped,
        '只檢查目前可存取的清理樹與已連結專案；離線、未連結副本無法判斷。',
      ],
      affectedProjects: overlaps.map((ref) => ({
        projectId: ref.projectId,
        name: ref.project?.name ?? ref.projectId,
        root: ref.root,
      })),
      recoveryPath: path.join(this.userData, 'maintenance-backups', token),
    }
    const absent: string[] = []
    for (const guard of guards.filter((guard) => !guard.path.endsWith('.bak')))
      if (!(await exists(guard.path + '.bak'))) absent.push(guard.path + '.bak')
    this.fullPlans.clear()
    this.fullPlans.set(token, { preview, tree, refs: JSON.stringify(this.refs), guards, absent })
    return preview
  }
  async fullRemoveProject(token: string): Promise<CleanupResult> {
    const plan = this.fullPlans.get(token)
    this.fullPlans.delete(token)
    if (!plan || plan.refs !== JSON.stringify(this.refs))
      throw new Error('完全移除預覽已失效，請重新預覽')
    if (await this.protectedAncestor(plan.preview.root))
      throw new Error('遊戲保護邊界已變更，移除未執行')
    const tree = await managedTree(plan.preview.root)
    if (JSON.stringify(tree) !== JSON.stringify(plan.tree))
      throw new Error('預覽後資料已變更，移除未執行')
    const nextRefs = this.refs.filter((ref) => !within(plan.preview.root, ref.root)),
      changes: Change[] = []
    for (const guard of plan.guards) {
      await safePath(guard.root, guard.path)
      if ((await fingerprint(guard.path)) !== guard.hash)
        throw new Error('預覽後專案已變更，移除未執行')
      if (guard.path === this.registry || guard.path === this.registry + '.bak')
        changes.push({ ...guard, value: nextRefs, stopScan: true })
      else {
        const project = await readJson(guard.path)
        validateProject(project)
        changes.push({
          ...guard,
          stopScan: true,
          value: {
            ...project,
            revision: project.revision + 1,
            excludedRelativePaths: [
              ...new Set([
                ...project.excludedRelativePaths,
                relPath(guard.root, plan.preview.root),
              ]),
            ],
          },
        })
      }
    }
    // Stop every affected scan before deleting metadata, including on process interruption.
    changes.push(
      ...[...tree.files].sort(
        (a, b) =>
          Number(path.basename(a.path) === 'folder.json') -
          Number(path.basename(b.path) === 'folder.json')
      )
    )
    try {
      await applyMaintenance(
        changes,
        await this.maintenanceRecovery(token, [plan.preview.root]),
        this.userData,
        [plan.preview.root],
        async () => {
          if (JSON.stringify(await managedTree(plan.preview.root)) !== JSON.stringify(tree))
            throw new Error('備份期間資料已變更，移除未執行')
          for (const file of plan.absent)
            if (await exists(file)) throw new Error('預覽後備份已變更，移除未執行')
          for (const guard of plan.guards) {
            await safePath(guard.root, guard.path)
            if ((await fingerprint(guard.path)) !== guard.hash)
              throw new Error('備份期間專案已變更，移除未執行')
          }
        }
      )
    } catch (error) {
      if (error instanceof MaintenanceFailure && error.rollbackIncomplete) {
        this.refs = nextRefs
        await this.scan()
      }
      throw error
    }
    this.refs = nextRefs
    const result: CleanupResult = {
      removed: tree.files.length,
      failed: [],
      skipped: plan.preview.skipped,
    }
    for (const dir of tree.directories)
      try {
        await safePath(plan.preview.root, dir)
        await fs.rmdir(dir)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'ENOTEMPTY') result.skipped.push(`${dir}: 尚有未驗證資料，目錄保留`)
        else if (code !== 'ENOENT') result.failed.push(`${dir}: ${message(error)}`)
      }
    await this.scan()
    return result
  }
  // Only retire an otherwise unused, empty root identity. Shared values, manual
  // settings, other projects, unknown files and links always keep it in place.
  private async removableRoot(
    root: string,
    projectId: string
  ): Promise<{ path: string; hash: string }[] | undefined> {
    if (
      this.refs.some(
        (ref) => ref.projectId !== projectId && (within(ref.root, root) || within(root, ref.root))
      )
    )
      return
    const record = await readFolder(root)
    if (
      record.attributes.length ||
      record.assets.length ||
      Object.keys(record.projectOverrides).some((id) => id !== projectId) ||
      (record.details && Object.keys(record.details).some((key) => key !== 'schemaVersion')) ||
      Object.keys(record).some(
        (key) =>
          ![
            'kind',
            'schemaVersion',
            'folderId',
            'revision',
            'attributes',
            'projectOverrides',
            'assets',
            'details',
          ].includes(key)
      )
    )
      return
    const meta = path.join(root, DATA_DIR),
      files: { path: string; hash: string }[] = []
    const collect = async (file: string) => {
      await safePath(root, file)
      files.push({ path: file, hash: await fingerprint(file) })
    }
    for (const entry of await fs.readdir(meta, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) return
      const file = path.join(meta, entry.name)
      if (entry.isFile() && /^folder\.json(?:\.bak)?$/.test(entry.name)) {
        await safePath(root, file)
        const value = await readJson(file)
        validateFolder(value)
        if (value.folderId !== record.folderId) return
        await collect(file)
      } else if (entry.isDirectory() && entry.name === 'projects') {
        await safePath(root, file)
        for (const child of await fs.readdir(file, { withFileTypes: true })) {
          const match = /^([\w-]+)\.json(?:\.bak)?(?:\.removed-[\w-]+)?$/.exec(child.name)
          if (
            !child.isFile() ||
            child.isSymbolicLink() ||
            !match ||
            (!child.name.includes('.removed-') && match[1] !== projectId)
          )
            return
          const target = path.join(file, child.name)
          await safePath(root, target)
          const value = await readJson(target)
          validateProject(value)
          if (value.projectId !== match[1]) return
          await collect(target)
        }
      } else return
    }
    return files
  }
  async previewRemoveProject(projectId: string): Promise<ProjectRemovalPreview> {
    const linked = this.linked(projectId),
      project = await this.currentProject(linked)
    if (await this.protectedAncestor(linked.root))
      throw new Error('此專案位於遊戲／App 保護邊界內，只能取消連結')
    const records: { dir: string; record: FolderRecord }[] = [],
      files: { path: string; hash: string }[] = [],
      definitions: string[] = [],
      skipped: string[] = [],
      pending = [linked.root]
    for (const file of [
      projectFile(linked.root, projectId),
      projectFile(linked.root, projectId) + '.bak',
    ])
      if (await exists(file)) {
        await safePath(linked.root, file)
        const value = await readJson(file)
        validateProject(value)
        if (value.projectId !== projectId || value.rootFolderId !== project.rootFolderId)
          throw new Error('專案設定身分不符，無法移除')
        definitions.push(file)
        files.push({ path: file, hash: await fingerprint(file) })
      }
    while (pending.length) {
      const dir = pending.pop()!
      try {
        await safePath(linked.root, dir)
        if (insideAppBundle(dir)) {
          skipped.push(`${dir}: App 內資料保留`)
          continue
        }
        const record = await readFolder(dir).catch((e) => {
          if (missing(e)) return undefined
          throw e
        })
        if (record?.projectOverrides[projectId]) {
          records.push({ dir, record })
          files.push({ path: folderFile(dir), hash: await fingerprint(folderFile(dir)) })
        }
        const boundary = record?.details?.boundary
        if (boundary?.state !== 'not-game' && (boundary || (await detectGame(dir)))) {
          skipped.push(`${dir}: 遊戲內部記錄保留`)
          continue
        }
        for (const entry of await fs.readdir(dir, { withFileTypes: true }))
          if (
            entry.isDirectory() &&
            !entry.isSymbolicLink() &&
            entry.name.toLowerCase() !== DATA_DIR
          )
            pending.push(path.join(dir, entry.name))
      } catch (error) {
        skipped.push(`${dir}: ${message(error)}`)
      }
    }
    const rootFiles = await this.removableRoot(linked.root, projectId),
      token = randomUUID()
    const preview: ProjectRemovalPreview = {
      token,
      projectId,
      name: project.name,
      paths: [
        ...new Set([
          ...definitions,
          ...records.map((item) => folderFile(item.dir)),
          ...(rootFiles?.map((file) => file.path) ?? []),
        ]),
      ],
      skipped,
      privateCount: records.length,
      rootCleanup: !!rootFiles,
      ...(rootFiles ? { recoveryPath: path.join(this.userData, 'project-removals', token) } : {}),
    }
    if (!rootFiles)
      skipped.push(`${linked.root}: 根記錄仍有共用資料、其他專案或未驗證檔案，保留根身分`)
    for (const file of rootFiles ?? [])
      if (!files.some((item) => item.path === file.path)) files.push(file)
    this.removalPlans.clear()
    this.removalPlans.set(preview.token, {
      preview,
      root: linked.root,
      records,
      files,
      definitions,
      rootFiles,
    })
    return preview
  }
  async removeProject(token: string): Promise<CleanupResult> {
    const plan = this.removalPlans.get(token)
    if (!plan) throw new Error('專案移除預覽已失效，請重新預覽')
    this.removalPlans.delete(token)
    this.linked(plan.preview.projectId)
    if (await this.protectedAncestor(plan.root)) throw new Error('遊戲邊界已變更，移除未執行')
    for (const file of plan.files) {
      await safePath(plan.root, file.path)
      if ((await fingerprint(file.path)) !== file.hash)
        throw new Error('預覽後資料已變更，移除未執行，請重新預覽')
    }
    if (plan.rootFiles) {
      const now = await this.removableRoot(plan.root, plan.preview.projectId)
      if (
        !now ||
        now.length !== plan.rootFiles.length ||
        now.some(
          (file) => !plan.rootFiles!.some((old) => old.path === file.path && old.hash === file.hash)
        )
      )
        throw new Error('預覽後根資料夾內容或歸屬已變更，移除未執行')
    }
    const result: CleanupResult = { removed: 0, failed: [], skipped: plan.preview.skipped }
    for (const item of plan.records)
      try {
        if (await this.protectedAncestor(item.dir))
          throw new Error('此位置新增遊戲保護邊界，私有資料保留')
        const current = await readFolder(item.dir)
        delete current.projectOverrides[plan.preview.projectId]
        await saveFolder(item.dir, current, item.record.revision)
        result.removed++
        if (plan.rootFiles && keyPath(item.dir) === keyPath(plan.root))
          for (const file of plan.rootFiles)
            if (file.path === folderFile(item.dir) || file.path === folderFile(item.dir) + '.bak')
              file.hash = await fingerprint(file.path)
      } catch (error) {
        result.failed.push(`${item.dir}: ${message(error)}`)
      }
    if (result.failed.length) {
      await this.scan()
      return result
    }
    const before = this.refs
    this.refs = this.refs.filter((ref) => ref.projectId !== plan.preview.projectId)
    try {
      await this.persistRefs()
    } catch (error) {
      this.refs = before
      throw error
    }
    // Archive instead of destroying definitions/backups. The suffix is excluded by link().
    for (const file of plan.definitions)
      try {
        const archive = file + '.removed-' + plan.preview.token
        await safePath(plan.root, file)
        await safePath(plan.root, archive)
        if (
          (await exists(archive)) ||
          (await fingerprint(file)) !== plan.files.find((item) => item.path === file)!.hash
        )
          throw new Error('移除期間設定已變更，保留原檔')
        await fs.rename(file, archive)
        const rootFile = plan.rootFiles?.find((item) => item.path === file)
        if (rootFile) rootFile.path = archive
      } catch (error) {
        result.failed.push(`${file}: ${message(error)}`)
      }
    if (plan.rootFiles && !result.failed.length)
      try {
        const now = await this.removableRoot(plan.root, plan.preview.projectId)
        if (
          !now ||
          now.length !== plan.rootFiles.length ||
          now.some(
            (file) =>
              !plan.rootFiles!.some((old) => old.path === file.path && old.hash === file.hash)
          )
        )
          throw new Error('根資料夾內容已變更，根記錄保留')
        const recovery = plan.preview.recoveryPath!
        await safePath(this.userData, recovery)
        await fs.mkdir(recovery, { recursive: true })
        for (const file of now) {
          const target = path.join(recovery, relPath(plan.root, file.path))
          await safePath(this.userData, target)
          await fs.mkdir(path.dirname(target), { recursive: true })
          // Exclusive copy, durable flush and hash verification precede any removal.
          const handle = await fs.open(target, 'wx')
          try {
            await handle.writeFile(await fs.readFile(file.path))
            await handle.sync()
          } finally {
            await handle.close()
          }
          if ((await fingerprint(target)) !== file.hash)
            throw new Error('復原副本驗證失敗，根記錄保留')
        }
        await atomicJson(path.join(recovery, 'manifest.json'), {
          root: plan.root,
          projectId: plan.preview.projectId,
          files: now.map((file) => ({ path: relPath(plan.root, file.path), hash: file.hash })),
        })
        const rechecked = await this.removableRoot(plan.root, plan.preview.projectId)
        if (
          !rechecked ||
          rechecked.length !== now.length ||
          rechecked.some(
            (file) => !now.some((old) => old.path === file.path && old.hash === file.hash)
          )
        )
          throw new Error('備份期間根內容或歸屬已變更，根記錄保留')
        for (const file of now) {
          await safePath(plan.root, file.path)
          if ((await fingerprint(file.path)) !== file.hash)
            throw new Error('備份期間資料已變更，根記錄保留')
        }
        // Keep the primary identity until every other owned file has been retired.
        for (const file of [
          ...now.filter((file) => file.path !== folderFile(plan.root)),
          ...now.filter((file) => file.path === folderFile(plan.root)),
        ]) {
          await safePath(plan.root, file.path)
          if ((await fingerprint(file.path)) !== file.hash)
            throw new Error('清理期間資料已變更，停止此筆清理')
          await fs.unlink(file.path)
        }
        for (const directory of [
          path.join(plan.root, DATA_DIR, 'projects'),
          path.join(plan.root, DATA_DIR),
        ])
          await fs.rmdir(directory).catch((error) => {
            if (!missing(error)) throw error
          })
        result.removed++
      } catch (error) {
        // A late directory/permission failure must not strand unknown data beside a
        // missing identity. Restore only our verified primary, never overwrite a file.
        try {
          const primary = plan.rootFiles.find((file) => file.path === folderFile(plan.root)),
            copy = path.join(plan.preview.recoveryPath!, DATA_DIR, 'folder.json')
          if (primary && !(await exists(primary.path)) && (await exists(copy))) {
            await safePath(this.userData, copy)
            if ((await fingerprint(copy)) !== primary.hash) throw new Error('復原副本已變更')
            const bytes = await fs.readFile(copy)
            validateFolder(JSON.parse(bytes.toString()))
            await safePath(plan.root, primary.path)
            await fs.mkdir(path.dirname(primary.path), { recursive: true })
            const handle = await fs.open(primary.path, 'wx')
            try {
              await handle.writeFile(bytes)
              await handle.sync()
            } finally {
              await handle.close()
            }
          }
        } catch (restoreError) {
          result.failed.push(`根記錄復原未完成：${message(restoreError)}`)
        }
        result.failed.push(
          `${plan.root}: ${message(error)}；復原位置：${plan.preview.recoveryPath}`
        )
      }
    await this.scan()
    return result
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
      JSON.stringify([next.scanAll, next.depth, next.mediaCategory, next.traversal]) !==
      JSON.stringify([current.scanAll, current.depth, current.mediaCategory, current.traversal])
    )
      return this.scan()
    linked.project = { ...structuredClone(next), revision: next.revision + 1 }
    return this.snapshot()
  }
  async scan() {
    this.cancelled = false
    const progress: ScanProgress = {
      visited: 0,
      created: 0,
      errors: 0,
      active: true,
      cancelled: false,
    }
    const rows: FolderRow[] = [],
      structure: FolderRow[] = [],
      projects: LinkedProject[] = [],
      problems: string[] = []
    const cache = new Map<string, { record?: FolderRecord; error?: string }>()
    this.progress({ ...progress })
    for (const ref of this.refs) {
      const linked: LinkedProject = { ...ref }
      projects.push(linked)
      try {
        linked.project = await this.currentProject(linked)
        if (await this.protectedAncestor(ref.root))
          throw new Error('專案位於遊戲／App 保護邊界內；資料保留，請改用外層專案')
        const rootRecord = await readFolder(ref.root)
        if (rootRecord.folderId !== linked.project.rootFolderId)
          throw new Error('根資料夾身分已改變，請重新連結')
      } catch (e) {
        linked.error = message(e)
        problems.push(`${ref.root}: ${message(e)}`)
      }
    }
    const exclusions = new Set<string>()
    for (const linked of projects)
      if (linked.project && !linked.error) {
        const p = linked.project,
          keep: string[] = []
        for (const rel of p.excludedRelativePaths) {
          const target = path.join(linked.root, rel)
          try {
            if (await exists(target)) {
              keep.push(rel)
              exclusions.add(keyPath(target))
            }
          } catch {
            keep.push(rel)
            exclusions.add(keyPath(target))
          }
        }
        if (keep.length !== p.excludedRelativePaths.length) {
          try {
            await atomicJson(
              projectFile(linked.root, p.projectId),
              { ...p, revision: p.revision + 1, excludedRelativePaths: keep },
              p.revision
            )
            p.revision++
            p.excludedRelativePaths = keep
          } catch (e) {
            problems.push(message(e))
          }
        }
      }
    for (const linked of projects) {
      const p = linked.project
      if (!p || linked.error || this.cancelled) continue
      type ScanEntry = { dir: string; depth: number; readonly?: boolean }
      const walk = async ({ dir, depth, readonly = false }: ScanEntry): Promise<ScanEntry[]> => {
        if (this.cancelled) return []
        const stopped = exclusions.has(keyPath(dir)),
          cacheKey = keyPath(dir)
        let boundary: FolderRow['boundary'],
          probeError = ''
        try {
          await safePath(linked.root, dir)
          const existing = await readFolder(dir).catch((e) => {
            if (missing(e)) return undefined
            throw e
          })
          if (insideAppBundle(dir)) readonly = true
          if (existing?.details?.boundary?.state !== 'not-game' || insideAppBundle(dir)) {
            const saved = existing?.details?.boundary
            const detected = saved?.state === 'root' ? saved : ((await detectGame(dir)) ?? saved)
            if (detected)
              boundary = { ...detected, state: saved?.state === 'root' ? 'root' : 'candidate' }
          }
        } catch (e) {
          if (e instanceof GameProbeLimit)
            boundary = { state: 'candidate', engines: [], evidence: [e.message] }
          else {
            probeError = message(e)
            problems.push(`${dir}: 無法確認邊界，停止此分支：${probeError}`)
            progress.errors++
            progress.visited++
          }
        }
        let result = probeError ? { error: probeError } : readonly ? undefined : cache.get(cacheKey)
        if (!result) {
          try {
            await safePath(linked.root, dir)
            if (stopped || readonly)
              result = {
                record: await readFolder(dir).catch((e) => {
                  if (missing(e)) return undefined
                  throw e
                }),
              }
            else {
              const found = await ensureFolder(dir, false)
              result = { record: found.record }
              if (found.created) {
                progress.created++
                this.hiddenKnown.delete(cacheKey)
              }
            }
          } catch (e) {
            result = { error: message(e) }
            progress.errors++
            problems.push(`${dir}: ${message(e)}`)
          }
          if (!readonly) cache.set(cacheKey, result)
          progress.visited++
          if (progress.visited % 20 === 0) this.progress({ ...progress })
        }
        const row: FolderRow = {
          rowId: createHash('sha256').update(`${p.projectId}\0${cacheKey}`).digest('hex'),
          projectId: p.projectId,
          path: dir,
          name: path.basename(dir) || dir,
          depth,
          ...result,
          stopped,
          duplicate: false,
          readonly,
          boundary,
          structural: p.depth.mode === 'exact' && depth !== p.depth.level,
        }
        structure.push(row)
        if (!row.structural) rows.push(row)
        if (probeError) return []
        if (insideAppBundle(dir)) {
          problems.push(`${dir}: 受 App 邊界保護，唯讀且不深入`)
          return []
        }
        if (boundary) {
          problems.push(
            `${dir}: ${boundary.engines.join('/')} ${boundary.state === 'root' ? '遊戲根' : '疑似遊戲'}，內部不寫入${row.structural ? '；未達顯示深度' : ''}`
          )
          if (!result?.record || !p.traversal?.[result.record.folderId]) return []
        }
        if ((!p.scanAll && depth >= p.depth.level) || this.cancelled) return []
        const children: ScanEntry[] = []
        try {
          for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
            if (entry.name.toLowerCase() === DATA_DIR) continue
            if (entry.isSymbolicLink()) {
              problems.push(`${path.join(dir, entry.name)}: 略過連結`)
              continue
            }
            if (entry.isDirectory())
              children.push({
                dir: path.join(dir, entry.name),
                depth: depth + 1,
                readonly: readonly || !!boundary,
              })
          }
        } catch (e) {
          problems.push(`${dir}: ${message(e)}`)
          progress.errors++
        }
        return children
      }
      const pending: ScanEntry[] = [{ dir: linked.root, depth: 1 }]
      // Eight independent directories at most; complete in-flight writes on cancellation.
      while (pending.length && !this.cancelled)
        pending.push(...(await Promise.all(pending.splice(0, 8).map(walk))).flat())
    }
    if (this.hide) {
      const dirs = [...cache]
        .filter(([dir, value]) => value.record && !this.hiddenKnown.has(dir))
        .map(([dir]) => dir)
      const failures = await hideDirectories(dirs),
        failed = new Set(failures.map((f) => keyPath(f.dir)))
      for (const dir of dirs) if (!failed.has(keyPath(dir))) this.hiddenKnown.add(dir)
      for (const failure of failures) {
        problems.push(`${failure.dir}: 設定隱藏屬性失敗，下次掃描重試：${failure.error}`)
        progress.errors++
      }
    }
    const ids = new Map<string, Set<string>>()
    for (const [dir, value] of cache)
      if (value.record)
        ids.set(value.record.folderId, new Set([...(ids.get(value.record.folderId) ?? []), dir]))
    for (const row of structure)
      if (row.record && (ids.get(row.record.folderId)?.size ?? 0) > 1) {
        row.duplicate = true
        row.error = '重複 ID：暫停寫入，確認搬移或將副本分配新 ID'
      }
    progress.active = false
    progress.cancelled = this.cancelled
    this.progress({ ...progress })
    this.state = {
      projects,
      rows,
      structure,
      problems,
      progress,
      legacyAvailable: this.state.legacyAvailable,
    }
    return this.snapshot()
  }
  private row(rowId: string, writable = false) {
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
  // Navigation is read-only: missing records are reported, never initialized here.
  async visit(rowId: string) {
    const row = this.row(rowId),
      root = this.linked(row.projectId).root
    await safePath(root, row.path)
    if (
      row.readonly ||
      (await this.protectedAncestor(row.path)) ||
      (this.state.structure ?? []).some(
        (r) =>
          r.projectId === row.projectId &&
          r.path !== row.path &&
          r.boundary &&
          within(r.path, row.path)
      )
    )
      throw new Error('此資料夾受遊戲邊界保護，無法建立資料')
    if (row.stopped) throw new Error('此資料夾尚未建立資料或已停止記錄')
    let record: FolderRecord
    try {
      record = await readFolder(row.path)
    } catch (e) {
      if (missing(e)) throw new Error('此資料夾尚未建立資料，請先明確重新掃描或建立記錄')
      throw e
    }
    if (row.record && record.folderId !== row.record.folderId)
      throw new Error('目前位置已是另一資料夾，請重新掃描')
    if (row.error || row.duplicate) throw new Error(row.error ?? '記錄需要復原')
    row.record = record
    const saved = record.details?.boundary
    if (saved?.state === 'not-game') row.boundary = undefined
    else
      try {
        const boundary = saved?.state === 'root' ? saved : ((await detectGame(row.path)) ?? saved)
        row.boundary = boundary
          ? { ...boundary, state: saved?.state === 'root' ? 'root' : 'candidate' }
          : undefined
      } catch (error) {
        if (error instanceof GameProbeLimit)
          row.boundary = { state: 'candidate', engines: [], evidence: [error.message] }
        else throw error
      }
    if (row.boundary) {
      const beneath = (item: FolderRow) =>
        item.projectId === row.projectId &&
        keyPath(item.path) !== keyPath(row.path) &&
        within(row.path, item.path)
      const traverse = this.linked(row.projectId).project!.traversal?.[record.folderId]
      if (!traverse) {
        // A root visit must honor the same stopping rule as scan(). Do not expose
        // internal placeholders, including stale descendants from an earlier scan.
        this.state.structure = (this.state.structure ?? this.state.rows).filter(
          (item) => !beneath(item)
        )
        this.state.rows = this.state.rows.filter((item) => !beneath(item))
        return this.snapshot()
      }
      for (const item of [...(this.state.structure ?? []), ...this.state.rows])
        if (beneath(item)) item.readonly = true
    }
    const structure = this.state.structure ?? this.state.rows
    for (const entry of await fs.readdir(row.path, { withFileTypes: true })) {
      if (entry.name.toLowerCase() === DATA_DIR || entry.isSymbolicLink() || !entry.isDirectory())
        continue
      const dir = path.join(row.path, entry.name)
      if (structure.some((r) => r.projectId === row.projectId && keyPath(r.path) === keyPath(dir)))
        continue
      await safePath(root, dir)
      let childRecord: FolderRecord | undefined, error: string | undefined
      if (!row.boundary)
        try {
          childRecord = await readFolder(dir)
        } catch (e) {
          if (!missing(e)) error = message(e)
        }
      const duplicate =
        !!childRecord &&
        structure.some(
          (r) => r.record?.folderId === childRecord!.folderId && keyPath(r.path) !== keyPath(dir)
        )
      structure.push({
        rowId: createHash('sha256')
          .update(`${row.projectId}\0${keyPath(dir)}`)
          .digest('hex'),
        projectId: row.projectId,
        path: dir,
        name: entry.name,
        depth: row.depth + 1,
        record: childRecord,
        error: duplicate ? '重複 ID：請先處理副本' : error,
        duplicate,
        stopped: false,
        readonly: !!row.boundary,
      })
    }
    this.state.structure = structure
    return this.snapshot()
  }
  async saveValues(rowId: string, revision: number, values: Record<string, string>) {
    const row = await this.checkedRow(rowId, true),
      p = this.linked(row.projectId).project!
    const record = await readFolder(row.path)
    const allowed = new Map([
      ...p.fieldBindings.map((f) => [f.attributeId, f.alias] as const),
      ...record.attributes
        .filter((a) => a.type === 'string')
        .map((a) => [a.attributeId, a.key] as const),
    ])
    for (const [attributeId, value] of Object.entries(values)) {
      if (!allowed.has(attributeId) || typeof value !== 'string' || value.length > 10000)
        throw new Error('文字欄位不合法或超過 10,000 字')
      const old = record.attributes.find((a) => a.attributeId === attributeId)
      if (old && old.type !== 'string') throw new Error('欄位型別不符，不自動轉換')
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
    const row = this.row(rowId),
      file = folderFile(row.path)
    if (row.readonly || (await this.protectedAncestor(row.path)))
      throw new Error('此資料夾受遊戲／App 邊界保護')
    await restoreJson(
      this.linked(row.projectId).root,
      file,
      validateFolder,
      (backup) => !row.record || backup.folderId === row.record.folderId
    )
    return this.scan()
  }
  async restoreProject(projectId: string) {
    const ref = this.refs.find((r) => r.projectId === projectId)
    if (!ref) throw new Error('此專案未連結')
    if (await this.protectedAncestor(ref.root))
      throw new Error('專案位於遊戲／App 保護邊界內，無法復原寫入')
    const file = projectFile(ref.root, projectId)
    let project: Project,
      repairProject = false,
      repairRoot = false
    try {
      project = await this.currentProject(ref)
    } catch {
      await safePath(ref.root, `${file}.bak`)
      const backup = await readJson(`${file}.bak`)
      validateProject(backup)
      if (backup.projectId !== projectId) throw new Error('專案備份 ID 不符')
      project = backup
      repairProject = true
    }
    let rootRecord: FolderRecord
    try {
      rootRecord = await readFolder(ref.root)
    } catch {
      await safePath(ref.root, `${folderFile(ref.root)}.bak`)
      const backup = await readJson(`${folderFile(ref.root)}.bak`)
      validateFolder(backup)
      rootRecord = backup
      repairRoot = true
    }
    if (rootRecord.folderId !== project.rootFolderId)
      throw new Error('根資料夾與專案備份身分不符，未復原')
    // Validate both candidates before repairing either file. Retry is safe after a partial failure.
    if (repairRoot)
      await restoreJson(
        ref.root,
        folderFile(ref.root),
        validateFolder,
        (value) => value.folderId === project.rootFolderId
      )
    if (repairProject)
      await restoreJson(
        ref.root,
        file,
        validateProject,
        (value) => value.projectId === projectId && value.rootFolderId === rootRecord.folderId
      )
    return this.scan()
  }
  async previewCleanup(
    rowId?: string,
    scope: 'folder' | 'private' | 'all' = 'folder'
  ): Promise<CleanupPreview> {
    const dirs = new Set<string>(),
      skipped: string[] = []
    const row = rowId ? this.row(rowId) : undefined
    if (row) dirs.add(row.path)
    else {
      const walk = async (dir: string, root: string): Promise<void> => {
        try {
          await safePath(root, dir)
          if (await exists(path.join(dir, DATA_DIR))) dirs.add(dir)
          for (const child of await fs.readdir(dir, { withFileTypes: true }))
            if (child.isDirectory() && !child.isSymbolicLink() && child.name !== DATA_DIR)
              await walk(path.join(dir, child.name), root)
        } catch (e) {
          skipped.push(`${dir}: ${message(e)}`)
        }
      }
      for (const root of new Set(this.refs.map((r) => r.root))) await walk(root, root)
    }
    const entries: PlanEntry[] = []
    for (const dir of dirs) {
      try {
        const record = await readFolder(dir),
          files = [folderFile(dir)],
          records = [record],
          meta = path.join(dir, DATA_DIR)
        if (await exists(`${folderFile(dir)}.bak`)) {
          await safePath(dir, `${folderFile(dir)}.bak`)
          const b = await readJson(`${folderFile(dir)}.bak`)
          validateFolder(b)
          files.push(`${folderFile(dir)}.bak`)
          records.push(b)
        }
        if (scope !== 'private') {
          for (const asset of records.flatMap((r) => [
            ...r.assets,
            ...(r.details?.subtitles ?? []),
          ]))
            if (await exists(path.join(meta, asset.relativePath)))
              files.push(path.join(meta, asset.relativePath))
          const projectDir = path.join(meta, 'projects')
          if (await exists(projectDir)) {
            await safePath(dir, projectDir)
            for (const name of await fs.readdir(projectDir)) {
              if (!/^[\w-]+\.json(\.bak)?$/.test(name)) continue
              const file = path.join(projectDir, name)
              await safePath(dir, file)
              const p = await readJson(file)
              validateProject(p)
              if (p.rootFolderId === record.folderId && name.startsWith(`${p.projectId}.json`))
                files.push(file)
            }
          }
        }
        const owned = []
        for (const file of new Set(files)) {
          await safePath(dir, file)
          owned.push({ path: file, hash: await fingerprint(file) })
        }
        entries.push({ dir, record, files: owned })
        // Unknown files are intentionally not included in the deletion plan.
        const known = new Set(owned.map((f) => keyPath(f.path)))
        const inspect = async (folder: string): Promise<void> => {
          for (const e of await fs.readdir(folder, { withFileTypes: true })) {
            const file = path.join(folder, e.name)
            if (e.isDirectory() && !e.isSymbolicLink()) await inspect(file)
            else if (!known.has(keyPath(file)) && scope !== 'private')
              skipped.push(`${file}: 未驗證歸屬，保留`)
          }
        }
        await inspect(meta)
      } catch (e) {
        skipped.push(`${dir}: ${message(e)}`)
      }
    }
    if (scope === 'all' && this.state.legacyAvailable)
      skipped.push(
        `${path.join(this.userData, 'app-data')}: 舊版資料與匯入備份保留，未列入可攜 POC 清理`
      )
    const preview: CleanupPreview = {
      token: randomUUID(),
      paths: entries.flatMap((e) => e.files.map((f) => f.path)),
      skipped,
      count: entries.length,
      scope,
    }
    if (
      scope === 'private' &&
      (!row || !entries[0]?.record.projectOverrides[row.projectId]?.length)
    )
      throw new Error('沒有此專案私有覆寫可清理')
    this.plans.clear()
    this.plans.set(preview.token, { preview, entries, rowId, projectId: row?.projectId })
    return preview
  }
  async cleanup(token: string, restart: boolean): Promise<CleanupResult> {
    const plan = this.plans.get(token)
    if (!plan) throw new Error('清理預覽已失效，請重新預覽')
    this.plans.delete(token)
    for (const e of plan.entries)
      for (const f of e.files) {
        await safePath(e.dir, f.path)
        if ((await fingerprint(f.path)) !== f.hash)
          throw new Error('預覽後資料已變更，清理未執行，請重新預覽')
      }
    const result: CleanupResult = { removed: 0, failed: [], skipped: plan.preview.skipped }
    if (plan.preview.scope === 'private') {
      const e = plan.entries[0],
        record = await readFolder(e.dir)
      delete record.projectOverrides[plan.projectId!]
      await saveFolder(e.dir, record, record.revision)
      result.removed = 1
      await this.scan()
      return result
    }
    const roots = new Set(plan.entries.map((e) => keyPath(e.dir)))
    const retained = this.state.projects.filter((l) => !roots.has(keyPath(l.root)))
    if (plan.preview.scope !== 'all' && !restart)
      for (const linked of retained) {
        const targets = plan.entries
          .filter((e) => within(linked.root, e.dir))
          .map((e) => relPath(linked.root, e.dir))
        if (!targets.length) continue
        const p = await this.currentProject(linked)
        await atomicJson(
          projectFile(linked.root, p.projectId),
          {
            ...p,
            revision: p.revision + 1,
            excludedRelativePaths: [...new Set([...p.excludedRelativePaths, ...targets])],
          },
          p.revision
        )
      }
    // Stop all affected roots before deleting their project definitions.
    this.refs =
      plan.preview.scope === 'all' ? [] : this.refs.filter((r) => !roots.has(keyPath(r.root)))
    await this.persistRefs()
    for (const entry of plan.entries) {
      try {
        const ordered = [
          ...entry.files.filter((f) => f.path !== folderFile(entry.dir)),
          ...entry.files.filter((f) => f.path === folderFile(entry.dir)),
        ]
        for (const f of ordered) {
          await safePath(entry.dir, f.path)
          if ((await fingerprint(f.path)) !== f.hash)
            throw new Error('清理期間檔案已變更，停止此筆清理')
          await fs.unlink(f.path)
        }
        for (const child of ['assets', 'projects', ''])
          await fs.rmdir(path.join(entry.dir, DATA_DIR, child)).catch(() => {})
        result.removed++
      } catch (e) {
        result.failed.push(`${entry.dir}: ${message(e)}`)
      }
    }
    if (plan.preview.scope === 'all')
      for (const file of [this.registry, `${this.registry}.bak`])
        await fs.unlink(file).catch((e) => {
          if (!missing(e)) result.failed.push(`${file}: ${message(e)}`)
        })
    await this.scan()
    return result
  }
  async previewLegacy(): Promise<LegacyPreview> {
    const base = path.join(this.userData, 'app-data'),
      file = path.join(base, 'view.json')
    const views = await readJson(file)
    if (!Array.isArray(views)) throw new Error('舊 view.json 格式無法辨識')
    const token = randomUUID(),
      projects: LegacyPreview['projects'] = [],
      warnings: string[] = []
    for (const view of views) {
      if (
        !view ||
        !/^[\w-]+$/.test(view.id) ||
        typeof view.targetFolderPath !== 'string' ||
        !path.isAbsolute(view.targetFolderPath)
      ) {
        warnings.push('略過無法辨識的舊專案')
        continue
      }
      let count = 0
      try {
        const ids = await readJson(path.join(base, 'viewFolder', `${view.id}.json`))
        if (Array.isArray(ids)) count = ids.length
      } catch (e) {
        warnings.push(`${view.name}: ${message(e)}`)
      }
      projects.push({
        id: view.id,
        name: String(view.name),
        root: view.targetFolderPath,
        values: count,
      })
    }
    warnings.push(
      '只匯入可確認的 STRING 共用值；舊版面及其他型別保留在備份，不視為完整轉換。根路徑失效時先不要匯入。'
    )
    this.legacyPlan = { token, hash: await fingerprint(file), views }
    return { token, projects, warnings }
  }
  async importLegacy(
    token: string,
    ids: string[],
    depth: Project['depth']
  ): Promise<LegacyImportResult> {
    const plan = this.legacyPlan,
      base = path.join(this.userData, 'app-data')
    if (
      !plan ||
      plan.token !== token ||
      plan.hash !== (await fingerprint(path.join(base, 'view.json')))
    )
      throw new Error('匯入預覽已失效')
    const backup = path.join(this.userData, 'legacy-backups', randomUUID())
    await fs.cp(base, backup, {
      recursive: true,
      dereference: false,
      errorOnExist: true,
      force: false,
    })
    const imported: string[] = [],
      warnings: string[] = []
    for (const view of plan.views.filter((v) => ids.includes(v.id))) {
      try {
        if (!/^[\w-]+$/.test(view.id) || typeof view.targetFolderPath !== 'string')
          throw new Error('舊專案格式不符')
        const root = await fs.realpath(view.targetFolderPath)
        let linked = this.state.projects.find(
          (r) => keyPath(r.root) === keyPath(root) && r.project?.legacySourceId === view.id
        )
        const createdForImport = !linked
        if (!linked) {
          if (this.refs.some((r) => keyPath(r.root) === keyPath(root)))
            throw new Error('此根已連結至另一專案，現有資料保留；請先取消連結再匯入')
          await this.create(root, { name: `${view.name}（匯入）`, mediaCategory: 'other', depth })
          linked = this.state.projects.at(-1)!
        }
        const project = linked.project!
        project.legacySourceId = view.id
        const map = new Map<string, { id: string; key: string }>()
        const keys = await readJson(path.join(base, 'viewColumn', `${view.id}.json`))
        for (const key of Array.isArray(keys) ? keys : []) {
          if (typeof key !== 'string' || !/^[\w-]+$/.test(key)) {
            warnings.push('略過無法辨識的舊欄位 key')
            continue
          }
          const col = (await readJson(path.join(base, 'column', `${key}.json`))) as any
          if (col?.dataSource !== 'USER' || col.dataType !== 'STRING' || typeof col.id !== 'string')
            continue
          const attributeId = createHash('sha256').update(`legacy:${col.id}`).digest('hex')
          map.set(key, { id: attributeId, key })
        }
        if (map.size) {
          project.fieldBindings = [...map.values()].map((f) => ({
            alias: f.key,
            attributeId: f.id,
            type: 'string',
          }))
          project.cells = createdForImport
            ? defaultCells(randomUUID, project.fieldBindings[0].attributeId)
            : project.cells.map((c) =>
                c.kind === 'field-text'
                  ? { ...c, attributeId: project.fieldBindings[0].attributeId }
                  : c
              )
        }
        await this.saveProject(project)
        const folders = await readJson(path.join(base, 'viewFolder', `${view.id}.json`))
        for (const folderId of Array.isArray(folders) ? folders : []) {
          try {
            if (typeof folderId !== 'string' || !/^[\w-]+$/.test(folderId))
              throw new Error('舊資料夾 ID 不符')
            const old = (await readJson(path.join(base, 'folder', `${folderId}.json`))) as any
            if (typeof old?.lastReadPath !== 'string' || !within(root, old.lastReadPath))
              throw new Error('舊路徑不在已確認根內')
            await safePath(root, old.lastReadPath)
            const row = this.state.rows.find(
              (r) =>
                r.projectId === project.projectId && keyPath(r.path) === keyPath(old.lastReadPath)
            )
            if (!row?.record || row.error) throw new Error('資料夾不在本次成功掃描結果內')
            const values: Record<string, string> = {}
            for (const cell of Array.isArray(old.cells) ? old.cells : []) {
              const binding = map.get(cell.key)
              if (
                binding &&
                typeof cell.value === 'string' &&
                !row.record.attributes.some((a) => a.attributeId === binding.id)
              )
                values[binding.id] = cell.value
            }
            if (Object.keys(values).length) {
              const record = await readFolder(row.path)
              for (const [attributeId, value] of Object.entries(values))
                record.attributes.push({
                  attributeId,
                  key: [...map.values()].find((v) => v.id === attributeId)!.key,
                  type: 'string',
                  source: 'legacy-import',
                  value,
                })
              await saveFolder(row.path, record, record.revision)
            }
          } catch (e) {
            warnings.push(`${folderId}: ${message(e)}`)
          }
        }
        imported.push(project.name)
      } catch (e) {
        warnings.push(`${view.name}: ${message(e)}`)
      }
    }
    await this.scan()
    return { imported, warnings, backup }
  }
}
