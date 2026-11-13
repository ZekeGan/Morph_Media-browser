import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metadata } from '../electron/metadata'
import { sourceForUrl } from '../shared/sources'
import { tinyPng } from './support/archive-fixture'

const network = (replies: Record<string, string | Buffer | object | number>, seen: string[] = []) =>
  (async (input: RequestInfo | URL) => {
    const url = String(input)
    seen.push(url)
    const reply = replies[url]
    if (reply === undefined) return new Response('', { status: 404 })
    if (typeof reply === 'number') return new Response('', { status: reply })
    return new Response(
      Buffer.isBuffer(reply)
        ? new Uint8Array(reply)
        : typeof reply === 'string'
          ? reply
          : JSON.stringify(reply)
    )
  }) as typeof fetch
const values = (result: Awaited<ReturnType<typeof metadata>>) =>
  Object.fromEntries(result.preview.values.map((v) => [v.key, v.value]))

test('R-365: Hitomi galleries bring their circles, series, characters and the ♀/♂ marks of tags', async () => {
  const info = {
    id: 12,
    title: 'Title',
    type: 'manga',
    artists: [{ artist: 'someone' }],
    groups: [{ group: 'circle' }],
    parodys: [{ parody: 'original' }],
    characters: [{ character: 'heroine' }],
    tags: [
      { tag: 'big breasts', female: '1', male: '' },
      { tag: 'glasses', female: '', male: '1' },
      { tag: 'full color' },
    ],
    files: [{}, {}],
  }
  const result = await metadata(
    'https://hitomi.la/reader/12.html',
    network({
      'https://ltn.gold-usergeneratedcontent.net/galleries/12.js':
        'var galleryinfo = ' + JSON.stringify(info),
    })
  )
  const v = values(result)
  assert.deepEqual(v.GROUP, ['circle'])
  assert.deepEqual(v.PARODY, ['original'])
  assert.deepEqual(v.CHARACTER, ['heroine'])
  assert.deepEqual(v.TAGS, ['female:big breasts', 'male:glasses', 'full color'])
  assert.deepEqual(v.FEMALE, ['big breasts'])
  assert.deepEqual(v.MALE, ['glasses'])
  assert.deepEqual(v.AUTHORS, ['someone'])
  assert.equal(v.PAGE_COUNT, 2)
})

test('R-367: nhentai galleries come from its own API, named like E-Hentai fields', async () => {
  assert.equal(sourceForUrl('https://nhentai.net/g/600000/'), 'nhentai')
  const seen: string[] = []
  const result = await metadata(
    'https://nhentai.net/g/600000/',
    network(
      {
        'https://nhentai.net/api/v2/galleries/600000': {
          id: 600000,
          title: {
            english: '[Circle] Title [Digital]',
            japanese: '[サークル] 題名',
            pretty: 'Title',
          },
          cover: { path: 'galleries/3559388/cover.webp.webp' },
          scanlator: '',
          upload_date: 1759137030,
          num_pages: 20,
          num_favorites: 5,
          tags: [
            { type: 'category', name: 'doujinshi' },
            { type: 'language', name: 'japanese' },
            { type: 'tag', name: 'twintails' },
            { type: 'parody', name: 'original' },
            { type: 'artist', name: 'maple' },
            { type: 'group', name: 'mapler' },
            { type: 'character', name: 'heroine' },
          ],
        },
        'https://t1.nhentai.net/galleries/3559388/cover.webp.webp': tinyPng,
      },
      seen
    )
  )
  const v = values(result)
  assert.equal(result.preview.provider, 'nhentai')
  assert.equal(result.preview.title, '[Circle] Title [Digital]')
  assert.equal(v.SOURCE_URL, 'https://nhentai.net/g/600000/')
  assert.equal(v.TITLE_ORIGINAL, '[サークル] 題名')
  assert.deepEqual(v.TAGS, [
    'category:doujinshi',
    'language:japanese',
    'twintails',
    'parody:original',
    'artist:maple',
    'group:mapler',
    'character:heroine',
  ])
  assert.deepEqual(v.PARODY, ['original'])
  assert.deepEqual(v.ARTIST, ['maple'])
  assert.deepEqual(v.GROUP, ['mapler'])
  assert.deepEqual(v.CHARACTER, ['heroine'])
  assert.deepEqual(v.LANGUAGE, ['japanese'])
  assert.equal(v.GALLERY_CATEGORY, 'doujinshi')
  assert.equal(v.PAGE_COUNT, 20)
  assert.equal(v.FAVORITE_COUNT, 5)
  assert.equal(v.GALLERY_POSTED_UTC, '2025-09-29T09:10:30.000Z')
  assert.ok(result.cover)
  assert.deepEqual(seen, [
    'https://nhentai.net/api/v2/galleries/600000',
    'https://t1.nhentai.net/galleries/3559388/cover.webp.webp',
  ])
})

test('R-367: a removed gallery, a strange cover path or another address is refused', async () => {
  await assert.rejects(
    metadata(
      'https://nhentai.net/g/177013/',
      network({ 'https://nhentai.net/api/v2/galleries/177013': 404 })
    ),
    /找不到/
  )
  await assert.rejects(metadata('https://nhentai.net/tag/x/', network({})), /完整作品網址/)
  const seen: string[] = []
  const odd = await metadata(
    'https://nhentai.net/g/5/',
    network(
      {
        'https://nhentai.net/api/v2/galleries/5': {
          id: 5,
          title: { english: 'T' },
          cover: { path: '../../elsewhere/cover.jpg' },
          tags: [],
        },
      },
      seen
    )
  )
  assert.equal(odd.cover, undefined)
  assert.deepEqual(seen, ['https://nhentai.net/api/v2/galleries/5'])
})
