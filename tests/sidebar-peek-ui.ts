import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// With the project sidebar hidden, resting on the left edge lays it over the page; a project pick or Esc puts it away.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'sidebar-peek-')),
  media = path.join(root, 'Library'),
  local = path.join(root, 'local')
await fs.mkdir(path.join(media, 'A'), { recursive: true })
const library = new Library(local, undefined, false)
await library.init()
await library.create(media, { name: 'Peek', depth: { mode: 'through', level: 2 } })
const errors: string[] = []
const { app, page } = await launchApp(local, errors)
let passed = false
try {
  await page.getByRole('button', { name: '切換專案欄', exact: true }).click()
  const slot = page.locator('.sidebar-slot')
  await page.waitForFunction(
    () => document.querySelector('.sidebar-slot')?.getAttribute('data-open') === 'false'
  )
  assert.equal(await slot.getAttribute('data-peek'), 'false')
  await page.waitForFunction(
    () => document.querySelector('.sidebar-slot')!.getBoundingClientRect().width === 0
  )
  // Hovering the edge shows the sidebar as an overlay, without moving the page.
  const before = await page
    .locator('.desktop-body > .center-pane, .project-workspace, .home-page')
    .first()
    .boundingBox()
  await page.locator('.sidebar-edge').hover()
  await page.waitForFunction(
    () => document.querySelector('.sidebar-slot')?.getAttribute('data-peek') === 'true'
  )
  assert.ok((await page.locator('.project-sidebar').boundingBox())!.width > 150)
  const after = await page
    .locator('.desktop-body > .center-pane, .project-workspace, .home-page')
    .first()
    .boundingBox()
  assert.equal(Math.round(after!.x), Math.round(before!.x), 'the page does not move')
  // Esc puts it away again; picking a project does too and keeps the sidebar hidden.
  await page.keyboard.press('Escape')
  await page.waitForFunction(
    () => document.querySelector('.sidebar-slot')?.getAttribute('data-peek') === 'false'
  )
  // Putting it away does not push the page either (the slot used to animate its width back to zero in the flow).
  const closed = await page
    .locator('.desktop-body > .center-pane, .project-workspace, .home-page')
    .first()
    .boundingBox()
  assert.equal(
    Math.round(closed!.x),
    Math.round(before!.x),
    'the page does not move when it closes'
  )
  await page.mouse.move(900, 500)
  await page.locator('.sidebar-edge').hover()
  await page.getByRole('button', { name: '開啟專案 Peek', exact: true }).first().click()
  await page.waitForFunction(
    () => document.querySelector('.sidebar-slot')?.getAttribute('data-peek') === 'false'
  )
  assert.equal(await slot.getAttribute('data-open'), 'false')
  // R-333: the overlay has no pin button of its own; the top-bar button opens the sidebar.
  await page.mouse.move(900, 500)
  await page.locator('.sidebar-edge').hover()
  assert.equal(await page.getByRole('button', { name: '固定展開專案欄', exact: true }).count(), 0) // ui-names: ignore
  assert.deepEqual(errors, [])
  passed = true
  console.log('PASS hover peek of the hidden project sidebar. ' + root)
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
