import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'toolbar-ui-')),
  media = path.join(root, 'Media'),
  local = path.join(root, 'local')
await fs.mkdir(path.join(media, 'Child'), { recursive: true })
const library = new Library(local, undefined, false)
await library.init()
await library.create(media, {
  name: 'Toolbar',
  mediaCategory: 'album',
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})
const original = await fs.readFile(path.join(media, '.media-viewer', 'folder.json'))
const env = Object.fromEntries(
  Object.entries({ ...process.env, MEDIA_VIEWER_TEST_DATA: local }).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  )
)
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, timeout: 30000 }),
  page = await app.firstWindow()
page.setDefaultTimeout(15000)
await page.evaluate('window.__name=(target)=>target')
const button = (name: string) => page.getByRole('button', { name, exact: true })
try {
  await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0]
    w.setMinimumSize(500, 400)
    w.setBounds({ width: 1440, height: 900 })
  })
  await button('開啟專案 Toolbar').first().click()
  // One refresh control lives in the top bar next to the application settings; the old rescan / panel buttons are gone.
  assert.equal(await button('重新整理').count(), 1)
  assert.equal(await page.locator('.titlebar').getByRole('button', { name: '重新整理' }).count(), 1)
  assert.equal(await button('重新掃描').count(), 0)
  // Display settings live in one popover button instead of a permanent row.
  assert.equal(await page.locator('.card-inline-controls').count(), 0)
  await button('卡片顯示設定').click()
  await page.locator('.card-inline-controls').waitFor()
  assert.equal(await page.getByLabel('每頁筆數', { exact: true }).count(), 1)
  await button('卡片顯示設定').click()
  await page.locator('.card-inline-controls').waitFor({ state: 'detached' })
  await page.locator('.center-mode').getByText('表格', { exact: true }).click()
  await button('選擇表格欄位').click()
  await page.getByRole('checkbox', { name: '目前路徑', exact: true }).uncheck()
  assert.equal(
    await page.getByRole('checkbox', { name: '資料夾名稱', exact: true }).isDisabled(),
    true
  )
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.folder-table th').filter({ hasText: '目前路徑' }).count(), 0)
  await page
    .locator('.folder-table th')
    .filter({ hasText: '資料夾名稱' })
    .dragTo(page.locator('.folder-table th').filter({ hasText: '層級' }), {
      targetPosition: { x: 2, y: 8 },
    })
  assert.equal(await page.locator('.folder-table th').count(), 2)
  await page.keyboard.press('Alt+Enter')
  await page.locator('.folder-panel-dock-settings').waitFor()
  await button('關閉資料夾設定').click()
  await page.locator('.workspace-toolbar').getByText('檔案', { exact: true }).click()
  await page.locator('.workspace-file-tools .overview-folder-select').waitFor()
  assert.equal(await page.locator('.file-overview .file-overview-toolbar').count(), 0)
  assert.equal(await button('卡片顯示設定').count(), 0)
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 700, height: 760 })
  )
  await page.screenshot({ path: path.join(root, 'narrow.png') })
  assert.ok((await page.locator('.workspace-file-tools').boundingBox())!.width < 700)
  assert.deepEqual(await fs.readFile(path.join(media, '.media-viewer', 'folder.json')), original)
  console.log(
    'PASS: inline CARD controls, TABLE visibility, accessible setting shortcut, theme headers and top file controls. Artifacts: ' +
      root
  )
} catch (error) {
  await page.screenshot({ path: path.join(root, 'failure.png') }).catch(() => {})
  console.error(root)
  throw error
} finally {
  await app.evaluate(({ BrowserWindow }) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.removeAllListeners('close')
      w.webContents.on('will-prevent-unload', (e) => e.preventDefault())
    }
  })
  await app.close()
}
