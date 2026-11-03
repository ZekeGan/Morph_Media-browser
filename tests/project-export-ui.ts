import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// Project data export from the project menu, and the import preview from the application settings.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'project-export-ui-')),
  media = path.join(root, 'Library'),
  out = path.join(root, 'out'),
  elsewhere = path.join(root, 'Elsewhere'),
  local = path.join(root, 'local')
await fs.mkdir(path.join(media, 'Work'), { recursive: true })
await fs.mkdir(out)
await fs.mkdir(elsewhere)
const library = new Library(local, undefined, false)
await library.init()
await library.create(media, {
  name: 'Portable',
  mediaCategory: 'manga',
  depth: { mode: 'through', level: 2 },
})

const errors: string[] = []
const { app, page } = await launchApp(local, errors, { width: 1500, height: 950 })
let passed = false
// The native folder dialogs cannot be driven, so they answer from a queue of paths.
const answer = (paths: string[]) =>
  app.evaluate(({ dialog }, queue) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [queue.shift() ?? ''],
    })) as unknown as typeof dialog.showOpenDialog
  }, paths)
try {
  await answer([out])
  await page.locator('.sidebar-project').filter({ hasText: 'Portable' }).hover()
  await page.getByRole('button', { name: '專案選單 Portable', exact: true }).click({ force: true })
  await page.getByRole('menuitem', { name: '匯出專案資料', exact: true }).click()
  await page.waitForFunction(async () => !!document.body.innerText.includes('已匯出到'))
  const exported = (await fs.readdir(out)).filter((name) =>
    name.startsWith('M-orph-export-Portable')
  )
  assert.equal(exported.length, 1, 'one export folder was created')
  const bundle = path.join(out, exported[0])
  const manifest = JSON.parse(await fs.readFile(path.join(bundle, 'manifest.json'), 'utf8'))
  assert.equal(manifest.projectName, 'Portable')

  // Importing the bundle while the same project is still linked shows the preview with a blocker.
  await answer([bundle, elsewhere])
  await page.getByRole('button', { name: '應用程式設定', exact: true }).click()
  await page.getByRole('tab', { name: '連結與維護', exact: true }).click()
  await page.getByRole('button', { name: '匯入專案資料', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '匯入專案資料', exact: true })
  await dialog.waitFor()
  await dialog.getByText('仍連結在另一個位置').waitFor()
  assert.equal(await dialog.getByRole('button', { name: '匯入', exact: true }).isDisabled(), true)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  assert.deepEqual(errors, [])
  passed = true
  console.log('PASS project export from the menu and import preview. ' + root)
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
