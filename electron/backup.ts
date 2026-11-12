import { fmt } from '../shared/message'
// Backup and restore: one folder with the settings package and an export of every linked project.
// Restoring reuses the project import (preview, checksums, rollback) and the settings import (backup first).
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  BACKUP_ID,
  BACKUP_KIND,
  BACKUP_VERSION,
  checkBackupManifest,
  type BackupEntry,
  type BackupManifest,
  type BackupPreview,
  type BackupProjectPreview,
} from '../shared/backup'
import type { ProjectImportPreview } from '../shared/project-export'
import { DATA_DIR } from '../shared/model'
import { exists, message, readJson, safePath, within } from './files'
import { writeSettingsFile } from './settings-file'
import type { Library } from './library'
import type { WorkspaceStore } from './workspace'

interface BackupPlan {
  dir: string
  manifest: BackupManifest
  settingsToken?: string
  imports: Map<string, ProjectImportPreview>
  projects: BackupProjectPreview[]
  expires: number
}
const plans = new Map<string, BackupPlan>()

export async function createBackup(
  library: Library,
  workspace: WorkspaceStore,
  ids: string[],
  parent: string,
  appVersion: string,
  label: 'manual' | 'auto' = 'manual'
) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
  parent = await fs.realpath(parent)
  // Inside a project's folder the copied records would be scanned as that project's folders.
  for (const linked of library.snapshot().projects)
    if (within(linked.root, parent))
      throw new Error(fmt('備份位置不能放在專案資料夾裡，請選擇其他位置：{0}', linked.root))
  // Two backups in the same second get a counter instead of failing.
  let out = path.join(parent, `M-orph-backup-${stamp}`)
  for (let n = 2; ; n++)
    try {
      await fs.mkdir(out)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || n > 99) throw error
      out = path.join(parent, `M-orph-backup-${stamp}-${n}`)
    }
  try {
    // A damaged settings file must not stop a backup (and so a restore) of the projects.
    let settings: string | undefined = 'settings.json'
    const projects: BackupManifest['projects'] = [],
      skipped: string[] = []
    try {
      const state = await workspace.update({ action: 'exportPackage' }, ids)
      await writeSettingsFile(path.join(out, 'settings.json'), state.settingsPackage!)
    } catch (error) {
      settings = undefined
      skipped.push(fmt('設定：{0}', message(error)))
    }
    const projectsDir = path.join(out, 'projects')
    await fs.mkdir(projectsDir)
    for (const linked of library.snapshot().projects) {
      const name = linked.project?.name ?? linked.root
      if (!linked.project || linked.error) {
        skipped.push(name)
        continue
      }
      try {
        const result = await library.exportProject(linked.projectId, projectsDir, appVersion)
        projects.push({
          projectId: linked.projectId,
          name: linked.project.name,
          root: linked.root,
          dir: path.relative(out, result.dir).split(path.sep).join('/'),
        })
      } catch (error) {
        skipped.push(`${name}：${message(error)}`)
      }
    }
    const manifest: BackupManifest = {
      kind: BACKUP_KIND,
      schemaVersion: BACKUP_VERSION,
      createdAt: new Date().toISOString(),
      appVersion,
      label,
      settings,
      projects,
    }
    await fs.writeFile(path.join(out, 'backup.json'), JSON.stringify(manifest, null, 2), {
      flag: 'wx',
    })
    return { dir: out, id: path.basename(out), projects: projects.length, skipped }
  } catch (error) {
    await fs.rm(out, { recursive: true, force: true })
    throw error
  }
}

const isDirectory = async (dir: string) =>
  (await fs.stat(dir).catch(() => undefined))?.isDirectory()

