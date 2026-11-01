import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Library } from '../electron/library'
import { WorkspaceStore } from '../electron/workspace'
import { projectFile } from '../electron/files'
import { tinyPng } from './support/archive-fixture'
import { createServer } from 'vite'
import { videoFixture } from './support/video-fixture'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'audio-playback-')),
  local = path.join(root, 'local'),
  media = path.join(root, 'Media'),
  music = path.join(root, 'Music')
await fs.mkdir(media)
await fs.mkdir(music)
await fs.writeFile(path.join(root, 'cover.png'), tinyPng)
await fs.copyFile(await videoFixture(), path.join(media, 'fixture.mp4'))
await promisify(execFile)(
  'ffmpeg',
  [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:sample_rate=44100',
    '-t',
    '12',
    '-c:a',
    'libmp3lame',
    path.join(root, 'tone.mp3'),
  ],
  { windowsHide: true }
)
await promisify(execFile)(
  'ffmpeg',
  [
    '-v',
    'error',
    '-i',
    path.join(root, 'tone.mp3'),
    '-i',
    path.join(root, 'cover.png'),
    '-map',
    '0:a',
    '-map',
    '1',
    '-c',
    'copy',
    '-id3v2_version',
    '3',
    '-metadata:s:v',
    'title=Album cover',
    '-metadata:s:v',
    'comment=Cover (front)',
    path.join(media, 'embedded.mp3'),
  ],
  { windowsHide: true }
)
await fs.copyFile(path.join(root, 'tone.mp3'), path.join(media, 'plain.mp3'))
const sample = process.env.AUDIO_SAMPLE,
  originalSample = sample ? await fs.readFile(sample) : undefined
if (originalSample) await fs.writeFile(path.join(media, 'embedded.mp3'), originalSample)
await fs.copyFile(path.join(media, 'embedded.mp3'), path.join(music, 'embedded.mp3'))
await fs.writeFile(path.join(media, 'blocked.ini'), 'ORIGINAL CONFIG')
const library = new Library(local, undefined, false)
await library.init()
await library.create(media, {
  name: 'Audio media',
  mediaCategory: 'media',
  scanAll: true,
  depth: { mode: 'through', level: 1 },
})
await library.create(music, {
  name: 'Audio legacy',
  mediaCategory: 'music',
  scanAll: true,
  depth: { mode: 'through', level: 1 },
})
const legacy = library
  .snapshot()
  .projects.find((link) => link.project?.name === 'Audio legacy')!.project!
await fs.writeFile(
  projectFile(music, legacy.projectId),
  JSON.stringify({
    ...legacy,
    cells: legacy.cells.map((cell) => ({
      ...cell,
      style: { ...cell.style, textColor: '#123456' },
    })),
  })
)
const originals = new Map<string, Buffer>()
for (const dir of [media, music])
  for (const name of ['embedded.mp3', '.media-viewer/folder.json'])
    originals.set(path.join(dir, name), await fs.readFile(path.join(dir, name)))
originals.set(
  projectFile(music, legacy.projectId),
  await fs.readFile(projectFile(music, legacy.projectId))
)
const projects = library.snapshot().projects.map((link) => link.projectId),
  store = new WorkspaceStore(local, ['zh-TW'])
await store.init()
await store.update({ action: 'appearance', theme: 'glass', locale: 'zh-TW' }, projects)
const env = Object.fromEntries(
  Object.entries({ ...process.env, MEDIA_VIEWER_TEST_DATA: local }).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  )
)
delete env.ELECTRON_RUN_AS_NODE
const server = process.env.AUDIO_DEV_RENDERER
  ? await createServer({
      configFile: false,
      root: path.resolve('src'),
      esbuild: { jsx: 'automatic' },
      server: { host: '127.0.0.1', port: 0 },
    })
  : undefined
if (server) {
  await server.listen()
  env.ELECTRON_RENDERER_URL = server.resolvedUrls!.local[0]
}
const app = await electron.launch({ args: ['.'], env, timeout: 30000 }),
  page = await app.firstWindow()
