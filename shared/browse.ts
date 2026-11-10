import { fieldValue, type FolderRow, type Project } from './model'
import { cellField, groupValue } from './cells'
import type { BrowseMode } from './explorer'
export const pathKey = (p: string) => p.replace(/\\/g, '/').replace(/\/$/, '').toLocaleLowerCase()
export const parentPath = (p: string) => p.replace(/[\\/][^\\/]+[\\/]?$/, '')
export const cardDisplay = (p: Project): NonNullable<Project['cardView']> =>
  p.cardView ?? {
    mode: p.depth.mode === 'exact' ? 'single' : 'multi',
    level: p.scanAll ? 'all' : p.depth.level,
  }
export const maxBrowseDepth = (rows: FolderRow[]) =>
  rows.reduce(
    (depth, row) =>
      !row.readonly && (row.record || row.error || row.stopped)
        ? Math.max(depth, row.depth)
        : depth,
    1
  )
export function folderBreadcrumbs(rows: FolderRow[], root: string, target: string) {
  const rootKey = pathKey(root),
    targetKey = pathKey(target)
  if (targetKey !== rootKey && !targetKey.startsWith(rootKey + '/'))
    return rows.filter((r) => pathKey(r.path) === rootKey).slice(0, 1)
  return [
    ...new Map(
      rows
        .filter((r) => {
          const key = pathKey(r.path)
          return (
            (key === rootKey || key.startsWith(rootKey + '/')) &&
            (key === targetKey || targetKey.startsWith(key + '/'))
          )
        })
        .map((r) => [pathKey(r.path), r])
    ).values(),
  ].sort((a, b) => a.depth - b.depth)
}
export function browserRows(
  rows: FolderRow[],
  project: Project,
  root: string,
  mode: BrowseMode,
  location: string
) {
  const display = cardDisplay(project)
  const known = rows.filter((r) => !r.readonly && (r.record || r.error || r.stopped))
  if (mode === 'TREE') return known
  if (mode === 'TABLE' || (mode === 'CARD' && display.mode === 'single' && location)) {
    const children = rows.filter((r) => pathKey(parentPath(r.path)) === pathKey(location || root))
    // A folder without subfolders shows its own card instead of an empty page.
    if (mode === 'CARD' && !children.length)
      return rows.filter((r) => pathKey(r.path) === pathKey(location || root))
    return children
  }
  if (display.mode === 'single') {
    // Landing on level 1 means the project root, which alone would be one lone card: show its folders.
    const level =
      display.level === 1 && known.some((r) => r.depth === 2) ? 2 : (display.level as number)
    return known.filter((r) => r.depth === level)
  }
  return known.filter((r) => display.level === 'all' || r.depth <= display.level)
}

export function treeStructure(rows: FolderRow[]) {
  const byPath = new Map(rows.map((r) => [pathKey(r.path), r.rowId])),
    children = new Map<string, FolderRow[]>(),
    roots: FolderRow[] = []
  for (const row of rows) {
    const parent = byPath.get(pathKey(parentPath(row.path)))
    if (parent && parent !== row.rowId) {
      const list = children.get(parent) ?? []
      list.push(row)
      children.set(parent, list)
    } else roots.push(row)
  }
  return { children, roots }
}
export function defaultTreeCollapsed(rows: FolderRow[]) {
  const { children, roots } = treeStructure(rows),
    rootIds = new Set(roots.map((r) => r.rowId))
  return [...children.keys()].filter(
    (id) => !rootIds.has(id) || (children.get(id)?.length ?? 0) > 200
  )
}
export function visibleTreeRows(rows: FolderRow[], collapsed: string[]) {
  const { children, roots } = treeStructure(rows),
    hidden = new Set(collapsed),
    visible: FolderRow[] = [],
    queue = [...roots]
  for (let i = 0; i < queue.length; i++) {
    const row = queue[i]
    visible.push(row)
    if (!hidden.has(row.rowId)) for (const child of children.get(row.rowId) ?? []) queue.push(child)
  }
  return visible
}

// Sorts by name, path, depth or a field; empty values go last, ties keep a stable order by row identity.
export function sortRows(
  rows: FolderRow[],
  sort: { field: string; asc: boolean },
  locale: string,
  value: (row: FolderRow, field: string) => unknown = fieldValue
) {
  const get = (r: FolderRow) =>
    sort.field === 'name'
      ? r.name
      : sort.field === 'path'
        ? r.path
        : sort.field === 'depth'
          ? r.depth
          : value(r, sort.field)
  return [...rows].sort((a, b) => {
    const av = get(a),
      bv = get(b)
    if (av == null || bv == null)
      return av == null ? (bv == null ? a.rowId.localeCompare(b.rowId) : 1) : -1
    return (
      (typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), locale, { numeric: true })) * (sort.asc ? 1 : -1) ||
      a.rowId.localeCompare(b.rowId)
    )
  })
}

// A card component with fallback fields also gets a table column: it shows, and sorts by, the first field in the
// component's order that has a value (so a title from DLsite fills in where the Steam title is missing).
const FALLBACK_COLUMN = 'cell:'
export function fallbackColumns(project: Project) {
  return project.cells
    .filter((cell) => cell.attributeId && cell.fallbackIds?.length)
    .map((cell) => ({ id: FALLBACK_COLUMN + cell.cellId, attributeId: cell.attributeId! }))
}
// Each field group is a column too, showing (and sorting by) what the group shows for that folder.
const GROUP_COLUMN = 'group:'
export function groupColumns(project: Project) {
  return (project.fieldGroups ?? []).map((group) => ({
    id: GROUP_COLUMN + group.groupId,
    label: group.name,
  }))
}
export function columnValue(project: Project, row: FolderRow, id: string): unknown {
  if (id.startsWith(GROUP_COLUMN)) {
    const group = project.fieldGroups?.find((g) => GROUP_COLUMN + g.groupId === id)
    return group ? groupValue(project, group, row).value : undefined
  }
  if (!id.startsWith(FALLBACK_COLUMN)) return fieldValue(row, id)
  const cell = project.cells.find((c) => FALLBACK_COLUMN + c.cellId === id)
  return cell ? cellField(cell, row, project).value : undefined
}
