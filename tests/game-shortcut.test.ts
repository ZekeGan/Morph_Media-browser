import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { Explorer, type DesktopOperations } from '../electron/explorer'
import { folderFile, readFolder } from '../electron/files'
import { launchChoice, launchTemplate, launchTemplates } from '../shared/explorer'

test('launch actions: the cell picks its own action, falls back to the default, then to any launcher', () => {
  const le = { id: 'le', label: '用 LE 啟動', kind: 'shortcut' as const, color: '#123456' },
    web = { id: 'web', label: 'Website', kind: 'url' as const, color: '#123456' },
    plain = { id: 'default-launch-game', label: '啟動遊戲', kind: 'exe' as const, color: '#168c77' }
  assert.equal(launchTemplate({}, undefined)?.id, 'default-launch-game')
  assert.equal(launchTemplate({ actionTemplates: [plain, le] }, 'le')?.id, 'le')
  assert.equal(
    launchTemplate({ actionTemplates: [plain, le] }, 'missing')?.id,
    'default-launch-game'
  )
  // The default action was deleted: a cell with no choice uses another launcher instead of going dead.
  assert.equal(launchTemplate({ actionTemplates: [web, le] }, undefined)?.id, 'le')
  assert.deepEqual(launchTemplates({ actionTemplates: [web] }), [])
  assert.equal(launchTemplate({ actionTemplates: [web] }, undefined), undefined)
})

test('a launch cell falls back to the next action this folder has a target for', () => {
  const exe = {
      id: 'default-launch-game',
      label: '啟動遊戲',
      kind: 'exe' as const,
      color: '#168c77',
    },
    le = { id: 'le', label: '用 LE 啟動', kind: 'shortcut' as const, color: '#123456' },
    project = { actionTemplates: [exe, le] },
    pick = (targets: Record<string, { kind: string }>, fallbacks: string[] | undefined = ['le']) =>
      launchChoice(project, undefined, fallbacks, targets).id
  assert.equal(pick({ 'default-launch-game': { kind: 'exe' } }), 'default-launch-game')
  assert.equal(pick({ le: { kind: 'shortcut' } }), 'le', 'only the shortcut is bound here')
  assert.equal(
    pick({ 'default-launch-game': { kind: 'exe' }, le: { kind: 'shortcut' } }),
    'default-launch-game'
  )
  assert.equal(pick({}), 'default-launch-game', 'nothing bound: the main action, shown as unbound')
  assert.equal(pick({ le: { kind: 'shortcut' } }, []), 'default-launch-game', 'no fallbacks')
  assert.equal(
    pick({ le: { kind: 'exe' } }),
    'default-launch-game',
    'a target of the wrong kind does not count'
  )
  assert.equal(
    launchChoice(project, 'le', ['default-launch-game'], { 'default-launch-game': { kind: 'exe' } })
      .id,
    'default-launch-game'
  )
  assert.equal(launchChoice(project, undefined, ['missing'], undefined).id, 'default-launch-game')
})

