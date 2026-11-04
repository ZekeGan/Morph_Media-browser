import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Library } from '../electron/library'
import { closeApp } from './support/app'
const baseline = process.env.GALLERY_BENCH_BASELINE === '1',
  base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, baseline ? 'gallery-before-' : 'gallery-after-')),
  local = path.join(root, 'local'),
  media = path.join(root, 'Images')
await fs.mkdir(media)
const exec = promisify(execFile),
  count = 1200
for (let i = 0; i < 3; i++)
  await exec(
    'ffmpeg',
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=${['1600x2200', '2200x1400', '1200x2600'][i]}:rate=1`,
      '-frames:v',
      '1',
      '-q:v',
      '5',
      path.join(media, `source${i}.jpg`),
    ],
    { windowsHide: true }
  )
for (let offset = 0; offset < count; offset += 32)
  await Promise.all(
    Array.from({ length: Math.min(32, count - offset) }, (_, i) =>
      fs.copyFile(
        path.join(media, `source${(offset + i) % 3}.jpg`),
        path.join(media, `Image ${String(offset + i).padStart(5, '0')}.jpg`)
      )
    )
  )
for (let i = 0; i < 3; i++) await fs.unlink(path.join(media, `source${i}.jpg`))
const library = new Library(local, undefined, false)
await library.init()
for (const category of ['album', 'manga'])
  await library.create(media, {
    name: 'Large ' + category,
    depth: { mode: 'through', level: 1 },
    scanAll: true,
  })
const env = Object.fromEntries(
  Object.entries({ ...process.env, MEDIA_VIEWER_TEST_DATA: local }).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  )
)
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, timeout: 30000 }),
  page = await app.firstWindow(),
  errors: string[] = [],
  metrics: any = { baseline, count }
let requests = 0
page.setDefaultTimeout(20000)
page.on('pageerror', (error) => errors.push(error.message))
page.on('request', (request) => {
  if (request.url().startsWith('media://thumb/')) requests++
})
await page.evaluate('window.__name=(target)=>target')
try {
  const state = (await page.evaluate(() => window.media.request({ action: 'snapshot' }))).snapshot,
    row = state.rows.find((row) => row.projectId === state.projects[0].projectId)!
  const started = performance.now(),
    content: any = await page.evaluate(
      (id) => window.explorer.request({ action: 'content', rowId: id, limit: 96 } as any),
      row.rowId
    )
  metrics.contentMs = performance.now() - started
  metrics.firstBatch = content.content.entries.length
  for (const category of ['album', 'manga']) {
    requests = 0
    const opened = performance.now()
    await page
      .getByRole('button', { name: '開啟專案 Large ' + category, exact: true })
      .first()
      .click()
    const gallery = page.locator('.masonry-gallery, .manga-gallery')
    await gallery.waitFor()
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.gallery .media-thumbnail img')].some(
        (image) =>
          (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
      )
    )
    const firstImageMs = performance.now() - opened
    await page.waitForTimeout(500)
    const initialRequests = requests,
      initialNodes = await gallery.locator('.media-thumbnail').count()
    const frame = await page.evaluate(async () => {
      const scroll = document.querySelector('.folder-panel-body')!,
        deltas: number[] = []
      let previous = performance.now()
      for (let i = 0; i < 50; i++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        const now = performance.now()
        deltas.push(now - previous)
        previous = now
        scroll.scrollTop += 60
      }
      return {
        p95: [...deltas].sort((a, b) => a - b)[Math.floor(deltas.length * 0.95)],
        max: Math.max(...deltas),
        scrollHeight: scroll.scrollHeight,
      }
    })
    metrics[category] = { firstImageMs, initialRequests, initialNodes, scroll: frame }
    if (!baseline) {
      assert.ok(initialNodes < 100, category + ' bounds live tiles')
      assert.ok(initialRequests < 100, category + ' bounds first-screen requests')
      assert.equal(
        await gallery
          .locator('img')
          .evaluateAll((images) =>
            images.some((image) => image.getAttribute('src')?.startsWith('media://file/'))
          ),
        false,
        'JPEG previews must use thumbnails'
      )
      await page.getByRole('button', { name: '下一組', exact: true }).click()
      await page.waitForFunction(() =>
        document.querySelector('.gallery')?.textContent?.includes('2／6')
      )
      assert.ok((await gallery.locator('.media-thumbnail[title$="Image 00200.jpg"]').count()) > 0)
      await gallery.locator('.media-thumbnail').first().focus()
      await page.keyboard.press('End')
      await page.waitForFunction(
        () => document.activeElement?.closest('[data-index]')?.getAttribute('data-index') === '199'
      )
      await page.keyboard.press('Home')
      await page.waitForFunction(
        () => document.activeElement?.closest('[data-index]')?.getAttribute('data-index') === '0'
      )
      await page.waitForFunction(() => {
        const image = document.querySelector<HTMLImageElement>('.gallery .media-thumbnail img')
        return image?.complete && image.naturalWidth > 0
      })
      await page.screenshot({ path: path.join(root, category + '.png') })
      await gallery.locator('.media-thumbnail').first().click()
      await page
        .getByRole('dialog', {
          name: '漫畫閱讀器',
          exact: true,
        })
        .waitFor()
      await page.keyboard.press('Escape')
    }
  }
  assert.deepEqual(errors, [])
  await fs.writeFile(path.join(root, 'metrics.json'), JSON.stringify(metrics, null, 2))
  console.log(JSON.stringify({ root, ...metrics }))
  if (!baseline) assert.equal(metrics.firstBatch, 96)
} catch (error) {
  await page.screenshot({ path: path.join(root, 'failure.png') }).catch(() => {})
  console.error('Artifacts: ' + root)
  throw error
} finally {
  await app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.removeAllListeners('close')
      win.webContents.removeAllListeners('will-prevent-unload')
      win.webContents.on('will-prevent-unload', (event) => event.preventDefault())
    }
  })
  await closeApp(app)
}
