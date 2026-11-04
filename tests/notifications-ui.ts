import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { folderFile } from '../electron/files'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'notifications-'))
const local = path.join(root, 'local'),
  media = path.join(root, 'Media'),
  out = path.join(root, 'out')
const screens = path.join(root, 'screens')
await fs.mkdir(screens)
await fs.mkdir(path.join(media, 'A'), { recursive: true })
await fs.mkdir(out)
const library = new Library(local, undefined, false)
await library.init()
await library.create(media, { name: 'QA-失敗只是名稱', depth: { mode: 'through', level: 2 } })
const originals = new Map<string, Buffer>()
for (const file of [folderFile(media), folderFile(path.join(media, 'A'))])
  originals.set(file, await fs.readFile(file))

const env: Record<string, string> = Object.fromEntries(
  Object.entries({ ...process.env, MEDIA_VIEWER_TEST_DATA: local }).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  )
)
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, timeout: 30000 })
const page = await app.firstWindow(),
  errors: string[] = []
page.setDefaultTimeout(15000)
page.on('pageerror', (error) => errors.push(error.message))
const toast = page.locator('.app-toasts [data-level]')
// A real success notice: exporting the project from its settings.
const exportProject = async () => {
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [folder],
    })) as unknown as typeof dialog.showOpenDialog
  }, out)
  await page.locator('.sidebar-project').filter({ hasText: 'QA-失敗只是名稱' }).hover()
  await page
    .getByRole('button', { name: '專案選單 QA-失敗只是名稱', exact: true })
    .click({ force: true })
  await page.getByRole('menuitem', { name: '專案設定', exact: true }).click()
  const settings = page.getByRole('dialog', { name: /^專案設定/ })
  await settings.getByRole('tab', { name: '備份與移除', exact: true }).click()
  await settings.getByRole('button', { name: '匯出專案資料', exact: true }).click()
  await toast.waitFor()
  await page.keyboard.press('Escape')
  await settings.waitFor({ state: 'hidden' })
}
try {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.show()
    win.focus()
  })
  await page.bringToFront()
  await page.clock.install()

  await exportProject()
  assert.equal(await toast.getAttribute('data-level'), 'success')
  assert.equal(await toast.getAttribute('role'), 'status')
  await page.screenshot({ path: path.join(screens, 'success.png'), animations: 'disabled' })
  // Keep one real-time expiry check. Errors use the controlled clock below.
  await toast.waitFor({ state: 'hidden', timeout: 8000 })

  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = (async () => ({
      canceled: true,
      filePaths: [],
    })) as typeof dialog.showOpenDialog
  })
  await page
    .locator('.project-sidebar')
    .getByRole('button', { name: '新增專案', exact: true })
    .click()
  const create = page.getByRole('dialog', { name: '新增專案', exact: true })
  await create.getByLabel('專案名稱', { exact: true }).fill('Keep draft')
  await create.getByRole('button', { name: '選擇資料夾', exact: true }).click()
  assert.equal(await toast.count(), 0)
  assert.equal(await create.getByLabel('已選資料夾', { exact: true }).innerText(), '尚未選擇資料夾')

  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = (async () => {
      throw new Error('Forced failure without Chinese keywords')
    }) as typeof dialog.showOpenDialog
  })
  await create.getByRole('button', { name: '選擇資料夾', exact: true }).click()
  await toast.waitFor()
  assert.equal(await toast.getAttribute('data-level'), 'error')
  assert.ok((await toast.innerText()).includes('Forced failure without Chinese keywords'))
  assert.equal(await create.getByLabel('專案名稱', { exact: true }).inputValue(), 'Keep draft')
  await page.screenshot({ path: path.join(screens, 'error.png'), animations: 'disabled' })

  for (const [file, bytes] of originals) assert.deepEqual(await fs.readFile(file), bytes)
  assert.deepEqual(errors, [])
  console.log(
    'PASS real success response, expiry, cancellation, IPC exceptions and retained drafts; originals preserved. Artifacts: ' +
      root
  )
} catch (error) {
  await page.screenshot({ path: path.join(screens, 'failure.png') }).catch(() => {})
  console.error('Artifacts: ' + root)
  throw error
} finally {
  await app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.removeAllListeners('close')
      win.webContents.removeAllListeners('will-prevent-unload')
      win.webContents.on('will-prevent-unload', (event) => event.preventDefault())
    }
  })
  await app.close()
}
