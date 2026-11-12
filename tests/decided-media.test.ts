import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { Explorer } from '../electron/explorer'
import { archiveIndex, archiveImage } from '../electron/archive'
import { metadata } from '../electron/metadata'
import { metadataSources } from '../shared/sources'
import { stabilizeQuery, restoreQuery, queryText, parseQuery } from '../shared/query'
import { readFolder, folderFile } from '../electron/files'
import { writeSettingsFile } from '../electron/settings-file'
import { exportSettings } from '../electron/settings-package'
import { defaultWorkspace } from '../shared/workspace'
import { zipFixture, tinyPng } from './support/archive-fixture'

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'decided-media-')),
    media = path.join(root, 'media')
  await fs.mkdir(media)
  const lib = new Library(path.join(root, 'local'), undefined, false)
  await lib.init()
  const explorer = new Explorer(lib, lib.userData, {
    choose: async () => undefined,
    open: async () => {},
    launch: async () => {},
    thumbnail: async () => tinyPng,
  })
  t.after(async () => {
    explorer.index.close()
    assert.ok((await fs.realpath(root)).startsWith(base + path.sep))
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  return { root, media, lib, explorer }
}
test('public metadata adapters use no credentials, retain source identities and reject hostile sources', async () => {
  const uuid = '12345678-1234-1234-1234-123456789abc'
  const cases: [string, string, unknown][] = [
    [
      'bangumi',
      'https://bgm.tv/subject/12',
      {
        id: 12,
        name: 'Original',
        name_cn: 'Title',
        summary: '<b>About</b>',
        date: '2025-01-01',
        tags: [{ name: 'tag' }],
      },
    ],
    [
      'anilist',
      'https://anilist.co/anime/12/',
      {
        data: {
          Media: {
            id: 12,
            title: { native: 'Title' },
            genres: ['Genre'],
            startDate: { year: 2025, month: 1, day: 2 },
          },
        },
      },
    ],
    [
      'vndb',
      'https://vndb.org/v12',
      {
        results: [
          { id: 'v12', title: 'Title', released: '2025-01-01', developers: [{ name: 'Maker' }] },
        ],
      },
    ],
    [
      'musicbrainz',
      'https://musicbrainz.org/release/' + uuid,
      {
        id: uuid,
        title: 'Title',
        'artist-credit': [{ name: 'Artist' }],
        media: [{ tracks: [{ title: 'Track' }] }],
      },
    ],
    [
      'openlibrary',
      'https://openlibrary.org/works/OL12W',
      { key: '/works/OL12W', title: 'Title', subjects: ['Tag'] },
    ],
    [
      'pixiv',
      'https://www.pixiv.net/artworks/12',
      {
        error: false,
        body: { id: '12', title: 'Title', userName: 'Artist', tags: { tags: [{ tag: 'Tag' }] } },
      },
    ],
    [
      'commons',
      'https://commons.wikimedia.org/wiki/File:Test.jpg',
      {
        query: {
          pages: [
            {
              pageid: 12,
              title: 'File:Test.jpg',
              imageinfo: [
                {
                  extmetadata: {
                    ObjectName: { value: 'Title' },
                    LicenseShortName: { value: 'CC0' },
                  },
                },
              ],
            },
          ],
        },
      },
    ],
    [
      'dlsite',
      'https://www.dlsite.com/maniax/work/=/product_id/RJ123456.html',
      // R-296: product.json has the names; info/ajax adds sales figures.
      (url: string) =>
        url.includes('/api/=/product.json')
          ? [
              {
                workno: 'RJ123456',
                work_name: 'Title',
                maker_id: 'RG1',
                maker_name: 'Circle',
                work_type: 'ADV',
                work_type_string: 'Adventure',
                regist_date: '2025-01-02 00:00:00',
                age_category: 3,
                creaters: { created_by: [{ name: 'Writer' }], voice_by: [{ name: 'Voice' }] },
                genres: [{ name: 'Genre' }],
              },
            ]
          : { RJ123456: { price: 1100, dl_count: 5, rate_average_2dp: 4.5 } },
    ],
    [
      'hitomi',
      'https://hitomi.la/galleries/12.html',
      'var galleryinfo = ' +
        JSON.stringify({ id: 12, title: 'Title', files: [{}], artists: [{ artist: 'Artist' }] }) +
        ';',
    ],
  ]
  for (const [provider, url, body] of cases) {
    const requests: string[] = []
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push(String(input))
      assert.equal(init?.redirect, 'error')
      const headers = new Headers(init?.headers)
      assert.equal(headers.has('Authorization'), false)
      assert.equal(headers.has('Cookie'), false)
      const reply = typeof body === 'function' ? body(String(input)) : body
      return new Response(typeof reply === 'string' ? reply : JSON.stringify(reply))
    }) as typeof fetch
    const result = await metadata(url, fetcher)
    assert.equal(result.preview.provider, provider)
    assert.equal(result.preview.title, 'Title')
    assert.ok(result.preview.values.some((value) => value.key === 'SOURCE_URL'))
    assert.equal(requests.length, provider === 'dlsite' ? 2 : 1)
    if (provider === 'dlsite') {
      const value = (key: string) => result.preview.values.find((v) => v.key === key)?.value
      assert.equal(value('MAKER_NAME'), 'Circle')
      assert.deepEqual(value('CREATED_BY'), ['Writer'])
      assert.deepEqual(value('VOICE_BY'), ['Voice'])
      assert.deepEqual(value('GENRES'), ['Genre'])
      assert.equal(value('DOWNLOAD_COUNT'), 5)
      // Without creators and without the optional sales endpoint the work still imports.
      const plain = await metadata(url, (async (input: RequestInfo | URL) =>
        String(input).includes('product.json')
          ? new Response(JSON.stringify([{ workno: 'RJ123456', work_name: 'Title' }]))
          : new Response('', { status: 500 })) as typeof fetch)
      assert.equal(plain.preview.title, 'Title')
      assert.equal(
        plain.preview.values.some((v) => v.key === 'CREATED_BY'),
        false
      )
    }
    if (provider === 'commons')
      assert.equal((await metadata(result.preview.source, fetcher)).preview.title, 'Title')
    await assert.rejects(
      metadata(url, (async () => new Response('{}', { status: 403 })) as typeof fetch)
    )
    await assert.rejects(
      metadata(
        url,
        (async () =>
          new Response('x', {
            headers: { 'content-length': String(3 * 1024 * 1024) },
          })) as typeof fetch
      ),
      /過大/
    )
  }
  for (const source of [
    'https://__proto__/subject/12',
    'https://constructor/subject/12',
    'https://bgm.tv.evil.test/subject/12',
    'http://vndb.org/v12',
    'https://user:pass@anilist.co/anime/12',
    'https://api.themoviedb.org/3/movie/12',
    'https://www.dlsite.com/evil/work/=/product_id/RJ123456.html',
    'https://www.dlsite.com/maniax/work/=/product_id/rj123456.html',
    'https://www.fanza.example/x',
  ])
    await assert.rejects(
      metadata(source, (async () => {
        throw new Error('MUST NOT FETCH')
      }) as typeof fetch),
      (error) => !String(error).includes('MUST NOT FETCH')
    )
  assert.equal(
    metadataSources.some((source) => ['tmdb', 'igdb'].includes(source.id)),
    false
  )
  await assert.rejects(
    metadata(
      'https://hitomi.la/reader/12.html',
      (async () =>
        new Response(
          'var galleryinfo={"id":12,"title":"Title"};globalThis.injected=true;'
        )) as typeof fetch
    ),
    /未執行/
  )
  // R-302: every site sends the app's own User-Agent, and a cover from another site's image host is refused.
  const agents: string[] = []
  const crossCover = await metadata('https://bgm.tv/subject/12', (async (
    input: RequestInfo | URL,
    init?: RequestInit
  ) => {
    agents.push(new Headers(init?.headers).get('User-Agent') ?? '')
    if (String(input).includes('pximg')) throw new Error('MUST NOT FETCH')
    return new Response(
      JSON.stringify({ id: 12, name: 'Title', images: { medium: 'https://i.pximg.net/a.jpg' } })
    )
  }) as typeof fetch)
  assert.equal(crossCover.cover, undefined)
  assert.match(agents[0], /^Morph\/\d+\.\d+\.\d+ \(M:orph;/)
  // R-297: Hitomi gallery data comes from its current data host, not the retired ltn.hitomi.la.
  const hitomiRequests: string[] = []
  await metadata('https://hitomi.la/reader/12.html', (async (input: RequestInfo | URL) => {
    hitomiRequests.push(String(input))
    return new Response('var galleryinfo = {"id":12,"title":"Title"};')
  }) as typeof fetch)
  assert.deepEqual(hitomiRequests, ['https://ltn.gold-usergeneratedcontent.net/galleries/12.js'])
  // R-300: a failed source says why: unreachable, no such work, needs access, or a changed format.
  const kinds: [string, typeof fetch, RegExp][] = [
    [
      'https://hitomi.la/reader/12.html',
      (async () => {
        throw new TypeError('fetch failed')
      }) as typeof fetch,
      /無法連線/,
    ],
    [
      'https://hitomi.la/reader/12.html',
      (async () => new Response('', { status: 404 })) as typeof fetch,
      /找不到這個作品/,
    ],
    [
      'https://www.pixiv.net/artworks/12',
      (async () => new Response('{}', { status: 403 })) as typeof fetch,
      /需要金鑰、登入或成人內容權限/,
    ],
    [
      'https://bgm.tv/subject/12',
      (async () => new Response('<html>moved</html>')) as typeof fetch,
      /格式已變更/,
    ],
    [
      'https://www.dlsite.com/maniax/work/=/product_id/RJ123456.html',
      (async () => new Response('[]')) as typeof fetch,
      /找不到這個作品/,
    ],
    [
      'https://e-hentai.org/g/12/0123456789/',
      (async () =>
        new Response('{"gmetadata":[{"gid":12,"error":"Key missing"}]}')) as typeof fetch,
      /找不到這個作品/,
    ],
  ]
  for (const [url, fetcher, expected] of kinds)
    await assert.rejects(metadata(url, fetcher), expected)
  const cover = await metadata(
    'https://bgm.tv/subject/12',
    (async () =>
      new Response(
        JSON.stringify({
          id: 12,
          name: 'Title',
          images: { medium: 'https://localhost/private.png' },
        })
      )) as typeof fetch
  )
  assert.equal(cover.cover, undefined)
  assert.ok(cover.preview.values.some((value) => value.key === 'COVER_STATUS'))
})
test('archive viewing supports stored and deflated images with readonly ranges and fails closed', async (t) => {
  const { root, media, lib, explorer } = await fixture(t),
    file = path.join(media, 'book.cbz'),
    bytes = zipFixture([
      { name: 'page10.png', bytes: tinyPng },
      { name: 'page2.png', bytes: tinyPng, method: 0 },
      { name: 'notes.txt', bytes: Buffer.from('unchanged') },
    ])
  await fs.writeFile(file, bytes)
  const snapshot = await lib.create(media, {
      name: 'Archive',
      depth: { mode: 'through', level: 1 },
    }),
    row = snapshot.rows[0],
    before = await readFolder(media)
  const content = await explorer.content(row.rowId),
    entry = content.entries.find((entry) => entry.kind === 'archive')!
  const result = await explorer.request({ action: 'archive', rowId: row.rowId, fileId: entry.id }),
    images = result.content!.entries
  assert.deepEqual(
    images.map((image) => image.name),
    ['page2.png', 'page10.png']
  )
  const parts = new URL(images[0].url).pathname.split('/').filter(Boolean)
  const streamed = await explorer.archiveStream(parts[0], parts[1], parts[2], parts[3])
  assert.equal(streamed.status, 200)
  assert.deepEqual(Buffer.from(await streamed.arrayBuffer()), tinyPng)
  assert.deepEqual(await fs.readFile(file), bytes)
  assert.deepEqual(await readFolder(media), before)
  assert.equal(
    (await fs.readdir(media)).some((name) => name.startsWith('page')),
    false
  )
  await fs.writeFile(file, Buffer.from('changed'))
  assert.equal((await explorer.archiveStream(parts[0], parts[1], parts[2], parts[3])).status, 404)
  for (const [index, entries] of [
    [{ name: '../outside.png', bytes: tinyPng }],
    [{ name: 'a.png', bytes: tinyPng, flags: 2049 }],
    [{ name: 'a.png', bytes: tinyPng, size: 65 * 1024 * 1024 }],
    [
      { name: 'a.png', bytes: tinyPng },
      { name: 'a.png', bytes: tinyPng },
    ],
    [{ name: 'a.png', bytes: tinyPng, method: 12 }],
  ].entries()) {
    const invalid = path.join(root, 'invalid' + index + '.zip')
    await fs.writeFile(invalid, zipFixture(entries))
    await assert.rejects(archiveIndex(invalid))
  }
  const corrupt = path.join(root, 'crc.zip')
  await fs.writeFile(corrupt, zipFixture([{ name: 'a.png', bytes: tinyPng, crc: 0 }]))
  const parsed = await archiveIndex(corrupt)
  await assert.rejects(archiveImage(corrupt, parsed, parsed.images[0]), /校驗/)
  const truncated = path.join(root, 'truncated.zip')
  await fs.writeFile(truncated, bytes.subarray(0, bytes.length - 5))
  await assert.rejects(archiveIndex(truncated))
})
test('file overview preserves source identity, pagination, boundaries and portable records', async (t) => {
  const { media, lib, explorer } = await fixture(t)
  for (const name of ['A', 'B', 'Unmanaged']) {
    await fs.mkdir(path.join(media, name))
    for (let i = 0; i < 5; i++)
      await fs.writeFile(path.join(media, name, 'same' + i + '.png'), tinyPng)
  }
  const snapshot = await lib.create(media, {
      name: 'Images',
      depth: { mode: 'through', level: 2 },
    }),
    root = snapshot.rows.find((row) => row.path === media)!,
    unmanaged = snapshot.rows.find((row) => row.name === 'Unmanaged')!
  const before = await Promise.all(
    snapshot.rows
      .filter((row) => row.rowId !== unmanaged.rowId)
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((row) => readFolder(row.path))
  )
  await fs.unlink(path.join(unmanaged.path, '.media-viewer', 'folder.json'))
  await lib.scan()
  let cursor: string | undefined
  const entries = []
  do {
    const response = await explorer.request({
      action: 'overview',
      rowId: root.rowId,
      scope: 'descendants',
      limit: 3,
      cursor,
    })
    entries.push(...response.overview!.entries)
    cursor = response.overview!.nextCursor
    if (cursor) await explorer.content(snapshot.rows.find((row) => row.name === 'A')!.rowId, 2)
  } while (cursor)
  assert.equal(entries.length, 10)
  assert.equal(new Set(entries.map((entry) => entry.rowId + '/' + entry.id)).size, 10)
  assert.equal(new Set(entries.map((entry) => entry.sourcePath)).size, 2)
  assert.equal(
    (await explorer.request({ action: 'overview', rowId: root.rowId, scope: 'current' })).overview!
      .entries.length,
    0
  )
  assert.deepEqual(
    await Promise.all(
      lib
        .snapshot()
        .rows.filter((row) => row.rowId !== unmanaged.rowId)
        .sort((a, b) => a.path.localeCompare(b.path))
        .map((row) => readFolder(row.path))
    ),
    before
  )
  await assert.rejects(fs.stat(path.join(unmanaged.path, '.media-viewer', 'folder.json')))
})
test('saved queries keep field identities through alias changes and support number and calendar comparisons', async (t) => {
  const { media, lib, explorer } = await fixture(t)
  let state = await lib.create(media, {
      name: 'Search',
      depth: { mode: 'through', level: 1 },
    }),
    project = state.projects[0].project!
  state = await lib.saveProject({
    ...project,
    fieldBindings: [
      { attributeId: 'score', alias: 'score', type: 'number' },
      { attributeId: 'day', alias: 'day', type: 'date' },
      { attributeId: 'flag', alias: 'flag', type: 'boolean' },
    ],
  })
  project = state.projects[0].project!
  let row = state.rows[0]
  await explorer.request({
    action: 'attributes',
    rowId: row.rowId,
    revision: row.record!.revision,
    private: false,
    values: [
      { attributeId: 'score', key: 'score', type: 'number', value: -2, source: 'manual' },
      { attributeId: 'day', key: 'day', type: 'date', value: '2024-02-29', source: 'manual' },
      { attributeId: 'flag', key: 'flag', type: 'boolean', value: false, source: 'manual' },
    ],
  })
  for (const query of ['score:>=-2', 'score:<0', 'day:>=20240229', 'flag:否', 'flag:no'])
    assert.equal((await explorer.request({ action: 'search', query })).search!.total, 1, query)
  for (const query of ['flag:yes', 'flag:是', 'score:>0', 'day:>2024-02-29'])
    assert.equal((await explorer.request({ action: 'search', query })).search!.total, 0, query)
  await assert.rejects(explorer.request({ action: 'search', query: 'day:>2023-02-29' }), /日期/)
  const stable = stabilizeQuery(
    'score:>=-2',
    project.fieldBindings.map((field) => ({
      key: field.alias,
      type: field.type,
      attributeId: field.attributeId,
      projectId: project.projectId,
    }))
  )
  await lib.saveProject({
    ...project,
    savedSearches: [{ id: 'legacy', name: 'saved', query: 'score:>=-2' }],
  })
  project = lib.snapshot().projects[0].project!
  await lib.saveProject({
    ...project,
    fieldBindings: project.fieldBindings.map((field) =>
      field.attributeId === 'score' ? { ...field, alias: 'rating' } : field
    ),
  })
  const renamed = lib.snapshot().projects[0].project!,
    ast = renamed.savedSearches![0].queryAst!
  assert.deepEqual(ast, stable)
  const search = (await explorer.request({ action: 'search', query: 'score:>=-2', queryAst: ast }))
    .search!
  assert.equal(search.total, 1)
  assert.match(search.resolvedQuery!, /rating/)
  assert.deepEqual(
    parseQuery(
      queryText(
        restoreQuery(
          ast,
          renamed.fieldBindings.map((field) => ({
            key: field.alias,
            type: field.type,
            attributeId: field.attributeId,
            projectId: project.projectId,
          }))
        )
      )
    ),
    parseQuery('rating:>=-2')
  )
  assert.equal(
    parseQuery(
      queryText(
        restoreQuery(ast, [
          { key: 'rating', type: 'number', attributeId: 'score', projectId: project.projectId },
          { key: 'rating', type: 'number', attributeId: 'other-score', projectId: 'foreign' },
        ])
      )
    )[0][0].key,
    'rating@score'
  )
  assert.throws(
    () =>
      restoreQuery(ast, [
        { key: 'rating', type: 'string', attributeId: 'score', projectId: project.projectId },
      ]),
    /型別/
  )
  row = lib.snapshot().rows[0]
  await explorer.request({
    action: 'attributes',
    rowId: row.rowId,
    revision: row.record!.revision,
    private: false,
    values: [{ attributeId: 'flag', key: 'flag', type: 'boolean', value: true, source: 'manual' }],
  })
  for (const query of ['flag:yes', 'flag:sí', 'flag:はい', 'flag:是'])
    assert.equal((await explorer.request({ action: 'search', query })).search!.total, 1, query)
})
test('settings export supports safe overwrite with a recoverable backup and refuses unrelated files', async (t) => {
  const { root } = await fixture(t),
    file = path.join(root, 'settings.json'),
    settings = exportSettings(defaultWorkspace())
  await writeSettingsFile(file, settings)
  const before = await fs.readFile(file)
  await writeSettingsFile(file, { ...settings, prefs: { ...settings.prefs, theme: 'paper' } })
  const backups = (await fs.readdir(root)).filter(
    (name) => name.startsWith('settings.json.') && name.endsWith('.bak')
  )
  assert.equal(backups.length, 1)
  assert.deepEqual(await fs.readFile(path.join(root, backups[0])), before)
  const unrelated = path.join(root, 'important.json')
  await fs.writeFile(unrelated, '{"data":"KEEP"}')
  await assert.rejects(writeSettingsFile(unrelated, settings))
  assert.equal(await fs.readFile(unrelated, 'utf8'), '{"data":"KEEP"}')
})
test('source preview and fill/replace protect manual edits, preserve provenance, and roll back covers on failure', async (t) => {
  const { media, lib, explorer } = await fixture(t),
    originalFetch = globalThis.fetch
  let title = 'First'
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    String(input).includes('lain.bgm.tv')
      ? new Response(tinyPng)
      : new Response(
          JSON.stringify({
            id: 12,
            name: title,
            images: { medium: 'https://lain.bgm.tv/cover.png' },
          })
        )) as typeof fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  const state = await lib.create(media, {
    name: 'Sources',
    depth: { mode: 'through', level: 1 },
  })
  await lib.saveProject({
    ...state.projects[0].project!,
    fieldBindings: [{ attributeId: 'title', alias: 'TITLE', type: 'string' }],
  })
  let row = lib.snapshot().rows[0]
  await explorer.request({
    action: 'attributes',
    rowId: row.rowId,
    revision: row.record!.revision,
    private: false,
    values: [
      { attributeId: 'title', key: 'TITLE', type: 'string', value: 'MANUAL', source: 'manual' },
    ],
  })
  const before = await fs.readFile(folderFile(media)),
    first = (
      await explorer.request({ action: 'metadataPreview', source: 'https://bgm.tv/subject/12' })
    ).preview!
  assert.deepEqual(await fs.readFile(folderFile(media)), before, 'preview must not write')
  const apply = async (token: string, mode: 'fill' | 'replace' = 'fill', image = false) => {
    row = lib.snapshot().rows[0]
    return explorer.request({
      action: 'metadataApply',
      rowId: row.rowId,
      revision: row.record!.revision,
      token,
      keys: ['TITLE'],
      image,
      mode,
    })
  }
  await apply(first.token, 'fill', true)
  title = 'Second'
  const second = (
    await explorer.request({ action: 'metadataPreview', source: 'https://bgm.tv/subject/12' })
  ).preview!
  await apply(second.token, 'fill', true)
  let record = await readFolder(media)
  assert.equal(
    record.attributes.find((value) => value.attributeId === 'bangumi-title')!.value,
    'First'
  )
  assert.equal(record.assets.length, 1)
  await apply(second.token, 'replace')
  record = await readFolder(media)
  assert.equal(record.attributes.find((value) => value.attributeId === 'title')!.value, 'MANUAL')
  assert.equal(
    record.attributes.find((value) => value.attributeId === 'bangumi-title')!.value,
    'Second'
  )
  assert.equal(
    record.attributes.find((value) => value.attributeId === 'bangumi-title')!.sourceRecord
      ?.provider,
    'bangumi'
  )
  // Block the backup destination to force a real persistence failure after cover creation.
  const backup = folderFile(media) + '.bak'
  await fs.unlink(backup)
  await fs.mkdir(backup)
  const unchanged = await fs.readFile(folderFile(media)),
    assets = await fs.readdir(path.join(media, '.media-viewer', 'assets'))
  await assert.rejects(apply(second.token, 'replace', true))
  assert.deepEqual(await fs.readFile(folderFile(media)), unchanged)
  assert.deepEqual(await fs.readdir(path.join(media, '.media-viewer', 'assets')), assets)
  await fs.rmdir(backup)
  row = lib.snapshot().rows[0]
  await explorer.request({
    action: 'attributes',
    rowId: row.rowId,
    revision: row.record!.revision,
    private: false,
    values: [
      {
        attributeId: 'bangumi-title',
        key: 'TITLE',
        type: 'string',
        value: 'EDITED',
        source: 'manual',
      },
    ],
  })
  await assert.rejects(apply(second.token, 'replace'), /來源衝突/)
  // Filling empty fields skips the hand-edited field instead of failing the whole import (R-246).
  await apply(second.token, 'fill')
  assert.equal(
    (await readFolder(media)).attributes.find((value) => value.attributeId === 'bangumi-title')!
      .value,
    'EDITED'
  )
  assert.equal(
    (await readFolder(media)).attributes.find((value) => value.attributeId === 'bangumi-title')!
      .sourceRecord,
    undefined
  )
})
