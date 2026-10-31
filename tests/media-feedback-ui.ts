import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { WorkspaceStore } from '../electron/workspace'
import { folderFile, projectFile } from '../electron/files'
import { tinyPng } from './support/archive-fixture'
import { videoFixture } from './support/video-fixture'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'media-feedback-')),
  media = path.join(root, 'Media'),
  manga = path.join(root, 'Manga'),
  single = path.join(media, 'Single'),
  local = path.join(root, 'local')
await fs.mkdir(single, { recursive: true })
await fs.mkdir(manga)
await fs.writeFile(path.join(single, 'COVER.png'), tinyPng)
await fs.writeFile(path.join(media, 'cover.png'), tinyPng)
await fs.writeFile(path.join(media, 'folder.png'), tinyPng)
await fs.writeFile(path.join(media, 'broken.png'), 'BROKEN COVER')
await fs.writeFile(path.join(manga, 'page.png'), tinyPng)
// Playback is outside this regression: use a controlled WAV for metadata only.
const wav = Buffer.alloc(46)
wav.write('RIFF')
wav.writeUInt32LE(38, 4)
wav.write('WAVEfmt ', 8)
wav.writeUInt32LE(16, 16)
wav.writeUInt16LE(1, 20)
wav.writeUInt16LE(1, 22)
wav.writeUInt32LE(44100, 24)
wav.writeUInt32LE(88200, 28)
wav.writeUInt16LE(2, 32)
wav.writeUInt16LE(16, 34)
wav.write('data', 36)
wav.writeUInt32LE(2, 40)
await fs.writeFile(path.join(media, 'track.wav'), wav)
await fs.writeFile(path.join(single, 'track.wav'), wav)
for (const name of ['first.mp4', 'second.mp4'])
  await fs.copyFile(await videoFixture(), path.join(media, name))
const library = new Library(local, undefined, false)
await library.init()
await library.create(media, {
  name: 'Media feedback',
  mediaCategory: 'media',
  scanAll: true,
  depth: { mode: 'through', level: 1 },
})
await library.create(manga, {
  name: 'Manga feedback',
  mediaCategory: 'manga',
  scanAll: true,
  depth: { mode: 'through', level: 1 },
})
const snapshot = library.snapshot(),
  projects = snapshot.projects.map((entry) => entry.project!),
  mangaProject = projects.find((project) => project.mediaCategory === 'manga')!
