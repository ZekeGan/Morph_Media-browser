import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { DATA_DIR, type FolderRecord, validateFolder, validateProject } from '../shared/model'
import { upgradeStored } from '../shared/upgrade'

export const missing = (e: unknown) => (e as NodeJS.ErrnoException)?.code === 'ENOENT'
export const message = (e: unknown) => (e instanceof Error ? e.message : String(e))
export const folderFile = (dir: string) => path.join(dir, DATA_DIR, 'folder.json')
export const projectFile = (root: string, id: string) =>
  path.join(root, DATA_DIR, 'projects', `${id}.json`)
export const keyPath = (p: string) =>
  process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p)
export function within(root: string, target: string) {
  const rel = path.relative(keyPath(root), keyPath(target))
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel))
}
export const relPath = (root: string, target: string) =>
  path.relative(root, target).split(path.sep).join('/')
export async function exists(file: string) {
  try {
    await fs.lstat(file)
    return true
  } catch (e) {
    if (missing(e)) return false
    throw e
  }
}
// Every path segment below the trusted root is checked, including metadata/assets.
export async function safePath(root: string, target: string) {
  if (!within(root, target)) throw new Error('路徑超出受管範圍')
  const realRoot = await fs.realpath(root)
  if (keyPath(realRoot) !== keyPath(root)) throw new Error('不跟隨符號連結或 junction')
  let current = root
  for (const part of path.relative(root, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    try {
      if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('不跟隨符號連結或 junction')
    } catch (e) {
      if (missing(e)) return
      throw e
    }
  }
}
// Folder and project records (and their .bak copies) come back upgraded to the current format, so every reader
// validates the current shape; a record from a newer version throws NewerFormatError. Other JSON is returned as is.
export async function readJson(file: string): Promise<unknown> {
  return upgradeStored(JSON.parse(await fs.readFile(file, 'utf8')))
}
export async function atomicJson(file: string, value: unknown, expected?: number) {
  const old = await fs.readFile(file).catch((e) => {
    if (missing(e)) return undefined
    throw e
  })
  if (expected !== undefined && (!old || JSON.parse(old.toString()).revision !== expected))
    throw new Error('版本衝突：磁碟資料已改變，草稿保留，請重新載入後比較')
  const tmp = `${file}.${randomUUID()}.tmp`
  const handle = await fs.open(tmp, 'wx')
  try {
    await handle.writeFile(JSON.stringify(value, null, 2))
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    const now = await fs.readFile(file).catch((e) => {
      if (missing(e)) return undefined
      throw e
    })
    if ((old && (!now || !old.equals(now))) || (!old && now))
      throw new Error('版本衝突：寫入期間檔案已改變')
    {
      const backup = `${file}.bak`,
        backupTmp = `${tmp}.bak`
      const stat = await fs.lstat(backup).catch((e) => {
        if (missing(e)) return undefined
        throw e
      })
      if (stat?.isSymbolicLink()) throw new Error('備份路徑不能是符號連結')
      await fs.writeFile(backupTmp, old ?? JSON.stringify(value, null, 2), { flag: 'wx' })
      await fs.rename(backupTmp, backup)
    }
    await fs.rename(tmp, file)
  } finally {
    await fs.unlink(tmp).catch(() => {})
  }
}
export async function readFolder(dir: string): Promise<FolderRecord> {
  await safePath(dir, folderFile(dir))
  // An older record is upgraded in memory only; it is written in the new format when it is next saved.
  const record = await readJson(folderFile(dir))
  validateFolder(record)
  return record
}
// A directory can remain after cleanup because removed-project archives are kept.
// Only empty metadata or verified archives are safe to pair with a fresh identity.
async function reusableMetadata(dir: string): Promise<boolean> {
  const meta = path.join(dir, DATA_DIR)
  await safePath(dir, meta)
  for (const entry of await fs.readdir(meta, { withFileTypes: true })) {
    if (entry.isSymbolicLink() || !entry.isDirectory() || entry.name.toLowerCase() !== 'projects')
      return false
    const projects = path.join(meta, entry.name)
    await safePath(dir, projects)
    for (const archive of await fs.readdir(projects, { withFileTypes: true })) {
      const name = /^([\w-]+)\.json(?:\.bak)?\.removed-([\w-]+)$/.exec(archive.name)
      if (!archive.isFile() || archive.isSymbolicLink() || !name) return false
      const file = path.join(projects, archive.name)
      await safePath(dir, file)
      let project: unknown
      try {
        project = await readJson(file)
      } catch (error) {
        if (error instanceof SyntaxError) return false
        throw error
      }
      try {
        validateProject(project)
      } catch {
        return false
      }
      if (project.projectId !== name[1]) return false
    }
  }
  return true
}
export async function ensureFolder(
  dir: string,
  hide = true
): Promise<{ record: FolderRecord; created: boolean }> {
  const meta = path.join(dir, DATA_DIR)
  const reuse = await exists(meta)
  if (reuse) {
    try {
      return { record: await readFolder(dir), created: false }
    } catch (error) {
      if (!missing(error)) throw error
    }
    if (await exists(`${folderFile(dir)}.bak`))
      throw new Error('資料夾記錄遺失，但復原備份仍存在；請重新連結並從備份復原，未建立新身分')
    if (!(await reusableMetadata(dir)))
      throw new Error('資料夾記錄遺失，但仍有專案、資產或未知資料；原檔保留，請復原原記錄後再試')
    // Recheck after inspecting archives; never intentionally replace a new record.
    if (await exists(folderFile(dir))) return { record: await readFolder(dir), created: false }
  }
  const record: FolderRecord = {
    kind: 'media-viewer.folder',
    schemaVersion: 1,
    folderId: randomUUID(),
    revision: 1,
    attributes: [],
    projectOverrides: {},
    assets: [],
  }
  await safePath(dir, meta)
  if (!reuse)
    try {
      await fs.mkdir(meta)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST')
        return { record: await readFolder(dir), created: false }
      throw e
    }
  try {
    await atomicJson(folderFile(dir), record)
    if (hide && process.platform === 'win32')
      await promisify(execFile)('attrib.exe', ['+H', meta], { windowsHide: true })
  } catch (e) {
    throw new Error(`建立可攜記錄失敗：${message(e)}`)
  }
  return { record, created: true }
}
export async function fingerprint(file: string) {
  return createHash('sha256')
    .update(await fs.readFile(file))
    .digest('hex')
}

// Preserve both the damaged original and known-good backup during recovery.
export async function restoreJson<T extends { revision: number }>(
  root: string,
  file: string,
  validate: (value: unknown) => asserts value is T,
  identity: (value: T) => boolean
) {
  await safePath(root, file)
  await safePath(root, `${file}.bak`)
  const backupBytes = await fs.readFile(`${file}.bak`),
    backup: unknown = upgradeStored(JSON.parse(backupBytes.toString()))
  validate(backup)
  if (!identity(backup)) throw new Error('備份身分與目前專案不符，未復原')
  const original = await fs.readFile(file).catch((error) => {
    if (missing(error)) return undefined
    throw error
  })
  if (original) {
    let current: unknown
    try {
      current = JSON.parse(original.toString())
    } catch {
      current = undefined
    }
    upgradeStored(current)
  }
  if (original) await fs.writeFile(`${file}.${randomUUID()}.damaged`, original, { flag: 'wx' })
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    const handle = await fs.open(temp, 'wx')
    try {
      await handle.writeFile(JSON.stringify({ ...backup, revision: backup.revision + 1 }, null, 2))
      await handle.sync()
    } finally {
      await handle.close()
    }
    await safePath(root, file)
    await safePath(root, `${file}.bak`)
    const current = await fs.readFile(file).catch((error) => {
      if (missing(error)) return undefined
      throw error
    })
    if (
      (original ? !current?.equals(original) : !!current) ||
      !(await fs.readFile(`${file}.bak`)).equals(backupBytes)
    )
      throw new Error('復原期間資料已變更，請重新檢查')
    await fs.rename(temp, file)
  } finally {
    await fs.unlink(temp).catch(() => {})
  }
}
export async function saveFolder(dir: string, next: FolderRecord, revision: number) {
  validateFolder(next)
  await safePath(dir, folderFile(dir))
  const current = await readFolder(dir)
  if (current.folderId !== next.folderId || current.revision !== revision)
    throw new Error('資料夾身分或版本已改變，請重新掃描')
  await atomicJson(folderFile(dir), { ...next, revision: revision + 1 }, revision)
}
