import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { randomUUID } from 'node:crypto'
import {
  atomicJson,
  exists,
  folderFile,
  readFolder,
  readJson,
  safePath,
  saveFolder,
  projectFile,
  ensureFolder,
  restoreJson,
} from '../electron/files'
import { DATA_DIR, defaultCells, validateFolder, type Project } from '../shared/model'
import { hideDirectories } from '../electron/hidden'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'library-'))
  t.after(async () => {
    if (!root.startsWith(base + path.sep)) throw new Error('Unsafe fixture')
    await fs.rm(root, { recursive: true, force: true })
  })
  const p1 = path.join(root, 'P1'),
    p2 = path.join(root, 'P2')
  await fs.mkdir(path.join(p1, 'A'), { recursive: true })
  await fs.mkdir(path.join(p1, 'B', 'C'), { recursive: true })
  await fs.mkdir(p2)
  const lib = new Library(path.join(root, 'local'), undefined, false)
  await lib.init()
  return { root, p1, p2, lib }
}
const input = {
  name: '漫畫',
  mediaCategory: 'manga',
  depth: { mode: 'through' as const, level: 2 },
}
test('project removal previews are read-only; stale plans fail before writes; shared data and archived backups survive', async (t) => {
  const { p1, p2, lib } = await fixture(t)
  let state = await lib.create(p1, input),
    first = state.projects[0].project!
  state = await lib.create(p1, { ...input, name: 'Other' })
  const other = state.projects[1].project!
  await lib.create(p2, input)
  const dir = path.join(p1, 'A'),
    record = await readFolder(dir)
  record.attributes = [
    { attributeId: 'common', key: 'shared', type: 'string', value: 'COMMON', source: 'manual' },
  ]
  record.projectOverrides = {
    [first.projectId]: [
      { attributeId: 'mine', key: 'private', type: 'string', value: 'PRIVATE', source: 'manual' },
    ],
    [other.projectId]: [
      { attributeId: 'other', key: 'private', type: 'string', value: 'OTHER', source: 'manual' },
    ],
  }
  await saveFolder(dir, record, record.revision)
  await fs.writeFile(path.join(dir, 'original.txt'), 'MEDIA')
  await fs.writeFile(path.join(dir, DATA_DIR, 'unknown.bin'), 'UNKNOWN')
  const before = await fs.readFile(folderFile(dir)),
    definition = await fs.readFile(projectFile(p1, first.projectId))
  const cancelled = await lib.previewRemoveProject(first.projectId)
  assert.equal(cancelled.privateCount, 1)
  assert.deepEqual(await fs.readFile(folderFile(dir)), before)
  await lib.saveProject({ ...first, name: 'Changed' })
  await assert.rejects(lib.removeProject(cancelled.token), /預覽後資料已變更/)
  assert.deepEqual(await fs.readFile(folderFile(dir)), before)
  const preview = await lib.previewRemoveProject(first.projectId),
    currentDefinition = await fs.readFile(projectFile(p1, first.projectId)),
    result = await lib.removeProject(preview.token)
  assert.deepEqual(result.failed, [])
  assert.equal(lib.snapshot().projects.length, 2)
  assert.ok(lib.snapshot().projects.some((p) => p.projectId === other.projectId))
  const after = await readFolder(dir)
  assert.equal(after.projectOverrides[first.projectId], undefined)
  assert.equal(after.projectOverrides[other.projectId][0].value, 'OTHER')
  assert.equal(after.attributes[0].value, 'COMMON')
  assert.deepEqual(await fs.readFile(folderFile(dir) + '.bak'), before)
  assert.deepEqual(
    await fs.readFile(projectFile(p1, first.projectId) + '.removed-' + preview.token),
    currentDefinition
  )
  assert.ok(
    (await fs.readdir(path.dirname(projectFile(p1, first.projectId)))).some((name) =>
      name.includes('.bak.removed-')
    )
  )
  assert.equal(await exists(projectFile(p1, first.projectId)), false)
  assert.equal(await fs.readFile(path.join(dir, 'original.txt'), 'utf8'), 'MEDIA')
  assert.equal(await fs.readFile(path.join(dir, DATA_DIR, 'unknown.bin'), 'utf8'), 'UNKNOWN')
  state = await lib.link(p1)
  assert.equal(
    state.projects.some((p) => p.projectId === first.projectId),
    false
  )
  assert.ok(definition.length)
})
test('project removal stops on private-write failure, keeps active settings and can retry with backups', async (t) => {
  const { p1, lib } = await fixture(t),
    state = await lib.create(p1, input),
    project = state.projects[0].project!,
    dir = path.join(p1, 'A'),
    record = await readFolder(dir)
  record.projectOverrides[project.projectId] = [
    { attributeId: 'mine', key: 'private', type: 'string', value: 'PRIVATE', source: 'manual' },
  ]
  await saveFolder(dir, record, record.revision)
  const before = await fs.readFile(folderFile(dir)),
    preview = await lib.previewRemoveProject(project.projectId),
    rename = fs.rename.bind(fs)
  t.mock.method(
    fs,
    'rename',
    async (source: Parameters<typeof fs.rename>[0], target: Parameters<typeof fs.rename>[1]) => {
      if (String(target) === folderFile(dir))
        throw Object.assign(new Error('simulated write denied'), { code: 'EACCES' })
      return rename(source, target)
    }
  )
  const result = await lib.removeProject(preview.token)
  assert.equal(result.failed.length, 1)
  assert.equal(await exists(projectFile(p1, project.projectId)), true)
  assert.equal(lib.snapshot().projects.length, 1)
  assert.deepEqual(await fs.readFile(folderFile(dir)), before)
  t.mock.restoreAll()
  const retry = await lib.previewRemoveProject(project.projectId)
  assert.deepEqual((await lib.removeProject(retry.token)).failed, [])
  assert.deepEqual(await fs.readFile(folderFile(dir) + '.bak'), before)
})
async function createTextProject(lib: Library, root: string, options = input) {
  const state = await lib.create(root, options),
    project = state.projects.find((p) => p.root === root)!.project!,
    attributeId = randomUUID()
  return lib.saveProject({
    ...project,
    fieldBindings: [{ alias: 'title', attributeId, type: 'string' }],
    cells: defaultCells(randomUUID, attributeId),
  })
}

