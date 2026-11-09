import { useEffect, useState } from 'react'
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

// The editor's lists use one fixed order: the user's own fields first, then each website by name.
export function orderedFieldSourceGroups<T extends { attributeId: string }>(
  fields: T[],
  attributes: Attribute[] = []
) {
  const own = tr('自建')
  return fieldSourceGroups(fields, attributes).sort(
    (a, b) =>
      Number(b.source === own) - Number(a.source === own) || a.source.localeCompare(b.source)
  )
}

// Websites can bring dozens of fields. A source with nothing added yet starts folded, and in every source the fields
// not added yet are folded into one line; searching or filtering shows everything so nothing seems missing.
export function useSourceFolding(showAll: boolean) {
  // What the user chose stays chosen, even when adding a field would change the source's default.
  const [chosen, setChosen] = useState<Record<string, boolean>>({}),
    [unfolded, setUnfolded] = useState<string[]>([]),
    // Folded by hand during a search or filter; forgotten when it ends.
    [foldedForNow, setFoldedForNow] = useState<string[]>([])
  useEffect(() => setFoldedForNow([]), [showAll])
  const isOpen = (source: string, hasAdded: boolean) =>
    showAll
      ? !foldedForNow.includes(source)
      : (chosen[source] ?? (hasAdded || source === tr('自建')))
  return {
    isOpen,
    toggle: (source: string, hasAdded: boolean) =>
      showAll
        ? setFoldedForNow((now) =>
            now.includes(source) ? now.filter((x) => x !== source) : [...now, source]
          )
        : setChosen((now) => ({ ...now, [source]: !isOpen(source, hasAdded) })),
    showsUnadded: (source: string) => showAll || unfolded.includes(source),
    showUnadded: (source: string) => setUnfolded((now) => [...now, source]),
    reveal: (source: string) => {
      setChosen((now) => ({ ...now, [source]: true }))
      setUnfolded((now) => [...now, source])
    },
  }
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
