import fs from 'node:fs/promises'
import path from 'node:path'
import { upgradeStored } from '../shared/upgrade'
import { randomUUID } from 'node:crypto'
import {
  DATA_DIR,
  validateFolder,
  validateProject,
  type FolderRecord,
  type CleanupResult,
  type ProjectRemovalPreview,
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
  safePath,
  saveFolder,
  within,
} from './files'
import { detectGame, insideAppBundle } from './game-detection'
import type { FullRemovalPreview } from '../shared/model'
import {
  managedTree,
  applyMaintenance,
  MaintenanceFailure,
  type Change,
  type ManagedFile,
} from './maintenance'
import type { Library } from './library'

export async function previewFullRemoval(
  ex: Library,
  projectId: string
): Promise<FullRemovalPreview> {
  const linked = ex.linked(projectId)
  await ex.currentProject(linked)
  if (await ex.protectedAncestor(linked.root)) throw new Error('此專案位於保護邊界內，只能取消連結')
  const token = randomUUID(),
    tree = await managedTree(linked.root),
    overlaps = ex.state.projects.filter(
      (ref) =>
        ref.projectId !== projectId &&
        (within(linked.root, ref.root) || within(ref.root, linked.root))
    )
  const guards: ManagedFile[] = []
  for (const ref of ex.refs)
    if (within(ref.root, linked.root) && !within(linked.root, ref.root)) {
      const file = projectFile(ref.root, ref.projectId)
      await safePath(ref.root, file)
      const value = await ex.currentProject(ref)
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
    root: ex.userData,
    path: ex.registry,
    hash: await fingerprint(ex.registry),
  })
  if (await exists(ex.registry + '.bak'))
    guards.push({
      root: ex.userData,
      path: ex.registry + '.bak',
      hash: await fingerprint(ex.registry + '.bak'),
    })
  const preview: FullRemovalPreview = {
    token,
    projectId,
    name: linked.project!.name,
    root: linked.root,
    paths: tree.files.map((file) => file.path),
    skipped: [...tree.skipped, '只檢查目前可存取的清理樹與已連結專案；離線、未連結副本無法判斷。'],
    affectedProjects: overlaps.map((ref) => ({
      projectId: ref.projectId,
      name: ref.project?.name ?? ref.projectId,
      root: ref.root,
    })),
    recoveryPath: path.join(ex.userData, 'maintenance-backups', token),
  }
  const absent: string[] = []
  for (const guard of guards.filter((guard) => !guard.path.endsWith('.bak')))
    if (!(await exists(guard.path + '.bak'))) absent.push(guard.path + '.bak')
  ex.fullPlans.clear()
  ex.fullPlans.set(token, { preview, tree, refs: JSON.stringify(ex.refs), guards, absent })
  return preview
}

export async function fullRemoveProject(ex: Library, token: string): Promise<CleanupResult> {
  const plan = ex.fullPlans.get(token)
  ex.fullPlans.delete(token)
  if (!plan || plan.refs !== JSON.stringify(ex.refs))
    throw new Error('完全移除預覽已失效，請重新預覽')
  if (await ex.protectedAncestor(plan.preview.root))
    throw new Error('遊戲保護邊界已變更，移除未執行')
  const tree = await managedTree(plan.preview.root)
  if (JSON.stringify(tree) !== JSON.stringify(plan.tree))
    throw new Error('預覽後資料已變更，移除未執行')
  const nextRefs = ex.refs.filter((ref) => !within(plan.preview.root, ref.root)),
    changes: Change[] = []
  for (const guard of plan.guards) {
    await safePath(guard.root, guard.path)
    if ((await fingerprint(guard.path)) !== guard.hash)
      throw new Error('預覽後專案已變更，移除未執行')
    if (guard.path === ex.registry || guard.path === ex.registry + '.bak')
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
            ...new Set([...project.excludedRelativePaths, relPath(guard.root, plan.preview.root)]),
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
      await ex.maintenanceRecovery(token, [plan.preview.root]),
      ex.userData,
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
      ex.refs = nextRefs
      await ex.scan()
    }
    throw error
  }
  ex.refs = nextRefs
  const result: CleanupResult = {
    removed: tree.files.length,
    failed: [],
    skipped: plan.preview.skipped,
  }
  const removed = [...tree.files.map((file) => file.path)]
  for (const dir of tree.directories)
    try {
      await safePath(plan.preview.root, dir)
      await removeEmptiedDir(dir, removed)
      removed.push(dir)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOTEMPTY') result.skipped.push(`${dir}: 尚有未驗證資料，目錄保留`)
      else if (code !== 'ENOENT') result.failed.push(`${dir}: ${message(error)}`)
    }
  await ex.scan()
  return result
}

