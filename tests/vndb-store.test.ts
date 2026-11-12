import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metadata } from '../electron/metadata'
import { storeLink, VNDB_STORE_MISSING } from '../electron/sources/vndb'
import { sourceForUrl } from '../shared/sources'

const asked: unknown[] = []
const fakeVndb = (found: boolean) =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    assert.equal(String(input), 'https://api.vndb.org/kana/vn', 'only the VNDB API is asked')
    asked.push(JSON.parse(String(init?.body)).filters)
    return new Response(
      JSON.stringify({
        results: found
          ? [{ id: 'v97', title: 'Saya no Uta', alttitle: '沙耶の唄', released: '2003-12-26' }]
          : [],
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }) as typeof fetch

test('R-293: store addresses become the release links VNDB keeps', () => {
  const link = (url: string) => storeLink(new URL(url))
  assert.deepEqual(link('https://www.getchu.com/soft.phtml?id=36221'), ['getchu', 36221])
  assert.deepEqual(link('https://dl.getchu.com/i/item4012345'), ['getchudl', 4012345])
  assert.deepEqual(
    link('https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=3193'),
    ['egs', 3193]
  )
  assert.deepEqual(link('https://www.melonbooks.co.jp/detail/detail.php?product_id=50460'), [
    'melonjp',
    50460,
  ])
  assert.deepEqual(link('https://ec.toranoana.shop/tora/ec/item/040030123456/'), [
    'toranoana',
    40030123456,
  ])
  assert.deepEqual(link('https://dlsoft.dmm.co.jp/detail/sai_0071'), [
    'dmm',
    'dlsoft.dmm.co.jp/detail/sai_0071/',
  ])
  // Pages that are not a work page, or IDs that are not numbers, give no link.
  for (const url of [
    'https://www.getchu.com/top.html',
    'https://www.getchu.com/soft.phtml?id=abc',
    'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=0',
    'https://www.melonbooks.co.jp/detail/detail.php?product_id=1;drop',
  ])
    assert.equal(link(url), undefined, url)
  for (const url of [
    'https://www.getchu.com/soft.phtml?id=36221',
    'https://erogamescape.dyndns.org/~ap2/ero/toukei_kaiseki/game.php?game=3193',
    'https://www.melonbooks.co.jp/detail/detail.php?product_id=50460',
    'https://ec.toranoana.shop/tora/ec/item/040030123456/',
  ])
    assert.equal(sourceForUrl(url), 'vndb', url)
})

test('R-293: a store address is previewed from VNDB, and FANZA without a key goes there too', async () => {
  asked.length = 0
  const getchu = await metadata('https://www.getchu.com/soft.phtml?id=36221', fakeVndb(true))
  assert.equal(getchu.preview.provider, 'vndb')
  assert.equal(getchu.preview.source, 'https://vndb.org/v97')
  assert.deepEqual(asked.at(-1), ['release', '=', ['extlink', '=', ['getchu', 36221]]])
  const dmm = await metadata(
    'https://dlsoft.dmm.co.jp/detail/sai_0071/',
    fakeVndb(true),
    undefined,
    { keyFor: async () => undefined }
  )
  assert.equal(dmm.preview.provider, 'vndb')
  assert.deepEqual(asked.at(-1), [
    'release',
    '=',
    ['extlink', '=', ['dmm', 'dlsoft.dmm.co.jp/detail/sai_0071/']],
  ])
  await assert.rejects(
    metadata('https://www.melonbooks.co.jp/detail/detail.php?product_id=1', fakeVndb(false)),
    (error) => String(error).includes(VNDB_STORE_MISSING)
  )
  // A store host with a VNDB-like path is not read as a VNDB ID.
  await assert.rejects(metadata('https://www.getchu.com/v97', fakeVndb(true)), (error) =>
    String(error).includes(VNDB_STORE_MISSING)
  )
  // A plain VNDB address still asks by ID.
  await metadata('https://vndb.org/v97', fakeVndb(true))
  assert.deepEqual(asked.at(-1), ['id', '=', 'v97'])
})
