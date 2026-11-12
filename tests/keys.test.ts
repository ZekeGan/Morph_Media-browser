import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { KeyStore, type KeyCipher } from '../electron/keys'
import { metadata } from '../electron/metadata'
import { Library } from '../electron/library'
import { Explorer } from '../electron/explorer'
import { KEY_MAYBE_NSFW, KEY_MISSING, KEY_REJECTED, keySites } from '../shared/keys'

const base = path.resolve('.test-output')
// A stand-in for the operating system's encryption: reversible, but never the plain text.
const cipher: KeyCipher = {
  available: () => true,
  encrypt: (text) => Buffer.from('enc:' + [...text].reverse().join('')),
  decrypt: (data) => [...data.toString().slice(4)].reverse().join(''),
}
type Reply = string | object | { status: number; body?: unknown }
const fake = (replies: Record<string, Reply>, seen: { url: string; init?: RequestInit }[] = []) =>
  (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    seen.push({ url, init })
    const reply = replies[decodeURI(url)] ?? replies[url]
    if (reply === undefined) return new Response('', { status: 404 })
    if (typeof reply === 'object' && 'status' in reply)
      return new Response(JSON.stringify(reply.body ?? {}), {
        status: (reply as { status: number }).status,
      })
    return new Response(typeof reply === 'string' ? reply : JSON.stringify(reply))
  }) as typeof fetch
const keysOf = (values: Record<string, Record<string, string>>) => ({
  keyFor: async (site: string) => values[site],
})

test('keys are stored encrypted on this computer and the window only learns whether they are set', async (t) => {
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'keys-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const store = new KeyStore(root, cipher)
  await store.set('tmdb', { token: '  secret-token  ' })
  await store.set('tvdb', { apiKey: 'k' })
  assert.deepEqual(await store.status(), { tmdb: { set: true }, tvdb: { set: true } })
  assert.equal((await fs.readFile(store.file, 'utf8')).includes('secret-token'), false)
  assert.deepEqual(await new KeyStore(root, cipher).get('tmdb'), { token: 'secret-token' })
  await store.mark('tmdb', 'ok')
  assert.deepEqual((await store.status()).tmdb, { set: true, test: 'ok' })
  await assert.rejects(store.set('tmdb', { token: '' }), /未填/)
  await assert.rejects(store.set('tmdb', { token: 'a\nb' }), /格式/)
  await assert.rejects(store.set('nope', { token: 'x' }), /沒有這個網站/)
  await assert.rejects(
    new KeyStore(root, { ...cipher, available: () => false }).set('tmdb', { token: 'x' }),
    /加密/
  )
  await store.clear('tmdb')
  assert.equal(await store.get('tmdb'), undefined)
  // Every key site has fields, steps and a test page the sources know.
  for (const site of keySites) {
    assert.ok(site.fields.length && site.steps && site.sample, site.id)
    assert.ok((await import('../shared/sources')).sourceForUrl(site.sample) === site.id, site.id)
  }
})

