import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { tinyPng } from './support/archive-fixture'
import { closeApp, launchApp, reportFailure, removeTestRoot } from './support/app'

// A folder in a game project that is not a game ROOT must show the shared folder page:
// details, subfolders and files, not a bare name/path card.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'game-folder-page-ui-')),
  media = path.join(root, 'Games'),
  local = path.join(root, 'local')
await fs.mkdir(path.join(media, 'Sub'), { recursive: true })
await fs.writeFile(path.join(media, 'pic.png'), tinyPng)
const lib = new Library(local, undefined, false)
await lib.init()
await lib.create(media, {
  name: 'Game Page',
  mediaCategory: 'game',
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})
const errors: string[] = []
const { app, page } = await launchApp(local, errors)
let passed = false
try {
  await page.getByRole('button', { name: '開啟專案 Game Page', exact: true }).first().click()
  const body = page.locator('.folder-panel-body')
  await body.locator('.mixed-media-browser').waitFor()
  await body.locator('.folder-details summary').waitFor()
  assert.equal(
    await body.locator('.folder-details').evaluate((node) => (node as HTMLDetailsElement).open),
    false
  )
  await body.locator('.media-subfolder').getByRole('button', { name: 'Sub', exact: true }).waitFor()
  await body.locator('.media-thumbnail').filter({ hasText: 'pic.png' }).waitFor()
  await page.screenshot({ path: path.join(root, 'game-folder-page.png') })
  assert.deepEqual(await fs.readFile(path.join(media, 'pic.png')), tinyPng)
  assert.deepEqual(errors, [])
  passed = true
  console.log(
    'PASS non-game folder in a game project uses the shared details/subfolders/files page. ' + root
  )
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
