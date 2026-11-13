import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bookTemplate, contentCells, withBookCover } from '../shared/explorer'
import { validateProject, type Cell } from '../shared/model'
import { modelProject } from './support/model-fixtures'
import { projectImageCells } from '../shared/layouts'

const style = { textColor: '#e4e6e8', backgroundColor: 'transparent' }
const cell = (cellId: string, kind: string, grid: Cell['grid']) =>
  ({ cellId, kind, grid, style }) as Cell

test('R-362: a book starts with its cover on the left and the card fields on the right', () => {
  const card = [
    cell('name', 'name', { x: 0, y: 0, w: 12, h: 1 }),
    cell('group', 'field-tags', { x: 0, y: 1, w: 6, h: 1 }),
    cell('tags', 'field-tags', { x: 6, y: 1, w: 6, h: 2 }),
  ]
  const cells = contentCells({ cells: card }, 'book')
  assert.deepEqual(
    cells.map((c) => [c.cellId, c.kind, c.grid.x, c.grid.y, c.grid.w, c.grid.h]),
    [
      ['book-cover', 'image', 0, 0, 4, 4],
      ['group', 'field-tags', 4, 0, 8, 1],
      ['tags', 'field-tags', 4, 1, 8, 2],
    ]
  )
  assert.equal(cells[0].imageIndex, 1)
  // Without fields the cover is all there is; other kinds keep their name and path default.
  assert.deepEqual(
    bookTemplate({ cells: [card[0]] }).map((c) => c.cellId),
    ['book-cover']
  )
  assert.deepEqual(
    contentCells({ cells: card }, 'game').map((c) => c.cellId),
    ['name']
  )
})

test('R-362: an older book template gets its cover component and keeps its look', () => {
  const old = [
    cell('group', 'field-tags', { x: 0, y: 0, w: 6, h: 1 }),
    cell('author', 'field-tags', { x: 6, y: 0, w: 6, h: 1 }),
    cell('tags', 'field-tags', { x: 0, y: 2, w: 12, h: 2 }),
  ]
  const converted = withBookCover(old)
  assert.deepEqual(
    converted.map((c) => [c.cellId, c.grid.x, c.grid.y, c.grid.w, c.grid.h]),
    [
      ['book-cover', 0, 0, 4, 4],
      ['group', 4, 0, 4, 1],
      ['author', 8, 0, 4, 1],
      ['tags', 4, 2, 8, 2],
    ]
  )
  // A template that already has a picture is left as it is.
  assert.equal(withBookCover(converted), converted)
  // Narrow cells side by side stay apart (start and end are scaled together).
  const narrow = withBookCover([
    cell('a', 'field-text', { x: 0, y: 0, w: 3, h: 1 }),
    cell('b', 'field-text', { x: 3, y: 0, w: 3, h: 1 }),
    cell('c', 'field-text', { x: 6, y: 0, w: 6, h: 1 }),
  ]).slice(1)
  for (let i = 1; i < narrow.length; i++)
    assert.ok(
      narrow[i - 1].grid.x + narrow[i - 1].grid.w <= narrow[i].grid.x,
      JSON.stringify(narrow)
    )
  // A template with no room for one more component is left alone.
  const full = Array.from({ length: 50 }, (_, i) =>
    cell('f' + i, 'field-text', { x: 0, y: i, w: 12, h: 1 })
  )
  assert.equal(withBookCover(full), full)
})

test('R-362: the default cover can be given a picture before the book template is ever saved', () => {
  const base = modelProject()
  assert.ok(projectImageCells(base).some((c) => c.cellId === 'book-cover'))
  assert.ok(
    !projectImageCells({ ...base, contentCells: { book: [] } }).some(
      (c) => c.cellId === 'book-cover'
    )
  )
})

test('R-362: the cover marker is a yes/no setting of the project', () => {
  const base = modelProject()
  assert.doesNotThrow(() => validateProject({ ...base, contentCover: true }))
  assert.throws(() => validateProject({ ...base, contentCover: 'yes' }), /封面/)
})
