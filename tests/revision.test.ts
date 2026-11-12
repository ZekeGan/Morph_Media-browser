import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { WorkspaceStore } from '../electron/workspace'
import { ensureFolder, exists, folderFile, projectFile } from '../electron/files'
import { DATA_DIR, validateProject } from '../shared/model'
import { browserRows, folderBreadcrumbs, maxBrowseDepth } from '../shared/browse'
import { editorFields, saveCardPreset } from '../shared/layouts'
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'revision-')),
    media = path.join(root, 'media')
  await fs.mkdir(media)
  t.after(async () => {
    const target = await fs.realpath(root)
    assert.ok(target.startsWith(base + path.sep))
    await fs.rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  const lib = new Library(path.join(root, 'local'), undefined, false)
  await lib.init()
  return { root, media, lib }
}
test('all-depth inventory and independent CARD/TREE/TABLE display; presets keep density', async (t) => {
  const { media, lib } = await fixture(t)
  await fs.mkdir(path.join(media, 'A', 'B', 'C'), { recursive: true })
  const s = await lib.create(media, {
      name: 'All',
      depth: { mode: 'through', level: 1 },
      scanAll: true,
    }),
    p = s.projects[0].project!,
    rows = s.structure!
  assert.equal(rows.length, 4)
  assert.deepEqual(p.cardView, { mode: 'single', level: 1 })
  assert.equal(p.list.itemsPerRow, 3)
  const single = { ...p, cardView: { mode: 'single' as const, level: 2 } }
  assert.deepEqual(
    browserRows(rows, single, media, 'CARD', '').map((r) => r.name),
    ['A']
  )
  assert.deepEqual(
    browserRows(rows, single, media, 'CARD', path.join(media, 'A')).map((r) => r.name),
    ['B']
  )
  assert.equal(browserRows(rows, single, media, 'TREE', '').length, 4)
  assert.deepEqual(
    browserRows(rows, single, media, 'TABLE', '').map((r) => r.name),
    ['A']
  )
  // R-340: "all works" (the old multi view) passes A, which holds only a folder, and stops at the depth limit.
  assert.deepEqual(
    browserRows(rows, { ...p, cardView: { mode: 'multi', level: 2 } }, media, 'CARD', '').map(
      (r) => r.name
    ),
    ['B']
  )
  const changed = saveCardPreset(
    { ...single, list: { itemsPerRow: 3, pageSize: 20 } },
    { name: 'Second', asNew: true },
    () => 'second',
    p
  )
  assert.deepEqual(changed.cardView, single.cardView)
  assert.equal(changed.list.pageSize, 20)
  validateProject(changed)
  const before = await fs.readFile(projectFile(media, p.projectId), 'utf8')
  await lib.saveProject(changed)
  assert.equal(await fs.readFile(projectFile(media, p.projectId) + '.bak', 'utf8'), before)
  await assert.rejects(lib.saveProject(changed), /衝突/)
  assert.throws(() => validateProject({ ...p, cardView: { mode: 'single', level: 'all' } }))
  validateProject({ ...p, cardView: { mode: 'single', level: 51 } })
  assert.throws(() =>
    validateProject({ ...p, cardView: { mode: 'single', level: Number.MAX_SAFE_INTEGER + 1 } })
  )
  assert.throws(() =>
    validateProject({
      ...p,
      layoutPresets: [
        { id: 'one', name: 'A', cells: p.cells },
        { id: 'two', name: 'a', cells: p.cells },
      ],
      activeLayoutId: 'one',
    })
  )
})

test('breadcrumbs stay inside the project and depth uses indexed folders, not protected children', async (t) => {
  const { media, lib } = await fixture(t),
    s = await lib.create(media, {
      name: 'Navigation',
      depth: { mode: 'through', level: 1 },
      scanAll: true,
    }),
    root = s.structure![0]
  const a = { ...root, rowId: 'a', name: 'A', path: path.join(media, 'A'), depth: 2 },
    b = { ...root, rowId: 'b', name: 'B', path: path.join(media, 'A', 'B'), depth: 3 },
    other = {
      ...root,
      rowId: 'other',
      name: 'A-other',
      path: path.join(media, 'A-other'),
      depth: 2,
    },
    protectedChild = {
      ...b,
      rowId: 'protected',
      path: path.join(b.path, 'Game_Data'),
      depth: 4,
      readonly: true,
    }
  const rows = [root, other, b, a, protectedChild]
  assert.deepEqual(
    folderBreadcrumbs(rows, media, b.path.replaceAll('\\', '/').toUpperCase()).map((r) => r.rowId),
    [root.rowId, 'a', 'b']
  )
  assert.deepEqual(
    folderBreadcrumbs(rows, media, media + '-outside/child').map((r) => r.rowId),
    [root.rowId]
  )
  assert.equal(maxBrowseDepth(rows), 3)
  assert.equal(maxBrowseDepth([]), 1)
})

test('editor field sources distinguish shared and current-project private data without importing foreign overrides', async (t) => {
  const { media, lib } = await fixture(t),
    s = await lib.create(media, {
      name: 'Fields',
      depth: { mode: 'through', level: 1 },
    }),
    root = s.structure![0],
    id = root.projectId
  const attribute = (attributeId: string, type = 'string') => ({
    attributeId,
    key: attributeId,
    type,
    value: 'original',
    source: 'manual',
  })
  const record = {
    ...root.record!,
    attributes: [attribute('common'), attribute('unsupported', 'rich-text')],
    projectOverrides: {
      [id]: [attribute('common'), attribute('private-only')],
      foreign: [attribute('foreign-only')],
    },
  }
  const rows = [
    { ...root, record },
    {
      ...root,
      projectId: 'foreign',
      record: { ...record, attributes: [attribute('foreign-row')] },
    },
  ]
  assert.deepEqual(
    editorFields(rows, id).map((f) => ({
      id: f.attributeId,
      shared: f.shared,
      private: f.private,
      conflict: f.conflict,
    })),
    [
      { id: 'common', shared: true, private: true, conflict: false },
      { id: 'private-only', shared: false, private: true, conflict: false },
    ]
  )
  const conflicting = { ...record, projectOverrides: { [id]: [attribute('common', 'number')] } }
  assert.equal(editorFields([{ ...root, record: conflicting }], id)[0].conflict, true)
  assert.equal(record.attributes[0].value, 'original')
  const data = {
    ...record,
    attributes: [
      { ...attribute('zero', 'number'), value: 0 },
      { ...attribute('empty'), value: '   ' },
      { ...attribute('empty-tags', 'tags'), value: [] },
    ],
    projectOverrides: {},
  }
  assert.deepEqual(
    editorFields([{ ...root, record: data }], id).map((field) => [
      field.attributeId,
      field.hasData,
    ]),
    [
      ['zero', true],
      ['empty', false],
      ['empty-tags', false],
    ]
  )
})
test('navigation reads existing records beyond legacy depth without initializing missing or damaged records', async (t) => {
  const { media, lib } = await fixture(t),
    a = path.join(media, 'A'),
    b = path.join(a, 'B')
  await fs.mkdir(b, { recursive: true })
  let s = await lib.create(media, {
      name: 'Legacy',
      depth: { mode: 'through', level: 1 },
    }),
    p = s.projects[0].project!
  assert.equal(await exists(path.join(a, DATA_DIR)), false)
  await lib.saveProject({ ...p, cardView: { mode: 'multi', level: 'all' } })
  assert.equal(await exists(path.join(a, DATA_DIR)), false)
  s = await lib.visit(s.rows[0].rowId)
  const child = s.structure!.find((r) => r.name === 'A')!
  await assert.rejects(lib.visit(child.rowId), /尚未建立/)
  assert.equal(await exists(path.join(a, DATA_DIR)), false)
  await ensureFolder(a, false)
  s = await lib.visit(child.rowId)
  assert.ok(s.structure!.find((r) => r.name === 'A')!.record)
  assert.equal(await exists(path.join(b, DATA_DIR)), false)
  await fs.writeFile(folderFile(a), '{ broken')
  await assert.rejects(lib.visit(child.rowId))
  assert.equal(await fs.readFile(folderFile(a), 'utf8'), '{ broken')
})
test('game root opens but protected children never gain records through navigation', async (t) => {
  const { media, lib } = await fixture(t),
    game = path.join(media, 'Game'),
    internal = path.join(game, 'Game_Data')
  await fs.mkdir(internal, { recursive: true })
  await fs.writeFile(path.join(game, 'Game.exe'), 'ORIGINAL')
  await fs.writeFile(path.join(game, 'UnityPlayer.dll'), 'ORIGINAL')
  let s = await lib.create(media, {
    name: 'Games',
    depth: { mode: 'through', level: 1 },
    scanAll: true,
  })
  const root = s.structure!.find((r) => r.name === 'Game')!
  assert.ok(root.boundary)
  s = await lib.visit(root.rowId)
  assert.equal(
    s.structure!.some((r) => r.path === internal),
    false
  )
  s = await lib.saveProject({
    ...s.projects[0].project!,
    traversal: { [root.record!.folderId]: true },
  })
  const child = s.structure!.find((r) => r.path === internal)!
  await assert.rejects(lib.visit(child.rowId), /遊戲邊界保護/)
  assert.equal(await exists(path.join(internal, DATA_DIR)), false)
  assert.equal(await fs.readFile(path.join(game, 'Game.exe'), 'utf8'), 'ORIGINAL')
})
test('fractional Windows resize values normalize; invalid updates preserve settings and reload', async (t) => {
  const { root } = await fixture(t),
    store = new WorkspaceStore(path.join(root, 'workspace'))
  await store.init()
  await store.read(['p'])
  const value = {
    mode: 'TREE' as const,
    location: '',
    widths: { name: 220.25 },
    panelWidth: 420.5,
    panelVisible: false,
    detailId: 'row',
    locations: { TABLE: 'C:/media' },
    viewport: { x: 0.5, y: 0.25, zoom: 0.8 },
  }
  const saved = await store.update({ action: 'browse', projectId: 'p', value }, ['p'])
  assert.equal(saved.prefs.browse!.p.panelWidth, 421)
  assert.equal(saved.prefs.browse!.p.widths.name, 220)
  const before = await fs.readFile(store.file, 'utf8')
  await assert.rejects(
    store.update({ action: 'browse', projectId: 'p', value: { ...value, panelWidth: -1 } }, ['p'])
  )
  assert.equal(await fs.readFile(store.file, 'utf8'), before)
  const reload = new WorkspaceStore(path.dirname(store.file))
  await reload.init()
  assert.equal((await reload.read(['p'])).prefs.browse!.p.panelVisible, false)
})
test(
  'Windows all-depth scans never enter case-renamed metadata directories',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const { media, lib } = await fixture(t)
    let s = await lib.create(media, {
      name: 'Case',
      depth: { mode: 'through', level: 1 },
      scanAll: true,
    })
    const source = path.resolve(media, DATA_DIR),
      target = path.resolve(media, DATA_DIR.toUpperCase())
    assert.ok(source.startsWith(media + path.sep) && target.startsWith(media + path.sep))
    await fs.rename(source, target)
    s = await lib.scan()
    assert.equal(s.rows.length, 1)
    assert.equal(await exists(path.join(target, DATA_DIR)), false)
    await lib.visit(s.rows[0].rowId)
    assert.equal(lib.snapshot().structure!.length, 1)
  }
)

test('new projects do not invent TITLE; explicitly configured fields survive reconnect', async (t) => {
  const { root, media, lib } = await fixture(t),
    state = await lib.create(media, {
      name: 'Empty fields',
      depth: { mode: 'through', level: 1 },
    })
  const project = state.projects[0].project!
  assert.deepEqual(project.fieldBindings, [])
  assert.deepEqual(
    project.cells.map((c) => c.kind),
    ['name', 'path', 'open-folder']
  )
  assert.deepEqual(state.rows[0].record!.attributes, [])
  await lib.saveProject({
    ...project,
    fieldBindings: [{ alias: 'TITLE', attributeId: 'user-title', type: 'string' }],
  })
  const fresh = new Library(path.join(root, 'fresh-fields'), undefined, false)
  await fresh.init()
  assert.equal(
    (await fresh.link(media)).projects[0].project!.fieldBindings[0].attributeId,
    'user-title'
  )
})
