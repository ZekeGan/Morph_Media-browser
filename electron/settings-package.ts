import { defaultWorkspace, type SettingsPackage, type WorkspacePrefs } from '../shared/workspace'

const keys = [
  'sidebarWidth',
  'sidebarHidden',
  'collapsed',
  'sections',
  'projectOrder',
  'groups',
  'projects',
  'theme',
  'locale',
  'videoAudio',
] as const
// Explicit allowlist: registry paths, authentication and future unknown fields do
// not become portable simply because they happen to be stored in workspace prefs.
export function exportSettings(prefs: WorkspacePrefs): SettingsPackage {
  const value: Partial<WorkspacePrefs> = {}
  for (const key of keys)
    if (prefs[key] !== undefined) Object.assign(value, { [key]: structuredClone(prefs[key]) })
  return {
    kind: 'media-viewer.settings',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    prefs: value,
  }
}
export function importSettings(value: unknown): WorkspacePrefs {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('設定包格式不合法')
  const item = value as Record<string, unknown>
  if (
    item.kind !== 'media-viewer.settings' ||
    item.schemaVersion !== 1 ||
    !item.prefs ||
    typeof item.prefs !== 'object' ||
    Array.isArray(item.prefs)
  )
    throw new Error('設定包版本或格式不支援')
  if (JSON.stringify(value).length > 4 * 1024 * 1024) throw new Error('設定包過大')
  const prefs = item.prefs as Partial<WorkspacePrefs>
  if (Object.keys(prefs).some((key) => !keys.includes(key as (typeof keys)[number])))
    throw new Error('設定包含不可匯入的欄位')
  const next = {
    ...defaultWorkspace(),
    ...structuredClone(prefs),
    schemaVersion: 1 as const,
    revision: 0,
  }
  if (
    !next.projects ||
    typeof next.projects !== 'object' ||
    Array.isArray(next.projects) ||
    Object.keys(next.projects).length > 50000
  )
    throw new Error('設定包專案偏好不合法')
  next.nextOrder = 1
  for (const project of Object.values(next.projects)) {
    if (!project || !Number.isSafeInteger(project.addedOrder)) throw new Error('設定包順序不合法')
    next.nextOrder = Math.max(next.nextOrder, project.addedOrder + 1)
  }
  return next
}
export function mergeSettings(
  current: WorkspacePrefs,
  incoming: WorkspacePrefs,
  mode: 'merge' | 'replace'
): WorkspacePrefs {
  if (mode === 'replace')
    return {
      ...current,
      ...exportSettings(incoming).prefs,
      revision: current.revision,
      nextOrder: incoming.nextOrder,
    }
  const next = structuredClone(current),
    groupIds = new Map<string, string>()
  for (const group of incoming.groups) {
    const existing = next.groups.find(
      (item) =>
        item.id === group.id || item.name.toLocaleLowerCase() === group.name.toLocaleLowerCase()
    )
    if (existing) groupIds.set(group.id, existing.id)
    else {
      next.groups.push(group)
      groupIds.set(group.id, group.id)
    }
  }
  for (const [id, project] of Object.entries(incoming.projects))
    if (!Object.hasOwn(next.projects, id))
      next.projects[id] = {
        ...project,
        groupId: project.groupId ? (groupIds.get(project.groupId) ?? null) : null,
        addedOrder: next.nextOrder++,
      }
  for (const key of ['theme', 'locale', 'videoAudio'] as const)
    if (next[key] === undefined && incoming[key] !== undefined)
      Object.assign(next, { [key]: structuredClone(incoming[key]) })
  next.sections = [
    ...(next.sections ?? ['favorites', 'unclassified']),
    ...next.groups.map((group) => group.id).filter((id) => !next.sections?.includes(id)),
  ]
  return next
}
