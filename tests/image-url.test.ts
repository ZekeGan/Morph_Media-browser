import { plainMessage } from '../shared/message'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { Explorer, type DesktopOperations } from '../electron/explorer'
import { fetchImageUrl, privateAddress } from '../electron/image-url'
import { DATA_DIR } from '../shared/model'
import { exists, readFolder } from '../electron/files'

const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64, 1)])
const pub = async () => ['93.184.216.34']
const respond = (body: Buffer | string, init: ResponseInit = {}) =>
  new Response(typeof body === 'string' ? body : new Uint8Array(body), init)

test('image URL download accepts public HTTP(S) images by content and follows limited redirects', async () => {
  const seen: string[] = []
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push(String(input))
    assert.equal(init?.redirect, 'manual')
    return String(input).endsWith('/start')
      ? respond('', { status: 302, headers: { location: '/cover.php?id=1' } })
      : respond(png, { headers: { 'content-type': 'text/plain' } })
  }) as typeof fetch
  const image = await fetchImageUrl('https://img.example.test/start', { fetcher, lookup: pub })
  assert.equal(image.ext, 'png')
  assert.equal(image.mime, 'image/png')
  assert.equal(image.name, 'cover.png')
  assert.deepEqual(seen, [
    'https://img.example.test/start',
    'https://img.example.test/cover.php?id=1',
  ])
})

test('image URL download rejects unsafe targets, non-images, oversize content and redirect abuse', async () => {
  let calls = 0
  const never = (async () => {
    calls++
    return respond(png)
  }) as typeof fetch
  for (const url of [
    'ftp://example.test/a.png',
    'file:///C:/a.png',
    'https://user:pass@example.test/a.png',
    'http://localhost/a.png',
    'http://127.0.0.1/a.png',
    'http://[::1]/a.png',
    'http://192.168.1.5/a.png',
    'not a url',
  ])
    await assert.rejects(fetchImageUrl(url, { fetcher: never, lookup: pub }), Error, url)
  await assert.rejects(
    fetchImageUrl('https://internal.example.test/a.png', {
      fetcher: never,
      lookup: async () => ['10.0.0.8'],
    }),
    /內網/
  )
  assert.equal(calls, 0)
  await assert.rejects(
    fetchImageUrl('https://example.test/page', {
      fetcher: (async () => respond('<html></html>')) as typeof fetch,
      lookup: pub,
    }),
    /不是支援的圖片/
  )
  await assert.rejects(
    fetchImageUrl('https://example.test/big.png', {
      fetcher: (async () =>
        respond(png, { headers: { 'content-length': String(11 * 1024 * 1024) } })) as typeof fetch,
      lookup: pub,
    }),
    /過大/
  )
  await assert.rejects(
    fetchImageUrl('https://example.test/missing.png', {
      fetcher: (async () => respond('', { status: 404 })) as typeof fetch,
      lookup: pub,
    }),
    (error) => /HTTP 404/.test(plainMessage(String(error)))
  )
  const loop = (async () =>
    respond('', {
      status: 302,
      headers: { location: 'https://example.test/again' },
    })) as typeof fetch
  await assert.rejects(
    fetchImageUrl('https://example.test/loop', { fetcher: loop, lookup: pub }),
    /重新導向/
  )
  const toPrivate = (async () =>
    respond('', { status: 302, headers: { location: 'http://10.0.0.1/a.png' } })) as typeof fetch
  await assert.rejects(
    fetchImageUrl('https://example.test/r', { fetcher: toPrivate, lookup: pub }),
    /內網/
  )
  for (const ip of [
    '10.1.2.3',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '192.168.0.1',
    '::1',
    'fd00::1',
    'fe80::1',
    '::ffff:10.0.0.1',
  ])
    assert.equal(privateAddress(ip), true, ip)
  for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111'])
    assert.equal(privateAddress(ip), false, ip)
})

test('cover from image URL is saved as a portable asset, and failures keep the original cover', async (t) => {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'image-url-')),
    media = path.join(root, 'media'),
    local = path.join(root, 'local')
  await fs.mkdir(path.join(media, 'Game A'), { recursive: true })
  await fs.writeFile(path.join(media, 'Game A', 'game.txt'), 'ORIGINAL')
  const lib = new Library(local, undefined, false)
  await lib.init()
  const desktop: DesktopOperations = {
    choose: async () => undefined,
    open: async () => {},
    launch: async () => {},
    thumbnail: async () => Buffer.from('x'),
  }
  const explorer = new Explorer(lib, local, desktop)
  explorer.imageUrlOptions = { fetcher: (async () => respond(png)) as typeof fetch, lookup: pub }
  t.after(async () => {
    explorer.index.close()
    const target = await fs.realpath(root)
    if (!target.startsWith(base + path.sep)) throw new Error('Unsafe cleanup')
    await fs.rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  await lib.create(media, {
    name: 'Games',
    depth: { mode: 'through', level: 2 },
  })
  let row = lib.snapshot().rows.find((r) => r.name === 'Game A')!
  const { imagePreview } = await explorer.request({
    action: 'imageUrlPreview',
    url: 'https://img.example.test/cover.png',
  })
  assert.ok(imagePreview?.image.startsWith('data:image/png;base64,'))
  assert.equal(
    await exists(path.join(row.path, DATA_DIR, 'assets')),
    false,
    'preview writes nothing'
  )
  await assert.rejects(
    explorer.request({
      action: 'imageUrlApply',
      rowId: row.rowId,
      revision: row.record!.revision - 1,
      token: imagePreview!.token,
      cover: true,
    }),
    /版本衝突/
  )
  let record = await readFolder(row.path)
  assert.equal(record.assets.length, 0)
  assert.equal(record.details?.bannerAssetId, undefined)
  await assert.rejects(
    explorer.request({
      action: 'imageUrlApply',
      rowId: row.rowId,
      revision: row.record!.revision,
      token: 'missing',
      cover: true,
    }),
    /過期/
  )
  await explorer.request({
    action: 'imageUrlApply',
    rowId: row.rowId,
    revision: row.record!.revision,
    token: imagePreview!.token,
    cover: true,
  })
  row = lib.snapshot().rows.find((r) => r.name === 'Game A')!
  record = await readFolder(row.path)
  assert.equal(record.assets.length, 1)
  assert.equal(record.details?.bannerAssetId, record.assets[0].assetId)
  assert.deepEqual(
    await fs.readFile(path.join(row.path, DATA_DIR, record.assets[0].relativePath)),
    png
  )
  assert.equal(await fs.readFile(path.join(media, 'Game A', 'game.txt'), 'utf8'), 'ORIGINAL')
  await assert.rejects(
    explorer.request({
      action: 'imageUrlApply',
      rowId: row.rowId,
      revision: row.record!.revision,
      token: imagePreview!.token,
      cover: true,
    }),
    /過期/
  )
  explorer.imageUrlOptions = {
    fetcher: (async () => respond('<html>')) as typeof fetch,
    lookup: pub,
  }
  await assert.rejects(
    explorer.request({ action: 'imageUrlPreview', url: 'https://img.example.test/x' }),
    /不是支援的圖片/
  )
  assert.equal((await readFolder(row.path)).details?.bannerAssetId, record.assets[0].assetId)
})
