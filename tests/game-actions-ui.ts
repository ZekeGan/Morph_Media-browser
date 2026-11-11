import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { folderFile, projectFile } from '../electron/files'
import { closeApp } from './support/app'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'game-actions-ui-')),
  media = path.join(root, 'Games'),
  local = path.join(root, 'local'),
  game = path.join(media, 'Game'),
  screens = path.join(root, 'screens'),
  album = path.join(root, 'Album')
await fs.mkdir(path.join(game, 'Game_Data'), { recursive: true })
await fs.mkdir(screens)
for (const [name, value] of Object.entries({
  'Game.exe': 'CONTROLLED FAKE EXE',
  'UnityPlayer.dll': 'CONTROLLED MARKER',
  'notes.txt': 'ORIGINAL NOTES',
  // R-306 / R-307: a bundled manual and a Steam App ID file.
  'manual.pdf': 'CONTROLLED MANUAL',
  'steam_appid.txt': '620',
}))
  await fs.writeFile(path.join(game, name), value)
const library = new Library(local, undefined, false)
await library.init()
const snapshot = await library.create(media, {
    name: 'Game actions test',
    depth: { mode: 'through', level: 3 },
  }),
  project = snapshot.projects[0].project!
await fs.mkdir(album)
const imageName = 'A very long controlled image filename '.repeat(4) + '.png',
  pixel = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB5kAAAAASUVORK5CYII=',
    'base64'
  )
await fs.writeFile(path.join(album, imageName), pixel)
await library.create(album, {
  name: 'Image title test',
  depth: { mode: 'through', level: 1 },
})
const originalRecord = await fs.readFile(folderFile(game), 'utf8'),
  originalProject = await fs.readFile(projectFile(media, project.projectId), 'utf8')
