import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  bookCellsFor,
  bookEditorProject,
  fromBookEditor,
  selectPreset,
  addPreset,
} from '../shared/layouts'
import { validateProject, type Cell, type Project } from '../shared/model'
import { modelProject } from './support/model-fixtures'
import { createGroup, dissolveGroup } from '../shared/fieldGroups'
import { withoutField } from '../electron/maintenance'

const style = { textColor: '#e4e6e8', backgroundColor: 'transparent' }
const cell = (cellId: string, y = 0) =>
  ({ cellId, kind: 'name', grid: { x: 0, y, w: 12, h: 1 }, style }) as Cell
const card: Project = {
  ...modelProject(),
  cells: [cell('card')],
  layoutPresets: [{ id: 'cardA', name: 'Card', cells: [cell('card')] }],
  activeLayoutId: 'cardA',
  folderLayouts: { f1: 'cardA' },
}

test('R-363: book templates go through the editor preset tools and back, card layouts untouched', () => {
  // The first time there is one template, the project's default.
  const opened = bookEditorProject(card, [cell('cover')])
  assert.deepEqual(
    opened.layoutPresets!.map((p) => p.id),
    ['default']
  )
  assert.equal(opened.cells[0].cellId, 'cover')
  // Add a second template and save with it chosen: it becomes the default.
  const added = addPreset(opened, 'Short', 'short', false)
  const saved = fromBookEditor(card, { ...added, cells: [cell('only')] }, false)
  validateProject(saved)
  assert.deepEqual(
    saved.bookPresets!.map((p) => [p.id, p.cells[0].cellId]),
    [
      ['default', 'cover'],
      ['short', 'only'],
    ]
  )
  assert.equal(saved.bookPresetId, 'short')
  assert.equal(saved.contentCells!.book[0].cellId, 'only')
  assert.equal(saved.contentCover, true)
  assert.deepEqual(saved.layoutPresets, card.layoutPresets)
  assert.deepEqual(saved.folderLayouts, card.folderLayouts)
  assert.equal(saved.activeLayoutId, 'cardA')
})

test('R-363: a folder own template opened in the editor leaves the project default alone', () => {
  const project: Project = {
    ...card,
    contentCells: { book: [cell('def')] },
    contentCover: true,
    bookPresets: [
      { id: 'default', name: '預設版面', cells: [cell('def')] },
      { id: 'mine', name: 'Folder', cells: [cell('mine')] },
    ],
    bookPresetId: 'default',
    folderBookPresets: { f2: 'mine' },
  }
  validateProject(project)
  const opened = bookEditorProject(project, [cell('def')], 'mine')
  assert.equal(opened.activeLayoutId, 'mine')
  assert.deepEqual(opened.folderLayouts, { f2: 'mine' })
  const saved = fromBookEditor(project, { ...opened, cells: [cell('changed')] }, true)
  assert.equal(saved.bookPresetId, 'default')
  assert.equal(saved.contentCells!.book[0].cellId, 'def')
  assert.equal(saved.bookPresets!.find((p) => p.id === 'mine')!.cells[0].cellId, 'changed')
  // A folder shows its own template; others the project's default; a choice whose template is gone falls back to it.
  assert.equal(bookCellsFor(saved, 'f2', [cell('project')])[0].cellId, 'changed')
  assert.equal(bookCellsFor(saved, 'f9', [cell('project')])[0].cellId, 'def')
  assert.equal(
    bookCellsFor({ ...saved, folderBookPresets: { f2: 'gone' } }, 'f2', [cell('project')])[0]
      .cellId,
    'def'
  )
  // Switching templates in the editor keeps both.
  const switched = selectPreset(opened, 'default')
  assert.equal(switched.cells[0].cellId, 'def')
})

test('R-363: template lists are checked like card presets', () => {
  const base: Project = { ...modelProject() }
  assert.throws(() => validateProject({ ...base, bookPresets: [], bookPresetId: 'x' }), /漫畫模板/)
  assert.throws(
    () =>
      validateProject({
        ...base,
        bookPresets: [
          { id: 'a', name: 'Same', cells: [] },
          { id: 'b', name: 'same', cells: [] },
        ],
        bookPresetId: 'a',
      }),
    /名稱重複/
  )
  assert.throws(
    () =>
      validateProject({
        ...base,
        bookPresets: [{ id: 'a', name: 'A', cells: [] }],
        bookPresetId: 'b',
      }),
    /預設模板不存在/
  )
  assert.throws(() => validateProject({ ...base, bookPresetId: 'a' }), /清單不存在/)
  assert.throws(
    () => validateProject({ ...base, folderBookPresets: { 'bad id!': 'a' } }),
    /指定不合法/
  )
})

test('R-363: removing a field and changing groups reach book templates, so the project still saves', () => {
  const field = (cellId: string, attributeId: string, extra: Partial<Cell> = {}) =>
    ({
      cellId,
      kind: 'field-text',
      attributeId,
      grid: { x: 0, y: 0, w: 12, h: 1 },
      style,
      ...extra,
    }) as Cell
  const base: Project = {
    ...modelProject(),
    fieldBindings: [
      { attributeId: 'a', alias: 'A', type: 'string' },
      { attributeId: 'b', alias: 'B', type: 'string' },
    ],
    cells: [field('card', 'a')],
  }
  const grouped = createGroup(base, ['a', 'b'], 'AB', 'g1')
  const project: Project = {
    ...grouped,
    contentCover: true,
    contentCells: { book: [field('def', 'a', { groupId: 'g1' })] },
    bookPresets: [
      { id: 'default', name: 'D', cells: [field('def', 'a', { groupId: 'g1' })] },
      {
        id: 'other',
        name: 'O',
        cells: [
          field('o', 'b', { groupId: 'g1' }),
          field('o2', 'b', { grid: { x: 0, y: 1, w: 12, h: 1 } }),
        ],
      },
    ],
    bookPresetId: 'default',
  }
  validateProject(project)
  // Dissolving the group leaves no template pointing at it.
  const dissolved = dissolveGroup(project, 'g1')
  validateProject(dissolved)
  assert.ok(dissolved.bookPresets!.every((p) => p.cells.every((c) => !c.groupId)))
  // Removing a field takes it out of book templates too.
  const removed = withoutField(dissolved, 'b')
  validateProject(removed)
  assert.ok(removed.bookPresets!.every((p) => p.cells.every((c) => c.attributeId !== 'b')))
  // A group dissolved inside the book editor settles the card layouts restored on saving.
  const opened = bookEditorProject(project, project.contentCells!.book)
  const edited = dissolveGroup(opened, 'g1')
  const saved = fromBookEditor(project, edited, false)
  validateProject(saved)
  assert.ok(saved.cells.every((c) => !c.groupId))
})
