import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { Explorer, type DesktopOperations } from '../electron/explorer'
import { readFolder, saveFolder } from '../electron/files'
import { WorkspaceStore } from '../electron/workspace'
import { bundledSuggestions, engineSaveFolder, storeUrl } from '../electron/game-extras'
import { validateDetails } from '../shared/model'

const base = path.resolve('.test-output')
async function setup(
  t: { after: (fn: () => Promise<void>) => void },
  files: Record<string, string>
) {
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'game-extras-')),
    media = path.join(root, 'Game')
  for (const [name, body] of Object.entries(files)) {
    const file = path.join(media, name)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, body)
  }
  const library = new Library(path.join(root, 'local'), undefined, false)
  await library.init()
  const calls = {
    launch: [] as { file: string; args: string[]; timed: boolean }[],
    open: [] as string[],
    external: [] as string[],
    played: [] as { folderId: string; seconds: number }[],
  }
  let picks: (string | undefined)[] = [],
    steam = true,
    leproc: string | undefined
  const desktop: DesktopOperations = {
    choose: async () => picks.shift(),
    open: async (file) => {
      calls.open.push(file)
    },
    launch: async (file, args, onExit) => {
      calls.launch.push({ file, args, timed: !!onExit })
      onExit?.(1000, 3_601_000)
    },
    external: async (url) => {
      calls.external.push(url)
    },
    protocolReady: () => steam,
    localeEmulator: () => leproc,
    setLocaleEmulator: async (file) => {
      leproc = file
    },
    played: (folderId, started, ended) =>
      calls.played.push({ folderId, seconds: Math.round((ended - started) / 1000) }),
    thumbnail: async () => Buffer.alloc(0),
  }
  const explorer = new Explorer(library, library.userData, desktop)
  t.after(async () => {
    explorer.index.close()
    assert.ok((await fs.realpath(root)).startsWith(base + path.sep))
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  await library.create(media, { name: 'Games', depth: { mode: 'through', level: 1 } })
  const row = () => library.snapshot().rows.find((r) => r.path === media)!
  return {
    root,
    media,
    library,
    explorer,
    calls,
    row,
    pick: (...next: (string | undefined)[]) => (picks = next),
    setSteam: (value: boolean) => (steam = value),
  }
}

test('bundled tools and manuals are suggested, installers are not, and adding one binds a button (R-306)', async (t) => {
  const { explorer, row, calls, library, media } = await setup(t, {
    'Game.exe': 'x',
    'config.exe': 'x',
    '環境設定.exe': 'x',
    'unins000.exe': 'x',
    'vcredist_x64.exe': 'x',
    'manual.pdf': 'x',
    'readme.txt': 'x',
    'notes.txt': 'x',
  })
  assert.deepEqual((await bundledSuggestions(media)).map((s) => s.name).sort(), [
    'config.exe',
    'manual.pdf',
    'readme.txt',
    '環境設定.exe',
  ])
  const extras = (await explorer.request({ action: 'gameExtras', rowId: row().rowId })).extras!
  assert.equal(extras.suggestions.length, 4)
  await explorer.request({
    action: 'addSuggestion',
    rowId: row().rowId,
    revision: row().record!.revision,
    name: 'manual.pdf',
  })
  await explorer.request({
    action: 'addSuggestion',
    rowId: row().rowId,
    revision: row().record!.revision,
    name: 'config.exe',
  })
  await assert.rejects(
    explorer.request({
      action: 'addSuggestion',
      rowId: row().rowId,
      revision: row().record!.revision,
      name: 'unins000.exe',
    }),
    /建議清單/
  )
  const project = library.snapshot().projects[0].project!
  const manual = project.actionTemplates!.find((a) => a.label === '說明書')!,
    config = project.actionTemplates!.find((a) => a.label === '設定程式')!
  assert.equal(manual.kind, 'file')
  assert.equal(config.kind, 'exe')
  const targets = (await readFolder(media)).details!.targets!
  assert.deepEqual(targets[manual.id], {
    kind: 'file',
    path: 'manual.pdf',
    relative: true,
    args: [],
  })
  // Bound files leave the suggestion list; running the manual opens it, never launches it.
  const after = (await explorer.request({ action: 'gameExtras', rowId: row().rowId })).extras!
  assert.deepEqual(after.suggestions.map((s) => s.name).sort(), ['readme.txt', '環境設定.exe'])
  // A document action never opens a program or script: that would run it.
  assert.throws(() =>
    validateDetails({
      schemaVersion: 1,
      targets: { x: { kind: 'file', path: 'Game.exe', relative: true, args: [] } },
    })
  )
  for (const target of [
    { kind: 'file', path: 'help.chm', relative: true, args: [] },
    { kind: 'file', path: 'run.bat', relative: true, args: [] },
  ])
    assert.throws(() => validateDetails({ schemaVersion: 1, targets: { x: target } }))
  // A save folder outside the game must be a local drive path, never a network share.
  assert.throws(() =>
    validateDetails({ schemaVersion: 1, saveFolder: { path: '\\\\host\\share', relative: false } })
  )
  validateDetails({ schemaVersion: 1, saveFolder: { path: 'C:\\Saves', relative: false } })
  await explorer.request({ action: 'runTarget', rowId: row().rowId, templateId: manual.id })
  assert.deepEqual(calls.open, [path.join(media, 'manual.pdf')])
  assert.equal(calls.launch.length, 0)
})

test('Steam launch, store page and save folder come from the game and its record (R-305, R-307, R-310)', async (t) => {
  const { explorer, row, calls, media, setSteam, pick } = await setup(t, {
    'Game.exe': 'x',
    'steam_appid.txt': ' 620 \r\n',
    'www/save/file1.rpgsave': 'SAVE',
    'www/data/System.json': '{}',
    'www/js/rmmz_core.js': '//',
  })
  let extras = (await explorer.request({ action: 'gameExtras', rowId: row().rowId })).extras!
  assert.equal(extras.steamAppId, '620')
  assert.equal(extras.save, 'engine')
  assert.equal(extras.storeUrl, undefined)
  await explorer.request({ action: 'runExtra', rowId: row().rowId, extra: 'steam' })
  assert.deepEqual(calls.external, ['steam://run/620'])
  setSteam(false)
  await assert.rejects(
    explorer.request({ action: 'runExtra', rowId: row().rowId, extra: 'steam' }),
    /沒有安裝 Steam/
  )
  await explorer.request({ action: 'runExtra', rowId: row().rowId, extra: 'save' })
  assert.deepEqual(calls.open, [path.join(media, 'www', 'save')])
  // A store address saved by an import becomes the store button; plain http and other schemes are ignored.
  const record = await readFolder(media)
  record.attributes.push(
    {
      attributeId: 'vndb-source_url',
      key: 'SOURCE_URL',
      type: 'string',
      value: 'http://vndb.org/v17',
      source: 'vndb',
    },
    {
      attributeId: 'steam-store_url',
      key: 'STORE_URL',
      type: 'string',
      value: 'https://store.steampowered.com/app/620/',
      source: 'steam',
    }
  )
  await saveFolder(media, record, record.revision)
  await explorer.request({ action: 'visit', rowId: row().rowId })
  assert.equal(storeUrl(await readFolder(media)), 'https://store.steampowered.com/app/620/')
  // R-316: a catalogue page (VNDB) is not a store, so alone it gives no store button.
  assert.equal(
    storeUrl({ ...(await readFolder(media)), attributes: record.attributes.slice(0, 1) }),
    undefined
  )
  assert.equal(
    (await explorer.request({ action: 'gameExtras', rowId: row().rowId }))?.extras?.storeSite,
    'Steam'
  )
  await explorer.request({ action: 'runExtra', rowId: row().rowId, extra: 'store' })
  assert.equal(calls.external.at(-1), 'https://store.steampowered.com/app/620/')
  // A folder the user picks wins over the engine's guess and can be cleared again.
  const picked = path.join(media, 'www')
  pick(picked)
  await explorer.request({
    action: 'chooseSaveFolder',
    rowId: row().rowId,
    revision: (await readFolder(media)).revision,
  })
  extras = (await explorer.request({ action: 'gameExtras', rowId: row().rowId })).extras!
  assert.equal(extras.save, 'user')
  assert.deepEqual((await readFolder(media)).details!.saveFolder, { path: 'www', relative: true })
  await explorer.request({
    action: 'chooseSaveFolder',
    rowId: row().rowId,
    revision: (await readFolder(media)).revision,
    clear: true,
  })
  assert.equal((await readFolder(media)).details!.saveFolder, undefined)
})

test('Unity and Ren’Py save folders are worked out only from plain names and only when they exist', async (t) => {
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'game-saves-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const home = path.join(root, 'home'),
    unity = path.join(root, 'Unity'),
    renpy = path.join(root, 'RenPy')
  await fs.mkdir(path.join(unity, 'Game_Data'), { recursive: true })
  await fs.writeFile(path.join(unity, 'Game_Data', 'app.info'), 'Studio\nTitle')
  assert.equal(await engineSaveFolder(unity, ['Unity'], home), undefined, 'not created yet')
  await fs.mkdir(path.join(home, 'AppData', 'LocalLow', 'Studio', 'Title'), { recursive: true })
  assert.equal(
    await engineSaveFolder(unity, ['Unity'], home),
    path.join(home, 'AppData', 'LocalLow', 'Studio', 'Title')
  )
  await fs.writeFile(path.join(unity, 'Game_Data', 'app.info'), '..\\..\\Windows\nTitle')
  assert.equal(await engineSaveFolder(unity, ['Unity'], home), undefined, 'no path parts')
  await fs.mkdir(path.join(renpy, 'game'), { recursive: true })
  await fs.writeFile(
    path.join(renpy, 'game', 'options.rpy'),
    'define config.save_directory = "Title-1234"\n'
  )
  await fs.mkdir(path.join(home, 'AppData', 'Roaming', 'RenPy', 'Title-1234'), { recursive: true })
  assert.equal(
    await engineSaveFolder(renpy, ['Ren’Py'], home),
    path.join(home, 'AppData', 'Roaming', 'RenPy', 'Title-1234')
  )
})

test('Locale Emulator launches go through LEProc.exe and direct launches are timed (R-308, R-309)', async (t) => {
  const { explorer, row, calls, media, pick, root } = await setup(t, { 'Game.exe': 'x' })
  pick(path.join(media, 'Game.exe'))
  await explorer.request({
    action: 'bindTarget',
    rowId: row().rowId,
    revision: row().record!.revision,
    templateId: 'default-launch-game',
    args: ['-w'],
  })
  await explorer.request({
    action: 'runTarget',
    rowId: row().rowId,
    templateId: 'default-launch-game',
  })
  assert.deepEqual(calls.launch.at(-1), {
    file: path.join(media, 'Game.exe'),
    args: ['-w'],
    timed: true,
  })
  assert.deepEqual(calls.played, [{ folderId: row().record!.folderId, seconds: 3600 }])
  await explorer.request({
    action: 'targetLocale',
    rowId: row().rowId,
    revision: (await readFolder(media)).revision,
    templateId: 'default-launch-game',
    value: true,
  })
  await assert.rejects(
    explorer.request({
      action: 'runTarget',
      rowId: row().rowId,
      templateId: 'default-launch-game',
    }),
    /Locale Emulator/
  )
  const leproc = path.join(root, 'LE', 'LEProc.exe'),
    other = path.join(root, 'LE', 'Other.exe')
  await fs.mkdir(path.dirname(leproc), { recursive: true })
  await fs.writeFile(leproc, 'x')
  await fs.writeFile(other, 'x')
  pick(other)
  await assert.rejects(explorer.request({ action: 'chooseLocaleEmulator' }), /LEProc/)
  pick(leproc)
  await explorer.request({ action: 'chooseLocaleEmulator' })
  await explorer.request({
    action: 'runTarget',
    rowId: row().rowId,
    templateId: 'default-launch-game',
  })
  assert.deepEqual(calls.launch.at(-1), {
    file: await fs.realpath(leproc),
    args: ['-run', path.join(media, 'Game.exe'), '-w'],
    timed: false,
  })
  // R-319: the profiles made in Locale Emulator are listed from LEConfig.xml, and a chosen one runs with -runas.
  const guid = 'ec7ff5cc-a45c-4bbb-9e31-9a2d2a9d7f11'
  await fs.writeFile(
    path.join(root, 'LE', 'LEConfig.xml'),
    `<?xml version="1.0"?><LEConfig><Profiles><Profile Name="簡体中文 &amp; GBK" Guid="${guid.toUpperCase()}" MainMenu="false"><Location>zh-CN</Location></Profile><Profile Name="Bad" Guid="not-a-guid"/></Profiles></LEConfig>`
  )
  const listed = await explorer.request({ action: 'gameExtras', rowId: row().rowId })
  assert.deepEqual(listed.extras?.localeProfiles, [{ guid, name: '簡体中文 & GBK' }])
  const revision = (await readFolder(media)).revision
  await explorer.request({
    action: 'targetLocale',
    rowId: row().rowId,
    revision,
    templateId: 'default-launch-game',
    value: guid,
  })
  await explorer.request({
    action: 'runTarget',
    rowId: row().rowId,
    templateId: 'default-launch-game',
  })
  assert.deepEqual(calls.launch.at(-1)?.args, ['-runas', guid, path.join(media, 'Game.exe'), '-w'])
  // Only a GUID or true is ever stored, so nothing else can reach LEProc's arguments.
  const record = await readFolder(media)
  record.details!.targets!['default-launch-game'].localeEmulator = '--evil' as unknown as true
  assert.throws(() => validateDetails(record.details), /不合法/)
  // An older record with false (never written by M:orph, but valid before) still passes.
  record.details!.targets!['default-launch-game'].localeEmulator = false as unknown as true
  validateDetails(record.details)
})

test('play time is stored locally per folder and validated (R-308)', async (t) => {
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'game-playtime-'))
  t.after(() => fs.rm(root, { recursive: true, force: true, maxRetries: 5 }))
  const store = new WorkspaceStore(root)
  await store.init()
  const id = '12345678-1234-1234-1234-123456789abc'
  await store.recordPlay(id, 0, 500)
  await store.recordPlay(id, 0, 90_000)
  await store.recordPlay(id, 100_000, 160_000)
  const prefs = (await store.read([])).prefs
  assert.deepEqual(
    { total: prefs.playtime![id].total, count: prefs.playtime![id].count },
    { total: 150, count: 2 },
    'a session under a second is not counted'
  )
  assert.equal(prefs.playtime![id].last, new Date(160_000).toISOString())
  await store.recordPlay('../evil', 0, 10_000)
  assert.deepEqual(Object.keys((await store.read([])).prefs.playtime!), [id])
})
