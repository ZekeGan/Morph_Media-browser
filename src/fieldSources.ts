import type { Attribute } from '../shared/model'
import { metadataSources, sourceForUrl } from '../shared/sources'
import { t as tr } from './i18n'

// Imported ids retain their website identity even after a manual edit removes the fetched-value provenance.
export function fieldSource(attributeId: string, attributes: Attribute[] = []) {
  const named = metadataSources.find((source) => attributeId.startsWith(source.id + '-'))
  if (named) return named.name
  const providers = new Set(
    attributes
      .filter((a) => a.attributeId === attributeId)
      .flatMap((a) => {
        const provider = a.sourceRecord?.provider ?? (a.source ? sourceForUrl(a.source) : undefined)
        const name = metadataSources.find((source) => source.id === provider)?.name
        return name ? [name] : []
      })
  )
  return providers.size ? [...providers].sort().join(' / ') : tr('自建')
}

export function fieldSourceGroups<T extends { attributeId: string }>(
  fields: T[],
  attributes: Attribute[] = []
) {
  const groups = new Map<string, T[]>()
  for (const field of fields) {
    const source = fieldSource(field.attributeId, attributes)
    groups.set(source, [...(groups.get(source) ?? []), field])
  }
  return [...groups].map(([source, fields]) => ({ source, fields }))
}

export function rowFieldAttributes(
  rows: {
    record?: { attributes: Attribute[]; projectOverrides: Record<string, Attribute[]> }
    projectId: string
  }[]
) {
  return rows.flatMap((row) => [
    ...(row.record?.attributes ?? []),
    ...(row.record?.projectOverrides[row.projectId] ?? []),
  ])
}
