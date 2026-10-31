import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { detectGame, GAME_PROBE_LIMITS } from '../electron/game-detection'
import { Library } from '../electron/library'
import { ensureFolder, exists, folderFile, readFolder, saveFolder } from '../electron/files'
import { DATA_DIR } from '../shared/model'
import { browserRows } from '../shared/browse'
const input = {
  name: 'Games',
  mediaCategory: 'game',
  depth: { mode: 'through' as const, level: 1 },
  scanAll: true,
}
async function fixture(t: { after: (callback: () => Promise<void>) => void }) {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'game-boundary-')),
    media = path.join(root, 'media')
  await fs.mkdir(media)
  t.after(async () => {
    const target = await fs.realpath(root)
    assert.ok(target.startsWith(base + path.sep))
    await fs.rm(target, { recursive: true, force: true })
  })
  const lib = new Library(path.join(root, 'local'), undefined, false)
  await lib.init()
  const files = async (dir: string, names: string[]) => {
    for (const name of names) {
      const target = path.join(dir, name)
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, 'ORIGINAL')
    }
  }
  return { root, media, lib, files }
}
const tyranoMarkers = (base: string) =>
  [
    'package.json',
    'index.html',
    'main.js',
    'tyrano/tyrano.js',
    'tyrano/plugins/kag/kag.js',
    'data/system/Config.tjs',
    'data/scenario/first.ks',
  ].map((file) => base + '/' + file)
