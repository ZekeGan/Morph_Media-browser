import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { WorkspaceStore } from '../electron/workspace'
import { folderFile, projectFile } from '../electron/files'
import { tinyPng, zipFixture } from './support/archive-fixture'
import { closeApp } from './support/app'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'folder-navigation-')),
  media = path.join(root, 'Media'),
  multi = path.join(root, 'Multi'),
  local = path.join(root, 'local')
await fs.mkdir(path.join(media, 'A', 'B'), { recursive: true })
await fs.mkdir(path.join(media, 'C'))
await fs.mkdir(path.join(multi, 'A', 'B'), { recursive: true })
// R-340: two works (B inside the category A, and C) so "all works" shows several cards.
await fs.mkdir(path.join(multi, 'C'))
await fs.writeFile(path.join(media, 'book.cbz'), zipFixture([{ name: '001.png', bytes: tinyPng }]))
const library = new Library(local, undefined, false)
await library.init()
await library.create(media, {
  name: 'Navigation',
  scanAll: true,
  depth: { mode: 'through', level: 3 },
})
await library.create(multi, {
  name: 'Multi navigation',
  scanAll: true,
  depth: { mode: 'through', level: 3 },
})
const snapshot = library.snapshot(),
  projects = snapshot.projects.map((link) => link.project!),
  multiProject = projects.find((project) => project.name === 'Multi navigation')!
await fs.writeFile(
  projectFile(multi, multiProject.projectId),
  JSON.stringify({ ...multiProject, cardView: { mode: 'multi', level: 'all' } })
)
const originals = new Map<string, Buffer>()
for (const row of snapshot.structure ?? snapshot.rows)
  if (row.record) originals.set(folderFile(row.path), await fs.readFile(folderFile(row.path)))
for (const project of projects) {
  const file = projectFile(
    project.projectId === multiProject.projectId ? multi : media,
    project.projectId
  )
  originals.set(file, await fs.readFile(file))
}
originals.set(path.join(media, 'book.cbz'), await fs.readFile(path.join(media, 'book.cbz')))
const store = new WorkspaceStore(local, ['zh-TW'])
await store.init()
await store.update(
  { action: 'appearance', theme: 'glass', locale: 'zh-TW' },
  projects.map((project) => project.projectId)
)
const env = Object.fromEntries(
  Object.entries({ ...process.env, MEDIA_VIEWER_TEST_DATA: local }).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  )
)
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, timeout: 30000 }),
  page = await app.firstWindow()
page.setDefaultTimeout(12000)
await page.evaluate('window.__name=(target)=>target')
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
const button = (name: string) => page.getByRole('button', { name, exact: true })
const center = () => page.locator('.workspace-breadcrumb'),
  right = () => page.locator('.folder-panel-header')
