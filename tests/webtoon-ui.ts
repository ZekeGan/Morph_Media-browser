import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Library } from '../electron/library'
import { readFolder } from '../electron/files'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// R-256: webtoon mode. Tall pages suggest it once; it shows one gapless column whose width the toolbar slider and
// +/- change, keys scroll a window height, and the mode, width and answered suggestion stay with the book.
const base = path.resolve('.test-output')
await fs.mkdir(path.join(base, 'shot'), { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'webtoon-ui-')),
  comic = path.join(root, 'Strip'),
  local = path.join(root, 'local')
await fs.mkdir(comic)
const exec = promisify(execFile)
for (let i = 1; i <= 12; i++)
  await exec(
    'ffmpeg',
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `color=c=${i % 2 ? '#526c85' : '#ac997f'}:s=100x400`,
      '-frames:v',
      '1',
      path.join(comic, String(i).padStart(3, '0') + '.png'),
    ],
    { windowsHide: true }
  )
const library = new Library(local, undefined, false)
await library.init()
await library.create(comic, {
  name: 'Webtoon test',
  depth: { mode: 'through', level: 1 },
  scanAll: true,
})
const errors: string[] = []
const { app, page } = await launchApp(local, errors, { width: 1100, height: 800 })
const reader = () => page.getByRole('dialog', { name: '漫畫閱讀器', exact: true })
const shownPage = () =>
  page.evaluate(() => document.querySelector('.reader-info strong')?.textContent ?? '')
let passed = false
try {
  await page.getByRole('button', { name: '開啟專案 Webtoon test', exact: true }).first().click()
  await page.locator('.manga-gallery .media-thumbnail').first().click()
  await reader().waitFor()
  await page.getByText('這本看起來是條漫', { exact: true }).waitFor()
  await page.getByRole('button', { name: '切換到條漫', exact: true }).click()
  await page.locator('.reader-webtoon').waitFor()
  assert.equal(await page.locator('.reader-webtoon-page').count(), 12)
  assert.equal(await reader().getByRole('button', { name: '下一頁', exact: true }).count(), 0)
  assert.equal(
    await reader().getByRole('button', { name: '條漫', exact: true }).getAttribute('aria-pressed'),
    'true'
  )
  // R-375: the pages ahead load before they are scrolled to (each page here is several windows tall, so the
  // browser's own lazy loading would wait).
  await page.waitForFunction(
    () =>
      [...document.querySelectorAll<HTMLImageElement>('.reader-webtoon-page')]
        .slice(0, 7)
        .every((image) => image.complete && image.naturalWidth > 0) &&
      document.querySelector('.reader-webtoon')!.scrollTop === 0
  )
  // Pages touch: no gap between one page and the next.
  await page.waitForFunction(
    () => document.querySelectorAll('.reader-webtoon-page:not(.pending)').length >= 2
  )
  const gap = await page.evaluate(() => {
    const [a, b] = [...document.querySelectorAll('.reader-webtoon-page')].map((node) =>
      node.getBoundingClientRect()
    )
    return b.top - a.bottom
  })
  assert.ok(Math.abs(gap) < 1, 'gap ' + gap)
  await page.keyboard.press('+')
  await page.waitForFunction(
    () => (document.querySelector('.reader-webtoon-column') as HTMLElement)?.style.width === '65%'
  )
  assert.match(await shownPage(), /第 1 \/ 12 頁/)
  for (let i = 0; i < 4; i++) await page.keyboard.press('Space')
  await page.waitForFunction(
    () => !/第 1 \//.test(document.querySelector('.reader-info strong')?.textContent ?? '')
  )
  const reached = Number(/第 (\d+)/.exec(await shownPage())![1])
  assert.ok(reached > 1, 'scrolled to page ' + reached)
  await page.screenshot({ path: path.join(base, 'shot', 'r256-webtoon.png') })
  await page.keyboard.press('Escape')
  await reader().waitFor({ state: 'detached' })
  await page.waitForFunction(() =>
    document.querySelector('.statusbar')?.textContent?.includes('就緒')
  )
  const saved = (await readFolder(comic)).details?.reading
  assert.equal(saved?.webtoon, true)
  assert.equal(saved?.webtoonWidth, 65)
  assert.equal(saved?.webtoonAsked, true)
  // Opening the book again goes straight to webtoon mode at the page it was left on, without the suggestion.
  await page.locator('.manga-gallery .media-thumbnail').first().click()
  await page.locator('.reader-webtoon').waitFor()
  assert.equal(await page.getByText('這本看起來是條漫', { exact: true }).count(), 0)
  await page.waitForFunction(
    (at) =>
      (document.querySelector('.reader-info strong')?.textContent ?? '').includes(`第 ${at} /`),
    saved?.page !== undefined ? saved.page + 1 : 1
  )
  // V leaves webtoon mode for page-by-page reading.
  await page.keyboard.press('v')
  await page.locator('.reader-frame-layer.is-active').waitFor()
  assert.equal(await page.locator('.reader-webtoon').count(), 0)
  assert.deepEqual(errors, [])
  passed = true
  console.log(
    'PASS webtoon suggestion, gapless column, width, scrolling, saved mode and resume. ' + root
  )
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
