import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateProject, type Cell, type FolderRow, type Project } from '../shared/model'
import { cellField, groupValue } from '../shared/cells'
import {
  addToGroup,
  createGroup,
  dissolveGroup,
  freeGroupName,
  groupFromFallbacks,
  joinRefusal,
  removeFromGroup,
  renameGroup,
  reorderGroup,
  setGroupSource,
  bindCellToGroup,
} from '../shared/fieldGroups'
import { withoutField } from '../electron/maintenance'
import { upgradeStored } from '../shared/upgrade'
import { modelProject } from './support/model-fixtures'

const style = { textColor: '#ffffff', backgroundColor: 'transparent' }
const cell = (patch: Partial<Cell>): Cell => ({
  cellId: crypto.randomUUID(),
  kind: 'field-text',
  attributeId: 'steam',
  grid: { x: 0, y: 0, w: 12, h: 1 },
  style,
  ...patch,
})
const base = (cells: Cell[] = []): Project => ({
  ...modelProject(),
  fieldBindings: [
    { alias: 'Steam title', attributeId: 'steam', type: 'string' },
    { alias: 'DLsite title', attributeId: 'dlsite', type: 'string' },
    { alias: 'VNDB tags', attributeId: 'vndb', type: 'tags' },
    { alias: 'Rating', attributeId: 'rating', type: 'number' },
    { alias: 'Status', attributeId: 'status', type: 'enum', options: ['a'] },
  ],
  cells,
  layoutPresets: [{ id: 'preset', name: 'Default', cells: structuredClone(cells) }],
  activeLayoutId: 'preset',
  contentCells: undefined,
})
const row = (values: Record<string, unknown>, folderId = 'folder-1'): FolderRow => ({
  rowId: folderId,
  path: 'C:/x',
  name: 'x',
  depth: 1,
  projectId: modelProject().projectId,
  stopped: false,
  duplicate: false,
  record: {
    kind: 'media-viewer.folder',
    schemaVersion: 1,
    folderId,
    revision: 1,
    attributes: Object.entries(values).map(([attributeId, value]) => ({
      attributeId,
      key: attributeId,
      type: typeof value === 'string' ? 'string' : 'tags',
      value,
      source: 'manual',
    })),
    projectOverrides: {},
    assets: [],
  },
})
const valid = (p: Project) => {
  validateProject(p)
  return p
}

test('a group shows its first member with a value, in order', () => {
  const p = valid(createGroup(base(), ['steam', 'dlsite'], 'Title', 'g1'))
  const group = p.fieldGroups![0]
  assert.equal(groupValue(p, group, row({ dlsite: 'B' })).value, 'B')
  assert.equal(groupValue(p, group, row({ steam: 'A', dlsite: 'B' })).value, 'A')
  assert.equal(groupValue(p, group, row({ steam: '  ' })).attributeId, undefined)
  const shown = bindCellToGroup(cell({}), group)
  assert.equal(cellField(shown, row({ dlsite: 'B' }), p).value, 'B')
  assert.equal(cellField(shown, row({ dlsite: 'B' }), p).index, 1)
})

test('a folder can choose its member; an empty choice falls back to the order and says so', () => {
  let p = createGroup(base(), ['steam', 'dlsite'], 'Title', 'g1')
  p = valid(setGroupSource(p, 'folder-1', 'g1', 'dlsite'))
  const group = p.fieldGroups![0]
  assert.equal(groupValue(p, group, row({ steam: 'A', dlsite: 'B' })).value, 'B')
  const empty = groupValue(p, group, row({ steam: 'A' }))
  assert.equal(empty.value, 'A')
  assert.equal(empty.chosenEmpty, true)
  // Other folders keep the order.
  assert.equal(groupValue(p, group, row({ steam: 'A', dlsite: 'B' }, 'folder-2')).value, 'A')
  // Removing the chosen member clears the choice.
  p = valid(removeFromGroup(p, 'dlsite'))
  assert.equal(p.groupSources, undefined)
  // Going back to the order removes the entry.
  p = setGroupSource(createGroup(base(), ['steam', 'dlsite'], 'Title', 'g1'), 'f', 'g1', 'dlsite')
  assert.equal(setGroupSource(p, 'f', 'g1', undefined).groupSources, undefined)
})

