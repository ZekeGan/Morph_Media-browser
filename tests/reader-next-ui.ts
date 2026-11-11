// R-255 / R-275: past the last page of a manga the reader offers the next folder of the browse list; a second press
// opens it and starts reading, and immersive reading carries over to the next book.
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Library } from '../electron/library'
import { createServer } from 'vite'
import { closeApp, launchApp, reportFailure } from './support/app'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'reader-next-')),
  shelf = path.join(root, 'Shelf'),
  local = path.join(root, 'local')
const exec = promisify(execFile)
for (const [book, color] of [
  ['Book 1', '#526c85'],
  ['Book 2', '#ac997f'],
]) {
  const folder = path.join(shelf, book)
  await fs.mkdir(folder, { recursive: true })
  const first = path.join(folder, '001.png')
  await exec(
    'ffmpeg',
    ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${color}:s=100x160`, '-frames:v', '1', first],
    { windowsHide: true }
  )
  for (let i = 2; i <= 6; i++)
    await fs.copyFile(first, path.join(folder, String(i).padStart(3, '0') + '.png'))
}
const library = new Library(local, undefined, false)
await library.init()
await library.create(shelf, {
  name: 'Next test',
  depth: { mode: 'through', level: 1 },
  scanAll: true,
})
// READER_DEV_RENDERER=1 runs the window from the Vite dev server, where React's StrictMode mounts every component
// twice; the hand-over of fullscreen to the next book must survive that too.
const server = process.env.READER_DEV_RENDERER
  ? await createServer({
      configFile: false,
      root: path.resolve('src'),
      esbuild: { jsx: 'automatic' },
      define: {
        __APP_VERSION__: JSON.stringify(
          JSON.parse(await fs.readFile('package.json', 'utf8')).version
        ),
      },
      server: { host: '127.0.0.1', port: 0 },
    })
  : undefined
if (server) {
  await server.listen()
  process.env.ELECTRON_RENDERER_URL = server.resolvedUrls!.local[0]
}
const errors: string[] = []
const { app, page } = await launchApp(local, errors)
const reader = () => page.getByRole('dialog', { name: '漫畫閱讀器', exact: true })
const source = () => page.locator('.media-viewer-source').first()
const fullscreen = (value: boolean) =>
  page.waitForFunction((expected) => !!document.fullscreenElement === expected, value)
try {
  await page.getByRole('button', { name: '開啟專案 Next test', exact: true }).first().click()
  await page.locator('.folder-card', { hasText: 'Book 1' }).first().click()
  await page.locator('.manga-gallery .media-thumbnail').first().click()
  await reader().waitFor()
  assert.equal(await source().textContent(), 'Book 1')
  // Immersive, then to the last spread and past it twice (right to left: the left arrow goes forward).
  await page.keyboard.press('F11')
  await fullscreen(true)
  // One press at a time: the development renderer can be slow to show each page.
  for (let i = 0; i < 12 && !(await reader().locator('.reader-end').count()); i++) {
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(250)
  }
  await reader().locator('.reader-end').waitFor()
  assert.match((await reader().locator('.reader-end').textContent()) ?? '', /下一本：Book 2/)
  await page.keyboard.press('ArrowLeft')
  // The next book starts again at its first page (the toolbar naming the folder is hidden while immersive).
  await page.waitForFunction(() =>
    /^1(–2)?$/.test(
      document.querySelector('.reader-frame-layer.is-active')?.getAttribute('data-pages') ?? ''
    )
  )
  await page.waitForTimeout(500)
  assert.equal(
    await page.evaluate(() => !!document.fullscreenElement),
    true,
    'still fullscreen after moving on'
  )
  assert.equal(
    await reader().evaluate((node) => node.classList.contains('reader-focused')),
    true,
    'still immersive after moving on'
  )
  await page.keyboard.press('Escape')
  await fullscreen(false)
  assert.deepEqual(errors, [])
  console.log('PASS next book opens from the last page and keeps immersive reading. ' + root)
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  await server?.close()
}
