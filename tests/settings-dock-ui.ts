import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { closeApp, launchApp, reportFailure, removeTestRoot } from './support/app'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'settings-dock-ui-')),
  media = path.join(root, 'Dock'),
  local = path.join(root, 'local')
await fs.mkdir(path.join(media, 'Child'), { recursive: true })
await fs.writeFile(path.join(media, 'original.txt'), 'PRESERVE ORIGINAL')
const lib = new Library(local, undefined, false)
await lib.init()
await lib.create(media, {
  name: 'Dock Test',
  mediaCategory: 'other',
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})
const errors: string[] = []
const launch = () => launchApp(local, errors)
const close = closeApp
let { app, page } = await launch()
const button = (name: string) => page.getByRole('button', { name, exact: true })
let passed = false
try {
  await button('開啟專案 Dock Test').first().click()
  await page.locator('.folder-panel-header').waitFor()
  // Settings always dock into the right panel; there is no drawer or dock toggle.
  await button('資料夾設定').click()
  await page.locator('.folder-panel-dock-settings').waitFor()
  assert.equal(await page.locator('.mantine-Drawer-content').count(), 0)
  assert.equal(await button('改為抽屜顯示設定').count(), 0)
  assert.equal(await page.getByRole('tab', { name: /^設定/ }).getAttribute('aria-selected'), 'true')
  await page.screenshot({ path: path.join(root, 'docked.png') })
  // Switch between content and settings.
  await page.getByRole('tab', { name: '內容', exact: true }).click()
  await page.locator('.folder-panel-dock-settings').waitFor({ state: 'detached' })
  await page.getByRole('tab', { name: /^設定/ }).click()
  await page.locator('.folder-panel-dock-settings').waitFor()
  // Narrow windows keep the same docked panel.
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1000, height: 800 })
  )
  await page.locator('.folder-panel-dock-settings').waitFor()
  assert.equal(await page.locator('.mantine-Drawer-content').count(), 0)
  // The close button leaves settings.
  await button('關閉資料夾設定').click()
  await page.locator('.folder-panel-dock-settings').waitFor({ state: 'detached' })
  // An older saved preference to use a drawer is ignored after a restart.
  await close(app)
  ;({ app, page } = await launch())
  await button('開啟專案 Dock Test').first().click()
  await page.locator('.folder-panel-header').waitFor()
  await button('資料夾設定').click()
  await page.locator('.folder-panel-dock-settings').waitFor()
  assert.equal(await fs.readFile(path.join(media, 'original.txt'), 'utf8'), 'PRESERVE ORIGINAL')
  assert.deepEqual(errors, [])
  passed = true
  console.log(
    'PASS settings dock: always docked, tab switching, narrow window, close button and restart. ' +
      root
  )
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await close(app)
  if (passed) await removeTestRoot(root)
}
