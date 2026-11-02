import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { DATA_DIR } from '../shared/model'
import { readFolder, saveFolder } from '../electron/files'
import { closeApp, launchApp, reportFailure, removeTestRoot } from './support/app'

// Saved images in folder settings can be deleted after a confirmation; the user's own media stays.
const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(64, 1)])
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'image-delete-ui-')),
  media = path.join(root, 'Pics'),
  local = path.join(root, 'local')
await fs.mkdir(media, { recursive: true })
await fs.writeFile(path.join(media, 'original.txt'), 'PRESERVE ORIGINAL')
const lib = new Library(local, undefined, false)
await lib.init()
await lib.create(media, {
  name: 'Pics',
  mediaCategory: 'other',
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})
const row = lib.snapshot().rows.find((r) => r.path === media) ?? lib.snapshot().rows[0],
  record = await readFolder(row.path),
  ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']
await fs.mkdir(path.join(row.path, DATA_DIR, 'assets'), { recursive: true })
for (const [i, assetId] of ids.entries()) {
  await fs.writeFile(path.join(row.path, DATA_DIR, 'assets', assetId + '.png'), png)
  record.assets.push({
    assetId,
    relativePath: `assets/${assetId}.png`,
    originalName: `pic${i + 1}.png`,
    mediaType: 'image/png',
  })
}
await saveFolder(row.path, record, record.revision)
const errors: string[] = []
const { app, page } = await launchApp(local, errors)
let passed = false
try {
  await page.getByRole('button', { name: '開啟專案 Pics', exact: true }).first().click()
  await page.locator('.folder-panel-header').waitFor()
  await page.getByRole('button', { name: '資料夾設定', exact: true }).click()
  await page.locator('.folder-panel-dock-settings').waitFor()
  await page.getByRole('tab', { name: '圖片', exact: true }).click()
  await page.locator('details > summary').filter({ hasText: '已保存的圖片' }).click()
  assert.equal(await page.locator('.images figure').count(), 2)
  const del = page.getByRole('button', { name: '刪除圖片 pic1.png', exact: true })
  // Declining the confirmation changes nothing.
  await page.evaluate(() => {
    ;(window as unknown as { __msg: string }).__msg = ''
    window.confirm = (msg) => {
      ;(window as unknown as { __msg: string }).__msg = String(msg)
      return false
    }
  })
  await del.focus()
  await page.keyboard.press('Enter')
  assert.match(
    await page.evaluate(() => (window as unknown as { __msg: string }).__msg),
    /pic1\.png/
  )
  assert.equal(await page.locator('.images figure').count(), 2)
  assert.equal((await readFolder(row.path)).assets.length, 2)
  // Accepting removes the record entry and the managed file; the other image stays.
  await page.evaluate(() => {
    window.confirm = () => true
  })
  await del.click()
  await page.waitForFunction(() => document.querySelectorAll('.images figure').length === 1)
  const after = await readFolder(row.path)
  assert.deepEqual(
    after.assets.map((a) => a.assetId),
    [ids[1]]
  )
  await assert.rejects(fs.access(path.join(row.path, DATA_DIR, 'assets', ids[0] + '.png')))
  await fs.access(path.join(row.path, DATA_DIR, 'assets', ids[1] + '.png'))
  assert.equal(await fs.readFile(path.join(media, 'original.txt'), 'utf8'), 'PRESERVE ORIGINAL')
  await page.screenshot({ path: path.join(root, 'after-delete.png') })
  assert.deepEqual(errors, [])
  passed = true
  console.log('PASS image delete: confirm, cancel keeps, delete removes record and file. ' + root)
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
