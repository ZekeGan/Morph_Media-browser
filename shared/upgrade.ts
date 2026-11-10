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
  if (plain(value) && value.kind === 'media-viewer.project')
    return settleFieldGroups(upgradeFormat('project', value))
  return value
}

// Field groups (R-226, optional keys) are ignored by older app versions, which may then delete or rename a member
// field. Instead of refusing the whole project, what no longer fits is settled on reading: missing, repeated or
// incompatible members leave their group, empty groups go, a name now taken by a field gets a number, folder choices
// and components follow. Anything else is left for validation as before.
export function settleFieldGroups(value: unknown): unknown {
  if (!plain(value) || !Array.isArray(value.fieldGroups)) return value
  const types = new Map<string, unknown>(
    (Array.isArray(value.fieldBindings) ? value.fieldBindings : [])
      .filter(plain)
      .map((field) => [field.attributeId as string, field.type])
  )
  const textual = (type: unknown) => type === 'string' || type === 'tags'
  const fits = (a: unknown, b: unknown) => a === b || (textual(a) && textual(b))
  const taken = new Set(
    (Array.isArray(value.fieldBindings) ? value.fieldBindings : []).filter(plain).map((field) =>
      String(field.alias ?? '')
        .trim()
        .toLocaleLowerCase()
    )
  )
  const used = new Set<string>()
  const groups = value.fieldGroups.filter(plain).flatMap((group) => {
    if (!Array.isArray(group.memberIds) || typeof group.name !== 'string') return [group]
    const members: string[] = []
    for (const id of group.memberIds)
      if (
        typeof id === 'string' &&
        types.has(id) &&
        !used.has(id) &&
        (!members.length || fits(types.get(members[0]), types.get(id)))
      )
        members.push(id)
    if (!members.length) return []
    members.forEach((id) => used.add(id))
    let name = group.name.trim().slice(0, 95) || 'Group'
    for (let n = 2; taken.has(name.toLocaleLowerCase()); n++)
      name = `${group.name.trim().slice(0, 95) || 'Group'} ${n}`
    taken.add(name.toLocaleLowerCase())
    return [{ ...group, name, memberIds: members }]
  })
  const next: Record<string, unknown> = { ...value }
  if (groups.length) next.fieldGroups = groups
  else delete next.fieldGroups
  const find = (id: unknown) => groups.find((group) => group.groupId === id)
  if (plain(value.groupSources)) {
    const sources = Object.fromEntries(
      Object.entries(value.groupSources).flatMap(([folder, chosen]) => {
        if (!plain(chosen)) return []
        const kept = Object.entries(chosen).filter(([groupId, member]) =>
          (find(groupId)?.memberIds as string[] | undefined)?.includes(member as string)
        )
        return kept.length ? [[folder, Object.fromEntries(kept)]] : []
      })
    )
    if (Object.keys(sources).length) next.groupSources = sources
    else delete next.groupSources
  }
  const cell = (item: unknown) => {
    if (!plain(item) || item.groupId === undefined) return item
    const group = find(item.groupId)
    if (!group) {
      const { groupId: _drop, ...rest } = item
      return rest
    }
    const members = group.memberIds as string[]
    return members.includes(item.attributeId as string)
      ? item
      : { ...item, attributeId: members[0] }
  }
  const cells = (list: unknown) => (Array.isArray(list) ? list.map(cell) : list)
  next.cells = cells(value.cells)
  if (Array.isArray(value.layoutPresets))
    next.layoutPresets = value.layoutPresets.map((preset) =>
      plain(preset) ? { ...preset, cells: cells(preset.cells) } : preset
    )
  if (plain(value.contentCells))
    next.contentCells = Object.fromEntries(
      Object.entries(value.contentCells).map(([key, list]) => [key, cells(list)])
    )
  return next
}
