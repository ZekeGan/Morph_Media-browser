import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// A choice field gets a new option straight from the folder settings, without opening the CELL editor.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'enum-add-option-ui-')),
  media = path.join(root, 'Library'),
  local = path.join(root, 'local')
await fs.mkdir(path.join(media, 'Work'), { recursive: true })
const library = new Library(local, undefined, false)
await library.init()
const created = await library.create(media, {
  name: 'Choices',
  mediaCategory: 'manga',
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})
const project = created.projects[0].project!,
  status = crypto.randomUUID()
await library.saveProject({
  ...project,
  fieldBindings: [
    { alias: '狀態', attributeId: status, type: 'enum', options: ['進行中', '已完成'] },
  ],
})

const errors: string[] = []
const { app, page } = await launchApp(local, errors, { width: 1500, height: 950 })
let passed = false
try {
  await page.getByRole('button', { name: '開啟專案 Choices', exact: true }).first().click()
  await page.getByRole('button', { name: '目前資料夾設定', exact: true }).click()
  const input = page.getByRole('textbox', { name: '新增選項 狀態', exact: true })
  await input.fill('暫停')
  await page.getByRole('button', { name: '新增選項', exact: true }).click()
  await page.getByRole('textbox', { name: '狀態', exact: true }).waitFor()
  await page.waitForFunction(
    () =>
      (document.querySelector('input[aria-label="新增選項 狀態"]') as HTMLInputElement)?.value ===
      ''
  )
  assert.equal(await page.getByRole('textbox', { name: '狀態', exact: true }).inputValue(), '暫停')
  await page.getByRole('textbox', { name: '狀態', exact: true }).click()
  const options = await page.getByRole('option').allInnerTexts()
  assert.deepEqual(options, ['進行中', '已完成', '暫停'])
  assert.deepEqual(errors, [])
  passed = true
  console.log('PASS add choice option from folder settings. ' + root)
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
