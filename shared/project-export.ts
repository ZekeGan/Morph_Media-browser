import { fmt } from './message'
import { DATA_DIR } from './model'

// A project export is a folder: manifest.json plus files/<path relative to the project root> holding the
// project's managed files (folder records, the project definition, images and subtitles). It carries no media.
export const EXPORT_KIND = 'media-viewer.project-export'
export const EXPORT_VERSION = 2

export interface ExportManifest {
  kind: typeof EXPORT_KIND
  schemaVersion: number
  exportedAt: string
  appVersion: string
  projectId: string
  projectName: string
  files: { path: string; sha256: string; size: number }[]
}
export interface ProjectExportResult {
  dir: string
  files: number
  skipped: number
}
export interface ProjectImportPreview {
  token: string
  bundle: string
  projectName: string
  root: string
  folders: number
  files: number
  added: number
  same: number
  conflicts: number
  missingFolders: number
  protectedSkipped: number
  fromVersion: number
  warnings: string[]
  // Set when the import cannot proceed (for example the same project is still linked at another root).
  blocker?: string
}

// Older exports are upgraded here, one version at a time, before they are validated and written. When the data
// model changes, bump EXPORT_VERSION and add the step for the previous version.
const steps: Record<number, (value: unknown, kind: 'folder' | 'project') => unknown> = {
  // 1 -> 2: project categories are gone; content templates are keyed by folder kind (manga -> book, the
  // album/video/music/other family -> media) and folders carry their own kind.
  1: (value, kind) => {
    if (kind !== 'project' || !value || typeof value !== 'object') return value
    const {
      mediaCategory: _category,
      mediaSourceCategory: source,
      contentCells,
      ...rest
    } = value as Record<string, unknown>
    if (!contentCells || typeof contentCells !== 'object') return rest
    const next: Record<string, unknown> = {}
    for (const [key, cells] of Object.entries(contentCells as Record<string, unknown>)) {
      const target =
        key === 'manga'
          ? 'book'
          : ['album', 'video', 'music', 'other'].includes(key)
            ? 'media'
            : key
      // The category the project was converted from wins when several media templates exist.
      if (!(target in next) || key === source) next[target] = cells
    }
    return { ...rest, contentCells: next }
  },
}
export function migrateRecord(version: number, value: unknown, kind: 'folder' | 'project') {
  for (let v = version; v < EXPORT_VERSION; v++) {
    const step = steps[v]
    if (!step) throw new Error(fmt('沒有從匯出版本 {0} 升級的方式', v))
    value = step(value, kind)
  }
  return value
}

// Every exported path must stay inside a .media-viewer directory and name a file the app itself creates.
export function exportPathRole(rel: unknown): 'folder' | 'project' | 'asset' | undefined {
  if (typeof rel !== 'string' || !rel || rel.length > 1024) return undefined
  if (rel.includes('\\') || rel.includes(':') || rel.startsWith('/')) return undefined
  const segments = rel.split('/')
  if (segments.some((s) => !s || s === '.' || s === '..')) return undefined
  const meta = segments.findIndex((s) => s.toLowerCase() === DATA_DIR)
  if (meta < 0) return undefined
  if (segments.slice(0, meta).some((s) => s.toLowerCase() === DATA_DIR)) return undefined
  const tail = segments.slice(meta + 1).join('/')
  if (tail === 'folder.json') return 'folder'
  if (/^projects\/[\w-]+\.json$/.test(tail)) return 'project'
  if (/^assets\/[a-zA-Z0-9_-]+\.(png|jpg|webp|gif|bmp|avif|ico)$/.test(tail)) return 'asset'
  if (/^subtitles\/[\w-]+\.(srt|vtt)$/.test(tail)) return 'asset'
  return undefined
}
export function checkManifest(value: unknown): ExportManifest {
  const item = value as Partial<ExportManifest> | null
  if (!item || typeof item !== 'object' || Array.isArray(item) || item.kind !== EXPORT_KIND)
    throw new Error('這不是專案匯出資料夾')
  if (
    !Number.isInteger(item.schemaVersion) ||
    item.schemaVersion! < 1 ||
    item.schemaVersion! > EXPORT_VERSION
  )
    throw new Error('匯出資料的版本比這個程式新，請先更新程式')
  if (typeof item.projectId !== 'string' || !/^[\w-]{1,100}$/.test(item.projectId))
    throw new Error('匯出資料的專案身分不合法')
  if (
    !Array.isArray(item.files) ||
    item.files.length > 200000 ||
    !item.files.every(
      (f) =>
        f &&
        exportPathRole(f.path) &&
        typeof f.sha256 === 'string' &&
        /^[0-9a-f]{64}$/.test(f.sha256) &&
        Number.isSafeInteger(f.size) &&
        f.size >= 0
    )
  )
    throw new Error('匯出資料的檔案清單不合法')
  if (new Set(item.files.map((f) => f.path.toLowerCase())).size !== item.files.length)
    throw new Error('匯出資料的檔案清單有重複項目')
  return item as ExportManifest
}
