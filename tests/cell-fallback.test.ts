import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cellField } from '../shared/cells'
import { addCommonFields, rowCells } from '../shared/layouts'
import {
  cellsWithoutField,
  validateProject,
  type Cell,
  type FolderRow,
  type Project,
} from '../shared/model'
import { modelProject } from './support/model-fixtures'

const row = (values: Record<string, unknown>): FolderRow =>
  ({
    projectId: 'project',
    record: {
      attributes: Object.entries(values).map(([attributeId, value]) => ({ attributeId, value })),
      projectOverrides: {},
    },
  }) as unknown as FolderRow
const cell = (patch: Partial<Cell> = {}): Cell => ({
  cellId: 'c',
  kind: 'field-text',
  attributeId: 'steam',
  fallbackIds: ['dlsite', 'getchu'],
  grid: { x: 0, y: 0, w: 12, h: 1 },
  style: { textColor: '#ffffff', backgroundColor: 'transparent' },
  ...patch,
})

test('a field cell shows the first field in order that has a value', () => {
  const pick = (values: Record<string, unknown>) => cellField(cell(), row(values))
  assert.deepEqual(pick({ steam: 'S', dlsite: 'D' }), {
    attributeId: 'steam',
    value: 'S',
    index: 0,
  })
  assert.deepEqual(pick({ dlsite: 'D', getchu: 'G' }), {
    attributeId: 'dlsite',
    value: 'D',
    index: 1,
  })
  assert.equal(
    pick({ steam: '   ', getchu: 'G' }).attributeId,
    'getchu',
    'blank text counts as empty'
  )
  assert.equal(pick({ steam: '', dlsite: '' }).attributeId, 'steam', 'nothing set: the main field')
  assert.equal(pick({}).value, undefined)
  // Without fallbacks nothing changes.
  assert.equal(
    cellField(cell({ fallbackIds: undefined }), row({ dlsite: 'D' })).attributeId,
    'steam'
  )
  // Number zero and false are real values.
  assert.equal(cellField(cell(), row({ steam: 0, dlsite: 5 })).value, 0)
})

test('fallback fields are validated and follow field deletion', () => {
  const base = modelProject(),
    project = (fallbackIds?: string[], extra: Project['fieldBindings'] = []) => ({
      ...base,
      layoutPresets: undefined,
      activeLayoutId: undefined,
      contentCells: undefined,
      fieldBindings: [...base.fieldBindings, ...extra],
      cells: [{ ...base.cells.find((c) => c.kind === 'field-text')!, fallbackIds }],
    })
  const other = { alias: 'OTHER', attributeId: 'other', type: 'string' },
    count = { alias: 'COUNT', attributeId: 'count', type: 'number' }
  assert.doesNotThrow(() => validateProject(project(['other'], [other])))
  assert.throws(() => validateProject(project(['other'], [count, { ...other, type: 'number' }])))
  assert.throws(() => validateProject(project(['missing'], [other])), /備用欄位/)
  assert.throws(() => validateProject(project(['title'], [other])), 'the main field cannot repeat')
  assert.throws(() => validateProject(project(['other', 'other'], [other])), 'no duplicates')
  assert.throws(() => validateProject(project([], [other])), 'an empty list is not stored')

  // Deleting a field: the cell moves to its next field instead of vanishing; fallback entries are dropped.
  const full = cell()
  assert.deepEqual(cellsWithoutField([full], 'steam')[0].attributeId, 'dlsite')
  assert.deepEqual(cellsWithoutField([full], 'steam')[0].fallbackIds, ['getchu'])
  assert.deepEqual(cellsWithoutField([full], 'dlsite')[0].fallbackIds, ['getchu'])
  assert.equal(
    cellsWithoutField([cell({ fallbackIds: ['dlsite'] })], 'dlsite')[0].fallbackIds,
    undefined
  )
  assert.equal(cellsWithoutField([cell({ fallbackIds: undefined })], 'steam').length, 0)
  assert.equal(cellsWithoutField([full], 'unrelated')[0], full)
})

test('launch cells validate their fallback actions', () => {
  const base = modelProject(),
    launch = (patch: Partial<Cell>) => ({
      ...base,
      layoutPresets: undefined,
      activeLayoutId: undefined,
      contentCells: undefined,
      cells: [
        {
          ...cell({ kind: 'game-launch', attributeId: undefined, fallbackIds: undefined }),
          ...patch,
        },
      ],
    })
  assert.doesNotThrow(() => validateProject(launch({ fallbackActionIds: ['le'] })))
  assert.doesNotThrow(() => validateProject(launch({ actionId: 'a', fallbackActionIds: ['le'] })))
  assert.throws(() => validateProject(launch({ fallbackActionIds: [] })))
  assert.throws(() => validateProject(launch({ actionId: 'le', fallbackActionIds: ['le'] })))
  assert.throws(() => validateProject(launch({ fallbackActionIds: ['le', 'le'] })))
  assert.throws(() =>
    validateProject({ ...launch({}), cells: [cell({ fallbackActionIds: ['le'] })] })
  )
})