test('creating again after cleanup tolerates preserved project archives without reviving an old root identity', async (t) => {
  const { p1, lib } = await fixture(t),
    state = await lib.create(p1, input),
    old = state.projects[0].project!,
    childBytes = await fs.readFile(folderFile(path.join(p1, 'A')))
  const common = await readFolder(p1)
  common.attributes = [
    { attributeId: 'common', key: 'shared', type: 'string', value: 'KEEP', source: 'manual' },
  ]
  await saveFolder(p1, common, common.revision)
  const preview = await lib.previewRemoveProject(old.projectId)
  assert.deepEqual((await lib.removeProject(preview.token)).failed, [])
  const dir = path.join(p1, DATA_DIR, 'projects'),
    archives = new Map(
      await Promise.all(
        (await fs.readdir(dir)).map(
          async (name) => [name, await fs.readFile(path.join(dir, name))] as const
        )
      )
    )
  await fs.unlink(folderFile(p1))
  await fs.unlink(folderFile(p1) + '.bak')
  await assert.rejects(lib.link(p1), /請重新新增專案/)
  assert.equal(await exists(folderFile(p1)), false)
  const next = await lib.create(p1, { ...input, name: 'New' }),
    project = next.projects[0].project!
  assert.notEqual(project.rootFolderId, old.rootFolderId)
  assert.notEqual(project.projectId, old.projectId)
  assert.equal(next.projects.length, 1)
  for (const [name, bytes] of archives)
    assert.deepEqual(await fs.readFile(path.join(dir, name)), bytes)
  assert.deepEqual(await fs.readFile(folderFile(path.join(p1, 'A'))), childBytes)
  assert.equal((await lib.link(p1)).projects.length, 1)
})
test('only empty metadata or verified removed-project archives allow missing-record initialization', async (t) => {
  const { root, p1, p2, lib } = await fixture(t),
    state = await lib.create(p1, input),
    project = state.projects[0].project!
  await fs.mkdir(path.join(p2, DATA_DIR, 'projects'), { recursive: true })
  const fresh = await ensureFolder(p2, false)
  assert.ok(fresh.created)
  assert.equal((await ensureFolder(p2, false)).record.folderId, fresh.record.folderId)
  const cases = [
    { name: 'unknown', file: 'unknown.txt', bytes: 'KEEP' },
    {
      name: 'active',
      file: 'projects/' + project.projectId + '.json',
      bytes: JSON.stringify(project),
    },
    {
      name: 'corrupt',
      file: 'projects/' + project.projectId + '.json.removed-token',
      bytes: '{broken',
    },
    { name: 'mismatch', file: 'projects/other.json.removed-token', bytes: JSON.stringify(project) },
    { name: 'assets', file: 'assets/picture.png', bytes: 'IMAGE' },
  ]
  for (const sample of cases) {
    const dir = path.join(root, 'unsafe-' + sample.name),
      file = path.join(dir, DATA_DIR, sample.file)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, sample.bytes)
    await assert.rejects(ensureFolder(dir, false), /原檔保留/)
    assert.equal(await exists(folderFile(dir)), false)
    assert.equal(await fs.readFile(file, 'utf8'), sample.bytes)
  }
  const linked = path.join(root, 'linked'),
    outside = path.join(root, 'outside-archives')
  await fs.mkdir(path.join(linked, DATA_DIR), { recursive: true })
  await fs.mkdir(outside)
  await fs.symlink(
    outside,
    path.join(linked, DATA_DIR, 'projects'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  await assert.rejects(ensureFolder(linked, false), /原檔保留/)
  assert.deepEqual(await fs.readdir(outside), [])
})
test('a missing root with a valid backup requires explicit recovery and preserves identity', async (t) => {
  const { root, p1, lib } = await fixture(t),
    state = await lib.create(p1, input),
    project = state.projects[0].project!,
    backup = await fs.readFile(folderFile(p1) + '.bak'),
    registry = await fs.readFile(path.join(lib.userData, 'poc-projects.json'))
  await fs.unlink(folderFile(p1))
  await assert.rejects(lib.create(p1, input), /備份.*復原/)
  assert.equal(await exists(folderFile(p1)), false)
  assert.deepEqual(await fs.readFile(folderFile(p1) + '.bak'), backup)
  assert.deepEqual(await fs.readFile(path.join(lib.userData, 'poc-projects.json')), registry)
  const fresh = new Library(path.join(root, 'fresh-recovery'), undefined, false)
  await fresh.init()
  assert.ok((await fresh.link(p1)).projects[0].error)
  const restored = await fresh.restoreProject(project.projectId)
  assert.equal(restored.projects[0].error, undefined)
  assert.equal((await readFolder(p1)).folderId, project.rootFolderId)
  assert.deepEqual(await fs.readFile(folderFile(p1) + '.bak'), backup)
})
test('failed initialization beside archives preserves them and leaves a recoverable backup', async (t) => {
  const { p1, lib } = await fixture(t),
    state = await lib.create(p1, input),
    project = state.projects[0].project!
  const common = await readFolder(p1)
  common.attributes = [
    { attributeId: 'common', key: 'shared', type: 'string', value: 'KEEP', source: 'manual' },
  ]
  await saveFolder(p1, common, common.revision)
  const retained = await lib.previewRemoveProject(project.projectId)
  await lib.removeProject(retained.token)
  await fs.unlink(folderFile(p1))
  await fs.unlink(folderFile(p1) + '.bak')
  const archive = projectFile(p1, project.projectId) + '.removed-' + retained.token,
    bytes = await fs.readFile(archive),
    rename = fs.rename.bind(fs)
  t.mock.method(
    fs,
    'rename',
    async (source: Parameters<typeof fs.rename>[0], target: Parameters<typeof fs.rename>[1]) => {
      if (String(target) === folderFile(p1))
        throw Object.assign(new Error('simulated disk full'), { code: 'ENOSPC' })
      return rename(source, target)
    }
  )
  await assert.rejects(ensureFolder(p1, false), /建立可攜記錄失敗/)
  assert.equal(await exists(folderFile(p1)), false)
  assert.deepEqual(await fs.readFile(archive), bytes)
  t.mock.restoreAll()
  const backup = await readJson(folderFile(p1) + '.bak')
  validateFolder(backup)
  await restoreJson(
    p1,
    folderFile(p1),
    validateFolder,
    (value) => value.folderId === backup.folderId
  )
  assert.equal((await readFolder(p1)).folderId, backup.folderId)
  assert.deepEqual(await fs.readFile(archive), bytes)
})

test('root and project corruption can reconnect and recover without replacing good backups', async (t) => {
  const { root, p1, lib } = await fixture(t)
  const s = await lib.create(p1, input),
    project = s.projects[0].project!
  const file = path.join(p1, DATA_DIR, 'projects', `${project.projectId}.json`)
  const backup = await fs.readFile(`${file}.bak`)
  await fs.writeFile(file, 'broken project')
  await fs.writeFile(folderFile(p1), 'broken root')
  const fresh = new Library(path.join(root, 'fresh'), undefined, false)
  await fresh.init()
  assert.ok((await fresh.link(p1)).projects[0].error)
  const recovered = await fresh.restoreProject(project.projectId)
  assert.equal(recovered.projects[0].error, undefined)
  assert.equal(recovered.rows.length, 3)
  assert.deepEqual(await fs.readFile(`${file}.bak`), backup)
  assert.ok((await fs.readdir(path.dirname(file))).some((n) => n.endsWith('.damaged')))
  await fs.writeFile(file, 'broken again')
  await fs.writeFile(`${file}.bak`, JSON.stringify({ ...project, rootFolderId: 'wrong-id' }))
  await assert.rejects(fresh.restoreProject(project.projectId), /身分不符/)
  assert.equal(await fs.readFile(file, 'utf8'), 'broken again')
})

test('failed atomic replacement leaves original readable and retry succeeds', async (t) => {
  const { p1, lib } = await fixture(t)
  const s = await createTextProject(lib, p1),
    row = s.rows.find((r) => r.name === 'A')!
  const original = await fs.readFile(folderFile(row.path)),
    rename = fs.rename
  const injected = t.mock.method(fs, 'rename', async (source: any, target: any) => {
    if (String(target) === folderFile(row.path))
      throw Object.assign(new Error('simulated disk full'), { code: 'ENOSPC' })
    return rename(source, target)
  })
  await assert.rejects(
    lib.saveValues(row.rowId, row.record!.revision, {
      [s.projects[0].project!.fieldBindings[0].attributeId]: 'new value',
    }),
    /disk full/
  )
  assert.deepEqual(await fs.readFile(folderFile(row.path)), original)
  assert.deepEqual(await fs.readFile(`${folderFile(row.path)}.bak`), original)
  injected.mock.restore()
  await lib.saveValues(row.rowId, row.record!.revision, {
    [s.projects[0].project!.fieldBindings[0].attributeId]: 'retry',
  })
  assert.equal((await readFolder(row.path)).attributes[0].value, 'retry')
})

test('cancelled scanning preserves completed records and can resume', async (t) => {
  const { root, p1 } = await fixture(t)
  for (let i = 0; i < 40; i++) await fs.mkdir(path.join(p1, `more-${i}`))
  let cancel = true
  const lib = new Library(
    path.join(root, 'cancel'),
    (progress) => {
      if (cancel && progress.visited >= 20) lib.cancelScan()
    },
    false
  )
  await lib.init()
  const partial = await lib.create(p1, input)
  assert.equal(partial.progress.cancelled, true)
  assert.ok(partial.rows.length >= 20 && partial.rows.length <= 27)
  const identities = new Map(partial.rows.map((row) => [row.path, row.record!.folderId]))
  cancel = false
  const complete = await lib.scan()
  assert.equal(complete.rows.length, 43)
  for (const row of complete.rows)
    if (identities.has(row.path)) assert.equal(row.record!.folderId, identities.get(row.path))
})

test(
  'Windows hidden batching treats special characters as data and refuses junctions',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const { root, p1, lib } = await fixture(t)
    const special = path.join(p1, "中文 [test] & ' $name")
    await fs.mkdir(special)
    await lib.create(p1, input)
    const outside = path.join(root, 'outside')
    await fs.mkdir(outside)
    const trap = path.join(root, 'trap')
    await fs.mkdir(trap)
    await fs.symlink(outside, path.join(trap, DATA_DIR), 'junction')
    const failures = await hideDirectories([special, trap])
    assert.equal(failures.length, 1)
    assert.equal(failures[0].dir, trap)
    const { stdout } = await promisify(execFile)('attrib.exe', [path.join(special, DATA_DIR)])
    assert.match(stdout.slice(0, stdout.indexOf(path.parse(special).root)), /H/)
    const hiddenLibrary = new Library(path.join(root, 'hidden-local'))
    await hiddenLibrary.init()
    const linked = await hiddenLibrary.link(p1)
    const row = linked.rows.find((r) => r.name === 'A')!
    const preview = await hiddenLibrary.previewCleanup(row.rowId)
    await hiddenLibrary.cleanup(preview.token, false)
    await hiddenLibrary.resume(row.rowId)
    const resumed = await promisify(execFile)('attrib.exe', [path.join(row.path, DATA_DIR)])
    assert.match(resumed.stdout.slice(0, resumed.stdout.indexOf(path.parse(row.path).root)), /H/)
  }
)