async function previewProject(
  library: Library,
  plan: BackupPlan,
  index: number,
  root: string,
  chosen: boolean
) {
  const entry = plan.manifest.projects[index]
  const bundle = path.join(plan.dir, ...entry.dir.split('/'))
  await safePath(plan.dir, bundle)
  const base = { projectId: entry.projectId, name: entry.name, root }
  plan.imports.delete(entry.projectId)
  // A root written in backup.json is only a hint: network or device paths are never probed, and a local folder
  // counts as found only when this project's own definition is already there. Anything else needs "locate".
  if (!chosen) {
    if (!path.isAbsolute(root) || /^[\\/]{2}/.test(root) || !(await isDirectory(root)))
      return { ...base, state: 'missing' } as BackupProjectPreview
    const definition = path.join(root, DATA_DIR, 'projects', `${entry.projectId}.json`)
    if (!(await exists(definition))) return { ...base, state: 'missing' } as BackupProjectPreview
  } else if (!(await isDirectory(root)))
    return { ...base, state: 'missing' } as BackupProjectPreview
  try {
    const preview = await library.previewProjectImport(bundle, root)
    plan.imports.set(entry.projectId, preview)
    return {
      ...base,
      root: preview.root,
      state: preview.blocker ? 'blocked' : 'ready',
      message: preview.blocker ?? preview.warnings.join(' '),
      folders: preview.folders,
    } as BackupProjectPreview
  } catch (error) {
    return { ...base, state: 'blocked', message: message(error) } as BackupProjectPreview
  }
}
const view = (token: string, plan: BackupPlan, changes?: number): BackupPreview => ({
  token,
  createdAt: plan.manifest.createdAt,
  settings: changes === undefined ? undefined : { changes },
  projects: plan.projects,
})

export async function previewBackup(
  library: Library,
  workspace: WorkspaceStore,
  ids: string[],
  chosen: string
): Promise<BackupPreview> {
  const dir = await fs.realpath(chosen)
  const manifestFile = path.join(dir, 'backup.json')
  await safePath(dir, manifestFile)
  const stat = await fs.stat(manifestFile).catch(() => undefined)
  if (!stat?.isFile()) throw new Error('這個資料夾不是 M:orph 備份（找不到 backup.json）')
  if (stat.size > 4 * 1024 * 1024) throw new Error('備份清單過大')
  const manifest = checkBackupManifest(await readJson(manifestFile))
  const plan: BackupPlan = {
    dir,
    manifest,
    imports: new Map(),
    projects: [],
    expires: Date.now() + 3600000,
  }
  let changes: number | undefined
  if (manifest.settings) {
    const file = path.join(dir, ...manifest.settings.split('/'))
    await safePath(dir, file)
    try {
      const settingsStat = await fs.stat(file)
      if (!settingsStat.isFile() || settingsStat.size > 4 * 1024 * 1024)
        throw new Error('備份裡的設定檔不完整')
      const state = await workspace.update(
        { action: 'previewPackage', value: JSON.parse(await fs.readFile(file, 'utf8')) },
        ids
      )
      plan.settingsToken = state.importPreview?.token
      changes = state.importPreview?.changes.length ?? 0
    } catch {
      // A damaged settings file leaves only the projects to restore.
      plan.settingsToken = undefined
    }
  }
  for (let index = 0; index < manifest.projects.length; index++)
    plan.projects.push(
      await previewProject(library, plan, index, manifest.projects[index].root, false)
    )
  const token = randomUUID()
  for (const [id, old] of plans) if (old.expires < Date.now()) plans.delete(id)
  plans.set(token, plan)
  return view(token, plan, changes)
}

const live = (token: string) => {
  const plan = plans.get(token)
  if (!plan || plan.expires < Date.now()) throw new Error('還原預覽已失效，請重新選擇備份')
  return plan
}

// The user picks where a project's folder is now (moved drive, new computer).
export async function locateBackupProject(
  library: Library,
  token: string,
  projectId: string,
  root: string
): Promise<BackupPreview> {
  const plan = live(token)
  const index = plan.manifest.projects.findIndex((p) => p.projectId === projectId)
  if (index < 0) throw new Error('備份裡沒有這個專案')
  plan.projects[index] = await previewProject(library, plan, index, root, true)
  return view(token, plan, plan.settingsToken === undefined ? undefined : 0)
}