test('only long text and tag cells can scroll', () => {
  const base = modelProject(),
    withCell = (c: Cell) => ({
      ...base,
      layoutPresets: undefined,
      activeLayoutId: undefined,
      contentCells: undefined,
      fieldBindings: [...base.fieldBindings, { alias: 'TAGS', attributeId: 'steam', type: 'tags' }],
      cells: [c],
    })
  assert.doesNotThrow(() =>
    validateProject(withCell(cell({ kind: 'field-tags', fallbackIds: undefined, scroll: true })))
  )
  assert.throws(() =>
    validateProject(
      withCell(
        cell({ kind: 'open-folder', attributeId: undefined, fallbackIds: undefined, scroll: true })
      )
    )
  )
  assert.throws(() =>
    validateProject(
      withCell({
        ...cell({ kind: 'field-tags', fallbackIds: undefined }),
        scroll: 1 as unknown as boolean,
      })
    )
  )
})

test('optional text, box and colour styles are validated', () => {
  const base = modelProject(),
    withStyle = (style: Record<string, unknown>, patch: Record<string, unknown> = {}) => ({
      ...base,
      layoutPresets: undefined,
      activeLayoutId: undefined,
      contentCells: undefined,
      cells: [
        {
          ...base.cells.find((c) => c.kind === 'name')!,
          style: { textColor: '#ffffff', backgroundColor: 'transparent', ...style },
          ...patch,
        },
      ],
    })
  assert.doesNotThrow(() =>
    validateProject(
      withStyle({
        fontSize: 'xlarge',
        weight: 'bold',
        italic: true,
        underline: true,
        strike: false,
        valign: 'bottom',
        lineHeight: 'loose',
        letterSpacing: 'wide',
        padding: 'roomy',
        radius: 'large',
        borderColor: '#3fb68b',
        borderWidth: 'thick',
        opacity: 'faint',
      })
    )
  )
  for (const bad of [
    { fontSize: 'huge' },
    { weight: 'heavy' },
    { italic: 'yes' },
    { valign: 'middle' },
    { padding: 'none' },
    { radius: 'round' },
    { borderColor: 'green' },
    { borderWidth: 'wide' },
    { opacity: 0.5 },
  ])
    assert.throws(() => validateProject(withStyle(bad)), JSON.stringify(bad))
  // Tag styles only belong to tag cells.
  assert.throws(() => validateProject(withStyle({}, { tagColors: 'namespace' })))
  assert.throws(() => validateProject(withStyle({}, { tagPrefix: false })))
  // Choice colours: only enum fields, only listed options, only hex colours.
  const choice = (optionColors: unknown, type = 'enum') => ({
    ...base,
    layoutPresets: undefined,
    activeLayoutId: undefined,
    contentCells: undefined,
    fieldBindings: [
      ...base.fieldBindings,
      { alias: 'S', attributeId: 's', type, options: ['A', 'B'], optionColors },
    ],
  })
  assert.doesNotThrow(() => validateProject(choice({ A: '#2f9e44' })))
  assert.throws(() => validateProject(choice({ C: '#2f9e44' })), 'unknown option')
  assert.throws(() => validateProject(choice({ A: 'green' })), 'not hex')
  assert.throws(() => validateProject(choice({ A: '#2f9e44' }, 'string')), 'not an enum')
})

test('a folder takes the layout set for its kind unless it picks its own', () => {
  const project = {
    ...modelProject(),
    layoutPresets: [
      { id: 'a', name: 'A', cells: [] },
      { id: 'b', name: 'B', cells: [cell({ cellId: 'only-b' })] },
    ],
    activeLayoutId: 'a',
    cells: [],
    kindLayouts: { book: 'b' },
  } as Project
  const folder = (kind?: string, folderId = 'f1') =>
    ({
      projectId: 'project',
      record: { folderId, attributes: [], projectOverrides: {}, details: kind ? { kind } : {} },
    }) as unknown as FolderRow
  assert.deepEqual(
    rowCells(project, folder('book')).map((c) => c.cellId),
    ['only-b']
  )
  assert.deepEqual(rowCells(project, folder('media')), [])
  assert.deepEqual(rowCells({ ...project, folderLayouts: { f1: 'a' } }, folder('book')), [])
})

test('common fields are added with matching cells, skipping names already in use', () => {
  const names = { rating: '評分', tags: '標籤', status: '狀態', statuses: ['a', 'b'], note: '備註' }
  const base = { ...modelProject(), fieldBindings: [], cells: [] } as unknown as Project
  const next = addCommonFields(base, names)
  assert.deepEqual(
    next.fieldBindings.map((f) => f.alias),
    ['評分', '標籤', '狀態', '備註']
  )
  assert.deepEqual(
    next.cells.map((c) => c.kind),
    ['field-number', 'field-tags', 'field-enum', 'field-text']
  )
  assert.deepEqual(
    next.cells.map((c) => c.grid.y),
    [0, 1, 2, 3]
  )
  assert.ok(next.cells.every((c, i) => c.attributeId === next.fieldBindings[i].attributeId))
  assert.deepEqual(next.fieldBindings[2].options, ['a', 'b'])
  validateProject(next)
  const again = addCommonFields({ ...next, cells: [] } as Project, names)
  assert.equal(again.fieldBindings.length, 4, 'existing names are not duplicated')
  assert.equal(again.cells.length, 0)
})
