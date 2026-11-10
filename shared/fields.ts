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
const monthNames = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
const pad = (n: number) => String(n).padStart(2, '0')
function day(year: number, month: number, date: number) {
  const value = `${year}-${pad(month)}-${pad(date)}`
  return calendarDate(value) ? value : undefined
}
function month(name: string) {
  // "Nov", "Nov.", "Sept" and "November" all name November; at least three letters.
  const word = name.replace(/\.$/, '').toLowerCase()
  const index = monthNames.findIndex((full) => word.length >= 3 && full.startsWith(word))
  return index < 0 ? undefined : index + 1
}
// Text, date and date-and-time values may replace each other in a folder record: a field can be switched between
// these purposes, and saving or importing then writes the field's current type (R-240). Other types never change.
export const dateOrText = (a: string, b: string) =>
  ['string', 'date', 'datetime'].includes(a) && ['string', 'date', 'datetime'].includes(b)
// Reads a date written as text: ISO dates and times, 2020/11/12, 2020年11月12日 and English month names
// ("12 Nov, 2020", "Nov 12, 2020", "March 5, 2001"). A year alone, a year and month, or anything else is not a
// date. A time with a zone is turned into this computer's local time, the way the date and time inputs store it.
export function parseDate(text: unknown): { type: 'date' | 'datetime'; value: string } | undefined {
  if (typeof text !== 'string' || text.length > 100) return undefined
  const s = text.trim()
  let m =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/i.exec(
      s
    )
  if (m) {
    const date = day(+m[1], +m[2], +m[3])
    if (!date || +m[4] > 23 || +m[5] > 59 || (m[6] !== undefined && +m[6] > 59)) return undefined
    if (!m[7])
      return {
        type: 'datetime',
        value: `${date}T${m[4]}:${m[5]}${m[6] && m[6] !== '00' ? ':' + m[6] : ''}`,
      }
    const at = new Date(s.replace(' ', 'T'))
    if (Number.isNaN(at.getTime())) return undefined
    const local = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:${pad(at.getMinutes())}`
    return { type: 'datetime', value: local + (at.getSeconds() ? ':' + pad(at.getSeconds()) : '') }
  }
  m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s) ?? /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(s)
  if (m) {
    const date = day(+m[1], +m[2], +m[3])
    return date ? { type: 'date', value: date } : undefined
  }
  m = /^(\d{1,2})\s+([A-Za-z.]+),?\s+(\d{4})$/.exec(s)
  if (m) {
    const n = month(m[2]),
      date = n && day(+m[3], n, +m[1])
    return date ? { type: 'date', value: date } : undefined
  }
  m = /^([A-Za-z.]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(s)
  if (m) {
    const n = month(m[1]),
      date = n && day(+m[3], n, +m[2])
    return date ? { type: 'date', value: date } : undefined
  }
  return undefined
}
// A stored value read as a date or date-and-time field: dates stay as they are, text is read with parseDate.
// Folder records keep what was saved; this only changes how it is shown, compared and searched (R-240).
export function readDate(value: unknown, type: 'date' | 'datetime'): string | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = calendarDate(value)
    ? { type: 'date' as const, value }
    : validFieldValue('datetime', value)
      ? { type: 'datetime' as const, value }
      : parseDate(value)
  if (!parsed) return undefined
  return type === 'date' ? parsed.value.slice(0, 10) : parsed.value
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
