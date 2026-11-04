// One backup folder holds the settings package and one project export per linked project, plus backup.json.
// The pieces keep their own formats (settings package, project export), so their upgrade rules still apply.
export const BACKUP_KIND = 'morph.backup'
export const BACKUP_VERSION = 1

export interface BackupManifest {
  kind: typeof BACKUP_KIND
  schemaVersion: number
  createdAt: string
  appVersion: string
  // 'auto' backups are made by the app before a restore; only the newest few are kept.
  label?: 'manual' | 'auto'
  settings?: string
  projects: { projectId: string; name: string; root: string; dir: string }[]
}
// One backup kept in the app's own data folder.
export interface BackupEntry {
  id: string
  createdAt: string
  label: 'manual' | 'auto'
  size: number
  projects: number
}
export const BACKUP_ID = /^M-orph-backup-[0-9T]{15}(-\d{1,3})?$/
export const AUTO_BACKUPS_KEPT = 5
export interface BackupProjectPreview {
  projectId: string
  name: string
  root: string
  state: 'ready' | 'missing' | 'blocked'
  message?: string
  folders?: number
}
export interface BackupPreview {
  token: string
  createdAt: string
  settings?: { changes: number }
  projects: BackupProjectPreview[]
}
const relative = (value: unknown) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length < 300 &&
  !/^[\\/]|^[a-z]:/i.test(value) &&
  !value.split(/[\\/]/).some((part) => part === '..' || part === '')

export function checkBackupManifest(value: unknown): BackupManifest {
  const v = value as Partial<BackupManifest> | null
  if (
    !v ||
    typeof v !== 'object' ||
    v.kind !== BACKUP_KIND ||
    !Number.isInteger(v.schemaVersion) ||
    v.schemaVersion! < 1 ||
    v.schemaVersion! > BACKUP_VERSION ||
    typeof v.createdAt !== 'string' ||
    typeof v.appVersion !== 'string' ||
    (v.label !== undefined && v.label !== 'manual' && v.label !== 'auto') ||
    (v.settings !== undefined && !relative(v.settings)) ||
    !Array.isArray(v.projects) ||
    v.projects.length > 500 ||
    !v.projects.every(
      (p) =>
        p &&
        typeof p.projectId === 'string' &&
        /^[\w-]{1,80}$/.test(p.projectId) &&
        typeof p.name === 'string' &&
        p.name.length <= 200 &&
        typeof p.root === 'string' &&
        p.root.length <= 1000 &&
        relative(p.dir)
    ) ||
    new Set(v.projects.map((p) => p.projectId)).size !== v.projects.length
  )
    throw new Error('不是有效的 M:orph 備份')
  return v as BackupManifest
}
