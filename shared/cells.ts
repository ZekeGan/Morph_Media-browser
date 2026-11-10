import { fieldValue, type Cell, type FieldGroup, type FolderRow, type Project } from './model'

export type GroupContext = Pick<Project, 'fieldGroups' | 'groupSources'>

export function copyableValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.length ? value : undefined
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
    return String(value)
  if (Array.isArray(value) && value.length && value.every((item) => typeof item === 'string'))
    return value.join(', ')
  return undefined
}
// A field cell's fields in order. The first one holding a value is shown; with none, the main field is
// reported so a wrong-type value still shows its warning and nothing falls back silently to an empty field.
export function isFilled(value: unknown): boolean {
  if (Array.isArray(value))
    return value.some((item) => typeof item === 'string' && item.trim().length > 0)
  return (
    copyableValue(value) !== undefined && (typeof value !== 'string' || value.trim().length > 0)
  )
}
export function displayedFieldValue(cell: Pick<Cell, 'kind'>, value: unknown): unknown {
  if (
    cell.kind === 'field-text' &&
    Array.isArray(value) &&
    value.every((v) => typeof v === 'string')
  )
    return isFilled(value) ? value.join(', ') : undefined
  if (cell.kind === 'field-tags' && Array.isArray(value) && !isFilled(value)) return []
  if (cell.kind === 'field-tags' && typeof value === 'string') return value.trim() ? [value] : []
  return value
}
export function groupOf(project: GroupContext | undefined, groupId: string | undefined) {
  return groupId ? project?.fieldGroups?.find((group) => group.groupId === groupId) : undefined
}
// A group's members in the order they are tried for one folder: the folder's chosen member first, then the rest.
export function groupOrder(project: GroupContext | undefined, group: FieldGroup, row?: FolderRow) {
  const folderId = row?.record?.folderId,
    chosen = folderId ? project?.groupSources?.[folderId]?.[group.groupId] : undefined
  return chosen && group.memberIds.includes(chosen)
    ? [chosen, ...group.memberIds.filter((id) => id !== chosen)]
    : group.memberIds
}
// The member a group shows for a folder; chosenEmpty says the folder's chosen member has no value right now.
export function groupValue(project: GroupContext | undefined, group: FieldGroup, row?: FolderRow) {
  const ids = groupOrder(project, group, row),
    folderId = row?.record?.folderId,
    pick = folderId ? project?.groupSources?.[folderId]?.[group.groupId] : undefined,
    chosen = !!pick && group.memberIds.includes(pick)
  for (const [index, attributeId] of ids.entries()) {
    const value = row ? fieldValue(row, attributeId) : undefined
    if (isFilled(value)) return { attributeId, value, index, chosenEmpty: chosen && index > 0 }
  }
  return { attributeId: undefined, value: undefined, index: -1, chosenEmpty: chosen }
}
// The fields a field cell tries, in order: its group's members, or its main field and fallback fields.
export function cellFieldIds(cell: Cell, project?: GroupContext, row?: FolderRow) {
  const group = groupOf(project, cell.groupId)
  return group ? groupOrder(project, group, row) : [cell.attributeId, ...(cell.fallbackIds ?? [])]
}
export function cellField(
  cell: Cell,
  row?: FolderRow,
  project?: GroupContext
): { attributeId?: string; value: unknown; index: number } {
  const ids = cellFieldIds(cell, project, row)
  if (row)
    for (const [index, attributeId] of ids.entries()) {
      if (!attributeId) continue
      const value = fieldValue(row, attributeId)
      if (isFilled(value)) return { attributeId, value: displayedFieldValue(cell, value), index }
    }
  const main = groupOf(project, cell.groupId) ? ids[0] : cell.attributeId
  return {
    attributeId: main,
    value: displayedFieldValue(cell, row && main ? fieldValue(row, main) : undefined),
    index: 0,
  }
}
export function cellVisible(cell: Cell, row?: FolderRow): boolean {
  if (!cell.condition) return true
  const value = row ? fieldValue(row, cell.condition.attributeId) : undefined,
    set = isFilled(value)
  if (cell.condition.operator === 'set') return set
  if (cell.condition.operator === 'unset') return !set
  if (!set) return false
  if (cell.condition.operator === 'gt' || cell.condition.operator === 'lt') {
    const own =
        typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) : NaN,
      target =
        typeof cell.condition.value === 'number'
          ? cell.condition.value
          : typeof cell.condition.value === 'string'
            ? Date.parse(cell.condition.value)
            : NaN
    if (typeof value !== typeof cell.condition.value || Number.isNaN(own) || Number.isNaN(target))
      return false
    return cell.condition.operator === 'gt' ? own > target : own < target
  }
  return (
    typeof value === typeof cell.condition.value &&
    (cell.condition.operator === 'equals'
      ? value === cell.condition.value
      : value !== cell.condition.value)
  )
}
export function numericDisplay(value: unknown, maximum: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? { value, maximum, percent: Math.max(0, Math.min(100, (value / maximum) * 100)) }
    : undefined
}
