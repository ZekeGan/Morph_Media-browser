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
  await page.keyboard.press('Escape')
  // The unsaved value shows a sticky save bar and a dot on the tab; discarding clears both.
  const savebar = page.getByRole('region', { name: '未保存的變更', exact: true })
  await savebar.waitFor()
  await savebar.getByText('有 1 項未保存').waitFor()
  assert.equal(await page.getByRole('img', { name: '未保存', exact: true }).count(), 1)
  await savebar.getByRole('button', { name: '放棄', exact: true }).click()
  await savebar.waitFor({ state: 'hidden' })
  assert.equal(await page.getByRole('textbox', { name: '狀態', exact: true }).inputValue(), '')
  // The shared / this-project switch lives in the data tab and explains what it changes.
  await page.getByText('修改會同步到使用這個資料夾的其他專案。').waitFor()
  await page.locator('label').filter({ hasText: '僅目前專案' }).click()
  await page.getByText('修改只用於目前專案；其他專案仍用共用資料。').waitFor()
  // The folder type is detected and can be set by hand.
  const kind = page.getByRole('textbox', { name: '資料夾類型', exact: true })
  await kind.waitFor()
  assert.match(await kind.inputValue(), /^自動（偵測為 /)
  await kind.click()
  await page.getByRole('option', { name: '一般', exact: true }).click()
  await page.waitForFunction(() =>
    [...document.querySelectorAll('input')].some((input) => input.value === '一般')
  )
  // Game features follow the folder's type, not the project's category.
  assert.equal(await page.getByRole('tab', { name: '遊戲操作', exact: true }).count(), 0)
  await kind.click()
  await page.getByRole('option', { name: '遊戲', exact: true }).click()
  await page.getByRole('tab', { name: '遊戲操作', exact: true }).waitFor()
  await kind.click()
  await page.getByRole('option', { name: '一般', exact: true }).click()
  await page.getByRole('tab', { name: '遊戲操作', exact: true }).waitFor({ state: 'detached' })
  // Scan boundaries belong to games: a manga project with no detected game does not show them.
  await page.getByRole('tab', { name: '進階', exact: true }).click()
  await page.getByText('全部已存屬性與來源').waitFor()
  assert.equal(await page.getByText('掃描邊界', { exact: true }).count(), 0)
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