export async function applyBackup(
  library: Library,
  workspace: WorkspaceStore,
  ids: () => string[],
  token: string,
  settings: boolean,
  projectIds: string[]
) {
  const plan = live(token)
  plans.delete(token)
  const restored: string[] = [],
    failed: string[] = []
  for (const projectId of projectIds) {
    const entry = plan.projects.find((p) => p.projectId === projectId),
      preview = plan.imports.get(projectId)
    if (!entry || !preview || entry.state !== 'ready') {
      failed.push(fmt('{0}：找不到可還原的位置', entry?.name ?? projectId))
      continue
    }
    try {
      await library.applyProjectImport(preview.token, false)
      restored.push(entry.name)
    } catch (error) {
      failed.push(`${entry.name}：${message(error)}`)
    }
  }
  // Settings go last so groups and favourites can refer to the projects restored above.
  // Restoring projects only fills in what is missing, so only the settings can be undone: the settings
  // package saves the current settings first, and its id lets the window offer "back to before the restore".
  let settingsUndo: string | undefined
  if (settings && plan.settingsToken)
    try {
      const state = await workspace.update(
        { action: 'applyPackage', token: plan.settingsToken, mode: 'replace' },
        ids()
      )
      settingsUndo = state.backupId
    } catch (error) {
      failed.push(fmt('設定：{0}', message(error)))
    }
  return { projects: restored, failed, settings: !!settingsUndo, settingsUndo }
}

// Backups kept in the app's own data folder: one list for manual and automatic backups.
export const backupsDir = (library: Library) => path.join(library.userData, 'backups')

async function folderSize(dir: string): Promise<number> {
  let total = 0
  for (const entry of await fs.readdir(dir, { withFileTypes: true }))
    if (entry.isFile()) total += (await fs.stat(path.join(dir, entry.name))).size
    else if (entry.isDirectory() && !entry.isSymbolicLink())
      total += await folderSize(path.join(dir, entry.name))
  return total
}

// A kept backup by id; the id comes from the window, so it must look like one and stay inside the folder.
export async function keptBackup(library: Library, id: string) {
  if (typeof id !== 'string' || !BACKUP_ID.test(id)) throw new Error('備份不存在')
  const dir = backupsDir(library),
    target = path.join(dir, id)
  await safePath(dir, target)
  if (!(await exists(path.join(target, 'backup.json')))) throw new Error('備份不存在')
  return target
}

export async function listBackups(library: Library): Promise<BackupEntry[]> {
  const dir = backupsDir(library)
  const names = await fs.readdir(dir).catch(() => [] as string[])
  const entries: BackupEntry[] = []
  for (const id of names.filter((name) => BACKUP_ID.test(name)))
    try {
      const target = await keptBackup(library, id)
      const manifest = checkBackupManifest(await readJson(path.join(target, 'backup.json')))
      entries.push({
        id,
        createdAt: manifest.createdAt,
        label: manifest.label ?? 'manual',
        size: await folderSize(target),
        projects: manifest.projects.length,
      })
    } catch {
      // A damaged or foreign folder is not listed and not touched.
    }
  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function deleteBackup(library: Library, id: string) {
  await fs.rm(await keptBackup(library, id), { recursive: true })
}

// Copies a kept backup to another place (another disk, another computer).
export async function exportBackup(library: Library, id: string, dest: string) {
  const source = await keptBackup(library, id)
  dest = await fs.realpath(dest)
  for (const linked of library.snapshot().projects)
    if (within(linked.root, dest))
      throw new Error(fmt('匯出位置不能放在專案資料夾裡，請選擇其他位置：{0}', linked.root))
  if (within(backupsDir(library), dest)) throw new Error('請選擇程式備份資料夾以外的位置')
  const target = path.join(dest, id)
  if (await exists(target)) throw new Error(fmt('這個位置已經有同名的備份：{0}', target))
  try {
    await fs.cp(source, target, { recursive: true, errorOnExist: true, force: false })
  } catch (error) {
    // An incomplete copy would look like a backup; only what this call created is removed.
    await fs.rm(target, { recursive: true, force: true })
    throw error
  }
  return target
}

// A backup in the app's own folder. (Backups labelled 'auto' were made before restores by an earlier
// version; they stay listed until the user deletes them.)
export async function createKeptBackup(
  library: Library,
  workspace: WorkspaceStore,
  ids: string[],
  appVersion: string
) {
  await fs.mkdir(backupsDir(library), { recursive: true })
  return createBackup(library, workspace, ids, backupsDir(library), appVersion)
}
