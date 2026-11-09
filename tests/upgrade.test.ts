import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { WorkspaceStore } from '../electron/workspace'
import { managedTree } from '../electron/maintenance'
import {
  ensureFolder,
  folderFile,
  readFolder,
  readJson,
  restoreJson,
  saveFolder,
} from '../electron/files'
import { validateFolder } from '../shared/model'
import {
  FORMAT_VERSION,
  NewerFormatError,
  UPGRADE_STEPS,
  isNewerFormat,
  upgradeFormat,
  type FormatKind,
} from '../shared/upgrade'
import { classifyError, errorMessage } from '../shared/notifications'

async function sandbox(t: { after: (fn: () => Promise<void>) => void }, name: string) {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, `${name}-`))
  t.after(async () => {
    const target = await fs.realpath(root)
    if (!target.startsWith(base + path.sep)) throw new Error('Unsafe test cleanup')
    await fs.rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  return root
}
// Pretends this build writes v2 of one format, with a v1 -> v2 step, for the length of a test.
function pretendV2(
  t: { after: (fn: () => void) => void },
  format: FormatKind,
  step: (value: Record<string, unknown>) => Record<string, unknown>
) {
  FORMAT_VERSION[format] = 2
  UPGRADE_STEPS[format][1] = step
  t.after(() => {
    FORMAT_VERSION[format] = 1
    delete UPGRADE_STEPS[format][1]
  })
}
const raw = async (file: string) => JSON.parse(await fs.readFile(file, 'utf8'))

test('upgrade steps run in order, and a missing step or newer data is refused', (t) => {
  assert.deepEqual(upgradeFormat('folder', { schemaVersion: 1, a: 1 }), {
    schemaVersion: 1,
    a: 1,
  })
  assert.throws(() => upgradeFormat('folder', { schemaVersion: 2 }), NewerFormatError)
  FORMAT_VERSION.project = 3
  t.after(() => {
    FORMAT_VERSION.project = 1
    delete UPGRADE_STEPS.project[1]
    delete UPGRADE_STEPS.project[2]
  })
  UPGRADE_STEPS.project[1] = (v) => ({ ...v, trail: ['1→2'] })
  assert.throws(() => upgradeFormat('project', { schemaVersion: 1 }), /v2 → v3/)
  UPGRADE_STEPS.project[2] = (v) => ({ ...v, trail: [...(v.trail as string[]), '2→3'] })
  const input = { schemaVersion: 1 }
  assert.deepEqual(upgradeFormat('project', input), { schemaVersion: 3, trail: ['1→2', '2→3'] })
  assert.deepEqual(input, { schemaVersion: 1 }, 'the value read is never changed in place')
})

test('an older folder record is upgraded on read and written in the new format only on save', async (t) => {
  const dir = await sandbox(t, 'upgrade-folder')
  await ensureFolder(dir, false)
  const before = await fs.readFile(folderFile(dir), 'utf8')
  pretendV2(t, 'folder', (v) => ({ ...v, note: 'from v1' }))
  const record = await readFolder(dir)
  assert.equal(record.schemaVersion, 2)
  assert.equal((record as unknown as { note: string }).note, 'from v1')
  assert.equal(await fs.readFile(folderFile(dir), 'utf8'), before, 'reading never writes')
  await saveFolder(dir, record, record.revision)
  const saved = await raw(folderFile(dir))
  assert.equal(saved.schemaVersion, 2)
  assert.equal(saved.note, 'from v1')
  assert.equal(
    await fs.readFile(folderFile(dir) + '.bak', 'utf8'),
    before,
    'the v1 file stays as the backup'
  )
  // Every reader of the v1 backup sees the current format.
  assert.equal(
    ((await readJson(folderFile(dir) + '.bak')) as { schemaVersion: number }).schemaVersion,
    2
  )
  // The v1 backup is still usable after the upgrade.
  await fs.writeFile(folderFile(dir), '{broken')
  await restoreJson(dir, folderFile(dir), validateFolder, (v) => v.folderId === record.folderId)
  assert.equal((await readFolder(dir)).schemaVersion, 2)
})

test('a folder record from a newer version is read-only: not recreated, restored over or cleaned', async (t) => {
  const dir = await sandbox(t, 'upgrade-newer'),
    inner = path.join(dir, 'Inner')
  await ensureFolder(dir, false)
  await fs.mkdir(inner)
  await ensureFolder(inner, false)
  const record = await readFolder(dir)
  await saveFolder(dir, record, record.revision)
  const newer = JSON.stringify({ ...(await raw(folderFile(dir))), schemaVersion: 2, future: 1 })
  await fs.writeFile(folderFile(dir), newer)
  await assert.rejects(readFolder(dir), NewerFormatError)
  await assert.rejects(ensureFolder(dir, false), NewerFormatError)
  await assert.rejects(saveFolder(dir, record, record.revision + 1), NewerFormatError)
  await assert.rejects(
    restoreJson(dir, folderFile(dir), validateFolder, () => true),
    NewerFormatError
  )
  const tree = await managedTree(dir)
  assert.deepEqual(tree.files, [], 'nothing of a newer folder or below it is offered for clean-up')
  assert.ok(tree.skipped.some((line) => line.includes('含較新版本的資料')))
  assert.equal(await fs.readFile(folderFile(dir), 'utf8'), newer)
})

test('a scan shows a newer folder as needing an update and leaves it as it is', async (t) => {
  const root = await sandbox(t, 'upgrade-scan'),
    media = path.join(root, 'media')
  await fs.mkdir(path.join(media, 'A', 'Inner'), { recursive: true })
  const lib = new Library(path.join(root, 'local'), undefined, false)
  await lib.init()
  await lib.create(media, { name: 'P', scanAll: true, depth: { mode: 'through', level: 3 } })
  const child = path.join(media, 'A'),
    newer = JSON.stringify({ ...(await raw(folderFile(child))), schemaVersion: 7 })
  await fs.writeFile(folderFile(child), newer)
  await fs.rm(path.join(media, 'A', 'Inner', '.media-viewer'), { recursive: true, force: true })
  await lib.scan()
  const row = lib.snapshot().rows.find((r) => r.path === child)
  assert.ok(row && isNewerFormat(row.error))
  assert.ok(lib.snapshot().problems.some((p) => p.includes('含較新版本的資料，唯讀且不深入')))
  assert.equal(await fs.readFile(folderFile(child), 'utf8'), newer)
  await assert.rejects(fs.stat(path.join(media, 'A', 'Inner', '.media-viewer')), {
    code: 'ENOENT',
  })
})

test('app settings are upgraded once at start-up after the old file is kept; newer settings stop saving', async (t) => {
  const root = await sandbox(t, 'upgrade-workspace')
  const first = new WorkspaceStore(root)
  await first.init()
  await first.update({ action: 'createGroup', name: 'G' }, [])
  const file = path.join(root, 'workspace-ui.json'),
    v1 = await fs.readFile(file, 'utf8')
  pretendV2(t, 'workspace', (v) => ({ ...v, extra: true }))
  const upgraded = new WorkspaceStore(root)
  await upgraded.init()
  assert.equal((await raw(file)).schemaVersion, 2)
  assert.equal((await raw(file)).extra, true)
  const kept = (await fs.readdir(path.join(root, 'workspace-backups'))).filter((n) =>
    n.startsWith('before-upgrade-')
  )
  assert.equal(kept.length, 1)
  assert.equal(await fs.readFile(path.join(root, 'workspace-backups', kept[0]), 'utf8'), v1)

  const newer = JSON.stringify({ ...(await raw(file)), schemaVersion: 9 })
  await fs.writeFile(file, newer)
  const blocked = new WorkspaceStore(root)
  await blocked.init()
  assert.ok(isNewerFormat((await blocked.read([])).error))
  await assert.rejects(blocked.update({ action: 'createGroup', name: 'H' }, []))
  assert.equal(await fs.readFile(file, 'utf8'), newer)
})

test('newer-version errors survive the IPC prefix and are classified for the window', () => {
  const text = errorMessage(
    `Error: Error invoking remote method 'library:request': Error: ${new NewerFormatError('project', 2).message}`
  )
  assert.equal(classifyError(text), 'newer')
  assert.equal(isNewerFormat(text), true)
  assert.equal(classifyError('記錄損壞、版本不支援或不屬於本程式；原檔保留'), 'unknown')
})

test('a project record from a newer version is not replaced by its backup', async (t) => {
  const root = await sandbox(t, 'upgrade-project'),
    media = path.join(root, 'media')
  await fs.mkdir(media, { recursive: true })
  const lib = new Library(path.join(root, 'local'), undefined, false)
  await lib.init()
  await lib.create(media, { name: 'P', scanAll: true, depth: { mode: 'through', level: 1 } })
  const project = lib.snapshot().projects[0].project!
  await lib.saveProject({ ...project, name: 'P2' })
  const file = path.join(media, '.media-viewer', 'projects', `${project.projectId}.json`)
  const newer = JSON.stringify({ ...((await readJson(file)) as object), schemaVersion: 4 })
  await fs.writeFile(file, newer)
  const again = new Library(path.join(root, 'local'), undefined, false)
  await again.init()
  const linked = again.snapshot().projects[0]
  assert.ok(isNewerFormat(linked.error))
  assert.equal(await fs.readFile(file, 'utf8'), newer)
})
