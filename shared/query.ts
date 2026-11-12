import { fmt } from './message'
export interface Term {
  key?: string
  value: string
  exclude: boolean
  fieldId?: string
  expectedType?: string
}
export interface QueryField {
  key: string
  type: string
  attributeId: string
  projectId: string
}
export interface StableQuery {
  version: 1
  groups: { field?: string; type?: string; value: string; exclude: boolean }[][]
}
export function queryField(key: string, available: QueryField[]): { field: string; type: string } {
  const marker = key.lastIndexOf('@'),
    exact = available.some((field) => field.key.toLocaleLowerCase() === key),
    alias = marker < 0 || exact ? key : key.slice(0, marker),
    explicit = marker < 0 || exact ? undefined : key.slice(marker + 1)
  const found = available.filter(
      (field) =>
        field.key.toLocaleLowerCase() === alias &&
        (!explicit || field.attributeId.toLocaleLowerCase() === explicit)
    ),
    ids = [...new Set(found.map((field) => field.attributeId))]
  if (!ids.length && ['name', 'folder_name', 'path'].includes(alias) && !explicit)
    return { field: alias === 'path' ? '@path' : '@name', type: 'string' }
  if (!ids.length) throw new Error(fmt('找不到欄位「{0}」，可從欄位提示選擇', key))
  if (ids.length > 1 || new Set(found.map((field) => field.type)).size > 1)
    throw new Error(fmt('欄位「{0}」有多個身分；請使用提示中的 key@完整屬性ID', alias))
  return { field: ids[0], type: found[0].type }
}
export function stabilizeQuery(query: string, fields: QueryField[]): StableQuery {
  return {
    version: 1,
    groups: parseQuery(query).map((group) =>
      group.map((term) => {
        const field = term.key ? queryField(term.key, fields) : undefined
        return {
          ...(field ? { field: field.field, type: field.type } : {}),
          value: term.value,
          exclude: term.exclude,
        }
      })
    ),
  }
}
export function validStableQuery(value: unknown): value is StableQuery {
  if (!value || typeof value !== 'object') return false
  const query = value as StableQuery
  return (
    query.version === 1 &&
    Array.isArray(query.groups) &&
    query.groups.length > 0 &&
    query.groups.length <= 50 &&
    query.groups.every(
      (group) =>
        Array.isArray(group) &&
        group.every(
          (term) =>
            !!term &&
            typeof term.value === 'string' &&
            term.value.length <= 2000 &&
            typeof term.exclude === 'boolean' &&
            (term.field === undefined ||
              (typeof term.field === 'string' &&
                /^(?:@name|@path|[\w-]{1,100})$/.test(term.field) &&
                typeof term.type === 'string' &&
                term.type.length <= 40))
        )
    ) &&
    query.groups.flat().length <= 50 &&
    query.groups.flat().reduce((sum, term) => sum + term.value.length, 0) <= 2000
  )
}
export function restoreQuery(query: StableQuery, fields: QueryField[]): Term[][] {
  if (!validStableQuery(query)) throw new Error('常用搜尋格式不合法')
  return query.groups.map((group) =>
    group.map((term) => {
      if (!term.field) return { value: term.value, exclude: term.exclude }
      if (['@name', '@path'].includes(term.field))
        return {
          key: term.field === '@name' ? 'name' : 'path',
          fieldId: term.field,
          expectedType: 'string',
          value: term.value,
          exclude: term.exclude,
        }
      const found = fields.filter((field) => field.attributeId === term.field)
      if (!found.length || found.some((field) => field.type !== term.type))
        throw new Error('常用搜尋的欄位已移除或型別變更，請重新確認條件')
      const alias = found[0].key,
        ambiguous = fields.some(
          (field) =>
            field.attributeId !== term.field &&
            field.key.toLocaleLowerCase() === alias.toLocaleLowerCase()
        )
      return {
        key: alias + (ambiguous ? '@' + term.field : ''),
        fieldId: term.field,
        expectedType: term.type,
        value: term.value,
        exclude: term.exclude,
      }
    })
  )
}
export const queryText = (groups: Term[][]) =>
  groups
    .map((group) =>
      group
        .map(
          (term) =>
            (term.exclude ? '-' : '') +
            (term.key ? JSON.stringify(term.key) + ':' : '') +
            JSON.stringify(term.value)
        )
        .join(' ')
    )
    .join(' ~ ')
export function parseQuery(source: string): Term[][] {
  if (typeof source !== 'string' || source.length > 2000) throw new Error('搜尋字串最多 2,000 字')
  const groups: Term[][] = [[]]
  let token = '',
    quote = false,
    escaped = false
  const push = () => {
    if (!token) return
    const exclude = token.startsWith('-')
    if (exclude) token = token.slice(1)
    const restore = (s: string) => s.replaceAll('\u0002', ':').replaceAll('\u0003', '-')
    const colon = token.indexOf(':'),
      key = colon < 0 ? undefined : restore(token.slice(0, colon)).toLocaleLowerCase()
    const values = (colon < 0 ? token : token.slice(colon + 1)).split('\u0001').map(restore)
    if (key === '' || values.some((v) => !v)) throw new Error('條件缺少欄位或值')
    for (const value of values)
      groups.at(-1)!.push({ key, value: value.toLocaleLowerCase(), exclude })
    token = ''
  }
  for (const char of source.trim()) {
    if (escaped) {
      token += char === ':' ? '\u0002' : char === '-' && !token ? '\u0003' : char
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      quote = !quote
      continue
    }
    if (!quote && /\s/.test(char)) {
      push()
      continue
    }
    if (!quote && char === '~') {
      push()
      if (!groups.at(-1)!.length) throw new Error('OR 前缺少條件')
      groups.push([])
      continue
    }
    token +=
      quote && char === ':'
        ? '\u0002'
        : quote && char === '-' && !token
          ? '\u0003'
          : !quote && char === ','
            ? '\u0001'
            : char
  }
  if (quote || escaped) throw new Error('引號或跳脫未完成')
  push()
  if (groups.length > 1 && !groups.at(-1)!.length) throw new Error('OR 後缺少條件')
  if (groups.flat().length > 50) throw new Error('一次最多 50 個條件')
  return groups
}
export const describeQuery = (groups: Term[][]) =>
  groups
    .map((g) =>
      g
        .map(
          (t) => `${t.exclude ? 'NOT ' : ''}${t.key ? t.key + ':' : ''}${JSON.stringify(t.value)}`
        )
        .join(' AND ')
    )
    .join(' OR ') || '全部資料夾'
export function normalizeValue(value: unknown, type: string) {
  const raw = Array.isArray(value) ? value.join('\n') : value == null ? '' : String(value)
  if (type === 'boolean') {
    if (['是', 'はい', 'sí', 'yes', 'true'].includes(raw)) return 'true'
    if (['否', 'いいえ', 'no', 'false'].includes(raw)) return 'false'
  }
  return (
    ['datetime', 'date'].includes(type) && /^\d{8}$/.test(raw)
      ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`
      : raw
  ).toLocaleLowerCase()
}