test(
  'Windows denied-write ACL reports the row and scan continues',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const { p1, lib } = await fixture(t),
      target = path.join(p1, 'A'),
      exec = promisify(execFile)
    // Absolute paths: a Unix-style whoami earlier in PATH (Git for Windows) does not understand these options.
    const system32 = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32'),
      icacls = path.join(system32, 'icacls.exe')
    const { stdout } = await exec(path.join(system32, 'whoami.exe'), ['/user', '/fo', 'csv', '/nh'])
    const sid = stdout.match(/S-1-[\d-]+/)?.[0]
    assert.ok(sid)
    await exec(icacls, [target, '/deny', `*${sid}:(W)`])
    try {
      const s = await lib.create(p1, input)
      assert.ok(s.rows.find((r) => r.name === 'A')!.error)
      assert.ok(s.rows.find((r) => r.name === 'B')!.record)
      assert.equal(await exists(folderFile(target)), false)
    } finally {
      await exec(icacls, [target, '/remove:d', `*${sid}`])
    }
    assert.ok((await lib.scan()).rows.find((r) => r.name === 'A')!.record)
  }
)

test('legacy string import backs up originals and retry preserves user edits', async (t) => {
  const { root, p1, lib } = await fixture(t)
  const base = path.join(root, 'local', 'app-data')
  const write = async (file: string, value: unknown) => {
    const target = path.join(base, file)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, JSON.stringify(value))
  }
  await write('view.json', [{ id: 'old-view', name: '舊收藏', targetFolderPath: p1 }])
  await write('viewColumn/old-view.json', ['title'])
  await write('column/title.json', { id: 'old-column', dataSource: 'USER', dataType: 'STRING' })
  await write('viewFolder/old-view.json', ['old-folder'])
  await write('folder/old-folder.json', {
    lastReadPath: path.join(p1, 'A'),
    cells: [{ key: 'title', value: '舊作品' }],
  })
  let preview = await lib.previewLegacy()
  const imported = await lib.importLegacy(preview.token, ['old-view'], input.depth)
  assert.deepEqual(imported.imported, ['舊收藏（匯入）'])
  assert.deepEqual(imported.warnings, [])
  assert.ok(await exists(path.join(imported.backup, 'view.json')))
  let s = lib.snapshot(),
    a = s.rows.find((r) => r.name === 'A')!
  const id = s.projects[0].project!.fieldBindings[0].attributeId
  assert.equal(a.record!.attributes.find((v) => v.attributeId === id)!.value, '舊作品')
  await lib.saveValues(a.rowId, a.record!.revision, { [id]: '手動修正' })
  preview = await lib.previewLegacy()
  await lib.importLegacy(preview.token, ['old-view'], input.depth)
  s = lib.snapshot()
  a = s.rows.find((r) => r.name === 'A')!
  assert.equal(s.projects.length, 1)
  assert.equal(a.record!.attributes.find((v) => v.attributeId === id)!.value, '手動修正')
  assert.equal((await fs.readdir(path.join(root, 'local', 'legacy-backups'))).length, 2)
  assert.equal(
    ((await readJson(path.join(base, 'folder/old-folder.json'))) as any).cells[0].value,
    '舊作品'
  )
})

