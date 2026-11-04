import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { WorkspaceStore } from '../electron/workspace'
import { applyBackup, createBackup, locateBackupProject, previewBackup } from '../electron/backup'
import { folderFile, readFolder, saveFolder } from '../electron/files'

// Backup and restore on controlled folders only: create, restore in place, a moved root, a tampered list.
async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'backup-'))
  t.after(async () => {
    const target = await fs.realpath(root)
    if (!target.startsWith(base + path.sep)) throw new Error('Unsafe cleanup')
    await fs.rm(target, { recursive: true, force: true })
  })
  const media = path.join(root, 'Library'),
    local = path.join(root, 'local'),
    out = path.join(root, 'backups')
  await fs.mkdir(path.join(media, 'A'), { recursive: true })
  await fs.writeFile(path.join(media, 'A', 'page.txt'), 'ORIGINAL')
  await fs.mkdir(out)
  const library = new Library(local, undefined, false)
  await library.init()
  await library.create(media, { name: 'Shelf', depth: { mode: 'through', level: 2 } })
  const a = library.snapshot().rows.find((r) => r.name === 'A')!
  const record = await readFolder(a.path)
  record.attributes = [
    { attributeId: 'note', key: 'Note', type: 'text', value: 'kept', source: 'manual' },
  ]
  await saveFolder(a.path, record, record.revision)
  await library.scan()
  const workspace = new WorkspaceStore(local, ['zh-TW'])
  await workspace.init()
  const ids = () => library.snapshot().projects.map((p) => p.projectId)
  return { root, media, local, out, library, workspace, ids }
}

test('a backup holds settings and every project; restoring in place keeps existing records', async (t) => {
  const { media, out, library, workspace, ids } = await setup(t)
  const created = await createBackup(library, workspace, ids(), out, '0.0.0-test')
  assert.equal(created.projects, 1)
  assert.deepEqual(created.skipped, [])
  const manifest = JSON.parse(await fs.readFile(path.join(created.dir, 'backup.json'), 'utf8'))
  assert.equal(manifest.kind, 'morph.backup')
  assert.equal(manifest.projects[0].name, 'Shelf')
  const settings = JSON.parse(await fs.readFile(path.join(created.dir, 'settings.json'), 'utf8'))
  assert.equal(settings.kind, 'media-viewer.settings')

  const before = await fs.readFile(folderFile(path.join(media, 'A')))
  const preview = await previewBackup(library, workspace, ids(), created.dir)
  assert.equal(preview.projects[0].state, 'ready')
  assert.ok(preview.settings)
  const result = await applyBackup(library, workspace, ids, preview.token, true, [
    preview.projects[0].projectId,
  ])
  assert.deepEqual(result.failed, [])
  assert.deepEqual(result.projects, ['Shelf'])
  assert.equal(result.settings, true)
  assert.deepEqual(await fs.readFile(folderFile(path.join(media, 'A'))), before)
  assert.equal(await fs.readFile(path.join(media, 'A', 'page.txt'), 'utf8'), 'ORIGINAL')
  // A used preview cannot be applied twice.
  await assert.rejects(applyBackup(library, workspace, ids, preview.token, false, []), /失效/)
})

test('a moved root is reported missing and can be pointed at its new place', async (t) => {
  const { root, media, out, library, workspace, ids } = await setup(t)
  const created = await createBackup(library, workspace, ids(), out, '0.0.0-test')
  const projectId = ids()[0]
  await library.unlink(projectId)
  const moved = path.join(root, 'Moved')
  await fs.rename(media, moved)
  // Folder info travels with the folders, so the moved root can be restored and linked again.
  const preview = await previewBackup(library, workspace, ids(), created.dir)
  assert.equal(preview.projects[0].state, 'missing')
  const skipped = await applyBackup(library, workspace, ids, preview.token, false, [projectId])
  assert.match(skipped.failed.join(), /找不到/)
  const again = await previewBackup(library, workspace, ids(), created.dir)
  const located = await locateBackupProject(library, again.token, projectId, moved)
  assert.equal(located.projects[0].state, 'ready')
  const restored = await applyBackup(library, workspace, ids, again.token, false, [projectId])
  assert.deepEqual(restored.failed, [])
  assert.equal(
    await fs.realpath(library.snapshot().projects.find((p) => p.projectId === projectId)!.root),
    await fs.realpath(moved)
  )
  assert.equal(await fs.readFile(path.join(moved, 'A', 'page.txt'), 'utf8'), 'ORIGINAL')
})

test('a backup list pointing outside its folder is refused', async (t) => {
  const { out, library, workspace, ids } = await setup(t)
  const created = await createBackup(library, workspace, ids(), out, '0.0.0-test')
  const file = path.join(created.dir, 'backup.json')
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'))
  manifest.projects[0].dir = '../../local'
  await fs.writeFile(file, JSON.stringify(manifest))
  await assert.rejects(
    previewBackup(library, workspace, ids(), created.dir),
    /不是有效的 M:orph 備份/
  )
  await fs.writeFile(path.join(out, 'not-a-backup.txt'), 'x')
  await assert.rejects(previewBackup(library, workspace, ids(), out), /backup\.json/)
})

test('roots written in the backup are only trusted when the project already lives there', async (t) => {
  const { root, media, out, library, workspace, ids } = await setup(t)
  await assert.rejects(
    createBackup(library, workspace, ids(), media, '0.0.0-test'),
    /不能放在專案資料夾裡/
  )
  const created = await createBackup(library, workspace, ids(), out, '0.0.0-test')
  const file = path.join(created.dir, 'backup.json')
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'))
  const stranger = path.join(root, 'Stranger')
  await fs.mkdir(stranger)
  // A network path in the file is never probed (no connection to the host is made).
  for (const target of [stranger, String.raw`\\example.invalid\share`]) {
    manifest.projects[0].root = target
    await fs.writeFile(file, JSON.stringify(manifest))
    const preview = await previewBackup(library, workspace, ids(), created.dir)
    assert.equal(preview.projects[0].state, 'missing', target)
  }
  assert.deepEqual(await fs.readdir(stranger), [])
})

test('a folder offers its earlier project back, also after the folder moved', async (t) => {
  const { root, media, library } = await setup(t)
  const projectId = library.snapshot().projects[0].projectId
  assert.deepEqual(
    (await library.projectsAt(media)).map((p) => [p.projectId, p.linked]),
    [[projectId, true]]
  )
  // The old link stays in the list after a move; the moved folder must still be offered.
  const moved = path.join(root, 'Moved')
  await fs.rename(media, moved)
  assert.deepEqual(
    (await library.projectsAt(moved)).map((p) => [p.projectId, p.linked]),
    [[projectId, false]]
  )
  await library.link(moved)
  assert.equal((await library.projectsAt(moved))[0].linked, true)
  assert.deepEqual(await library.projectsAt(path.join(root, 'nowhere')), [])
})
