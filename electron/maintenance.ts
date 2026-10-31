import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import {
  DATA_DIR,
  validateFolder,
  validateProject,
  type FolderRecord,
  type Project,
} from '../shared/model'
import { fingerprint, exists, keyPath, within, safePath, readJson, message } from './files'

export interface ManagedFile {
  root: string
  path: string
  hash: string
}
export interface Change extends ManagedFile {
  value?: unknown
  stopScan?: boolean
}
export class MaintenanceFailure extends Error {
  constructor(
    message: string,
    readonly rollbackIncomplete: boolean
  ) {
    super(message)
  }
}
export async function managedTree(root: string) {
  const files: ManagedFile[] = [],
    skipped: string[] = [],
    directories: string[] = []
  const add = async (file: string) => {
    await safePath(root, file)
    if (await exists(file)) files.push({ root, path: file, hash: await fingerprint(file) })
  }
  const inspect = async (dir: string, meta: string) => {
    const records: FolderRecord[] = []
    for (const suffix of ['', '.bak']) {
      const file = path.join(meta, 'folder.json' + suffix)
      if (!(await exists(file))) continue
      try {
        await safePath(root, file)
        const value = await readJson(file)
        validateFolder(value)
        records.push(value)
        await add(file)
      } catch (error) {
        skipped.push(`${file}: ${message(error)}`)
      }
    }
    if (!records.length) {
      skipped.push(`${meta}: 無有效身分記錄，保留`)
      return
    }
    if (new Set(records.map((record) => record.folderId)).size !== 1)
      throw new Error(`${meta}: 主記錄與備份身分不符`)
    const projects = path.join(meta, 'projects')
    if (await exists(projects)) {
      await safePath(root, projects)
      for (const name of await fs.readdir(projects)) {
        const match = /^([\w-]+)\.json(?:\.bak)?(?:\.removed-[\w-]+)?$/.exec(name),
          file = path.join(projects, name)
        if (!match) continue
        try {
          await safePath(root, file)
          const project = await readJson(file)
          validateProject(project)
          if (project.projectId !== match[1] || project.rootFolderId !== records[0].folderId)
            throw new Error('專案身分不符')
          await add(file)
        } catch (error) {
          skipped.push(`${file}: ${message(error)}`)
        }
      }
    }
    for (const asset of records.flatMap((record) => [
      ...record.assets,
      ...(record.details?.subtitles ?? []),
    ]))
      await add(path.join(meta, asset.relativePath))
    const known = new Set(files.map((file) => keyPath(file.path)))
    const unknown = async (folder: string) => {
      await safePath(root, folder)
      directories.push(folder)
      for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
        const file = path.join(folder, entry.name)
        if (entry.isDirectory() && !entry.isSymbolicLink()) await unknown(file)
        else if (!known.has(keyPath(file))) skipped.push(`${file}: 未驗證歸屬，保留`)
      }
    }
    await unknown(meta)
  }
  const pending = [root]
  while (pending.length) {
    const dir = pending.pop()!
    await safePath(root, dir)
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        skipped.push(`${file}: 連結保留`)
        continue
      }
      if (!entry.isDirectory()) continue
      if (entry.name.toLowerCase() === DATA_DIR) await inspect(dir, file)
      else pending.push(file)
    }
  }
  return {
    files: [...new Map(files.map((file) => [keyPath(file.path), file])).values()].sort((a, b) =>
      a.path.localeCompare(b.path)
    ),
    skipped: skipped.sort(),
    directories: directories.sort((a, b) => b.length - a.length),
  }
}

