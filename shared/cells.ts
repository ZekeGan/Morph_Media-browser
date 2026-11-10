import {
  fieldValue,
  type Cell,
  type CellCondition,
  type FieldGroup,
  type FolderRow,
  type Project,
} from './model'
import { readDate } from './fields'

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
  // Date components read dates written as text ("12 Nov, 2020"), so a field switched from text shows dates (R-240).
  if (cell.kind === 'field-date-only') return readDate(value, 'date') ?? value
  if (cell.kind === 'field-date') return readDate(value, 'datetime') ?? value
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
// Whether one condition holds for a folder. `now` is injectable for tests (relative dates count from today).
export function conditionMet(
  condition: CellCondition,
  cell: Cell,
  row?: FolderRow,
  project?: GroupContext,
  now = Date.now()
): boolean {
  // "Hide when empty" on the component's own field looks at what it shows, so a group or fallback component stays
  // visible while any of its fields has a value (R-232).
  const shown =
    ['set', 'unset'].includes(condition.operator) &&
    condition.attributeId === cell.attributeId &&
    (!!cell.groupId || !!cell.fallbackIds?.length)
  const value = !row
      ? undefined
      : shown
        ? cellField(cell, row, project).value
        : fieldValue(row, condition.attributeId),
    set = isFilled(value)
  if (condition.operator === 'set') return set
  if (condition.operator === 'unset') return !set
  if (!set) return false
  // Within / older than N days from today, for date and date-and-time values (R-239).
  if (condition.operator === 'within' || condition.operator === 'older') {
    const days = typeof condition.value === 'number' ? condition.value : NaN
    // Text the field holds from before it was a date field is read as a date when it can be (R-240).
    const date = readDate(value, 'datetime')
    if (date === undefined || Number.isNaN(days)) return false
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
    // A date alone is a calendar day here (local midnight), so the answer does not change during the day; a date and
    // time counts from this moment. Dates in the future count as within.
    const today = new Date(now)
    const when = day ? new Date(+day[1], +day[2] - 1, +day[3]).getTime() : Date.parse(date),
      cutoff = day
        ? new Date(today.getFullYear(), today.getMonth(), today.getDate() - days).getTime()
        : now - days * 86400000
    if (Number.isNaN(when)) return false
    return condition.operator === 'within' ? when >= cutoff : when < cutoff
  }
  if (condition.operator === 'gt' || condition.operator === 'lt') {
    const own =
        typeof value === 'number'
          ? value
          : typeof value === 'string'
            ? Date.parse(readDate(value, 'datetime') ?? '')
            : NaN,
      target =
        typeof condition.value === 'number'
          ? condition.value
          : typeof condition.value === 'string'
            ? Date.parse(condition.value)
            : NaN
    if (typeof value !== typeof condition.value || Number.isNaN(own) || Number.isNaN(target))
      return false
    return condition.operator === 'gt' ? own > target : own < target
  }
  return (
    typeof value === typeof condition.value &&
    (condition.operator === 'equals' ? value === condition.value : value !== condition.value)
  )
}
// A cell shows when its conditions hold: all of them, or any one with conditionMode 'any' (R-239).
export function cellVisible(
  cell: Cell,
  row?: FolderRow,
  project?: GroupContext,
  now = Date.now()
): boolean {
  if (!cell.condition) return true
  const all = [cell.condition, ...(cell.moreConditions ?? [])]
  const met = (condition: CellCondition) => conditionMet(condition, cell, row, project, now)
  return cell.conditionMode === 'any' ? all.some(met) : all.every(met)
}
// Layout text with rules: the first rule that holds gives the text, otherwise the cell's own text (R-239).
export function ruleText(cell: Cell, row?: FolderRow, project?: GroupContext, now = Date.now()) {
  const rule = cell.textRules?.find((r) => conditionMet(r.when, cell, row, project, now))
  return rule ? rule.text : (cell.text ?? '')
}
export function numericDisplay(value: unknown, maximum: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? { value, maximum, percent: Math.max(0, Math.min(100, (value / maximum) * 100)) }
    : undefined
}
