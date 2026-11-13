import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cellListKinds,
  cellLists,
  mapCellLists,
  withOnlyCells,
  type CellListKind,
} from '../shared/cellLists'
import { validateProject, type Cell, type Project } from '../shared/model'
import { withoutField } from '../electron/maintenance'
import { createGroup, dissolveGroup } from '../shared/fieldGroups'
import { switchTextType } from '../src/editor/fieldTypes'
import { settleFieldGroups } from '../shared/upgrade'
import { projectImageCells } from '../shared/layouts'
import { modelProject } from './support/model-fixtures'

// R-368: every routine that must reach every list of layout components goes through shared/cellLists. The fixture
// puts one cell bound to the same field in every kind of list the module knows, and each check below walks the
// module's own list of kinds, so a kind added to the module without a routine covering it fails here.
const style = { textColor: '#e4e6e8', backgroundColor: 'transparent' }
const field = (cellId: string, extra: Partial<Cell> = {}) =>
  ({
    cellId,
    kind: 'field-text',
    attributeId: 'note',
    grid: { x: 0, y: 0, w: 6, h: 1 },
    style,
    ...extra,
  }) as Cell
const image = (cellId: string) =>
  ({ cellId, kind: 'image', grid: { x: 6, y: 0, w: 6, h: 1 }, style }) as Cell
function fixture(): Project {
  const project: Project = {
    ...modelProject(),
    fieldBindings: [
      { attributeId: 'note', alias: 'Note', type: 'string' },
      { attributeId: 'other', alias: 'Other', type: 'string' },
    ],
    cells: [field('card'), image('card-image')],
    layoutPresets: [
      { id: 'layoutA', name: 'A', cells: [field('a'), image('a-image')] },
      { id: 'layoutB', name: 'B', cells: [field('b')] },
    ],
    activeLayoutId: 'layoutA',
    contentCells: {
      book: [field('book-default')],
      game: [field('game'), image('game-image')],
    },
    contentCover: true,
    bookPresets: [
      { id: 'default', name: '預設版面', cells: [field('book-default')] },
      { id: 'short', name: 'Short', cells: [field('short'), image('short-image')] },
    ],
    bookPresetId: 'default',
  }
  validateProject(project)
  return project
}
// Which kinds of list a check saw; it must be all of them.
const kindsOf = (lists: { where: CellListKind }[]) => new Set(lists.map((list) => list.where))
const allKinds = new Set<CellListKind>(cellListKinds)

test('R-368: the fixture holds every kind of list the module knows', () => {
  assert.deepEqual(kindsOf(cellLists(fixture())), allKinds)
})

test('R-368: one change reaches every list, and absent holders stay absent', () => {
  const marked = mapCellLists(fixture(), (cells) =>
    cells.map((cell) => ({ ...cell, text: 'seen' }))
  )
  for (const list of cellLists(marked))
    for (const cell of list.cells) assert.equal(cell.text, 'seen', list.where + ':' + list.id)
  const base: Record<string, unknown> = {
    ...modelProject(),
    cells: [field('only')],
    layoutPresets: undefined,
    activeLayoutId: undefined,
    contentCells: undefined,
    bookPresets: undefined,
    bookPresetId: undefined,
  }
  const bare = mapCellLists(base as unknown as Project, (cells) => cells) as unknown as Record<
    string,
    unknown
  >
  for (const key of ['layoutPresets', 'contentCells', 'bookPresets'])
    assert.ok(!(key in bare) || bare[key] === undefined, key + ' stays absent')
})

test('R-368: validation checks each saved list without its own holders', () => {
  const only = withOnlyCells(fixture() as unknown as Record<string, unknown>, [field('x')])
  assert.equal(only.layoutPresets, undefined)
  assert.equal(only.activeLayoutId, undefined)
  assert.equal(only.contentCells, undefined)
  assert.equal(only.bookPresets, undefined)
  assert.equal(only.bookPresetId, undefined)
  assert.equal(only.folderBookPresets, undefined)
})

test('R-368: removing a field empties it from every list', () => {
  const removed = withoutField(fixture(), 'note')
  validateProject(removed)
  const lists = cellLists(removed)
  assert.deepEqual(kindsOf(lists), allKinds)
  for (const list of lists)
    assert.ok(
      list.cells.every((cell) => cell.attributeId !== 'note'),
      list.where + ':' + list.id
    )
})

test('R-368: dissolving a group settles cells in every list', () => {
  const grouped = mapCellLists(createGroup(fixture(), ['note', 'other'], 'NG', 'g1'), (cells) =>
    cells.map((cell) => (cell.attributeId === 'note' ? { ...cell, groupId: 'g1' } : cell))
  )
  validateProject(grouped)
  const dissolved = dissolveGroup(grouped, 'g1')
  validateProject(dissolved)
  const lists = cellLists(dissolved)
  assert.deepEqual(kindsOf(lists), allKinds)
  for (const list of lists)
    assert.ok(
      list.cells.every((cell) => !cell.groupId),
      list.where + ':' + list.id
    )
})

test('R-368: changing a field type converts its components in every list', () => {
  const result = switchTextType(fixture(), 'note', 'enum', ['One', 'Two'])
  assert.ok('project' in result, JSON.stringify(result))
  validateProject(result.project)
  const lists = cellLists(result.project)
  assert.deepEqual(kindsOf(lists), allKinds)
  for (const list of lists)
    for (const cell of list.cells)
      if (cell.attributeId === 'note')
        assert.equal(cell.kind, 'field-enum', list.where + ':' + list.id)
})

test('R-368: settling on read remaps dissolved group members in every list', () => {
  const raw = mapCellLists(fixture(), (cells) =>
    cells.map((cell) =>
      cell.attributeId === 'note' ? { ...cell, groupId: 'gone', attributeId: 'missing' } : cell
    )
  ) as unknown as Record<string, unknown>
  raw.fieldGroups = [{ groupId: 'gone', name: 'G', memberIds: ['note', 'other'] }]
  const settled = settleFieldGroups(raw) as Project
  const lists = cellLists(settled)
  assert.deepEqual(kindsOf(lists), allKinds)
  for (const list of lists)
    for (const cell of list.cells)
      if (cell.groupId === 'gone')
        assert.equal(cell.attributeId, 'note', list.where + ':' + list.id)
})

test('R-368: image components of every list can hold a picture', () => {
  const ids = new Set(projectImageCells(fixture()).map((cell) => cell.cellId))
  for (const name of ['card-image', 'a-image', 'game-image', 'short-image'])
    assert.ok(ids.has(name), name)
})
