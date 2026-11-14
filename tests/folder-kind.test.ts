import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { Explorer, type DesktopOperations } from '../electron/explorer'
import { detectFolderKind, sampleOf } from '../shared/kind'
import { readFolder } from '../electron/files'
import { isGameFolder } from '../shared/media'
import type { FolderRow } from '../shared/model'

const row = (details?: object, boundary?: object) =>
  ({
    boundary,
    record: details ? { details: { schemaVersion: 1, ...details } } : undefined,
  }) as unknown as FolderRow
const files = (images: number, videos = 0, audio = 0) =>
  sampleOf([
    ...Array.from({ length: images }, () => ({ kind: 'image' })),
    ...Array.from({ length: videos }, () => ({ kind: 'video' })),
    ...Array.from({ length: audio }, () => ({ kind: 'audio' })),
    { kind: 'folder' },
    { kind: 'subtitle' },
  ])

test('folder kind: manual choice, detected game, reading mode, then file content; unsure means general', () => {
  assert.deepEqual(detectFolderKind(row({ kind: 'media' }, { engines: ['x'] }), files(20)), {
    kind: 'media',
    source: 'manual',
  })
  assert.deepEqual(detectFolderKind(row(undefined, { engines: ['RPG Maker'], evidence: [] })), {
    kind: 'game',
    source: 'game',
  })
  // A folder the user marked "not a game" is not treated as one, whatever was detected.
  assert.equal(
    detectFolderKind(row({ boundary: { state: 'not-game', engines: [], evidence: [] } }, {})).kind,
    'general'
  )
  assert.deepEqual(detectFolderKind(row({ reading: { mode: 'manga' } }), files(0)), {
    kind: 'book',
    source: 'reading',
  })
  assert.equal(detectFolderKind(row({}), files(30)).kind, 'book')
  assert.equal(detectFolderKind(row({}), files(2)).kind, 'general', 'two images are not a book')
  assert.equal(detectFolderKind(row({}), files(5, 5)).kind, 'media', 'half video or audio is media')
  assert.equal(detectFolderKind(row({}), files(0, 0, 4)).kind, 'media')
  assert.equal(detectFolderKind(row({}), files(10, 0, 0)).kind, 'book')
  assert.equal(detectFolderKind(row({}), files(7, 0, 0)).kind, 'book')
  assert.deepEqual(detectFolderKind(row({})), { kind: 'general', source: 'default' })
  assert.equal(detectFolderKind(row({}), files(0)).kind, 'general', 'an empty folder is general')
})

test('the folderKind request stores or clears the manual kind and rejects unknown kinds', async (t) => {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'folder-kind-')),
    media = path.join(root, 'media'),
    local = path.join(root, 'local')
  await fs.mkdir(path.join(media, 'A'), { recursive: true })
  const lib = new Library(local, undefined, false)
  await lib.init()
  const desktop: DesktopOperations = {
    choose: async () => undefined,
    open: async () => {},
    launch: async () => {},
    thumbnail: async () => Buffer.from('x'),
  }
  const explorer = new Explorer(lib, local, desktop)
  t.after(async () => {
    explorer.index.close()
    const target = await fs.realpath(root)
    if (!target.startsWith(base + path.sep)) throw new Error('Unsafe cleanup')
    await fs.rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  await lib.create(media, {
    name: 'Kinds',
    depth: { mode: 'through', level: 2 },
  })
  const rowA = () => lib.snapshot().rows.find((r) => r.name === 'A')!
  await explorer.request({
    action: 'folderKind',
    rowId: rowA().rowId,
    revision: rowA().record!.revision,
    kind: 'book',
  })
  assert.equal((await readFolder(rowA().path)).details?.kind, 'book')
  assert.equal(detectFolderKind(rowA()).kind, 'book')
  await assert.rejects(
    explorer.request({
      action: 'folderKind',
      rowId: rowA().rowId,
      revision: rowA().record!.revision,
      kind: 'spaceship' as never,
    }),
    /類型不合法/
  )
  await explorer.request({
    action: 'folderKind',
    rowId: rowA().rowId,
    revision: rowA().record!.revision,
    kind: null,
  })
  assert.equal((await readFolder(rowA().path)).details?.kind, undefined)
  assert.equal((await readFolder(rowA().path)).details?.boundary, undefined, 'a book is no game')
  // R-380: choosing "game" also marks the folder as a game main folder, so the game page shows in one step.
  assert.equal(isGameFolder(rowA()), false)
  const made = await explorer.request({
    action: 'folderKind',
    rowId: rowA().rowId,
    revision: rowA().record!.revision,
    kind: 'game',
  })
  // The answer comes from a new scan, so the row already carries the boundary the panel and lists read.
  assert.equal(
    made.snapshot!.rows.find((r) => r.name === 'A')!.boundary?.state,
    'root',
    'the returned row is the rescanned one'
  )
  assert.deepEqual((await readFolder(rowA().path)).details?.boundary, {
    state: 'root',
    engines: [],
    evidence: ['使用者指定'],
  })
  assert.equal(isGameFolder(rowA()), true)
  assert.deepEqual(detectFolderKind(rowA()), { kind: 'game', source: 'manual' })
  // A folder the user had said is not a game becomes one when they choose the game type after all.
  await explorer.request({
    action: 'boundary',
    rowId: rowA().rowId,
    revision: rowA().record!.revision,
    state: 'not-game',
  })
  assert.equal(isGameFolder(rowA()), false)
  await explorer.request({
    action: 'folderKind',
    rowId: rowA().rowId,
    revision: rowA().record!.revision,
    kind: 'game',
  })
  assert.equal((await readFolder(rowA().path)).details?.boundary?.state, 'root')
  // Another type afterwards leaves the mark: "this is not a game folder" is what removes it.
  await explorer.request({
    action: 'folderKind',
    rowId: rowA().rowId,
    revision: rowA().record!.revision,
    kind: 'media',
  })
  assert.equal((await readFolder(rowA().path)).details?.boundary?.state, 'root')
})

