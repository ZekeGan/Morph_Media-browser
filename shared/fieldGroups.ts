import { compatibleFieldTypes } from './fields'
import { MAX_GROUP_MEMBERS, type Cell, type FieldGroup, type Project } from './model'

// Field groups (R-226): fields holding the same kind of data from different sources, shown as one. Every change
// here returns a new project; cells, layouts, content templates and per-folder choices follow the group.

export type GroupRefusal = 'type' | 'full' | 'same' | 'name'

export function groupOfField(project: Pick<Project, 'fieldGroups'>, attributeId: string) {
  return project.fieldGroups?.find((group) => group.memberIds.includes(attributeId))
}
const typeOf = (project: Project, attributeId: string) =>
  project.fieldBindings.find((field) => field.attributeId === attributeId)?.type
export function groupType(project: Project, group: FieldGroup) {
  return typeOf(project, group.memberIds[0])
}

// Why a field cannot join a group (or start one with another field); undefined when it can.
export function joinRefusal(
  project: Project,
  target: { groupId: string } | { attributeId: string },
  attributeId: string
): GroupRefusal | undefined {
  const group =
    'groupId' in target
      ? project.fieldGroups?.find((g) => g.groupId === target.groupId)
      : groupOfField(project, target.attributeId)
  const members = group?.memberIds ?? ('attributeId' in target ? [target.attributeId] : [])
  if (members.includes(attributeId)) return 'same'
  if (!compatibleFieldTypes(typeOf(project, members[0]), typeOf(project, attributeId)))
    return 'type'
  if (members.length >= MAX_GROUP_MEMBERS) return 'full'
  return undefined
}

export function groupNameTaken(project: Project, name: string, exceptGroupId?: string) {
  const key = name.trim().toLocaleLowerCase()
  return (
    project.fieldBindings.some((field) => field.alias.trim().toLocaleLowerCase() === key) ||
    !!project.fieldGroups?.some(
      (group) => group.groupId !== exceptGroupId && group.name.trim().toLocaleLowerCase() === key
    )
  )
}
// A free name from a base: "Title", "Title 2", "Title 3"…
export function freeGroupName(project: Project, base: string) {
  const start = base.trim().slice(0, 90) || 'Group'
  for (let n = 1; ; n++) {
    const name = n === 1 ? start : `${start} ${n}`
    if (!groupNameTaken(project, name)) return name
  }
}

function mapCells(project: Project, map: (cells: Cell[]) => Cell[]): Project {
  return {
    ...project,
    cells: map(project.cells),
    ...(project.layoutPresets
      ? {
          layoutPresets: project.layoutPresets.map((preset) => ({
            ...preset,
            cells: map(preset.cells),
          })),
        }
      : {}),
    ...(project.contentCells
      ? {
          contentCells: Object.fromEntries(
            Object.entries(project.contentCells).map(([key, cells]) => [key, map(cells)])
          ),
        }
      : {}),
    ...(project.bookPresets
      ? {
          bookPresets: project.bookPresets.map((preset) => ({
            ...preset,
            cells: map(preset.cells),
          })),
        }
      : {}),
  }
}
function withGroups(project: Project, groups: FieldGroup[]): Project {
  const next = { ...project }
  if (groups.length) next.fieldGroups = groups
  else delete next.fieldGroups
  // Choices for groups or members that no longer exist are cleared.
  const sources = Object.fromEntries(
    Object.entries(project.groupSources ?? {}).flatMap(([folder, chosen]) => {
      const kept = Object.entries(chosen).filter(([groupId, member]) =>
        groups.some((g) => g.groupId === groupId && g.memberIds.includes(member))
      )
      return kept.length ? [[folder, Object.fromEntries(kept)]] : []
    })
  )
  if (Object.keys(sources).length) next.groupSources = sources
  else delete next.groupSources
  return next
}
// Cells showing a group stay bound to one of its members; a dissolved group leaves its cells on its first member.
export function settleCells(project: Project, before: FieldGroup[]): Project {
  return mapCells(project, (cells) =>
    cells.map((cell) => {
      if (!cell.groupId) return cell
      const now = project.fieldGroups?.find((g) => g.groupId === cell.groupId)
      if (now) {
        if (cell.attributeId && now.memberIds.includes(cell.attributeId)) return cell
        return { ...cell, attributeId: now.memberIds[0] }
      }
      const old = before.find((g) => g.groupId === cell.groupId)
      const { groupId: _drop, ...plain } = cell
      return { ...plain, attributeId: old?.memberIds[0] ?? cell.attributeId }
    })
  )
}
function change(project: Project, groups: FieldGroup[]): Project {
  const before = project.fieldGroups ?? [],
    next = settleCells(withGroups(project, groups), before),
    gone = before.filter((g) => !groups.some((now) => now.groupId === g.groupId))
  // A saved search that named a dissolved group searches its first member from then on.
  if (gone.length && next.savedSearches)
    next.savedSearches = next.savedSearches.map((search) =>
      search.queryAst?.groups.flat().some((term) => gone.some((g) => g.groupId === term.field))
        ? {
            ...search,
            queryAst: {
              ...search.queryAst,
              groups: search.queryAst.groups.map((terms) =>
                terms.map((term) => {
                  const old = gone.find((g) => g.groupId === term.field)
                  return old ? { ...term, field: old.memberIds[0] } : term
                })
              ),
            },
          }
        : search
    )
  return next
}
// A field leaves whatever group it is in; a group left with no members is dissolved.
function without(groups: FieldGroup[], attributeId: string) {
  return groups
    .map((g) => ({ ...g, memberIds: g.memberIds.filter((id) => id !== attributeId) }))
    .filter((g) => g.memberIds.length > 0)
}

