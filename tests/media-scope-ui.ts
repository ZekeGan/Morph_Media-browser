import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { WorkspaceStore } from '../electron/workspace'
import { folderFile, projectFile } from '../electron/files'
import { tinyPng } from './support/archive-fixture'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'media-scope-')),
  media = path.join(root, 'Media'),
  local = path.join(root, 'local')
for (const folder of ['A', 'B']) {
  await fs.mkdir(path.join(media, folder), { recursive: true })
  for (const name of ['001.png', '002.png'])
    await fs.writeFile(path.join(media, folder, name), tinyPng)
}
await fs.writeFile(path.join(media, 'root.png'), tinyPng)
const library = new Library(local, undefined, false)
await library.init()
await library.create(media, {
  name: 'Media scope',
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})
const snapshot = library.snapshot(),
  project = snapshot.projects[0].project!,
  originals = new Map<string, Buffer>()
for (const row of snapshot.structure ?? snapshot.rows) {
  originals.set(folderFile(row.path), await fs.readFile(folderFile(row.path)))
  for (const name of await fs.readdir(row.path))
    if (name.endsWith('.png'))
      originals.set(path.join(row.path, name), await fs.readFile(path.join(row.path, name)))
}
originals.set(
  projectFile(media, project.projectId),
  await fs.readFile(projectFile(media, project.projectId))
)
const store = new WorkspaceStore(local, ['zh-TW'])
await store.init()
await store.update({ action: 'appearance', theme: 'glass', locale: 'zh-TW' }, [project.projectId])
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
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
const select = async (label: string, name: string) => {
  await page.getByRole('textbox', { name: label, exact: true }).click()
  await page.getByRole('option', { name, exact: true }).click()
}
const grouped = async () => {
  await page.getByRole('button', { name: '更多檔案選項', exact: true }).click()
  await page.getByRole('menuitem', { name: '依來源分組', exact: true }).click()
}
try {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1500, height: 950 })
  )
  await page.getByRole('button', { name: '開啟專案 Media scope', exact: true }).first().click()
  await page.locator('.media-thumbnail').waitFor()
  assert.equal(
    await page.getByRole('textbox', { name: '檔案範圍', exact: true }).inputValue(),
    '目前資料夾'
  )
  assert.equal(await page.locator('.media-thumbnail').count(), 1)
  await select('檔案範圍', '包含子資料夾')
  await page.waitForFunction(() => document.querySelectorAll('.media-thumbnail').length === 5)
  await grouped()
  for (const view of ['瀑布流', '縮圖', '列表']) {
    await select('檔案展示方式', view)
    await page.locator('.gallery-source-header').first().waitFor()
    assert.equal(await page.locator('.gallery-source-header').count(), 3)
    const a = page
      .locator('.gallery-source-header')
      .filter({ has: page.getByText('A', { exact: true }) })
    await a.locator('button[aria-expanded]').click()
    assert.equal(await page.locator('.media-thumbnail').count(), 3)
    await a.locator('button[aria-expanded]').click()
    assert.equal(await page.locator('.media-thumbnail').count(), 5)
  }
  const sourcePath = path.join(media, 'A') + '/001.png'
  await page
    .locator('.media-thumbnail')
    .filter({ hasText: '001.png' })
    .filter({ has: page.locator('small') })
    .evaluateAll((nodes, title) => {
      if (!nodes.some((node) => node.getAttribute('title') === title))
        throw new Error('Missing source identity')
    }, sourcePath)
  await page
    .locator('.media-thumbnail')
    .and(page.locator('[title=' + JSON.stringify(sourcePath) + ']'))
    .click()
  await page.locator('.media-viewer-shell .is-active').waitFor()
  assert.equal(await page.locator('.media-viewer-source').innerText(), 'A')
  await page.getByRole('button', { name: '切換媒體佇列', exact: true }).click()
  assert.equal(await page.locator('.media-queue-scroll button').count(), 2)
  await page.getByRole('button', { name: '退出閱讀器', exact: true }).click()
  await page.locator('.media-viewer-shell').waitFor({ state: 'detached' })
  assert.equal((await page.locator('.breadcrumb-current').innerText()).trim(), 'Media')
  assert.equal(
    await page.getByRole('textbox', { name: '檔案範圍', exact: true }).inputValue(),
    '包含子資料夾'
  )
  assert.equal(await page.locator('.media-thumbnail').count(), 5)
  // The panel's own back button is hidden while the center is visible; read its state from the DOM.
  assert.equal(
    await page.locator('.folder-panel-header button[aria-label="返回"]').isDisabled(),
    true
  )
  await page.screenshot({ path: path.join(root, 'grouped.png') })
  // Scope, layout and grouping are remembered per project after leaving and reopening it.
  await page.getByRole('button', { name: '返回首頁', exact: true }).click()
  await page.getByRole('button', { name: '開啟專案 Media scope', exact: true }).first().click()
  await page.locator('.media-thumbnail').first().waitFor()
  assert.equal(
    await page.getByRole('textbox', { name: '檔案範圍', exact: true }).inputValue(),
    '包含子資料夾'
  )
  assert.equal(await page.locator('.gallery-source-header').count(), 3)
  assert.equal(await page.locator('.media-thumbnail').count(), 5)
  await page
    .locator('.gallery-source-header')
    .filter({ has: page.getByText('B', { exact: true }) })
    .getByRole('button', { name: '前往資料夾 B', exact: true })
    .click()
  await page.waitForFunction(
    () => document.querySelector('.breadcrumb-current')?.textContent?.trim() === 'B'
  )
  await page.waitForFunction(() => !document.querySelector('.gallery-loading'))
  const divider = await page
    .getByRole('separator', { name: '調整資料夾內容寬度', exact: true })
    .boundingBox()
  assert.ok(divider)
  await page.mouse.move(divider.x + 2, divider.y + 50)
  await page.mouse.down()
  await page.mouse.move(divider.x + 102, divider.y + 50, { steps: 5 })
  await page.mouse.up()
  await page.locator('.media-view-select').waitFor({ state: 'hidden' })
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setMinimumSize(0, 0)
    win.setBounds({ width: 700, height: 780 })
  })
  assert.ok(
    await page
      .locator('.mixed-media-toolbar')
      .evaluate((node) => node.scrollWidth <= node.clientWidth + 1)
  )
  await page.getByRole('button', { name: '更多檔案選項', exact: true }).click()
  await page.getByRole('menuitem', { name: '縮圖', exact: true }).click()
  await page.getByRole('menu').waitFor({ state: 'hidden' })
  await page.screenshot({ path: path.join(root, 'narrow.png') })
  for (const [file, bytes] of originals) {
    if (file === folderFile(path.join(media, 'A'))) {
      const before = JSON.parse(bytes.toString()),
        after = JSON.parse(await fs.readFile(file, 'utf8'))
      assert.equal(after.folderId, before.folderId)
      delete after.revision
      delete before.revision
      delete after.details?.reading
      if (after.details && Object.keys(after.details).every((key) => key === 'schemaVersion'))
        delete after.details
      assert.deepEqual(after, before)
    } else assert.deepEqual(await fs.readFile(file), bytes)
  }
  assert.deepEqual(errors, [])
  console.log(
    'PASS current/descendant scope, source grouping in all presentations, duplicate filenames and source-only viewer queue, return-state/history and explicit source navigation. ' +
      root
  )
} catch (error) {
  await page.screenshot({ path: path.join(root, 'failure.png') }).catch(() => {})
  console.error(root)
  throw error
} finally {
  await app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.removeAllListeners('close')
      win.webContents.on('will-prevent-unload', (event) => event.preventDefault())
    }
  })
  await app.close()
}
