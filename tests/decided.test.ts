import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { systemLocale } from '../shared/locales'
import { validFieldValue } from '../shared/fields'
import {
  addPreset,
  presetDraft,
  removePreset,
  renamePreset,
  rowCells,
  selectPreset,
  syncPresetDraft,
} from '../shared/layouts'
import { fieldValue, validateProject } from '../shared/model'
import { WorkspaceStore } from '../electron/workspace'
import { Library } from '../electron/library'
import { Explorer } from '../electron/explorer'
import { readFolder } from '../electron/files'
import { modelProject } from './support/model-fixtures'
import { defaultWorkspace } from '../shared/workspace'
import { exportSettings } from '../electron/settings-package'

async function directory(
  t: { after: (fn: () => Promise<void>) => void },
  before: () => unknown = () => {}
) {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'decided-'))
  t.after(async () => {
    await before()
    const target = await fs.realpath(root)
    assert.ok(target.startsWith(base + path.sep))
    await fs.rm(target, { recursive: true, force: true })
  })
  return root
}
test('first-use language follows supported system preferences and remains saved', async (t) => {
  for (const [languages, expected] of [
    [['zh-Hant-HK'], 'zh-TW'],
    [['zh_CN'], 'zh-CN'],
    [['ja-JP'], 'ja'],
    [['es-MX'], 'es'],
    [['fr-FR', 'ja'], 'ja'],
    [['fr-FR'], 'en'],
  ] as const)
    assert.equal(systemLocale(languages), expected)
  const root = await directory(t),
    store = new WorkspaceStore(root, ['ja-JP'])
  await store.init()
  assert.equal((await store.read([])).prefs.locale, 'ja')
  const reopened = new WorkspaceStore(root, ['es'])
  await reopened.init()
  assert.equal((await reopened.read([])).prefs.locale, 'ja')
})
test('new field values preserve unknown and false and reject unsafe URLs and invalid calendar dates', () => {
  assert.equal(validFieldValue('boolean', false), true)
  assert.equal(validFieldValue('boolean', null), true)
  assert.equal(validFieldValue('boolean', 0), false)
  assert.equal(validFieldValue('enum', 'ready', ['ready', 'done']), true)
  assert.equal(validFieldValue('enum', 'missing', ['ready']), false)
  assert.equal(validFieldValue('url', 'https://example.com/path'), true)
  assert.equal(validFieldValue('url', 'javascript:alert(1)'), false)
  assert.equal(validFieldValue('url', 'https://user:password@example.com'), false)
  assert.equal(validFieldValue('date', '2024-02-29'), true)
  assert.equal(validFieldValue('date', '2025-02-29'), false)
  assert.equal(validFieldValue('date', '2025-01-01T00:00'), false)
})
test('preset drafts keep unsaved copies independent, reject duplicate names, and fall back after deletion', () => {
  const project = modelProject(),
    before = structuredClone(project)
  let draft = presetDraft(project)
  draft.cells[0].grid.w = 7
  draft = addPreset(draft, 'Copy', 'copy', true)
  assert.equal(draft.cells[0].grid.w, 7)
  draft.cells[0].grid.w = 4
  draft = syncPresetDraft(draft)
  assert.equal(draft.layoutPresets![0].cells[0].grid.w, 7)
  assert.throws(() => addPreset(draft, 'copy', 'duplicate', false), /不可重複/)
  draft = renamePreset(draft, 'Renamed')
  draft = selectPreset(draft, draft.layoutPresets![0].id)
  draft = addPreset(draft, 'Empty', 'empty', false)
  assert.deepEqual(draft.cells, [])
  draft = removePreset(draft)
  validateProject(draft)
  assert.deepEqual(project, before)
  assert.throws(() => removePreset(presetDraft(project)), /至少保留/)
})
test('new portable fields save through real library paths without changing schema or original media', async (t) => {
  let close = () => {}
  const root = await directory(t, () => close()),
    media = path.join(root, 'media')
  await fs.mkdir(media)
  await fs.writeFile(path.join(media, 'original.bin'), 'ORIGINAL')
  const lib = new Library(path.join(root, 'local'), undefined, false)
  await lib.init()
  const state = await lib.create(media, {
    name: 'Typed',
    depth: { mode: 'through', level: 1 },
  })
  const project = {
    ...state.projects[0].project!,
    fieldBindings: [
      { attributeId: 'flag', alias: 'flag', type: 'boolean' },
      { attributeId: 'status', alias: 'status', type: 'enum', options: ['ready', 'done'] },
    ],
  }
  await lib.saveProject(project)
  const explorer = new Explorer(lib, lib.userData, {
    choose: async () => undefined,
    open: async () => {},
    launch: async () => {},
    thumbnail: async () => Buffer.alloc(0),
  })
  close = () => explorer.index.close()
  let row = lib.snapshot().rows[0]
  await explorer.request({
    action: 'attributes',
    rowId: row.rowId,
    revision: row.record!.revision,
    private: false,
    values: [
      { attributeId: 'flag', key: 'flag', type: 'boolean', value: false, source: 'manual' },
      { attributeId: 'status', key: 'status', type: 'enum', value: 'ready', source: 'manual' },
    ],
  })
  row = lib.snapshot().rows[0]
  assert.equal(fieldValue(row, 'flag'), false)
  const bytes = await fs.readFile(path.join(media, '.media-viewer', 'folder.json'), 'utf8')
  await assert.rejects(
    explorer.request({
      action: 'attributes',
      rowId: row.rowId,
      revision: row.record!.revision,
      private: false,
      values: [
        { attributeId: 'status', key: 'status', type: 'enum', value: 'invalid', source: 'manual' },
      ],
    }),
    /選項/
  )
  assert.equal(await fs.readFile(path.join(media, '.media-viewer', 'folder.json'), 'utf8'), bytes)
  await explorer.request({
    action: 'attributes',
    rowId: row.rowId,
    revision: row.record!.revision,
    private: true,
    values: [{ attributeId: 'flag', key: 'flag', type: 'boolean', value: null, source: 'manual' }],
  })
  row = lib.snapshot().rows[0]
  assert.equal(fieldValue(row, 'flag'), null)
  assert.equal((await readFolder(media)).schemaVersion, 1)
  assert.equal(await fs.readFile(path.join(media, 'original.bin'), 'utf8'), 'ORIGINAL')
  const assigned = {
    ...presetDraft(project),
    folderLayouts: { [row.record!.folderId]: 'other' },
    layoutPresets: [
      ...presetDraft(project).layoutPresets!,
      { id: 'other', name: 'Other', cells: [] },
    ],
  }
  assert.deepEqual(rowCells(assigned, row), [])
})
test('settings packages omit machine paths and credentials, preview without writes, and support backup restoration', async (t) => {
  const root = await directory(t),
    store = new WorkspaceStore(root, ['ja'])
  await store.init()
  await store.read(['p1'])
  const original = await fs.readFile(store.file, 'utf8')
  const incoming = {
    ...defaultWorkspace(),
    locale: 'es' as const,
    groups: [{ id: 'incoming', name: 'Imported', collapsed: false }],
    projects: {
      p1: { groupId: 'incoming', favorite: true, addedOrder: 1 },
      p2: { groupId: 'incoming', favorite: true, addedOrder: 2 },
    },
    nextOrder: 3,
  }
  const transferable = exportSettings({
    ...incoming,
    browse: { p1: { mode: 'CARD', location: 'D:\\private-media', panelWidth: 400, widths: {} } },
    token: 'SECRET',
  } as never)
  assert.equal(JSON.stringify(transferable).includes('private-media'), false)
  assert.equal(JSON.stringify(transferable).includes('SECRET'), false)
  let preview = await store.update({ action: 'previewPackage', value: transferable }, ['p1'])
  assert.equal(await fs.readFile(store.file, 'utf8'), original)
  const imported = await store.update(
    { action: 'applyPackage', token: preview.importPreview!.token, mode: 'merge' },
    ['p1']
  )
  assert.equal(imported.prefs.locale, 'ja')
  assert.equal(imported.prefs.projects.p1.favorite, false)
  assert.equal(imported.prefs.projects.p2.favorite, true)
  assert.ok(imported.backupId)
  const backed = JSON.parse(
    await fs.readFile(path.join(root, 'workspace-backups', imported.backupId! + '.json'), 'utf8')
  )
  assert.deepEqual(backed.prefs, JSON.parse(original))
  const restored = await store.update({ action: 'restorePackage', backupId: imported.backupId! }, [
    'p1',
  ])
  assert.equal(restored.prefs.projects.p2, undefined)
  assert.equal(restored.prefs.locale, 'ja')
  assert.ok((await store.update({ action: 'listBackups' }, ['p1'])).backups!.length >= 2)
  preview = await store.update({ action: 'previewPackage', value: transferable }, ['p1'])
  await store.update({ action: 'appearance', theme: 'paper', locale: 'ja' }, ['p1'])
  const before = await fs.readFile(store.file, 'utf8')
  await assert.rejects(
    store.update({ action: 'applyPackage', token: preview.importPreview!.token, mode: 'replace' }, [
      'p1',
    ]),
    /失效/
  )
  assert.equal(await fs.readFile(store.file, 'utf8'), before)
  await assert.rejects(
    store.update(
      {
        action: 'previewPackage',
        value: { ...transferable, prefs: { ...transferable.prefs, browse: {} } },
      },
      ['p1']
    ),
    /不可匯入/
  )
})
test('failed settings backup prevents import and leaves the previous disk and memory state intact', async (t) => {
  const root = await directory(t),
    store = new WorkspaceStore(root, ['en'])
  await store.init()
  const before = await fs.readFile(store.file, 'utf8'),
    state = await store.read([])
  const packageValue = exportSettings({ ...defaultWorkspace(), locale: 'es' })
  const preview = await store.update({ action: 'previewPackage', value: packageValue }, [])
  await fs.writeFile(path.join(root, 'workspace-backups'), 'CONTROLLED BLOCKER')
  await assert.rejects(
    store.update(
      { action: 'applyPackage', token: preview.importPreview!.token, mode: 'replace' },
      []
    )
  )
  assert.equal(await fs.readFile(store.file, 'utf8'), before)
  assert.deepEqual((await store.read([])).prefs, state.prefs)
  assert.equal(
    await fs.readFile(path.join(root, 'workspace-backups'), 'utf8'),
    'CONTROLLED BLOCKER'
  )
})
