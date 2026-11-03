import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { folderFile, readFolder } from '../electron/files'
import { DATA_DIR, type Cell } from '../shared/model'
import { tinyPng } from './support/archive-fixture'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'game-cover-cell-ui-')),
  media = path.join(root, 'Games'),
  local = path.join(root, 'local')
await fs.mkdir(media)
const lib = new Library(local, undefined, false)
await lib.init()
await lib.create(media, {
  name: 'Cover Test',
  scanAll: true,
  depth: { mode: 'through', level: 1 },
})
const style = { textColor: '#e4e6e8', backgroundColor: 'transparent' }
const layout = (w: number, h: number): Cell[] => [
  { cellId: 'cover', kind: 'game-cover', grid: { x: 0, y: 0, w, h }, style },
  { cellId: 'name', kind: 'name', grid: { x: 0, y: h, w: 12, h: 1 }, style },
]
const record = await readFolder(media),
  assetId = 'cover-asset-1'
await fs.mkdir(path.join(media, DATA_DIR, 'assets'), { recursive: true })
await fs.writeFile(path.join(media, DATA_DIR, 'assets', assetId + '.png'), tinyPng)
record.assets.push({
  assetId,
  relativePath: 'assets/' + assetId + '.png',
  originalName: 'cover.png',
  mediaType: 'image/png',
})
record.details = { schemaVersion: 1, bannerAssetId: assetId }
await fs.writeFile(folderFile(media), JSON.stringify(record))
const env = Object.fromEntries(
  Object.entries({ ...process.env, MEDIA_VIEWER_TEST_DATA: local }).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  )
)
delete env.ELECTRON_RUN_AS_NODE
let page: import('playwright-core').Page
const button = (name: string) => page.getByRole('button', { name, exact: true })
// The element box of the image (or placeholder) must fill the cell content box at any grid size.
const fits = async (selector: string, host: string, label: string) => {
  const result = await page.evaluate(
    ({ selector, host }) => {
      const cell = document.querySelector<HTMLElement>(
          host + ' .cell-image, ' + host + ' .cell-image-placeholder'
        )!,
        parent = cell.parentElement!,
        box = cell.getBoundingClientRect(),
        outer = parent.getBoundingClientRect(),
        css = getComputedStyle(parent),
        padX =
          parseFloat(css.paddingLeft) +
          parseFloat(css.paddingRight) +
          parseFloat(css.borderLeftWidth) +
          parseFloat(css.borderRightWidth),
        padY =
          parseFloat(css.paddingTop) +
          parseFloat(css.paddingBottom) +
          parseFloat(css.borderTopWidth) +
          parseFloat(css.borderBottomWidth)
      return {
        width: box.width,
        height: box.height,
        innerWidth: outer.width - padX,
        innerHeight: outer.height - padY,
        selector,
      }
    },
    { selector, host }
  )
  assert.ok(
    Math.abs(result.width - result.innerWidth) < 2,
    label + ' width ' + JSON.stringify(result)
  )
  assert.ok(
    Math.abs(result.height - result.innerHeight) < 2,
    label + ' height ' + JSON.stringify(result)
  )
}

const errors: string[] = []
for (const [w, h] of [
  [12, 3],
  [4, 2],
  [8, 6],
]) {
  const current = lib.snapshot().projects[0].project!
  await lib.saveProject({
    ...current,
    cells: layout(w, h),
    layoutPresets: [{ id: 'default', name: 'Default', cells: layout(w, h) }],
    activeLayoutId: 'default',
  })
  const app = await electron.launch({ args: ['.'], env, timeout: 30000 })
  page = await app.firstWindow()
  page.on('pageerror', (error) => errors.push(error.message))
  page.setDefaultTimeout(15000)
  await page.evaluate('window.__name=(target)=>target')
  try {
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.setMinimumSize(0, 0)
      win.setBounds({ width: 1500, height: 900 })
    })
    await button('開啟專案 Cover Test').first().click()
    await page.locator('.folder-card .cell-image').first().waitFor()
    await fits('card', '.folder-card', 'card ' + w + 'x' + h)
    // The default shows the whole cover over a blurred copy of itself, never a crop.
    assert.equal(
      await page
        .locator('.folder-card .cell-blur-fg')
        .first()
        .evaluate((node) => getComputedStyle(node).objectFit),
      'contain'
    )
    assert.equal(await page.locator('.folder-card .cell-blur-bg').count(), 1)
    await button('更改樣式').click()
    await page
      .locator('.editor-cell .cell-image, .editor-cell .cell-image-placeholder')
      .first()
      .waitFor()
    await fits('editor', '.editor-cell', 'editor ' + w + 'x' + h)
    assert.equal(
      await page
        .locator('.editor-cell .cell-blur-fg')
        .first()
        .evaluate((node) => getComputedStyle(node).objectFit),
      'contain'
    )
    await page.screenshot({ path: path.join(root, 'editor-' + w + 'x' + h + '.png') })
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
}
assert.equal(
  (await fs.readFile(path.join(media, DATA_DIR, 'assets', assetId + '.png'))).length,
  tinyPng.length
)
assert.deepEqual(errors, [])
console.log(
  'PASS game cover cell fills its container in cards and editor at several sizes. ' + root
)
