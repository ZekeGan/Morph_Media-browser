import type { Cell, Project } from '../shared/model'
import { t as tr } from './i18n'

// R-223: a field is chosen by what it is for, each purpose with an example. Underneath they stay the existing
// types. A short text, tags and a choice from a list can be changed into each other; folder records keep the type
// a value was saved with and are converted on read, so a change only touches the project's definition and cells.
export const fieldPurposes = () =>
  [
    { type: 'string', glyph: 'Aa', label: tr('一段文字'), example: tr('備註、作者、原名') },
    { type: 'tags', glyph: '#', label: tr('多個標籤'), example: tr('類型、角色') },
    { type: 'enum', glyph: '◉', label: tr('從清單選一個'), example: tr('狀態：進行中／已完成') },
    { type: 'number', glyph: '12', label: tr('數字'), example: tr('評分、集數') },
    { type: 'date', glyph: '▦', label: tr('日期'), example: tr('發售日') },
    { type: 'datetime', glyph: '⏱', label: tr('日期和時間'), example: tr('最後遊玩') },
    { type: 'boolean', glyph: '✓', label: tr('是／否'), example: tr('已收藏') },
    { type: 'url', glyph: '↗', label: tr('網址'), example: tr('官網') },
  ] as const
// The short name shown in lists; a choice from a list is shortened to fit one line.
export const purposeLabel = (type: string) =>
  type === 'enum' ? tr('清單選一個') : (fieldPurposes().find((p) => p.type === type)?.label ?? type)
export const purposeGlyph = (type: string) =>
  fieldPurposes().find((p) => p.type === type)?.glyph ?? '·'

export const textTypes = ['string', 'tags', 'enum'] as const
export type TextType = (typeof textTypes)[number]
export const isTextType = (type: string): type is TextType =>
  (textTypes as readonly string[]).includes(type)

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

export type FieldUse = {
  where: 'current' | 'preset' | 'content'
  // The other layout's name, or the content template's category.
  name?: string
  role: 'main' | 'fallback' | 'condition'
  cell: Cell
}
// Where a field is used. In the card editor the active layout's saved copy is the draft itself; a content template
// editor has its own list as the draft, so that list's saved copy is not counted a second time.
export function fieldUses(project: Project, attributeId: string, cardEditor: boolean): FieldUse[] {
  const role = (cell: Cell): FieldUse['role'] | undefined =>
    cell.attributeId === attributeId
      ? 'main'
      : cell.fallbackIds?.includes(attributeId)
        ? 'fallback'
        : cell.condition?.attributeId === attributeId
          ? 'condition'
          : undefined
  const from = (where: FieldUse['where'], cells: Cell[], name?: string) =>
    cells.flatMap((cell) => {
      const found = role(cell)
      return found ? [{ where, name, role: found, cell }] : []
    })
  return [
    ...from('current', project.cells),
    ...(project.layoutPresets ?? [])
      .filter((preset) => !cardEditor || preset.id !== project.activeLayoutId)
      .flatMap((preset) => from('preset', preset.cells, preset.name)),
    ...Object.entries(project.contentCells ?? {}).flatMap(([category, cells]) =>
      from(
        'content',
        cardEditor
          ? cells
          : cells.filter((cell) => !project.cells.some((own) => own.cellId === cell.cellId)),
        category
      )
    ),
  ]
}
// How many components change their display when a field changes purpose (text and tags keep theirs).
export function purposeChangeImpact(project: Project, attributeId: string, next: TextType) {
  const binding = project.fieldBindings.find((field) => field.attributeId === attributeId)
  if (!binding || !(binding.type === 'enum' || next === 'enum')) return 0
  return fieldUses(project, attributeId, true).filter((use) => use.role === 'main').length
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