test('depth modes, portable values, templates, fresh-device reconnect and images', async (t) => {
  const { root, p1, p2, lib } = await fixture(t)
  let s = await createTextProject(lib, p1),
    p = s.projects[0].project!
  assert.deepEqual(s.rows.map((r) => r.name).sort(), ['A', 'B', 'P1'])
  s = await lib.saveProject({ ...p, depth: { mode: 'exact', level: 3 } })
  assert.deepEqual(
    s.rows.map((r) => r.name),
    ['C']
  )
  assert.ok(await readFolder(path.join(p1, 'B')))
  p = s.projects[0].project!
  s = await lib.saveProject({ ...p, depth: input.depth })
  p = s.projects[0].project!
  let a = s.rows.find((r) => r.name === 'A')!,
    field = p.fieldBindings[0].attributeId
  s = await lib.saveValues(a.rowId, a.record!.revision, { [field]: '可攜作品 A' })
  a = s.rows.find((r) => r.name === 'A')!
  const image = path.join(root, 'cover.png'),
    bytes = Buffer.from('89504e470d0a1a0a00000000', 'hex')
  await fs.writeFile(image, bytes)
  s = await lib.addImage(a.rowId, a.record!.revision, image)
  a = s.rows.find((r) => r.name === 'A')!
  const originalId = a.record!.folderId
  await lib.create(p2, { ...input, name: '目的專案' })
  await fs.rename(path.join(p1, 'A'), path.join(p2, 'A'))
  s = await lib.scan()
  a = s.rows.find((r) => r.name === 'A')!
  assert.equal(a.record!.folderId, originalId)
  assert.equal(a.record!.attributes[0].value, '可攜作品 A')
  assert.equal(s.projects[1].project!.fieldBindings.length, 0)
  const asset = await lib.asset(a.rowId, a.record!.assets[0].assetId)
  assert.deepEqual(await fs.readFile(asset.file), bytes)
  const newDevice = new Library(path.join(root, 'fresh-device'), undefined, false)
  await newDevice.init()
  s = await newDevice.link(p2)
  assert.equal(s.rows.find((r) => r.name === 'A')!.record!.folderId, originalId)
  assert.equal(s.projects[0].project!.cells.length, 3)
})

