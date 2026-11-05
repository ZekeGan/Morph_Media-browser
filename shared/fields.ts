export const fieldTypes = [
  'string',
  'tags',
  'number',
  'datetime',
  'boolean',
  'enum',
  'url',
  'date',
] as const

// Text and tag lists can share a display component without rewriting either field's stored value.
export function compatibleFieldTypes(display: string | undefined, source: string | undefined) {
  return (
    !!display &&
    !!source &&
    (display === source ||
      (['string', 'tags'].includes(display) && ['string', 'tags'].includes(source)))
  )
}
export function httpUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 10000) return false
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password
    )
  } catch {
    return false
  }
}
export function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}
export function validFieldValue(type: string, value: unknown, options?: string[]): boolean {
  if (['boolean', 'enum', 'url', 'date'].includes(type) && value === null) return true
  switch (type) {
    case 'string':
      return typeof value === 'string' && value.length <= 10000
    case 'tags':
      return (
        Array.isArray(value) &&
        value.length <= 200 &&
        value.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 100)
      )
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'datetime':
      return (
        typeof value === 'string' &&
        /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(value) &&
        !Number.isNaN(Date.parse(value))
      )
    case 'boolean':
      return typeof value === 'boolean'
    case 'enum':
      return (
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= 100 &&
        (!options || options.includes(value))
      )
    case 'url':
      return httpUrl(value)
    case 'date':
      return calendarDate(value)
    default:
      return false
  }
}
