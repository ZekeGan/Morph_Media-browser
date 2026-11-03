import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { Explorer, type DesktopOperations } from '../electron/explorer'
import { DATA_DIR } from '../shared/model'
import { exists, folderFile, readFolder, saveFolder } from '../electron/files'

const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64, 1)])

test('saved images can be deleted: references cleared in one write, file removed after, originals kept', async (t) => {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'image-delete-')),
    media = path.join(root, 'media'),
    local = path.join(root, 'local')
  await fs.mkdir(path.join(media, 'Game A'), { recursive: true })
  await fs.writeFile(path.join(media, 'Game A', 'cover.png'), 'ORIGINAL')
  const lib = new Library(local, undefined, false)
  await lib.init()
  const desktop: DesktopOperations = {
    choose: async () => undefined,
    open: async () => {},
    launch: async () => {},
    thumbnail: async () => Buffer.from('x'),
  }
  const explorer = new Explorer(lib, local, desktop)
  explorer.imageUrlOptions = {
    fetcher: (async () => new Response(new Uint8Array(png))) as typeof fetch,
    lookup: async () => ['93.184.216.34'],
  }
  t.after(async () => {
    explorer.index.close()
    const target = await fs.realpath(root)
    if (!target.startsWith(base + path.sep)) throw new Error('Unsafe cleanup')
    await fs.rm(target, { recursive: true, force: true })
  })
  await lib.create(media, {
    name: 'Games',
    depth: { mode: 'through', level: 2 },
  })
  const rowOf = () => lib.snapshot().rows.find((r) => r.name === 'Game A')!
  // Two saved images: the first becomes the cover and is also assigned to a cell; the second is unused.
  for (const cover of [true, false]) {
    const { imagePreview } = await explorer.request({
      action: 'imageUrlPreview',
      url: 'https://img.example.test/' + (cover ? 'a' : 'b') + '.png',
    })
    await explorer.request({
      action: 'imageUrlApply',
      rowId: rowOf().rowId,
      revision: rowOf().record!.revision,
      token: imagePreview!.token,
      cover,
    })
  }
  const dir = rowOf().path
  let record = await readFolder(dir)
  const [used, spare] = record.assets,
    file = (a: typeof used) => path.join(dir, DATA_DIR, a.relativePath)
  record.details!.cellImages = { pic: used.assetId, other: spare.assetId }
  await saveFolder(dir, record, record.revision)
  await lib.scan()
  assert.equal(record.details!.bannerAssetId, used.assetId)
  const del = (assetId: string, revision?: number) =>
    explorer.request({
      action: 'deleteImage',
      rowId: rowOf().rowId,
      revision: revision ?? rowOf().record!.revision,
      assetId,
    })

  // Missing asset: rejected, nothing changes.
  const before = await readFolder(dir)
  await assert.rejects(del('00000000-0000-4000-8000-000000000000'), /圖片不存在/)
  assert.deepEqual(await readFolder(dir), before)

  // Conflict: a stale revision is rejected and keeps both record and file.
  await assert.rejects(del(used.assetId, before.revision - 1), /版本衝突/)
  assert.deepEqual(await readFolder(dir), before)
  assert.equal(await exists(file(used)), true)

  // Write failure: a directory in place of the backup makes the atomic write fail; file and record stay.
  const bak = folderFile(dir) + '.bak'
  await fs.rm(bak, { force: true })
  await fs.mkdir(bak)
  await assert.rejects(del(used.assetId))
  await fs.rmdir(bak)
  assert.deepEqual(await readFolder(dir), before)
  assert.equal(await exists(file(used)), true)

  // Referenced asset: removed together with its cover and cell references, in one revision step.
  await del(used.assetId)
  record = await readFolder(dir)
  assert.equal(record.revision, before.revision + 1)
  assert.deepEqual(
    record.assets.map((a) => a.assetId),
    [spare.assetId]
  )
  assert.equal(record.details!.bannerAssetId, undefined)
  assert.deepEqual(record.details!.cellImages, { other: spare.assetId })
  assert.equal(await exists(file(used)), false)
  assert.equal(await exists(file(spare)), true)

  // Unreferenced-by-cover asset: removed; the user's original media is never touched.
  await del(spare.assetId)
  record = await readFolder(dir)
  assert.equal(record.assets.length, 0)
  assert.deepEqual(record.details!.cellImages, {})
  assert.equal(await exists(file(spare)), false)
  assert.equal(await fs.readFile(path.join(media, 'Game A', 'cover.png'), 'utf8'), 'ORIGINAL')
})
