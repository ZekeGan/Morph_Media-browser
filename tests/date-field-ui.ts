import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { readFolder, saveFolder } from '../electron/files'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// Manage fields: a date field changes to text (date comparisons removed, counted first) and a text field changes to
// a date only when every saved value reads as a date (R-240).
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'date-field-ui-')),
  media = path.join(root, 'Library'),
  local = path.join(root, 'local')
for (const name of ['Work A', 'Work B']) await fs.mkdir(path.join(media, name), { recursive: true })
const library = new Library(local, undefined, false)
await library.init()
const created = await library.create(media, {
  name: 'Dates',
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})
const project = created.projects[0].project!,
  style = { textColor: '#e4e6e8', backgroundColor: 'transparent' },
  released = crypto.randomUUID(),
  note = crypto.randomUUID()
// One text value reads as a date, the other is a year alone.
for (const [name, value] of [
  ['Work A', '12 Nov, 2020'],
  ['Work B', '1999'],
]) {
  const dir = path.join(media, name),
    record = await readFolder(dir)
  record.attributes.push({
    attributeId: note,
    key: '備註',
    type: 'string',
    value,
    source: 'manual',
  })
  await saveFolder(dir, record, record.revision)
}
await library.saveProject({
  ...project,
  fieldBindings: [
    { alias: '發售日', attributeId: released, type: 'date' },
    { alias: '備註', attributeId: note, type: 'string' },
  ],
  cells: [
    ...project.cells,
    {
      cellId: crypto.randomUUID(),
      kind: 'field-date-only',
      attributeId: released,
      grid: { x: 0, y: 6, w: 12, h: 1 },
      style,
    },
    {
      cellId: crypto.randomUUID(),
      kind: 'static-text',
      text: '新作',
      grid: { x: 0, y: 7, w: 12, h: 1 },
      style,
      condition: { attributeId: released, operator: 'within', value: 90 },
    },
    {
      cellId: crypto.randomUUID(),
      kind: 'field-text',
      attributeId: note,
      grid: { x: 0, y: 8, w: 12, h: 1 },
      style,
    },
  ],
})

const errors: string[] = []
const { app, page } = await launchApp(local, errors, { width: 1500, height: 950 })
let passed = false
try {
  await page.getByRole('button', { name: '開啟專案 Dates', exact: true }).first().click()
  await page.getByRole('button', { name: '編輯版面', exact: true }).click()
  await page.locator('.editor-page').waitFor()
  await page.getByRole('button', { name: '管理欄位', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '管理欄位' })
  const field = (name: string) => dialog.locator('button').filter({ hasText: name }).first().click()

  // Date to text: the "within 90 days" condition is counted before anything changes.
  await field('發售日')
  await dialog.getByRole('button', { name: '改成文字', exact: true }).click()
  const change = dialog.locator('.field-detail-change')
  await change.getByText('1 個比較日期的條件（大於、小於、距今）會移除').waitFor()
  await change.getByRole('button', { name: '確認改用途', exact: true }).click()
  await change.waitFor({ state: 'hidden' })
  await dialog.locator('.field-detail-purpose').getByText('文字', { exact: true }).waitFor()

  // Text to date: a year alone does not read as a date, so the change is listed and cannot be confirmed.
  await field('備註')
  await dialog.getByRole('button', { name: '改成…', exact: true }).click()
  await page.getByRole('menuitem', { name: '日期', exact: true }).click()
  const refusal = dialog.locator('.field-detail-change').getByRole('alert')
  await refusal.waitFor()
  assert.match(await refusal.innerText(), /1999/)
  assert.doesNotMatch(await refusal.innerText(), /12 Nov/)
  assert.equal(
    await dialog.getByRole('button', { name: '確認改用途', exact: true }).isDisabled(),
    true
  )

  assert.deepEqual(errors, [])
  passed = true
  console.log('PASS date field to text and refused text to date. ' + root)
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
