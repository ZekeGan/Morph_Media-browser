import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// The problems dialog: a game that is only a candidate is listed with buttons, confirming it clears the item, and
// the protection notes of game folders are not counted as problems.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'problems-')),
  media = path.join(root, 'Library'),
  local = path.join(root, 'local')
await fs.mkdir(path.join(media, 'Game A', 'Game_Data'), { recursive: true })
await fs.writeFile(path.join(media, 'Game A', 'Game.exe'), 'x')
const library = new Library(local, undefined, false)
await library.init()
await library.create(media, { name: 'Problems', depth: { mode: 'through', level: 2 } })
const errors: string[] = []
const { app, page } = await launchApp(local, errors)
let passed = false
try {
  await page.getByRole('button', { name: '開啟專案 Problems', exact: true }).first().click()
  await page.locator('.project-workspace').waitFor()
  // Candidate games are not "problems": the status bar says so, the dialog lists them.
  await page.waitForFunction(
    () => document.querySelector('.status-problems')?.textContent === '沒有問題'
  )
  await page.getByRole('button', { name: '查看問題', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '問題與復原', exact: true })
  await dialog.getByText('待確認的遊戲', { exact: true }).waitFor()
  await dialog
    .getByRole('button', { name: /^確認遊戲/ })
    .first()
    .click()
  await dialog.getByText('待確認的遊戲', { exact: true }).waitFor({ state: 'detached' })
  await dialog.getByText('目前沒有需要處理的問題。').waitFor()
  assert.deepEqual(errors, [])
  passed = true
  console.log('PASS candidate games are confirmed from the problems dialog. ' + root)
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
