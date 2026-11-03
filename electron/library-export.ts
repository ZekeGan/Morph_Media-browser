import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID, createHash } from 'node:crypto'
import { DATA_DIR, validateFolder, validateProject } from '../shared/model'
import {
  EXPORT_KIND,
  EXPORT_VERSION,
  checkManifest,
  exportPathRole,
  migrateRecord,
  type ExportManifest,
  type ProjectExportResult,
  type ProjectImportPreview,
} from '../shared/project-export'
import {
  atomicJson,
  exists,
  fingerprint,
  keyPath,
  message,
  readFolder,
  readJson,
  relPath,
  safePath,
  within,
} from './files'
import { managedTree } from './maintenance'
import type { Library } from './library'

const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const inBundle = (bundle: string, rel: string) => path.join(bundle, 'files', ...rel.split('/'))

export interface ImportPlan {
  token: string
  bundle: string
  root: string
  manifest: ExportManifest
  expires: number
  blocker?: string
  entries: {
    rel: string
    role: 'folder' | 'project' | 'asset'
    sha256: string
    target: string
    state: 'add' | 'same' | 'conflict'
    existing?: string
  }[]
}
export interface ProjectImportResult {
  written: number
  kept: number
  backup?: string
  projectName: string
}

// One folder with manifest.json and the project's managed files. Nothing in the project folders is changed.
export async function exportProject(
  ex: Library,
  projectId: string,
  dest: string,
  appVersion: string
): Promise<ProjectExportResult> {
  const ref = ex.refs.find((item) => item.projectId === projectId)
  if (!ref) throw new Error('找不到要匯出的專案')
  const root = await fs.realpath(ref.root)
  dest = await fs.realpath(dest)
  if (within(root, dest)) throw new Error('匯出位置不能在專案資料夾內，請選擇其他位置')
  const tree = await managedTree(root)
  const selected = tree.files.filter((file) => {
    const rel = relPath(root, file.path),
      role = exportPathRole(rel)
    if (!role) return false
    return role !== 'project' || rel === `${DATA_DIR}/projects/${projectId}.json`
  })
  const projectPath = selected.find(
    (file) => relPath(root, file.path) === `${DATA_DIR}/projects/${projectId}.json`
  )
  if (!projectPath) throw new Error('專案定義檔不存在或無法驗證，未匯出')
  const project = (await readJson(projectPath.path)) as { name?: unknown }
  const projectName = typeof project.name === 'string' ? project.name : projectId
  const safeName = projectName.replace(/[^\w.-]+/g, '_').slice(0, 40) || 'project'
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
  const out = path.join(dest, `M-orph-export-${safeName}-${stamp}`)
  await fs.mkdir(out)
  try {
    const files: ExportManifest['files'] = []
    for (const file of selected) {
      const rel = relPath(root, file.path),
        bytes = await fs.readFile(file.path),
        target = inBundle(out, rel)
      if (sha(bytes) !== file.hash) throw new Error(`匯出期間檔案已改變，請重試：${rel}`)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, bytes, { flag: 'wx' })
      files.push({ path: rel, sha256: file.hash, size: bytes.length })
    }
    const manifest: ExportManifest = {
      kind: EXPORT_KIND,
      schemaVersion: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion,
      projectId,
      projectName,
      files,
    }
    await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2), {
      flag: 'wx',
    })
    return { dir: out, files: files.length, skipped: tree.skipped.length }
  } catch (error) {
    await fs.rm(out, { recursive: true, force: true })
    throw error
  }
}

