import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { folderFile } from '../electron/files'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// Backup and restore from the application settings, on a controlled folder.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'backup-ui-')),
  media = path.join(root, 'Library'),
  out = path.join(root, 'out'),
  local = path.join(root, 'local')
await fs.mkdir(path.join(media, 'Work'), { recursive: true })
await fs.writeFile(path.join(media, 'Work', 'page.txt'), 'ORIGINAL')
await fs.mkdir(out)
const library = new Library(local, undefined, false)
await library.init()
await library.create(media, {
  name: 'Portable',
  depth: { mode: 'through', level: 2 },
})
const record = await fs.readFile(folderFile(path.join(media, 'Work')))

const errors: string[] = []
const { app, page } = await launchApp(local, errors, { width: 1500, height: 950 })
let passed = false
// The native folder dialog cannot be driven, so it answers with the given folder.
const answer = (folder: string) =>
  app.evaluate(({ dialog }, chosen) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [chosen],
    })) as unknown as typeof dialog.showOpenDialog
  }, folder)
try {
  await page.getByRole('button', { name: '應用程式設定', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '應用程式設定', exact: true })
  await settings.getByRole('tab', { name: '備份', exact: true }).click()
  await settings.getByRole('button', { name: '建立備份', exact: true }).click()
  const row = settings.getByRole('listitem').filter({ hasText: '手動備份' })
  await row.waitFor()
  const kept = path.join(local, 'backups')
  const made = (await fs.readdir(kept)).filter((name) => name.startsWith('M-orph-backup-'))
  assert.equal(made.length, 1, 'one backup folder was created')
  const backup = path.join(kept, made[0])
  const manifest = JSON.parse(await fs.readFile(path.join(backup, 'backup.json'), 'utf8'))
  assert.deepEqual(
    manifest.projects.map((p: { name: string }) => p.name),
    ['Portable']
  )
  // Export copies the backup elsewhere (another disk).
  await answer(out)
  await row.getByRole('button', { name: /^匯出 / }).click()
  await page.waitForFunction(() => document.body.innerText.includes('已匯出備份'))
  assert.ok((await fs.readdir(out)).includes(made[0]))

  // Restoring the project in place from the list: the folder is found and existing info stays as it is.
  await row.getByRole('button', { name: /^還原 / }).click()
  const restore = settings.locator('.restore-preview')
  await restore.waitFor()
  await restore.getByText('找到資料夾').waitFor()
  await restore.getByRole('checkbox', { name: /^設定/ }).uncheck()
  await restore.getByRole('button', { name: '還原勾選的項目', exact: true }).click()
  await page.waitForFunction(() => document.body.innerText.includes('已還原：Portable'))
  await restore.waitFor({ state: 'hidden' })
  // Restoring projects only fills in, so it adds no backup and offers no settings undo.
  assert.equal(await settings.getByRole('listitem').count(), 1)
  assert.equal(await settings.getByRole('button', { name: '回到還原之前' }).count(), 0)
  await page.evaluate(() => {
    window.confirm = () => true
  })
  await row.getByRole('button', { name: /^刪除 / }).click()
  await row.waitFor({ state: 'detached' })
  assert.ok(!(await fs.readdir(kept)).includes(made[0]))
  assert.deepEqual(await fs.readFile(folderFile(path.join(media, 'Work'))), record)
  assert.equal(await fs.readFile(path.join(media, 'Work', 'page.txt'), 'utf8'), 'ORIGINAL')
  await page.keyboard.press('Escape')
  await settings.waitFor({ state: 'hidden' })

  // A project removed from the list comes back through "New project": the folder still holds it.
  await page.locator('.sidebar-project').filter({ hasText: 'Portable' }).hover()
  await page.getByRole('button', { name: '專案選單 Portable', exact: true }).click({ force: true })
  await page.getByRole('menuitem', { name: '專案設定', exact: true }).click()
  const projectSettings = page.getByRole('dialog', { name: '專案設定 · Portable', exact: true })
  await projectSettings.getByRole('tab', { name: '移除', exact: true }).click()
  await projectSettings.getByRole('button', { name: '從清單移除', exact: true }).click()
  await projectSettings.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.sidebar-project').filter({ hasText: 'Portable' }).count(), 0)
  await answer(media)
  await page.getByRole('button', { name: '新增專案', exact: true }).first().click()
  const create = page.getByRole('dialog', { name: '新增專案', exact: true })
  await create.getByRole('button', { name: '選擇資料夾', exact: true }).click()
  await create.getByText('這個資料夾裡有之前的專案').waitFor()
  await create.getByRole('button', { name: '接回原本的專案', exact: true }).click()
  await create.waitFor({ state: 'hidden' })
  await page.locator('.sidebar-project').filter({ hasText: 'Portable' }).first().waitFor()
  assert.deepEqual(await fs.readFile(folderFile(path.join(media, 'Work'))), record)
  assert.deepEqual(errors, [])
  passed = true
  console.log(
    'PASS backup, restore preview/apply, and bringing a removed project back from New project. ' +
      root
  )
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
