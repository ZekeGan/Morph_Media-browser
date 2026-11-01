import { parseQuery, stabilizeQuery, type QueryField } from '../shared/query'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { validateFolder, validateProject, type Project, type FolderRecord } from '../shared/model'
import {
  exists,
  fingerprint,
  folderFile,
  keyPath,
  message,
  projectFile,
  readFolder,
  readJson,
  safePath,
  within,
} from './files'
import type { FieldDeletionPreview } from '../shared/model'
import { applyMaintenance, withoutField, type Change, type ManagedFile } from './maintenance'
import type { Library } from './library'

export function fieldScope(ex: Library) {
  return JSON.stringify(
    (ex.state.structure ?? ex.state.rows)
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

export async function previewDeleteField(
  ex: Library,
  projectId: string,
  attributeId: string
): Promise<FieldDeletionPreview> {
  const linked = ex.linked(projectId),
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
      recoveryPath: path.join(ex.userData, 'maintenance-backups', token),
    }
  const changes: Change[] = [],
    guards: ManagedFile[] = [],
    affected = new Set<string>(),
    linkedIds = new Set(ex.refs.map((ref) => ref.projectId))
  const fields: QueryField[] = []
  for (const ref of ex.state.projects) {
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
    for (const row of (ex.state.structure ?? ex.state.rows).filter(
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
  for (const ref of ex.state.projects) {
    if (!ref.project || ref.error) {
      preview.skipped.push(`${ref.root}: 專案不可用，保留`)
      continue
    }
    const file = projectFile(ref.root, ref.projectId)
    await safePath(ref.root, file)
    const project = await ex.currentProject(ref),
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
      if (await ex.protectedAncestor(ref.root))
        throw new Error('受影響專案位於保護邊界內，無法安全刪除欄位')
      affected.add(ref.projectId)
    }
  }
  const rows = [
    ...new Map(
      (ex.state.structure ?? ex.state.rows)
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
      if (await ex.protectedAncestor(row.path))
        throw new Error('受影響記錄位於保護邊界內，無法安全刪除欄位')
      preview.folders++
      for (const ref of ex.state.projects)
        if (within(ref.root, row.path)) affected.add(ref.projectId)
    }
  }
  preview.projects = ex.state.projects
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
  ex.fieldPlans.clear()
  ex.fieldPlans.set(token, {
    preview,
    changes,
    guards,
    refs: JSON.stringify(ex.refs),
    scope: ex.fieldScope(),
    absent,
  })
  return preview
}

export async function deleteField(ex: Library, token: string) {
  const plan = ex.fieldPlans.get(token)
  ex.fieldPlans.delete(token)
  if (!plan || plan.refs !== JSON.stringify(ex.refs) || plan.scope !== ex.fieldScope())
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
      if (await ex.protectedAncestor(root)) throw new Error('保護邊界已變更，刪除未執行')
  }
  await check()
  const recovery = await ex.maintenanceRecovery(
    token,
    ex.refs.map((ref) => ref.root)
  )
  await applyMaintenance(
    plan.changes,
    recovery,
    ex.userData,
    ex.refs.map((ref) => ref.root),
    check
  )
  await ex.scan()
  return recovery
}
