import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { Explorer, type DesktopOperations } from '../electron/explorer'
import { SearchIndex } from '../electron/search-index'
import { ehMetadata } from '../electron/metadata'
import { parseQuery } from '../shared/query'
import { parseSubtitles } from '../shared/subtitles'
import { DATA_DIR, validateProject, type Attribute } from '../shared/model'
import { exists, readFolder } from '../electron/files'
async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'explorer-')),
    media = path.join(root, 'media'),
    local = path.join(root, 'local')
  await fs.mkdir(media)
  const lib = new Library(local, undefined, false)
  await lib.init()
  let chosen: string | undefined
  const executed: { file: string; args: string[] }[] = []
  const desktop: DesktopOperations = {
    choose: async () => chosen,
    open: async (file) => {
      executed.push({ file, args: [] })
    },
    launch: async (file, args) => {
      executed.push({ file, args })
    },
    thumbnail: async () => Buffer.from('thumbnail'),
  }
  const explorer = new Explorer(lib, local, desktop)
  t.after(async () => {
    explorer.index.close()
    const target = await fs.realpath(root)
    if (!target.startsWith(base + path.sep)) throw new Error('Unsafe cleanup')
    await fs.rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  return {
    root,
    media,
    local,
    lib,
    explorer,
    executed,
    choose: (file: string) => {
      chosen = file
    },
  }
}
test('game candidate boundaries protect Unity/RPGMaker/Unreal/Godot and readonly expansion', async (t) => {
  const { media, lib, explorer } = await fixture(t)
  const markers: Record<string, string[]> = {
    Unity: ['Game.exe', 'UnityPlayer.dll', 'Game_Data/inner/file.bin'],
    Godot: ['Game.exe', 'Game.pck', 'data/inner/file.bin'],
    RPG: ['Game.exe', 'www/js/rmmz_core.js', 'www/data/file.bin'],
    Unreal: ['Game.exe', 'Engine/base.bin', 'Binaries/Win64/Game.exe', 'Content/Paks/game.pak'],
  }
  for (const [name, files] of Object.entries(markers))
    for (const rel of files) {
      const file = path.join(media, name, rel)
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, 'ORIGINAL')
    }
  let snapshot = await lib.create(media, {
    name: 'Games',
    depth: { mode: 'through', level: 5 },
  })
  assert.equal(snapshot.rows.length, 5)
  for (const name of Object.keys(markers)) {
    const row = snapshot.rows.find((r) => r.name === name)!
    assert.ok(row.boundary)
    for (const rel of markers[name]) {
      assert.equal(await fs.readFile(path.join(media, name, rel), 'utf8'), 'ORIGINAL')
      assert.equal(
        await exists(path.join(path.dirname(path.join(media, name, rel)), DATA_DIR)),
        path.dirname(rel) === '.'
      )
    }
  }
  const row = snapshot.rows.find((r) => r.name === 'Unity')!
  await explorer.request({
    action: 'boundary',
    rowId: row.rowId,
    revision: row.record!.revision,
    state: 'root',
    traverse: true,
  })
  snapshot = lib.snapshot()
  assert.ok(snapshot.rows.some((r) => r.name === 'inner' && r.readonly))
  assert.equal(await exists(path.join(media, 'Unity', 'Game_Data', DATA_DIR)), false)
  const p = snapshot.projects[0].project!
  snapshot = await lib.saveProject({ ...p, depth: { mode: 'exact', level: 5 } })
  assert.equal(snapshot.rows.length, 0)
  assert.ok(snapshot.structure?.some((r) => r.name === 'Unity' && r.structural))
  assert.ok(snapshot.problems.some((p) => p.includes('未達顯示深度')))
})
test('typed attributes, explicit private override, stale revision and partial batch failure preserve values', async (t) => {
  const { media, lib, explorer } = await fixture(t)
  await fs.mkdir(path.join(media, 'A'))
  await fs.mkdir(path.join(media, 'B'))
  let s = await lib.create(media, {
      name: 'Project',
      depth: { mode: 'through', level: 2 },
    }),
    p = s.projects[0].project!
  s = await lib.saveProject({
    ...p,
    fieldBindings: [
      ...p.fieldBindings,
      { alias: 'tag', attributeId: 'tags', type: 'tags' },
      { alias: 'score', attributeId: 'score', type: 'number' },
      { alias: 'date', attributeId: 'date', type: 'datetime' },
    ],
  })
  let a = s.rows.find((r) => r.name === 'A')!,
    b = s.rows.find((r) => r.name === 'B')!
  const attrs: Attribute[] = [
    { attributeId: 'tags', key: 'tag', type: 'tags', value: ['中文', 'game'], source: 'manual' },
    { attributeId: 'score', key: 'score', type: 'number', value: 4.5, source: 'manual' },
    { attributeId: 'date', key: 'date', type: 'datetime', value: '2025-10-12', source: 'manual' },
  ]
  await explorer.request({
    action: 'attributes',
    rowId: a.rowId,
    revision: a.record!.revision,
    values: attrs,
    private: false,
  })
  a = lib.snapshot().rows.find((r) => r.rowId === a.rowId)!
  await assert.rejects(
    explorer.request({
      action: 'attributes',
      rowId: a.rowId,
      revision: a.record!.revision - 1,
      values: attrs,
      private: false,
    }),
    /版本衝突/
  )
  await explorer.request({
    action: 'attributes',
    rowId: a.rowId,
    revision: a.record!.revision,
    values: [{ ...attrs[0], value: ['private'] }],
    private: true,
  })
  a = lib.snapshot().rows.find((r) => r.rowId === a.rowId)!
  assert.deepEqual(a.record!.attributes.find((a) => a.attributeId === 'tags')!.value, [
    '中文',
    'game',
  ])
  assert.deepEqual(a.record!.projectOverrides[a.projectId][0].value, ['private'])
  await assert.rejects(
    explorer.request({
      action: 'attributes',
      rowId: a.rowId,
      revision: a.record!.revision,
      values: [{ ...attrs[1], value: 'bad' }],
      private: false,
    }),
    /型別/
  )
  const result = await explorer.request({
    action: 'batch',
    rows: [
      { rowId: a.rowId, revision: a.record!.revision },
      { rowId: b.rowId, revision: 0 },
    ],
    attributeId: 'tags',
    value: ['new'],
    mode: 'add',
  })
  assert.equal(result.notice?.level, 'warning')
  assert.match(result.notice!.message, /批次保存 1 筆/)
  assert.match(result.notice!.message, /失敗/)
  assert.deepEqual(
    (await readFolder(a.path)).attributes.find((a) => a.attributeId === 'tags')!.value,
    ['中文', 'game', 'new']
  )
  assert.equal((await readFolder(b.path)).attributes.length, 0)
  const beforeFailure = await Promise.all([readFolder(a.path), readFolder(b.path)])
  const failed = await explorer.request({
    action: 'batch',
    rows: [
      { rowId: a.rowId, revision: 0 },
      { rowId: b.rowId, revision: 0 },
    ],
    attributeId: 'tags',
    value: ['keep'],
    mode: 'replace',
  })
  assert.equal(failed.notice?.level, 'error')
  assert.deepEqual(await Promise.all([readFolder(a.path), readFolder(b.path)]), beforeFailure)
  const saved = await explorer.request({
    action: 'batch',
    rows: [
      { rowId: a.rowId, revision: beforeFailure[0].revision },
      { rowId: b.rowId, revision: beforeFailure[1].revision },
    ],
    attributeId: 'tags',
    value: ['saved'],
    mode: 'replace',
  })
  assert.equal(saved.notice?.level, 'success')
  assert.deepEqual(
    (await readFolder(b.path)).attributes.find((a) => a.attributeId === 'tags')!.value,
    ['saved']
  )
  assert.equal((await explorer.request({ action: 'rebuildIndex' })).notice?.level, 'success')
})
test('SQLite supports Unicode substrings, comma AND, quotes, exclusion, OR, date normalization and ambiguity', async (t) => {
  const { media, lib, explorer } = await fixture(t)
  await fs.mkdir(path.join(media, '中文 game 甲'))
  await fs.mkdir(path.join(media, 'other'))
  let s = await lib.create(media, {
      name: 'P',
      depth: { mode: 'through', level: 2 },
    }),
    p = s.projects[0].project!
  s = await lib.saveProject({
    ...p,
    fieldBindings: [
      ...p.fieldBindings,
      { alias: 'tag', attributeId: 'tags', type: 'tags' },
      { alias: 'date', attributeId: 'date', type: 'datetime' },
    ],
  })
  const row = s.rows.find((r) => r.name.includes('甲'))!
  await explorer.request({
    action: 'attributes',
    rowId: row.rowId,
    revision: row.record!.revision,
    private: false,
    values: [
      { attributeId: 'tags', key: 'tag', type: 'tags', value: ['中文', 'game'], source: 'manual' },
      { attributeId: 'date', key: 'date', type: 'datetime', value: '2025-10-12', source: 'manual' },
    ],
  })
  for (const query of [
    '甲',
    '中文',
    'name:"中文 game" tag:中文,game',
    'date:20251012',
    'tag:missing ~ tag:game',
    'tag:game -name:other',
  ])
    assert.equal(
      (await explorer.request({ action: 'search', query, projectId: p.projectId })).search!.total,
      1,
      query
    )
  assert.equal(
    (await explorer.request({ action: 'search', query: 'tag:game -中文' })).search!.total,
    0
  )
  assert.throws(() => parseQuery('name:"unfinished'), /引號/)
  assert.throws(() => parseQuery('a ~'), /缺少/)
  let p2 = (
    await lib.create(media, {
      name: 'P2',
      depth: { mode: 'through', level: 2 },
    })
  ).projects.at(-1)!.project!
  await lib.saveProject({
    ...p2,
    fieldBindings: [
      ...p2.fieldBindings,
      { alias: 'tag', attributeId: 'other-tags', type: 'string' },
    ],
  })
  await assert.rejects(explorer.request({ action: 'search', query: 'tag:game' }), /多個身分/)
  assert.equal(
    (await explorer.request({ action: 'search', query: 'tag@tags:game' })).search!.total,
    2
  )
  const seen = new Set<string>()
  for (let offset = 0; offset < 6; offset += 2) {
    const page = (await explorer.request({ action: 'search', query: '', offset, limit: 2 })).search!
    for (const hit of page.hits) {
      assert.ok(!seen.has(hit.rowId))
      seen.add(hit.rowId)
    }
  }
  assert.equal(seen.size, 6)
  const rebuilt = new SearchIndex(path.join(path.dirname(explorer.index.file), 'rebuilt.sqlite'))
  try {
    rebuilt.sync(lib.snapshot())
    assert.equal(rebuilt.search('tag@tags:game').total, 2)
  } finally {
    rebuilt.close()
  }
})
test('searching a field also looks in the fallback fields its cells list, and nothing else', async (t) => {
  const { media, lib, explorer } = await fixture(t)
  for (const name of ['A', 'B', 'C']) await fs.mkdir(path.join(media, name))
  let s = await lib.create(media, {
      name: 'Names',
      depth: { mode: 'through', level: 2 },
    }),
    p = s.projects[0].project!
  const style = { textColor: '#ffffff', backgroundColor: 'transparent' }
  const cells = [
    {
      cellId: 'title',
      kind: 'field-text' as const,
      attributeId: 'title',
      fallbackIds: ['steam', 'dlsite'],
      grid: { x: 0, y: 0, w: 12, h: 1 },
      style,
    },
  ]
  s = await lib.saveProject({
    ...p,
    fieldBindings: [
      ...p.fieldBindings,
      { alias: 'title', attributeId: 'title', type: 'string' },
      { alias: 'steam', attributeId: 'steam', type: 'string' },
      { alias: 'dlsite', attributeId: 'dlsite', type: 'string' },
      { alias: 'other', attributeId: 'other', type: 'string' },
    ],
    cells,
    layoutPresets: undefined,
    activeLayoutId: undefined,
    contentCells: undefined,
  })
  const values: Record<string, [string, string]> = {
    A: ['title', 'manual-name'],
    B: ['steam', 'steam-name'],
    C: ['other', 'outside-name'],
  }
  for (const [name, [attributeId, value]] of Object.entries(values)) {
    const row = s.rows.find((r) => r.name === name)!
    await explorer.request({
      action: 'attributes',
      rowId: row.rowId,
      revision: row.record!.revision,
      private: false,
      values: [{ attributeId, key: attributeId, type: 'string', value, source: 'manual' }],
    })
  }
  const total = async (query: string) =>
    (await explorer.request({ action: 'search', query, projectId: p.projectId })).search!.total
  assert.equal(await total('title:manual-name'), 1)
  assert.equal(await total('title:steam-name'), 1, 'found through the fallback field')
  assert.equal(await total('title:outside-name'), 0, 'a field outside the chain is not included')
  assert.equal(await total('steam:manual-name'), 0, 'the chain only widens the first field')
  assert.equal(await total('steam:steam-name'), 1)
})
test('a field group is searched by its name and any member finds the folder (R-226)', async (t) => {
  const { media, lib, explorer } = await fixture(t)
  for (const name of ['A', 'B', 'C']) await fs.mkdir(path.join(media, name))
  let s = await lib.create(media, { name: 'Groups', depth: { mode: 'through', level: 2 } }),
    p = s.projects[0].project!
  s = await lib.saveProject({
    ...p,
    fieldBindings: [
      ...p.fieldBindings,
      { alias: 'steam', attributeId: 'steam', type: 'number' },
      { alias: 'dlsite', attributeId: 'dlsite', type: 'number' },
      { alias: 'other', attributeId: 'other', type: 'number' },
    ],
    fieldGroups: [{ groupId: 'score', name: 'Score', memberIds: ['steam', 'dlsite'] }],
  })
  const values: Record<string, [string, number]> = {
    A: ['steam', 3],
    B: ['dlsite', 8],
    C: ['other', 9],
  }
  for (const [name, [attributeId, value]] of Object.entries(values)) {
    const row = s.rows.find((r) => r.name === name)!
    await explorer.request({
      action: 'attributes',
      rowId: row.rowId,
      revision: row.record!.revision,
      private: false,
      values: [{ attributeId, key: attributeId, type: 'number', value, source: 'manual' }],
    })
  }
  const total = async (query: string) =>
    (await explorer.request({ action: 'search', query, projectId: p.projectId })).search!.total
  assert.equal(await total('score:8'), 1, 'a member value is found by the group name')
  assert.equal(await total('score:>2'), 2, 'comparisons look at every member')
  assert.equal(await total('score:9'), 0, 'fields outside the group are not included')
  assert.equal(await total('steam:8'), 0, 'a member alone searches only itself')
})
test('search sync detects same-revision values, private overrides, aliases, paths and source changes', async (t) => {
  const { lib, media, explorer } = await fixture(t)
  const snapshot = await lib.create(media, {
    name: 'Search sync',
    depth: { mode: 'through', level: 1 },
  })
  const project = snapshot.projects[0].project!,
    row = snapshot.rows[0],
    record = row.record!,
    index = explorer.index
  project.fieldBindings = [{ alias: 'title', attributeId: 'title', type: 'string' }]
  record.attributes = [
    {
      attributeId: 'title',
      key: 'title',
      type: 'string',
      value: 'Shared original',
      source: 'manual',
    },
  ]
  index.sync(snapshot)
  const original = index.search('title:original')
  index.sync(snapshot)
  assert.deepEqual(index.search('title:original'), original)

  record.projectOverrides[project.projectId] = [
    { ...record.attributes[0], value: 'Private edition' },
  ]
  index.sync(snapshot)
  assert.equal(index.search('title:private').total, 1)
  assert.equal(index.search('title:original').total, 0)
  record.attributes[0].value = 'Shared updated'
  index.sync(snapshot)
  assert.equal(index.search('title:updated').total, 0, 'private value still wins')
  project.fieldBindings[0].alias = 'caption'
  index.sync(snapshot)
  assert.throws(() => index.search('title:private'), /找不到欄位/)
  assert.deepEqual(index.search('caption:private').hits[0].matched, ['caption'])
  delete record.projectOverrides[project.projectId]
  index.sync(snapshot)
  assert.equal(index.search('caption:updated').total, 1)

  row.name = 'Renamed folder'
  row.path = path.join(media, 'relocated')
  index.sync(snapshot)
  assert.equal(index.search('name:renamed path:relocated').total, 1)
  assert.equal(index.search('name:media').total, 0)
  const other = structuredClone(snapshot.projects[0])
  other.projectId = 'other-project'
  other.project!.projectId = other.projectId
  snapshot.projects.push(other)
  row.projectId = other.projectId
  index.sync(snapshot)
  assert.equal(index.search('', project.projectId).total, 0)
  assert.equal(index.search('', other.projectId).total, 1)
  snapshot.rows = []
  index.sync(snapshot)
  assert.equal(index.search('').total, 0)
  snapshot.rows = [row]
  index.sync(snapshot, true)
  assert.equal(index.search('caption:updated').total, 1)
  assert.equal(record.revision, 1, 'same-revision edits must not leave stale results')
})

