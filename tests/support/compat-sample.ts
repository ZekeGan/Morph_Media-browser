// Old-data check (R-278): a small library made by a released version, kept in tests/compat/<version>/, must open in
// every later version with the same content and without being rewritten. This file builds such a sample and
// summarises what a version reads back from it.
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../../electron/library'
import { Explorer } from '../../electron/explorer'
import { WorkspaceStore } from '../../electron/workspace'

// Absolute paths in the sample are stored as this placeholder and filled in where the copy lands.
export const SHELF = '__COMPAT_SHELF__'
const desktop = {
  choose: async () => undefined,
  open: async () => {},
  launch: async () => {},
  thumbnail: async () => Buffer.alloc(0),
}
// A 1×1 PNG, enough for a folder to count as images.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

export async function buildCompatSample(dir: string) {
  const shelf = path.join(dir, 'Shelf'),
    local = path.join(dir, 'local')
  for (const book of ['Book 1', 'Book 2']) {
    await fs.mkdir(path.join(shelf, book), { recursive: true })
    for (let i = 1; i <= 4; i++)
      await fs.writeFile(path.join(shelf, book, String(i).padStart(3, '0') + '.png'), png)
  }
  await fs.mkdir(path.join(shelf, 'Notes'), { recursive: true })
  await fs.writeFile(path.join(shelf, 'Notes', 'readme.txt'), 'compat sample')
  const library = new Library(local, undefined, false)
  await library.init()
  await library.create(shelf, {
    name: 'Compat',
    depth: { mode: 'through', level: 1 },
    scanAll: true,
  })
  const explorer = new Explorer(library, local, desktop)
  try {
    const rows = () => library.snapshot().rows,
      book = rows().find((row) => row.name === 'Book 1')!
    await explorer.request({
      action: 'reading',
      rowId: book.rowId,
      revision: book.record!.revision,
      prefs: { mode: 'manga', page: 2, spread: true, rtl: true, firstSingle: false },
    })
    const notes = rows().find((row) => row.name === 'Notes')!
    await explorer.request({
      action: 'folderKind',
      rowId: notes.rowId,
      revision: notes.record!.revision,
      kind: 'general',
    })
  } finally {
    explorer.index.close()
  }
  const store = new WorkspaceStore(local, ['zh-TW'])
  await store.init()
  const ids = library.snapshot().projects.map((link) => link.projectId)
  await store.update({ action: 'appearance', theme: 'paper', locale: 'ja' }, ids)
  await store.update({ action: 'videoAudio', value: { volume: 0.4, muted: false } }, ids)
  await store.update({ action: 'playOrder', value: 'all' }, ids)
  // The searchable index is rebuilt from the records; it is not part of what a version must keep reading.
  await fs.rm(path.join(local, 'search.sqlite'), { force: true })
  // Store the project root as the placeholder.
  for (const file of await files(local))
    if (file.endsWith('.json') || file.endsWith('.bak')) {
      const text = await fs.readFile(file, 'utf8')
      await fs.writeFile(file, text.split(JSON.stringify(shelf).slice(1, -1)).join(SHELF))
    }
}

// Points a copied sample at where it now lives.
export async function placeCompatSample(dir: string) {
  const shelf = path.join(dir, 'Shelf')
  for (const file of await files(path.join(dir, 'local')))
    if (file.endsWith('.json') || file.endsWith('.bak')) {
      const text = await fs.readFile(file, 'utf8')
      await fs.writeFile(file, text.split(SHELF).join(JSON.stringify(shelf).slice(1, -1)))
    }
}

// What a version reads back: projects, folders with their records' content, and the local settings.
export async function summariseCompatSample(dir: string) {
  const local = path.join(dir, 'local'),
    library = new Library(local, undefined, false)
  await library.init()
  const snapshot = library.snapshot()
  const store = new WorkspaceStore(local, ['zh-TW'])
  await store.init()
  const state = await store.read(snapshot.projects.map((link) => link.projectId))
  return {
    projects: snapshot.projects.map((link) => ({
      name: link.project?.name,
      error: link.error ?? null,
      fields: link.project?.fieldBindings.map((field) => [field.alias, field.type]) ?? [],
      cells: link.project?.cells.length ?? 0,
    })),
    rows: snapshot.rows
      .map((row) => ({
        name: row.name,
        error: row.error ?? null,
        details: row.record?.details ?? null,
        attributes: row.record?.attributes?.map((a) => [a.key, a.value]) ?? [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    settings: {
      theme: state.prefs.theme,
      locale: state.prefs.locale,
      videoAudio: state.prefs.videoAudio,
      playOrder: state.prefs.playOrder,
      error: state.error ?? null,
    },
  }
}

export async function files(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(
    entries.map((entry) =>
      entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
    )
  )
  return nested.flat()
}
