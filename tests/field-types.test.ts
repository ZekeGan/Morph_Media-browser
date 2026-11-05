import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateProject, type Cell, type Project } from '../shared/model'
import { modelProject } from './support/model-fixtures'
import { optionsFromValues, switchTextType, textType } from '../src/fieldTypes'

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

test('the two switches map to the existing types, with fixed options winning', () => {
  assert.equal(textType(false, false), 'string')
  assert.equal(textType(true, false), 'tags')
  assert.equal(textType(false, true), 'enum')
})

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