test('range streaming, traversal rejection, subtitle import/cleanup and safe launch argument arrays', async (t) => {
  const { root, media, lib, explorer, choose, executed } = await fixture(t)
  await fs.writeFile(path.join(media, 'clip.mp4'), Buffer.from('0123456789'))
  await fs.writeFile(path.join(root, 'external.srt'), '1\n00:00:00,000 --> 00:00:01,500\nhello\n')
  let s = await lib.create(media, {
      name: 'P',
      depth: { mode: 'through', level: 1 },
    }),
    row = s.rows[0]
  const contents = await explorer.content(row.rowId),
    video = contents.entries.find((e) => e.name === 'clip.mp4')!
  let response = await explorer.stream(
    row.rowId,
    video.id,
    new Request(video.url, { headers: { Range: 'bytes=2-5' } })
  )
  assert.equal(response.status, 206)
  assert.equal(response.headers.get('content-range'), 'bytes 2-5/10')
  assert.equal(await response.text(), '2345')
  response = await explorer.stream(
    row.rowId,
    video.id,
    new Request(video.url, { headers: { Range: 'bytes=-3' } })
  )
  assert.equal(await response.text(), '789')
  assert.equal(
    (
      await explorer.stream(
        row.rowId,
        video.id,
        new Request(video.url, { headers: { Range: 'bytes=100-' } })
      )
    ).status,
    416
  )
  assert.equal(
    (await explorer.stream(row.rowId, '../external.srt', new Request(video.url))).status,
    404
  )
  const external = await explorer.droppedSubtitle(row.rowId, path.join(root, 'external.srt'))
  const imported = await explorer.request({
    action: 'subtitle',
    rowId: row.rowId,
    externalToken: external.subtitle!.token,
    import: true,
  })
  assert.ok(imported.subtitle!.portable)
  row = lib.snapshot().rows[0]
  assert.equal(row.record!.details!.subtitles!.length, 1)
  const p = lib.snapshot().projects[0].project!
  await lib.saveProject({
    ...p,
    actionTemplates: [{ id: 'launch', label: 'Start', kind: 'exe', color: '#123456' }],
  })
  await fs.writeFile(path.join(media, 'test.exe'), 'controlled fake, never executed')
  choose(path.join(media, 'test.exe'))
  row = lib.snapshot().rows[0]
  await explorer.request({
    action: 'bindTarget',
    rowId: row.rowId,
    revision: row.record!.revision,
    templateId: 'launch',
    args: ['with spaces', '"quoted"', '$(literal)'],
  })
  assert.equal(executed.length, 0)
  await explorer.request({ action: 'runTarget', rowId: row.rowId, templateId: 'launch' })
  assert.deepEqual(executed[0].args, ['with spaces', '"quoted"', '$(literal)'])
  assert.equal(executed[0].file, path.join(media, 'test.exe'))
  const plan = await lib.previewCleanup(row.rowId, 'folder')
  assert.ok(plan.paths.some((p) => p.endsWith('.srt')))
  await lib.cleanup(plan.token, false)
  assert.equal(
    await fs.readFile(path.join(root, 'external.srt'), 'utf8'),
    '1\n00:00:00,000 --> 00:00:01,500\nhello\n'
  )
  assert.equal(await fs.readFile(path.join(media, 'clip.mp4'), 'utf8'), '0123456789')
})
test('E-Hentai public API validates host/identity, namespaces and portable preview import', async (t) => {
  const { media, lib, explorer } = await fixture(t)
  await lib.create(media, {
    name: 'P',
    depth: { mode: 'through', level: 1 },
  })
  const payload = {
    gmetadata: [
      {
        gid: 123,
        token: 'abcdef0123',
        title: 'Example &amp; sample',
        title_jpn: '例',
        tags: ['language:chinese', 'other:test'],
        category: 'Manga',
        uploader: 'u',
        posted: '1700000000',
        filecount: '12',
        thumb: 'https://ehgt.org/example.jpg',
      },
    ],
  }
  const requests: string[] = []
  const mock = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    requests.push(url)
    if (url.includes('api.php')) {
      assert.equal(init?.method, 'POST')
      assert.deepEqual(JSON.parse(String(init?.body)).gidlist, [[123, 'abcdef0123']])
      return new Response(JSON.stringify(payload))
    }
    return new Response(Buffer.from([255, 216, 255, 0]))
  }) as typeof fetch
  await assert.rejects(
    ehMetadata('https://e-hentai.org.evil.test/g/123/abcdef0123/', mock),
    /只接受/
  )
  assert.equal(requests.length, 0)
  const preview = await ehMetadata('https://e-hentai.org/g/123/abcdef0123/', mock)
  assert.equal(preview.preview.title, 'Example & sample')
  assert.deepEqual(preview.preview.values.find((v) => v.key === 'TAGS')!.value, [
    'language:chinese',
    'other:test',
  ])
  assert.ok(preview.cover)
  const original = globalThis.fetch
  globalThis.fetch = mock
  try {
    const candidate = await explorer.request({
        action: 'metadataPreview',
        source: 'https://e-hentai.org/g/123/abcdef0123/',
      }),
      row = lib.snapshot().rows[0]
    await explorer.request({
      action: 'metadataApply',
      rowId: row.rowId,
      revision: row.record!.revision,
      token: candidate.preview!.token,
      keys: ['TITLE', 'TAGS'],
      image: true,
    })
    const record = await readFolder(media)
    assert.equal(
      record.attributes.find((a) => a.attributeId === 'eh-title')!.value,
      'Example & sample'
    )
    assert.equal(record.assets.length, 1)
    assert.equal(
      record.attributes.some((a) => a.key === 'GALLERY_CATEGORY'),
      false
    )
    // The sister site shares the same fields: ExHentai adds the namespace field and may replace E-Hentai's tags.
    const exh = await explorer.request({
        action: 'metadataPreview',
        source: 'https://exhentai.org/g/123/abcdef0123/',
      }),
      next = lib.snapshot().rows[0]
    await explorer.request({
      action: 'metadataApply',
      rowId: next.rowId,
      revision: next.record!.revision,
      token: exh.preview!.token,
      keys: ['TAGS', 'LANGUAGE'],
      image: false,
      mode: 'replace',
    })
    const shared = await readFolder(media)
    assert.deepEqual(shared.attributes.find((a) => a.attributeId === 'eh-language')!.value, [
      'chinese',
    ])
    assert.equal(shared.attributes.filter((a) => a.attributeId === 'eh-tags').length, 1)
    assert.equal(
      shared.attributes.some((a) => a.attributeId.startsWith('exh-')),
      false
    )
  } finally {
    globalThis.fetch = original
  }
})
test('subtitle parser is time based and malformed sources fail without inventing cues', () => {
  assert.deepEqual(parseSubtitles('\uFEFFWEBVTT\n\n00:00.000 --> 00:01.200\n<b>safe</b>\n'), [
    { start: 0, end: 1.2, text: 'safe' },
  ])
  assert.equal(parseSubtitles('1\n01:00:00,500 --> 01:00:01,500\nline\n')[0].start, 3600.5)
  assert.throws(() => parseSubtitles('invalid'), /找不到/)
  assert.throws(() => parseSubtitles('00:02.000 --> 00:01.000\nbad'), /結束/)
  assert.deepEqual(parseQuery('"field:label":a\\,b "-literal"'), [
    [
      { key: 'field:label', value: 'a,b', exclude: false },
      { key: undefined, value: '-literal', exclude: false },
    ],
  ])
})

