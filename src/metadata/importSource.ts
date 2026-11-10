import type { FolderRow } from '../../shared/model'
import { metadataSources, sourceForUrl } from '../../shared/sources'

export const isUrl = (value?: string): value is string => !!value && /^https?:\/\//i.test(value)
export const siteName = (url: string) => {
  const id = sourceForUrl(url)
  if (id) return metadataSources.find((item) => item.id === id)?.name ?? id
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
// The websites this folder's data was imported from (one entry per site, with the address it was imported from).
export function importSources(row: FolderRow) {
  const seen = new Map<string, string>(),
    record = row.record
  if (!record) return []
  for (const attribute of [
    ...(record.projectOverrides[row.projectId] ?? []),
    ...record.attributes,
  ]) {
    const source = (attribute as { source?: string }).source
    if (isUrl(source) && !seen.has(siteName(source))) seen.set(siteName(source), source)
  }
  return [...seen].map(([name, url]) => ({ name, url }))
}