test('shortcut actions are chosen from the folder, opened through the system and never rewrite files', async (t) => {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'game-shortcut-')),
    media = path.join(root, 'game')
  await fs.mkdir(path.join(media, 'sub'), { recursive: true })
  const original = {
    'Game.exe': 'controlled fake EXE',
    'Game - Locale Emulator.lnk': 'controlled fake shortcut',
    'Store.url': '[InternetShortcut]',
    'readme.txt': 'ORIGINAL',
    'sub/Other.lnk': 'nested shortcut',
  }
  for (const [name, value] of Object.entries(original))
    await fs.writeFile(path.join(media, name), value)
  const library = new Library(path.join(root, 'local'), undefined, false)
  await library.init()
  const opened: string[] = [],
    launched: string[] = []
  const desktop: DesktopOperations = {
    choose: async () => {
      throw new Error('shortcuts must not use a file dialog')
    },
    open: async (file) => {
      opened.push(file)
    },
    launch: async (file) => {
      launched.push(file)
    },
    thumbnail: async () => Buffer.alloc(0),
  }
  const explorer = new Explorer(library, library.userData, desktop)
  t.after(async () => {
    explorer.index.close()
    const target = await fs.realpath(root)
    assert.ok(target.startsWith(base + path.sep))
    await fs.rm(target, { recursive: true, force: true })
  })
  await library.create(media, {
    name: 'Games',
    mediaCategory: 'game',
    depth: { mode: 'through', level: 1 },
  })
  const project = library.snapshot().projects[0].project!
  await library.saveProject({
    ...project,
    actionTemplates: [
      { id: 'default-launch-game', label: '啟動遊戲', kind: 'exe', color: '#168c77' },
      { id: 'le', label: '用 LE 啟動', kind: 'shortcut', color: '#123456' },
    ],
  })
  const row = () => library.snapshot().rows[0]
  assert.deepEqual(
    (await explorer.request({ action: 'listShortcuts', rowId: row().rowId })).shortcuts,
    ['Game - Locale Emulator.lnk', 'Store.url']
  )
  await assert.rejects(
    explorer.request({ action: 'runTarget', rowId: row().rowId, templateId: 'le' }),
    /尚未綁定/
  )
  const bind = (shortcut: unknown, args: string[] = []) =>
    explorer.request({
      action: 'bindTarget',
      rowId: row().rowId,
      revision: row().record!.revision,
      templateId: 'le',
      args,
      shortcut: shortcut as string,
    })
  for (const bad of [
    'readme.txt',
    '../Game - Locale Emulator.lnk',
    'sub/Other.lnk',
    'sub\\Other.lnk',
    '',
    undefined,
    'Missing.lnk',
  ])
    await assert.rejects(bind(bad), Error, String(bad))
  await assert.rejects(bind('Store.url', ['--extra']), /參數不合法/)
  const before = await fs.readFile(folderFile(media), 'utf8')
  assert.equal(
    JSON.parse(before).details?.targets?.le,
    undefined,
    'a failed bind leaves the record alone'
  )
  await bind('Game - Locale Emulator.lnk')
  const target = (await readFolder(media)).details!.targets!.le
  assert.deepEqual(target, {
    kind: 'shortcut',
    path: 'Game - Locale Emulator.lnk',
    relative: true,
    args: [],
  })
  await explorer.request({ action: 'runTarget', rowId: row().rowId, templateId: 'le' })
  assert.deepEqual(opened, [path.join(media, 'Game - Locale Emulator.lnk')])
  assert.deepEqual(launched, [], 'a shortcut is opened by the system, not spawned with arguments')
  for (const [name, value] of Object.entries(original))
    assert.equal(await fs.readFile(path.join(media, name), 'utf8'), value, name)
  // A button can be hidden from this folder's action row; it stays bound and the record stays valid.
  const visible = (templateId: string, flag: boolean, revision = row().record!.revision) =>
    explorer.request({
      action: 'actionVisible',
      rowId: row().rowId,
      revision,
      templateId,
      visible: flag,
    })
  await visible('le', false)
  assert.deepEqual((await readFolder(media)).details!.hiddenActions, ['le'])
  assert.equal((await readFolder(media)).details!.targets!.le.path, 'Game - Locale Emulator.lnk')
  await visible('le', false)
  assert.deepEqual((await readFolder(media)).details!.hiddenActions, ['le'], 'no duplicates')
  await assert.rejects(visible('missing', false), /版型不存在/)
  await assert.rejects(visible('le', 'no' as unknown as boolean), /版型不存在/)
  await visible('le', true)
  assert.equal((await readFolder(media)).details!.hiddenActions, undefined)
  // A bound shortcut that was removed fails clearly and starts nothing.
  await fs.unlink(path.join(media, 'Game - Locale Emulator.lnk'))
  await assert.rejects(
    explorer.request({ action: 'runTarget', rowId: row().rowId, templateId: 'le' }),
    /ENOENT/
  )
  assert.equal(opened.length, 1)
})
