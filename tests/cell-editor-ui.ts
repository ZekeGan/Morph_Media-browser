import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { folderFile, readFolder, readJson, projectFile } from '../electron/files'
import type { Cell, Project } from '../shared/model'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'cell-editor-ui-')),
  media = path.join(root, 'Controlled'),
  local = path.join(root, 'local')
await fs.mkdir(media)
await fs.writeFile(path.join(media, 'original.txt'), 'PRESERVE ORIGINAL')
const lib = new Library(local, undefined, false)
await lib.init()
await lib.create(media, {
  name: 'Cell Test',
  scanAll: true,
  depth: { mode: 'through', level: 1 },
})
const project = lib.snapshot().projects[0].project!,
  style = { textColor: '#e4e6e8', backgroundColor: 'transparent' }
const cells: Cell[] = [
  {
    cellId: 'rating',
    kind: 'field-number',
    attributeId: 'score',
    presentation: 'rating',
    maximum: 5,
    grid: { x: 0, y: 0, w: 12, h: 1 },
    style,
  },
  {
    cellId: 'progress',
    kind: 'field-number',
    attributeId: 'score',
    presentation: 'progress',
    maximum: 100,
    grid: { x: 0, y: 1, w: 12, h: 1 },
    style,
  },
  {
    cellId: 'status',
    kind: 'field-enum',
    attributeId: 'status',
    presentation: 'badge',
    grid: { x: 0, y: 2, w: 12, h: 1 },
    style,
  },
  {
    cellId: 'flag',
    kind: 'field-boolean',
    attributeId: 'flag',
    presentation: 'badge',
    copyValue: true,
    grid: { x: 0, y: 3, w: 12, h: 1 },
    style,
  },
  {
    cellId: 'condition',
    kind: 'static-text',
    text: 'Visible for false',
    condition: { attributeId: 'flag', operator: 'equals', value: false },
    grid: { x: 0, y: 4, w: 12, h: 1 },
    style,
  },
]
await lib.saveProject({
  ...project,
  cells,
  fieldBindings: [
    { alias: 'Score', attributeId: 'score', type: 'number' },
    { alias: 'Status', attributeId: 'status', type: 'enum', options: ['Ready', 'Done'] },
    { alias: 'Flag', attributeId: 'flag', type: 'boolean' },
  ],
})
const record = await readFolder(media)
record.attributes = [
  { attributeId: 'score', key: 'Score', type: 'number', value: 0, source: 'manual' },
  { attributeId: 'flag', key: 'Flag', type: 'boolean', value: false, source: 'manual' },
  { attributeId: 'status', key: 'Status', type: 'enum', value: 'Ready', source: 'manual' },
]
await fs.writeFile(folderFile(media), JSON.stringify(record))
await lib.scan()
const originalRecord = await fs.readFile(folderFile(media)),
  env = Object.fromEntries(
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
async function verifyCanvasDrag() {
  const cell = page.locator('.editor-cell').first()
  await cell.scrollIntoViewIfNeeded()
  let offset = 0
  // The grid follows the pointer a frame or two later on a busy machine; retry a missed pick-up.
  for (let attempt = 0; attempt < 3; attempt++) {
    const before = (await cell.boundingBox())!
    await page.mouse.move(before.x + 40, before.y + 14)
    await page.mouse.down()
    await page.mouse.move(before.x + 40, before.y + 60, { steps: 8 })
    for (let wait = 0; wait < 20; wait++) {
      offset = (await cell.boundingBox())!.y - before.y
      if (Math.abs(offset - 46) < 3) break
      await page.waitForTimeout(50)
    }
    await page.mouse.up()
    if (Math.abs(offset - 46) < 3) {
      await button('復原').click()
      return
    }
  }
  assert.ok(false, `canvas drag offset ${offset}`)
}
try {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setMinimumSize(0, 0)
    win.setBounds({ width: 1500, height: 900 })
  })
  await button('開啟專案 Cell Test').first().click()
  const card = page.locator('.folder-card').first()
  await card.getByText('Visible for false', { exact: true }).waitFor()
  assert.equal(await card.locator('.cell-rating').textContent(), '0 / 5')
  assert.equal(await card.locator('.cell-progress').textContent(), '0 / 100')
  assert.equal(await card.locator('.mantine-Badge-root').filter({ hasText: 'Ready' }).count(), 1)
  const copy = card.getByRole('button', { name: '複製 Flag', exact: true })
  await copy.click()
  await copy.getByText('已複製', { exact: true }).waitFor()
  assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'false')
  await button('編輯版面').click()
  await page.locator('.editor-toolbar').waitFor()
  const palette = page.locator('.basic-palette .palette-item').first()
  // The drag picture is our own copy that keeps the item's middle under the cursor; the native one is blank.
  const dragPicture = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element) => {
        const transfer = new DataTransfer()
        let blank = false
        transfer.setDragImage = (target) => {
          blank = target instanceof HTMLCanvasElement && target.width === 1 && target.height === 1
        }
        const rect = element.getBoundingClientRect()
        element.dispatchEvent(
          new DragEvent('dragstart', {
            bubbles: true,
            dataTransfer: transfer,
            clientX: rect.left + 5,
            clientY: rect.top + 5,
          })
        )
        document.dispatchEvent(
          new DragEvent('dragover', { bubbles: true, clientX: 640, clientY: 480 })
        )
        const ghost = document.querySelector('.palette-drag-ghost')?.getBoundingClientRect()
        const result = {
          blank,
          dx: ghost ? ghost.left + ghost.width / 2 - 640 : NaN,
          dy: ghost ? ghost.top + ghost.height / 2 - 480 : NaN,
        }
        element.dispatchEvent(new DragEvent('dragend', { bubbles: true }))
        return { ...result, removed: !document.querySelector('.palette-drag-ghost') }
      })
  for (const selector of ['.basic-palette .palette-item', '.palette-field']) {
    const grab = await dragPicture(selector)
    assert.ok(
      grab.blank && Math.abs(grab.dx) < 1 && Math.abs(grab.dy) < 1 && grab.removed,
      selector + ' ' + JSON.stringify(grab)
    )
  }
  await page.locator('.editor-cell').last().click()
  await page.getByRole('textbox', { name: '比較值', exact: true }).click()
  await page.getByRole('option', { name: '是', exact: true }).click()
  await page.locator('.cell-condition-hidden').waitFor()
  await button('復原').click()
  assert.equal(await page.locator('.cell-condition-hidden').count(), 0)
  const initial = await page.locator('.editor-cell').count()
  // A synthetic HTML5 drop can miss on a busy machine; retry until the cell lands.
  for (
    let attempt = 0;
    attempt < 3 && (await page.locator('.editor-cell').count()) === initial;
    attempt++
  ) {
    await palette.dragTo(page.locator('.react-grid-layout'), {
      sourcePosition: { x: 40, y: 12 },
      targetPosition: { x: 90, y: 275 },
    })
    await page.waitForTimeout(150)
  }
  assert.equal(await page.locator('.editor-cell').count(), initial + 1)
  await button('復原').click()
  await verifyCanvasDrag()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.25)
  )
  await verifyCanvasDrag()
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.webContents.setZoomFactor(1)
    win.setBounds({ width: 620, height: 800 })
  })
  await verifyCanvasDrag()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1500, height: 900 })
  )
  await page.locator('.editor-cell').first().click()
  await page.getByRole('textbox', { name: '顯示方式', exact: true }).click()
  await page.getByRole('option', { name: '進度', exact: true }).click()
  await page.getByRole('textbox', { name: '滿分／總量', exact: true }).fill('10')
  await page.getByLabel('顯示複製按鈕', { exact: true }).check()
  await button('儲存變更').click()
  await page.locator('.editor-page').waitFor({ state: 'hidden' })
  const saved = (await readJson(projectFile(media, project.projectId))) as Project
  assert.equal(saved.cells[0].presentation, 'progress')
  assert.equal(saved.cells[0].maximum, 10)
  assert.equal(saved.cells[0].copyValue, true)
  await button('編輯版面').click()
  await page.locator('.editor-cell').first().click()
  assert.equal(
    await page.getByRole('textbox', { name: '顯示方式', exact: true }).inputValue(),
    '進度'
  )
  await page.screenshot({ path: path.join(root, 'editor.png') })
  await page.getByRole('button', { name: /^(放棄變更|關閉)$/ }).click()
  assert.deepEqual(await fs.readFile(folderFile(media)), originalRecord)
  assert.equal(await fs.readFile(path.join(media, 'original.txt'), 'utf8'), 'PRESERVE ORIGINAL')
  assert.deepEqual(errors, [])
  console.log(
    'PASS: CELL rating/progress/badge/copy false, editor save/reopen, native grab point, palette drop, canvas drag with scroll/zoom/narrow viewport; original data preserved. Artifacts: ' +
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
