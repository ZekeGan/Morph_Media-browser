import type { Cell, FolderRow, Project } from './model'
import { effectiveKind } from './kind'
export function projectImageCells(project: Project): Cell[] {
  return [
    ...new Map(
      [
        ...project.cells,
        ...(project.layoutPresets?.flatMap((p) => p.cells) ?? []),
        ...Object.values(project.contentCells ?? {}).flat(),
      ]
        .filter((c) => c.kind === 'image')
        .map((c) => [c.cellId, c])
    ).values(),
  ]
}
export interface EditorField {
  attributeId: string
  key: string
  type: string
  shared: boolean
  private: boolean
  conflict: boolean
  hasData: boolean
}
export function editorFields(rows: FolderRow[], projectId: string): EditorField[] {
  const fields = new Map<string, EditorField>()
  for (const row of rows.filter((r) => r.projectId === projectId)) {
    for (const [scope, attributes] of [
      ['shared', row.record?.attributes ?? []],
      ['private', row.record?.projectOverrides[projectId] ?? []],
    ] as const) {
      for (const attribute of attributes) {
        if (
          !['string', 'tags', 'number', 'datetime', 'boolean', 'enum', 'url', 'date'].includes(
            attribute.type
          )
        )
          continue
        const previous = fields.get(attribute.attributeId)
        const hasData =
          attribute.value != null &&
          (typeof attribute.value === 'string'
            ? attribute.value.trim().length > 0
            : Array.isArray(attribute.value)
              ? attribute.value.length > 0
              : true)
        if (previous) {
          previous[scope] = true
          previous.conflict ||= previous.type !== attribute.type
          previous.hasData ||= hasData
        } else
          fields.set(attribute.attributeId, {
            attributeId: attribute.attributeId,
            key: attribute.key,
            type: attribute.type,
            shared: scope === 'shared',
            private: scope === 'private',
            conflict: false,
            hasData,
          })
      }
    }
  }
  return [...fields.values()]
}
export const legacyDefault = (cells: Cell[]) =>
  cells.length === 4 &&
  cells.every(
    (c, i) =>
      c.kind === ['name', 'path', 'field-text', 'open-folder'][i] &&
      c.grid.x === 0 &&
      c.grid.y === i &&
      c.grid.w === 12 &&
      c.grid.h === 1 &&
      c.style.textColor === '#243247' &&
      c.style.backgroundColor === '#ffffff'
  )
export function visibleCells(project: Pick<Project, 'cells' | 'layoutPresets'>): Cell[] {
  return !project.layoutPresets && legacyDefault(project.cells)
    ? project.cells.map((c) => ({
        ...c,
        style: { textColor: '#e4e6e8', backgroundColor: 'transparent' },
      }))
    : project.cells
}
export function cardPresets(project: Project) {
  return (
    project.layoutPresets ?? [{ id: 'default', name: '預設版面', cells: visibleCells(project) }]
  )
}
export function saveCardPreset(
  project: Project,
  options: { name: string; asNew: boolean },
  makeId: () => string,
  base: Project = project
): Project {
  const presets = cardPresets(base),
    name = options.name.trim(),
    id = options.asNew ? makeId() : (project.activeLayoutId ?? presets[0].id)
  if (
    !name ||
    name.length > 100 ||
    presets.some((p) => p.id !== id && p.name.toLocaleLowerCase() === name.toLocaleLowerCase())
  )
    throw new Error('方案名稱需為 1～100 字，且不可重複')
  const preset = { id, name, cells: structuredClone(project.cells) }
  return {
    ...project,
    layoutPresets: options.asNew
      ? [...presets, preset]
      : presets.map((p) => (p.id === id ? preset : p)),
    activeLayoutId: id,
  }
}

// A folder's own choice wins, then the layout set for its kind, then the project's active layout.
export function rowCells(project: Project, row: FolderRow): Cell[] {
  const chosen =
    (row.record?.folderId && project.folderLayouts?.[row.record.folderId]) ||
    project.kindLayouts?.[effectiveKind(row, project)]
  return chosen
    ? (cardPresets(project).find((preset) => preset.id === chosen)?.cells ?? visibleCells(project))
    : visibleCells(project)
}
export function presetDraft(project: Project): Project {
  const presets = structuredClone(cardPresets(project)),
    active = project.activeLayoutId ?? presets[0].id
  return {
    ...structuredClone(project),
    layoutPresets: presets,
    activeLayoutId: active,
    cells: structuredClone(project.cells),
  }
}
export function syncPresetDraft(project: Project): Project {
  return {
    ...project,
    layoutPresets: project.layoutPresets?.map((preset) =>
      preset.id === project.activeLayoutId
        ? { ...preset, cells: structuredClone(project.cells) }
        : preset
    ),
  }
}
export function selectPreset(project: Project, id: string): Project {
  const next = syncPresetDraft(project),
    preset = next.layoutPresets?.find((item) => item.id === id)
  if (!preset) throw new Error('版面方案不存在')
  return { ...next, activeLayoutId: id, cells: structuredClone(preset.cells) }
}
export function addPreset(project: Project, name: string, id: string, copy: boolean): Project {
  const next = syncPresetDraft(project),
    presets = next.layoutPresets ?? []
  name = name.trim()
  if (
    !name ||
    name.length > 100 ||
    presets.length >= 30 ||
    presets.some((preset) => preset.name.toLocaleLowerCase() === name.toLocaleLowerCase())
  )
    throw new Error('方案名稱需為 1～100 字，且不可重複')
  const cells = copy ? structuredClone(project.cells) : []
  return { ...next, layoutPresets: [...presets, { id, name, cells }], activeLayoutId: id, cells }
}
export function renamePreset(project: Project, name: string): Project {
  name = name.trim()
  if (
    !name ||
    name.length > 100 ||
    project.layoutPresets?.some(
      (preset) =>
        preset.id !== project.activeLayoutId &&
        preset.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    )
  )
    throw new Error('方案名稱需為 1～100 字，且不可重複')
  return {
    ...project,
    layoutPresets: project.layoutPresets?.map((preset) =>
      preset.id === project.activeLayoutId ? { ...preset, name } : preset
    ),
  }
}
export function removePreset(project: Project): Project {
  if (!project.layoutPresets || project.layoutPresets.length < 2)
    throw new Error('至少保留一個方案')
  const presets = project.layoutPresets.filter((preset) => preset.id !== project.activeLayoutId),
    first = presets[0]
  return {
    ...project,
    layoutPresets: presets,
    activeLayoutId: first.id,
    cells: structuredClone(first.cells),
    folderLayouts: Object.fromEntries(
      Object.entries(project.folderLayouts ?? {}).filter(([, id]) => id !== project.activeLayoutId)
    ),
    kindLayouts: Object.fromEntries(
      Object.entries(project.kindLayouts ?? {}).filter(([, id]) => id !== project.activeLayoutId)
    ),
  }
}
