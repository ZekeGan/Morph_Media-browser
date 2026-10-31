import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Library } from '../electron/library'
import { projectFile, folderFile } from '../electron/files'
import { convertMediaProject } from '../shared/media'
import { validateProject } from '../shared/model'
import { contentCells } from '../shared/explorer'

test('media conversion preserves identity, templates, backups and supports restoring the category', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'media-conversion-')),
    media = path.join(root, 'media')
  await fs.mkdir(media)
  try {
    for (const category of ['album', 'video', 'music', 'other']) {
      const folder = path.join(media, category)
      await fs.mkdir(folder)
      await fs.writeFile(path.join(folder, 'original.bin'), 'UNCHANGED')
      const library = new Library(path.join(root, 'local-' + category), undefined, false)
      await library.init()
      await library.create(folder, {
        name: category,
        mediaCategory: category,
        scanAll: true,
        depth: { mode: 'through', level: 2 },
      })
      const initial = library.snapshot().projects[0].project!
      await library.saveProject({
        ...initial,
        contentCells: category === 'music' ? undefined : { [category]: initial.cells },
      })
      const original = library.snapshot().projects[0].project!,
        record = await fs.readFile(folderFile(folder)),
        file = projectFile(folder, original.projectId),
        bytes = await fs.readFile(file)
      const converted = convertMediaProject(original)
      validateProject(converted)
      assert.deepEqual(await fs.readFile(file), bytes)
      assert.equal(converted.rootFolderId, original.rootFolderId)
      assert.deepEqual(contentCells(converted, 'media'), contentCells(original, category))
      assert.deepEqual(converted.savedSearches, original.savedSearches)
      await library.saveProject(converted)
      assert.deepEqual(await fs.readFile(file + '.bak'), bytes)
      const saved = JSON.parse(await fs.readFile(file, 'utf8'))
      validateProject(saved)
      const reopened = new Library(path.join(root, 'local-' + category), undefined, false)
      await reopened.init()
      assert.equal(reopened.snapshot().projects[0].project!.mediaSourceCategory, category)
      await assert.rejects(library.saveProject(converted), /版本衝突/)
      await library.saveProject({
        ...saved,
        mediaCategory: category,
        mediaSourceCategory: undefined,
      })
      assert.equal(JSON.parse(await fs.readFile(file, 'utf8')).mediaCategory, category)
      assert.deepEqual(await fs.readFile(folderFile(folder)), record)
      assert.equal(await fs.readFile(path.join(folder, 'original.bin'), 'utf8'), 'UNCHANGED')
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
