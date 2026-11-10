import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { Explorer } from '../electron/explorer'
import { importedValue } from '../electron/explorer-source'
import { readFolder, folderFile } from '../electron/files'
import { parseDate, readDate } from '../shared/fields'
import { columnValue } from '../shared/browse'
import { cellField, conditionMet } from '../shared/cells'
import { validateProject, type Cell, type FolderRow, type Project } from '../shared/model'
import { dateConditionCount, switchDateToText, switchTextToDate } from '../src/editor/fieldTypes'
import { modelProject } from './support/model-fixtures'
import { tinyPng } from './support/archive-fixture'

test('dates written as text are read when they name a full day, and nothing else is', () => {
  const day = (s: string) => parseDate(s)?.value
  assert.equal(day('12 Nov, 2020'), '2020-11-12')
  assert.equal(day('Nov 12, 2020'), '2020-11-12')
  assert.equal(day('Sept. 3, 2019'), '2019-09-03')
  assert.equal(day('March 5, 2001'), '2001-03-05')
  assert.equal(day('2020/1/2'), '2020-01-02')
  assert.equal(day('2020年1月2日'), '2020-01-02')
  assert.deepEqual(parseDate('2020-11-12 10:30'), { type: 'datetime', value: '2020-11-12T10:30' })
  for (const text of [
    '1999',
    '2020-11',
    'TBA',
    'Coming soon',
    '31 Feb, 2020',
    'Marchx 5, 2001',
    'Q4 2020',
  ])
    assert.equal(parseDate(text), undefined, text)
  // A time with a zone becomes local time, as the date-and-time input stores it.
  const local = parseDate('2020-11-12T03:04:05.000Z')!
  const at = new Date('2020-11-12T03:04:05.000Z')
  assert.equal(local.type, 'datetime')
  assert.equal(new Date(local.value).getTime(), at.getTime())
  assert.equal(readDate('2020-11-12T10:00', 'date'), '2020-11-12')
  assert.equal(readDate('2020-11-12', 'datetime'), '2020-11-12')
  assert.equal(readDate(5, 'date'), undefined)
})

test('imported dates are stored as dates unless the field is text or the value is not a full day', () => {
  const release = { key: 'RELEASE_DATE', type: 'string', value: '12 Nov, 2020' }
  assert.deepEqual(importedValue(release, undefined), {
    ...release,
    type: 'date',
    value: '2020-11-12',
  })
  assert.deepEqual(importedValue(release, 'date'), {
    ...release,
    type: 'date',
    value: '2020-11-12',
  })
  assert.deepEqual(importedValue(release, 'string'), release, 'a field switched to text stays text')
  const year = { key: 'RELEASE_DATE', type: 'string', value: '1999' }
  assert.deepEqual(importedValue(year, undefined), year)
  // The calendar day written at the source, not shifted into this computer's zone: zones far enough apart that
  // one of them moves the day on any machine.
  for (const value of [
    '2020-11-12T00:00:00+14:00',
    '2020-11-12T23:59:00-12:00',
    '2020-11-12T00:00:00+09:00',
  ])
    assert.equal(
      importedValue({ key: 'RELEASE_DATE', type: 'string', value }, undefined).value,
      '2020-11-12',
      value
    )
  const posted = importedValue(
    { key: 'GALLERY_POSTED_UTC', type: 'string', value: '2020-11-12T03:04:05.000Z' },
    undefined
  )
  assert.equal(posted.type, 'datetime')
  const title = { key: 'TITLE', type: 'string', value: '2020-11-12' }
  assert.deepEqual(importedValue(title, undefined), title, 'only date keys are converted')
})

const cell = (patch: Partial<Cell>): Cell => ({
  cellId: crypto.randomUUID(),
  kind: 'field-text',
  attributeId: 'released',
  grid: { x: 0, y: 0, w: 12, h: 1 },
  style: { textColor: '#ffffff', backgroundColor: 'transparent' },
  ...patch,
})
const withField = (type: string, cells: Cell[]): Project => {
  const project = modelProject()
  return {
    ...project,
    fieldBindings: [
      ...project.fieldBindings,
      { alias: 'RELEASED', attributeId: 'released', type } as Project['fieldBindings'][number],
    ],
    // One row each, so components do not overlap.
    cells: cells.map((c, i) => ({ ...c, grid: { x: 0, y: i, w: 12, h: 1 } })),
    layoutPresets: [
      {
        id: 'preset',
        name: 'Default',
        cells: cells.map((c, i) => ({ ...c, grid: { x: 0, y: i, w: 12, h: 1 } })),
      },
    ],
    activeLayoutId: 'preset',
    contentCells: undefined,
  }
}
const row = (value: unknown): FolderRow =>
  ({
    rowId: 'r',
    projectId: 'project',
    name: 'Work',
    path: 'X',
    depth: 1,
    record: {
      folderId: 'f',
      attributes: [{ attributeId: 'released', key: 'RELEASED', type: 'string', value }],
      projectOverrides: {},
    },
  }) as unknown as FolderRow