test('folderKinds sets the kind of several folders and reports the ones that fail', async (t) => {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'folder-kinds-')),
    media = path.join(root, 'media'),
    local = path.join(root, 'local')
  for (const name of ['A', 'B']) await fs.mkdir(path.join(media, name), { recursive: true })
  const lib = new Library(local, undefined, false)
  await lib.init()
  const desktop: DesktopOperations = {
    choose: async () => undefined,
    open: async () => {},
    launch: async () => {},
    thumbnail: async () => Buffer.from('x'),
  }
  const explorer = new Explorer(lib, local, desktop)
  t.after(async () => {
    explorer.index.close()
    const target = await fs.realpath(root)
    if (!target.startsWith(base + path.sep)) throw new Error('Unsafe cleanup')
    await fs.rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  await lib.create(media, { name: 'Kinds', depth: { mode: 'through', level: 2 } })
  const rowOf = (name: string) => lib.snapshot().rows.find((r) => r.name === name)!
  const a = rowOf('A'),
    b = rowOf('B')
  const result = await explorer.request({
    action: 'folderKinds',
    rows: [
      { rowId: a.rowId, revision: a.record!.revision },
      { rowId: b.rowId, revision: b.record!.revision + 5 },
    ],
    kind: 'media',
  })
  assert.equal((await readFolder(rowOf('A').path)).details?.kind, 'media')
  assert.equal(
    (await readFolder(rowOf('B').path)).details?.kind,
    undefined,
    'a stale revision is not written'
  )
  assert.match(result.notice?.message ?? JSON.stringify(result.notice), /失敗|b/i)
  await assert.rejects(
    explorer.request({ action: 'folderKinds', rows: [], kind: 'media' }),
    /批次範圍不合法/
  )
  await assert.rejects(
    explorer.request({
      action: 'folderKinds',
      rows: [{ rowId: a.rowId, revision: 1 }],
      kind: 'x' as never,
    }),
    /類型不合法/
  )
  await explorer.request({
    action: 'folderKinds',
    rows: [{ rowId: a.rowId, revision: rowOf('A').record!.revision }],
    kind: null,
  })
  assert.equal((await readFolder(rowOf('A').path)).details?.kind, undefined)
  // R-380: the batch only sets the type. It does not make main folders, whose insides are protected, of a selection.
  await explorer.request({
    action: 'folderKinds',
    rows: [{ rowId: a.rowId, revision: rowOf('A').record!.revision }],
    kind: 'game',
  })
  const batched = (await readFolder(rowOf('A').path)).details
  assert.equal(batched?.kind, 'game')
  assert.equal(batched?.boundary, undefined)
})
