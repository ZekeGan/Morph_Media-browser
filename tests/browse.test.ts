import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { browserRows } from '../shared/browse'
import type { FolderRow } from '../shared/model'
import { modelFolder, modelProject } from './support/model-fixtures'

const root = path.resolve('lib')
const row = (name: string, depth: number, at = path.join(root, name)): FolderRow => ({
  rowId: name || 'root',
  path: name ? at : root,
  name: name ? path.basename(name) : 'lib',
  projectId: 'project',
  depth,
  stopped: false,
  duplicate: false,
  record: modelFolder(),
})
const rows = [row('', 1), row('A', 2), row('B', 2), row(path.join('A', 'deep'), 3)]
const cards = (location: string, cardView: { mode: 'single' | 'multi'; level: number | 'all' }) =>
  browserRows(rows, { ...modelProject(), cardView }, root, 'CARD', location).map((r) => r.name)

test('opening a project lists the root folders instead of one lone root card', () => {
  assert.deepEqual(cards('', { mode: 'single', level: 1 }), ['A', 'B'])
  assert.deepEqual(cards('', { mode: 'single', level: 3 }), ['deep'])
  assert.deepEqual(
    cards('', { mode: 'multi', level: 1 }),
    ['lib'],
    'multi level 1 still includes only the root'
  )
})

test('a project with no subfolders keeps showing its root', () => {
  const only = [row('', 1)]
  const shown = browserRows(
    only,
    { ...modelProject(), cardView: { mode: 'single', level: 1 } },
    root,
    'CARD',
    ''
  )
  assert.deepEqual(
    shown.map((r) => r.name),
    ['lib']
  )
})

test('a folder without subfolders shows its own card, others show their children', () => {
  const single = { mode: 'single', level: 1 } as const
  assert.deepEqual(cards(path.join(root, 'A'), single), ['deep'])
  assert.deepEqual(cards(path.join(root, 'B'), single), ['B'])
  const table = browserRows(rows, modelProject(), root, 'TABLE', path.join(root, 'B'))
  assert.deepEqual(table, [], 'the table stays a list of children')
})