test('a text field becomes a date field only when every value reads as a date', () => {
  const project = withField('string', [cell({})])
  const refused = switchTextToDate(project, 'released', 'date', ['12 Nov, 2020', '1999', 'TBA', ''])
  assert.deepEqual(refused, { error: 'unreadable', values: ['1999', 'TBA'] })
  const done = switchTextToDate(project, 'released', 'date', ['12 Nov, 2020', '2021-01-02', ''])
  assert.ok('project' in done)
  validateProject(done.project)
  const shown = done.project.cells.find((c) => c.attributeId === 'released')!
  assert.equal(shown.kind, 'field-date-only')
  assert.equal(done.project.fieldBindings.find((f) => f.attributeId === 'released')!.type, 'date')
  // Stored text is read as a date when shown, sorted and compared.
  assert.equal(cellField(shown, row('12 Nov, 2020'), done.project).value, '2020-11-12')
  assert.equal(columnValue(done.project, row('12 Nov, 2020'), 'released'), '2020-11-12')
  assert.equal(columnValue(done.project, row('1999'), 'released'), '1999')
  assert.ok(
    conditionMet(
      { attributeId: 'released', operator: 'gt', value: '2020-01-01' },
      shown,
      row('12 Nov, 2020'),
      done.project
    )
  )
  // "Equals" with text that is not a date has to be changed first.
  const equals = withField('string', [
    cell({ condition: { attributeId: 'released', operator: 'equals', value: 'soon' } }),
  ])
  assert.deepEqual(switchTextToDate(equals, 'released', 'date', ['2020-01-01']), {
    error: 'condition',
  })
})

test('a date field becomes text and loses only the conditions comparing it as a date', () => {
  const layout = cell({
    kind: 'static-text',
    attributeId: undefined,
    text: 'Old',
    condition: { attributeId: 'released', operator: 'within', value: 30 },
    moreConditions: [{ attributeId: 'title', operator: 'set' }],
    conditionMode: 'any',
    textRules: [
      { when: { attributeId: 'released', operator: 'gt', value: '2020-01-01' }, text: 'New' },
      { when: { attributeId: 'released', operator: 'set' }, text: 'Dated' },
    ],
  })
  const project = withField('date', [cell({ kind: 'field-date-only' }), layout])
  validateProject(project)
  assert.equal(dateConditionCount(project, 'released'), 2)
  const done = switchDateToText(project, 'released')
  assert.ok('project' in done)
  validateProject(done.project)
  const shown = done.project.cells.find((c) => c.attributeId === 'released')!
  assert.equal(shown.kind, 'field-text')
  const text = done.project.cells.find((c) => c.cellId === layout.cellId)!
  assert.deepEqual(text.condition, { attributeId: 'title', operator: 'set' })
  assert.equal(text.moreConditions, undefined)
  assert.equal(text.conditionMode, undefined)
  assert.deepEqual(text.textRules, [
    { when: { attributeId: 'released', operator: 'set' }, text: 'Dated' },
  ])
  assert.equal(dateConditionCount(done.project, 'released'), 0)
})

