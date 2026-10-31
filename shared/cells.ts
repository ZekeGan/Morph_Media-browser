import { fieldValue, type Cell, type FolderRow } from './model'

export function copyableValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value.length ? value : undefined
  if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)))
    return String(value)
  if (Array.isArray(value) && value.length && value.every((item) => typeof item === 'string'))
    return value.join(', ')
  return undefined
}
export function cellVisible(cell: Cell, row?: FolderRow): boolean {
  if (!cell.condition) return true
  const value = row ? fieldValue(row, cell.condition.attributeId) : undefined,
    set =
      copyableValue(value) !== undefined && (typeof value !== 'string' || value.trim().length > 0)
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
