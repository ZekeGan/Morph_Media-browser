import { type Cell, type FolderRow } from './modelTypes'
export function defaultCells(makeId: () => string, attributeId?: string): Cell[] {
  return (
    ['name', 'path', ...(attributeId ? ['field-text' as const] : []), 'open-folder'] as const
  ).map((kind, y) => ({
    cellId: makeId(),
    kind,
    ...(kind === 'field-text' ? { attributeId } : {}),
    grid: { x: 0, y, w: 12, h: 1 },
    style: { textColor: '#e4e6e8', backgroundColor: 'transparent' },
  }))
}
// Removing a field from layouts: cells that show it alone and cells whose condition reads it go away,
// a cell with fallbacks moves on to its next field, and a fallback entry is simply dropped.
export function cellsWithoutField(cells: Cell[], attributeId: string): Cell[] {
  return cells.flatMap((original) => {
    // Extra conditions and text rules reading the field are dropped; the main condition still removes the cell.
    let cell = original
    if (cell.moreConditions?.some((c) => c.attributeId === attributeId)) {
      const more = cell.moreConditions.filter((c) => c.attributeId !== attributeId)
      const { moreConditions: _m, conditionMode: _c, ...plain } = cell
      cell = more.length
        ? {
            ...plain,
            moreConditions: more,
            ...(cell.conditionMode ? { conditionMode: cell.conditionMode } : {}),
          }
        : plain
    }
    if (cell.textRules?.some((rule) => rule.when.attributeId === attributeId)) {
      const rules = cell.textRules.filter((rule) => rule.when.attributeId !== attributeId)
      const { textRules: _r, ...plain } = cell
      cell = rules.length ? { ...plain, textRules: rules } : plain
    }
    if (cell.condition?.attributeId === attributeId) return []
    const rest = (cell.fallbackIds ?? []).filter((id) => id !== attributeId)
    if (cell.attributeId === attributeId) {
      if (!rest.length) return []
      const { fallbackIds: _drop, ...plain } = cell
      return [
        {
          ...plain,
          attributeId: rest[0],
          ...(rest.length > 1 ? { fallbackIds: rest.slice(1) } : {}),
        },
      ]
    }
    if (rest.length === (cell.fallbackIds ?? []).length) return [cell]
    const { fallbackIds: _drop, ...plain } = cell
    return [rest.length ? { ...plain, fallbackIds: rest } : plain]
  })
}
export function fieldValue(row: FolderRow, attributeId: string): unknown {
  const override = row.record?.projectOverrides[row.projectId]?.find(
    (a) => a.attributeId === attributeId
  )
  return (override ?? row.record?.attributes.find((a) => a.attributeId === attributeId))?.value
}
