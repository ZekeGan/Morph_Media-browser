import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  DATA_DIR,
  validateFolder,
  validateProject,
  type Project,
  type FolderRecord,
  type CleanupPreview,
  type CleanupResult,
} from '../shared/model'
import {
  atomicJson,
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
  removeEmptiedDir,
  restoreJson,
  safePath,
  saveFolder,
  within,
} from './files'
import type { Library, PlanEntry } from './library'
import { isNewerFormat } from '../shared/upgrade'

export async function previewCleanup(
  ex: Library,
  rowId?: string,
  scope: 'folder' | 'private' | 'all' = 'folder'
): Promise<CleanupPreview> {
  const dirs = new Set<string>(),
    skipped: string[] = []
  const row = rowId ? ex.row(rowId) : undefined
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
    for (const root of new Set(ex.refs.map((r) => r.root))) await walk(root, root)
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
        for (const asset of records.flatMap((r) => [...r.assets, ...(r.details?.subtitles ?? [])]))
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
  const preview: CleanupPreview = {
    token: randomUUID(),
    paths: entries.flatMap((e) => e.files.map((f) => f.path)),
    skipped,
    count: entries.length,
    scope,
  }
  if (scope === 'private' && (!row || !entries[0]?.record.projectOverrides[row.projectId]?.length))
    throw new Error('沒有此專案私有覆寫可清理')
  ex.plans.clear()
  ex.plans.set(preview.token, { preview, entries, rowId, projectId: row?.projectId })
  return preview
}

export async function cleanup(
  ex: Library,
  token: string,
  restart: boolean
): Promise<CleanupResult> {
  const plan = ex.plans.get(token)
  if (!plan) throw new Error('清理預覽已失效，請重新預覽')
  ex.plans.delete(token)
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
    await ex.scan()
    return result
  }
  const roots = new Set(plan.entries.map((e) => keyPath(e.dir)))
  const retained = ex.state.projects.filter((l) => !roots.has(keyPath(l.root)))
  if (plan.preview.scope !== 'all' && !restart)
    for (const linked of retained) {
      const targets = plan.entries
        .filter((e) => within(linked.root, e.dir))
        .map((e) => relPath(linked.root, e.dir))
      if (!targets.length) continue
      const p = await ex.currentProject(linked)
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
  ex.refs = plan.preview.scope === 'all' ? [] : ex.refs.filter((r) => !roots.has(keyPath(r.root)))
  await ex.persistRefs()
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
      const gone = ordered.map((f) => f.path)
      for (const child of ['assets', 'projects', '']) {
        const dir = path.join(entry.dir, DATA_DIR, child)
        // Only a folder that is really gone counts as ours when its parent is removed next.
        if (await removeEmptiedDir(dir, gone).then(() => true, missing)) gone.push(dir)
      }
      result.removed++
    } catch (e) {
      result.failed.push(`${entry.dir}: ${message(e)}`)
    }
  }
  if (plan.preview.scope === 'all')
    for (const file of [ex.registry, `${ex.registry}.bak`])
      await fs.unlink(file).catch((e) => {
        if (!missing(e)) result.failed.push(`${file}: ${message(e)}`)
      })
  await ex.scan()
  return result
}

export async function restore(ex: Library, rowId: string) {
  const row = ex.row(rowId),
    file = folderFile(row.path)
  if (row.readonly || (await ex.protectedAncestor(row.path)))
    throw new Error('此資料夾受遊戲／App 邊界保護')
  await restoreJson(
    ex.linked(row.projectId).root,
    file,
    validateFolder,
    (backup) => !row.record || backup.folderId === row.record.folderId
  )
  return ex.scan()
}

export async function restoreProject(ex: Library, projectId: string) {
  const ref = ex.refs.find((r) => r.projectId === projectId)
  if (!ref) throw new Error('此專案未連結')
  if (await ex.protectedAncestor(ref.root))
    throw new Error('專案位於遊戲／App 保護邊界內，無法復原寫入')
  const file = projectFile(ref.root, projectId)
  let project: Project,
    repairProject = false,
    repairRoot = false
  try {
    project = await ex.currentProject(ref)
  } catch (error) {
    if (isNewerFormat(error)) throw error
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
  } catch (error) {
    if (isNewerFormat(error)) throw error
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
  return ex.scan()
}
