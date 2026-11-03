import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'notifications-'))
const local = path.join(root, 'local'),
  legacy = path.join(local, 'app-data')
const screens = path.join(root, 'screens')
await fs.mkdir(screens)
const projects = [
  { id: 'success', name: 'QA-失敗只是名稱', targetFolderPath: path.join(root, 'Success') },
  { id: 'warning', name: 'QA-部分匯入', targetFolderPath: path.join(root, 'Warning') },
  { id: 'error', name: 'QA-失效路徑', targetFolderPath: path.join(root, 'Missing') },
]
const originals = new Map<string, Buffer>()
const write = async (file: string, value: unknown) => {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const bytes = Buffer.from(JSON.stringify(value))
  await fs.writeFile(file, bytes)
  originals.set(file, bytes)
}
await write(path.join(legacy, 'view.json'), projects)
for (const project of projects) {
  await write(
    path.join(legacy, 'viewColumn', project.id + '.json'),
    project.id === 'warning' ? ['../invalid-key'] : []
  )
  await write(path.join(legacy, 'viewFolder', project.id + '.json'), [])
  if (project.id !== 'error')
    await write(path.join(project.targetFolderPath, 'keep.json'), { original: project.id })
}

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
const importProject = async (name: string) => {
  await page.getByRole('button', { name: '應用程式設定', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '應用程式設定', exact: true })
  await settings.getByRole('tab', { name: '連結與維護', exact: true }).click()
  await settings.getByRole('button', { name: '檢視舊資料匯入', exact: true }).click()
  const preview = page.getByRole('dialog', { name: '舊資料匯入預覽', exact: true })
  await preview.getByRole('checkbox', { name: new RegExp('^' + name) }).check()
  await preview.getByRole('button', { name: '備份舊檔並匯入選定專案', exact: true }).click()
  await preview.waitFor({ state: 'hidden' })
  await toast.waitFor()
}
try {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.show()
    win.focus()
  })
  await page.bringToFront()
  await page.clock.install()

  await importProject(projects[0].name)
  assert.equal(await toast.getAttribute('data-level'), 'success')
  assert.equal(await toast.getAttribute('role'), 'status')
  assert.ok((await toast.innerText()).includes('失敗只是名稱'))
  await page.screenshot({ path: path.join(screens, 'success.png'), animations: 'disabled' })
  // Keep one real-time expiry check. Warnings/errors use the controlled clock below.
  await toast.waitFor({ state: 'hidden', timeout: 8000 })

  await importProject(projects[1].name)
  assert.equal(await toast.getAttribute('data-level'), 'warning')
  assert.equal(await toast.getAttribute('role'), 'alert')
  assert.ok((await toast.innerText()).includes('需要注意'))
  await page.clock.fastForward(6000)
  assert.equal(await toast.isVisible(), true)
  await page.screenshot({ path: path.join(screens, 'warning.png'), animations: 'disabled' })

  await importProject(projects[2].name)
  assert.equal(await toast.getAttribute('data-level'), 'error')
  assert.equal(await toast.getAttribute('role'), 'alert')
  await page.clock.fastForward(6000)
  assert.equal(await toast.isVisible(), true)
  await toast.getByRole('button').click()
  await toast.waitFor({ state: 'hidden' })

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
  assert.equal((await fs.readdir(path.join(local, 'legacy-backups'))).length, 3)
  assert.equal(
    await fs.stat(projects[2].targetFolderPath).then(
      () => true,
      () => false
    ),
    false
  )
  assert.deepEqual(errors, [])
  console.log(
    'PASS real success/warning/error responses, names independent of severity, expiry/persistence, cancellation, IPC exceptions and retained drafts; originals/backups preserved. Artifacts: ' +
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
