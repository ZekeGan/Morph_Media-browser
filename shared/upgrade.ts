// Every stored format carries its own `schemaVersion`. A newer app reads older data by running the steps below in
// order (v1 -> v2 -> ...) right after reading; the upgraded value is written back only when that record is saved for
// another reason. Data written by a newer app is never treated as damaged: it raises NewerFormatError, stays read-only
// and is never restored over, cleaned or rewritten. Rules: docs/DATA_FORMAT.md#格式升級與相容規則.
export type FormatKind = 'folder' | 'details' | 'project' | 'workspace' | 'settings'

// The version this build writes. Bump one together with a step from the previous version, a fixture of the old
// format and a test (see the checklist in docs/DATA_FORMAT.md).
export const FORMAT_VERSION: Record<FormatKind, number> = {
  folder: 1,
  details: 1,
  project: 1,
  workspace: 1,
  settings: 1,
}
type Step = (value: Record<string, unknown>) => Record<string, unknown>
// UPGRADE_STEPS[kind][n] turns version n into version n + 1. None are needed yet.
export const UPGRADE_STEPS: Record<FormatKind, Partial<Record<number, Step>>> = {
  folder: {},
  details: {},
  project: {},
  workspace: {},
  settings: {},
}

const NAMES: Record<FormatKind, string> = {
  folder: '資料夾資訊',
  details: '資料夾內容設定',
  project: '專案設定',
  workspace: '應用程式設定',
  settings: '設定包',
}
export class NewerFormatError extends Error {
  constructor(
    readonly format: FormatKind,
    readonly version: number
  ) {
    super(
      `這份${NAMES[format]}來自較新版本的 M:orph（格式 v${version}，這個版本只認得到 v${FORMAT_VERSION[format]}）；請更新程式，在那之前只能查看，不會寫入或覆蓋。`
    )
  }
}
// Errors cross the IPC boundary as text, so the window recognises the case by its wording.
export const isNewerFormat = (error: unknown) =>
  error instanceof NewerFormatError || /來自較新版本的 M:orph/.test(String(error))

const plain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

// Throws NewerFormatError when the value was written by a newer app; anything else is left to the validators.
export function checkNotNewer(format: FormatKind, value: unknown) {
  const version = plain(value) ? value.schemaVersion : undefined
  if (typeof version === 'number' && Number.isInteger(version) && version > FORMAT_VERSION[format])
    throw new NewerFormatError(format, version)
}

export function upgradeFormat(format: FormatKind, value: unknown): unknown {
  checkNotNewer(format, value)
  if (!plain(value)) return value
  const from = value.schemaVersion
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1) return value
  let out = value
  for (let version = from; version < FORMAT_VERSION[format]; version++) {
    const step = UPGRADE_STEPS[format][version]
    if (!step) throw new Error(`缺少${NAMES[format]}格式 v${version} → v${version + 1} 的升級步驟`)
    out = { ...step(structuredClone(out)), schemaVersion: version + 1 }
  }
  return out
}

// A folder record carries its details as a nested format of their own.
export function upgradeFolderRecord(value: unknown): unknown {
  const folder = upgradeFormat('folder', value)
  if (plain(folder) && folder.details !== undefined)
    return { ...folder, details: upgradeFormat('details', folder.details) }
  return folder
}

// Stored records name their kind; this picks the format for a raw value read from a .json or .json.bak file.
export function upgradeStored(value: unknown): unknown {
  if (plain(value) && value.kind === 'media-viewer.folder') return upgradeFolderRecord(value)
  if (plain(value) && value.kind === 'media-viewer.project') return upgradeFormat('project', value)
  return value
}
