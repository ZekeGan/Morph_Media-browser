import { fieldValue, type Attribute, type Cell, type FolderRow, type Project } from './model'
import { effectiveKind } from './kind'
import { settleCells } from './fieldGroups'
// R-362: a book's cover is a component of its template (the folder's cover picture, else its first image), so it can
// be moved, resized or left out like any other.
export const bookCover = (grid: Cell['grid'] = { x: 0, y: 0, w: 4, h: 4 }): Cell => ({
  cellId: 'book-cover',
  kind: 'image',
  imageIndex: 1,
  grid,
  style: { textColor: '#e4e6e8', backgroundColor: 'transparent' },
})
export function projectImageCells(project: Project): Cell[] {
  return [
    ...new Map(
      [
        ...project.cells,
        ...(project.layoutPresets?.flatMap((p) => p.cells) ?? []),
        ...Object.values(project.contentCells ?? {}).flat(),
        ...(project.bookPresets?.flatMap((p) => p.cells) ?? []),
        // A book template never saved still shows the default cover, which can be given a picture of its own.
        ...(project.contentCells?.book === undefined ? [bookCover()] : []),
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
    project.kindLayouts?.[effectiveKind(row)]
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

export interface CommonFieldNames {
  rating: string
  tags: string
  status: string
  statuses: string[]
  note: string
}
// A starting set of fields (rating, tags, status, note) added to the project and placed under the card's existing
// components, so a new project is usable without opening the layout editor. Fields whose name is already taken, and
// components that no longer fit, are skipped.
export function addCommonFields(project: Project, names: CommonFieldNames): Project {
  const wanted = [
    { alias: names.rating, type: 'number', kind: 'field-number' },
    { alias: names.tags, type: 'tags', kind: 'field-tags' },
    { alias: names.status, type: 'enum', kind: 'field-enum', options: names.statuses },
    { alias: names.note, type: 'string', kind: 'field-text' },
  ] as const
  const bindings = [...project.fieldBindings],
    cells = [...project.cells]
  let y = Math.max(0, ...cells.map((c) => c.grid.y + c.grid.h))
  for (const item of wanted) {
    const alias = item.alias.trim()
    if (
      !alias ||
      bindings.some((f) => f.alias.toLowerCase() === alias.toLowerCase()) ||
      project.fieldGroups?.some((g) => g.name.trim().toLowerCase() === alias.toLowerCase())
    )
      continue
    if (cells.length >= 50 || y + 1 > 100) break
    const attributeId = crypto.randomUUID()
    bindings.push({
      alias,
      attributeId,
      type: item.type,
      ...('options' in item ? { options: [...item.options] } : {}),
    })
    cells.push({
      cellId: crypto.randomUUID(),
      kind: item.kind,
      attributeId,
      grid: { x: 0, y, w: 12, h: 1 },
      style: { textColor: '#e4e6e8', backgroundColor: 'transparent' },
    })
    y += 1
  }
  return { ...project, fieldBindings: bindings, cells }
}

// Editor preview with the longest (or shortest non-empty) value of every field across the folders, plus the longest
// or shortest name and path, so a layout can be checked against its worst case instead of one chosen folder.
export type PreviewExtreme = 'longest' | 'shortest'
const sizeOf = (value: unknown) =>
  Array.isArray(value)
    ? value.map(String).join('、').length
    : value == null || value === ''
      ? 0
      : String(value).length
export function extremePreviewRow(
  rows: FolderRow[],
  fields: Project['fieldBindings'],
  mode: PreviewExtreme
): FolderRow | undefined {
  const base = rows.find((row) => row.record)
  if (!base?.record) return undefined
  const better = (a: number, b: number) => (mode === 'longest' ? a > b : a < b)
  const pick = <T>(items: T[], size: (item: T) => number) =>
    items
      .filter((item) => size(item) > 0)
      .reduce<T | undefined>(
        (best, item) => (!best || better(size(item), size(best)) ? item : best),
        undefined
      )
  const attributes: Attribute[] = fields.flatMap((field) => {
    const value = pick(
      rows.map((row) => fieldValue(row, field.attributeId)),
      sizeOf
    )
    return value === undefined
      ? []
      : [
          {
            attributeId: field.attributeId,
            key: field.alias,
            type: field.type,
            value,
            source: 'manual',
          },
        ]
  })
  return {
    ...base,
    name: pick(rows, (row) => row.name.length)?.name ?? base.name,
    path: pick(rows, (row) => row.path.length)?.path ?? base.path,
    record: { ...base.record, attributes, projectOverrides: {} },
  }
}

// Editor preview for fields without data (R-230): every field takes a real value from any folder that has one, and a
// sample of its type otherwise, so a new field shows how it will look before any folder holds a value. Never saved.
export type PreviewSamples = Record<string, unknown>
// A group shows its first member with a value, so within a group only the first member gets a sample, and none does
// when any member has real data (a sample would hide it).
export function samplePreviewRow(
  rows: FolderRow[],
  fields: Project['fieldBindings'],
  samples: PreviewSamples,
  groups: Project['fieldGroups'] = []
): FolderRow | undefined {
  const base = rows.find((row) => row.record)
  if (!base?.record) return undefined
  const filled = (value: unknown) => sizeOf(value) > 0
  const real = new Map(
    fields.map((field) => [
      field.attributeId,
      rows.map((row) => fieldValue(row, field.attributeId)).find(filled),
    ])
  )
  const sampled = (attributeId: string) => {
    const group = groups.find((g) => g.memberIds.includes(attributeId))
    return (
      !group ||
      (group.memberIds[0] === attributeId &&
        group.memberIds.every((id) => real.get(id) === undefined))
    )
  }
  const attributes: Attribute[] = fields.flatMap((field) => {
    const own = real.get(field.attributeId)
    const value =
      own !== undefined
        ? own
        : !sampled(field.attributeId)
          ? undefined
          : field.type === 'enum'
            ? field.options?.[0]
            : samples[field.type]
    return value === undefined
      ? []
      : [
          {
            attributeId: field.attributeId,
            key: field.alias,
            type: field.type,
            value,
            source: 'manual',
          },
        ]
  })
  return { ...base, record: { ...base.record, attributes, projectOverrides: {} } }
}

// R-363: book templates are kept as presets like card layouts, so the editor's preset tools serve them too. In the
// editor they stand where the card presets are; the folder choices stand where folderLayouts are.
export function bookEditorProject(project: Project, defaultCells: Cell[], start?: string): Project {
  const presets = project.bookPresets?.length
      ? project.bookPresets
      : [{ id: 'default', name: '預設版面', cells: defaultCells }],
    has = (id?: string) => !!id && presets.some((preset) => preset.id === id),
    active = has(start) ? start! : has(project.bookPresetId) ? project.bookPresetId! : presets[0].id
  return {
    ...project,
    cells: structuredClone(presets.find((preset) => preset.id === active)!.cells),
    layoutPresets: structuredClone(presets),
    activeLayoutId: active,
    folderLayouts: project.folderBookPresets,
    kindLayouts: undefined,
  }
}
// Back from the editor: the card layouts stay as they were. The template chosen when saving becomes the project's
// default, unless the editor was opened for one folder's template (keepDefault), which leaves the default alone.
export function fromBookEditor(original: Project, edited: Project, keepDefault: boolean): Project {
  const synced = syncPresetDraft(edited),
    presets = synced.layoutPresets!,
    fallback = synced.activeLayoutId!,
    chosen =
      keepDefault && presets.some((preset) => preset.id === original.bookPresetId)
        ? original.bookPresetId!
        : fallback,
    // A folder choice whose template was deleted is dropped.
    kept = Object.entries(synced.folderLayouts ?? {}).filter(([, id]) =>
      presets.some((preset) => preset.id === id)
    ),
    folders = kept.length ? Object.fromEntries(kept) : undefined
  // Field groups changed in this editor were settled in its draft (book templates and other content templates); the
  // card layouts restored here are settled against them the same way.
  return settleCells(
    {
      ...synced,
      cells: original.cells,
      layoutPresets: original.layoutPresets,
      activeLayoutId: original.activeLayoutId,
      folderLayouts: original.folderLayouts,
      kindLayouts: original.kindLayouts,
      contentCells: {
        ...synced.contentCells,
        book: structuredClone(presets.find((preset) => preset.id === chosen)!.cells),
      },
      contentCover: true,
      bookPresets: presets,
      bookPresetId: chosen,
      folderBookPresets: folders,
    },
    original.fieldGroups ?? []
  )
}
// The template a book folder shows: its own choice, else the project's.
export function bookCellsFor(
  project: Pick<Project, 'bookPresets' | 'bookPresetId' | 'folderBookPresets'>,
  folderId: string | undefined,
  projectCells: Cell[]
): Cell[] {
  const chosen = folderId ? project.folderBookPresets?.[folderId] : undefined,
    find = (id?: string) => project.bookPresets?.find((preset) => preset.id === id)?.cells
  return find(chosen) ?? find(project.bookPresetId) ?? projectCells
}
