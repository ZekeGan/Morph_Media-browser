import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readingGroups, readerArrowStep, spreadGeometry } from '../shared/reader'
import { defaultTreeCollapsed, visibleTreeRows } from '../shared/browse'
import type { FolderRow } from '../shared/model'
test('reader groups preserve first-page and odd-page rules; RTL reverses only arrow navigation', () => {
  assert.deepEqual(readingGroups(5, true, false), [[0, 1], [2, 3], [4]])
  assert.deepEqual(readingGroups(5, true, true), [[0], [1, 2], [3, 4]])
  assert.deepEqual(readingGroups(2, false, true), [[0], [1]])
  assert.deepEqual(readingGroups(0, true, false), [])
  // R-374: a wide page stands alone, and so does the page left without a partner before it.
  const wide = (index: number) => index === 3
  assert.deepEqual(readingGroups(8, true, false, wide), [[0, 1], [2], [3], [4, 5], [6, 7]])
  assert.deepEqual(readingGroups(6, true, true, wide), [[0], [1, 2], [3], [4, 5]])
  assert.deepEqual(readingGroups(5, false, false, wide), [[0], [1], [2], [3], [4]])
  assert.equal(readerArrowStep('ArrowLeft', false), -1)
  assert.equal(readerArrowStep('ArrowRight', false), 1)
  assert.equal(readerArrowStep('ArrowLeft', true), 1)
  assert.equal(readerArrowStep('ArrowRight', true), -1)
})
test('width and height adaptation use the measured viewport and preserve page aspect ratios', () => {
  const sizes = [
      { width: 1000, height: 2000 },
      { width: 1200, height: 2000 },
    ],
    box = { width: 1100, height: 800 }
  const height = spreadGeometry(sizes, 'height', box, 1),
    width = spreadGeometry(sizes, 'width', box, 1)
  assert.equal(height.height, 800)
  assert.ok(Math.abs(height.width - 880) < 0.001)
  assert.deepEqual(height.widths, [400, 480])
  assert.ok(Math.abs(width.width - 1100) < 0.001)
  assert.ok(Math.abs(width.height - 1000) < 0.001)
  const zoom = spreadGeometry(sizes, 'height', box, 2)
  assert.equal(zoom.height, 1600)
  assert.ok(Math.abs(zoom.width - 1760) < 0.001)
  assert.deepEqual(spreadGeometry([{ width: 500, height: 2000 }], 'original', box, 1), {
    width: 500,
    height: 2000,
    widths: [500],
  })
  const resized = spreadGeometry(sizes, 'width', { width: 550, height: 400 }, 1)
  assert.ok(Math.abs(resized.width - 550) < 0.001)
  const contained = spreadGeometry(sizes, 'contain', { width: 550, height: 800 }, 1)
  assert.ok(Math.abs(contained.width - 550) < 0.001)
  assert.ok(contained.height <= 800)
  const manga = spreadGeometry(
    [
      { width: 100, height: 160 },
      { width: 120, height: 160 },
    ],
    'height',
    { width: 400, height: 700 },
    1
  )
  assert.equal(manga.height, 700)
  assert.ok(manga.width > 400) // Height is the viewport limit, not original pixels or width.
  assert.equal(
    spreadGeometry([{ width: 100, height: 160 }], 'height', { width: 400, height: 700 }, 0.5)
      .height,
    350
  )
})
const row = (id: string, path: string, depth: number): FolderRow => ({
  rowId: id,
  path,
  name: id,
  depth,
  projectId: 'project',
  stopped: false,
  duplicate: false,
})
test('collapsed TREE branches are excluded from layout input; deep collections start with a bounded frontier', () => {
  const rows = [row('root', '/root', 1)]
  for (let i = 0; i < 10; i++) {
    rows.push(row('branch' + i, '/root/' + i, 2))
    for (let j = 0; j < 500; j++) rows.push(row('leaf' + i + '-' + j, '/root/' + i + '/' + j, 3))
  }
  const defaults = defaultTreeCollapsed(rows)
  assert.equal(visibleTreeRows(rows, defaults).length, 11)
  assert.equal(
    visibleTreeRows(
      rows,
      defaults.filter((id) => id !== 'branch0')
    ).length,
    511
  )
  assert.equal(visibleTreeRows(rows, ['root']).length, 1)
  assert.equal(visibleTreeRows(rows, []).length, 5011)
  const flat = [
    row('root', '/root', 1),
    ...Array.from({ length: 250 }, (_, i) => row('child' + i, '/root/' + i, 2)),
  ]
  assert.deepEqual(defaultTreeCollapsed(flat), ['root'])
  assert.equal(visibleTreeRows(flat, defaultTreeCollapsed(flat)).length, 1)
  const drive = [row('drive', 'C:\\', 1), row('child', 'C:\\Child', 2)]
  assert.equal(visibleTreeRows(drive, []).length, 2)
})
