import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// Field rename, enum condition dropdown and the grouped inspector in the CELL editor.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'field-edit-ui-')),
  media = path.join(root, 'Library'),
  local = path.join(root, 'local')
await fs.mkdir(path.join(media, 'Work'), { recursive: true })
const library = new Library(local, undefined, false)
await library.init()
const created = await library.create(media, {
  name: 'Fields',
  mediaCategory: 'manga',
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})
const project = created.projects[0].project!,
  style = { textColor: '#e4e6e8', backgroundColor: 'transparent' },
  status = crypto.randomUUID(),
  note = crypto.randomUUID()
await library.saveProject({
  ...project,
  fieldBindings: [
    { alias: '狀態', attributeId: status, type: 'enum', options: ['進行中', '已完成'] },
    { alias: '備註', attributeId: note, type: 'string' },
  ],
  cells: [
    ...project.cells,
    {
      cellId: crypto.randomUUID(),
      kind: 'field-enum',
      attributeId: status,
      grid: { x: 0, y: 6, w: 12, h: 1 },
      style,
    },
    {
      cellId: crypto.randomUUID(),
      kind: 'field-text',
      attributeId: note,
      grid: { x: 0, y: 7, w: 12, h: 1 },
      style,
      condition: { attributeId: status, operator: 'equals', value: '進行中' },
    },
  ],
})

const errors: string[] = []
const { app, page } = await launchApp(local, errors, { width: 1500, height: 950 })
let passed = false
try {
  await page.getByRole('button', { name: '開啟專案 Fields', exact: true }).first().click()
  await page.getByRole('button', { name: '更改樣式', exact: true }).click()
  await page.locator('.editor-page').waitFor()

  // The component with a display condition opens its condition section and offers the enum's options.
  await page.locator('.editor-cell').last().click()
  const compare = page.getByRole('textbox', { name: '比較值', exact: true })
  await compare.waitFor()
  await compare.click()
  const options = await page.getByRole('option').allInnerTexts()
  assert.deepEqual(options, ['進行中', '已完成'], 'enum comparison offers the field options')
  await page.getByRole('option', { name: '已完成', exact: true }).click()

  // Rename from the palette: duplicates are refused inline, a free name is applied.
  await page.getByRole('button', { name: '重新命名欄位 備註', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '重新命名欄位', exact: true })
  await dialog.getByLabel('欄位名稱').fill('狀態')
  await dialog.getByText('已有同名欄位').waitFor()
  assert.equal(await dialog.getByRole('button', { name: '確認', exact: true }).isDisabled(), true)
  await dialog.getByLabel('欄位名稱').fill('作者')
  await dialog.getByRole('button', { name: '確認', exact: true }).click()
  await dialog.waitFor({ state: 'hidden' })
  await page.locator('.palette-field').filter({ hasText: '作者' }).waitFor()
  assert.equal(await page.locator('.palette-field').filter({ hasText: '備註' }).count(), 0)

  // Rename also works from the inspector next to the bound field.
  await page.locator('.editor-cell').last().click()
  await page.getByRole('button', { name: '重新命名此欄位', exact: true }).click()
  await dialog.getByLabel('欄位名稱').fill('創作者')
  await dialog.getByRole('button', { name: '確認', exact: true }).click()
  await page.locator('.palette-field').filter({ hasText: '創作者' }).waitFor()

  // Sections collapse and expand.
  const style_ = page.getByRole('button', { name: '樣式', exact: true })
  await style_.click()
  await page.getByLabel('文字顏色').waitFor()
  await style_.click()
  await page.getByLabel('文字顏色').waitFor({ state: 'hidden' })

  assert.deepEqual(errors, [])
  passed = true
  console.log('PASS field rename, enum condition options, inspector sections. ' + root)
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
