import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// A "video" that is really a ZIP: the player names the cause and offers ways forward instead of a generic message.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'video-failure-ui-')),
  media = path.join(root, 'Videos'),
  local = path.join(root, 'local')
await fs.mkdir(media, { recursive: true })
await fs.writeFile(
  path.join(media, 'zipped.mp4'),
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(4096, 7)])
)
const library = new Library(local, undefined, false)
await library.init()
await library.create(media, {
  name: 'Broken',
  scanAll: true,
  depth: { mode: 'through', level: 1 },
})
const errors: string[] = []
const { app, page } = await launchApp(local, errors)
let passed = false
try {
  await page.getByRole('button', { name: '開啟專案 Broken', exact: true }).first().click()
  await page.locator('.media-thumbnail').filter({ hasText: 'zipped.mp4' }).click()
  const alert = page.locator('.video-error')
  await alert.waitFor()
  await page.getByText('其實是 ZIP 壓縮檔').waitFor()
  assert.equal(await alert.getByRole('button', { name: '用系統預設播放器開啟' }).count(), 1)
  assert.equal(await alert.getByRole('button', { name: '在檔案總管顯示' }).count(), 1)
  passed = true
  console.log(
    'PASS undecodable video explains a disguised archive and offers external open and reveal. ' +
      root
  )
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