export function createGroup(
  project: Project,
  memberIds: string[],
  name: string,
  groupId: string
): Project {
  const ids = [...new Set(memberIds)]
  if (ids.length < 1 || ids.length > MAX_GROUP_MEMBERS) throw new Error('full')
  if (ids.some((id) => !compatibleFieldTypes(typeOf(project, ids[0]), typeOf(project, id))))
    throw new Error('type')
  if (!name.trim() || name.trim().length > 100 || groupNameTaken(project, name))
    throw new Error('name')
  let groups = project.fieldGroups ?? []
  for (const id of ids) groups = without(groups, id)
  return change(project, [{ groupId, name: name.trim(), memberIds: ids }, ...groups])
}
export function addToGroup(
  project: Project,
  groupId: string,
  attributeId: string,
  index?: number
): Project {
  const refusal = joinRefusal(project, { groupId }, attributeId)
  if (refusal === 'same') return project
  if (refusal) throw new Error(refusal)
  const groups = without(project.fieldGroups ?? [], attributeId).map((g) => {
    if (g.groupId !== groupId) return g
    const members = [...g.memberIds]
    members.splice(index ?? members.length, 0, attributeId)
    return { ...g, memberIds: members }
  })
  return change(project, groups)
}
export function removeFromGroup(project: Project, attributeId: string): Project {
  if (!groupOfField(project, attributeId)) return project
  return change(project, without(project.fieldGroups ?? [], attributeId))
}
export function reorderGroup(project: Project, groupId: string, memberIds: string[]): Project {
  return change(
    project,
    (project.fieldGroups ?? []).map((g) =>
      g.groupId === groupId &&
      memberIds.length === g.memberIds.length &&
      memberIds.every((id) => g.memberIds.includes(id))
        ? { ...g, memberIds: [...memberIds] }
        : g
    )
  )
}
export function renameGroup(project: Project, groupId: string, name: string): Project {
  if (!name.trim() || name.trim().length > 100 || groupNameTaken(project, name, groupId))
    throw new Error('name')
  return change(
    project,
    (project.fieldGroups ?? []).map((g) =>
      g.groupId === groupId ? { ...g, name: name.trim() } : g
    )
  )
}
export function dissolveGroup(project: Project, groupId: string): Project {
  return change(
    project,
    (project.fieldGroups ?? []).filter((g) => g.groupId !== groupId)
  )
}
// A folder's own choice of member for a group (undefined goes back to the group's order).
export function setGroupSource(
  project: Project,
  folderId: string,
  groupId: string,
  attributeId: string | undefined
): Project {
  const group = project.fieldGroups?.find((g) => g.groupId === groupId)
  if (!group || (attributeId && !group.memberIds.includes(attributeId))) return project
  const chosen = { ...(project.groupSources?.[folderId] ?? {}) }
  if (attributeId) chosen[groupId] = attributeId
  else delete chosen[groupId]
  const sources = { ...(project.groupSources ?? {}) }
  if (Object.keys(chosen).length) sources[folderId] = chosen
  else delete sources[folderId]
  const next: Project = { ...project, groupSources: sources }
  if (!Object.keys(sources).length) delete next.groupSources
  return next
}
// Binding a cell to a group (or back to a single field) in the given cell list.
export function bindCellToGroup(cell: Cell, group: FieldGroup): Cell {
  const { fallbackIds: _drop, ...plain } = cell
  return { ...plain, groupId: group.groupId, attributeId: group.memberIds[0] }
}
// An older component with fallback fields becomes a group of those fields, in the same order. Fields already in
// another group are moved into the new one.
export function groupFromFallbacks(
  project: Project,
  cellId: string,
  name: string,
  groupId: string
): Project {
  const cell = [
    project.cells,
    ...(project.layoutPresets?.map((p) => p.cells) ?? []),
    ...(project.bookPresets?.map((p) => p.cells) ?? []),
  ]
    .flat()
    .find((c) => c.cellId === cellId)
  if (!cell?.attributeId || !cell.fallbackIds?.length) return project
  const next = createGroup(project, [cell.attributeId, ...cell.fallbackIds], name, groupId),
    group = next.fieldGroups!.find((g) => g.groupId === groupId)!
  return mapCells(next, (cells) =>
    cells.map((c) => (c.cellId === cellId ? bindCellToGroup(c, group) : c))
  )
}
// Deleting a field: it leaves its group first, so cells showing the group move on to the next member.
export function groupsWithoutField(project: Project, attributeId: string): Project {
  return removeFromGroup(project, attributeId)
}
