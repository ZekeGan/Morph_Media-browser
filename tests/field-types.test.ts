import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fieldTypes } from '../shared/fields'
import { validateProject, type Cell, type Project } from '../shared/model'
import { modelProject } from './support/model-fixtures'
import {
  fieldPurposes,
  fieldUses,
  optionsFromValues,
  purposeChangeImpact,
  switchTextType,
} from '../src/editor/fieldTypes'
import { orderedFieldSourceGroups } from '../src/editor/fieldSources'
import { t as tr } from '../src/i18n'

const style = { textColor: '#ffffff', backgroundColor: 'transparent' }
const cell = (patch: Partial<Cell>): Cell => ({
  cellId: crypto.randomUUID(),
  kind: 'field-text',
  attributeId: 'note',
  grid: { x: 0, y: 0, w: 12, h: 1 },
  style,
  ...patch,
})
const project = (cells: Cell[], fields: Project['fieldBindings'] = []): Project => ({
  ...modelProject(),
  fieldBindings: [{ alias: 'Note', attributeId: 'note', type: 'string' }, ...fields],
  cells,
  layoutPresets: [{ id: 'preset', name: 'Default', cells: structuredClone(cells) }],
  activeLayoutId: 'preset',
  contentCells: undefined,
})
const switched = (result: ReturnType<typeof switchTextType>) => {
  assert.ok('project' in result, JSON.stringify(result))
  validateProject(result.project)
  return result.project
}

test('multiple values only changes the field type; components keep their display', () => {
  const p = switched(switchTextType(project([cell({ wrap: true })]), 'note', 'tags', []))
  assert.equal(p.fieldBindings[0].type, 'tags')
  assert.equal(p.cells[0].kind, 'field-text')
  assert.equal(p.cells[0].wrap, true)
})

test('fixed options take their options from stored values and move components to the choice display', () => {
  const layout = cell({ wrap: true, scroll: true }),
    other = cell({ cellId: 'other', kind: 'field-tags', tagPrefix: true })
  const p = switched(
    switchTextType(
      {
        ...project([layout]),
        layoutPresets: [
          { id: 'preset', name: 'Default', cells: [layout] },
          { id: 'second', name: 'Second', cells: [other] },
        ],
        contentCells: { book: [cell({ cellId: 'book' })] },
      },
      'note',
      'enum',
      ['Ready', ' Ready ', ['Done'], '', 'x'.repeat(101), 3]
    )
  )
  assert.deepEqual(p.fieldBindings[0].options, ['Ready', 'Done'])
  assert.equal(p.cells[0].kind, 'field-enum')
  assert.equal(p.cells[0].wrap, undefined)
  assert.equal(p.layoutPresets![1].cells[0].kind, 'field-enum')
  assert.equal(p.layoutPresets![1].cells[0].tagPrefix, undefined)
  assert.equal(p.contentCells!.book[0].kind, 'field-enum')
})

test('leaving fixed options keeps the options for later but drops their colours', () => {
  const start = project([cell({ kind: 'field-enum', presentation: 'badge' })])
  start.fieldBindings[0] = {
    alias: 'Note',
    attributeId: 'note',
    type: 'enum',
    options: ['A'],
    optionColors: { A: '#ff0000' },
  }
  const p = switched(switchTextType(start, 'note', 'tags', []))
  assert.deepEqual(p.fieldBindings[0], {
    alias: 'Note',
    attributeId: 'note',
    type: 'tags',
    options: ['A'],
  })
  assert.equal(p.cells[0].kind, 'field-tags')
  assert.equal(p.cells[0].presentation, undefined)
  // Back to fixed options: the kept options are used again.
  const back = switched(switchTextType(p, 'note', 'enum', []))
  assert.deepEqual(back.fieldBindings[0].options, ['A'])
})

test('switches that would leave an invalid layout are refused with a reason', () => {
  const tags = { alias: 'Tags', attributeId: 'tags', type: 'tags' }
  assert.deepEqual(
    switchTextType(project([cell({ fallbackIds: ['tags'] })], [tags]), 'note', 'enum', ['a']),
    { error: 'fallback' }
  )
  assert.deepEqual(
    switchTextType(
      project([cell({ attributeId: 'tags', kind: 'field-tags', fallbackIds: ['note'] })], [tags]),
      'note',
      'enum',
      ['a']
    ),
    { error: 'fallback' }
  )
  assert.deepEqual(
    switchTextType(
      project([
        cell({
          kind: 'static-text',
          attributeId: undefined,
          condition: { attributeId: 'note', operator: 'equals', value: 'x' },
        }),
      ]),
      'note',
      'tags',
      []
    ),
    { error: 'condition' }
  )
  assert.deepEqual(switchTextType(project([]), 'note', 'enum', []), { error: 'options' })
  assert.deepEqual(
    switchTextType(
      project([]),
      'note',
      'enum',
      Array.from({ length: 101 }, (_, i) => 'v' + i)
    ),
    { error: 'too-many' }
  )
  assert.equal(optionsFromValues(['a', 'a', ['b']])!.join(), 'a,b')
})

