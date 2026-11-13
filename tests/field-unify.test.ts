import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { folderFile, readFolder } from '../electron/files'
import { textAsDate, unifyTarget } from '../shared/unifyDates'

test('R-364: text is read as the field date type; only text next to one date type is unified', () => {
  assert.equal(textAsDate('2026-07-20T00:38:17', 'datetime'), '2026-07-20T00:38:17')
  assert.equal(textAsDate('2024-05-06', 'datetime'), undefined)
  assert.equal(textAsDate('2025-03-14T16:46:03', 'date'), '2025-03-14')
  assert.equal(textAsDate('2024/5/6', 'date'), '2024-05-06')
  assert.equal(textAsDate('soon', 'date'), undefined)
  assert.equal(unifyTarget(['string', 'datetime', 'datetime']), 'datetime')
  assert.equal(unifyTarget(['string', 'date']), 'date')
  assert.equal(unifyTarget(['datetime']), undefined)
  assert.equal(unifyTarget(['string', 'date', 'datetime']), undefined)
  assert.equal(unifyTarget(['string', 'number']), undefined)
})

test('R-364: a field kept as text in some folders and as a date in others is unified after a preview', async (t) => {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'field-unify-')),
    media = path.join(root, 'media'),
    local = path.join(root, 'local')
  t.after(async () => {
    assert.ok((await fs.realpath(root)).startsWith(base + path.sep))
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  for (const name of ['Old', 'New', 'Odd'])
    await fs.mkdir(path.join(media, name), { recursive: true })
  const lib = new Library(local, undefined, false)
  await lib.init()
  await lib.create(media, { name: 'Unify', scanAll: true, depth: { mode: 'through', level: 2 } })
  const projectId = lib.snapshot().projects[0].project!.projectId
  const posted = (type: string, value: string) => ({
    attributeId: 'posted',
    key: 'GALLERY_POSTED_UTC',
    type,
    value,
    source: 'eh',
  })
  const set = async (
    name: string,
    values: ReturnType<typeof posted>[],
    own: ReturnType<typeof posted>[] = []
  ) => {
    const folder = path.join(media, name),
      record = await readFolder(folder)
    record.attributes = values
    if (own.length) record.projectOverrides[projectId] = own
    record.projectOverrides['someone-else'] = [posted('string', 'kept as it is')]
    await fs.writeFile(folderFile(folder), JSON.stringify(record))
  }
  await set(
    'Old',
    [posted('string', '2025-03-14T16:46:03')],
    [posted('string', '2024-01-02T03:04:05')]
  )
  await set('New', [posted('datetime', '2026-07-20T00:38:17')])
  await set('Odd', [posted('string', 'unknown')])
  await lib.scan()
  const preview = await lib.previewUnifyField(projectId, 'posted')
  assert.equal(preview.to, 'datetime')
  assert.equal(preview.folders, 1)
  assert.equal(preview.values, 2)
  assert.deepEqual(
    preview.unreadable.map((item) => item.value),
    ['unknown']
  )
  // Nothing is written by the preview.
  assert.equal((await readFolder(path.join(media, 'Old'))).attributes[0].type, 'string')
  await lib.unifyField(preview.token)
  const old = await readFolder(path.join(media, 'Old'))
  assert.deepEqual(
    [old.attributes[0].type, old.attributes[0].value],
    ['datetime', '2025-03-14T16:46:03']
  )
  assert.equal(old.projectOverrides[projectId][0].type, 'datetime')
  // Another project's private value and the unreadable text are left alone.
  assert.equal(old.projectOverrides['someone-else'][0].type, 'string')
  assert.equal((await readFolder(path.join(media, 'Odd'))).attributes[0].value, 'unknown')
  // A used or stale preview does not write.
  await assert.rejects(lib.unifyField(preview.token), /失效/)
})

test('R-364: a preview is refused when the field has no text next to a date', async (t) => {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'field-unify-')),
    media = path.join(root, 'media'),
    local = path.join(root, 'local')
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  await fs.mkdir(path.join(media, 'A'), { recursive: true })
  const lib = new Library(local, undefined, false)
  await lib.init()
  await lib.create(media, { name: 'Unify', scanAll: true, depth: { mode: 'through', level: 2 } })
  const projectId = lib.snapshot().projects[0].project!.projectId
  await assert.rejects(lib.previewUnifyField(projectId, 'missing'), /沒有可統一/)
})

test('R-364: a field some project uses as text is not unified', async (t) => {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'field-unify-')),
    media = path.join(root, 'media'),
    local = path.join(root, 'local')
  t.after(async () => {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  for (const name of ['Old', 'New']) await fs.mkdir(path.join(media, name), { recursive: true })
  const lib = new Library(local, undefined, false)
  await lib.init()
  await lib.create(media, { name: 'Unify', scanAll: true, depth: { mode: 'through', level: 2 } })
  const project = lib.snapshot().projects[0].project!
  await lib.saveProject({
    ...project,
    fieldBindings: [{ attributeId: 'posted', alias: 'Posted', type: 'string' }],
  })
  for (const [name, type, value] of [
    ['Old', 'string', '2025-03-14T16:46:03'],
    ['New', 'datetime', '2026-07-20T00:38:17'],
  ]) {
    const folder = path.join(media, name),
      record = await readFolder(folder)
    record.attributes = [{ attributeId: 'posted', key: 'Posted', type, value, source: 'eh' }]
    await fs.writeFile(folderFile(folder), JSON.stringify(record))
  }
  await lib.scan()
  await assert.rejects(lib.previewUnifyField(project.projectId, 'posted'), /不能統一/)
})
