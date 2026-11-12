import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metadata } from '../electron/metadata'
import { decodePage, pageMeta } from '../electron/sources/web'
import { tinyPng } from './support/archive-fixture'

// Public addresses for every host, except the ones a test makes private.
const lookup = async (host: string) =>
  host.startsWith('intranet')
    ? ['10.0.0.5']
    : host.startsWith('loop')
      ? ['127.0.0.1']
      : ['93.184.216.34']
type Reply = { status?: number; headers?: Record<string, string>; body?: string | Buffer }
const site = (pages: Record<string, Reply>, seen: string[] = []) =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    seen.push(url)
    assert.equal(new Headers(init?.headers).has('Authorization'), false)
    const reply = pages[url]
    if (!reply) return new Response('', { status: 404 })
    return new Response(
      typeof reply.body === 'string' || !reply.body
        ? (reply.body ?? '')
        : new Uint8Array(reply.body),
      { status: reply.status ?? 200, headers: reply.headers }
    )
  }) as typeof fetch

test('any HTTPS page: JSON-LD first, OpenGraph next, cover through the safe image download (R-283)', async () => {
  const seen: string[] = []
  const html = `<html><head><title>Plain title</title>
    <meta property="og:title" content="OG title"><meta property="og:image" content="/cover.png">
    <meta property="og:site_name" content="Shop"><link rel="canonical" href="https://shop.example/item/1">
    <script type="application/ld+json">{"@type":"Book","name":"LD &amp; title","author":[{"name":"Writer"}],
      "datePublished":"2024-05-06","genre":["Fantasy"],"description":"About"}</script></head><body>x</body></html>`
  const result = await metadata(
    'https://shop.example/item/1?ref=x',
    site(
      {
        'https://shop.example/item/1?ref=x': {
          body: html,
          headers: { 'content-type': 'text/html' },
        },
        'https://shop.example/cover.png': { body: tinyPng },
      },
      seen
    ),
    undefined,
    { lookup }
  )
  assert.equal(result.preview.provider, 'web')
  assert.equal(result.preview.title, 'LD & title')
  const value = (key: string) => result.preview.values.find((v) => v.key === key)?.value
  assert.equal(value('SOURCE_URL'), 'https://shop.example/item/1')
  assert.deepEqual(value('AUTHORS'), ['Writer'])
  assert.deepEqual(value('TAGS'), ['Fantasy'])
  assert.equal(value('SITE_NAME'), 'Shop')
  assert.equal(result.cover?.mime, 'image/png')
  assert.deepEqual(seen, ['https://shop.example/item/1?ref=x', 'https://shop.example/cover.png'])
})

test('pages on local or private addresses, plain HTTP and redirects into the intranet are refused', async () => {
  const never = (async () => {
    throw new Error('MUST NOT FETCH')
  }) as typeof fetch
  for (const source of [
    'https://intranet.example/x',
    'https://loop.example/x',
    'https://127.0.0.1/x',
    'https://localhost/x',
  ])
    await assert.rejects(metadata(source, never, undefined, { lookup }), /內網/)
  await assert.rejects(metadata('http://shop.example/x', never, undefined, { lookup }))
  await assert.rejects(
    metadata(
      'https://shop.example/go',
      site({
        'https://shop.example/go': {
          status: 302,
          headers: { location: 'https://intranet.example/admin' },
        },
      }),
      undefined,
      { lookup }
    ),
    /內網/
  )
  // A cover on a private address is skipped, the page itself still imports.
  const result = await metadata(
    'https://shop.example/a',
    site({
      'https://shop.example/a': {
        body: '<meta property="og:title" content="T"><meta property="og:image" content="https://intranet.example/c.png">',
      },
    }),
    undefined,
    { lookup }
  )
  assert.equal(result.cover, undefined)
  assert.ok(result.preview.values.some((v) => v.key === 'COVER_STATUS'))
})

test('pages are decoded with their own charset (EUC-JP, Shift_JIS) and scanning survives broken markup', () => {
  // 「テスト」 in EUC-JP and Shift_JIS.
  const euc = Buffer.concat([
    Buffer.from('<title>'),
    Buffer.from([0xa5, 0xc6, 0xa5, 0xb9, 0xa5, 0xc8]),
    Buffer.from('</title>'),
  ])
  assert.equal(decodePage(euc, 'text/html; charset=EUC-JP'), '<title>テスト</title>')
  const sjis = Buffer.concat([
    Buffer.from('<meta charset="Shift_JIS"><title>'),
    Buffer.from([0x83, 0x65, 0x83, 0x58, 0x83, 0x67]),
    Buffer.from('</title>'),
  ])
  assert.match(decodePage(sjis, 'text/html'), /テスト/)
  const started = performance.now()
  const meta = pageMeta(
    '<meta property="og:title" content="X">' + '<script type="application/ld+json">'.repeat(50000),
    new URL('https://a.example/')
  )
  assert.equal(meta.title, 'X')
  assert.ok(performance.now() - started < 2000)
})

