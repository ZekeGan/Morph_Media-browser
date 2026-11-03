import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { WorkspaceStore } from '../electron/workspace'
import { folderFile, projectFile } from '../electron/files'
import { tinyPng, zipFixture } from './support/archive-fixture'
import { videoFixture } from './support/video-fixture'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'mixed-ui-')),
  media = path.join(root, 'Media'),
  child = path.join(media, 'Child'),
  local = path.join(root, 'local')
await fs.mkdir(child, { recursive: true })
for (let i = 1; i <= 241; i++)
  await fs.writeFile(path.join(media, `image-${String(i).padStart(3, '0')}.png`), tinyPng)
await fs.writeFile(path.join(child, 'child-only.png'), tinyPng)
await fs.writeFile(path.join(media, 'normal.ini'), 'ORIGINAL CONFIG')
await fs.writeFile(path.join(media, 'launch.exe'), 'UNSUPPORTED ORIGINAL')
await fs.writeFile(path.join(media, 'notes.srt'), '1\n00:00:00,000 --> 00:00:01,000\nSubtitle')
await fs.writeFile(path.join(media, 'corrupt.mp4'), 'CORRUPT CONTROLLED VIDEO')
await fs.writeFile(path.join(media, '.note'), 'ORIGINAL DOTFILE')
const wave = Buffer.alloc(44 + 44100 * 2 * 10)
wave.write('RIFF')
wave.writeUInt32LE(wave.length - 8, 4)
wave.write('WAVEfmt ', 8)
wave.writeUInt32LE(16, 16)
wave.writeUInt16LE(1, 20)
wave.writeUInt16LE(1, 22)
wave.writeUInt32LE(44100, 24)
wave.writeUInt32LE(88200, 28)
wave.writeUInt16LE(2, 32)
wave.writeUInt16LE(16, 34)
wave.write('data', 36)
wave.writeUInt32LE(wave.length - 44, 40)
await fs.writeFile(path.join(media, 'track-1.wav'), wave)
await fs.writeFile(path.join(media, 'track-2.wav'), wave)
await fs.copyFile(await videoFixture(), path.join(media, 'video-1.mp4'))
await fs.copyFile(await videoFixture(), path.join(media, 'video-2.mp4'))
await fs.writeFile(
  path.join(media, 'book.cbz'),
  zipFixture([
    { name: '001.png', bytes: tinyPng },
    { name: '002.png', bytes: tinyPng },
  ])
)
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length 44 >>\nstream\nBT /F1 24 Tf 40 400 Td (MEDIA VIEWER QA) Tj ET\nendstream',
]
let pdf = '%PDF-1.4\n'
const offsets = [0]
for (let i = 0; i < objects.length; i++) {
  offsets.push(Buffer.byteLength(pdf))
  pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`
}
const xref = Buffer.byteLength(pdf)
pdf +=
  `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
  offsets
    .slice(1)
    .map((offset) => String(offset).padStart(10, '0') + ' 00000 n \n')
    .join('') +
  `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
await fs.writeFile(path.join(media, 'document.pdf'), pdf)
const originals = new Map<string, Buffer>()
for (const name of await fs.readdir(media)) {
  const file = path.join(media, name)
  if ((await fs.stat(file)).isFile()) originals.set(file, await fs.readFile(file))
}
const library = new Library(local, undefined, false)
await library.init()
await library.create(media, {
  name: 'Mixed QA',
  scanAll: true,
  depth: { mode: 'through', level: 3 },
})
const project = library.snapshot().projects[0].project!,
  recordBefore = await fs.readFile(folderFile(media)),
  childBefore = await fs.readFile(folderFile(child))
const store = new WorkspaceStore(local, ['zh-TW'])
await store.init()
await store.update({ action: 'appearance', theme: 'glass', locale: 'zh-TW' }, [project.projectId])
const env = Object.fromEntries(
  Object.entries({ ...process.env, MEDIA_VIEWER_TEST_DATA: local }).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  )
)
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, timeout: 30000 }),
  page = await app.firstWindow()
page.setDefaultTimeout(15000)
await page.evaluate('window.__name=(target)=>target')
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
const button = (name: string) => page.getByRole('button', { name, exact: true })
const filter = async (name: string) => {
  await page.getByRole('textbox', { name: '檔案類型', exact: true }).click()
  await page.getByRole('option', { name, exact: true }).click()
}
const openFile = async (name: string) => {
  await page
    .locator('.mixed-media-browser .media-thumbnail')
    .filter({ has: page.getByText(name, { exact: true }) })
    .click()
  await page.locator('.media-viewer-shell').waitFor()
}
const close = async () => {
  const reader = page.locator('.reader')
  if (await reader.count()) await button('退出閱讀器').click()
  else await button('關閉媒體檢視器').click()
  await page.locator('.media-viewer-shell').waitFor({ state: 'detached' })
}
const toggleQueue = async (open: boolean) => {
  await button('切換媒體佇列').click()
  await page.waitForFunction((value) => {
    const node = document.querySelector('.media-queue-slot') as HTMLElement
    return !!node && node.inert === !value && node.getAttribute('aria-hidden') === String(!value)
  }, open)
  if (open) await page.locator('.media-queue').waitFor({ state: 'visible' })
}
try {
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.setMinimumSize(0, 0)
    win.setBounds({ width: 1500, height: 950 })
  })
  await button('開啟專案 Mixed QA').first().click()
  await page.locator('.mixed-media-browser').waitFor()
  await page.locator('.gallery-loading').waitFor({ state: 'detached' })
  assert.equal(await button('套用').count(), 0)
  await button('卡片顯示設定').click()
  assert.equal(await page.getByLabel('每列卡片數', { exact: true }).inputValue(), '3')
  await page.getByLabel('每列卡片數', { exact: true }).fill('4')
  await page.getByLabel('每頁筆數', { exact: true }).fill('31')
  await page.waitForFunction(async () => {
    const result = await window.media.request({ action: 'snapshot' })
    const p = result.snapshot.projects[0].project
    return p?.list.itemsPerRow === 4 && p.list.pageSize === 31
  })
  assert.equal(await page.getByLabel('展示內容', { exact: true }).count(), 0)
  assert.equal(await page.locator('video,audio').count(), 0)
  assert.equal(
    await page.locator('.media-subfolders button').filter({ hasText: 'Child' }).isDisabled(),
    false
  )
  await page.screenshot({ path: path.join(root, 'browser.png') })
  await filter('其他')
  for (const presentation of ['瀑布流', '縮圖', '列表']) {
    await page.getByRole('textbox', { name: '檔案展示方式', exact: true }).click()
    await page.getByRole('option', { name: presentation, exact: true }).click()
    for (const name of ['normal.ini', 'launch.exe', 'notes.srt']) {
      const tile = page
        .locator('.gallery-tile')
        .filter({ has: page.locator('.media-thumbnail').filter({ hasText: name }) })
      await tile.locator('.media-thumbnail').click()
      assert.equal(await page.locator('.media-viewer-shell').count(), 0)
      assert.ok((await tile.innerText()).includes('不支援內建預覽'))
      assert.equal(
        await tile.getByRole('button', { name: '開啟所在資料夾', exact: true }).count(),
        1
      )
    }
  }
  // Intercept only the controlled fixture's OS-open action; never launch Explorer.
  await app.evaluate(({ shell }) => {
    ;(globalThis as any).openedFolder = undefined
    shell.openPath = async (file) => {
      ;(globalThis as any).openedFolder = file
      return ''
    }
  })
  await page
    .locator('.gallery-tile')
    .filter({ hasText: 'normal.ini' })
    .getByRole('button', { name: '開啟所在資料夾', exact: true })
    .click()
  await page.evaluate(() => window.media.request({ action: 'snapshot' }))
  assert.equal(await app.evaluate(() => (globalThis as any).openedFolder), media)
  await filter('圖片')
  await openFile('image-001.png')
  await page.locator('.is-active').waitFor()
  assert.equal(await button('切換媒體佇列').getAttribute('aria-pressed'), 'false')
  assert.equal(await page.locator('.media-queue').count(), 0)
  await button('放大').click()
  const zoom = await page.locator('.reader-zoom-value').innerText()
  const readerBefore = await page.locator('.reader-stage').boundingBox()
  await toggleQueue(true)
  assert.ok(
    await page
      .locator('.media-queue-slot')
      .evaluate((node) => getComputedStyle(node).transitionDuration.includes('0.18s'))
  )
  assert.equal((await page.locator('.media-queue-scroll button').count()) < 30, true)
  assert.ok((await page.locator('.media-queue>header strong').innerText()).includes('241'))
  assert.equal(await page.evaluate(() => !!document.fullscreenElement), false)
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() =>
    document.querySelector('.media-queue button.active')?.textContent?.includes('image-002')
  )
  await page
    .locator('.media-queue')
    .getByRole('button', { name: 'image-002.png', exact: true })
    .focus()
  await toggleQueue(false)
  assert.equal(
    await button('切換媒體佇列').evaluate((node) => node === document.activeElement),
    true
  )
  assert.equal(await page.locator('.reader-zoom-value').innerText(), zoom)
  assert.deepEqual(await page.locator('.reader-stage').boundingBox(), readerBefore)
  await toggleQueue(true)
  await page.screenshot({ path: path.join(root, 'image-queue.png') })
  await close()
  await page.waitForFunction(async () => {
    const result = await window.media.request({ action: 'snapshot' })
    return (
      result.snapshot.structure?.find((row) => row.depth === 1)?.record?.details?.reading?.page ===
      1
    )
  })
  await filter('音樂')
  await page
    .locator('.mixed-media-browser .media-thumbnail')
    .filter({ has: page.getByText('track-2.wav', { exact: true }) })
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: '加入播放佇列', exact: true }).click()
  assert.equal(
    await page.locator('audio').count(),
    0,
    'adding to the queue does not start playback'
  )
  await button('播放佇列 · 1').click()
  await page.locator('.media-viewer-shell').waitFor()
  await page.waitForFunction(() => {
    const audio = document.querySelector('audio')
    return !!audio && !audio.paused && audio.currentTime > 0
  })
  await page.evaluate(() => {
    ;(window as any).oldAudio = document.querySelector('audio')
  })
  await close()
  assert.equal(
    await page.evaluate(() => {
      const node = (window as any).oldAudio as HTMLAudioElement
      return node.paused && !node.getAttribute('src')
    }),
    true
  )
  await openFile('track-1.wav')
  await page.waitForFunction(() => {
    const audio = document.querySelector('audio')
    return !!audio && !audio.paused
  })
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize())
  await page.waitForFunction(() => document.querySelector('audio')?.paused === true)
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].restore()
    BrowserWindow.getAllWindows()[0].focus()
  })
  assert.equal(
    await page.locator('audio').evaluate((node) => (node as HTMLAudioElement).paused),
    true
  )
  await page.screenshot({ path: path.join(root, 'music.png') })
  await close()
  await filter('影片')
  assert.equal(await page.locator('video').count(), 0)
  await openFile('video-1.mp4')
  await page.waitForFunction(() => {
    const video = document.querySelector('video')
    return !!video && !video.paused && video.currentTime > 0
  })
  assert.equal(await page.locator('.video-strip').count(), 0)
  await page.evaluate(() => {
    ;(window as any).oldVideo = document.querySelector('video')
  })
  await close()
  assert.equal(
    await page.evaluate(() => {
      const video = (window as any).oldVideo as HTMLVideoElement
      return video.paused && !video.getAttribute('src')
    }),
    true
  )
  await openFile('corrupt.mp4')
  await page.locator('.video-error').waitFor()
  await close()
  await filter('其他')
  await openFile('document.pdf')
  await page.locator('.document-viewer iframe').waitFor()
  assert.equal(await button('切換媒體佇列').getAttribute('aria-pressed'), 'false')
  await page.evaluate(() => {
    ;(window as any).queuePdf = document.querySelector('.document-viewer iframe')
  })
  await toggleQueue(true)
  await toggleQueue(false)
  assert.equal(
    await page.evaluate(
      () => document.querySelector('.document-viewer iframe') === (window as any).queuePdf
    ),
    true
  )
  const bounds = await page.locator('.media-viewer-shell').boundingBox()
  assert.ok(bounds && bounds.x === 0 && bounds.width > 1400)
  await page.screenshot({ path: path.join(root, 'pdf-glass.png') })
  await close()
  await openFile('book.cbz')
  await page.locator('.is-active').waitFor()
  assert.equal(await button('切換媒體佇列').getAttribute('aria-pressed'), 'false')
  await toggleQueue(true)
  assert.equal(await page.locator('.media-queue button').count(), 1)
  await close()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 700, height: 780 })
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await filter('影片')
  await openFile('video-1.mp4')
  await page.waitForFunction(() => {
    const video = document.querySelector('video')
    return !!video && !video.paused
  })
  await close()
  await filter('圖片')
  await button('下一組').click()
  await page.getByRole('textbox', { name: '檔案範圍', exact: true }).click()
  await page.getByRole('option', { name: '包含子資料夾', exact: true }).click()
  await page.locator('.gallery-loading').waitFor({ state: 'detached' })
  await page.getByRole('textbox', { name: '檔案範圍', exact: true }).click()
  await page.getByRole('option', { name: '目前資料夾', exact: true }).click()
  await page.locator('.media-thumbnail').filter({ hasText: 'image-001.png' }).waitFor()
  await filter('全部')
  await page.locator('.media-subfolders button').filter({ hasText: 'Child' }).click()
  await page.locator('.media-thumbnail').filter({ hasText: 'child-only.png' }).waitFor()
  assert.equal(
    await page
      .locator('.gallery')
      .innerText()
      .then((text) => text.includes('241')),
    false
  )
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 700, height: 780 })
  )
  await page.screenshot({ path: path.join(root, 'narrow.png') })
  const after = JSON.parse(await fs.readFile(folderFile(media), 'utf8')),
    before = JSON.parse(recordBefore.toString())
  assert.equal(after.details.reading.page, 1)
  delete after.revision
  delete before.revision
  delete after.details.reading
  if (Object.keys(after.details).every((key) => key === 'schemaVersion')) delete after.details
  assert.deepEqual(after, before)
  assert.deepEqual(await fs.readFile(folderFile(child)), childBefore)
  for (const [file, bytes] of originals) assert.deepEqual(await fs.readFile(file), bytes)
  assert.equal(
    JSON.parse(await fs.readFile(projectFile(media, project.projectId), 'utf8')).mediaCategory,
    'media'
  )
  assert.deepEqual(errors, [])
  console.log(
    'PASS mixed browser, live CARD save, 241-image queue, music/video lifecycle, PDF/CBZ, child navigation, narrow layout and original bytes. ' +
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