test('1000-row SQLite warm substring benchmark includes one-character Chinese queries', async (t) => {
  const { lib, media, explorer } = await fixture(t)
  const s = await lib.create(media, {
      name: 'P',
      depth: { mode: 'through', level: 1 },
    }),
    base = s.rows[0]
  s.rows = Array.from({ length: 1000 }, (_, i) => ({
    ...base,
    rowId: 'row' + i,
    path: path.join(media, String(i)),
    name: `遊戲 ${String(i).padStart(4, '0')}`,
    record: {
      ...base.record!,
      folderId: 'folder' + i,
      attributes: [
        {
          attributeId: 'tags',
          key: 'tag',
          type: 'tags',
          value: ['中文', 'game'],
          source: 'manual',
        },
      ],
    },
  }))
  explorer.index.sync(s)
  const samples: number[] = [],
    queries = ['遊', '000', 'name:"遊戲"', 'tag:中文,game', '-name:999', 'path:media']
  for (let i = 0; i < 30; i++) {
    const start = performance.now()
    explorer.index.search(queries[i % queries.length], undefined, 0, 100)
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  const p95 = samples[Math.floor(samples.length * 0.95)]
  console.log(`SQLite 1,000-row warm p95 ${p95.toFixed(2)}ms (main query only, 30 samples)`)
  assert.ok(p95 < 200, `p95 ${p95}ms`)
})

test('multiple optional image CELL slots remain independent and survive portable relink; failed writes roll back assets', async (t) => {
  const { root, media, lib, explorer } = await fixture(t)
  let snapshot = await lib.create(media, {
    name: 'Images',
    depth: { mode: 'through', level: 1 },
  })
  let p = snapshot.projects[0].project!
  const base = p.cells[0],
    one = {
      ...base,
      cellId: 'image-one',
      attributeId: 'slot-one',
      kind: 'image' as const,
      grid: { x: 0, y: 4, w: 6, h: 3 },
    },
    two = {
      ...base,
      cellId: 'image-two',
      attributeId: 'slot-two',
      kind: 'image' as const,
      grid: { x: 6, y: 4, w: 6, h: 3 },
    },
    divider = {
      ...base,
      cellId: 'divider',
      kind: 'divider' as const,
      grid: { x: 0, y: 7, w: 12, h: 1 },
    }
  p = { ...p, cells: [...p.cells, one, two, divider] }
  validateProject(p)
  snapshot = await lib.saveProject(p)
  let row = snapshot.rows[0]
  assert.equal(row.record!.assets.length, 0)
  const file = path.join(root, 'one.png')
  await fs.writeFile(
    file,
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
      'base64'
    )
  )
  snapshot = await lib.addImage(row.rowId, row.record!.revision, file, 'image-one')
  row = snapshot.rows[0]
  const first = row.record!.details!.cellImages!['slot-one']
  assert.ok(first)
  assert.equal(row.record!.details!.cellImages!['slot-two'], undefined)
  snapshot = await lib.addImage(row.rowId, row.record!.revision, file, 'image-two')
  row = snapshot.rows[0]
  const second = row.record!.details!.cellImages!['slot-two']
  assert.ok(second)
  assert.notEqual(first, second)
  assert.equal(row.record!.details!.cellImages!['slot-one'], first)
  await explorer.request({
    action: 'cellImage',
    rowId: row.rowId,
    revision: row.record!.revision,
    cellId: 'image-two',
    assetId: first,
  })
  row = lib.snapshot().rows[0]
  assert.equal(row.record!.details!.cellImages!['slot-two'], first)
  const { folderFile } = await import('../electron/files'),
    before = await fs.readFile(folderFile(media), 'utf8')
  await assert.rejects(
    explorer.request({
      action: 'cellImage',
      rowId: row.rowId,
      revision: row.record!.revision,
      cellId: 'missing',
      assetId: first,
    })
  )
  await assert.rejects(lib.addImage(row.rowId, row.record!.revision, file, 'missing'))
  await assert.rejects(
    explorer.request({
      action: 'cellImage',
      rowId: row.rowId,
      revision: row.record!.revision,
      cellId: 'image-one',
      assetId: 'missing',
    })
  )
  assert.equal(await fs.readFile(folderFile(media), 'utf8'), before)
  const reopened = new Library(path.join(root, 'relinked'), undefined, false)
  await reopened.init()
  const restored = await reopened.link(media)
  assert.equal(restored.rows[0].record!.details!.cellImages!['slot-one'], first)
  assert.equal(restored.projects[0].project!.cells.filter((c) => c.kind === 'image').length, 2)
  const assetDir = path.join(media, DATA_DIR, 'assets'),
    names = await fs.readdir(assetDir)
  await fs.unlink(folderFile(media) + '.bak')
  await fs.mkdir(folderFile(media) + '.bak')
  await assert.rejects(lib.addImage(row.rowId, row.record!.revision, file, 'image-one'))
  assert.deepEqual(await fs.readdir(assetDir), names)
  assert.equal(await fs.readFile(folderFile(media), 'utf8'), before)
  assert.equal((await readFolder(media)).assets.length, 2)
})

