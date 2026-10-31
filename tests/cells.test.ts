import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cellVisible, copyableValue, numericDisplay } from '../shared/cells'
import { grabOffset, localDragPosition } from '../src/editorDrag'
import { validateProject, type Cell, type FolderRow } from '../shared/model'
import { withoutField } from '../electron/maintenance'
import { modelFolder, modelProject } from './support/model-fixtures'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { folderFile } from '../electron/files'

const row: FolderRow = {
  rowId: 'row',
  path: 'controlled',
  name: 'Controlled',
  projectId: 'project',
  depth: 0,
  stopped: false,
  duplicate: false,
  record: modelFolder(),
}
function cell(extra: Partial<Cell> = {}): Cell {
  return { ...modelProject().cells[0], ...extra }
}
test('conditional cells preserve unknown, zero, false and explicit private override semantics', () => {
  const condition = { attributeId: 'flag', operator: 'set' as const }
  assert.equal(cellVisible(cell({ condition }), row), false)
  for (const value of [0, false, 'ready']) {
    row.record!.attributes = [
      { attributeId: 'flag', key: 'flag', type: 'boolean', source: 'manual', value },
    ]
    assert.equal(cellVisible(cell({ condition }), row), true)
    assert.equal(
      cellVisible(cell({ condition: { ...condition, operator: 'equals', value } }), row),
      true
    )
  }
  row.record!.projectOverrides.project = [
    { attributeId: 'flag', key: 'flag', type: 'boolean', source: 'manual', value: null },
  ]
  assert.equal(cellVisible(cell({ condition }), row), false)
  assert.equal(
    cellVisible(cell({ condition: { ...condition, operator: 'not-equals', value: false } }), row),
    false
  )
  assert.equal(cellVisible(cell({ condition: { ...condition, operator: 'unset' } }), row), true)
})
test('copy values retain falsy values, reject missing/malformed values and numeric displays clamp only presentation', () => {
  assert.equal(copyableValue(false), 'false')
  assert.equal(copyableValue(0), '0')
  assert.equal(copyableValue(['a', 'b']), 'a, b')
  for (const value of [null, undefined, '', [], {}, NaN])
    assert.equal(copyableValue(value), undefined)
  assert.deepEqual(numericDisplay(0, 5), { value: 0, maximum: 5, percent: 0 })
  assert.deepEqual(numericDisplay(120, 100), { value: 120, maximum: 100, percent: 100 })
  assert.equal(numericDisplay(undefined, 5), undefined)
})
test('optional CELL capabilities validate and roundtrip without changing schema or old cells', () => {
  const project = modelProject()
  validateProject(project)
  project.fieldBindings.push({ attributeId: 'flag', alias: 'Flag', type: 'boolean' })
  project.cells = [
    cell({
      kind: 'field-number',
      attributeId: 'rating',
      presentation: 'rating',
      maximum: 5,
      copyValue: true,
      condition: { attributeId: 'flag', operator: 'equals', value: false },
    }),
  ]
  validateProject(project)
  validateProject(JSON.parse(JSON.stringify(project)))
  for (const extra of [
    { presentation: 'script' },
    { presentation: 'badge' },
    { maximum: 0 },
    { maximum: Infinity },
    { copyValue: 'yes' },
    { condition: { attributeId: 'missing', operator: 'set' } },
    { condition: { attributeId: 'flag', operator: 'equals', value: 'false' } },
    { condition: { attributeId: 'flag', operator: 'script' } },
  ]) {
    assert.throws(() => validateProject({ ...project, cells: [{ ...project.cells[0], ...extra }] }))
  }
})
test('field deletion removes condition references from all template scopes without changing unrelated cells', () => {
  const project = modelProject(),
    conditional = cell({
      cellId: 'conditional',
      condition: { attributeId: 'flag', operator: 'set' },
    })
  project.cells.push(conditional)
  project.layoutPresets![0].cells.push(conditional)
  project.contentCells!.manga.push(conditional)
  const clean = withoutField(project, 'flag')
  assert.equal(
    clean.cells.some((c) => c.condition?.attributeId === 'flag'),
    false
  )
  assert.equal(clean.layoutPresets![0].cells.length, project.cells.length - 1)
  assert.equal(clean.contentCells!.manga.length, project.cells.length - 1)
  assert.equal(project.cells.at(-1)?.cellId, 'conditional')
})
test('drag images use actual grab point and canvas drag uses local coordinates after scroll and scaling', () => {
  assert.deepEqual(grabOffset(385, 230, { left: 300, top: 190 }), { x: 85, y: 40 })
  assert.deepEqual(localDragPosition(385, 230, 85, 40, { left: 200, top: 100 }, 1, 0, 0), {
    left: 100,
    top: 90,
  })
  assert.deepEqual(localDragPosition(385, 230, 85, 40, { left: 200, top: 100 }, 0.5, 10, 20), {
    left: 210,
    top: 200,
  })
})
test('conditional templates persist across reopening and field removal previews and cleans every template scope', async () => {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'cells-')),
    media = path.join(root, 'controlled'),
    local = path.join(root, 'local')
  await fs.mkdir(media)
  await fs.writeFile(path.join(media, 'original.txt'), 'ORIGINAL')
  const lib = new Library(local, undefined, false)
  await lib.init()
  await lib.create(media, {
    name: 'Cells',
    mediaCategory: 'other',
    depth: { mode: 'through', level: 1 },
  })
  const project = lib.snapshot().projects[0].project!,
    conditional = cell({
      kind: 'static-text',
      text: 'When set',
      condition: { attributeId: 'flag', operator: 'set' },
    }),
    record = await fs.readFile(folderFile(media))
  await lib.saveProject({
    ...project,
    fieldBindings: [{ attributeId: 'flag', alias: 'Flag', type: 'boolean' }],
    cells: [conditional],
    contentCells: { manga: [conditional] },
  })
  const reopened = new Library(local, undefined, false)
  await reopened.init()
  assert.equal(reopened.snapshot().projects[0].project!.cells[0].condition?.attributeId, 'flag')
  const preview = await reopened.previewDeleteField(project.projectId, 'flag')
  assert.equal(preview.layouts, 2)
  await reopened.deleteField(preview.token)
  const next = reopened.snapshot().projects[0].project!
  assert.deepEqual(next.cells, [])
  assert.deepEqual(next.contentCells!.manga, [])
  assert.deepEqual(await fs.readFile(folderFile(media)), record)
  assert.equal(await fs.readFile(path.join(media, 'original.txt'), 'utf8'), 'ORIGINAL')
})

test('greater/less conditions compare numbers and dates, and never match unknown or mismatched values', () => {
  const at = (type: string, value: unknown) => {
    row.record!.attributes = [
      { attributeId: 'metric', key: 'metric', type, source: 'manual', value },
    ]
    row.record!.projectOverrides.project = []
  }
  const visible = (operator: 'gt' | 'lt', value: string | number) =>
    cellVisible(cell({ condition: { attributeId: 'metric', operator, value } }), row)
  at('number', 4.5)
  assert.equal(visible('gt', 4), true)
  assert.equal(visible('gt', 4.5), false)
  assert.equal(visible('lt', 5), true)
  assert.equal(visible('lt', 4.5), false)
  at('number', 0)
  assert.equal(visible('lt', 1), true, 'zero is a real value')
  at('date', '2026-05-01')
  assert.equal(visible('gt', '2026-04-30'), true)
  assert.equal(visible('lt', '2026-05-01'), false)
  at('date', null)
  assert.equal(visible('gt', '2000-01-01'), false, 'unset never matches')
  at('number', 3)
  assert.equal(visible('gt', '2000-01-01'), false, 'type mismatch never matches')
})