test('joining checks type, size and membership; text and tags may share a group', () => {
  const p = createGroup(base(), ['steam'], 'Title', 'g1')
  assert.equal(joinRefusal(p, { groupId: 'g1' }, 'rating'), 'type')
  assert.equal(joinRefusal(p, { groupId: 'g1' }, 'steam'), 'same')
  assert.equal(joinRefusal(p, { groupId: 'g1' }, 'vndb'), undefined)
  assert.equal(joinRefusal(p, { attributeId: 'status' }, 'steam'), 'type')
  assert.throws(() => addToGroup(p, 'g1', 'rating'), /type/)
  assert.throws(() => createGroup(p, ['rating', 'steam'], 'X', 'g2'), /type/)
  valid(addToGroup(p, 'g1', 'vndb'))
})

test('a field belongs to one group: joining another moves it, and an emptied group is dissolved', () => {
  let p = createGroup(base(), ['steam', 'dlsite'], 'Title', 'g1')
  p = createGroup(p, ['vndb'], 'Other', 'g2')
  p = valid(addToGroup(p, 'g2', 'dlsite', 0))
  assert.deepEqual(p.fieldGroups!.find((g) => g.groupId === 'g2')!.memberIds, ['dlsite', 'vndb'])
  assert.deepEqual(p.fieldGroups!.find((g) => g.groupId === 'g1')!.memberIds, ['steam'])
  p = valid(removeFromGroup(p, 'steam'))
  assert.equal(
    p.fieldGroups!.some((g) => g.groupId === 'g1'),
    false
  )
})

test('cells follow the group: removed member, last member and dissolving rebind to the first member', () => {
  let p = createGroup(base(), ['steam', 'dlsite'], 'Title', 'g1')
  const group = p.fieldGroups![0]
  p = { ...p, cells: [bindCellToGroup(cell({}), group)] }
  p = { ...p, layoutPresets: [{ id: 'preset', name: 'Default', cells: structuredClone(p.cells) }] }
  valid(p)
  // Removing the member the cell names moves it to the next one and keeps the group.
  let next = valid(removeFromGroup(p, 'steam'))
  assert.equal(next.cells[0].groupId, 'g1')
  assert.equal(next.cells[0].attributeId, 'dlsite')
  // Removing the last member leaves the cell on that field.
  next = valid(removeFromGroup(next, 'dlsite'))
  assert.equal(next.cells[0].groupId, undefined)
  assert.equal(next.cells[0].attributeId, 'dlsite')
  // Reordering then dissolving binds to the new first member, in every layout.
  next = valid(dissolveGroup(reorderGroup(p, 'g1', ['dlsite', 'steam']), 'g1'))
  assert.equal(next.fieldGroups, undefined)
  assert.equal(next.cells[0].attributeId, 'dlsite')
  assert.equal(next.layoutPresets![0].cells[0].attributeId, 'dlsite')
})

test('group names are unique and differ from field names', () => {
  const p = createGroup(base(), ['steam'], 'Title', 'g1')
  assert.throws(() => createGroup(p, ['dlsite'], 'title', 'g2'), /name/)
  assert.throws(() => createGroup(p, ['dlsite'], 'Steam title', 'g2'), /name/)
  assert.throws(() => renameGroup(p, 'g1', ' '), /name/)
  assert.equal(renameGroup(p, 'g1', 'Game title').fieldGroups![0].name, 'Game title')
  assert.equal(freeGroupName(p, 'Title'), 'Title 2')
  assert.equal(freeGroupName(p, 'Steam title'), 'Steam title 2')
})

test('validation refuses broken groups', () => {
  const p = createGroup(base(), ['steam', 'dlsite'], 'Title', 'g1')
  const bad = (patch: Partial<Project>) => assert.throws(() => validateProject({ ...p, ...patch }))
  bad({ fieldGroups: [{ groupId: 'g1', name: 'Title', memberIds: ['missing'] }] })
  bad({ fieldGroups: [{ groupId: 'g1', name: 'Title', memberIds: ['steam', 'rating'] }] })
  bad({
    fieldGroups: [
      { groupId: 'g1', name: 'Title', memberIds: ['steam'] },
      { groupId: 'g2', name: 'Other', memberIds: ['steam'] },
    ],
  })
  bad({ fieldGroups: [{ groupId: 'g1', name: 'Rating', memberIds: ['steam'] }] })
  bad({ groupSources: { f: { g1: 'rating' } } })
  bad({ cells: [cell({ groupId: 'missing' })] })
  bad({ cells: [cell({ groupId: 'g1', attributeId: 'rating', kind: 'field-number' })] })
  bad({ cells: [cell({ groupId: 'g1', fallbackIds: ['dlsite'] })] })
  bad({ fieldGroups: undefined, groupSources: { f: { g1: 'steam' } } })
})