test('revision conflicts and interrupted writes preserve saved record; backup restores corrupt data', async (t) => {
  const { p1, lib } = await fixture(t)
  let s = await createTextProject(lib, p1),
    a = s.rows.find((r) => r.name === 'A')!,
    field = s.projects[0].project!.fieldBindings[0].attributeId
  const revision = a.record!.revision
  s = await lib.saveValues(a.rowId, revision, { [field]: '已保存' })
  a = s.rows.find((r) => r.name === 'A')!
  await assert.rejects(lib.saveValues(a.rowId, revision, { [field]: '舊草稿' }), /版本/)
  assert.equal((await readFolder(a.path)).attributes[0].value, '已保存')
  await fs.writeFile(`${folderFile(a.path)}.unfinished.tmp`, '{ partial')
  s = await lib.scan()
  assert.equal(s.rows.find((r) => r.name === 'A')!.record!.attributes[0].value, '已保存')
  await lib.saveValues(a.rowId, a.record!.revision, { [field]: '下一版' })
  await fs.writeFile(folderFile(a.path), '{broken')
  s = await lib.scan()
  a = s.rows.find((r) => r.name === 'A')!
  assert.ok(a.error)
  await assert.rejects(lib.saveValues(a.rowId, 3, { [field]: '不要覆寫' }))
  s = await lib.restore(a.rowId)
  assert.equal(s.rows.find((r) => r.name === 'A')!.record!.attributes[0].value, '已保存')
  assert.ok((await fs.readdir(path.join(a.path, DATA_DIR))).some((n) => n.endsWith('.damaged')))
})

