import { parseDate } from './fields'

// R-364: a text value read as the field's date type, or undefined when it cannot be read as one. Times written with a
// zone become this computer's local time, as new imports do; a date keeps the calendar day the text wrote.
export function textAsDate(value: unknown, to: 'date' | 'datetime'): string | undefined {
  const parsed = parseDate(value)
  if (!parsed) return undefined
  if (to === 'datetime') return parsed.type === 'datetime' ? parsed.value : undefined
  const written = String(value).trim()
  return /^\d{4}-\d{2}-\d{2}[T ]/.test(written) ? written.slice(0, 10) : parsed.value.slice(0, 10)
}

// The date type a field should be unified to: the only date type among its values next to text, if there is one.
export function unifyTarget(types: Iterable<string>): 'date' | 'datetime' | undefined {
  const set = new Set(types)
  if (!set.has('string')) return undefined
  set.delete('string')
  if (set.size !== 1) return undefined
  const [only] = set
  return only === 'date' || only === 'datetime' ? only : undefined
}