export async function previewProjectImport(
  ex: Library,
  bundle: string,
  targetRoot: string
): Promise<ProjectImportPreview> {
  bundle = await fs.realpath(bundle)
  targetRoot = await fs.realpath(targetRoot)
  if (within(bundle, targetRoot) || within(targetRoot, bundle))
    throw new Error('匯出資料夾與目標資料夾不能互相包含')
  const manifestFile = path.join(bundle, 'manifest.json')
  await safePath(bundle, manifestFile)
  if ((await fs.stat(manifestFile)).size > 16 * 1024 * 1024) throw new Error('匯出清單過大')
  const manifest = checkManifest(await readJson(manifestFile)),
    warnings: string[] = []
  let blocker: string | undefined
  const protectedBy = await ex.protectedAncestor(targetRoot)
  if (protectedBy) blocker = `目標位置受遊戲／App 邊界保護，請選擇外層資料夾：${protectedBy}`
  const linked = ex.refs.find((ref) => ref.projectId === manifest.projectId)
  if (linked && keyPath(linked.root) !== keyPath(targetRoot) && (await exists(linked.root)))
    blocker = `同一專案仍連結在另一個位置：${linked.root}。若要搬移，請先取消那個連結`
  const entries: ImportPlan['entries'] = [],
    missingDirs = new Set<string>(),
    protectedDirs = new Set<string>(),
    okDirs = new Map<string, boolean>(),
    keptDirs = new Set<string>()
  const usable = async (dir: string) => {
    const cached = okDirs.get(dir)
    if (cached !== undefined) return cached
    let ok = false
    try {
      await safePath(targetRoot, dir)
      ok = (await fs.stat(dir)).isDirectory()
    } catch {
      ok = false
    }
    if (!ok) missingDirs.add(dir)
    else if (dir !== targetRoot && (await ex.protectedAncestor(dir))) {
      protectedDirs.add(dir)
      ok = false
    }
    okDirs.set(dir, ok)
    return ok
  }
  for (const file of manifest.files) {
    const source = inBundle(bundle, file.path)
    await safePath(bundle, source)
    const stat = await fs.stat(source).catch(() => undefined)
    if (!stat?.isFile() || stat.size !== file.size) throw new Error(`匯出資料不完整：${file.path}`)
    if ((await fingerprint(source)) !== file.sha256) throw new Error(`匯出資料已損壞：${file.path}`)
    const segments = file.path.split('/'),
      meta = segments.findIndex((s) => s.toLowerCase() === DATA_DIR),
      dir = path.join(targetRoot, ...segments.slice(0, meta))
    if (!(await usable(dir))) continue
    const target = path.join(targetRoot, ...segments),
      role = exportPathRole(file.path)!
    if (role === 'project' && meta !== 0) continue
    await safePath(targetRoot, target)
    let state: ImportPlan['entries'][number]['state'] = 'add',
      existing: string | undefined
    if (await exists(target)) {
      existing = await fingerprint(target)
      state = existing === file.sha256 ? 'same' : 'conflict'
    }
    if (state !== 'add' && role === 'folder') keptDirs.add(dir)
    entries.push({ rel: file.path, role, sha256: file.sha256, target, state, existing })
  }
  if (!entries.some((entry) => entry.role === 'project'))
    warnings.push('這個位置沒有可放入專案定義的資料夾，無法匯入')
  const conflicts = entries.filter((entry) => entry.state === 'conflict').length
  if (conflicts)
    warnings.push(
      '部分檔案在目標位置已有不同內容；預設保留現有內容。勾選覆寫會先備份，但已有記錄的資料夾一律保留現有記錄'
    )
  if (missingDirs.size) warnings.push('匯出資料中的部分資料夾在目標位置不存在，已略過')
  if (protectedDirs.size) warnings.push('部分資料夾位於遊戲邊界內，為保護內部檔案已略過')
  const token = randomUUID()
  ex.importPlans.set(token, {
    token,
    bundle,
    root: targetRoot,
    manifest,
    expires: Date.now() + 3600000,
    blocker,
    entries,
  })
  for (const [id, plan] of ex.importPlans) if (plan.expires < Date.now()) ex.importPlans.delete(id)
  return {
    token,
    bundle,
    projectName: manifest.projectName,
    root: targetRoot,
    folders: entries.filter((entry) => entry.role === 'folder').length,
    files: entries.length,
    added: entries.filter((entry) => entry.state === 'add').length,
    same: entries.filter((entry) => entry.state === 'same').length,
    conflicts,
    missingFolders: missingDirs.size,
    protectedSkipped: protectedDirs.size,
    fromVersion: manifest.schemaVersion,
    warnings,
    blocker,
  }
}