const nwMarkers = ['nw.pak', 'chrome_elf.dll', 'icudtl.dat', 'locales/ja.pak']
const wolfMarkers = ['Data/BasicData/Game.dat', 'Data/BasicData/DataBase.dat']
// Include historical metadata and empty directories; only the ROOT's own record may change.
async function internalTree(dir: string, root = true): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (root && entry.name === DATA_DIR) continue
    assert.equal(entry.isSymbolicLink(), false)
    if (entry.isDirectory()) {
      result[entry.name + '/'] = 'directory'
      for (const [name, bytes] of Object.entries(
        await internalTree(path.join(dir, entry.name), false)
      ))
        result[entry.name + '/' + name] = bytes
    } else result[entry.name] = (await fs.readFile(path.join(dir, entry.name))).toString('base64')
  }
  return result
}
test('embedded and packaged NW.js deployments stay unknown; WOLF unpacked and mixed data stop at their own root', async (t) => {
  const { media, lib, files } = await fixture(t)
  const samples = [
    {
      name: '包裝/game',
      engine: undefined,
      names: ['Custom.exe', ...nwMarkers, 'assets/sound/file.bin'],
    },
    {
      name: 'ModernNW',
      engine: undefined,
      names: [
        'Renamed.exe',
        'Config.exe',
        'nw.dll',
        'nw_100_percent.pak',
        'package.nw',
        'assets/image/file.bin',
      ],
    },
    {
      name: 'PlainNW',
      engine: undefined,
      names: [
        'Tool.exe',
        ...nwMarkers,
        'package.nw/package.json',
        'package.nw/index.html',
        'assets/file.bin',
      ],
    },
    {
      name: 'LegacyNW',
      engine: undefined,
      names: ['Renamed.exe', 'nw.pak', 'icudt.dll', 'assets/file.bin'],
    },
    {
      name: 'WolfUnpacked',
      engine: 'WOLF RPG',
      names: ['Renamed.exe', ...wolfMarkers, 'Data/MapData/Map001.mps', 'AutoBackup2/old.bin'],
    },
    {
      name: 'WolfMixed',
      engine: 'WOLF RPG',
      names: [
        'GamePro.exe',
        'Config.exe',
        ...wolfMarkers,
        'Data/任意素材.wolf',
        'Data/別名.wolf',
        'AutoBackup2/old.bin',
      ],
    },
  ]
  const before = new Map<string, Record<string, string>>()
  for (const sample of samples) {
    const dir = path.join(media, sample.name)
    await files(dir, sample.names)
    // Existing internal records must remain byte-for-byte unchanged during scan and visit.
    await ensureFolder(path.join(dir, sample.engine ? 'AutoBackup2' : 'assets'), false)
    before.set(dir, await internalTree(dir))
    const detected = await detectGame(dir)
    assert.ok(detected, sample.name)
    assert.deepEqual(detected.engines, sample.engine ? [sample.engine] : [], sample.name)
  }
  assert.equal(await detectGame(media), undefined)
  assert.equal(await detectGame(path.join(media, '包裝')), undefined)
  let state = await lib.create(media, input)
  for (let pass = 0; pass < 2; pass++) {
    state = await lib.scan()
    for (const sample of samples) {
      const dir = path.join(media, sample.name),
        row = state.rows.find((row) => row.path === dir)!
      assert.equal(row.boundary?.state, 'candidate')
      assert.deepEqual(row.boundary.engines, sample.engine ? [sample.engine] : [])
      assert.equal(row.record?.schemaVersion, 1)
      state = await lib.visit(row.rowId)
      assert.equal(
        state.structure!.some((row) => row.path.startsWith(dir + path.sep)),
        false
      )
      assert.deepEqual(await internalTree(dir), before.get(dir))
    }
  }
  // Exact depth and explicitly enabled traversal still cannot initialize internals.
  const game = state.rows.find((row) => row.path === path.join(media, 'WolfMixed'))!,
    unknown = state.rows.find((row) => row.path === path.join(media, 'ModernNW'))!
  state = await lib.saveProject({
    ...state.projects[0].project!,
    scanAll: false,
    depth: { mode: 'exact', level: 7 },
    traversal: { [game.record!.folderId]: true, [unknown.record!.folderId]: true },
  })
  assert.ok(state.structure!.find((row) => row.path === game.path)?.boundary)
  assert.ok(state.structure!.some((row) => row.path.startsWith(game.path + path.sep)))
  for (const row of state.structure!.filter((row) => row.path.startsWith(game.path + path.sep)))
    assert.equal(row.readonly, true)
  for (const row of state.structure!.filter((row) =>
    row.path.startsWith(unknown.path + path.sep)
  )) {
    assert.equal(row.readonly, true)
    await assert.rejects(lib.checkedRow(row.rowId, true), /不可寫入/)
  }
  for (const [dir, tree] of before) assert.deepEqual(await internalTree(dir), tree)
})
test('NW.js and WOLF markers require coherent file types and paths, retaining engine conflicts', async (t) => {
  const { media, files } = await fixture(t)
  const negatives: Record<string, string[]> = {
    ExeOnly: ['Game.exe'],
    NWResourceOnly: ['Game.exe', 'nw.pak'],
    NWRuntimeOnly: ['Game.exe', 'nw.dll'],
    ChromiumOnly: ['Utility.exe', 'chrome_elf.dll', 'icudtl.dat', 'locales/ja.pak'],
    WolfArchiveOnly: ['Game.exe', 'Data/renamed.wolf'],
    WolfDataOnly: ['Game.exe', 'Data/file.bin'],
    WolfPartial: ['Game.exe', wolfMarkers[0]],
    WolfWithoutExe: wolfMarkers,
    SplitWolf: ['Game.exe', wolfMarkers[0], 'Other/BasicData/DataBase.dat'],
    SplitNW: ['Game.exe', 'A/nw.pak', 'B/chrome_elf.dll'],
  }
  for (const [name, names] of Object.entries(negatives)) {
    const dir = path.join(media, name)
    await files(dir, names)
    assert.equal(await detectGame(dir), undefined, name)
  }
  for (const [name, names, fake] of [
    ['FakeExe', nwMarkers, 'Game.exe'],
    ['FakeNW', ['Game.exe', 'chrome_elf.dll'], 'nw.pak'],
    ['FakeWolf', ['Game.exe', wolfMarkers[0]], wolfMarkers[1]],
  ] as [string, string[], string][]) {
    const dir = path.join(media, name)
    await files(dir, names)
    await fs.mkdir(path.join(dir, fake), { recursive: true })
    assert.equal(await detectGame(dir), undefined, name)
  }
  const conflict = path.join(media, 'Conflict')
  await files(conflict, [
    'Renamed.exe',
    ...nwMarkers,
    ...wolfMarkers,
    'www/js/rpg_core.js',
    'www/data/actors.json',
  ])
  assert.deepEqual((await detectGame(conflict))?.engines, ['RPG Maker MV', 'WOLF RPG'])
})
test('new runtime boundaries block stale shared writes and deep nested creation; manual corrections remain authoritative', async (t) => {
  const { media, lib, files } = await fixture(t),
    game = path.join(media, 'Runtime'),
    child = path.join(game, 'assets/a/b/c/d/e')
  await fs.mkdir(child, { recursive: true })
  let state = await lib.create(media, input),
    row = state.rows.find((row) => row.path === child)!,
    root = state.rows.find((row) => row.path === game)!
  const original = await fs.readFile(folderFile(child))
  await files(game, ['Renamed.exe', ...nwMarkers])
  await assert.rejects(lib.checkedRow(row.rowId, true), /邊界保護/)
  await assert.rejects(lib.saveValues(row.rowId, row.record!.revision, {}), /邊界保護/)
  await assert.rejects(lib.restore(row.rowId), /邊界保護/)
  await assert.rejects(lib.create(child, { ...input, name: 'Nested' }), /邊界保護/)
  assert.deepEqual(await fs.readFile(folderFile(child)), original)
  let record = await readFolder(game)
  record.details = {
    schemaVersion: 1,
    boundary: { state: 'root', engines: [], evidence: ['使用者指定 ROOT'] },
  }
  await saveFolder(game, record, record.revision)
  state = await lib.scan()
  root = state.rows.find((row) => row.path === game)!
  assert.equal(root.boundary?.state, 'root')
  assert.deepEqual(root.boundary.evidence, ['使用者指定 ROOT'])
  record = await readFolder(game)
  record.details!.boundary!.state = 'not-game'
  await saveFolder(game, record, record.revision)
  state = await lib.scan()
  assert.equal(state.rows.find((row) => row.path === game)!.boundary, undefined)
  row = state.rows.find((row) => row.path === child)!
  await lib.checkedRow(row.rowId, true)
  // No ancestor records exist here. A four-level probe cutoff would let this escape.
  const fresh = path.join(media, 'Fresh'),
    deep = path.join(fresh, 'assets/a/b/c/d/e')
  await files(fresh, ['Fresh.exe', ...nwMarkers, 'assets/a/b/c/d/e/file.bin'])
  await assert.rejects(lib.create(deep, { ...input, name: 'Deep nested' }), /邊界保護/)
  assert.equal(await exists(folderFile(deep)), false)
})
test('NW.js and WOLF marker links and probe failures stop branches; cancellation preserves all internals', async (t) => {
  const { root, media, lib, files } = await fixture(t),
    outside = path.join(root, 'outside')
  await files(outside, ['Game.dat', 'DataBase.dat', 'original.bin'])
  const outsideBefore = await internalTree(outside, false)
  const wolf = path.join(media, 'WolfLinked')
  await files(wolf, ['Game.exe'])
  await fs.mkdir(path.join(wolf, 'Data'))
  await fs.symlink(
    outside,
    path.join(wolf, 'Data/BasicData'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  const nw = path.join(media, 'NWLinked')
  await files(nw, ['Game.exe', 'chrome_elf.dll', 'assets/file.bin'])
  await fs.symlink(
    outside,
    path.join(nw, 'nw.pak'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  for (const dir of [wolf, nw]) await assert.rejects(detectGame(dir), /連結/)
  let state = await lib.create(media, input)
  for (const dir of [wolf, nw]) assert.ok(state.rows.find((row) => row.path === dir)!.error)
  assert.deepEqual(await internalTree(outside, false), outsideBefore)
  assert.equal(await exists(path.join(wolf, 'Data', DATA_DIR)), false)
  assert.equal(await exists(path.join(nw, 'assets', DATA_DIR)), false)
  const denied = path.join(media, 'DeniedWolf')
  await files(denied, ['Renamed.exe', ...wolfMarkers])
  const open = fs.opendir.bind(fs)
  t.mock.method(fs, 'opendir', async (...args: Parameters<typeof fs.opendir>) => {
    if (String(args[0]) === path.join(denied, 'Data/BasicData'))
      throw Object.assign(new Error('denied'), { code: 'EACCES' })
    return open(...args)
  })
  state = await lib.scan()
  assert.ok(state.rows.find((row) => row.path === denied)!.error)
  assert.equal(await exists(folderFile(denied)), false)
  assert.equal(await exists(path.join(denied, 'Data', DATA_DIR)), false)
  t.mock.restoreAll()
  const controlled = path.join(root, 'cancel-media')
  await fs.mkdir(controlled)
  const snapshots = new Map<string, Record<string, string>>()
  for (let i = 0; i < 30; i++) {
    const dir = path.join(controlled, 'Game' + i)
    await files(dir, ['Game.exe', ...(i % 2 ? nwMarkers : wolfMarkers), 'assets/a/b/original.bin'])
    snapshots.set(dir, await internalTree(dir))
  }
  let cancel = true
  const cancellable = new Library(
    path.join(root, 'cancel-local'),
    (progress) => {
      if (cancel && progress.visited >= 20) cancellable.cancelScan()
    },
    false
  )
  await cancellable.init()
  state = await cancellable.create(controlled, input)
  assert.equal(state.progress.cancelled, true)
  for (const [dir, before] of snapshots) assert.deepEqual(await internalTree(dir), before)
  cancel = false
  state = await cancellable.scan()
  assert.equal(state.progress.cancelled, false)
  assert.equal(state.rows.length, 31)
  for (const [dir, before] of snapshots) assert.deepEqual(await internalTree(dir), before)
})
test('unpacked Tyrano app and app.asar directories stop at the outer launcher root, including renamed games', async (t) => {
  const { media, lib, files } = await fixture(t),
    samples = [
      { name: 'ふたりぐらしver1.312', base: 'resources/app.asar', exe: 'hutarigurashi.exe' },
      { name: 'ROOM', base: 'resources/app', exe: 'Room.exe' },
    ],
    history = new Map<string, Buffer>()
  for (const sample of samples) {
    const game = path.join(media, sample.name)
    await files(game, [
      sample.exe,
      ...tyranoMarkers(sample.base),
      sample.base + '/data/image/ring/page.png',
    ])
    const old = path.join(game, sample.base, 'data/image/ring')
    await ensureFolder(old, false)
    history.set(folderFile(old), await fs.readFile(folderFile(old)))
    assert.deepEqual((await detectGame(game))?.engines, ['TyranoScript'])
  }
  assert.equal(await detectGame(media), undefined)
  let state = await lib.create(media, input)
  assert.equal(state.rows.length, 3)
  for (let pass = 0; pass < 2; pass++) {
    state = await lib.scan()
    for (const sample of samples) {
      const game = path.join(media, sample.name),
        row = state.rows.find((row) => row.path === game)!
      assert.deepEqual(row.boundary?.engines, ['TyranoScript'])
      state = await lib.visit(row.rowId)
      assert.equal(
        state.structure!.some((row) => row.path.startsWith(game + path.sep)),
        false
      )
      assert.equal(await exists(path.join(game, 'resources', DATA_DIR)), false)
      assert.equal(await fs.readFile(path.join(game, sample.exe), 'utf8'), 'ORIGINAL')
    }
  }
  for (const [file, bytes] of history) assert.deepEqual(await fs.readFile(file), bytes)
  const original = path.join(media, 'ROOM'),
    moved = path.join(media, '任意改名')
  await fs.rename(original, moved)
  await fs.rename(path.join(moved, 'Room.exe'), path.join(moved, 'CustomLauncher.exe'))
  await fs.rename(
    path.join(moved, 'resources/app/data/scenario/first.ks'),
    path.join(moved, 'resources/app/data/scenario/start.ks')
  )
  assert.deepEqual((await detectGame(moved))?.engines, ['TyranoScript'])
})
test('wrapped Tyrano rules keep generic apps uncertain and never combine markers across wrappers', async (t) => {
  const { media, files } = await fixture(t)
  for (const base of ['resources/app', 'resources/app.asar'])
    for (const missing of [
      'package.json',
      'index.html',
      'tyrano/tyrano.js',
      'tyrano/plugins/kag/kag.js',
      'data/system/Config.tjs',
      'data/scenario/first.ks',
    ]) {
      const dir = path.join(media, base.replaceAll('/', '-') + '-' + missing.replaceAll('/', '-'))
      await files(dir, [
        'Game.exe',
        ...tyranoMarkers(base).filter((file) => file !== base + '/' + missing),
      ])
      assert.equal(
        (await detectGame(dir))?.engines.includes('TyranoScript') ?? false,
        false,
        missing
      )
    }
  const split = path.join(media, 'Split')
  await files(split, [
    'Game.exe',
    ...tyranoMarkers('resources/app').filter(
      (file) => !file.includes('/kag/') && !file.includes('/data/')
    ),
    ...tyranoMarkers('resources/app.asar').filter(
      (file) => file.includes('/kag/') || file.includes('/data/')
    ),
  ])
  assert.equal((await detectGame(split))?.engines.includes('TyranoScript'), false)
  const generic = path.join(media, 'Utility')
  await files(generic, [
    'Utility.exe',
    'resources/app/package.json',
    'resources/app/index.html',
    'resources/app/assets/icon.png',
  ])
  assert.deepEqual((await detectGame(generic))?.engines, [])
  const packed = path.join(media, 'Packed')
  await files(packed, ['Game.exe', 'resources/app.asar', ...tyranoMarkers('resources/app')])
  assert.deepEqual((await detectGame(packed))?.engines, [])
  const fake = path.join(media, 'Fake')
  await files(fake, tyranoMarkers('resources/app'))
  await fs.mkdir(path.join(fake, 'Game.exe'))
  assert.equal(await detectGame(fake), undefined)
  const wrongType = path.join(media, 'WrongType')
  await files(wrongType, [
    'Game.exe',
    ...tyranoMarkers('resources/app').filter((file) => !file.endsWith('kag.js')),
  ])
  await fs.mkdir(path.join(wrongType, 'resources/app/tyrano/plugins/kag/kag.js'), {
    recursive: true,
  })
  assert.deepEqual((await detectGame(wrongType))?.engines, [])
})
test('wrapped Tyrano marker junctions are not traversed or written', async (t) => {
  const { root, media, lib, files } = await fixture(t),
    outside = path.join(root, 'outside'),
    game = path.join(media, 'Linked')
  await files(outside, ['tyrano.js', 'plugins/kag/kag.js'])
  await files(game, [
    'Game.exe',
    ...tyranoMarkers('resources/app').filter((file) => !file.includes('/tyrano/')),
  ])
  await fs.symlink(
    outside,
    path.join(game, 'resources/app/tyrano'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  const before = await fs.readFile(path.join(outside, 'tyrano.js'))
  await assert.rejects(detectGame(game), /連結/)
  const state = await lib.create(media, input)
  assert.ok(state.rows.find((row) => row.path === game)!.error)
  assert.equal(await exists(path.join(outside, DATA_DIR)), false)
  assert.equal(await exists(path.join(game, 'resources', DATA_DIR)), false)
  assert.deepEqual(await fs.readFile(path.join(outside, 'tyrano.js')), before)
})
test('Unreal cross-layer launchers without version info stop at the outer game; collections stay separate', async (t) => {
  const { media, lib, files } = await fixture(t)
  for (const name of ['ThreeGals', 'LoserIsekaieSJT'])
    await files(path.join(media, name), [
      name + '.exe',
      'Engine/base.bin',
      name + '/Binaries/Win64/' + name + '-Win64-Shipping.exe',
      name + '/Content/Paks/game.utoc',
      name + '/Content/Paks/game.ucas',
      name + '/Plugins/config.ini',
    ])
  assert.equal(await detectGame(media), undefined)
  let state = await lib.create(media, input)
  assert.equal(state.rows.length, 3)
  for (const name of ['ThreeGals', 'LoserIsekaieSJT']) {
    const row = state.rows.find((row) => row.name === name)!
    assert.deepEqual(row.boundary?.engines, ['Unreal'])
    assert.equal(await exists(folderFile(row.path)), true)
    assert.equal(await exists(path.join(row.path, name, DATA_DIR)), false)
    assert.equal(
      await fs.readFile(path.join(row.path, name, 'Content/Paks/game.utoc'), 'utf8'),
      'ORIGINAL'
    )
  }
  const collection = path.join(media, 'Mixed')
  await files(collection, [
    'One.exe',
    'Two.exe',
    'One/Binaries/Win64/One-Win64-Shipping.exe',
    'One/Content/Paks/a.pak',
    'Two/Binaries/Win64/Two-Win64-Shipping.exe',
    'Two/Content/Paks/b.pak',
  ])
  assert.equal(await detectGame(collection), undefined)
  state = await lib.scan()
  assert.equal(state.rows.find((row) => row.name === 'Mixed')!.boundary, undefined)
  assert.ok(state.rows.find((row) => row.name === 'One')!.boundary)
  assert.ok(state.rows.find((row) => row.name === 'Two')!.boundary)
})
test('visiting ASAR and Unreal roots never publishes internal folders in CARD/TABLE/TREE, even with historical records', async (t) => {
  const { media, lib, files } = await fixture(t)
  const samples: Record<string, string[]> = {
    NeetAndAngel: [
      'NeetAndAngel.exe',
      'resources/app.asar',
      'resources/app/data/sound/sound.bin',
      'locales/ja.pak',
      '_meta/old.txt',
    ],
    LoserIsekaieSJT: [
      'LoserIsekaieSJT.exe',
      'Engine/Binaries/runtime.bin',
      'LoserIsekaieSJT/Binaries/Win64/LoserIsekaieSJT-Win64-Shipping.exe',
      'LoserIsekaieSJT/Content/Paks/game.utoc',
    ],
  }
  const history = new Map<string, Buffer>()
  for (const [name, names] of Object.entries(samples)) {
    const dir = path.join(media, name)
    await files(dir, names)
    for (const child of name === 'NeetAndAngel'
      ? ['resources', 'resources/app', 'resources/app/data']
      : ['Engine', 'LoserIsekaieSJT', 'LoserIsekaieSJT/Binaries/Win64']) {
      const target = path.join(dir, child)
      await ensureFolder(target, false)
      history.set(folderFile(target), await fs.readFile(folderFile(target)))
    }
  }
  let state = await lib.create(media, input)
  for (const name of Object.keys(samples)) {
    const game = state.rows.find((row) => row.name === name)!
    assert.ok(game.boundary)
    for (let i = 0; i < 2; i++) state = await lib.visit(game.rowId)
    const project = state.projects[0].project!,
      rows = state.structure!
    assert.deepEqual(browserRows(rows, project, media, 'TABLE', game.path), [])
    assert.deepEqual(
      browserRows(
        rows,
        { ...project, cardView: { mode: 'single', level: 2 } },
        media,
        'CARD',
        game.path
      ).map((row) => row.path),
      [game.path],
      'a folder without published children shows only its own card, never its internals'
    )
    for (const mode of ['TREE', 'CARD'] as const)
      assert.ok(
        browserRows(rows, project, media, mode, '').every(
          (row) => !row.path.startsWith(game.path + path.sep)
        )
      )
    assert.ok(state.rows.every((row) => !row.path.startsWith(game.path + path.sep)))
  }
  for (const [file, bytes] of history) assert.deepEqual(await fs.readFile(file), bytes)
})
test('a newly discovered boundary removes stale in-memory descendants without deleting existing records', async (t) => {
  const { media, lib, files } = await fixture(t),
    game = path.join(media, 'NeetAndAngel'),
    child = path.join(game, 'resources/app/data')
  await fs.mkdir(child, { recursive: true })
  let state = await lib.create(media, input),
    root = state.rows.find((row) => row.path === game)!,
    oldChild = state.rows.find((row) => row.path === child)!
  const before = await fs.readFile(folderFile(child))
  assert.equal(root.boundary, undefined)
  await files(game, ['NeetAndAngel.exe', 'resources/app.asar'])
  state = await lib.visit(root.rowId)
  assert.ok(state.structure!.find((row) => row.rowId === root.rowId)!.boundary)
  assert.equal(
    state.structure!.some((row) => row.rowId === oldChild.rowId),
    false
  )
  assert.equal(
    state.rows.some((row) => row.rowId === oldChild.rowId),
    false
  )
  assert.deepEqual(await fs.readFile(folderFile(child)), before)
  await assert.rejects(lib.visit(oldChild.rowId), /資料已更新/)
  // An explicit non-game correction permits normal read-only navigation again.
  const record = await readFolder(game)
  record.details = {
    schemaVersion: 1,
    boundary: { state: 'not-game', engines: [], evidence: ['使用者指定'] },
  }
  await saveFolder(game, record, record.revision)
  state = await lib.visit(root.rowId)
  assert.equal(state.structure!.find((row) => row.rowId === root.rowId)!.boundary, undefined)
  assert.ok(
    state.structure!.some((row) => row.path === path.join(game, 'resources') && !row.readonly)
  )
})
test('file types, matching names and coherent paths reject empty-shell and cross-game engine markers', async (t) => {
  const { media, files } = await fixture(t)
  for (const name of ['ExeDirectory', 'DataFile', 'UnrelatedData', 'Editor', 'Web', 'Split'])
    await fs.mkdir(path.join(media, name))
  await fs.mkdir(path.join(media, 'ExeDirectory', 'Game.exe'))
  await files(path.join(media, 'ExeDirectory'), ['UnityPlayer.dll', 'Game_Data/data.bin'])
  await files(path.join(media, 'DataFile'), ['Game.exe', 'UnityPlayer.dll', 'Game_Data'])
  await files(path.join(media, 'UnrelatedData'), [
    'Game.exe',
    'UnityPlayer.dll',
    'Other_Data/data.bin',
  ])
  await files(path.join(media, 'Editor'), ['Godot.windows.opt.tools.64.exe'])
  await files(path.join(media, 'Web'), ['package.json', 'www/js/rpg_core.js', 'www/data/data.bin'])
  await files(path.join(media, 'Split'), [
    'A.exe',
    'A/Binaries/Win64/A.exe',
    'B/Content/Paks/data.pak',
  ])
  for (const name of ['ExeDirectory', 'Editor', 'Web', 'Split'])
    assert.equal(await detectGame(path.join(media, name)), undefined, name)
  for (const name of ['DataFile', 'UnrelatedData'])
    assert.deepEqual(
      (await detectGame(path.join(media, name)))?.engines,
      [],
      name + ' must stay uncertain, never confirmed Unity'
    )
  await files(path.join(media, 'Conflict'), [
    'Game.exe',
    'UnityPlayer.dll',
    'Game_Data/a.bin',
    'Game.pck',
  ])
  assert.deepEqual((await detectGame(path.join(media, 'Conflict')))?.engines, ['Unity', 'Godot'])
})
test('existing engine families keep their bounded positive rules and manual fallback', async (t) => {
  const { media, files } = await fixture(t)
  const samples: Record<string, string[]> = {
    'RPG Maker XP/VX/Ace': ['Game.exe', 'Game.rgss3a'],
    'RPG Maker 2000/2003': ['Game.exe', 'RPG_RT.ldb', 'RPG_RT.lmt'],
    TyranoScript: ['Game.exe', 'index.html', 'tyrano/tyrano.js', 'data/scenario/main.ks'],
    'Ren’Py': ['Renamed.exe', 'renpy/runtime.bin', 'game/scripts/main.rpyc'],
    'WOLF RPG': ['Game.exe', 'Data.wolf'],
    GameMaker: ['Game.exe', 'data.win'],
    Defold: ['Game.exe', 'game.arcd', 'game.arci'],
    LÖVE: ['Game.exe', 'love.dll', 'Game.love'],
    Cocos: ['Game.exe', 'cocos2d.dll', 'resources/start.bin'],
    Construct: ['Game.exe', 'www/c2runtime.js'],
    KiriKiri: ['Game.exe', 'data.xp3'],
  }
  let index = 0
  for (const [engine, names] of Object.entries(samples)) {
    const dir = path.join(media, 'sample' + index++)
    await files(dir, names)
    assert.ok((await detectGame(dir))?.engines.includes(engine), engine)
  }
  await files(path.join(media, 'Unknown'), ['Custom.exe', 'Assets/packed.bin'])
  assert.equal(await detectGame(path.join(media, 'Unknown')), undefined)
})
test('ASAR remains an unknown candidate; manual ROOT/not-game and readonly traversal never rewrite history', async (t) => {
  const { media, lib, files } = await fixture(t)
  for (const name of ['otsutome', 'HOME_', 'NeetAndAngel'])
    await files(path.join(media, name), [
      name + '.exe',
      'resources/app.asar',
      'resources/app/data/save.sav',
    ])
  let state = await lib.create(media, input)
  for (const name of ['otsutome', 'HOME_', 'NeetAndAngel']) {
    const row = state.rows.find((row) => row.name === name)!
    assert.deepEqual(row.boundary?.engines, [])
    assert.equal(await exists(path.join(row.path, 'resources', DATA_DIR)), false)
  }
  const game = state.rows.find((row) => row.name === 'otsutome')!,
    old = path.join(game.path, 'resources')
  await ensureFolder(old, false)
  const bytes = await fs.readFile(folderFile(old))
  let record = await readFolder(game.path)
  record.details = {
    schemaVersion: 1,
    boundary: { state: 'root', engines: [], evidence: ['使用者指定'] },
  }
  await saveFolder(game.path, record, record.revision)
  state = await lib.scan()
  assert.equal(state.rows.find((row) => row.rowId === game.rowId)!.boundary?.state, 'root')
  assert.deepEqual(await fs.readFile(folderFile(old)), bytes)
  const p = state.projects[0].project!
  state = await lib.saveProject({ ...p, traversal: { [record.folderId]: true } })
  assert.ok(state.rows.find((row) => row.path === old)!.readonly)
  assert.deepEqual(await fs.readFile(folderFile(old)), bytes)
  await assert.rejects(lib.create(old, { ...input, name: 'Nested' }), /邊界保護/)
  record = await readFolder(game.path)
  record.details!.boundary!.state = 'not-game'
  await saveFolder(game.path, record, record.revision)
  state = await lib.scan()
  assert.equal(state.rows.find((row) => row.rowId === game.rowId)!.boundary, undefined)
  assert.equal(state.rows.find((row) => row.path === old)!.readonly, false)
})
test('single wrapped MV game stops at the inner root; exact depth cannot bypass protection', async (t) => {
  const { media, lib, files } = await fixture(t),
    wrapper = path.join(media, 'NTR'),
    game = path.join(wrapper, 'ゲームフォルダ')
  await files(wrapper, [
    'readme.txt',
    'ゲームフォルダ/NTR.exe',
    'ゲームフォルダ/www/index.html',
    'ゲームフォルダ/www/js/rpg_core.js',
    'ゲームフォルダ/www/data/actors.json',
  ])
  assert.equal(await detectGame(wrapper), undefined)
  let state = await lib.create(media, input)
  assert.deepEqual(state.rows.find((row) => row.path === game)?.boundary?.engines, ['RPG Maker MV'])
  assert.equal(await exists(path.join(game, 'www', DATA_DIR)), false)
  state = await lib.saveProject({
    ...state.projects[0].project!,
    scanAll: false,
    depth: { mode: 'exact', level: 5 },
  })
  assert.ok(state.structure!.find((row) => row.path === game)?.boundary)
  assert.equal(await exists(path.join(game, 'www', DATA_DIR)), false)
})
test('an existing nested project cannot bypass a newly detected parent game boundary', async (t) => {
  const { media, lib, files } = await fixture(t),
    game = path.join(media, 'Game'),
    nested = path.join(game, 'Game_Data')
  await fs.mkdir(nested, { recursive: true })
  let state = await lib.create(nested, { ...input, name: 'Legacy nested' })
  const id = state.projects[0].projectId,
    definition = path.join(nested, DATA_DIR, 'projects', id + '.json'),
    old = await fs.readFile(definition),
    record = await fs.readFile(folderFile(nested))
  await files(game, ['Game.exe', 'UnityPlayer.dll', 'Game_Data/child/file.bin'])
  state = await lib.create(media, input)
  assert.ok(state.projects.find((project) => project.projectId === id)!.error?.includes('保護邊界'))
  assert.deepEqual(await fs.readFile(definition), old)
  assert.deepEqual(await fs.readFile(folderFile(nested)), record)
  assert.equal(await exists(path.join(nested, 'child', DATA_DIR)), false)
  await assert.rejects(lib.restoreProject(id), /邊界/)
})
test('multi-platform bundles and every App variant remain untouched, even with old records or not-game', async (t) => {
  const { media, lib, files } = await fixture(t),
    look = path.join(media, 'LOOK'),
    app = path.join(look, 'MacOS/MacOS/改名.app')
  await files(look, [
    'Windows/LOOK.exe',
    'Windows/UnityPlayer.dll',
    'Windows/LOOK_Data/global.dat',
    'Android/LOOK.apk',
    'MacOS/MacOS/改名.app/Contents/MacOS/LOOK',
    'MacOS/MacOS/改名.app/Contents/Frameworks/UnityPlayer.dylib',
    'MacOS/MacOS/改名.app/Contents/Resources/Data/global.dat',
    'MacOS/MacOS/改名.app/Contents/Info.plist',
  ])
  for (const name of ['Binary', 'Broken', 'Ordinary'])
    await files(path.join(media, name + '.app'), ['Contents/Info.plist', 'Contents/MacOS/app'])
  await fs.writeFile(path.join(media, 'Binary.app/Contents/Info.plist'), Buffer.from('bplist00'))
  await fs.writeFile(
    path.join(media, 'Broken.app/Contents/Info.plist'),
    '<!DOCTYPE plist SYSTEM "https://invalid.example/test"><plist>'
  )
  const historical = path.join(app, 'Contents')
  await ensureFolder(historical, false)
  const old = await fs.readFile(folderFile(historical))
  const manual = await ensureFolder(app, false)
  manual.record.details = {
    schemaVersion: 1,
    boundary: { state: 'not-game', engines: [], evidence: ['歷史設定'] },
  }
  await saveFolder(app, manual.record, manual.record.revision)
  const before = await fs.readFile(folderFile(app)),
    state = await lib.create(media, { ...input, mediaCategory: 'album' })
  assert.equal(state.rows.find((row) => row.path === look)!.boundary, undefined)
  assert.ok(state.rows.find((row) => row.path === app)!.readonly)
  assert.deepEqual(await fs.readFile(folderFile(app)), before)
  assert.deepEqual(await fs.readFile(folderFile(historical)), old)
  for (const name of ['Binary', 'Broken', 'Ordinary'])
    assert.equal(await exists(path.join(media, name + '.app', DATA_DIR)), false)
  await assert.rejects(lib.create(app, input), /邊界保護/)
  await assert.rejects(lib.create(path.join(app, 'Contents/MacOS'), input), /邊界保護/)
  assert.equal(await exists(path.join(app, 'Contents/MacOS', DATA_DIR)), false)
})
test('probe limits, permission failure and junction markers fail closed without initializing descendants', async (t) => {
  const { root, media, lib, files } = await fixture(t),
    game = path.join(media, 'Large')
  await files(game, ['Game.exe', 'renpy/runtime.bin'])
  for (let i = 0; i < GAME_PROBE_LIMITS.directories + 2; i++)
    await fs.mkdir(path.join(game, 'game', String(i)), { recursive: true })
  await assert.rejects(detectGame(game), /探測超限/)
  let state = await lib.create(media, input)
  assert.ok(
    state.rows
      .find((row) => row.path === game)!
      .boundary?.evidence.some((text) => text.includes('超限'))
  )
  assert.equal(await exists(path.join(game, 'game', DATA_DIR)), false)
  const denied = path.join(media, 'Denied')
  await files(denied, ['Game.exe', 'Game_Data/a.bin', 'UnityPlayer.dll'])
  const open = fs.opendir.bind(fs)
  t.mock.method(fs, 'opendir', async (...args: Parameters<typeof fs.opendir>) => {
    if (String(args[0]) === denied) throw Object.assign(new Error('denied'), { code: 'EACCES' })
    return open(...args)
  })
  state = await lib.scan()
  assert.ok(state.rows.find((row) => row.path === denied)!.error)
  assert.equal(await exists(folderFile(denied)), false)
  t.mock.restoreAll()
  const outside = path.join(root, 'outside')
  await fs.mkdir(outside)
  const linked = path.join(media, 'Linked')
  await files(linked, ['Game.exe', 'UnityPlayer.dll'])
  await fs.symlink(
    outside,
    path.join(linked, 'Game_Data'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  await assert.rejects(detectGame(linked), /連結/)
  state = await lib.scan()
  assert.ok(state.rows.find((row) => row.path === linked)!.error)
  assert.deepEqual(await fs.readdir(outside), [])
})
