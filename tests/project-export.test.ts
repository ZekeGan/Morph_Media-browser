import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { DATA_DIR } from '../shared/model'
import { migrateRecord } from '../shared/project-export'
import { ensureFolder, exists, folderFile, readFolder, saveFolder } from '../electron/files'

const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64, 7)])

async function workspace(t: { after: (fn: () => Promise<void>) => void }, name: string) {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, name + '-'))
  t.after(async () => {
    const target = await fs.realpath(root)
    if (!target.startsWith(base + path.sep)) throw new Error('Unsafe cleanup')
    await fs.rm(target, { recursive: true, force: true })
  })
  return root
}
// A small source project: folders A and B, one value on A and one saved image on A.
async function source(root: string) {
  const media = path.join(root, 'src'),
    local = path.join(root, 'local-src')
  for (const name of ['A', 'B']) await fs.mkdir(path.join(media, name), { recursive: true })
  const lib = new Library(local, undefined, false)
  await lib.init()
  await lib.create(media, {
    name: 'Export me',
    depth: { mode: 'through', level: 2 },
  })
  const row = () => lib.snapshot().rows.find((r) => r.name === 'A')!
  await lib.addImage(row().rowId, row().record!.revision, await image(root))
  const dir = row().path,
    record = await readFolder(dir)
  await saveFolder(
    dir,
    {
      ...record,
      attributes: [
        { attributeId: 'note', key: 'note', type: 'string', value: 'kept', source: 'manual' },
      ],
    },
    record.revision
  )
  return { lib, media, dir, projectId: lib.snapshot().projects[0].projectId }
}
async function image(root: string) {
  const file = path.join(root, 'cover.png')
  await fs.writeFile(file, png)
  return file
}
async function target(root: string, name: string, folders = ['A', 'B']) {
  const media = path.join(root, name)
  for (const folder of folders) await fs.mkdir(path.join(media, folder), { recursive: true })
  const lib = new Library(path.join(root, 'local-' + name), undefined, false)
  await lib.init()
  return { lib, media }
}

