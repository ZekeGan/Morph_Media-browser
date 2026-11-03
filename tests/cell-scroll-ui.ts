import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { ensureFolder, folderFile, readFolder } from '../electron/files'
import type { Cell } from '../shared/model'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// Tag and text cells can keep their height and scroll; without the option the extra content stays cut off.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'cell-scroll-ui-')),
  media = path.join(root, 'Library'),
  local = path.join(root, 'local')
await fs.mkdir(path.join(media, 'Many'), { recursive: true })
const lib = new Library(local, undefined, false)
await lib.init()
await lib.create(media, {
  name: 'Scroll',
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})
const project = lib.snapshot().projects[0].project!,
  style = { textColor: '#e4e6e8', backgroundColor: 'transparent' },
  cells: Cell[] = [
    { cellId: 'name', kind: 'name', grid: { x: 0, y: 0, w: 12, h: 1 }, style },
    {
      cellId: 'scrolling',
      kind: 'field-tags',
      attributeId: 'tags',
      scroll: true,
      grid: { x: 0, y: 1, w: 12, h: 2 },
      style,
    },
    {
      cellId: 'cut',
      kind: 'field-tags',
      attributeId: 'tags',
      grid: { x: 0, y: 3, w: 12, h: 2 },
      style,
    },
  ]
await lib.saveProject({
  ...project,
  fieldBindings: [{ alias: '標籤', attributeId: 'tags', type: 'tags' }],
  cells,
  layoutPresets: [{ id: 'default', name: 'Default', cells }],
  activeLayoutId: 'default',
  cardView: { mode: 'single', level: 2 },
})
await ensureFolder(path.join(media, 'Many'), false)
const record = await readFolder(path.join(media, 'Many'))
record.attributes.push({
  attributeId: 'tags',
  key: 'TAGS',
  type: 'tags',
  value: Array.from({ length: 40 }, (_, i) => 'female:tag number ' + i),
  source: 'manual',
})
await fs.writeFile(folderFile(path.join(media, 'Many')), JSON.stringify(record))
await lib.scan()

const errors: string[] = []
const { app, page } = await launchApp(local, errors)
let passed = false
try {
  await page.getByRole('button', { name: '開啟專案 Scroll', exact: true }).first().click()
  const body = page.locator('.folder-card .cell-scroll-body')
  await body.waitFor()
  assert.equal(
    await page.locator('.folder-card .cell-scroll-body').count(),
    1,
    'only the scrolling cell'
  )
  assert.equal(await body.locator('.mantine-Badge-root').count(), 40, 'every tag is there')
  // The cell that does not scroll hides what does not fit behind a "+N" badge and lists everything in its tooltip.
  const cut = page.locator('.folder-card .tag-list-fit')
  await cut.waitFor()
  const more = cut.locator('[data-more]')
  await page.waitForFunction(
    () =>
      document
        .querySelector('.folder-card .tag-list-fit [data-more]')
        ?.getAttribute('style')
        ?.includes('display: none') === false
  )
  const hidden = await cut
    .locator('[data-tag]')
    .evaluateAll(
      (nodes) => nodes.filter((node) => (node as HTMLElement).style.display === 'none').length
    )
  assert.ok(hidden > 0 && (await more.innerText()) === '+' + hidden, String(hidden))
  assert.ok(((await cut.getAttribute('title')) ?? '').includes('tag number 39'))
  assert.equal(await body.locator('[data-more]').count(), 0, 'a scrolling cell hides nothing')
  const metrics = () =>
    body.evaluate((node) => ({
      client: node.clientHeight,
      scroll: node.scrollHeight,
      top: node.scrollTop,
      parent: node.parentElement!.clientHeight,
    }))
  const before = await metrics()
  assert.ok(before.scroll > before.client && before.client <= before.parent, JSON.stringify(before))
  await body.hover()
  await page.mouse.wheel(0, 120)
  await page.waitForFunction(
    () => document.querySelector('.folder-card .cell-scroll-body')!.scrollTop > 0
  )
  // Reachable and scrollable from the keyboard.
  await body.focus()
  await page.keyboard.press('PageDown')
  assert.ok((await metrics()).top > 0)
  // The editor's field list shows the previewed folder's real value on one line, the whole value on hover.
  await page.getByRole('button', { name: '編輯版面', exact: true }).click()
  const value = page.locator('.palette-field[data-attribute-id="tags"] .palette-field-value')
  await value.waitFor()
  assert.equal(await value.innerText(), '（此筆沒有值）', 'a folder without the field')
  await page.getByRole('textbox', { name: '使用真實資料預覽', exact: true }).click()
  await page.getByRole('option', { name: /^Many/ }).click()
  assert.ok((await value.innerText()).startsWith('female:tag number 0, '))
  assert.ok(((await value.getAttribute('title')) ?? '').includes('tag number 39'))
  assert.equal(
    await value.evaluate((node) => node.scrollWidth > node.clientWidth && node.clientHeight < 24),
    true,
    'one line, cut with an ellipsis'
  )
  await page.screenshot({ path: path.join(root, 'palette-values.png') })
  assert.deepEqual(errors, [])
  passed = true
  console.log(
    'PASS scrolling tag cell: full list, fixed height, wheel and keyboard scroll. ' + root
  )
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
