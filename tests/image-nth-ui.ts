import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import type { Cell } from '../shared/model'
import { deflateSync } from 'node:zlib'
import { crc32 } from '../electron/archive'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// A small solid RGB picture that the browser's image decoder accepts.
function png(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data]),
      head = Buffer.alloc(4),
      tail = Buffer.alloc(4)
    head.writeUInt32BE(data.length)
    tail.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([head, body, tail])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header.set([8, 2, 0, 0, 0], 8)
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 120)])
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
// An image cell without a hand-picked picture shows the folder's n-th image file, and stays empty when there is none.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'image-nth-ui-')),
  media = path.join(root, 'Library'),
  local = path.join(root, 'local')
await fs.mkdir(path.join(media, 'Pictures'), { recursive: true })
await fs.mkdir(path.join(media, 'Empty'), { recursive: true })
await fs.writeFile(path.join(media, 'Empty', 'notes.txt'), 'no images')
for (const name of ['2.png', '1.png'])
  await fs.writeFile(path.join(media, 'Pictures', name), png(16, 16))
const lib = new Library(local, undefined, false)
await lib.init()
await lib.create(media, {
  name: 'Nth',
  mediaCategory: 'manga',
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})
const project = lib.snapshot().projects[0].project!,
  style = { textColor: '#e4e6e8', backgroundColor: 'transparent' },
  cells: Cell[] = [
    { cellId: 'name', kind: 'name', grid: { x: 0, y: 0, w: 12, h: 1 }, style },
    {
      cellId: 'second',
      kind: 'image',
      attributeId: 'pic',
      imageIndex: 2,
      grid: { x: 0, y: 1, w: 6, h: 3 },
      style,
    },
    {
      cellId: 'third',
      kind: 'image',
      attributeId: 'pic3',
      imageIndex: 3,
      grid: { x: 6, y: 1, w: 6, h: 3 },
      style,
    },
  ]
await lib.saveProject({
  ...project,
  cells,
  layoutPresets: [{ id: 'default', name: 'Default', cells }],
  activeLayoutId: 'default',
  cardView: { mode: 'single', level: 2 },
})
await lib.scan()

const errors: string[] = []
const { app, page } = await launchApp(local, errors)
let passed = false
try {
  await page.getByRole('button', { name: '開啟專案 Nth', exact: true }).first().click()
  const card = (name: string) =>
    page
      .locator('.folder-card')
      .filter({ has: page.locator('.cell-name').getByText(name, { exact: true }) })
  await card('Pictures').waitFor()
  // Second image exists and decodes; there is no third one.
  await page.waitForFunction(() => {
    const img = document.querySelector('.folder-card img.cell-image') as HTMLImageElement | null
    return !!img && img.complete && img.naturalWidth > 0
  })
  assert.equal(await card('Pictures').locator('img.cell-image').count(), 1)
  assert.equal(await card('Pictures').getByText('沒有圖片').count(), 1)
  // A folder without any image file shows nothing broken in both cells.
  await card('Empty').waitFor()
  await card('Empty').getByText('沒有圖片').first().waitFor()
  assert.equal(await card('Empty').getByText('沒有圖片').count(), 2)
  assert.deepEqual(errors, [])
  passed = true
  console.log('PASS image cell by position: n-th image, missing image placeholder. ' + root)
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