test('keyed sources: missing keys stop before any request, keys travel the way each site wants them', async () => {
  const never = (async () => {
    throw new Error('MUST NOT FETCH')
  }) as typeof fetch
  await assert.rejects(
    metadata('https://www.themoviedb.org/movie/603', never, undefined, keysOf({})),
    (e) => String(e).includes(KEY_MISSING)
  )
  // TMDB: a Read Access Token is a bearer header; an API key goes in the query.
  const seen: { url: string; init?: RequestInit }[] = []
  const movie = { id: 603, title: 'The Matrix', poster_path: '/p.jpg' }
  await metadata(
    'https://www.themoviedb.org/movie/603-the-matrix',
    fake({ 'https://api.themoviedb.org/3/movie/603?language=en-US': movie }, seen),
    undefined,
    keysOf({ tmdb: { token: 'eyJabc' } })
  )
  assert.equal(new Headers(seen[0].init?.headers).get('Authorization'), 'Bearer eyJabc')
  const viaKey = await metadata(
    'https://www.themoviedb.org/movie/603',
    fake({ 'https://api.themoviedb.org/3/movie/603?language=en-US&api_key=k1': movie }),
    undefined,
    keysOf({ tmdb: { token: 'k1' } })
  )
  assert.equal(viaKey.preview.title, 'The Matrix')
  // A refused key says so.
  await assert.rejects(
    metadata(
      'https://www.themoviedb.org/movie/603',
      fake({
        'https://api.themoviedb.org/3/movie/603?language=en-US&api_key=bad': { status: 401 },
      }),
      undefined,
      keysOf({ tmdb: { token: 'bad' } })
    ),
    (e) => String(e).includes(KEY_REJECTED)
  )
  // MyAnimeList: the client ID header.
  const malSeen: { url: string; init?: RequestInit }[] = []
  await metadata(
    'https://myanimelist.net/anime/1/Cowboy_Bebop',
    fake(
      {
        'https://api.myanimelist.net/v2/anime/1?fields=title,alternative_titles,start_date,synopsis,genres,num_episodes,studios,main_picture,media_type,status':
          { id: 1, title: 'Cowboy Bebop' },
      },
      malSeen
    ),
    undefined,
    keysOf({ mal: { clientId: 'cid' } })
  )
  assert.equal(new Headers(malSeen[0].init?.headers).get('X-MAL-CLIENT-ID'), 'cid')
  // OMDb through an IMDb address.
  const omdb = await metadata(
    'https://www.imdb.com/title/tt0133093/',
    fake({
      'https://www.omdbapi.com/?i=tt0133093&plot=full&apikey=o': {
        Response: 'True',
        imdbID: 'tt0133093',
        Title: 'The Matrix',
        Genre: 'Action, Sci-Fi',
        Poster: 'N/A',
      },
    }),
    undefined,
    keysOf({ omdb: { apiKey: 'o' } })
  )
  assert.deepEqual(omdb.preview.values.find((v) => v.key === 'GENRES')?.value, ['Action', 'Sci-Fi'])
  // IGDB: Twitch token first, then a query-language POST; the token is reused.
  const igdbSeen: { url: string; init?: RequestInit }[] = []
  const igdbReplies = {
    'https://id.twitch.tv/oauth2/token': {
      access_token: 'tok',
      expires_in: 5000000,
    },
    'https://api.igdb.com/v4/games': [
      { slug: 'portal-2', name: 'Portal 2', cover: { image_id: 'abc' } },
    ],
  }
  for (let i = 0; i < 2; i++)
    await metadata(
      'https://www.igdb.com/games/portal-2',
      fake(igdbReplies, igdbSeen),
      undefined,
      keysOf({ igdb: { clientId: 'c', clientSecret: 's' } })
    )
  const tokenRequest = igdbSeen.filter((r) => r.url.includes('twitch'))
  assert.equal(tokenRequest.length, 1)
  assert.equal(tokenRequest[0].url.includes('secret'), false, 'the secret is not in the address')
  assert.match(String(tokenRequest[0].init?.body), /client_secret=s/)
  const query = igdbSeen.find((r) => r.url.includes('igdb.com'))!
  assert.match(String(query.init?.body), /where slug = "portal-2"/)
  assert.equal(new Headers(query.init?.headers).get('Authorization'), 'Bearer tok')
  // TheTVDB: log in with key and PIN, then look the slug up.
  const tvdb = await metadata(
    'https://www.thetvdb.com/series/cowboy-bebop',
    fake({
      'https://api4.thetvdb.com/v4/login': { data: { token: 't' } },
      'https://api4.thetvdb.com/v4/series/slug/cowboy-bebop': { data: { id: 76885 } },
      'https://api4.thetvdb.com/v4/series/76885/extended?short=true': {
        data: { id: 76885, name: 'Cowboy Bebop' },
      },
    }),
    undefined,
    keysOf({ tvdb: { apiKey: 'k', pin: 'p' } })
  )
  assert.equal(tvdb.preview.title, 'Cowboy Bebop')
  // AniDB: its fixed plain-HTTP API origin only, and each anime asked once.
  const anidbSeen: { url: string; init?: RequestInit }[] = []
  const xml =
    '<anime id="1"><titles><title type="main">Seikai</title></titles><episodecount>13</episodecount></anime>'
  for (let i = 0; i < 2; i++)
    await metadata(
      'https://anidb.net/anime/1',
      fake(
        {
          'http://api.anidb.net:9001/httpapi?request=anime&protover=1&client=morph&clientver=1&aid=1':
            xml,
        },
        anidbSeen
      ),
      undefined,
      keysOf({ anidb: { client: 'morph', clientver: '1' } })
    )
  assert.equal(anidbSeen.length, 1)
  // FANZA: the content ID from the address.
  const fanza = await metadata(
    'https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_123456/',
    fake({
      'https://api.dmm.com/affiliate/v3/ItemList?output=json&hits=1&site=FANZA&cid=d_123456&api_id=a&affiliate_id=b-990':
        {
          result: {
            status: 200,
            items: [
              { content_id: 'd_123456', title: 'Work', iteminfo: { genre: [{ name: 'G' }] } },
            ],
          },
        },
    }),
    undefined,
    keysOf({ fanza: { apiId: 'a', affiliateId: 'b-990' } })
  )
  assert.equal(fanza.preview.title, 'Work')
})

test('optional keys: Bangumi without a token explains a 404, with one it sends it', async () => {
  await assert.rejects(metadata('https://bgm.tv/subject/1', fake({}), undefined, keysOf({})), (e) =>
    String(e).includes(KEY_MAYBE_NSFW)
  )
  const seen: { url: string; init?: RequestInit }[] = []
  await metadata(
    'https://bgm.tv/subject/1',
    fake({ 'https://api.bgm.tv/v0/subjects/1': { id: 1, name: 'N' } }, seen),
    undefined,
    keysOf({ bangumi: { token: 'bt' } })
  )
  assert.equal(new Headers(seen[0].init?.headers).get('Authorization'), 'Bearer bt')
})

test('the key test passes when the site accepts the key and fails when it refuses it', async (t) => {
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'keys-test-'))
  const library = new Library(path.join(root, 'local'), undefined, false)
  await library.init()
  const keyStore = new KeyStore(path.join(root, 'local'), cipher)
  const explorer = new Explorer(library, library.userData, {
    choose: async () => undefined,
    open: async () => {},
    launch: async () => {},
    thumbnail: async () => Buffer.alloc(0),
    keyStore,
  })
  const original = globalThis.fetch
  t.after(async () => {
    globalThis.fetch = original
    explorer.index.close()
    await fs.rm(root, { recursive: true, force: true })
  })
  await explorer.request({ action: 'setKey', site: 'rawg', values: { apiKey: 'good' } })
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    String(input).includes('key=good')
      ? new Response('{"detail":"Not found."}', { status: 404 })
      : new Response('{}', { status: 401 })) as typeof fetch
  assert.deepEqual((await explorer.request({ action: 'testKey', site: 'rawg' })).keys?.rawg, {
    set: true,
    test: 'ok',
  })
  await explorer.request({ action: 'setKey', site: 'rawg', values: { apiKey: 'bad' } })
  assert.deepEqual((await explorer.request({ action: 'testKey', site: 'rawg' })).keys?.rawg, {
    set: true,
    test: 'failed',
  })
  // Status never carries the key itself.
  assert.equal(
    JSON.stringify(await explorer.request({ action: 'keyStatus' })).includes('bad'),
    false
  )
})
