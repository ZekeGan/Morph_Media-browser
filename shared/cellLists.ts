import type { Cell, Project } from './model'

// R-368: the one place that knows where a project keeps lists of layout components. Everything that must reach
// every list (removing a field, field groups, changing a field's type, usage lists, the search index, settling on
// read, validation) goes through here, so a new kind of list is added to `holders` and nowhere else.
//
// `presets` is an array of { id, name, cells }; `record` is an object of lists by key. `refs` are the settings that
// only mean something next to the holder (the chosen preset, the folders' choices).
const holders = [
  { where: 'layout', key: 'layoutPresets', shape: 'presets', refs: ['activeLayoutId'] },
  { where: 'content', key: 'contentCells', shape: 'record', refs: [] },
  {
    where: 'book',
    key: 'bookPresets',
    shape: 'presets',
    refs: ['bookPresetId', 'folderBookPresets'],
  },
] as const satisfies readonly {
  where: string
  key: keyof Project
  shape: 'presets' | 'record'
  refs: readonly (keyof Project)[]
}[]

// 'card' is `cells` itself: the card being shown, or the list open in an editor.
export const cellListKinds = ['card', ...holders.map((holder) => holder.where)] as const
export type CellListKind = (typeof cellListKinds)[number]
export interface CellList {
  where: CellListKind
  // The preset's id, or the content template's folder kind; the card has none.
  id?: string
  // The preset's name, or the content template's folder kind; the card has none.
  name?: string
  cells: Cell[]
}

const plain = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

// Every cell list of a project, in a stable order: the card, the card layouts, the content templates, the book
// templates. The active card layout's saved copy and `contentCells.book` (the default book template's copy) are
// listed like any other; callers that count things once skip them themselves.
export function cellLists(
  project: Pick<Project, 'cells' | (typeof holders)[number]['key']>
): CellList[] {
  return [
    { where: 'card', cells: project.cells },
    ...holders.flatMap(({ where, key, shape }): CellList[] => {
      const held = project[key]
      if (!held) return []
      return shape === 'presets'
        ? (held as NonNullable<Project['layoutPresets']>).map((preset) => ({
            where,
            id: preset.id,
            name: preset.name,
            cells: preset.cells,
          }))
        : Object.entries(held as Record<string, Cell[]>).map(([id, cells]) => ({
            where,
            id,
            name: id,
            cells,
          }))
    }),
  ]
}

// The same change applied to every list of a record that has not been validated yet (read from disk, on its way
// through an upgrade). Holders that are absent stay absent; anything of an unexpected shape is left as it is.
export function mapRawCellLists(
  value: Record<string, unknown>,
  map: (list: unknown) => unknown
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...value, cells: map(value.cells) }
  for (const { key, shape } of holders) {
    const held = value[key]
    if (shape === 'presets' && Array.isArray(held))
      next[key] = held.map((preset) =>
        plain(preset) ? { ...preset, cells: map(preset.cells) } : preset
      )
    else if (shape === 'record' && plain(held))
      next[key] = Object.fromEntries(Object.entries(held).map(([id, list]) => [id, map(list)]))
  }
  return next
}

// One change applied to every cell list of a project. `contentCells.book` and the default book template get the same
// change, so they stay the copies of each other they were.
export function mapCellLists(project: Project, map: (cells: Cell[]) => Cell[]): Project {
  return mapRawCellLists(
    project as unknown as Record<string, unknown>,
    map as (list: unknown) => unknown
  ) as unknown as Project
}

// The value with one list as its card and no other list: what validation checks each saved list as, so a list is
// checked once and not again inside every other one. It runs on values still being validated, so it takes the raw
// record, not a Project.
export function withOnlyCells(
  value: Record<string, unknown>,
  cells: unknown
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...value, cells }
  for (const { key, refs } of holders) for (const name of [key, ...refs]) next[name] = undefined
  return next
}