test('R-284 / R-292 adapters ask only their own API and read the work (fixed replies)', async () => {
  const uuid = '801513ba-a712-498c-8f57-cae55b38cc92'
  const cases: [string, Record<string, unknown>, string][] = [
    [
      'https://mangadex.org/title/' + uuid + '/berserk',
      {
        [`https://api.mangadex.org/manga/${uuid}?includes[]=cover_art&includes[]=author&includes[]=artist`]:
          {
            data: {
              id: uuid,
              attributes: { title: { en: 'Berserk' }, altTitles: [{ ja: 'ベルセルク' }] },
              relationships: [],
            },
          },
      },
      'Berserk',
    ],
    [
      'https://kitsu.app/anime/cowboy-bebop',
      {
        'https://kitsu.io/api/edge/anime?filter[slug]=cowboy-bebop&include=categories': {
          data: [{ id: '1', attributes: { canonicalTitle: 'Cowboy Bebop', slug: 'cowboy-bebop' } }],
          included: [{ type: 'categories', attributes: { title: 'Space' } }],
        },
      },
      'Cowboy Bebop',
    ],
    [
      'https://www.mangaupdates.com/series/njeqwry/berserk',
      {
        'https://api.mangaupdates.com/v1/series/51239621230': {
          series_id: 51239621230,
          title: 'Berserk',
        },
      },
      'Berserk',
    ],
    [
      'https://ncode.syosetu.com/n9669bk/',
      {
        'https://api.syosetu.com/novelapi/api/?out=json&lim=1&of=t-w-s-g-k-gf-ga-nu-l-e&ncode=n9669bk':
          [{ allcount: 1 }, { title: '無職転生', writer: '理不尽な孫の手', end: 0 }],
      },
      '無職転生',
    ],
    [
      'https://music.apple.com/jp/album/discovery/697194953',
      {
        'https://itunes.apple.com/lookup?id=697194953&entity=song&limit=200&country=jp': {
          results: [
            { wrapperType: 'collection', collectionId: 697194953, collectionName: 'Discovery' },
            { wrapperType: 'track', trackName: 'One More Time' },
          ],
        },
      },
      'Discovery',
    ],
    [
      'https://www.deezer.com/en/album/302127',
      { 'https://api.deezer.com/album/302127': { id: 302127, title: 'Discovery' } },
      'Discovery',
    ],
    [
      'https://danbooru.donmai.us/posts/1',
      {
        'https://danbooru.donmai.us/posts/1.json': {
          id: 1,
          tag_string_character: 'a',
          tag_string_copyright: 'b',
        },
      },
      'a · b',
    ],
    [
      'https://books.google.com/books?id=zyTCAlFPjgYC',
      {
        'https://www.googleapis.com/books/v1/volumes/zyTCAlFPjgYC': {
          id: 'zyTCAlFPjgYC',
          volumeInfo: { title: 'The Google Story' },
        },
      },
      'The Google Story',
    ],
    [
      'https://www.pixiv.net/novel/show.php?id=12',
      {
        'https://www.pixiv.net/ajax/novel/12': { error: false, body: { id: '12', title: 'Novel' } },
      },
      'Novel',
    ],
    [
      'https://shop.booth.pm/items/8011749',
      {
        'https://booth.pm/ja/items/8011749.json': {
          id: 8011749,
          name: 'Comic',
          shop: { name: 'Shop' },
        },
      },
      'Comic',
    ],
    [
      'https://kakuyomu.jp/works/2912051603596422650',
      {
        'https://kakuyomu.jp/works/2912051603596422650':
          '<html><script id="__NEXT_DATA__" type="application/json">' +
          JSON.stringify({
            props: {
              pageProps: {
                __APOLLO_STATE__: {
                  'Work:2912051603596422650': { title: '小説', author: { __ref: 'U:1' } },
                  'U:1': { activityName: '作者' },
                },
              },
            },
          }) +
          '</script></html>',
      },
      '小説',
    ],
  ]
  for (const [source, replies, title] of cases) {
    const seen: string[] = []
    const fetcher = (async (input: RequestInfo | URL) => {
      const url = String(input)
      seen.push(url)
      const body = replies[decodeURI(url)] ?? replies[url]
      if (body === undefined) return new Response('', { status: 404 })
      return new Response(typeof body === 'string' ? body : JSON.stringify(body))
    }) as typeof fetch
    const result = await metadata(source, fetcher)
    assert.equal(result.preview.title, title, source)
    assert.ok(
      seen.every(
        (url) => Object.keys(replies).includes(decodeURI(url)) || Object.keys(replies).includes(url)
      ),
      source + ' asked ' + seen.join(', ')
    )
  }
})

test('every IPv6 spelling of a private IPv4 address counts as private', async () => {
  const { privateAddress } = await import('../electron/image-url')
  for (const ip of [
    '::ffff:7f00:1',
    '::ffff:127.0.0.1',
    '::ffff:a00:1',
    '64:ff9b::a00:1',
    '2002:7f00:1::',
    '::1',
    '::',
    'fe80::1',
    'fd00::1',
    'ff02::1',
    '198.18.0.1',
    '192.0.0.8',
    '203.0.113.5',
  ])
    assert.equal(privateAddress(ip), true, ip)
  for (const ip of [
    '93.184.216.34',
    '::ffff:5db8:d822',
    '2606:4700::6810:84e5',
    '64:ff9b::5db8:d822',
  ])
    assert.equal(privateAddress(ip), false, ip)
  // The URL parser rewrites the dotted form into hex; such a page address is refused before any request.
  await assert.rejects(
    metadata('https://[::ffff:127.0.0.1]/x', (async () => {
      throw new Error('MUST NOT FETCH')
    }) as typeof fetch),
    /內網/
  )
})
