import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { Explorer } from '../electron/explorer'
import { readFolder, saveFolder } from '../electron/files'

const base = path.resolve('.test-output')

test("R-339: removing a website's data keeps hand-changed values and other sources", async (t) => {
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'remove-source-')),
    media = path.join(root, 'Work')
  await fs.mkdir(media, { recursive: true })
  await fs.writeFile(path.join(media, 'a.png'), 'x')
  const library = new Library(path.join(root, 'local'), undefined, false)
  await library.init()
  const explorer = new Explorer(library, library.userData, {
    choose: async () => undefined,
    open: async () => {},
    launch: async () => {},
    thumbnail: async () => Buffer.alloc(0),
  })
  t.after(async () => {
    explorer.index.close()
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  await library.create(media, { name: 'Works', depth: { mode: 'through', level: 1 } })
  const row = () => library.snapshot().rows.find((r) => r.path === media)!
  const record = await readFolder(media)
  const sourceRecord = {
    provider: 'vndb',
    url: 'https://vndb.org/v97',
    fetchedAt: '2026-11-13T00:00:00Z',
  }
  record.attributes.push(
    {
      attributeId: 'vndb-title',
      key: 'TITLE',
      type: 'string',
      value: 'Saya',
      source: 'vndb',
      sourceRecord,
    },
    {
      attributeId: 'vndb-description',
      key: 'DESCRIPTION',
      type: 'text',
      value: 'Old',
      source: 'manual',
    },
    { attributeId: 'dlsite-title', key: 'TITLE', type: 'string', value: 'Other', source: 'dlsite' },
    { attributeId: 'rating', key: 'RATING', type: 'string', value: 'Mine', source: 'manual' }
  )
  await saveFolder(media, record, record.revision)
  await explorer.request({ action: 'visit', rowId: row().rowId })
  const revision = (await readFolder(media)).revision
  await explorer.request({ action: 'removeSource', rowId: row().rowId, revision, provider: 'vndb' })
  assert.deepEqual(
    (await readFolder(media)).attributes.map((a) => a.attributeId).sort(),
    ['dlsite-title', 'rating', 'vndb-description'],
    'only the untouched VNDB value goes'
  )
  // An unknown website, or a stale revision, changes nothing.
  const now = (await readFolder(media)).revision
  await assert.rejects(
    explorer.request({
      action: 'removeSource',
      rowId: row().rowId,
      revision: now,
      provider: 'nope',
    }),
    /來源不存在/
  )
  await assert.rejects(
    explorer.request({
      action: 'removeSource',
      rowId: row().rowId,
      revision: now - 1,
      provider: 'dlsite',
    })
  )
  assert.equal((await readFolder(media)).attributes.length, 3)
})