test('a project exports to a folder with a verified manifest and imports into another tree', async (t) => {
  const root = await workspace(t, 'project-export')
  const src = await source(root),
    out = path.join(root, 'out')
  await fs.mkdir(out)
  const result = await src.lib.exportProject(src.projectId, out, 'test')
  const manifest = JSON.parse(await fs.readFile(path.join(result.dir, 'manifest.json'), 'utf8'))
  assert.equal(manifest.kind, 'media-viewer.project-export')
  assert.equal(manifest.projectId, src.projectId)
  assert.ok(manifest.files.some((f: { path: string }) => f.path === `${DATA_DIR}/folder.json`))
  assert.ok(
    manifest.files.some((f: { path: string }) => /^A\/\.media-viewer\/assets\//.test(f.path))
  )
  assert.ok(!manifest.files.some((f: { path: string }) => f.path.endsWith('.bak')))
  // Exporting changed nothing in the project.
  assert.equal((await readFolder(src.dir)).attributes[0].value, 'kept')

  const dst = await target(root, 'dst')
  const preview = await dst.lib.previewProjectImport(result.dir, dst.media)
  assert.equal(preview.blocker, undefined)
  assert.equal(preview.conflicts, 0)
  assert.ok(preview.added >= 4, 'root record, project, A record, A image')
  const done = await dst.lib.applyProjectImport(preview.token, false)
  assert.equal(done.written, preview.added)
  const linked = dst.lib.snapshot().projects.find((p) => p.projectId === src.projectId)
  assert.ok(linked?.project, 'the project is linked at the new root')
  const record = await readFolder(path.join(dst.media, 'A'))
  assert.equal(record.attributes[0].value, 'kept')
  assert.equal(record.assets.length, 1)
  assert.deepEqual(
    await fs.readFile(path.join(dst.media, 'A', DATA_DIR, record.assets[0].relativePath)),
    png
  )
  // A preview is single use.
  await assert.rejects(dst.lib.applyProjectImport(preview.token, false), /失效/)
})

test('import keeps existing records; overwrite replaces only a different project file, after a backup', async (t) => {
  const root = await workspace(t, 'project-export-conflict')
  const src = await source(root),
    out = path.join(root, 'out')
  await fs.mkdir(out)
  const { dir } = await src.lib.exportProject(src.projectId, out, 'test')
  const dst = await target(root, 'dst')
  const existing = (await ensureFolder(path.join(dst.media, 'A'), false)).record
  const rootRecord = (await ensureFolder(dst.media, false)).record
  // A different local version of the same project definition already sits in the target root.
  const exported = JSON.parse(
    await fs.readFile(
      path.join(dir, 'files', DATA_DIR, 'projects', src.projectId + '.json'),
      'utf8'
    )
  )
  const localFile = path.join(dst.media, DATA_DIR, 'projects', src.projectId + '.json')
  await fs.mkdir(path.dirname(localFile), { recursive: true })
  await fs.writeFile(
    localFile,
    JSON.stringify({ ...exported, name: 'Local copy', rootFolderId: rootRecord.folderId })
  )
  const preview = await dst.lib.previewProjectImport(dir, dst.media)
  assert.ok(preview.conflicts >= 3, 'root record, folder record and project definition differ')
  await dst.lib.applyProjectImport(preview.token, false)
  assert.equal(JSON.parse(await fs.readFile(localFile, 'utf8')).name, 'Local copy')
  assert.equal((await readFolder(path.join(dst.media, 'A'))).folderId, existing.folderId)

  const again = await dst.lib.previewProjectImport(dir, dst.media)
  const result = await dst.lib.applyProjectImport(again.token, true)
  assert.ok(result.backup && (await exists(result.backup)), 'overwritten files are backed up first')
  assert.equal(JSON.parse(await fs.readFile(localFile, 'utf8')).name, 'Export me')
  // Folder records keep their identity and content even with overwrite.
  assert.equal((await readFolder(path.join(dst.media, 'A'))).folderId, existing.folderId)
  const saved = await fs.readFile(
    path.join(result.backup!, 'files', DATA_DIR, 'projects', src.projectId + '.json'),
    'utf8'
  )
  assert.equal(JSON.parse(saved).name, 'Local copy')
})

test('a preview with a blocker cannot be applied', async (t) => {
  const root = await workspace(t, 'project-export-blocked')
  const src = await source(root),
    out = path.join(root, 'out')
  await fs.mkdir(out)
  const { dir } = await src.lib.exportProject(src.projectId, out, 'test')
  const dst = await target(root, 'dst')
  const preview = await src.lib.previewProjectImport(dir, dst.media)
  assert.ok(preview.blocker)
  await assert.rejects(src.lib.applyProjectImport(preview.token, false), /仍連結在另一個位置/)
  assert.equal(await exists(folderFile(path.join(dst.media, 'A'))), false)
})

test('a damaged or hostile export is refused before anything is written', async (t) => {
  const root = await workspace(t, 'project-export-bad')
  const src = await source(root),
    out = path.join(root, 'out')
  await fs.mkdir(out)
  const { dir } = await src.lib.exportProject(src.projectId, out, 'test')
  const dst = await target(root, 'dst')

  const copy = path.join(root, 'tampered')
  await fs.cp(dir, copy, { recursive: true })
  await fs.appendFile(path.join(copy, 'files', 'A', DATA_DIR, 'folder.json'), ' ')
  await assert.rejects(dst.lib.previewProjectImport(copy, dst.media), /損壞|不完整/)

  const hostile = path.join(root, 'hostile')
  await fs.cp(dir, hostile, { recursive: true })
  const manifest = JSON.parse(await fs.readFile(path.join(hostile, 'manifest.json'), 'utf8'))
  manifest.files[0].path = `../escape/${DATA_DIR}/folder.json`
  await fs.writeFile(path.join(hostile, 'manifest.json'), JSON.stringify(manifest))
  await assert.rejects(dst.lib.previewProjectImport(hostile, dst.media), /檔案清單不合法/)

  const newer = path.join(root, 'newer')
  await fs.cp(dir, newer, { recursive: true })
  const future = JSON.parse(await fs.readFile(path.join(newer, 'manifest.json'), 'utf8'))
  future.schemaVersion = 99
  await fs.writeFile(path.join(newer, 'manifest.json'), JSON.stringify(future))
  await assert.rejects(dst.lib.previewProjectImport(newer, dst.media), /更新程式/)
  assert.equal(await exists(folderFile(path.join(dst.media, 'A'))), false)
})

test('export refuses a destination inside the project; import warns when the project is still linked elsewhere', async (t) => {
  const root = await workspace(t, 'project-export-guards')
  const src = await source(root),
    out = path.join(root, 'out')
  await fs.mkdir(out)
  await assert.rejects(
    src.lib.exportProject(src.projectId, path.join(src.media, 'A'), 'test'),
    /不能在專案資料夾內/
  )
  const { dir } = await src.lib.exportProject(src.projectId, out, 'test')
  const dst = await target(root, 'dst')
  const preview = await src.lib.previewProjectImport(dir, dst.media)
  assert.match(preview.blocker ?? '', /仍連結在另一個位置/)
})

test('an export from before folder types is upgraded: categories dropped, templates keyed by kind', () => {
  const old = {
    name: 'Old',
    mediaCategory: 'media',
    mediaSourceCategory: 'video',
    contentCells: {
      manga: [{ cellId: 'a' }],
      album: [{ cellId: 'b' }],
      video: [{ cellId: 'c' }],
      game: [],
    },
  }
  const next = migrateRecord(1, structuredClone(old), 'project') as Record<string, any>
  assert.equal('mediaCategory' in next, false)
  assert.equal('mediaSourceCategory' in next, false)
  assert.deepEqual(Object.keys(next.contentCells).sort(), ['book', 'game', 'media'])
  assert.equal(next.contentCells.media[0].cellId, 'c')
  assert.equal(next.contentCells.book[0].cellId, 'a')
  const folder = { folderId: 'f' }
  assert.deepEqual(migrateRecord(1, folder, 'folder'), folder)
  assert.equal(migrateRecord(2, old, 'project'), old)
})
