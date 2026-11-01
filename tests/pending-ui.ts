import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { presetDraft, addPreset, syncPresetDraft } from '../shared/layouts'
import { folderFile } from '../electron/files'
import { WorkspaceStore } from '../electron/workspace'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'pending-ui-')),
  media = path.join(root, 'Album'),
  local = path.join(root, 'local')
await fs.mkdir(media)
for (const name of ['a', 'A', '2', '10'])
  await fs.mkdir(path.join(media, name, 'child'), { recursive: true })
const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB5kAAAAASUVORK5CYII=',
  'base64'
)
await fs.writeFile(path.join(media, 'cover.png'), pixel)
await fs.writeFile(path.join(media, 'a', 'page.png'), pixel)
const lib = new Library(local, undefined, false)
await lib.init()
await lib.create(media, {
  name: 'Pending Album',
  mediaCategory: 'album',
  scanAll: true,
  depth: { mode: 'through', level: 3 },
})
let project = presetDraft(lib.snapshot().projects[0].project!)
project = addPreset(project, 'Alternative', 'alternative', true)
project.fieldBindings = [{ attributeId: 'flag', alias: 'Flag', type: 'boolean' }]
await lib.saveProject(syncPresetDraft(project))
await lib.create(media, {
  name: 'Pending Manga',
  mediaCategory: 'manga',
  scanAll: true,
  depth: { mode: 'through', level: 3 },
})
const workspace = new WorkspaceStore(local, ['zh-TW'])
await workspace.init()
await workspace.update(
  { action: 'createGroup', name: 'One' },
  lib.snapshot().projects.map((p) => p.projectId)
)
await workspace.update(
  { action: 'createGroup', name: 'Two' },
  lib.snapshot().projects.map((p) => p.projectId)
)
const original = await fs.readFile(folderFile(media), 'utf8')
const env = Object.fromEntries(
  Object.entries({ ...process.env, MEDIA_VIEWER_TEST_DATA: local }).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  )
)
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, timeout: 30000 }),
  page = await app.firstWindow(),
  errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
