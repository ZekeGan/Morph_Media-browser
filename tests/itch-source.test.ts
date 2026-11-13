import { test } from 'node:test'
import assert from 'node:assert/strict'
import { metadata } from '../electron/metadata'
import { sourceForUrl } from '../shared/sources'
import { tinyPng } from './support/archive-fixture'

type Reply = string | object | Buffer | number
// A fake network: a URL maps to a body (or a status code); every request is recorded with its body.
const network = (replies: Record<string, Reply>, seen: { url: string; body?: string }[] = []) =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    seen.push({ url, body: typeof init?.body === 'string' ? init.body : undefined })
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

const data = {
  id: 1234,
  title: 'Imperial &amp; Grace',
  cover_image: 'https://img.itch.zone/cover.png',
  price: '$17.91',
  tags: ['otome', 'visual-novel'],
  authors: [{ name: 'Abiding Bridge' }, { name: 'Synstoria' }],
  links: { self: 'https://abiding-bridge.itch.io/imperial-grace' },
}
const page =
  '<html><script type="application/ld+json">{"@type":"Product","description":"Play as the Empress.",' +
  '"aggregateRating":{"ratingValue":"4.8","ratingCount":727}}</script><table>' +
  '<tr><td>Published</td><td><abbr title="11 November 2026 @ 17:48 UTC">Nov 11</abbr></td></tr>' +
  '<tr><td>Status</td><td><a href="#">Released</a></td></tr>' +
  '<tr><td>Platforms</td><td><a>Windows</a>, <a>macOS</a></td></tr>' +
  '<tr><td>Genre</td><td><a>Visual Novel</a></td></tr>' +
  '<tr><td>Made with</td><td><a>Ren&#039;Py</a>, <a>Clip Studio Paint</a></td></tr>' +
  '<tr><td>Languages</td><td><a>English</a></td></tr></table></html>'

test('R-359: itch.io addresses are recognised by their author subdomain', () => {
  assert.equal(sourceForUrl('https://abiding-bridge.itch.io/imperial-grace'), 'itch')
  assert.equal(sourceForUrl('https://itch.io/games/top-rated'), 'web')
})

test('R-359: an itch.io game reads data.json and its page, and names the same game on VNDB', async () => {
  const seen: { url: string; body?: string }[] = []
  const result = await metadata(
    'https://Abiding-Bridge.itch.io/Imperial-Grace/',
    network(
      {
        'https://abiding-bridge.itch.io/imperial-grace/data.json': data,
        'https://abiding-bridge.itch.io/imperial-grace': page,
        'https://api.vndb.org/kana/release': {
          results: [{ id: 'r1', vns: [{ id: 'v31588', title: 'Imperial Grace' }] }],
        },
        'https://img.itch.zone/cover.png': tinyPng,
      },
      seen
    )
  )
  const value = (key: string) => result.preview.values.find((v) => v.key === key)?.value
  assert.equal(result.preview.provider, 'itch')
  assert.equal(result.preview.title, 'Imperial & Grace')
  assert.equal(value('SOURCE_URL'), 'https://abiding-bridge.itch.io/imperial-grace')
  assert.equal(value('ITCH_ID'), '1234')
  assert.deepEqual(value('AUTHORS'), ['Abiding Bridge', 'Synstoria'])
  assert.deepEqual(value('TAGS'), ['otome', 'visual-novel'])
  assert.equal(value('PRICE'), '$17.91')
  assert.deepEqual(value('GENRES'), ['Visual Novel'])
  assert.deepEqual(value('PLATFORMS'), ['Windows', 'macOS'])
  assert.equal(value('RELEASE_STATUS'), 'Released')
  assert.deepEqual(value('MADE_WITH'), ["Ren'Py", 'Clip Studio Paint'])
  assert.deepEqual(value('LANGUAGES'), ['English'])
  assert.equal(value('RELEASE_DATE'), '2026-11-11')
  assert.equal(value('DESCRIPTION'), 'Play as the Empress.')
  assert.equal(value('RATING'), 4.8)
  assert.equal(value('RATING_COUNT'), 727)
  assert.equal(result.cover?.mime, 'image/png')
  // The same game on VNDB is offered, not merged: no VNDB values in this preview.
  assert.deepEqual(result.preview.related, {
    provider: 'vndb',
    url: 'https://vndb.org/v31588',
    title: 'Imperial Grace',
  })
  const lookup = seen.find((request) => request.url === 'https://api.vndb.org/kana/release')
  assert.deepEqual(JSON.parse(lookup!.body!).filters, [
    'extlink',
    '=',
    ['itch', 'abiding-bridge/imperial-grace'],
  ])
})

test('R-359: without the page or VNDB the preview still comes from data.json', async () => {
  const result = await metadata(
    'https://someone.itch.io/game',
    network({
      'https://someone.itch.io/game/data.json': {
        ...data,
        cover_image: 'https://elsewhere.example/cover.png',
        links: { self: 'https://evil.example/game' },
      },
      'https://someone.itch.io/game': 500,
      'https://api.vndb.org/kana/release': 500,
    })
  )
  const keys = result.preview.values.map((v) => v.key)
  assert.ok(keys.includes('AUTHORS') && !keys.includes('GENRES'))
  assert.equal(result.preview.related, undefined)
  // A link or cover off itch.io is not followed.
  assert.equal(result.preview.source, 'https://someone.itch.io/game')
  assert.ok(keys.includes('COVER_STATUS'))
})

test('R-359: an account page or a missing game is not a game', async () => {
  await assert.rejects(metadata('https://someone.itch.io/', network({})), /完整作品網址/)
  await assert.rejects(metadata('https://someone.itch.io/gone', network({})))
})
