import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { WorkspaceStore } from '../electron/workspace'
import { sectionProjects, sectionIds, type WorkspaceCommand } from '../shared/workspace'
const unclassified = (ids: string[], prefs: Parameters<typeof sectionProjects>[1]) =>
  sectionProjects(ids, prefs, 'unclassified')

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'workspace-'))
  t.after(async () => {
    const target = await fs.realpath(root)
    if (!target.startsWith(base + path.sep)) throw new Error('Unsafe test cleanup')
    await fs.rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  const store = new WorkspaceStore(root)
  await store.init()
  return { root, store }
}
test('sidebar classification, favorite, deletion and layout survive reload without losing placement', async (t) => {
  const { root, store } = await fixture(t),
    ids = ['p1', 'p2']
  let s = await store.read(ids)
  assert.deepEqual(unclassified(ids, s.prefs), ['p1', 'p2'])
  s = await store.update({ action: 'createGroup', name: '動作遊戲' }, ids)
  const id = s.prefs.groups[0].id
  await store.update({ action: 'moveProject', projectId: 'p2', groupId: id }, ids)
  await store.update({ action: 'favorite', projectId: 'p1', value: true }, ids)
  await store.update({ action: 'collapseGroup', id, value: true }, ids)
  await store.update({ action: 'layout', sidebarWidth: 310, sidebarHidden: true }, ids)
  const reopened = new WorkspaceStore(root)
  await reopened.init()
  s = await reopened.read(ids)
  assert.equal(s.prefs.sidebarWidth, 310)
  assert.equal(s.prefs.sidebarHidden, true)
  assert.equal(s.prefs.groups[0].collapsed, true)
  assert.deepEqual(unclassified(ids, s.prefs), ['p1'])
  s = await reopened.update({ action: 'removeGroup', id }, ids)
  assert.equal(s.prefs.projects.p1.favorite, true)
  assert.equal(s.prefs.projects.p2.groupId, null)
  assert.deepEqual(unclassified(ids, s.prefs), ['p1', 'p2'])
  s = await reopened.update({ action: 'favorite', projectId: 'p1', value: false }, ids)
  assert.deepEqual(unclassified(ids, s.prefs), ['p1', 'p2'])
})
test('invalid commands do not persist and queued updates retain both results', async (t) => {
  const { store } = await fixture(t),
    ids = ['p1']
  await store.read(ids)
  await Promise.all([
    store.update({ action: 'createGroup', name: 'A' }, ids),
    store.update({ action: 'createGroup', name: 'B' }, ids),
  ])
  const before = await fs.readFile(store.file, 'utf8')
  for (const command of [
    { action: 'createGroup', name: 'a' },
    { action: 'createGroup', name: '\n' },
    { action: 'moveProject', projectId: 'p1', groupId: 'missing' },
    { action: 'favorite', projectId: 'unknown', value: true },
    { action: 'layout', sidebarWidth: 900 },
    { action: 'collapseSection', section: '__proto__', value: true },
    { action: 'execute' },
  ]) {
    await assert.rejects(store.update(command as WorkspaceCommand, ids))
    assert.equal(await fs.readFile(store.file, 'utf8'), before)
  }
  assert.equal((await store.read(ids)).prefs.groups.length, 2)
})

test('global theme and language save together, survive unrelated changes, and reject invalid or failed writes', async (t) => {
  const { root, store } = await fixture(t),
    ids = ['p1']
  let state = await store.read(ids)
  assert.equal(state.prefs.theme, undefined)
  assert.equal(state.prefs.locale, undefined)
  await store.update({ action: 'appearance', theme: 'glass', locale: 'ja' }, ids)
  await store.update({ action: 'favorite', projectId: 'p1', value: true }, ids)
  const reopened = new WorkspaceStore(root)
  await reopened.init()
  state = await reopened.read(ids)
  assert.equal(state.prefs.theme, 'glass')
  assert.equal(state.prefs.locale, 'ja')
  assert.equal(state.prefs.projects.p1.favorite, true)
  const before = await fs.readFile(store.file, 'utf8')
  for (const command of [
    { action: 'appearance', theme: 'missing', locale: 'en' },
    { action: 'appearance', theme: 'paper', locale: 'fr' },
    { action: 'appearance', theme: 'paper' },
  ]) {
    await assert.rejects(reopened.update(command as WorkspaceCommand, ids))
    assert.equal(await fs.readFile(store.file, 'utf8'), before)
  }
  await fs.unlink(store.file + '.bak')
  await fs.mkdir(store.file + '.bak')
  await assert.rejects(reopened.update({ action: 'appearance', theme: 'paper', locale: 'es' }, ids))
  state = await reopened.read(ids)
  assert.equal(state.prefs.theme, 'glass')
  assert.equal(state.prefs.locale, 'ja')
  assert.equal(await fs.readFile(store.file, 'utf8'), before)
})

test('play order is kept locally and only the four known orders are accepted', async (t) => {
  const { root, store } = await fixture(t),
    ids = ['p1']
  await store.read(ids)
  await store.update({ action: 'playOrder', value: 'one' }, ids)
  const reopened = new WorkspaceStore(root)
  await reopened.init()
  assert.equal((await reopened.read(ids)).prefs.playOrder, 'one')
  const before = await fs.readFile(store.file)
  for (const value of [undefined, null, 'loop', 1, { value: 'all' }]) {
    await assert.rejects(reopened.update({ action: 'playOrder', value } as WorkspaceCommand, ids))
    assert.deepEqual(await fs.readFile(store.file), before)
  }
})

test('video audio is local, survives other preferences, and invalid or failed saves preserve the last value', async (t) => {
  const { root, store } = await fixture(t),
    ids = ['p1']
  await store.read(ids)
  await store.update({ action: 'videoAudio', value: { volume: 0.35, muted: true } }, ids)
  await store.update({ action: 'appearance', theme: 'paper', locale: 'en' }, ids)
  const reopened = new WorkspaceStore(root)
  await reopened.init()
  assert.deepEqual((await reopened.read(ids)).prefs.videoAudio, { volume: 0.35, muted: true })
  const before = await fs.readFile(store.file)
  for (const value of [
    undefined,
    null,
    { volume: -1, muted: false },
    { volume: 2, muted: true },
    { volume: NaN, muted: false },
    { volume: 0.5, muted: 'yes' },
  ]) {
    await assert.rejects(reopened.update({ action: 'videoAudio', value } as WorkspaceCommand, ids))
    assert.deepEqual(await fs.readFile(store.file), before)
  }
  await fs.unlink(store.file + '.bak')
  await fs.mkdir(store.file + '.bak')
  await assert.rejects(
    reopened.update({ action: 'videoAudio', value: { volume: 0.9, muted: false } }, ids)
  )
  assert.deepEqual((await reopened.read(ids)).prefs.videoAudio, { volume: 0.35, muted: true })
  assert.deepEqual(await fs.readFile(store.file), before)
})

test('manual group/project order persists; favorites remain independent from unclassified', async (t) => {
  const { root, store } = await fixture(t),
    ids = ['p1', 'p2', 'p3']
  await store.read(ids)
  let state = await store.update({ action: 'createGroup', name: 'G' }, ids)
  const id = state.prefs.groups[0].id
  await store.update({ action: 'favorite', projectId: 'p1', value: true }, ids)
  await store.update(
    { action: 'reorderProject', projectId: 'p3', sectionId: 'unclassified', beforeId: 'p1' },
    ids
  )
  await store.update({ action: 'moveProject', projectId: 'p2', groupId: id }, ids)
  await store.update({ action: 'moveProject', projectId: 'p3', groupId: id, beforeId: 'p2' }, ids)
  await store.update({ action: 'reorderSections', ids: ['unclassified', id, 'favorites'] }, ids)
  const reopened = new WorkspaceStore(root)
  await reopened.init()
  state = await reopened.read(ids)
  assert.deepEqual(sectionIds(state.prefs), ['unclassified', id, 'favorites'])
  assert.deepEqual(sectionProjects(ids, state.prefs, id), ['p3', 'p2'])
  assert.deepEqual(unclassified(ids, state.prefs), ['p1'])
  assert.deepEqual(sectionProjects(ids, state.prefs, 'favorites'), ['p1'])
  const added = await reopened.update({ action: 'createGroup', name: 'G2' }, ids)
  assert.deepEqual(
    sectionIds(added.prefs).filter((v) => v !== 'favorites' && v !== 'unclassified' && v !== id)
      .length,
    1
  )
  assert.deepEqual(
    sectionIds(added.prefs).filter((v) => ['favorites', 'unclassified', id].includes(v)),
    ['unclassified', id, 'favorites']
  )
  const view = {
    mode: 'TREE' as const,
    location: '',
    widths: { name: 220 },
    panelWidth: 400,
    scrolls: { CARD: 120, TABLE: 50 },
    viewport: { x: 10, y: 20, zoom: 0.8 },
  }
  await reopened.update({ action: 'browse', projectId: 'p1', value: view }, ids)
  const reload = new WorkspaceStore(root)
  await reload.init()
  assert.deepEqual((await reload.read(ids)).prefs.browse?.p1, view)
  await assert.rejects(
    reopened.update({ action: 'reorderSections', ids: ['favorites', 'favorites'] }, ids)
  )
  await assert.rejects(
    reopened.update(
      { action: 'reorderProject', projectId: 'p1', sectionId: id, beforeId: 'p3' },
      ids
    )
  )
})
test('real write failure leaves previous disk and memory state intact', async (t) => {
  const { store } = await fixture(t),
    ids = ['p1']
  await store.read(ids)
  const before = await fs.readFile(store.file, 'utf8')
  await fs.unlink(`${store.file}.bak`)
  await fs.mkdir(`${store.file}.bak`)
  await assert.rejects(store.update({ action: 'favorite', projectId: 'p1', value: true }, ids))
  assert.equal(await fs.readFile(store.file, 'utf8'), before)
  assert.equal((await store.read(ids)).prefs.projects.p1.favorite, false)
})

test('optional table column order survives reload; invalid orders leave previous settings intact', async (t) => {
  const { root, store } = await fixture(t),
    ids = ['p1']
  await store.read(ids)
  const value = {
    mode: 'TABLE' as const,
    location: '',
    widths: { name: 200 },
    panelWidth: 420,
    columnOrder: ['depth', 'name', 'path'],
  }
  await store.update({ action: 'browse', projectId: 'p1', value }, ids)
  const reopened = new WorkspaceStore(root)
  await reopened.init()
  assert.deepEqual((await reopened.read(ids)).prefs.browse?.p1?.columnOrder, value.columnOrder)
  const before = await fs.readFile(store.file, 'utf8')
  for (const columnOrder of [['name', 'name'], ['__proto__'], ['bad/key'], [12], null]) {
    await assert.rejects(
      reopened.update(
        { action: 'browse', projectId: 'p1', value: { ...value, columnOrder } as typeof value },
        ids
      )
    )
    assert.equal(await fs.readFile(store.file, 'utf8'), before)
  }
})
test('corrupt UI settings remain untouched while projects can still be displayed', async (t) => {
  const { root, store } = await fixture(t)
  await fs.writeFile(store.file, '{ broken')
  const reopened = new WorkspaceStore(root)
  await reopened.init()
  const state = await reopened.read(['p1'])
  assert.match(state.error!, /原檔保留/)
  assert.equal(state.prefs.projects.p1.favorite, false)
  await assert.rejects(reopened.update({ action: 'createGroup', name: 'new' }, ['p1']))
  assert.equal(await fs.readFile(store.file, 'utf8'), '{ broken')
})

test('TREE branch visibility is a local project preference and survives reload', async (t) => {
  const { root, store } = await fixture(t),
    ids = ['p1']
  await store.read(ids)
  const value = {
    mode: 'TREE' as const,
    location: '',
    widths: {},
    panelWidth: 420,
    treeCollapsed: ['branch-a', 'branch-b'],
  }
  await store.update({ action: 'browse', projectId: 'p1', value }, ids)
  const reopened = new WorkspaceStore(root)
  await reopened.init()
  assert.deepEqual((await reopened.read(ids)).prefs.browse?.p1?.treeCollapsed, [
    'branch-a',
    'branch-b',
  ])
  const before = await fs.readFile(store.file, 'utf8')
  for (const treeCollapsed of [['branch-a', 'branch-a'], ['__proto__'], null]) {
    await assert.rejects(
      reopened.update(
        { action: 'browse', projectId: 'p1', value: { ...value, treeCollapsed } as typeof value },
        ids
      )
    )
    assert.equal(await fs.readFile(store.file, 'utf8'), before)
  }
})
test('table visibility preserves names and saves independently of column order', async (t) => {
  const { root, store } = await fixture(t),
    ids = ['p1']
  await store.read(ids)
  const value = {
    mode: 'TABLE' as const,
    location: '',
    widths: {},
    panelWidth: 420,
    hiddenColumns: ['path', 'depth'],
    columnOrder: ['depth', 'name', 'path'],
  }
  await store.update({ action: 'browse', projectId: 'p1', value }, ids)
  const reopened = new WorkspaceStore(root)
  await reopened.init()
  assert.deepEqual((await reopened.read(ids)).prefs.browse?.p1?.hiddenColumns, ['path', 'depth'])
  const before = await fs.readFile(store.file, 'utf8')
  for (const hiddenColumns of [['name'], ['path', 'path'], ['bad/key'], null]) {
    await assert.rejects(
      reopened.update(
        { action: 'browse', projectId: 'p1', value: { ...value, hiddenColumns } as typeof value },
        ids
      )
    )
    assert.equal(await fs.readFile(store.file, 'utf8'), before)
  }
})