const env: Record<string, string> = Object.fromEntries(
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
await app.evaluate(({ dialog }) => {
  dialog.showMessageBoxSync = () => 1
})
const button = (name: string) => page.getByRole('button', { name, exact: true })
const idle = () =>
  page.waitForFunction(() => {
    const text = document.querySelector('.statusbar')?.textContent ?? ''
    return text.includes('就緒') || text.includes('未保存')
  })
try {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1350, height: 900 })
  )
  await button('開啟專案 Game actions test').first().click()
  assert.equal(await page.locator('.game-content').count(), 0)
  await page.locator('.browse-main .folder-card').first().dblclick()
  await page
    .locator(
      `.browse-main .folder-card[data-row-id="${snapshot.structure!.find((row) => row.path === game)!.rowId}"]`
    )
    .dblclick()
  await page.locator('.game-actions').waitFor()
  assert.equal(await page.locator('.game-candidate').count(), 1)
  // Nothing is bound yet, so no action button is offered, only the hint to bind one.
  assert.equal(
    await page
      .locator('.game-actions')
      .getByRole('button', { name: '啟動遊戲', exact: true })
      .count(),
    0
  )
  await page.locator('.game-launch-hint').waitFor()
  // R-307: steam_appid.txt offers a Steam launch button next to the bound actions (disabled without Steam).
  await page
    .locator('.game-actions')
    .getByRole('button', { name: '用 Steam 啟動', exact: true })
    .waitFor()
  await page.screenshot({ path: path.join(base, 'shot', 'r305-game-extras.png') })
  await button('自訂遊戲操作').click()
  const drawer = page.locator('.folder-panel-dock-settings')
  await drawer.getByRole('tab', { name: '遊戲操作', exact: true }).waitFor()
  assert.equal(
    await drawer.getByRole('tab', { name: '遊戲操作', exact: true }).getAttribute('aria-selected'),
    'true'
  )
  // R-305 / R-306: the save folder line and the bundled manual offered as a suggestion, not added on its own.
  await drawer.getByText('存檔資料夾', { exact: true }).waitFor()
  await drawer.getByRole('button', { name: '加入 manual.pdf', exact: true }).waitFor()
  await page.screenshot({ path: path.join(base, 'shot', 'r305-game-extras-settings.png') })
  const args = drawer.getByRole('textbox', { name: '啟動參數（JSON 字串陣列）', exact: true })
  await args.fill('["with spaces", "\\\"quoted\\\"", "$(literal)"]')
  await drawer.getByRole('tab', { name: '資料', exact: true }).click()
  await drawer.getByRole('tab', { name: '遊戲操作', exact: true }).click()
  assert.ok((await args.inputValue()).includes('with spaces'))
  await app.evaluate(({ dialog }) => {
    ;(globalThis as unknown as { gamePicker: unknown[] }).gamePicker = []
    dialog.showOpenDialog = (async (...params: unknown[]) => {
      ;(globalThis as unknown as { gamePicker: unknown[] }).gamePicker.push(params.at(-1))
      return { canceled: true, filePaths: [] }
    }) as typeof dialog.showOpenDialog
  })
  await drawer.getByRole('button', { name: '選擇 EXE 並保存參數', exact: true }).click()
  await idle()
  const pickers = await app.evaluate(
    () => (globalThis as unknown as { gamePicker: { defaultPath?: string }[] }).gamePicker
  )
  assert.equal(pickers[0].defaultPath, game)
  assert.equal(await fs.readFile(folderFile(game), 'utf8'), originalRecord)
  assert.equal(await fs.readFile(projectFile(media, project.projectId), 'utf8'), originalProject)
  assert.ok((await args.inputValue()).includes('with spaces'))
  await drawer.getByRole('button', { name: '取消變更', exact: true }).click()
  await drawer.getByRole('button', { name: '自訂工具列', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '自訂工具列', exact: true })
  await editor.getByRole('button', { name: '加入按鈕', exact: true }).click()
  await editor.getByRole('textbox', { name: '按鈕文字', exact: true }).fill('Open notes')
  await editor.getByRole('textbox', { name: '任務類型', exact: true }).click()
  await page.getByRole('option', { name: '以指定應用程式開啟檔案', exact: true }).click()
  await editor.locator('.game-action-item').last().focus()
  await page.keyboard.press('Alt+ArrowUp')
  assert.ok(
    (await editor.locator('.game-action-select').first().innerText()).includes('Open notes')
  )
  await editor.getByRole('button', { name: '加入按鈕', exact: true }).click()
  await editor.getByRole('textbox', { name: '按鈕文字', exact: true }).fill('Website')
  await editor.getByRole('textbox', { name: '任務類型', exact: true }).click()
  await page.getByRole('option', { name: '開啟網址', exact: true }).click()
  // The drag events are sent directly with one shared DataTransfer: Playwright's native drag sometimes never starts
  // (about 1 run in 10), while this still runs the item's own dragstart, dragover and drop handlers.
  const transfer = await page.evaluateHandle(() => new DataTransfer())
  const source = editor.locator('.game-action-item').last(),
    target = editor.locator('.game-action-item').first()
  await source.dispatchEvent('dragstart', { dataTransfer: transfer })
  await target.dispatchEvent('dragenter', { dataTransfer: transfer })
  await target.dispatchEvent('dragover', { dataTransfer: transfer })
  await target.dispatchEvent('drop', { dataTransfer: transfer })
  await source.dispatchEvent('dragend', { dataTransfer: transfer })
  // The new order renders after the drop: wait for it instead of reading the list at once.
  await editor
    .locator('.game-action-select')
    .first()
    .filter({ hasText: 'Website' })
    .waitFor({ timeout: 3000 })
  await page.screenshot({ path: path.join(screens, 'editor.png') })
  page.once('dialog', (dialog) => dialog.accept())
  await editor.locator('.mantine-Modal-close').click()
  await editor.waitFor({ state: 'hidden' })
  assert.equal(await fs.readFile(projectFile(media, project.projectId), 'utf8'), originalProject)
  await drawer.getByRole('button', { name: '自訂工具列', exact: true }).click()
  await editor.waitFor()
  assert.equal(await editor.locator('.game-action-item').count(), 1)
  await editor.getByRole('button', { name: '加入按鈕', exact: true }).click()
  await editor.getByRole('textbox', { name: '按鈕文字', exact: true }).fill('Website')
  await editor.getByRole('textbox', { name: '任務類型', exact: true }).click()
  await page.getByRole('option', { name: '開啟網址', exact: true }).click()
  await editor.getByRole('button', { name: '保存工具列', exact: true }).click()
  await editor.waitFor({ state: 'hidden' })
  await idle()
  await drawer.getByRole('textbox', { name: '網址', exact: true }).fill('https://example.test/game')
  await drawer.getByRole('button', { name: '保存網址', exact: true }).click()
  await idle()
  assert.equal(
    JSON.parse(await fs.readFile(folderFile(game), 'utf8')).details.targets[
      JSON.parse(await fs.readFile(projectFile(media, project.projectId), 'utf8'))
        .actionTemplates[1].id
    ].path,
    'https://example.test/game'
  )
  // The eye hides a button from this folder's action row; the binding stays.
  const row = page.locator('.game-actions'),
    inRow = async (visible: boolean) => {
      await page.getByRole('tab', { name: '內容', exact: true }).click()
      await row
        .getByRole('button', { name: 'Website', exact: true })
        .waitFor({ state: visible ? 'visible' : 'detached' })
      await page.getByRole('tab', { name: /^設定/ }).click()
      await drawer.getByRole('tab', { name: '遊戲操作', exact: true }).click()
    }
  await inRow(true)
  await drawer.getByRole('button', { name: '隱藏按鈕 Website', exact: true }).click()
  await drawer.getByRole('button', { name: '顯示按鈕 Website', exact: true }).waitFor()
  await inRow(false)
  await drawer.getByRole('button', { name: '顯示按鈕 Website', exact: true }).click()
  await drawer.getByRole('button', { name: '隱藏按鈕 Website', exact: true }).waitFor()
  await inRow(true)
  await page.screenshot({ path: path.join(screens, 'targets.png') })
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setMinimumSize(500, 400)
    win.setBounds({ width: 620, height: 780 })
  })
  await drawer.getByRole('button', { name: '自訂工具列', exact: true }).click()
  await editor.waitFor()
  assert.ok(await editor.locator('.game-action-inspector').isVisible())
  await page.screenshot({ path: path.join(screens, 'narrow.png'), animations: 'disabled' })
  await editor.locator('.mantine-Modal-close').click()
  await editor.waitFor({ state: 'hidden' })
  await button('關閉資料夾設定').click()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1350, height: 900 })
  )
  await button('開啟專案 Image title test').first().click()
  await page.locator('.workspace-toolbar').getByText('檔案', { exact: true }).click()
  await page.locator('.file-overview-item').filter({ hasText: imageName }).click()
  const heading = page.locator('.single-file-heading')
  assert.equal(await heading.locator('h3').getAttribute('title'), imageName)
  assert.equal(
    await heading.locator('h3').evaluate((element) => getComputedStyle(element).textOverflow),
    'ellipsis'
  )
  assert.equal(
    await page
      .locator('.single-file-preview')
      .getByRole('button', { name: '開啟所在資料夾', exact: true })
      .count(),
    1
  )
  await app.evaluate(({ shell }) => {
    ;(globalThis as unknown as { openedFolder?: string }).openedFolder = undefined
    shell.openPath = async (file) => {
      ;(globalThis as unknown as { openedFolder?: string }).openedFolder = file
      return ''
    }
  })
  await heading.getByRole('button', { name: '開啟所在資料夾', exact: true }).click()
  await idle()
  assert.equal(
    await app.evaluate(() => (globalThis as unknown as { openedFolder?: string }).openedFolder),
    album
  )
  assert.deepEqual(await fs.readFile(path.join(album, imageName)), pixel)
  for (const [name, value] of Object.entries({
    'Game.exe': 'CONTROLLED FAKE EXE',
    'UnityPlayer.dll': 'CONTROLLED MARKER',
    'notes.txt': 'ORIGINAL NOTES',
  }))
    assert.equal(await fs.readFile(path.join(game, name), 'utf8'), value)
  await assert.rejects(fs.access(path.join(game, 'Game_Data', '.media-viewer')))
  assert.deepEqual(errors, [])
  console.log(
    'PASS default action, game tab intent, action arguments, native picker cancellation, keyboard and drag ordering, template cancellation/save, URL binding, filename folder icon; originals unchanged. ' +
      screens
  )
} catch (error) {
  console.error(error)
  await page.screenshot({ path: path.join(screens, 'failure.png') }).catch(() => {})
  throw error
} finally {
  await app
    .evaluate(({ BrowserWindow }) => {
      for (const win of BrowserWindow.getAllWindows()) {
        win.removeAllListeners('close')
        win.webContents.removeAllListeners('will-prevent-unload')
        win.webContents.on('will-prevent-unload', (event) => event.preventDefault())
      }
    })
    .catch(() => {})
  await closeApp(app)
}
