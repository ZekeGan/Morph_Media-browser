import type { Cell, Project } from '../shared/model'

// R-223, stage 1: text, tags and single choice are one "text" field with two switches, "multiple values" (tags)
// and "fixed options" (enum). Underneath they stay the existing types; folder records keep the type a value was
// saved with and are converted on read, so a switch only changes the project's field definition and the cells.
export const textTypes = ['string', 'tags', 'enum'] as const
export type TextType = (typeof textTypes)[number]
export const isTextType = (type: string): type is TextType =>
  (textTypes as readonly string[]).includes(type)
export const textType = (multiple: boolean, fixed: boolean): TextType =>
  fixed ? 'enum' : multiple ? 'tags' : 'string'

const kinds: Record<TextType, Cell['kind']> = {
  string: 'field-text',
  tags: 'field-tags',
  enum: 'field-enum',
}

// Distinct values already stored for a field, usable as fixed options (at most 100, each 1-100 characters).
export function optionsFromValues(values: unknown[]): string[] | undefined {
  const options = [
    ...new Set(
      values
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0 && value.length <= 100)
    ),
  ]
  return options.length > 100 ? undefined : options
}

// Every list of cells in the draft: the card being edited, the other saved layouts and the content templates.
function cellLists(project: Project): Cell[][] {
  return [
    project.cells,
    ...(project.layoutPresets ?? []).map((preset) => preset.cells),
    ...Object.values(project.contentCells ?? {}),
  ]
}

export type SwitchResult =
  | { project: Project }
  | { error: 'fallback' | 'condition' | 'condition-option' | 'options' | 'too-many' }

export function switchTextType(
  project: Project,
  attributeId: string,
  next: TextType,
  values: unknown[]
): SwitchResult {
  const binding = project.fieldBindings.find((field) => field.attributeId === attributeId)
  if (!binding || !isTextType(binding.type) || binding.type === next) return { project }
  const cells = cellLists(project).flat()
  // A choice field cannot share a component with text or tag sources.
  if (
    (binding.type === 'enum' || next === 'enum') &&
    cells.some(
      (cell) =>
        (cell.attributeId === attributeId && cell.fallbackIds?.length) ||
        cell.fallbackIds?.includes(attributeId)
    )
  )
    return { error: 'fallback' }
  // "Equals" conditions are not offered for tag lists.
  if (
    next === 'tags' &&
    cells.some(
      (cell) =>
        cell.condition?.attributeId === attributeId &&
        ['equals', 'not-equals'].includes(cell.condition.operator)
    )
  )
    return { error: 'condition' }
  let options = binding.options
  if (next === 'enum') {
    // Options kept from an earlier switch come first, then values folders gained since.
    const derived = optionsFromValues(values)
    if (!derived) return { error: 'too-many' }
    options = [...new Set([...(binding.options ?? []), ...derived])]
    if (options.length > 100) return { error: 'too-many' }
    if (!options.length) return { error: 'options' }
    // An "equals" condition on a choice field must compare with one of its options.
    if (
      cells.some(
        (cell) =>
          cell.condition?.attributeId === attributeId &&
          ['equals', 'not-equals'].includes(cell.condition.operator) &&
          !options!.includes(String(cell.condition.value ?? ''))
      )
    )
      return { error: 'condition-option' }
  }
  const { optionColors: _colors, ...rest } = binding
  const updated: Project['fieldBindings'][number] =
    next === 'enum' ? { ...binding, type: next, options } : { ...rest, type: next }
  // Components that show the field follow it into or out of the choice display; text and tags display each
  // other's values already, so those components keep the display the user chose.
  const convert = (list: Cell[]) =>
    list.map((cell) => {
      if (cell.attributeId !== attributeId || !(binding.type === 'enum' || next === 'enum'))
        return cell
      const {
        wrap: _wrap,
        scroll: _scroll,
        tagColors: _tagColors,
        tagPrefix: _tagPrefix,
        presentation: _presentation,
        ...plain
      } = cell
      return {
        ...plain,
        kind: kinds[next],
        ...(next === 'enum' && cell.presentation === 'badge' ? { presentation: 'badge' } : {}),
      } as Cell
    })
  return {
    project: {
      ...project,
      fieldBindings: project.fieldBindings.map((field) =>
        field.attributeId === attributeId ? updated : field
      ),
      cells: convert(project.cells),
      ...(project.layoutPresets
        ? {
            layoutPresets: project.layoutPresets.map((preset) => ({
              ...preset,
              cells: convert(preset.cells),
            })),
          }
        : {}),
      ...(project.contentCells
        ? {
            contentCells: Object.fromEntries(
              Object.entries(project.contentCells).map(([category, list]) => [
                category,
                convert(list),
              ])
            ),
          }
        : {}),
    },
  }
}