test('an older component with fallbacks becomes a group in the same order', () => {
  const old = cell({ attributeId: 'steam', fallbackIds: ['dlsite'] })
  const p = valid(groupFromFallbacks(base([old]), old.cellId, 'Title', 'g1'))
  assert.deepEqual(p.fieldGroups![0].memberIds, ['steam', 'dlsite'])
  assert.equal(p.cells[0].groupId, 'g1')
  assert.equal(p.cells[0].fallbackIds, undefined)
  assert.equal(p.layoutPresets![0].cells[0].groupId, 'g1')
})

test('deleting a field takes it out of its group; cells keep showing the group', () => {
  let p = createGroup(base(), ['steam', 'dlsite'], 'Title', 'g1')
  p = {
    ...p,
    cells: [bindCellToGroup(cell({}), p.fieldGroups![0])],
    layoutPresets: undefined,
    activeLayoutId: undefined,
  }
  p = setGroupSource(p, 'f', 'g1', 'steam')
  const next = valid(withoutField(p, 'steam'))
  assert.deepEqual(next.fieldGroups![0].memberIds, ['dlsite'])
  assert.equal(next.cells[0].attributeId, 'dlsite')
  assert.equal(next.groupSources, undefined)
  // Deleting the only member dissolves the group and the cell showing it goes too.
  const gone = valid(withoutField(next, 'dlsite'))
  assert.equal(gone.fieldGroups, undefined)
  assert.equal(gone.cells.length, 0)
})

test('a saved search on a dissolved group searches its first member', () => {
  let p = createGroup(base(), ['steam', 'dlsite'], 'Title', 'g1')
  p = {
    ...p,
    savedSearches: [
      {
        id: 's',
        name: 'S',
        query: 'Title:x',
        queryAst: {
          version: 1,
          groups: [[{ field: 'g1', type: 'string', value: 'x', exclude: false }]],
        },
      },
    ],
  }
  const next = valid(dissolveGroup(p, 'g1'))
  assert.equal(next.savedSearches![0].queryAst!.groups[0][0].field, 'steam')
})

test('a field sharing a group cannot become a choice field', async () => {
  const { switchTextType } = await import('../src/editor/fieldTypes')
  const p = createGroup(base(), ['steam', 'dlsite'], 'Title', 'g1')
  assert.deepEqual(switchTextType(p, 'steam', 'enum', []), { error: 'group' })
  // Alone in its group it may.
  const alone = createGroup(base(), ['steam'], 'Title', 'g1')
  assert.ok('project' in switchTextType(alone, 'steam', 'enum', ['a']))
})

test('a project an older version changed is settled on reading instead of refused', () => {
  const p = createGroup(base(), ['steam', 'dlsite', 'vndb'], 'Title', 'g1')
  const group = p.fieldGroups![0]
  // An older version deleted "steam", renamed a field to the group's name and kept a choice for the deleted member.
  const old: Project = {
    ...p,
    fieldBindings: p.fieldBindings
      .filter((f) => f.attributeId !== 'steam')
      .map((f) => (f.attributeId === 'rating' ? { ...f, alias: 'Title' } : f)),
    cells: [bindCellToGroup(cell({}), group)],
    layoutPresets: undefined,
    activeLayoutId: undefined,
    groupSources: { f: { g1: 'steam' }, h: { g1: 'vndb' } },
  }
  assert.throws(() => validateProject(old))
  const read = valid(upgradeStored(old) as Project)
  assert.deepEqual(read.fieldGroups![0].memberIds, ['dlsite', 'vndb'])
  assert.equal(read.fieldGroups![0].name, 'Title 2')
  assert.equal(read.cells[0].attributeId, 'dlsite')
  assert.deepEqual(read.groupSources, { h: { g1: 'vndb' } })
  // With every member gone, the group and its cells' group binding go.
  const empty = upgradeStored({
    ...old,
    fieldBindings: old.fieldBindings.filter((f) => !['dlsite', 'vndb'].includes(f.attributeId)),
    groupSources: undefined,
  }) as Project
  assert.equal(empty.fieldGroups, undefined)
  assert.equal(empty.cells[0].groupId, undefined)
})

test('a component must be able to show its group type', () => {
  const p = createGroup(base(), ['steam'], 'Title', 'g1')
  assert.throws(() =>
    validateProject({ ...p, cells: [cell({ kind: 'field-number', groupId: 'g1' })] })
  )
  valid({ ...p, cells: [cell({ kind: 'field-tags', groupId: 'g1' })] })
})