// Both destructive operations use the same small, file-level recovery protocol.
// Values are JSON; undefined means delete the verified application-owned file.
export async function applyMaintenance(
  changes: Change[],
  recovery: string,
  userData: string,
  forbiddenRoots: string[],
  beforeApply?: () => Promise<void>
) {
  for (const root of forbiddenRoots)
    if (within(root, recovery)) throw new Error('復原副本必須位於所有修改範圍外')
  await safePath(userData, recovery)
  const check = async (change: ManagedFile) => {
    await safePath(change.root, change.path)
    if ((await fingerprint(change.path)) !== change.hash)
      throw new Error('預覽後資料已變更，請重新預覽')
  }
  for (const change of changes) await check(change)
  await fs.mkdir(recovery, { recursive: false })
  const originals: Buffer[] = [],
    applied: number[] = []
  const write = async (file: string, bytes: Buffer) => {
    const temp = file + '.' + randomUUID() + '.tmp',
      handle = await fs.open(temp, 'wx')
    try {
      await handle.writeFile(bytes)
      await handle.sync()
      await handle.close()
      await fs.rename(temp, file)
    } finally {
      await handle.close().catch(() => {})
      await fs.unlink(temp).catch(() => {})
    }
  }
  const expected = new Map<number, string | undefined>()
  for (const [index, change] of changes.entries()) {
    await check(change)
    const bytes = await fs.readFile(change.path)
    originals.push(bytes)
    const backup = path.join(recovery, String(index)),
      handle = await fs.open(backup, 'wx')
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
    if ((await fingerprint(backup)) !== change.hash) throw new Error('備份驗證失敗，未修改資料')
  }
  await write(
    path.join(recovery, 'manifest.json'),
    Buffer.from(
      JSON.stringify(
        {
          version: 1,
          files: changes.map((change, index) => ({
            path: change.path,
            hash: change.hash,
            backup: String(index),
          })),
        },
        null,
        2
      )
    )
  )
  await beforeApply?.()
  try {
    for (const [index, change] of changes.entries()) {
      await check(change)
      if (change.value === undefined) {
        await fs.unlink(change.path)
        expected.set(index, undefined)
      } else {
        const bytes = Buffer.from(JSON.stringify(change.value, null, 2) + '\n')
        await write(change.path, bytes)
        expected.set(index, createHash('sha256').update(bytes).digest('hex'))
      }
      applied.push(index)
    }
    for (const index of applied) {
      const change = changes[index],
        actual = (await exists(change.path)) ? await fingerprint(change.path) : undefined
      if (actual !== expected.get(index)) throw new Error('寫入期間檔案已變更，請檢查復原副本')
    }
  } catch (error) {
    const failed: string[] = []
    for (const index of applied.reverse())
      try {
        const change = changes[index]
        // Missing metadata must stay excluded if any data restoration failed.
        if (change.stopScan && failed.length) continue
        await safePath(change.root, change.path)
        const current = (await exists(change.path)) ? await fingerprint(change.path) : undefined
        if (current !== expected.get(index)) throw new Error('復原期間檔案已變更，保留外部修改')
        await write(change.path, originals[index])
      } catch (restoreError) {
        failed.push(message(restoreError))
      }
    throw new MaintenanceFailure(
      `${message(error)}；${failed.length ? '部分復原未完成，保留停止掃描設定：' + failed.join('；') : '已復原本次寫入'}；復原位置：${recovery}`,
      failed.length > 0
    )
  }
  return recovery
}

export function withoutField(project: Project, attributeId: string) {
  const next = structuredClone(project),
    cells = (items: Project['cells']): Project['cells'] =>
      items.filter(
        (cell) => cell.attributeId !== attributeId && cell.condition?.attributeId !== attributeId
      )
  next.fieldBindings = next.fieldBindings.filter((field) => field.attributeId !== attributeId)
  next.cells = cells(next.cells)
  next.layoutPresets = next.layoutPresets?.map((preset) => ({
    ...preset,
    cells: cells(preset.cells),
  }))
  if (next.contentCells)
    next.contentCells = Object.fromEntries(
      Object.entries(next.contentCells).map(([key, items]) => [key, cells(items)])
    )
  next.savedSearches = next.savedSearches?.filter(
    (search) => !search.queryAst?.groups.flat().some((term) => term.field === attributeId)
  )
  return next
}