page.setDefaultTimeout(15000)
await page.evaluate('window.__name=(target)=>target')
const errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
try {
  for (const name of ['Audio media', 'Audio legacy']) {
    if (name === 'Audio legacy') {
      await page.getByRole('button', { name: '開啟專案 Audio media', exact: true }).first().click()
      await page.locator('.mixed-media-browser').waitFor()
    }
    await page
      .getByRole('button', { name: '開啟專案 ' + name, exact: true })
      .first()
      .click()
    await page.locator('.mixed-media-browser').waitFor()
    if (name === 'Audio legacy') {
      assert.equal(
        await page.locator('.folder-details').evaluate((node) => (node as HTMLDetailsElement).open),
        false
      )
      await page.locator('.folder-details summary').click()
      await page
        .locator('.folder-details')
        .getByRole('button', { name: '複製完整路徑', exact: true })
        .waitFor()
      await page
        .locator('.folder-details')
        .getByRole('button', { name: '在檔案總管開啟', exact: true })
        .waitFor()
      assert.equal(await page.locator('.folder-details-path').innerText(), '專案根目錄')
      await page.locator('.folder-details summary').click()
    }
    await page.locator('.media-thumbnail').filter({ hasText: 'embedded.mp3' }).click()
    await page.locator('audio').waitFor({ state: 'attached' })
    await page
      .waitForFunction(() => {
        const audio = document.querySelector('audio')
        return (
          !!audio && !audio.paused && audio.currentTime > 0.2 && !audio.muted && audio.volume > 0
        )
      })
      .catch(async (error) => {
        console.error(
          await page.locator('audio').evaluate((node) => {
            const a = node as HTMLAudioElement
            return {
              src: a.currentSrc,
              paused: a.paused,
              time: a.currentTime,
              ready: a.readyState,
              error: a.error?.message,
              volume: a.volume,
              muted: a.muted,
            }
          })
        )
        throw error
      })
    const decoded = await page.locator('audio').evaluate(async (node) => {
      const audio = node as HTMLAudioElement,
        response = await fetch(audio.currentSrc, { headers: { Range: 'bytes=0-' } }),
        bytes = await response.arrayBuffer(),
        context = new AudioContext()
      try {
        const pcm = await context.decodeAudioData(bytes),
          channel = pcm.getChannelData(0)
        let peak = 0
        for (let i = 0; i < Math.min(channel.length, 44100); i++)
          peak = Math.max(peak, Math.abs(channel[i]))
        return { status: response.status, peak, duration: pcm.duration }
      } finally {
        await context.close()
      }
    })
    assert.equal(decoded.status, 206)
    assert.ok(decoded.peak > 0.01)
    assert.ok(decoded.duration > 10)
    const duration = await page
      .locator('audio')
      .evaluate((node) => (node as HTMLAudioElement).duration)
    assert.ok(Number.isFinite(duration) && duration > 10)
    if (sample) assert.ok(Math.abs(duration - decoded.duration) < 2)
    await page.getByRole('button', { name: '暫停', exact: true }).click()
    await page.waitForFunction(() => document.querySelector('audio')?.paused === true)
    const before = await page
      .locator('audio')
      .evaluate((node) => (node as HTMLAudioElement).currentTime)
    await page.getByRole('button', { name: '播放', exact: true }).click()
    await page.waitForFunction((before) => {
      const audio = document.querySelector('audio')
      return !!audio && !audio.paused && audio.currentTime > before + 0.1
    }, before)
    await page.waitForFunction(() => {
      const image = document.querySelector('.album-cover img') as HTMLImageElement
      return !!image && image.src.startsWith('blob:') && image.complete && image.naturalWidth > 0
    })
    const volume = page.getByRole('slider', { name: '音量', exact: true })
    await volume.focus()
    await volume.press('End')
    assert.equal(await volume.getAttribute('aria-valuemax'), '100')
    assert.equal(await volume.getAttribute('aria-valuenow'), '100')
    assert.equal(
      await page.locator('audio').evaluate((node) => (node as HTMLAudioElement).volume),
      1
    )
    await volume.press('Home')
    assert.equal(await volume.getAttribute('aria-valuenow'), '0')
    await page.waitForFunction(() => document.querySelector('audio')?.muted === true)
    await volume.press('End')
    await page.waitForFunction(() => document.querySelector('audio')?.muted === false)
    for (const theme of ['dark', 'glass', 'paper']) {
      const colors = await page.evaluate((theme) => {
        document.documentElement.dataset.theme = theme
        const track = document.querySelector('.audio-viewer .mantine-Slider-track')!,
          root = document.querySelector('.global-playback')!
        return {
          track: getComputedStyle(track, '::before').backgroundColor,
          background: getComputedStyle(root).backgroundColor,
        }
      }, theme)
      assert.notEqual(colors.track, 'rgba(0, 0, 0, 0)')
      assert.notEqual(colors.track, colors.background)
    }
    await page.evaluate(() => (document.documentElement.dataset.theme = 'glass'))
    await page.screenshot({ path: path.join(root, name + '.png') })
    if (name === 'Audio media') {
      await page.getByRole('button', { name: '切換媒體佇列', exact: true }).click()
      await page.getByRole('tab', { name: /目前資料夾/ }).click()
      const queueFile = async (file: string) => {
        await page
          .locator('.playback-items:visible')
          .getByRole('button', { name: file, exact: true })
          .click({ button: 'right' })
        await page.getByRole('menuitem', { name: '加入播放佇列', exact: true }).click()
      }
      await queueFile('embedded.mp3')
      await queueFile('fixture.mp4')
      await page.getByRole('tab', { name: '播放佇列', exact: true }).click()
      await page.evaluate(() => {
        ;(window as any).backgroundAudio = document.querySelector('audio')
      })
      await page.getByRole('button', { name: '縮小播放', exact: true }).click()
      await page.getByRole('button', { name: '開啟專案 Audio legacy', exact: true }).first().click()
      await page.locator('.mixed-media-browser').waitFor()
      assert.equal(
        await page.evaluate(
          () => document.querySelector('audio') === (window as any).backgroundAudio
        ),
        true
      )
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].minimize())
      await page.waitForTimeout(300)
      assert.equal(
        await page.locator('audio').evaluate((node) => (node as HTMLAudioElement).paused),
        false
      )
      await app.evaluate(({ BrowserWindow }) => {
        const win = BrowserWindow.getAllWindows()[0]
        win.restore()
        win.focus()
      })
      await page.getByRole('button', { name: '返回播放佇列', exact: true }).click()
      await page.getByRole('tab', { name: /目前資料夾/ }).click()
      await queueFile('embedded.mp3')
      await queueFile('embedded.mp3')
      await page.getByRole('tab', { name: '播放佇列', exact: true }).click()
      assert.equal(await page.locator('.playback-items:visible>div').count(), 4)
      await page.getByRole('tab', { name: /目前資料夾/ }).click()
      await page
        .locator('.playback-items:visible')
        .getByRole('button', { name: 'embedded.mp3', exact: true })
        .click()
      await page.getByRole('tab', { name: '播放佇列', exact: true }).click()
      assert.equal(
        await page.locator('.playback-items:visible>div').count(),
        4,
        'single click plays without changing the queue'
      )
      await page.screenshot({ path: path.join(root, 'queue-list.png') })
      await page.getByRole('button', { name: '圖片模式', exact: true }).click()
      await page.screenshot({ path: path.join(root, 'queue-images.png') })
      await page.getByRole('button', { name: '清單模式', exact: true }).click()
      await page.getByRole('button', { name: 'fixture.mp4', exact: true }).click()
      await page.waitForFunction(() => {
        const video = document.querySelector('video')
        return !!video && !video.paused && video.currentTime > 0.1
      })
      await page.getByRole('button', { name: '縮小播放', exact: true }).click()
      await page.getByRole('button', { name: '下一個媒體', exact: true }).click()
      await page.waitForFunction(() => {
        const audio = document.querySelector('audio')
        return !!audio && !audio.paused && audio.currentTime > 0.1
      })
      await page.waitForFunction(
        () => document.querySelector('audio') !== (window as any).backgroundAudio
      )
      await page.waitForFunction(() => {
        const a = document.querySelector('audio')
        return !!a && !a.paused && a.currentTime > 0.1
      })
      await page.getByRole('button', { name: '返回播放佇列', exact: true }).click()
      const rows = page.locator('.playback-items:visible>div')
      await rows.nth(3).dragTo(rows.nth(1))
      assert.equal(await rows.count(), 4)
      assert.equal(
        await rows.nth(1).getByRole('button', { name: 'embedded.mp3', exact: true }).count(),
        1
      )
      await rows.nth(0).getByRole('button', { name: '移除 embedded.mp3', exact: true }).click()
      assert.equal(await rows.count(), 3)
      const auto = page.getByRole('button', { name: '自動接續', exact: true })
      assert.equal(await auto.getAttribute('aria-pressed'), 'false')
      await page.evaluate(() => {
        ;(window as any).beforeAutoAudio = document.querySelector('audio')
      })
      await rows.first().getByRole('button', { name: 'embedded.mp3', exact: true }).click()
      await page.waitForFunction(
        () => document.querySelector('audio') !== (window as any).beforeAutoAudio
      )
      await page.waitForFunction(() => {
        const a = document.querySelector('audio')
        return !!a && !a.paused && Number.isFinite(a.duration) && a.duration > 0
      })
      await auto.click()
      assert.equal(await auto.getAttribute('aria-pressed'), 'true')
      await page.locator('audio').evaluate((node) => {
        const a = node as HTMLAudioElement
        a.currentTime = a.duration - 0.15
      })
      await page.waitForFunction(() => {
        const v = document.querySelector('video')
        return !!v && !v.paused && v.currentTime > 0.1
      })
      if ((await auto.getAttribute('aria-pressed')) === 'true') await auto.click()
      await rows.last().getByRole('button', { name: 'embedded.mp3', exact: true }).click()
      await page.waitForFunction(() => {
        const a = document.querySelector('audio')
        return !!a && !a.paused && a.currentTime > 0.1
      })
      await page.getByRole('button', { name: '縮小播放', exact: true }).click()
      const header = page.locator('.playback-mini>header'),
        bounds = await header.boundingBox()
      assert.ok(bounds)
      await page.mouse.move(bounds.x + 25, bounds.y + 20)
      await page.mouse.down()
      await page.mouse.move(30, 100, { steps: 6 })
      await page.mouse.up()
      await page.waitForTimeout(220)
      let rect = await page.locator('.playback-mini').boundingBox()
      assert.ok(rect && rect.x >= 0 && rect.y >= 0)
      const windowBounds = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].getBounds()
      )
      const top = await header.boundingBox()
      assert.ok(top)
      await page.mouse.move(top.x + 25, top.y + 20)
      await page.mouse.down()
      await page.mouse.move(top.x + 60, 2, { steps: 6 })
      await page.mouse.up()
      await page.waitForTimeout(220)
      rect = await page.locator('.playback-mini').boundingBox()
      assert.ok(rect && rect.y <= 10, 'mini player can sit against the top edge')
      assert.equal(
        await page
          .locator('.playback-mini')
          .evaluate((node) => getComputedStyle(node).getPropertyValue('-webkit-app-region')),
        'no-drag',
        'mini player opts out of the title bar drag region'
      )
      assert.deepEqual(
        await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds()),
        windowBounds,
        'dragging the mini player must not move the native window'
      )
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setBounds({ width: 800, height: 600 })
      )
      await page.waitForTimeout(220)
      rect = await page.locator('.playback-mini').boundingBox()
      assert.ok(rect && rect.x + rect.width <= 800 && rect.y + rect.height <= 600)
      await page.screenshot({ path: path.join(root, 'mini.png') })
      await page.getByRole('button', { name: '返回播放佇列', exact: true }).click()
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].setBounds({ width: 1280, height: 850 })
      )
    }
    await page.evaluate(() => {
      ;(window as any).releasedAudio = document.querySelector('audio')
    })
    await page.getByRole('button', { name: '關閉媒體檢視器', exact: true }).click()
    await page.locator('.media-viewer-shell').waitFor({ state: 'detached' })
    assert.equal(
      await page.evaluate(() => {
        const audio = (window as any).releasedAudio as HTMLAudioElement
        return audio.paused && !audio.getAttribute('src')
      }),
      true
    )
    if (name === 'Audio media') {
      const statuses = await page.evaluate(async () => {
        const snapshot = await window.media.request({ action: 'snapshot' }),
          row = snapshot.snapshot.structure!.find((row) => row.name === 'Media')!,
          content = await window.explorer.request({ action: 'content', rowId: row.rowId }),
          results: number[] = []
        for (const name of ['plain.mp3', 'blocked.ini']) {
          const entry = content.content!.entries.find((entry) => entry.name === name)!,
            url = new URL(entry.url)
          url.hostname = 'audio-cover'
          results.push((await fetch(url)).status)
        }
        results.push((await fetch('media://audio-cover/unknown/unknown')).status)
        return results
      })
      assert.deepEqual(statuses, [204, 415, 422])
    }
  }
  for (const [file, bytes] of originals) assert.deepEqual(await fs.readFile(file), bytes)
  if (sample && originalSample) assert.deepEqual(await fs.readFile(sample), originalSample)
  assert.deepEqual(errors, [])
  console.log(
    'PASS old/new music entry, audible MP3 PCM/Range/playback, ID3 cover and release; original files and records unchanged. ' +
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
  await server?.close()
}