test('O80 cleanup excludes overlapping projects, portable exclusions and moved fresh identity', async (t) => {
  const { root, p1, p2, lib } = await fixture(t)
  await fs.writeFile(path.join(p1, 'A', 'original.txt'), 'original media')
  await lib.create(p1, input)
  await lib.create(p1, { ...input, name: '同根第二專案' })
  let s = await lib.create(p2, input)
  const a = s.rows.find((r) => r.name === 'A')!,
    oldId = a.record!.folderId
  const preview = await lib.previewCleanup(a.rowId)
  assert.equal(preview.count, 1)
  await lib.cleanup(preview.token, false)
  s = lib.snapshot()
  assert.equal(s.rows.filter((r) => r.name === 'A' && r.stopped).length, 2)
  assert.equal(await exists(folderFile(a.path)), false)
  assert.equal(await fs.readFile(path.join(a.path, 'original.txt'), 'utf8'), 'original media')
  const fresh = new Library(path.join(root, 'fresh'), undefined, false)
  await fresh.init()
  s = await fresh.link(p1)
  assert.ok(s.rows.filter((r) => r.name === 'A').every((r) => r.stopped))
  await fs.rename(path.join(p1, 'A'), path.join(p2, 'A'))
  s = await lib.scan()
  const moved = s.rows.find((r) => r.name === 'A')!
  assert.notEqual(moved.record!.folderId, oldId)
  assert.equal(moved.record!.attributes.length, 0)
  assert.ok(
    s.projects.filter((p) => p.root === p1).every((p) => !p.project!.excludedRelativePaths.length)
  )
})