test('Steam import is namespaced, preserves manual values and rejects a source conflict without writes', async (t) => {
  const { media, lib, explorer } = await fixture(t)
  await lib.create(media, {
    name: 'Steam',
    depth: { mode: 'through', level: 1 },
  })
  const payload = {
    '620': {
      success: true,
      data: {
        steam_appid: 620,
        name: 'Portal 2',
        type: 'game',
        short_description: 'Description',
        developers: ['Valve'],
        release_date: { date: '18 Apr, 2011' },
      },
    },
  }
  const original = globalThis.fetch
  globalThis.fetch = (async () => new Response(JSON.stringify(payload))) as typeof fetch
  try {
    let row = lib.snapshot().rows[0]
    const result = await explorer.request({ action: 'metadataPreview', source: '620' }),
      preview = result.preview!
    await explorer.request({
      action: 'metadataApply',
      rowId: row.rowId,
      revision: row.record!.revision,
      token: preview.token,
      keys: ['TITLE', 'STORE_RELEASE_DATE'],
      image: false,
    })
    row = lib.snapshot().rows[0]
    assert.equal(
      row.record!.attributes.find((a) => a.attributeId === 'steam-title')!.value,
      'Portal 2'
    )
    assert.equal(
      row.record!.attributes.find((a) => a.attributeId === 'steam-store_release_date')!.value,
      '18 Apr, 2011'
    )
    await explorer.request({
      action: 'attributes',
      rowId: row.rowId,
      revision: row.record!.revision,
      values: [
        {
          attributeId: 'steam-title',
          key: 'TITLE',
          type: 'string',
          value: 'Manual',
          source: 'manual',
        },
      ],
      private: false,
    })
    row = lib.snapshot().rows[0]
    const { folderFile } = await import('../electron/files'),
      before = await fs.readFile(folderFile(media), 'utf8')
    await assert.rejects(
      explorer.request({
        action: 'metadataApply',
        rowId: row.rowId,
        revision: row.record!.revision,
        token: preview.token,
        keys: ['TITLE'],
        image: false,
      }),
      /來源衝突/
    )
    assert.equal(await fs.readFile(folderFile(media), 'utf8'), before)
  } finally {
    globalThis.fetch = original
  }
})

