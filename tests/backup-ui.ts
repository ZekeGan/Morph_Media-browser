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
  await answer(out)
  await settings.getByRole('button', { name: '建立備份', exact: true }).click()
  await page.waitForFunction(() => document.body.innerText.includes('已建立備份'))
  const made = (await fs.readdir(out)).filter((name) => name.startsWith('M-orph-backup-'))
  assert.equal(made.length, 1, 'one backup folder was created')
  const backup = path.join(out, made[0])
  const manifest = JSON.parse(await fs.readFile(path.join(backup, 'backup.json'), 'utf8'))
  assert.deepEqual(
    manifest.projects.map((p: { name: string }) => p.name),
    ['Portable']
  )

  // Restoring the project in place: the folder is found and existing info stays as it is.
  await answer(backup)
  await settings.getByRole('button', { name: '從備份還原', exact: true }).click()
  const restore = settings.locator('.restore-preview')
  await restore.waitFor()
  await restore.getByText('找到資料夾').waitFor()
  await restore.getByRole('checkbox', { name: /^設定/ }).uncheck()
  await restore.getByRole('button', { name: '還原勾選的項目', exact: true }).click()
  await page.waitForFunction(() => document.body.innerText.includes('已還原：Portable'))
  await restore.waitFor({ state: 'hidden' })
  assert.deepEqual(await fs.readFile(folderFile(path.join(media, 'Work'))), record)
  assert.equal(await fs.readFile(path.join(media, 'Work', 'page.txt'), 'utf8'), 'ORIGINAL')
  assert.deepEqual(errors, [])
  passed = true
  console.log('PASS backup from the application settings and restore preview/apply. ' + root)
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