async function fixture(t: { after: (fn: () => Promise<void>) => void }) {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'date-fields-')),
    media = path.join(root, 'media')
  await fs.mkdir(media)
  const lib = new Library(path.join(root, 'local'), undefined, false)
  await lib.init()
  const explorer = new Explorer(lib, lib.userData, {
    choose: async () => undefined,
    open: async () => {},
    launch: async () => {},
    thumbnail: async () => tinyPng,
  })
  t.after(async () => {
    explorer.index.close()
    assert.ok((await fs.realpath(root)).startsWith(base + path.sep))
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  return { media, lib, explorer }
}

test('importing replaces an old text date with a date, and keeps text for a text field', async (t) => {
  const { media, lib, explorer } = await fixture(t),
    originalFetch = globalThis.fetch
  let date = '2020-11-12'
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ id: 12, name: 'Work', date }))) as typeof fetch
  t.after(() => {
    globalThis.fetch = originalFetch
  })
  const state = await lib.create(media, { name: 'Dates', depth: { mode: 'through', level: 1 } })
  const project = state.projects[0].project!
  const apply = async (mode: 'fill' | 'replace' = 'replace') => {
    const preview = (
      await explorer.request({ action: 'metadataPreview', source: 'https://bgm.tv/subject/12' })
    ).preview!
    const row = lib.snapshot().rows[0]
    await explorer.request({
      action: 'metadataApply',
      rowId: row.rowId,
      revision: row.record!.revision,
      token: preview.token,
      keys: ['RELEASE_DATE'],
      image: false,
      mode,
    })
    return (await readFolder(media)).attributes.find(
      (a) => a.attributeId === 'bangumi-release_date'
    )
  }
  assert.deepEqual(
    { type: (await apply())!.type, value: (await apply())!.value },
    { type: 'date', value: '2020-11-12' }
  )
  // A year alone stays text, and a later full date replaces it as a date.
  date = '1999'
  assert.equal((await apply())!.type, 'string')
  date = '2001-03-05'
  assert.deepEqual(
    { type: (await apply())!.type, value: (await apply())!.value },
    { type: 'date', value: '2001-03-05' }
  )
  // Once the project has the field as text, imports store text.
  await lib.saveProject({
    ...lib.snapshot().projects[0].project!,
    fieldBindings: [
      ...project.fieldBindings,
      { attributeId: 'bangumi-release_date', alias: 'RELEASE_DATE', type: 'string' },
    ],
  })
  date = '2002-04-06'
  const kept = await apply()
  assert.deepEqual(
    { type: kept!.type, value: kept!.value },
    { type: 'string', value: '2002-04-06' }
  )
  assert.ok((await fs.stat(folderFile(media))).isFile())
})

test('saving folder text refuses fields that are not text (R-247)', async (t) => {
  const { media, lib } = await fixture(t)
  const state = await lib.create(media, { name: 'Typed', depth: { mode: 'through', level: 1 } })
  await lib.saveProject({
    ...state.projects[0].project!,
    fieldBindings: [
      { attributeId: 'score', alias: 'SCORE', type: 'number' },
      { attributeId: 'note', alias: 'NOTE', type: 'string' },
    ],
  })
  const row = lib.snapshot().rows[0]
  await assert.rejects(lib.saveValues(row.rowId, row.record!.revision, { score: '5' }), /型別不符/)
  await lib.saveValues(row.rowId, row.record!.revision, { note: 'hello' })
  const note = (await readFolder(media)).attributes.find((a) => a.attributeId === 'note')
  assert.equal(note?.type, 'string')
  assert.equal(
    (await readFolder(media)).attributes.some((a) => a.attributeId === 'score'),
    false
  )
})

test('after switching a field between text and date, folders save with the new type', async (t) => {
  const { media, lib, explorer } = await fixture(t)
  const state = await lib.create(media, { name: 'Switch', depth: { mode: 'through', level: 1 } })
  const save = async (bindingType: string, type: string, value: unknown) => {
    await lib.saveProject({
      ...lib.snapshot().projects[0].project!,
      fieldBindings: [{ attributeId: 'released', alias: 'RELEASED', type } as never].map(
        (f: { attributeId: string; alias: string }) => ({ ...f, type: bindingType }) as never
      ),
    })
    const row = lib.snapshot().rows[0]
    await explorer.request({
      action: 'attributes',
      rowId: row.rowId,
      revision: row.record!.revision,
      private: false,
      values: [
        { attributeId: 'released', key: 'RELEASED', type, value, source: 'manual' } as never,
      ],
    })
    const saved = (await readFolder(media)).attributes.find((a) => a.attributeId === 'released')!
    return { type: saved.type, value: saved.value }
  }
  assert.deepEqual(await save('string', 'string', '12 Nov, 2020'), {
    type: 'string',
    value: '12 Nov, 2020',
  })
  // The field became a date: the text is replaced by a date when the folder is saved.
  assert.deepEqual(await save('date', 'date', '2020-11-12'), { type: 'date', value: '2020-11-12' })
  // And back to text.
  assert.deepEqual(await save('string', 'string', 'soon'), { type: 'string', value: 'soon' })
  // Types outside text and date still never change.
  await assert.rejects(save('number', 'number', 5), /型別/)
  // Saving text over a date kept from before the field became text (R-247 path).
  await save('date', 'date', '2020-11-12')
  await lib.saveProject({
    ...lib.snapshot().projects[0].project!,
    fieldBindings: [{ attributeId: 'released', alias: 'RELEASED', type: 'string' }],
  })
  const row = lib.snapshot().rows[0]
  await lib.saveValues(row.rowId, row.record!.revision, { released: 'later' })
  const saved = (await readFolder(media)).attributes.find((a) => a.attributeId === 'released')!
  assert.deepEqual({ type: saved.type, value: saved.value }, { type: 'string', value: 'later' })
  assert.ok(state.projects.length)
})