test('cleanup preview refuses changed data and never deletes unknown files or originals', async (t) => {
  const { p1, lib } = await fixture(t)
  let s = await createTextProject(lib, p1),
    a = s.rows.find((r) => r.name === 'A')!
  const preview = await lib.previewCleanup(a.rowId)
  await lib.saveValues(a.rowId, a.record!.revision, {
    [s.projects[0].project!.fieldBindings[0].attributeId]: 'changed',
  })
  await assert.rejects(lib.cleanup(preview.token, false), /預覽後資料已變更/)
  await fs.writeFile(path.join(a.path, DATA_DIR, 'unrelated.txt'), 'keep me')
  await fs.writeFile(path.join(a.path, 'game.dat'), 'original')
  const all = await lib.previewCleanup(undefined, 'all')
  assert.ok(all.skipped.some((s) => s.includes('unrelated.txt')))
  const result = await lib.cleanup(all.token, false)
  assert.equal(result.failed.length, 0)
  assert.equal(lib.snapshot().projects.length, 0)
  assert.equal(await fs.readFile(path.join(a.path, DATA_DIR, 'unrelated.txt'), 'utf8'), 'keep me')
  assert.equal(await fs.readFile(path.join(a.path, 'game.dat'), 'utf8'), 'original')
  assert.equal(await exists(folderFile(a.path)), false)
})

test('duplicate IDs block writes until explicit copy resolution', async (t) => {
  const { p1, lib } = await fixture(t)
  await lib.create(p1, input)
  await fs.cp(path.join(p1, 'A'), path.join(p1, 'copy'), { recursive: true })
  let s = await lib.scan(),
    copies = s.rows.filter((r) => r.duplicate)
  assert.equal(copies.length, 2)
  await assert.rejects(lib.saveValues(copies[0].rowId, copies[0].record!.revision, {}))
  s = await lib.copyIdentity(copies.find((r) => r.name === 'copy')!.rowId)
  assert.equal(s.rows.filter((r) => r.duplicate).length, 0)
})

test('foreign metadata and junctions are not followed or overwritten', async (t) => {
  const { root, p1, lib } = await fixture(t)
  const foreign = path.join(p1, 'A', DATA_DIR)
  await fs.mkdir(foreign)
  await fs.writeFile(path.join(foreign, 'mine.txt'), 'foreign')
  const outside = path.join(root, 'outside')
  await fs.mkdir(outside)
  await fs.symlink(
    outside,
    path.join(p1, 'linked'),
    process.platform === 'win32' ? 'junction' : 'dir'
  )
  const s = await lib.create(p1, input)
  assert.ok(s.rows.find((r) => r.name === 'A')!.error)
  assert.equal(await exists(path.join(outside, DATA_DIR)), false)
  await assert.rejects(safePath(p1, path.join(p1, 'linked', 'payload')))
  const preview = await lib.previewCleanup(undefined, 'all')
  assert.ok(preview.skipped.some((s) => s.includes('A')))
  await lib.cleanup(preview.token, false)
  assert.equal(await fs.readFile(path.join(foreign, 'mine.txt'), 'utf8'), 'foreign')
})

test('project writes reject overlapping cells and preserve external revision changes', async (t) => {
  const { p1, lib } = await fixture(t)
  const s = await lib.create(p1, input),
    p = s.projects[0].project!
  const bad = structuredClone(p)
  bad.cells[1].grid = { ...bad.cells[0].grid }
  await assert.rejects(lib.saveProject(bad), /重疊/)
  const file = path.join(p1, DATA_DIR, 'projects', `${p.projectId}.json`)
  await atomicJson(file, { ...p, revision: 2, name: '外部修改' }, 1)
  await assert.rejects(lib.saveProject({ ...p, name: '舊草稿' }), /版本/)
  assert.equal(((await readJson(file)) as Project).name, '外部修改')
})

