import { test } from 'node:test'
import assert from 'node:assert/strict'
import { settleGrid } from '../src/editor/settleGrid'
import type { Cell } from '../shared/model'

const cell = (cellId: string, y: number, kind = 'field', h = 1, x = 0, w = 12) =>
  ({ cellId, kind, grid: { x, y, w, h } }) as Cell
const rows = (cells: Cell[]) => Object.fromEntries(cells.map((c) => [c.cellId, c.grid.y]))

test('R-361: removing components leaves no empty rows; what is stored is what the editor shows', () => {
  const layout = [
    cell('name', 0),
    cell('divider1', 1, 'divider'),
    cell('divider2', 2, 'divider'),
    cell('tags', 3, 'field', 2),
  ]
  assert.deepEqual(rows(settleGrid(layout)), { name: 0, divider1: 1, divider2: 2, tags: 3 })
  const removed = layout.filter((c) => !c.cellId.startsWith('divider'))
  assert.deepEqual(rows(settleGrid(removed)), { name: 0, tags: 1 })
})

test('R-361: a spacer keeps its place, so a gap kept on purpose stays', () => {
  const layout = [cell('name', 0), cell('gap', 2, 'spacer'), cell('tags', 5)]
  assert.deepEqual(rows(settleGrid(layout)), { name: 0, gap: 2, tags: 3 })
  // Side by side components keep their columns.
  const pair = [cell('left', 3, 'field', 1, 0, 6), cell('right', 3, 'field', 1, 6, 6)]
  assert.deepEqual(
    settleGrid(pair).map((c) => [c.grid.x, c.grid.y]),
    [
      [0, 0],
      [6, 0],
    ]
  )
  // Nothing to settle returns the same objects.
  const settled = [cell('a', 0), cell('b', 1)]
  assert.equal(settleGrid(settled)[1], settled[1])
})
