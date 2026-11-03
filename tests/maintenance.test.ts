import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import {
  folderFile,
  projectFile,
  fingerprint,
  readFolder,
  readJson,
  exists,
} from '../electron/files'
import { applyMaintenance, managedTree, MaintenanceFailure } from '../electron/maintenance'
async function fixture(t: { after: (callback: () => Promise<void>) => void }) {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'maintenance-')),
    media = path.join(root, 'media'),
    local = path.join(root, 'local')
  await fs.mkdir(path.join(media, 'A'), { recursive: true })
  await fs.writeFile(path.join(media, 'original.bin'), 'ORIGINAL')
  const lib = new Library(local, undefined, false)
  await lib.init()
  await lib.create(media, {
    name: 'Primary',
    scanAll: true,
    depth: { mode: 'through', level: 3 },
  })
  t.after(async () => {
    assert.ok((await fs.realpath(root)).startsWith(base + path.sep))
    await fs.rm(root, { recursive: true, force: true })
  })
  return { root, media, local, lib }
}
test('field deletion previews identities, zero/false values, references and shared projects; stale and cancelled previews do not write', async (t) => {
  const { lib, media } = await fixture(t)
  let project = lib.snapshot().projects[0].project!
  project = {
    ...project,
    fieldBindings: [
      { alias: 'Same', attributeId: 'target', type: 'number' },
      { alias: 'Other', attributeId: 'keep', type: 'number' },
    ],
    cells: [{ ...project.cells[0], kind: 'field-number', attributeId: 'target' }],
    savedSearches: [
      {
        id: 'query',
        name: 'Saved',
        query: 'Same:0',
        queryAst: {
          version: 1,
          groups: [[{ field: 'target', type: 'number', value: '0', exclude: false }]],
        },
      },
    ],
  }
  await lib.saveProject(project)
  const record = await readFolder(media)
  record.attributes = [
    { attributeId: 'target', key: 'Same', type: 'number', value: 0, source: 'manual' },
    { attributeId: 'keep', key: 'Same', type: 'number', value: 1, source: 'manual' },
  ]
  await fs.writeFile(folderFile(media), JSON.stringify(record))
  await lib.scan()
  const before = await fs.readFile(folderFile(media), 'utf8'),
    preview = await lib.previewDeleteField(project.projectId, 'target')
  assert.equal(preview.fields, 1)
  assert.equal(preview.values, 1)
  assert.equal(preview.folders, 1)
  assert.ok(preview.references >= 2)
  assert.equal(await fs.readFile(folderFile(media), 'utf8'), before)
  record.attributes[0].value = 2
  await fs.writeFile(folderFile(media), JSON.stringify(record))
  await assert.rejects(lib.deleteField(preview.token), /變更|失效/)
  const current = await lib.previewDeleteField(project.projectId, 'target')
  await lib.deleteField(current.token)
  assert.deepEqual(
    (await readFolder(media)).attributes.map((field) => field.attributeId),
    ['keep']
  )
  assert.equal(lib.snapshot().projects[0].project!.fieldBindings.length, 1)
  assert.equal(lib.snapshot().projects[0].project!.cells.length, 0)
  assert.equal(lib.snapshot().projects[0].project!.savedSearches!.length, 0)
  assert.equal(await fs.readFile(path.join(media, 'original.bin'), 'utf8'), 'ORIGINAL')
})
test('full removal includes historical protected descendants and archives, reports overlaps and preserves original/unknown files', async (t) => {
  const { lib, media, local } = await fixture(t),
    id = lib.snapshot().projects[0].projectId
  await lib.create(path.join(media, 'A'), {
    name: 'Nested',
    scanAll: true,
    depth: { mode: 'through', level: 2 },
  })
  const nestedId = lib.snapshot().projects[1].projectId
  await lib.create(media, {
    name: 'Same root',
    depth: { mode: 'through', level: 1 },
  })
  await fs.writeFile(path.join(media, '.media-viewer', 'unknown.txt'), 'KEEP')
  const preview = await lib.previewFullRemoval(id)
  assert.equal(preview.affectedProjects[0].name, 'Nested')
  assert.ok(preview.paths.some((file) => file === folderFile(path.join(media, 'A'))))
  assert.equal(preview.affectedProjects.length, 2)
  assert.ok(preview.skipped.some((text) => text.includes('unknown.txt')))
  const result = await lib.fullRemoveProject(preview.token)
  assert.deepEqual(result.failed, [])
  assert.equal(await exists(folderFile(media)), false)
  assert.equal(await exists(folderFile(path.join(media, 'A'))), false)
  assert.equal(await exists(projectFile(path.join(media, 'A'), nestedId)), false)
  assert.equal(lib.snapshot().projects.length, 0)
  assert.equal(await fs.readFile(path.join(media, '.media-viewer', 'unknown.txt'), 'utf8'), 'KEEP')
  assert.equal(await fs.readFile(path.join(media, 'original.bin'), 'utf8'), 'ORIGINAL')
  assert.ok((await fs.readdir(local)).some((name) => name === 'maintenance-backups'))
  await lib.create(path.join(media, 'A'), {
    name: 'New',
    depth: { mode: 'through', level: 1 },
  })
  assert.equal(lib.snapshot().projects.length, 1)
})
test('full removal restores a pristine metadata tree and a recreated project gets a new folder identity', async (t) => {
  const { lib, media } = await fixture(t),
    old = (await readFolder(media)).folderId
  const preview = await lib.previewFullRemoval(lib.snapshot().projects[0].projectId)
  await lib.fullRemoveProject(preview.token)
  assert.equal(await exists(path.join(media, '.media-viewer')), false)
  await lib.create(media, {
    name: 'New',
    scanAll: true,
    depth: { mode: 'through', level: 3 },
  })
  assert.notEqual((await readFolder(media)).folderId, old)
  assert.equal(await fs.readFile(path.join(media, 'original.bin'), 'utf8'), 'ORIGINAL')
})
test('backup failure prevents full removal and leaves definitions, links, and original bytes intact', async (t) => {
  const { lib, media, local } = await fixture(t),
    before = lib.snapshot(),
    bytes = await fs.readFile(folderFile(media))
  const preview = await lib.previewFullRemoval(before.projects[0].projectId),
    open = fs.open
  fs.open = (async (...args: Parameters<typeof fs.open>) => {
    if (String(args[0]).startsWith(path.join(local, 'maintenance-backups')))
      throw new Error('CONTROLLED BACKUP FAILURE')
    return open(...args)
  }) as typeof fs.open
  try {
    await assert.rejects(lib.fullRemoveProject(preview.token), /BACKUP FAILURE/)
  } finally {
    fs.open = open
  }
  assert.deepEqual(await fs.readFile(folderFile(media)), bytes)
  assert.deepEqual(lib.snapshot(), before)
  assert.ok(await exists(projectFile(media, before.projects[0].projectId)))
})
test('maintenance restores exact bytes on mid-write failure and refuses stale bytes or an in-tree backup', async (t) => {
  const { media, local } = await fixture(t),
    one = folderFile(media),
    two = folderFile(path.join(media, 'A'))
  const before = await fs.readFile(one),
    beforeTwo = await fs.readFile(two)
  const changes = [
    { root: media, path: one, hash: await fingerprint(one), value: { changed: true } },
    { root: media, path: two, hash: await fingerprint(two), value: { unserializable: 1n } },
  ]
  await assert.rejects(
    applyMaintenance(changes, path.join(local, 'recovery'), local, [media]),
    /已復原/
  )
  assert.deepEqual(await fs.readFile(one), before)
  assert.deepEqual(await fs.readFile(two), beforeTwo)
  await assert.rejects(
    applyMaintenance(changes, path.join(media, 'backup'), local, [media]),
    /範圍外/
  )
  changes[0].hash = 'stale'
  await assert.rejects(applyMaintenance(changes, path.join(local, 'stale'), local, [media]), /變更/)
  assert.equal(await exists(path.join(local, 'stale')), false)
})
test('incomplete data restoration retains durable scan stops', async (t) => {
  const { media, local } = await fixture(t),
    stop = path.join(local, 'stop.json'),
    one = folderFile(media),
    two = folderFile(path.join(media, 'A'))
  await fs.writeFile(stop, JSON.stringify({ stopped: false }))
  const rename = fs.rename
  fs.rename = (async (...args: Parameters<typeof fs.rename>) => {
    if (String(args[1]) === one) throw new Error('CONTROLLED RESTORE FAILURE')
    return rename(...args)
  }) as typeof fs.rename
  try {
    await assert.rejects(
      applyMaintenance(
        [
          {
            root: local,
            path: stop,
            hash: await fingerprint(stop),
            value: { stopped: true },
            stopScan: true,
          },
          { root: media, path: one, hash: await fingerprint(one) },
          { root: media, path: two, hash: await fingerprint(two), value: { invalid: 1n } },
        ],
        path.join(local, 'partial'),
        local,
        [media]
      ),
      (error) => error instanceof MaintenanceFailure && error.rollbackIncomplete
    )
  } finally {
    fs.rename = rename
  }
  assert.deepEqual(await readJson(stop), { stopped: true })
  assert.equal(await exists(one), false)
  assert.ok(await exists(path.join(local, 'partial', 'manifest.json')))
})
test('full removal invalidates changed bindings and added metadata, excludes ancestors and never recreates removed records', async (t) => {
  const { lib, media } = await fixture(t),
    ancestor = lib.snapshot().projects[0].projectId
  await lib.create(path.join(media, 'A'), {
    name: 'Nested',
    scanAll: true,
    depth: { mode: 'through', level: 1 },
  })
  const nested = lib.snapshot().projects[1].projectId,
    preview = await lib.previewFullRemoval(nested)
  assert.ok(preview.affectedProjects.some((p) => p.projectId === ancestor))
  await fs.writeFile(path.join(media, 'A', '.media-viewer', 'unknown-after-preview'), 'KEEP')
  await assert.rejects(lib.fullRemoveProject(preview.token), /變更/)
  assert.ok(await exists(folderFile(path.join(media, 'A'))))
  const current = await lib.previewFullRemoval(nested)
  await lib.fullRemoveProject(current.token)
  await lib.scan()
  assert.equal(await exists(folderFile(path.join(media, 'A'))), false)
  assert.ok(lib.snapshot().projects[0].project!.excludedRelativePaths.includes('A'))
  const stale = await lib.previewFullRemoval(ancestor)
  await lib.create(media, {
    name: 'Other',
    depth: { mode: 'through', level: 1 },
  })
  await assert.rejects(lib.fullRemoveProject(stale.token), /失效/)
})
test('field deletion counts false and zero across shared/private values and projects, without deleting equal names with different identities', async (t) => {
  const { lib, media } = await fixture(t),
    first = lib.snapshot().projects[0].projectId
  await lib.create(media, {
    name: 'Shared',
    scanAll: true,
    depth: { mode: 'through', level: 2 },
  })
  for (const ref of lib.snapshot().projects)
    await lib.saveProject({
      ...ref.project!,
      fieldBindings: [
        { alias: 'Flag', attributeId: 'flag', type: 'boolean' },
        { alias: 'Score', attributeId: 'score', type: 'number' },
      ],
      cells: [{ ...ref.project!.cells[0], kind: 'field-boolean', attributeId: 'flag' }],
    })
  const record = await readFolder(media)
  record.attributes = [
    { attributeId: 'flag', key: 'Flag', type: 'boolean', value: false, source: 'manual' },
    { attributeId: 'other-flag', key: 'Flag', type: 'boolean', value: true, source: 'manual' },
  ]
  record.projectOverrides[first] = [
    { attributeId: 'flag', key: 'Flag', type: 'boolean', value: false, source: 'manual' },
  ]
  record.projectOverrides['unlinked-owner'] = [
    { attributeId: 'flag', key: 'Flag', type: 'boolean', value: true, source: 'manual' },
  ]
  await fs.writeFile(folderFile(media), JSON.stringify(record))
  await lib.scan()
  const preview = await lib.previewDeleteField(first, 'flag')
  assert.equal(preview.fields, 2)
  assert.equal(preview.values, 2)
  assert.equal(preview.projects.length, 2)
  assert.ok(preview.skipped.some((text) => text.includes('unlinked-owner')))
  await lib.deleteField(preview.token)
  assert.deepEqual(
    (await readFolder(media)).attributes.map((a) => a.attributeId),
    ['other-flag']
  )
  assert.deepEqual((await readFolder(media)).projectOverrides[first], [])
  assert.equal((await readFolder(media)).projectOverrides['unlinked-owner'][0].value, true)
  for (const ref of lib.snapshot().projects)
    assert.equal(
      ref.project!.fieldBindings.some((field) => field.attributeId === 'flag'),
      false
    )
})
test('field preview expires when another indexed folder enters the affected scope', async (t) => {
  const { lib, media } = await fixture(t),
    project = lib.snapshot().projects[0].project!
  await lib.saveProject({
    ...project,
    fieldBindings: [{ attributeId: 'flag', alias: 'Flag', type: 'boolean' }],
  })
  const preview = await lib.previewDeleteField(project.projectId, 'flag'),
    before = await fs.readFile(projectFile(media, project.projectId))
  await fs.mkdir(path.join(media, 'Added'))
  await lib.scan()
  const record = await readFolder(path.join(media, 'Added'))
  record.attributes = [
    { attributeId: 'flag', key: 'Flag', type: 'boolean', value: false, source: 'manual' },
  ]
  await fs.writeFile(folderFile(path.join(media, 'Added')), JSON.stringify(record))
  await lib.scan()
  await assert.rejects(lib.deleteField(preview.token), /失效/)
  assert.deepEqual(await fs.readFile(projectFile(media, project.projectId)), before)
})
test('field deletion also scrubs backup-only references and preserves unrelated legacy searches on imported fields', async (t) => {
  const { lib, media } = await fixture(t),
    first = lib.snapshot().projects[0].project!
  await lib.saveProject({
    ...first,
    fieldBindings: [{ attributeId: 'target', alias: 'Target', type: 'number' }],
  })
  await lib.create(path.join(media, 'A'), {
    name: 'Backup only',
    depth: { mode: 'through', level: 1 },
  })
  const other = lib.snapshot().projects[1].project!,
    projectBackup = projectFile(path.join(media, 'A'), other.projectId) + '.bak'
  await fs.writeFile(
    projectBackup,
    JSON.stringify({
      ...other,
      fieldBindings: [{ attributeId: 'target', alias: 'Target', type: 'number' }],
    })
  )
  const record = await readFolder(path.join(media, 'A'))
  await fs.writeFile(
    folderFile(path.join(media, 'A')) + '.bak',
    JSON.stringify({
      ...record,
      attributes: [
        { attributeId: 'target', key: 'Target', type: 'number', value: 0, source: 'manual' },
      ],
    })
  )
  const rootRecord = await readFolder(media)
  rootRecord.attributes = [
    {
      attributeId: 'imported',
      key: 'Imported',
      type: 'string',
      value: 'example',
      source: 'manual',
    },
  ]
  await fs.writeFile(folderFile(media), JSON.stringify(rootRecord))
  const current = (await readJson(projectFile(media, first.projectId))) as typeof first
  current.savedSearches = [
    { id: 'legacy', name: 'Imported search', query: 'Imported:example' },
    { id: 'unknown', name: 'Unknown', query: 'Unavailable:value' },
  ]
  await fs.writeFile(projectFile(media, first.projectId), JSON.stringify(current))
  await lib.scan()
  const preview = await lib.previewDeleteField(first.projectId, 'target')
  assert.ok(preview.projects.some((p) => p.projectId === other.projectId))
  await lib.deleteField(preview.token)
  assert.equal(((await readJson(projectBackup)) as typeof first).fieldBindings.length, 0)
  assert.equal(
    ((await readJson(folderFile(path.join(media, 'A')) + '.bak')) as typeof rootRecord).attributes
      .length,
    0
  )
  assert.equal(lib.snapshot().projects[0].project!.savedSearches!.length, 2)
})
test('full metadata inventory handles historical game records and archived definitions; rejects junctions and preserves unknown/corrupt files', async (t) => {
  const { lib, media, root } = await fixture(t),
    project = lib.snapshot().projects[0]
  const historical = path.join(media, 'A', 'resources', 'app', 'data')
  await fs.mkdir(historical, { recursive: true })
  await fs.cp(path.join(media, 'A', '.media-viewer'), path.join(historical, '.media-viewer'), {
    recursive: true,
  })
  await fs.copyFile(
    projectFile(media, project.projectId),
    projectFile(media, project.projectId) + '.removed-history'
  )
  await fs.writeFile(path.join(media, 'A', 'UnityPlayer.dll'), 'CONTROLLED')
  await fs.mkdir(path.join(media, 'A', 'A_Data'))
  const outside = path.join(root, 'outside')
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, 'original'), 'OUTSIDE')
  await fs.symlink(outside, path.join(media, 'linked'), 'junction')
  const tree = await managedTree(media)
  assert.ok(tree.files.some((file) => file.path === folderFile(historical)))
  assert.ok(tree.files.some((file) => file.path.endsWith('.removed-history')))
  assert.ok(tree.skipped.some((file) => file.includes('linked')))
  const preview = await lib.previewFullRemoval(project.projectId)
  await lib.fullRemoveProject(preview.token)
  assert.equal(await exists(folderFile(historical)), false)
  assert.equal(await fs.readFile(path.join(outside, 'original'), 'utf8'), 'OUTSIDE')
})