// Only retire an otherwise unused, empty root identity. Shared values, manual
// settings, other projects, unknown files and links always keep it in place.
export async function removableRoot(
  ex: Library,
  root: string,
  projectId: string
): Promise<{ path: string; hash: string }[] | undefined> {
  if (
    ex.refs.some(
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

export async function previewRemoveProject(
  ex: Library,
  projectId: string
): Promise<ProjectRemovalPreview> {
  const linked = ex.linked(projectId),
    project = await ex.currentProject(linked)
  if (await ex.protectedAncestor(linked.root))
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
        if (entry.isDirectory() && !entry.isSymbolicLink() && entry.name.toLowerCase() !== DATA_DIR)
          pending.push(path.join(dir, entry.name))
    } catch (error) {
      skipped.push(`${dir}: ${message(error)}`)
    }
  }
  const rootFiles = await ex.removableRoot(linked.root, projectId),
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
    ...(rootFiles ? { recoveryPath: path.join(ex.userData, 'project-removals', token) } : {}),
  }
  if (!rootFiles)
    skipped.push(`${linked.root}: 根記錄仍有共用資料、其他專案或未驗證檔案，保留根身分`)
  for (const file of rootFiles ?? [])
    if (!files.some((item) => item.path === file.path)) files.push(file)
  ex.removalPlans.clear()
  ex.removalPlans.set(preview.token, {
    preview,
    root: linked.root,
    records,
    files,
    definitions,
    rootFiles,
  })
  return preview
}

export async function removeProject(ex: Library, token: string): Promise<CleanupResult> {
  const plan = ex.removalPlans.get(token)
  if (!plan) throw new Error('專案移除預覽已失效，請重新預覽')
  ex.removalPlans.delete(token)
  ex.linked(plan.preview.projectId)
  if (await ex.protectedAncestor(plan.root)) throw new Error('遊戲邊界已變更，移除未執行')
  for (const file of plan.files) {
    await safePath(plan.root, file.path)
    if ((await fingerprint(file.path)) !== file.hash)
      throw new Error('預覽後資料已變更，移除未執行，請重新預覽')
  }
  if (plan.rootFiles) {
    const now = await ex.removableRoot(plan.root, plan.preview.projectId)
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
      if (await ex.protectedAncestor(item.dir))
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
    await ex.scan()
    return result
  }
  const before = ex.refs
  ex.refs = ex.refs.filter((ref) => ref.projectId !== plan.preview.projectId)
  try {
    await ex.persistRefs()
  } catch (error) {
    ex.refs = before
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
      const now = await ex.removableRoot(plan.root, plan.preview.projectId)
      if (
        !now ||
        now.length !== plan.rootFiles.length ||
        now.some(
          (file) => !plan.rootFiles!.some((old) => old.path === file.path && old.hash === file.hash)
        )
      )
        throw new Error('根資料夾內容已變更，根記錄保留')
      const recovery = plan.preview.recoveryPath!
      await safePath(ex.userData, recovery)
      await fs.mkdir(recovery, { recursive: true })
      for (const file of now) {
        const target = path.join(recovery, relPath(plan.root, file.path))
        await safePath(ex.userData, target)
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
      const rechecked = await ex.removableRoot(plan.root, plan.preview.projectId)
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
      const retired = now.map((file) => file.path)
      for (const directory of [
        path.join(plan.root, DATA_DIR, 'projects'),
        path.join(plan.root, DATA_DIR),
      ]) {
        await removeEmptiedDir(directory, retired).catch((error) => {
          if (!missing(error)) throw error
        })
        retired.push(directory)
      }
      result.removed++
    } catch (error) {
      // A late directory/permission failure must not strand unknown data beside a
      // missing identity. Restore only our verified primary, never overwrite a file.
      try {
        const primary = plan.rootFiles.find((file) => file.path === folderFile(plan.root)),
          copy = path.join(plan.preview.recoveryPath!, DATA_DIR, 'folder.json')
        if (primary && !(await exists(primary.path)) && (await exists(copy))) {
          await safePath(ex.userData, copy)
          if ((await fingerprint(copy)) !== primary.hash) throw new Error('復原副本已變更')
          const bytes = await fs.readFile(copy)
          validateFolder(upgradeStored(JSON.parse(bytes.toString())))
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
      result.failed.push(`${plan.root}: ${message(error)}；復原位置：${plan.preview.recoveryPath}`)
    }
  await ex.scan()
  return result
}