page.setDefaultTimeout(15000)
await page.evaluate('window.__name=(target)=>target')
const button = (name: string) => page.getByRole('button', { name, exact: true })
try {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1500, height: 900 })
  )
  await page.locator('.section-toggle').filter({ hasText: 'Two' }).waitFor()
  const groups = (await workspace.read(lib.snapshot().projects.map((p) => p.projectId))).prefs
    .groups
  const one = page.locator(`[data-group-id="${groups[0].id}"] .section-toggle`),
    two = page.locator(`[data-group-id="${groups[1].id}"] .section-toggle`)
  await page.evaluate(() => {
    const original = Element.prototype.animate
    ;(window as unknown as { groupMoves: number }).groupMoves = 0
    Element.prototype.animate = function (...args) {
      if (this.matches('.sidebar-section'))
        (window as unknown as { groupMoves: number }).groupMoves++
      return original.apply(this, args)
    }
  })
  await two.dragTo(one, { targetPosition: { x: 20, y: 2 } })
  await page.waitForFunction(
    (first) =>
      [...document.querySelectorAll('[data-group-id]')][1]?.getAttribute('data-group-id') === first,
    groups[1].id
  )
  assert.ok(
    (await page.evaluate(() => (window as unknown as { groupMoves: number }).groupMoves)) > 0
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.evaluate(() => ((window as unknown as { groupMoves: number }).groupMoves = 0))
  await one.dragTo(two, { targetPosition: { x: 20, y: 2 } })
  await page.waitForFunction(
    (first) =>
      [...document.querySelectorAll('[data-group-id]')][1]?.getAttribute('data-group-id') === first,
    groups[0].id
  )
  assert.equal(
    await page.evaluate(() => (window as unknown as { groupMoves: number }).groupMoves),
    0
  )
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await button('開啟專案 Pending Album').first().click()
  await button('目前資料夾設定').click()
  const drawer = page.locator('.folder-panel-dock-settings'),
    scheme = drawer.getByRole('textbox', { name: '此資料夾的版面方案', exact: true })
  assert.equal(await scheme.inputValue(), '遵循通用設定（此專案版面）')
  assert.equal(await drawer.locator('.mantine-Divider-root').count(), 1)
  await scheme.click()
  await page.getByRole('option', { name: '預設版面', exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector('.statusbar')?.textContent?.includes('就緒')
  )
  await scheme.click()
  await page.getByRole('option', { name: '遵循通用設定（此專案版面）', exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector('.statusbar')?.textContent?.includes('就緒')
  )
  await button('關閉資料夾設定').click()
  assert.equal(await fs.readFile(folderFile(media), 'utf8'), original)
  const body = page.locator('.folder-panel-body')
  await body.evaluate((element) => {
    const spacer = document.createElement('div')
    spacer.id = 'controlled-scroll-content'
    spacer.style.height = '3000px'
    element.append(spacer)
    element.scrollTop = 200
  })
  await button('返回頂部').waitFor()
  await button('返回頂部').click()
  await page.waitForFunction(() => document.querySelector('.folder-panel-body')?.scrollTop === 0)
  assert.equal(await button('返回頂部').count(), 0)
  await body.evaluate((element) => element.querySelector('#controlled-scroll-content')?.remove())
  const toolbar = page.locator('.workspace-toolbar'),
    mode = toolbar.locator('.center-mode'),
    preset = toolbar.getByRole('textbox', { name: '組件 版面方案', exact: true })
  const modeBox = (await mode.boundingBox())!,
    presetBox = (await preset.boundingBox())!
  assert.ok(Math.abs(modeBox.y - presetBox.y) < 12)
  const toggle = toolbar.locator('[aria-label="展示內容"]')
  const before = await toggle.boundingBox()
  await toolbar.getByText('檔案', { exact: true }).click()
  assert.equal(await button('CARD 顯示設定').count(), 0)
  assert.equal(await preset.count(), 0)
  if (before)
    assert.equal(Math.round((await toggle.boundingBox())!.width), Math.round(before.width))
  await page.locator('.file-overview-item').first().waitFor()
  await page.locator('.file-overview-item').filter({ hasText: 'cover.png' }).click()
  const preview = page.locator('.single-file-preview')
  await preview.getByRole('button', { name: '開啟圖片 cover.png', exact: true }).click()
  await page.getByRole('dialog', { name: '圖片檢視', exact: true }).waitFor()
  await button('放大').click()
  await page.waitForFunction(
    () => document.querySelector('.reader-zoom-value')?.textContent === '125%'
  )
  await page.keyboard.press('r')
  await page.waitForFunction(
    () => document.querySelector('.reader-zoom-value')?.textContent === '100%'
  )
  await button('退出閱讀器').click()
  await toolbar.getByText('資料夾', { exact: true }).click()
  await button('更改樣式').click()
  await page.locator('.editor-toolbar').waitFor()
  const saveBox = (await button('儲存變更').boundingBox())!,
    undoBox = (await button('復原').boundingBox())!
  assert.ok(Math.abs(saveBox.y - undoBox.y) < 12)
  await page.screenshot({ path: path.join(root, 'editor.png') })
  await button('取消').click()
  await button('更改樣式').click()
  await button('刪除欄位 Flag').click()
  const deletion = page.getByRole('dialog', { name: '刪除自訂欄位', exact: true })
  await deletion.waitFor()
  assert.ok((await deletion.textContent())!.includes('受影響欄位：1'))
  await deletion.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal(await button('刪除欄位 Flag').count(), 1)
  await button('刪除欄位 Flag').click()
  await button('確認刪除欄位及資料').click()
  await deletion.waitFor({ state: 'hidden' })
  assert.equal(await button('刪除欄位 Flag').count(), 0)
  await button('取消').click()
  await button('開啟專案 Pending Manga').first().click()
  assert.equal(await toolbar.getByText('檔案', { exact: true }).count(), 0)
  await page.locator('.media-subfolders').getByRole('button', { name: 'a', exact: true }).click()
  await page.locator('.media-thumbnail').filter({ hasText: 'page.png' }).click()
  await page.getByRole('dialog', { name: '漫畫閱讀器', exact: true }).waitFor()
  assert.equal(await page.locator('.reader-page-total').textContent(), '/ 1')
  await button('退出閱讀器').click()
  await button('開啟專案 Pending Manga').first().hover()
  await button('專案選單 Pending Manga').click()
  await page.getByRole('menuitem', { name: '專案設定', exact: true }).click()
  await page.getByRole('tab', { name: '連結與資料', exact: true }).click()
  const beforeRemoval = await fs.readFile(folderFile(media), 'utf8')
  await button('預覽完全移除').click()
  const settings = page.getByRole('dialog', { name: '專案設定 · Pending Manga', exact: true })
  await settings.getByText('Pending Album', { exact: false }).first().waitFor()
  assert.ok((await settings.textContent())!.includes('可能受影響的其他專案（1）'))
  await settings.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal(await fs.readFile(folderFile(media), 'utf8'), beforeRemoval)
  await page.keyboard.press('Escape')
  await settings.waitFor({ state: 'hidden' })
  assert.deepEqual(errors, [])
  assert.deepEqual(await fs.readFile(path.join(media, 'cover.png')), pixel)
  console.log(
    'PASS: folder inheritance and data preservation; toolbar mode sizing/visibility; image click reader and reset; compact editor. Artifacts: ' +
      root
  )
} catch (error) {
  await page.screenshot({ path: path.join(root, 'failure.png') }).catch(() => {})
  console.error('Artifacts: ' + root)
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
