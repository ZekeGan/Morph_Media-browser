import type { FolderRow, Project } from './model'
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
export function orderedFileFolders(rows: FolderRow[]) {
  const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
  return rows
    .filter((row) => row.record && !row.readonly && !row.error && !row.stopped)
    .sort(
      (a, b) =>
        a.depth - b.depth ||
        compare(a.name, b.name) ||
        compare(a.path.replaceAll('\\', '/'), b.path.replaceAll('\\', '/'))
    )
}
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
