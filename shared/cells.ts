import { fieldValue, type Cell, type FolderRow } from './model'

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
export function cellField(
  cell: Cell,
  row?: FolderRow
): { attributeId?: string; value: unknown; index: number } {
  const ids = [cell.attributeId, ...(cell.fallbackIds ?? [])]
  if (row)
    for (const [index, attributeId] of ids.entries()) {
      if (!attributeId) continue
      const value = fieldValue(row, attributeId)
      if (isFilled(value)) return { attributeId, value: displayedFieldValue(cell, value), index }
    }
  return {
    attributeId: cell.attributeId,
    value: displayedFieldValue(
      cell,
      row && cell.attributeId ? fieldValue(row, cell.attributeId) : undefined
    ),
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
