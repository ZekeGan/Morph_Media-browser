import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { folderFile, readFolder } from '../electron/files'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// A yes/no field's own wording (R-234), set in the editor's field details, shows on the canvas, in the field list
// preview, on the card and in the folder settings.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'yes-no-wording-ui-')),
  media = path.join(root, 'Library'),
  local = path.join(root, 'local')
await fs.mkdir(media, { recursive: true })
const library = new Library(local, undefined, false)
await library.init()
const created = await library.create(media, {
  name: 'Wording',
  scanAll: true,
  depth: { mode: 'through', level: 1 },
})
const project = created.projects[0].project!
await library.saveProject({
  ...project,
  fieldBindings: [{ alias: 'Owned', attributeId: 'owned', type: 'boolean' }],
  cells: [
    ...project.cells,
    {
      cellId: 'owned-cell',
      kind: 'field-boolean',
      attributeId: 'owned',
      grid: { x: 0, y: 10, w: 12, h: 1 },
      style: { textColor: '#e4e6e8', backgroundColor: 'transparent' },
    },
  ],
})
const record = await readFolder(media)
record.attributes = [
  { attributeId: 'owned', key: 'Owned', type: 'boolean', value: true, source: 'manual' },
]
await fs.writeFile(folderFile(media), JSON.stringify(record))
await library.scan()

const errors: string[] = []
const { app, page } = await launchApp(local, errors, { width: 1500, height: 950 })
let passed = false
try {
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  await page.getByRole('button', { name: '開啟專案 Wording', exact: true }).first().click()
  await page.locator('.workspace-toolbar').waitFor()
  // Set the wording in the editor's field details, then save the layout.
  await button('編輯版面').click()
  await page.locator('.editor-page').waitFor()
  await button('欄位操作 Owned').click()
  await page.getByRole('menuitem', { name: '欄位設定…', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '管理欄位', exact: true })
  await manager.getByRole('textbox', { name: '「是」顯示為', exact: true }).fill('已收藏')
  await manager.getByRole('textbox', { name: '「否」顯示為', exact: true }).fill('未收藏')
  await page.keyboard.press('Escape')
  await manager.waitFor({ state: 'hidden' })
  await page.locator('.editor-cell').getByText('已收藏', { exact: true }).waitFor()
  // The field list previews the value with the same wording.
  await page
    .locator('.palette-field')
    .filter({ hasText: 'Owned' })
    .getByText('已收藏', { exact: true })
    .waitFor()
  await button('儲存').click()
  await page.locator('.editor-page').waitFor({ state: 'hidden' })
  // The card shows it.
  await page
    .locator('.folder-card, .card-grid')
    .getByText('已收藏', { exact: true })
    .first()
    .waitFor()
  // The folder settings offer it.
  await button('目前資料夾設定').click()
  const owned = page.getByRole('textbox', { name: 'Owned', exact: true })
  await owned.waitFor()
  assert.equal(await owned.inputValue(), '已收藏')
  assert.deepEqual(errors, [])
  passed = true
  console.log('PASS yes/no wording on the card and in folder settings. ' + root)
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