export async function applyProjectImport(
  ex: Library,
  token: string,
  overwrite: boolean
): Promise<ProjectImportResult> {
  const plan = ex.importPlans.get(token)
  if (!plan || plan.expires < Date.now()) throw new Error('匯入預覽已失效，請重新選擇')
  ex.importPlans.delete(token)
  if (plan.blocker) throw new Error(plan.blocker)
  const projectEntry = plan.entries.find((entry) => entry.role === 'project')
  if (!projectEntry) throw new Error('沒有可匯入的專案定義')
  // Re-check everything the preview saw: bundle bytes are read once and written from memory.
  const bytes = new Map<string, Buffer>()
  for (const entry of plan.entries) {
    const source = inBundle(plan.bundle, entry.rel)
    await safePath(plan.bundle, source)
    const data = await fs.readFile(source)
    if (sha(data) !== entry.sha256) throw new Error(`匯出資料已改變：${entry.rel}`)
    bytes.set(entry.rel, data)
    await safePath(plan.root, entry.target)
    const now = (await exists(entry.target)) ? await fingerprint(entry.target) : undefined
    if (now !== entry.existing) throw new Error(`目標檔案在預覽後已改變，請重新預覽：${entry.rel}`)
  }
  // Existing folder records keep their identity and content even when overwrite is chosen.
  const todo = plan.entries.filter(
    (entry) =>
      entry.state === 'add' ||
      (entry.state === 'conflict' && overwrite === true && entry.role !== 'folder')
  )
  // Parse, upgrade and validate every record first; nothing is written if any of them is unusable.
  const values = new Map<string, any>()
  for (const entry of todo.filter((item) => item.role !== 'asset')) {
    const kind = entry.role as 'folder' | 'project'
    const value = migrateRecord(
      plan.manifest.schemaVersion,
      JSON.parse(bytes.get(entry.rel)!.toString('utf8')),
      kind
    ) as any
    if (kind === 'folder') validateFolder(value)
    else validateProject(value)
    values.set(entry.rel, value)
  }
  const revisionOf = async (file: string) => {
    try {
      const value = (await readJson(file)) as { revision?: unknown }
      return Number.isSafeInteger(value.revision) ? (value.revision as number) : undefined
    } catch {
      return undefined
    }
  }
  const backup = path.join(ex.userData, 'import-backups', randomUUID())
  const copies = new Set<string>()
  const backUp = async (file: string) => {
    const copy = path.join(backup, 'files', ...relPath(plan.root, file).split('/'))
    await fs.mkdir(path.dirname(copy), { recursive: true })
    await fs.copyFile(file, copy, fs.constants.COPYFILE_EXCL)
    copies.add(keyPath(file))
  }
  const restore = async (file: string) => {
    const copy = path.join(backup, 'files', ...relPath(plan.root, file).split('/'))
    await fs.copyFile(copy, file)
  }
  const written: { target: string; existed: boolean }[] = []
  const hadRef = ex.refs.some((ref) => ref.projectId === plan.manifest.projectId)
  const order = { asset: 0, folder: 1, project: 2 } as const
  try {
    for (const entry of [...todo].sort((a, b) => order[a.role] - order[b.role])) {
      const segments = entry.rel.split('/'),
        metaDir = path.join(
          plan.root,
          ...segments.slice(0, segments.findIndex((s) => s.toLowerCase() === DATA_DIR) + 1)
        )
      const metaExisted = await exists(metaDir)
      // Anything this write could replace (the file and its last-known-good copy) is saved first.
      const existed = entry.state === 'conflict'
      if (existed) await backUp(entry.target)
      if (await exists(`${entry.target}.bak`)) await backUp(`${entry.target}.bak`)
      await safePath(plan.root, path.dirname(entry.target))
      await fs.mkdir(path.dirname(entry.target), { recursive: true })
      await safePath(plan.root, entry.target)
      if (!metaExisted && ex.hide && process.platform === 'win32')
        await promisify(execFile)('attrib.exe', ['+H', metaDir], { windowsHide: true }).catch(
          () => {}
        )
      if (entry.role === 'asset') {
        const tmp = `${entry.target}.${randomUUID()}.tmp`
        try {
          await fs.writeFile(tmp, bytes.get(entry.rel)!, { flag: 'wx' })
          await fs.rename(tmp, entry.target)
        } finally {
          await fs.rm(tmp, { force: true })
        }
        written.push({ target: entry.target, existed })
        continue
      }
      const value = values.get(entry.rel)
      const old = existed ? await revisionOf(entry.target) : undefined
      if (old !== undefined) value.revision = Math.max(old, value.revision) + 1
      if (entry.role === 'project') {
        if (!(await exists(path.join(plan.root, DATA_DIR, 'folder.json'))))
          throw new Error('目標根資料夾沒有記錄，無法連結專案')
        value.rootFolderId = (await readFolder(plan.root)).folderId
        validateProject(value)
      }
      await atomicJson(entry.target, value, old)
      written.push({ target: entry.target, existed })
    }
    await ex.link(plan.root)
  } catch (error) {
    let incomplete = false
    for (const item of written.reverse())
      try {
        if (item.existed) await restore(item.target)
        else await fs.rm(item.target, { force: true })
        if (copies.has(keyPath(`${item.target}.bak`))) await restore(`${item.target}.bak`)
        else if (!item.existed) await fs.rm(`${item.target}.bak`, { force: true })
      } catch {
        incomplete = true
      }
    if (!hadRef && ex.refs.some((ref) => ref.projectId === plan.manifest.projectId))
      await ex.unlink(plan.manifest.projectId).catch(() => {
        incomplete = true
      })
    throw new Error(
      `匯入失敗：${message(error)}${incomplete ? '；部分變更無法自動還原' : '；已還原變更'}${copies.size ? `（備份：${backup}）` : ''}`
    )
  }
  return {
    written: todo.length,
    kept: plan.entries.length - todo.length,
    backup: copies.size ? backup : undefined,
    projectName: plan.manifest.projectName,
  }
}