const current = async (name: string) => {
  await page
    .waitForFunction(
      (name) => document.querySelector('.breadcrumb-current')?.textContent?.trim() === name,
      name
    )
    .catch(async (error) => {
      console.error(
        await page.evaluate(() =>
          Array.from(
            document.querySelectorAll(
              '.reader,.media-viewer-shell,.document-viewer,.folder-panel-dock-settings,.mantine-Modal-content,.mantine-Menu-dropdown,.mantine-Select-dropdown,[role="dialog"]'
            )
          ).map((node) => ({
            tag: node.tagName,
            classes: node.className,
            display: getComputedStyle(node).display,
            visibility: getComputedStyle(node).visibility,
          }))
        )
      )
      throw error
    })
  await page.waitForFunction(() => !document.querySelector('.media-loading'))
  assert.equal((await right().locator('strong').innerText()).trim(), name)
}
const buttons = async (back: boolean, forward: boolean) => {
  await page.waitForFunction(
    ({ back, forward }) =>
      ['.workspace-breadcrumb', '.folder-panel-header'].every((selector) => {
        const buttons = Array.from(
          document.querySelectorAll<HTMLButtonElement>(selector + ' button')
        )
        return (
          buttons.find((button) => button.getAttribute('aria-label') === '返回')?.disabled ===
            !back &&
          buttons.find((button) => button.getAttribute('aria-label') === '前進')?.disabled ===
            !forward
        )
      }),
    { back, forward }
  )
  assert.equal(
    await center().getByRole('button', { name: '返回', exact: true }).isDisabled(),
    !back
  )
  assert.equal(
    await center().getByRole('button', { name: '前進', exact: true }).isDisabled(),
    !forward
  )
  // The panel's own copies are hidden unless it covers the center, so read them from the DOM.
  assert.equal(
    await page.locator('.folder-panel-header button[aria-label="返回"]').isDisabled(),
    !back
  )
  assert.equal(
    await page.locator('.folder-panel-header button[aria-label="前進"]').isDisabled(),
    !forward
  )
}
// The panel repeats back/forward only while it is expanded over the center.
const viaPanel = async (name: '返回' | '前進') => {
  await button('放大內容區').click()
  await right().getByRole('button', { name, exact: true }).click()
  await button('還原內容區').click()
}
const go = async (name: string) => {
  await page
    .locator('.folder-panel-body .media-subfolder')
    .getByRole('button', { name, exact: true })
    .click()
  await current(name)
}
const side = async (
  delta: -1 | 1,
  area = '.folder-panel-body',
  duplicate = true,
  route: 'native' | 'dom' | 'dom-first' = 'native'
) => {
  const bounds = await page.locator(area).first().boundingBox()
  assert.ok(bounds)
  const point = {
    x: bounds.x + Math.min(40, bounds.width / 2),
    y: bounds.y + Math.min(45, bounds.height / 2),
  }
  const dom = () =>
    page.evaluate(
      ({ point, delta }) => {
        const target = document.elementFromPoint(point.x, point.y)!
        return ['mousedown', 'mouseup', 'auxclick'].map(
          (type) =>
            !target.dispatchEvent(
              new MouseEvent(type, {
                bubbles: true,
                cancelable: true,
                button: delta === -1 ? 3 : 4,
                clientX: point.x,
                clientY: point.y,
              })
            )
        )
      },
      { point, delta }
    )
  if (route !== 'native') {
    assert.deepEqual(await dom(), [true, true, true])
    if (route === 'dom') {
      await page.evaluate(() => window.desktop.workspace())
      return
    }
  }
  const prevented = await app.evaluate(
    ({ BrowserWindow, screen }, { delta, point }) => {
      const win = BrowserWindow.getAllWindows()[0],
        bounds = win.getContentBounds(),
        zoom = win.webContents.getZoomFactor(),
        read = screen.getCursorScreenPoint
      let prevented = false
      screen.getCursorScreenPoint = () => ({
        x: Math.round(bounds.x + point.x * zoom),
        y: Math.round(bounds.y + point.y * zoom),
      })
      try {
        win.emit(
          'app-command',
          {
            preventDefault() {
              prevented = true
            },
          },
          delta === -1 ? 'browser-backward' : 'browser-forward'
        )
      } finally {
        screen.getCursorScreenPoint = read
      }
      return prevented
    },
    { delta, point }
  )
  assert.equal(prevented, true)
  if (duplicate && route === 'native') assert.deepEqual(await dom(), [true, true, true])
  await page.evaluate(() => window.desktop.workspace())
}
try {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setMinimumSize(0, 0)
    win.setBounds({ width: 1500, height: 950 })
    win.focus()
  })
  await fs.mkdir(path.join(media, 'Untracked'))
  await button('開啟專案 Navigation').first().click()
  await page.locator('.mixed-media-browser').waitFor()
  await current('Media')
  await buttons(false, false)
  // The header icon opens the folder in Windows Explorer; it never navigates inside the app.
  assert.equal(
    await right()
      .getByRole('button', { name: '在檔案總管開啟資料夾 Media', exact: true })
      .isEnabled(),
    true
  )
  assert.equal(
    await right()
      .getByRole('button', { name: /^前往資料夾/ })
      .count(),
    0
  )
  await buttons(false, false)
  assert.equal(
    await page
      .locator('.media-subfolder')
      .getByRole('button', { name: 'Untracked', exact: true })
      .isDisabled(),
    true
  )
  await go('A')
  await go('B')
  await buttons(true, false)
  await current('B')
  await buttons(true, false)
  await side(-1, '.folder-panel-body', true, 'dom')
  await current('A')
  await buttons(true, true)
  await side(1, '.folder-panel-body', true, 'dom')
  await current('B')
  await buttons(true, false)
  // Let unmatched DOM-only commands expire before testing another route.
  await page.waitForTimeout(550)
  await side(-1, '.folder-panel-body', true, 'dom-first')
  await current('A')
  await buttons(true, true)
  await side(1, '.folder-panel-body', true, 'dom-first')
  await current('B')
  await buttons(true, false)
  await viaPanel('返回')
  await current('A')
  await center().getByRole('button', { name: '返回', exact: true }).click()
  await current('Media')
  await buttons(false, true)
  await viaPanel('前進')
  await current('A')
  await center().getByRole('button', { name: '前進', exact: true }).click()
  await current('B')
  await page.locator('.center-mode').getByText('表格', { exact: true }).click()
  await current('B')
  await side(-1, '.table-scroll')
  await current('A')
  await buttons(true, true)
  await page.locator('.center-mode').getByText('樹狀圖', { exact: true }).click()
  await page.locator('.react-flow').waitFor()
  await current('A')
  assert.ok((await page.locator('.react-flow__node').count()) > 1)
  await side(1)
  await current('B')
  await buttons(true, false)
  // Outside the folder workspace, native commands do not navigate it.
  await side(-1, '.sidebar-section', false)
  await current('B')
  await button('更多檔案選項').click()
  await page.getByRole('menu').waitFor()
  await side(-1, '.react-flow')
  await current('B')
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: '設定', exact: true }).click()
  await page.locator('.folder-panel-dock-settings').waitFor()
  // Settings are a panel tab, so history navigation still works and the settings follow the folder.
  await side(-1, '.react-flow')
  await page.waitForFunction(
    () => document.querySelector('.breadcrumb-current')?.textContent?.trim() !== 'B'
  )
  const moved = (await page.locator('.breadcrumb-current').innerText()).trim()
  await page.getByRole('region', { name: '資料夾設定 · ' + moved, exact: true }).waitFor()
  await side(1, '.react-flow')
  await current('B')
  await page.getByRole('region', { name: '資料夾設定 · B', exact: true }).waitFor()
  await button('關閉資料夾設定').click()
  await page.locator('.folder-panel-dock-settings').waitFor({ state: 'detached' })
  await page.locator('.breadcrumb-link').first().click()
  await current('Media')
  await page.locator('.media-thumbnail').filter({ hasText: 'book.cbz' }).click()
  await page.locator('.media-viewer-shell .is-active').waitFor()
  await side(-1, '.react-flow')
  await current('Media')
  await button('關閉媒體檢視器').click()
  await page.locator('.media-viewer-shell').waitFor({ state: 'detached' })
  const missing = folderFile(path.join(media, 'A', 'B')),
    backup = missing + '.navigation-test'
  await fs.rename(missing, backup)
  try {
    await side(-1, '.react-flow')
    await page
      .getByText(/此資料夾尚未建立資料/)
      .first()
      .waitFor()
    await current('Media')
    await buttons(true, false)
    await assert.rejects(fs.access(missing))
  } finally {
    await fs.rename(backup, missing)
  }
  await side(-1)
  await current('B')
  await viaPanel('返回')
  await current('A')
  await buttons(true, true)
  await page.locator('.breadcrumb-link').first().click()
  await current('Media')
  await go('C')
  await buttons(true, false)
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25)
  )
  await side(-1)
  await current('Media')
  await page.screenshot({ path: path.join(root, 'history.png') })
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1)
  )
  await button('開啟專案 Multi navigation').first().click()
  await page.locator('.media-subfolders, .content-subfolders').waitFor()
  await current('Multi')
  await buttons(false, false)
  const cards = await page.locator('.folder-card').count()
  assert.ok(cards > 1)
  await go('A')
  assert.equal(await page.locator('.folder-card').count(), cards)
  await side(-1)
  await current('Multi')
  await buttons(false, true)
  for (const [file, bytes] of originals) assert.deepEqual(await fs.readFile(file), bytes)
  await assert.rejects(fs.access(folderFile(path.join(media, 'Untracked'))))
  assert.deepEqual(errors, [])
  console.log(
    'PASS shared center/right history, folder icons, native/DOM single dispatch, mode/zoom/project isolation, overlays, missing-record refusal and original-byte preservation. ' +
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
  await closeApp(app)
}
