import type { Cell, Project } from '../shared/model'
import { t as tr } from './i18n'

// R-223: a field is chosen by what it is for, each purpose with an example. Underneath they stay the existing
// types. A short text, tags and a choice from a list can be changed into each other; folder records keep the type
// a value was saved with and are converted on read, so a change only touches the project's definition and cells.
export const fieldPurposes = () =>
  [
    { type: 'string', glyph: 'Aa', label: tr('文字'), example: tr('標題、作者、備註') },
    { type: 'tags', glyph: '#', label: tr('多個值'), example: tr('類型、角色') },
    { type: 'enum', glyph: '◉', label: tr('單選'), example: tr('狀態：進行中／已完成') },
    { type: 'number', glyph: '12', label: tr('數字'), example: tr('評分、集數') },
    { type: 'date', glyph: '▦', label: tr('日期'), example: tr('發售日') },
    { type: 'datetime', glyph: '⏱', label: tr('日期和時間'), example: tr('最後遊玩') },
    { type: 'boolean', glyph: '✓', label: tr('是／否'), example: tr('已收藏') },
    { type: 'url', glyph: '↗', label: tr('網址'), example: tr('官網') },
  ] as const
// One short name per purpose, used on the cards, in lists, menus and messages alike (R-228).
export const purposeLabel = (type: string) =>
  fieldPurposes().find((p) => p.type === type)?.label ?? type
// The text for a yes/no value: the field's own wording when set, otherwise the usual yes/no (R-234).
export const yesNo = (value: boolean, binding?: { trueLabel?: string; falseLabel?: string }) =>
  value ? binding?.trueLabel || tr('是') : binding?.falseLabel || tr('否')
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
  role: 'main' | 'fallback' | 'condition' | 'group'
  cell: Cell
}
// Where a field is used. In the card editor the active layout's saved copy is the draft itself; a content template
// editor has its own list as the draft, so that list's saved copy is not counted a second time.
export function fieldUses(project: Project, attributeId: string, cardEditor: boolean): FieldUse[] {
  const group = project.fieldGroups?.find((g) => g.memberIds.includes(attributeId))
  const role = (cell: Cell): FieldUse['role'] | undefined =>
    // A group component shows the group, not the member it is stored with.
    cell.groupId && cell.groupId === group?.groupId
      ? 'group'
      : !cell.groupId && cell.attributeId === attributeId
        ? 'main'
        : cell.fallbackIds?.includes(attributeId)
          ? 'fallback'
          : cell.condition?.attributeId === attributeId
            ? 'condition'
            : undefined
  return cellUses(project, cardEditor, role)
}
// Where a group is shown (components bound to it), in the same places fieldUses looks.
export function groupUseList(project: Project, groupId: string, cardEditor: boolean) {
  return cellUses(project, cardEditor, (cell) => (cell.groupId === groupId ? 'group' : undefined))
}
function cellUses(
  project: Project,
  cardEditor: boolean,
  role: (cell: Cell) => FieldUse['role'] | undefined
): FieldUse[] {
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
// Components that show a field itself (alone or as a fallback); group components count for the group, conditions
// only read the field.
export function shownUses(project: Project, attributeId: string, cardEditor: boolean) {
  return fieldUses(project, attributeId, cardEditor).filter((use) =>
    ['main', 'fallback'].includes(use.role)
  )
}
// Where uses are, counted per layout: "Current layout 2, Game info layout 1".
export function usesSummary(uses: FieldUse[]) {
  const counts = new Map<string, number>()
  for (const use of uses) {
    const where =
      use.where === 'current'
        ? tr('目前版面')
        : use.where === 'preset'
          ? use.name === '預設版面'
            ? tr('預設版面')
            : (use.name ?? '')
          : tr(
              '{0}資訊版面',
              (
                {
                  book: tr('書籍／漫畫'),
                  game: tr('遊戲'),
                  media: tr('影音'),
                  general: tr('一般'),
                } as Record<string, string>
              )[use.name ?? ''] ?? tr('一般')
            )
    counts.set(where, (counts.get(where) ?? 0) + 1)
  }
  return [...counts].map(([where, n]) => `${where} ${n}`).join(tr('、'))
}
// How many components change their display when a field changes purpose (text and tags keep theirs).
export function purposeChangeImpact(project: Project, attributeId: string, next: TextType) {
  const binding = project.fieldBindings.find((field) => field.attributeId === attributeId)
  if (!binding || !(binding.type === 'enum' || next === 'enum')) return 0
  return fieldUses(project, attributeId, true).filter((use) => ['main', 'group'].includes(use.role))
    .length
}

export type DateType = 'date' | 'datetime'
export function switchDateType(
  project: Project,
  attributeId: string,
  next: DateType
): SwitchResult {
  const binding = project.fieldBindings.find((field) => field.attributeId === attributeId)
  if (!binding || !['date', 'datetime'].includes(binding.type) || binding.type === next)
    return { project }
  if (
    (project.fieldGroups?.find((g) => g.memberIds.includes(attributeId))?.memberIds.length ?? 0) > 1
  )
    return { error: 'group' }
  if (
    cellLists(project)
      .flat()
      .some(
        (cell) =>
          cell.fallbackIds?.includes(attributeId) ||
          (cell.attributeId === attributeId && cell.fallbackIds?.length)
      )
  )
    return { error: 'fallback' }
  const kind: Cell['kind'] = next === 'date' ? 'field-date-only' : 'field-date'
  const cells = (list: Cell[]) =>
    list.map((cell) => {
      let next2 = cell
      if (cell.attributeId === attributeId && ['field-date', 'field-date-only'].includes(cell.kind))
        next2 = { ...next2, kind }
      if (
        cell.condition?.attributeId === attributeId &&
        next === 'date' &&
        typeof cell.condition.value === 'string'
      )
        next2 = {
          ...next2,
          condition: { ...cell.condition, value: cell.condition.value.slice(0, 10) },
        }
      return next2
    })
  return {
    project: {
      ...project,
      fieldBindings: project.fieldBindings.map((field) =>
        field.attributeId === attributeId ? { ...field, type: next } : field
      ),
      cells: cells(project.cells),
      ...(project.layoutPresets
        ? {
            layoutPresets: project.layoutPresets.map((preset) => ({
              ...preset,
              cells: cells(preset.cells),
            })),
          }
        : {}),
      ...(project.contentCells
        ? {
            contentCells: Object.fromEntries(
              Object.entries(project.contentCells).map(([key, list]) => [key, cells(list)])
            ),
          }
        : {}),
    },
  }
}

export type SwitchResult =
  | { project: Project }
  | { error: 'fallback' | 'group' | 'condition' | 'condition-option' | 'options' | 'too-many' }

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
  // Nor can it share a group with them.
  if (
    (binding.type === 'enum' || next === 'enum') &&
    (project.fieldGroups?.find((g) => g.memberIds.includes(attributeId))?.memberIds.length ?? 0) > 1
  )
    return { error: 'group' }
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