test('paged contents show an ordered first batch, remain row-bound and recheck changed paths', async (t) => {
  const { root, media, lib, explorer } = await fixture(t)
  for (let start = 0; start < 450; start += 30)
    await Promise.all(
      Array.from({ length: Math.min(30, 450 - start) }, (_, index) =>
        fs.writeFile(path.join(media, `Image ${start + index + 1}.jpg`), 'IMAGE')
      )
    )
  const state = await lib.create(media, {
      name: 'Many',
      depth: { mode: 'through', level: 1 },
    }),
    row = state.rows[0],
    first = await explorer.content(row.rowId, 96)
  assert.equal(first.entries.length, 96)
  assert.equal(first.total, 450)
  assert.equal(first.entries[0].name, 'Image 1.jpg')
  assert.equal(first.entries.at(-1)!.name, 'Image 96.jpg')
  assert.ok(first.nextCursor)
  await assert.rejects(explorer.content(row.rowId, 0), /分批/)
  await assert.rejects(explorer.content(row.rowId, 501), /分批/)
  const other = await lib.create(media, {
      name: 'Other',
      depth: { mode: 'through', level: 1 },
    }),
    otherId = other.rows.find((r) => r.projectId !== row.projectId)!.rowId
  await assert.rejects(explorer.content(otherId, 96, first.nextCursor), /已失效/)
  const outside = path.join(root, 'outside')
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, 'secret.txt'), 'KEEP')
  await fs.unlink(path.join(media, 'Image 100.jpg'))
  await fs.symlink(
    outside,
    path.join(media, 'Image 100.jpg'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  let cursor: string | undefined = first.nextCursor
  const all = [...first.entries],
    notices: string[] = []
  while (cursor) {
    const chunk = await explorer.content(row.rowId, 128, cursor)
    all.push(...chunk.entries)
    notices.push(...chunk.notices)
    cursor = chunk.nextCursor
  }
  assert.equal(all.length, 449)
  assert.equal(new Set(all.map((entry) => entry.id)).size, 449)
  assert.ok(notices.some((message) => message.includes('Image 100.jpg')))
  assert.equal(await fs.readFile(path.join(outside, 'secret.txt'), 'utf8'), 'KEEP')
  assert.equal(all.at(-1)!.name, 'Image 450.jpg')
})
test('the n-th image of a folder is chosen by natural file order, direct files only', async (t) => {
  const { media, lib, explorer } = await fixture(t)
  for (const name of ['10.jpg', '2.jpg', '1.png', 'notes.txt'])
    await fs.writeFile(path.join(media, name), 'IMAGE')
  await fs.mkdir(path.join(media, 'sub'))
  await fs.writeFile(path.join(media, 'sub', '0.jpg'), 'IMAGE')
  const state = await lib.create(media, {
      name: 'Nth',
      depth: { mode: 'through', level: 1 },
    }),
    row = state.rows[0],
    desktop = (explorer as any).desktop as DesktopOperations
  // A valid JPEG frame around the file name, so the response shows which file was chosen.
  desktop.thumbnail = async (file) =>
    Buffer.concat([
      Buffer.from([255, 216]),
      Buffer.from(path.basename(file)),
      Buffer.from([255, 217]),
    ])
  const request = new Request('media://nth/x/1')
  const nth = async (index: number) => {
    const response = await explorer.nthImage(row.rowId, index, request)
    return response.status === 200 ? (await response.text()).slice(2, -2) : response.status
  }
  assert.equal(await nth(1), '1.png')
  assert.equal(await nth(2), '2.jpg')
  assert.equal(await nth(3), '10.jpg')
  assert.equal(await nth(4), 404, 'text files and sub-folder images do not count')
  for (const bad of [0, -1, 1.5, 1000, NaN]) assert.equal(await nth(bad), 404, String(bad))
})
test('warm thumbnails bypass cold work; cancelled queued work is skipped and shared requests decode once', async (t) => {
  const { media, lib, explorer } = await fixture(t),
    jpeg = Buffer.from([255, 216, 255, 0, 255, 217])
  for (const name of ['warm.jpg', 'slow.jpg', 'cancel.jpg', 'shared.jpg'])
    await fs.writeFile(path.join(media, name), 'IMAGE')
  const state = await lib.create(media, {
      name: 'Thumbnails',
      depth: { mode: 'through', level: 1 },
    }),
    row = state.rows[0],
    content = await explorer.content(row.rowId)
  const calls: string[] = [],
    desktop = (explorer as any).desktop as DesktopOperations
  let release!: () => void, started!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve)),
    active = new Promise<void>((resolve) => (started = resolve))
  desktop.thumbnail = async (file) => {
    const name = path.basename(file)
    calls.push(name)
    if (name === 'slow.jpg') {
      started()
      await gate
    }
    return jpeg
  }
  const stream = (name: string, signal?: AbortSignal) => {
    const entry = content.entries.find((entry) => entry.name === name)!
    return explorer.stream(row.rowId, entry.id, new Request(entry.thumb!, { signal }), true)
  }
  assert.equal((await stream('warm.jpg')).status, 200)
  const slow = stream('slow.jpg')
  await active
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const warm = await Promise.race([
      stream('warm.jpg'),
      new Promise<never>(
        (_, reject) =>
          (timeout = setTimeout(
            () => reject(new Error('warm thumbnail blocked behind decoder')),
            1000
          ))
      ),
    ])
    assert.equal(warm.status, 200)
    assert.match(warm.headers.get('Cache-Control')!, /immutable/)
    assert.deepEqual(Buffer.from(await warm.arrayBuffer()), jpeg)
  } finally {
    clearTimeout(timeout)
  }
  const controller = new AbortController(),
    cancel = stream('cancel.jpg', controller.signal),
    shared1 = stream('shared.jpg'),
    shared2 = stream('shared.jpg')
  await new Promise((resolve) => setTimeout(resolve, 30))
  controller.abort()
  release()
  const results = await Promise.all([slow, cancel, shared1, shared2])
  assert.equal(results[1].status, 404)
  assert.equal(calls.includes('cancel.jpg'), false)
  assert.equal(calls.filter((name) => name === 'shared.jpg').length, 1)
  assert.equal(calls.filter((name) => name === 'warm.jpg').length, 1)
})
