import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { readFolder, saveFolder } from '../electron/files'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// R-339: the Data tab shows your own fields first (empty ones as "fill in" chips) and each website's imported values
// read-only, with "change by hand" per field and "remove this site's data" per site.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'field-sources-ui-')),
  media = path.join(root, 'Library'),
  work = path.join(media, 'Work'),
  local = path.join(root, 'local')
await fs.mkdir(work, { recursive: true })
const library = new Library(local, undefined, false)
await library.init()
const created = await library.create(media, {
  name: 'Sources',
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})
const project = created.projects[0].project!,
  note = crypto.randomUUID(),
  rating = crypto.randomUUID()
await library.saveProject({
  ...project,
  fieldBindings: [
    { alias: '備註', attributeId: note, type: 'string' },
    { alias: '評分', attributeId: rating, type: 'string' },
    { alias: '標題（VNDB）', attributeId: 'vndb-title', type: 'string' },
  ],
})
const record = await readFolder(media)
const sourceRecord = {
  provider: 'vndb',
  url: 'https://vndb.org/v97',
  fetchedAt: '2026-11-13T00:00:00Z',
}
record.attributes.push(
  { attributeId: note, key: '備註', type: 'string', value: '我的備註', source: 'manual' },
  {
    attributeId: 'vndb-title',
    key: 'TITLE',
    type: 'string',
    value: 'Saya no Uta',
    source: 'vndb',
    sourceRecord,
  },
  {
    attributeId: 'vndb-released',
    key: 'RELEASE_DATE',
    type: 'string',
    value: '2003-12-26',
    source: 'vndb',
    sourceRecord,
  },
  {
    attributeId: 'vndb-source_url',
    key: 'SOURCE_URL',
    type: 'string',
    value: 'https://vndb.org/v97',
    source: 'vndb',
    sourceRecord,
  }
)
await saveFolder(media, record, record.revision)

const errors: string[] = []
const { app, page } = await launchApp(local, errors, { width: 1500, height: 950 })
let passed = false
try {
  await page.getByRole('button', { name: '開啟專案 Sources', exact: true }).first().click()
  await page.getByRole('button', { name: '目前資料夾設定', exact: true }).click()
  // Your own field is editable; the empty one waits as a chip.
  await page.getByRole('textbox', { name: '備註', exact: true }).waitFor()
  const chips = page.getByRole('group', { name: '補填' })
  await chips.getByRole('button', { name: '評分' }).waitFor()
  assert.equal(await page.getByRole('checkbox', { name: /顯示未填欄位/ }).count(), 0) // ui-names: ignore
  // The website's values are shown, not editable, until "change by hand".
  const site = page.locator('.site-fields')
  await site.locator('summary').click()
  await site.getByText('Saya no Uta', { exact: true }).waitFor()
  assert.equal(await page.getByRole('textbox', { name: '標題（VNDB）', exact: true }).count(), 0)
  await page.screenshot({ path: path.join(base, 'shot', 'r339-fields.png') })
  await site.getByRole('button', { name: '改成手動 標題（VNDB）', exact: true }).click()
  await site.getByRole('textbox').first().fill('沙耶の唄')
  await page.getByRole('button', { name: '保存欄位資料', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.settings-savebar'))
  // The hand-made value is on disk, and the panel has the new revision, before removing the site.
  for (let i = 0; i < 50; i++) {
    const now = (await readFolder(media)).attributes.find((x) => x.attributeId === 'vndb-title')
    if (now?.value === '沙耶の唄' && now.source === 'manual') break
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(300)
  // Removing VNDB's data keeps the value changed by hand.
  await page.evaluate(() => {
    window.confirm = () => true
  })
  await site.getByRole('button', { name: '移除這個來源的資料', exact: true }).click()
  let saved = await readFolder(media)
  for (let i = 0; i < 50 && saved.attributes.some((a) => a.attributeId === 'vndb-released'); i++) {
    await page.waitForTimeout(100)
    saved = await readFolder(media)
  }
  assert.deepEqual(
    saved.attributes.map((a) => [a.attributeId, a.value]).sort(),
    [
      [note, '我的備註'],
      ['vndb-title', '沙耶の唄'],
    ].sort()
  )
  assert.deepEqual(errors, [])
  passed = true
  console.log(
    'PASS own fields, fill-in chips, read-only site values, change by hand, remove a site. ' + root
  )
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