const store = new WorkspaceStore(local, ['zh-TW'])
await store.init()
await store.update(
  { action: 'appearance', theme: 'glass', locale: 'zh-TW' },
  projects.map((project) => project.projectId)
)
await store.update(
  {
    action: 'browse',
    projectId: mangaProject.projectId,
    value: { mode: 'CARD', location: '', widths: {}, panelWidth: 420, contentMode: 'files' },
  },
  projects.map((project) => project.projectId)
)
const originals = new Map<string, Buffer>()
for (const dir of [media, manga, single]) {
  for (const name of await fs.readdir(dir)) {
    const file = path.join(dir, name)
    if ((await fs.stat(file)).isFile()) originals.set(file, await fs.readFile(file))
  }
  originals.set(folderFile(dir), await fs.readFile(folderFile(dir)))
}
for (const project of projects)
  originals.set(
    projectFile(project.mediaCategory === 'manga' ? manga : media, project.projectId),
    await fs.readFile(
      projectFile(project.mediaCategory === 'manga' ? manga : media, project.projectId)
    )
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
const filter = async (name: string) => {
  await page.getByRole('textbox', { name: '檔案類型', exact: true }).click()
  await page.getByRole('option', { name, exact: true }).click()
}
const open = async (name: string) => {
  await page
    .locator('.mixed-media-browser .media-thumbnail')
    .filter({ has: page.getByText(name, { exact: true }) })
    .click()
  await page.locator('.media-viewer-shell').waitFor()
  if ((await button('切換媒體佇列').getAttribute('aria-pressed')) !== 'true')
    await button('切換媒體佇列').click()
  await page.locator('.playback-queue-open').waitFor({ state: 'visible' })
}
try {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1400, height: 900 })
  )
  await button('開啟專案 Media feedback').first().click()
  await page.locator('.mixed-media-browser').waitFor()
  await page.locator('.gallery-loading').waitFor({ state: 'detached' })
  await filter('音樂')
  await open('track.wav')
  // Multiple candidates must be explicit, never an arbitrary first image.
  await button('選擇專輯封面').click()
  await page.getByRole('menuitem', { name: 'cover.png', exact: true }).click()
  await page.waitForFunction(() => {
    const img = document.querySelector('.album-cover img') as HTMLImageElement
    return !!img && img.complete && img.naturalWidth > 0
  })
  assert.equal(await page.locator('.playback-item').count(), 3)
  await button('選擇專輯封面').click()
  await page.getByRole('menuitem', { name: 'broken.png', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '無法載入專輯封面' }).waitFor()
  await button('選擇專輯封面').click()
  await page.getByRole('menuitem', { name: 'folder.png', exact: true }).click()
  await page.waitForFunction(() => {
    const img = document.querySelector('.album-cover img') as HTMLImageElement
    return !!img && img.complete && img.naturalWidth > 0
  })
  await page.screenshot({ path: path.join(root, 'cover.png') })
  await button('關閉媒體檢視器').click()
  await filter('影片')
  await open('first.mp4')
  await page.locator('video').waitFor()
  await page.evaluate(() => {
    ;(window as any).feedbackVideo = document.querySelector('video')
  })
  await button('圖片模式').click()
  assert.equal(
    await page.evaluate(() => document.querySelector('video') === (window as any).feedbackVideo),
    true
  )
  assert.equal(await page.locator('.playback-items-images .playback-item').count(), 3)
  // A trial play is not queued: the folder tab lists the siblings to switch to.
  await page.getByRole('tab', { name: /目前資料夾/ }).click()
  const second = page
    .locator('.playback-item')
    .filter({ hasText: 'second.mp4' })
    .locator('button')
    .first()
  await second.click()
  await page.waitForFunction(
    () => document.querySelector('.media-viewer-shell>header strong')?.textContent === 'second.mp4'
  )
  await page.evaluate(() => {
    ;(window as any).feedbackVideo = document.querySelector('video')
  })
  await button('清單模式').click()
  await button('圖片模式').click()
  assert.equal(
    await page.evaluate(() => document.querySelector('video') === (window as any).feedbackVideo),
    true
  )
  await page.screenshot({ path: path.join(root, 'video-thumbnails.png') })
  await button('關閉媒體檢視器').click()
  await open('first.mp4')
  // The chosen queue view is remembered while the app runs.
  assert.equal(await button('圖片模式').getAttribute('aria-pressed'), 'true')
  await button('關閉媒體檢視器').click()
  await page.locator('.media-subfolders button').filter({ hasText: 'Single' }).click()
  await filter('音樂')
  await open('track.wav')
  await page.waitForFunction(() => {
    const img = document.querySelector('.album-cover img') as HTMLImageElement
    return !!img && img.complete && img.naturalWidth > 0
  })
  await button('關閉媒體檢視器').click()
  await button('開啟專案 Manga feedback').first().click()
  await page.locator('.project-workspace').waitFor()
  assert.equal(await page.getByLabel('展示內容', { exact: true }).count(), 0)
  assert.equal(await page.locator('.file-overview').count(), 0)
  await page.waitForFunction(async (id) => {
    const state = await window.desktop.workspace()
    return state.prefs.browse?.[id]?.contentMode === 'folders'
  }, mangaProject.projectId)
  for (const [file, bytes] of originals) assert.deepEqual(await fs.readFile(file), bytes)
  assert.deepEqual(errors, [])
  console.log(
    'PASS filtered music covers, explicit selection/error recovery, video thumbnail switching and stable player, manga file-mode fallback; original files and portable records unchanged. ' +
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
  await app.close()
}