test('fixed options keep earlier options, add newer values and respect equals conditions', () => {
  const start = project([])
  start.fieldBindings[0] = { alias: 'Note', attributeId: 'note', type: 'string', options: ['A'] }
  const merged = switched(switchTextType(start, 'note', 'enum', ['B', 'A']))
  assert.deepEqual(merged.fieldBindings[0].options, ['A', 'B'])
  const condition = (value: string) =>
    project([
      cell({
        kind: 'static-text',
        attributeId: undefined,
        condition: { attributeId: 'note', operator: 'equals', value },
      }),
    ])
  assert.deepEqual(switchTextType(condition(''), 'note', 'enum', ['Ready']), {
    error: 'condition-option',
  })
  switched(switchTextType(condition('Ready'), 'note', 'enum', ['Ready']))
})

test('all eight field types have a purpose with an example', () => {
  const purposes = fieldPurposes()
  assert.deepEqual(purposes.map((purpose) => purpose.type).sort(), [...fieldTypes].sort())
  assert.ok(purposes.every((purpose) => purpose.label && purpose.example && purpose.glyph))
})

test('source groups are ordered: own fields first, then websites by name', () => {
  const field = (attributeId: string) => ({ attributeId })
  const groups = orderedFieldSourceGroups([
    field('steam-name'),
    field('note'),
    field('dlsite-title'),
    field('steam-other'),
  ])
  assert.deepEqual(
    groups.map((group) => group.source),
    [tr('自建'), 'DLsite', 'Steam']
  )
  assert.deepEqual(
    groups[2].fields.map((f) => f.attributeId),
    ['steam-name', 'steam-other'],
    'fields keep their order inside a group'
  )
})

test('a field lists its uses once per layout, and only choice changes alter components', () => {
  const main = cell({ cellId: 'main' })
  const start: Project = {
    ...project([main, cell({ cellId: 'fall', attributeId: 'other', fallbackIds: ['note'] })]),
    layoutPresets: [
      { id: 'preset', name: 'Default', cells: [main] },
      { id: 'second', name: 'Second', cells: [cell({ cellId: 'second' })] },
    ],
    contentCells: {
      book: [
        cell({
          cellId: 'when',
          kind: 'static-text',
          attributeId: undefined,
          condition: { attributeId: 'note', operator: 'set' },
        }),
      ],
    },
  }
  assert.deepEqual(
    fieldUses(start, 'note', true).map((use) => [use.where, use.name, use.role, use.cell.cellId]),
    [
      ['current', undefined, 'main', 'main'],
      ['current', undefined, 'fallback', 'fall'],
      ['preset', 'Second', 'main', 'second'],
      ['content', 'book', 'condition', 'when'],
    ]
  )
  // A content template editor has its own list as the draft and sees every saved layout and other template.
  assert.deepEqual(
    fieldUses(start, 'note', false).map((use) => use.cell.cellId),
    ['main', 'fall', 'main', 'second', 'when']
  )
  assert.deepEqual(
    fieldUses(
      { ...start, cells: [start.contentCells!.book[0]], layoutPresets: undefined },
      'note',
      false
    ).map((use) => [use.where, use.cell.cellId]),
    [['current', 'when']],
    'the template being edited is not counted twice'
  )
  assert.equal(purposeChangeImpact(start, 'note', 'tags'), 0)
  assert.equal(purposeChangeImpact(start, 'note', 'enum'), 2)
})

test('date and date-and-time switch into each other; components follow (R-234)', async () => {
  const { switchDateType } = await import('../src/editor/fieldTypes')
  const p = project(
    [cell({ kind: 'field-date', attributeId: 'when', condition: undefined })],
    [{ alias: 'When', attributeId: 'when', type: 'datetime' }]
  )
  const withCondition: Project = {
    ...p,
    cells: [
      {
        ...p.cells[0],
        condition: { attributeId: 'when', operator: 'gt', value: '2025-01-02T10:00' },
      },
    ],
  }
  const next = switched(switchDateType(withCondition, 'when', 'date'))
  assert.equal(next.fieldBindings.find((f) => f.attributeId === 'when')!.type, 'date')
  assert.equal(next.cells[0].kind, 'field-date-only')
  assert.equal(next.cells[0].condition!.value, '2025-01-02', 'a condition keeps only the date')
  const back = switched(switchDateType(next, 'when', 'datetime'))
  assert.equal(back.cells[0].kind, 'field-date')
})

test('yes/no wording is optional, 1-20 characters, and only on yes/no fields (R-234)', async () => {
  const { yesNo } = await import('../src/editor/fieldTypes')
  const p = project([], [{ alias: 'Owned', attributeId: 'owned', type: 'boolean' }])
  const labelled = (patch: object): Project => ({
    ...p,
    fieldBindings: p.fieldBindings.map((f) => (f.attributeId === 'owned' ? { ...f, ...patch } : f)),
  })
  validateProject(labelled({ trueLabel: '已收藏', falseLabel: '未收藏' }))
  assert.throws(() => validateProject(labelled({ trueLabel: ' ' })))
  assert.throws(() => validateProject(labelled({ trueLabel: 'Done', falseLabel: 'done ' })))
  assert.throws(() => validateProject(labelled({ falseLabel: 'x'.repeat(21) })))
  assert.throws(() =>
    validateProject({
      ...p,
      fieldBindings: p.fieldBindings.map((f) =>
        f.attributeId === 'note' ? { ...f, trueLabel: 'Yes' } : f
      ),
    })
  )
  assert.equal(yesNo(true, { trueLabel: '已收藏' }), '已收藏')
  assert.equal(yesNo(false, { trueLabel: '已收藏' }), tr('否'))
})
