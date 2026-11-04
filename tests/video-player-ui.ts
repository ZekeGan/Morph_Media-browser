import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { folderFile } from '../electron/files'

import { videoFixture } from './support/video-fixture'
import { closeApp } from './support/app'

const groups = ['controls', 'subtitles', 'appearance'] as const
type Group = (typeof groups)[number]
function selection(): Group[] {
  const args = process.argv.slice(2)

  if (args.length === 1 && args[0] === '--list') {
    console.log(groups.join('\n'))
    return []
  }

  if (!args.length) return [...groups]

  const requested: string[] = []

  while (args.length) {
    const arg = args.shift()!

    if (arg === '--group' && args.length) requested.push(args.shift()!)
    else if (arg.startsWith('--group=')) requested.push(arg.slice('--group='.length))
    else
      throw new Error('使用 --list 或 --group <' + groups.join('|') + '>；不帶參數執行全部群組。')
  }

  for (const group of requested)
    if (!groups.includes(group as Group)) throw new Error('未知測試群組：' + group)

  return [...new Set(requested)] as Group[]
}
const selectedGroups = selection()
if (selectedGroups.length) {
  const fixture = await videoFixture()

  for (const group of selectedGroups) await runGroup(group, fixture)
}

async function runGroup(group: Group, fixture: string) {
  const started = Date.now()

  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })

  const root = await fs.mkdtemp(path.join(base, 'video-controls-' + group + '-')),
    local = path.join(root, 'local'),
    media = path.join(root, 'Videos'),
    screens = path.join(root, 'screens')

  await fs.mkdir(media)
  await fs.mkdir(screens)

  await fs.copyFile(fixture, path.join(media, '01-first.mp4'))

  for (const name of ['02-second.mp4', '03-last.mp4'])
    await fs.copyFile(path.join(media, '01-first.mp4'), path.join(media, name))

  await fs.mkdir(path.join(media, 'Nested'))
  await fs.copyFile(
    path.join(media, '01-first.mp4'),
    path.join(media, 'Nested/not-in-playlist.mp4')
  )

  await fs.writeFile(
    path.join(media, 'first.srt'),
    '1\n00:00:00,000 --> 00:00:30,000\nControlled subtitle\n'
  )

  await fs.writeFile(path.join(media, 'bad.srt'), 'not a subtitle')

  const originals = new Map<string, Buffer>()
  for (const name of ['01-first.mp4', '02-second.mp4', '03-last.mp4', 'first.srt', 'bad.srt'])
    originals.set(name, await fs.readFile(path.join(media, name)))

  const lib = new Library(local, undefined, false)
  await lib.init()
  await lib.create(media, {
    name: 'Player QA',
    scanAll: true,
    depth: { mode: 'through', level: 1 },
  })

  const record = await fs.readFile(folderFile(media))

  const env: Record<string, string> = Object.fromEntries(
    Object.entries({ ...process.env, MEDIA_VIEWER_TEST_DATA: local }).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  )
  delete env.ELECTRON_RUN_AS_NODE

  const app = await electron.launch({ args: ['.'], env, timeout: 30000 }),
    page = await app.firstWindow(),
    errors: string[] = []

  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => errors.push(error.message))

  const open = async () => {
    await page.getByRole('button', { name: '開啟專案 Player QA', exact: true }).first().click()
    await page.locator('.mixed-media-browser').waitFor()
    await page.locator('.media-thumbnail').filter({ hasText: '01-first.mp4' }).click()
    await page.waitForFunction(() => {
      const video = document.querySelector('video')
      return video && video.readyState >= 1
    })
  }

  const stage = page.locator('.custom-video-stage'),
    controls = page.locator('.video-controls'),
    tool = (name: string) => controls.getByRole('button', { name, exact: true })

  const settingsPanel = page.getByRole('dialog', { name: '更多播放設定', exact: true })
  const openSettings = async () => {
    if ((await tool('更多播放設定').getAttribute('aria-expanded')) !== 'true')
      await tool('更多播放設定').click()
    await settingsPanel.waitFor()
    await page.waitForFunction(
      () => getComputedStyle(document.querySelector('.player-settings')!).opacity === '1'
    )
  }
  const section = async (name: string) => {
    await openSettings()
    const group = settingsPanel.getByRole('button', { name: '字幕設定', exact: true })
    if ((await group.getAttribute('aria-expanded')) !== 'true') await group.click()
    const button = settingsPanel.getByRole('button', { name, exact: true })
    if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click()
  }
  const focus = async () => {
    await stage.focus()
    await stage.hover({ position: { x: 15, y: 15 } })
  }

  const checks: Record<Group, () => Promise<void>> = {
    controls: async () => {
      assert.equal(await page.getByRole('button', { name: '影片設定', exact: true }).count(), 0)
      await openSettings()
      assert.equal(
        await settingsPanel
          .getByRole('button', { name: '字幕設定', exact: true })
          .getAttribute('aria-expanded'),
        'false'
      )
      await settingsPanel.getByRole('button', { name: '關閉播放設定', exact: true }).click()
      await settingsPanel.waitFor({ state: 'hidden' })
      assert.equal(await tool('快進 10 秒').count(), 0)
      assert.equal(await tool('快退 10 秒').count(), 0)
      assert.equal(
        await controls.evaluate((element) => getComputedStyle(element).backgroundColor),
        'rgba(0, 0, 0, 0)'
      )
      await focus()
      await page.waitForFunction(
        () => document.querySelector('.player-volume-reveal')!.getBoundingClientRect().width === 0
      )
      await page.screenshot({ path: path.join(screens, 'controls-collapsed.png') })
      await controls.locator('.player-audio').hover()
      await page.waitForFunction(
        () => document.querySelector('.player-volume-reveal')!.getBoundingClientRect().width >= 70
      )
      await page.screenshot({ path: path.join(screens, 'controls-volume.png') })
      await tool('播放').click()
      await page.waitForFunction(() => document.querySelector('video')!.currentTime > 0.1)
      await tool('暫停').click()

      await focus()
      await stage.press('l')
      assert.ok(
        await page
          .locator('video')
          .evaluate((element) => (element as HTMLVideoElement).currentTime >= 10)
      )

      await stage.press('j')
      assert.ok(
        await page
          .locator('video')
          .evaluate((element) => (element as HTMLVideoElement).currentTime < 1)
      )

      const timeline = controls.getByRole('slider', { name: '播放進度', exact: true })
      await timeline.press('Home')
      await timeline.press('ArrowRight')
      assert.ok(
        await page
          .locator('video')
          .evaluate((element) => Math.abs((element as HTMLVideoElement).currentTime - 5) < 0.2)
      )

      const volume = controls.getByRole('slider', { name: '音量', exact: true })
      await controls.locator('.player-audio').hover()
      await page.waitForFunction(
        () => document.querySelector('.player-volume-reveal')!.getBoundingClientRect().width >= 70
      )
      const bounds = await volume.boundingBox()
      assert.ok(bounds)
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
      await page.mouse.down()
      await page.mouse.move(bounds.x, bounds.y - 50)
      assert.equal(await controls.locator('.player-audio').getAttribute('data-dragging'), 'true')
      await page.mouse.up()
      await volume.press('End')
      await volume.press('ArrowLeft')

      await page.waitForFunction(
        () => Math.abs(document.querySelector('video')!.volume - 0.99) < 0.001
      )

      await tool('靜音').click()
      assert.equal(
        await page.locator('video').evaluate((element) => (element as HTMLVideoElement).muted),
        true
      )

      await focus()
      await stage.press('m')
      assert.equal(
        await page.locator('video').evaluate((element) => (element as HTMLVideoElement).muted),
        false
      )

      await page.waitForFunction(async () => {
        const prefs = (await window.desktop.workspace()).prefs.videoAudio
        return prefs && Math.abs(prefs.volume - 0.99) < 0.001 && !prefs.muted
      })

      await openSettings()
      await page.getByRole('combobox', { name: '播放速度', exact: true }).selectOption('1.5')
      await page.getByRole('combobox', { name: '播放速度', exact: true }).press('Escape')

      assert.equal(
        await page
          .locator('video')
          .evaluate((element) => (element as HTMLVideoElement).playbackRate),
        1.5
      )
      assert.equal(
        await tool('更多播放設定').evaluate((element) => element === document.activeElement),
        true
      )

      await focus()
      await stage.press('k')
      await page.waitForFunction(() => !document.querySelector('video')!.paused)

      await page.waitForFunction(
        () => document.querySelector('.video-controls')?.getAttribute('data-visible') === 'false'
      )

      await stage.press('k')
      await tool('播放').waitFor()
    },

    subtitles: async () => {
      assert.equal(
        await controls.locator('[aria-label="載入字幕"],[aria-label="顯示／隱藏字幕"]').count(),
        0
      )
      await section('字幕來源')
      const subtitles = settingsPanel
      await subtitles.getByRole('button', { name: 'first.srt', exact: true }).click()
      await page.keyboard.press('Escape')
      await subtitles.waitFor({ state: 'hidden' })

      await page
        .locator('.subtitle-overlay')
        .getByText('Controlled subtitle', { exact: true })
        .waitFor()

      await section('字幕來源')
      await subtitles.getByRole('switch', { name: '顯示／隱藏字幕', exact: true }).click()
      await subtitles.getByRole('button', { name: '關閉播放設定', exact: true }).click()
      assert.equal(await page.locator('.subtitle-overlay').count(), 0)

      await focus()
      await stage.press('c')
      await page.locator('.subtitle-overlay').waitFor()

      await section('字幕來源')
      await page.screenshot({
        path: path.join(screens, 'more-settings.png'),
        animations: 'disabled',
      })
      await subtitles.getByRole('button', { name: 'bad.srt', exact: true }).click()
      await subtitles.getByRole('alert').waitFor()
      await subtitles.getByRole('button', { name: 'first.srt', exact: true }).click()
      await subtitles.getByRole('alert').waitFor({ state: 'hidden' })

      await section('字幕外觀')
      await subtitles.getByLabel('字幕大小', { exact: true }).fill('30')
      assert.equal(
        await page
          .locator('.subtitle-overlay')
          .evaluate((element) => getComputedStyle(element).fontSize),
        '30px'
      )
      await section('同步與編碼')
      const encoding = subtitles.getByRole('textbox', { name: '文字編碼', exact: true })
      await encoding.click()
      await page.getByRole('option', { name: 'big5', exact: true }).click()
      await page.waitForFunction(() =>
        [...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input')].some(
          (input) => input.value === 'big5'
        )
      )
      assert.equal(await encoding.inputValue(), 'big5')
      await page.screenshot({ path: path.join(screens, 'subtitle-settings.png') })
      await subtitles.getByRole('button', { name: '重設', exact: true }).click()
      await page.waitForFunction(
        (input) => (input as HTMLInputElement).value === 'utf-8',
        await encoding.elementHandle()
      )
      assert.equal(await encoding.inputValue(), 'utf-8')

      await page.keyboard.press('Escape')
      await subtitles.waitFor({ state: 'hidden' })

      await page.locator('video').dblclick()
      await page.waitForFunction(() =>
        document.fullscreenElement?.classList.contains('video-viewer')
      )

      assert.equal(
        await page.locator('video').evaluate((element) => (element as HTMLVideoElement).paused),
        true
      )

      await page.screenshot({ path: path.join(screens, 'fullscreen.png'), animations: 'disabled' })

      await section('字幕來源')
      await subtitles.waitFor()

      assert.equal(
        await subtitles.evaluate((element) => !!document.fullscreenElement?.contains(element)),
        true
      )

      await section('同步與編碼')
      await encoding.click()
      const option = page.getByRole('option', { name: 'big5', exact: true })
      await option.waitFor()
      assert.equal(
        await option.evaluate((element) => !!document.fullscreenElement?.contains(element)),
        true
      )
      await option.click()
      await page.waitForFunction(() =>
        [...document.querySelectorAll<HTMLInputElement>('[role="dialog"] input')].some(
          (input) => input.value === 'big5'
        )
      )
      await section('字幕外觀')
      await subtitles.getByRole('textbox', { name: '字幕顏色', exact: true }).click()
      const colorPicker = page.locator('.mantine-ColorInput-dropdown')
      await colorPicker.waitFor()
      assert.equal(
        await colorPicker.evaluate((element) => !!document.fullscreenElement?.contains(element)),
        true
      )
      await page.screenshot({ path: path.join(screens, 'fullscreen-settings.png') })
      await subtitles.getByRole('button', { name: '字幕設定', exact: true }).click()
      await colorPicker.waitFor({ state: 'hidden' })

      await page.keyboard.press('Escape')
      await subtitles.waitFor({ state: 'hidden' })

      if (await page.evaluate(() => !!document.fullscreenElement)) {
        await focus()
        await stage.press('f')
      }

      await page.waitForFunction(() => !document.fullscreenElement)
    },

    appearance: async () => {
      const styles: Record<string, unknown> = {}
      const captureStyles = async (name: string) => {
        await focus()
        styles[name] = await page.evaluate(() => {
          const properties = [
            'display',
            'position',
            'width',
            'height',
            'flex-direction',
            'object-fit',
            'padding',
            'margin',
            'gap',
            'background-color',
            'color',
            'border-radius',
            'border-top-width',
            'border-top-color',
            'overflow',
            'opacity',
            'visibility',
            'z-index',
            'outline-color',
            'outline-width',
            'container-type',
          ]
          const selectors = [
            '.video-viewer',
            '.video-stage',
            '.video-stage video',
            '.video-controls',
            '.player-timeline input',
            '.player-button',
            '.player-volume',
            '.player-time',
            '.player-actions',
            '.player-volume-reveal',
          ]
          return Object.fromEntries(
            selectors.map((selector) => {
              const element = document.querySelector(selector)
              if (!element) throw new Error('Missing player element: ' + selector)
              const computed = getComputedStyle(element)
              return [
                selector,
                Object.fromEntries(
                  properties.map((property) => [property, computed.getPropertyValue(property)])
                ),
              ]
            })
          )
        })
        await page.screenshot({ path: path.join(screens, name + '.png'), animations: 'disabled' })
      }
      const captureTheme = async (theme: string) => {
        await page.setViewportSize({ width: 1440, height: 900 })
        await captureStyles(theme + '-wide')
        await page.setViewportSize({ width: 800, height: 650 })
        await captureStyles(theme + '-narrow')
        const fits = await controls.evaluate((element) => {
          const stage = element.parentElement!.getBoundingClientRect()
          return [...element.querySelectorAll('button,input')]
            .filter((node) => getComputedStyle(node).display !== 'none')
            .every((node) => {
              const bounds = node.getBoundingClientRect()
              return (
                bounds.width === 0 ||
                (bounds.left >= stage.left - 1 && bounds.right <= stage.right + 1)
              )
            })
        })
        assert.equal(fits, true, theme + ': controls fit narrow stage')
        await controls.locator('button[aria-haspopup="dialog"]').click()
        const panel = page.locator('.player-settings')
        await panel.waitFor()
        await page.waitForFunction(
          () => getComputedStyle(document.querySelector('.player-settings')!).opacity === '1'
        )
        const contained = await panel.evaluate((element) => {
          const bounds = element.getBoundingClientRect(),
            stage = document.querySelector('.custom-video-stage')!.getBoundingClientRect()
          return (
            bounds.left >= stage.left - 1 &&
            bounds.right <= stage.right + 1 &&
            bounds.top >= stage.top - 1 &&
            bounds.bottom <= stage.bottom + 1
          )
        })
        assert.equal(contained, true, theme + ': settings fit narrow stage')
        await page.screenshot({
          path: path.join(screens, theme + '-narrow-settings.png'),
          animations: 'disabled',
        })
        await page.keyboard.press('Escape')
        await stage.press('f')
        await page.waitForFunction(() =>
          document.fullscreenElement?.classList.contains('video-viewer')
        )
        await captureStyles(theme + '-fullscreen')
        await stage.press('f')
        await page.waitForFunction(() => !document.fullscreenElement)
      }

      await captureTheme('dark')

      for (const theme of ['glass', 'paper'] as const) {
        await page.evaluate(
          (theme) => window.desktop.updateWorkspace({ action: 'appearance', theme, locale: 'en' }),
          theme
        )
        await page.reload()
        await page.waitForFunction(() => document.documentElement.lang === 'en')
        await page
          .getByRole('button', { name: 'Open project Player QA', exact: true })
          .first()
          .click()
        await page.locator('.mixed-media-browser').waitFor()
        await page.locator('.media-thumbnail').filter({ hasText: '01-first.mp4' }).click()
        await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 1)
        await stage.hover()
        await controls.getByRole('button', { name: 'Fullscreen', exact: true }).waitFor()
        await captureTheme(theme)
      }
      await fs.writeFile(path.join(root, 'computed-styles.json'), JSON.stringify(styles, null, 2))
      if (process.env.VIDEO_CSS_REFERENCE) {
        assert.deepEqual(
          styles,
          JSON.parse(await fs.readFile(process.env.VIDEO_CSS_REFERENCE, 'utf8')),
          'Player styles changed'
        )
      }
    },
  }

  try {
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.show()
      win.focus()
    })
    await page.bringToFront()
    await open()

    await page.locator('video').evaluate((element) => (element as HTMLVideoElement).pause())

    await openSettings()
    assert.equal(
      await settingsPanel.getByRole('switch', { name: '播完接下一部', exact: true }).isChecked(),
      false
    )
    await settingsPanel.getByRole('button', { name: '關閉播放設定', exact: true }).click()
    await settingsPanel.waitFor({ state: 'hidden' })

    await checks[group]()

    for (const [name, bytes] of originals)
      assert.deepEqual(await fs.readFile(path.join(media, name)), bytes)

    assert.deepEqual(await fs.readFile(folderFile(media)), record)

    assert.deepEqual(errors, [])

    console.log(
      'PASS ' +
        group +
        ' (' +
        ((Date.now() - started) / 1000).toFixed(1) +
        's); originals unchanged. Artifacts: ' +
        root
    )
  } catch (error) {
    await page.screenshot({ path: path.join(screens, 'failure.png') }).catch(() => {})
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
}
