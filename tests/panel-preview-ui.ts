import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// One click shows a folder's details in the right panel; only a double click moves the center into it.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'panel-preview-ui-')),
  media = path.join(root, 'Games'),
  local = path.join(root, 'local')
for (const name of ['Game A', 'Game B']) {
  await fs.mkdir(path.join(media, name, 'Game_Data'), { recursive: true })
  await fs.writeFile(path.join(media, name, 'Game.exe'), 'x')
}
const lib = new Library(local, undefined, false)
await lib.init()
await lib.create(media, {
  name: 'Preview',
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})
const errors: string[] = []
const { app, page } = await launchApp(local, errors)
let passed = false
try {
  await page.getByRole('button', { name: '開啟專案 Preview', exact: true }).first().click()
  const card = (name: string) =>
    page
      .locator('.folder-card')
      .filter({ has: page.locator('.cell-name').getByText(name, { exact: true }) })
  const title = () => page.locator('.folder-panel-header strong')
  const crumb = async () =>
    (await page.locator('.workspace-breadcrumb').innerText()).replace(/\s+/g, ' ')
  await card('Game B').waitFor()
  await page.waitForFunction(
    () => document.querySelector('.folder-panel-header strong')?.textContent === 'Games'
  )

  await card('Game B').click()
  await page.waitForFunction(
    () => document.querySelector('.folder-panel-header strong')?.textContent === 'Game B'
  )
  assert.match(await crumb(), /^Games\b/)
  assert.doesNotMatch(await crumb(), /Game B/, 'the center did not enter the folder')

  await card('Game A').click()
  await page.waitForFunction(
    () => document.querySelector('.folder-panel-header strong')?.textContent === 'Game A'
  )
  assert.doesNotMatch(await crumb(), /Game A/)

  // Clicking the selected folder again clears the selection: the panel returns to the folder the path bar is on.
  await card('Game A').click()
  await page.waitForFunction(
    () => document.querySelector('.folder-panel-header strong')?.textContent === 'Games'
  )
  await card('Game A').click()
  await page.waitForFunction(
    () => document.querySelector('.folder-panel-header strong')?.textContent === 'Game A'
  )
  await page.keyboard.press('Escape')
  await page.waitForFunction(
    () => document.querySelector('.folder-panel-header strong')?.textContent === 'Games'
  )

  await card('Game B').dblclick()
  await page.waitForFunction(
    () => document.querySelector('.breadcrumb-current')?.textContent?.trim() === 'Game B'
  )
  assert.equal((await title().innerText()).trim(), 'Game B')
  assert.deepEqual(errors, [])
  passed = true
  console.log(
    'PASS single click previews a folder in the right panel; double click enters it. ' + root
  )
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
