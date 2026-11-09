import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { Explorer, type DesktopOperations } from '../electron/explorer'
import { folderFile, readFolder } from '../electron/files'
import { gameActionTemplates } from '../shared/explorer'

test('implicit launch template does not overwrite explicit templates', () => {
  assert.equal(gameActionTemplates({})[0].id, 'default-launch-game')
  assert.deepEqual(gameActionTemplates({ actionTemplates: [] }), [])
})

test('game targets require explicit selection, preserve arguments and leave original files unchanged', async (t) => {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'game-actions-')),
    media = path.join(root, 'game')
  await fs.mkdir(media)
  const original = {
    'Game.exe': 'controlled fake EXE',
    'notes.txt': 'ORIGINAL FILE',
    'unsafe.cmd': 'ORIGINAL SCRIPT',
  }
  for (const [name, value] of Object.entries(original))
    await fs.writeFile(path.join(media, name), value)
  const library = new Library(path.join(root, 'local'), undefined, false)
  await library.init()
  const calls: { file: string; args: string[] }[] = [],
    pickers: { kind: string; initialPath?: string }[] = [],
    urls: string[] = []
  let picks: (string | undefined)[] = []
  const desktop: DesktopOperations = {
    choose: async (kind, initialPath) => {
      pickers.push({ kind, initialPath })
      return picks.shift()
    },
    open: async (file) => {
      calls.push({ file, args: [] })
    },
    launch: async (file, args) => {
      calls.push({ file, args })
    },
    external: async (url) => {
      urls.push(url)
    },
    thumbnail: async () => Buffer.alloc(0),
  }
  const explorer = new Explorer(library, library.userData, desktop)
  t.after(async () => {
    explorer.index.close()
    const target = await fs.realpath(root)
    assert.ok(target.startsWith(base + path.sep))
    await fs.rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  await library.create(media, {
    name: 'Games',
    depth: { mode: 'through', level: 1 },
  })
  const row = () => library.snapshot().rows[0]
  const before = await fs.readFile(folderFile(media), 'utf8')
  await assert.rejects(
    explorer.request({
      action: 'runTarget',
      rowId: row().rowId,
      templateId: 'default-launch-game',
    }),
    /尚未綁定/
  )
  assert.equal(
    (
      await explorer.request({
        action: 'bindTarget',
        rowId: row().rowId,
        revision: row().record!.revision,
        templateId: 'default-launch-game',
        args: [],
      })
    ).cancelled,
    true
  )
  assert.equal(await fs.readFile(folderFile(media), 'utf8'), before)
  assert.equal(pickers[0].initialPath, media)
  const args = ['value with spaces', '"quoted"', '$(literal)', '; keep literal']
  picks = [path.join(media, 'Game.exe')]
  await explorer.request({
    action: 'bindTarget',
    rowId: row().rowId,
    revision: row().record!.revision,
    templateId: 'default-launch-game',
    args,
  })
  assert.equal(calls.length, 0)
  assert.equal(library.snapshot().projects[0].project!.actionTemplates, undefined)
  await explorer.request({
    action: 'runTarget',
    rowId: row().rowId,
    templateId: 'default-launch-game',
  })
  assert.deepEqual(calls[0], { file: path.join(media, 'Game.exe'), args })
  await fs.rename(path.join(media, 'Game.exe'), path.join(media, 'Moved.exe'))
  await assert.rejects(
    explorer.request({
      action: 'runTarget',
      rowId: row().rowId,
      templateId: 'default-launch-game',
    }),
    /ENOENT/
  )
  assert.equal(calls.length, 1)
  await fs.rename(path.join(media, 'Moved.exe'), path.join(media, 'Game.exe'))
  let project = library.snapshot().projects[0].project!
  await library.saveProject({
    ...project,
    actionTemplates: [
      { id: 'file', label: 'Open notes', kind: 'file-app', color: '#123456' },
      { id: 'web', label: 'Website', kind: 'url', color: '#123456' },
    ],
  })
  const bound = await fs.readFile(folderFile(media), 'utf8')
  picks = [path.join(media, 'Game.exe'), undefined]
  assert.equal(
    (
      await explorer.request({
        action: 'bindTarget',
        rowId: row().rowId,
        revision: row().record!.revision,
        templateId: 'file',
        args,
      })
    ).cancelled,
    true
  )
  assert.equal(await fs.readFile(folderFile(media), 'utf8'), bound)
  picks = [path.join(media, 'Game.exe'), path.join(media, 'notes.txt')]
  await explorer.request({
    action: 'bindTarget',
    rowId: row().rowId,
    revision: row().record!.revision,
    templateId: 'file',
    args,
  })
  await explorer.request({ action: 'runTarget', rowId: row().rowId, templateId: 'file' })
  assert.deepEqual(calls[1], {
    file: path.join(media, 'Game.exe'),
    args: [...args, path.join(media, 'notes.txt')],
  })
  for (const url of [
    'file:///C:/Game.exe',
    'javascript:alert(1)',
    'https://user:pass@example.test/',
  ])
    await assert.rejects(
      explorer.request({
        action: 'bindTarget',
        rowId: row().rowId,
        revision: row().record!.revision,
        templateId: 'web',
        args: [],
        url,
      }),
      /網址/
    )
  await explorer.request({
    action: 'bindTarget',
    rowId: row().rowId,
    revision: row().record!.revision,
    templateId: 'web',
    args: [],
    url: 'https://example.test/game?a=1',
  })
  assert.equal(urls.length, 0)
  await explorer.request({ action: 'runTarget', rowId: row().rowId, templateId: 'web' })
  assert.deepEqual(urls, ['https://example.test/game?a=1'])
  const saved = await readFolder(media)
  await assert.rejects(
    explorer.request({
      action: 'bindTarget',
      rowId: row().rowId,
      revision: row().record!.revision,
      templateId: 'file',
      args: ['\0'],
    }),
    /參數/
  )
  assert.deepEqual(await readFolder(media), saved)
  picks = ['relative.exe']
  await assert.rejects(
    explorer.request({
      action: 'bindTarget',
      rowId: row().rowId,
      revision: row().record!.revision,
      templateId: 'file',
      args: [],
    }),
    /路徑/
  )
  picks = [path.join(media, 'unsafe.cmd')]
  await assert.rejects(
    explorer.request({
      action: 'bindTarget',
      rowId: row().rowId,
      revision: row().record!.revision,
      templateId: 'file',
      args: [],
    }),
    /類型/
  )
  const outside = path.join(root, 'outside')
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, 'tool.exe'), 'EXTERNAL ORIGINAL')
  await fs.symlink(
    outside,
    path.join(media, 'linked'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  picks = [path.join(media, 'linked', 'tool.exe')]
  await assert.rejects(
    explorer.request({
      action: 'bindTarget',
      rowId: row().rowId,
      revision: row().record!.revision,
      templateId: 'file',
      args: [],
    }),
    /連結|junction/
  )
  assert.equal(await fs.readFile(path.join(outside, 'tool.exe'), 'utf8'), 'EXTERNAL ORIGINAL')
  assert.deepEqual(await readFolder(media), saved)
  assert.equal(calls.length, 2)
  for (const [name, value] of Object.entries(original))
    assert.equal(await fs.readFile(path.join(media, name), 'utf8'), value)
})