test('removing an unused empty root retires all root metadata to verified local recovery and recreates cleanly', async (t) => {
  const { p1, lib } = await fixture(t),
    state = await lib.create(p1, input),
    project = state.projects[0].project!,
    child = await fs.readFile(folderFile(path.join(p1, 'A')))
  await fs.writeFile(path.join(p1, 'original.txt'), 'MEDIA')
  const primary = await fs.readFile(folderFile(p1)),
    backup = await fs.readFile(folderFile(p1) + '.bak'),
    definition = await fs.readFile(projectFile(p1, project.projectId)),
    preview = await lib.previewRemoveProject(project.projectId)
  assert.equal(preview.rootCleanup, true)
  assert.equal(await exists(folderFile(p1)), true)
  assert.deepEqual((await lib.removeProject(preview.token)).failed, [])
  assert.equal(await exists(path.join(p1, DATA_DIR)), false)
  const recovery = preview.recoveryPath!
  assert.deepEqual(await fs.readFile(path.join(recovery, DATA_DIR, 'folder.json')), primary)
  assert.deepEqual(await fs.readFile(path.join(recovery, DATA_DIR, 'folder.json.bak')), backup)
  assert.deepEqual(
    await fs.readFile(
      path.join(
        recovery,
        DATA_DIR,
        'projects',
        project.projectId + '.json.removed-' + preview.token
      )
    ),
    definition
  )
  assert.equal(((await readJson(path.join(recovery, 'manifest.json'))) as any).root, p1)
  assert.equal(await fs.readFile(path.join(p1, 'original.txt'), 'utf8'), 'MEDIA')
  assert.deepEqual(await fs.readFile(folderFile(path.join(p1, 'A'))), child)
  const next = await lib.create(p1, { ...input, name: 'Recreated' }),
    created = next.projects[0].project!
  assert.notEqual(created.projectId, project.projectId)
  assert.notEqual(created.rootFolderId, project.rootFolderId)
  assert.equal(next.problems.length, 0)
  assert.equal((await lib.link(p1)).projects.length, 1)
})
test('root retirement keeps unknown/shared/overlapping data and rejects additions after preview', async (t) => {
  const { p1, lib } = await fixture(t),
    state = await lib.create(p1, input),
    project = state.projects[0].project!,
    preview = await lib.previewRemoveProject(project.projectId),
    unknown = path.join(p1, DATA_DIR, 'unknown.txt')
  await fs.writeFile(unknown, 'UNKNOWN')
  await assert.rejects(lib.removeProject(preview.token), /根資料夾內容或歸屬已變更/)
  assert.equal(lib.snapshot().projects.length, 1)
  const retained = await lib.previewRemoveProject(project.projectId)
  assert.equal(retained.rootCleanup, false)
  await lib.removeProject(retained.token)
  assert.equal(await fs.readFile(unknown, 'utf8'), 'UNKNOWN')
  assert.ok(await readFolder(p1))
  const next = await lib.create(p1, input)
  assert.equal(next.problems.length, 0)
  const childState = await lib.create(path.join(p1, 'A'), input),
    parent = childState.projects.find((p) => p.root === p1)!.project!
  await fs.unlink(unknown)
  assert.equal((await lib.previewRemoveProject(parent.projectId)).rootCleanup, false)
})
test('recovery copy or root cleanup failure keeps readable primary identity and recoverable media', async (t) => {
  for (const failure of ['copy', 'unlink', 'rmdir']) {
    const { p1, lib } = await fixture(t),
      state = await lib.create(p1, input),
      project = state.projects[0].project!,
      primary = await fs.readFile(folderFile(p1)),
      preview = await lib.previewRemoveProject(project.projectId)
    await fs.writeFile(path.join(p1, 'media.bin'), 'ORIGINAL')
    const open = fs.open.bind(fs),
      unlink = fs.unlink.bind(fs),
      rmdir = fs.rmdir.bind(fs)
    if (failure === 'copy')
      t.mock.method(fs, 'open', async (...args: Parameters<typeof fs.open>) => {
        if (String(args[0]).startsWith(preview.recoveryPath!))
          throw new Error('simulated recovery disk full')
        return open(...args)
      })
    else if (failure === 'unlink')
      t.mock.method(fs, 'unlink', async (file: Parameters<typeof fs.unlink>[0]) => {
        if (String(file) === folderFile(p1) + '.bak') throw new Error('simulated cleanup denied')
        return unlink(file)
      })
    else
      t.mock.method(fs, 'rmdir', async (...args: Parameters<typeof fs.rmdir>) => {
        if (String(args[0]) === path.join(p1, DATA_DIR))
          throw new Error('simulated final directory denied')
        return rmdir(...args)
      })
    const result = await lib.removeProject(preview.token)
    assert.equal(result.failed.length, 1)
    assert.deepEqual(await fs.readFile(folderFile(p1)), primary)
    assert.equal(await fs.readFile(path.join(p1, 'media.bin'), 'utf8'), 'ORIGINAL')
    if (failure === 'unlink')
      assert.deepEqual(
        await fs.readFile(path.join(preview.recoveryPath!, DATA_DIR, 'folder.json')),
        primary
      )
    t.mock.restoreAll()
    assert.equal((await lib.create(p1, input)).projects[0].error, undefined)
  }
})
