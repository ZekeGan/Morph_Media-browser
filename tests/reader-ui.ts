import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Library } from '../electron/library'
import { closeApp } from './support/app'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'reader-ui-')),
  comic = path.join(root, 'Comic'),
  local = path.join(root, 'local')
await fs.mkdir(comic)
const exec = promisify(execFile)
for (let i = 1; i <= 3; i++)
  await exec(
    'ffmpeg',
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `color=c=${['#526c85', '#ac997f', '#758576'][i - 1]}:s=100x160`,
      '-frames:v',
      '1',
      path.join(comic, String(i).padStart(3, '0') + '.png'),
    ],
    { windowsHide: true }
  )
for (let i = 4; i <= 16; i++)
  await fs.copyFile(
    path.join(comic, '001.png'),
    path.join(comic, String(i).padStart(3, '0') + '.png')
  )
const library = new Library(local, undefined, false)
await library.init()
await library.create(comic, {
  name: 'Reader test',
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
  errors: string[] = []
page.setDefaultTimeout(12000)
page.on('pageerror', (error) => errors.push(error.message))
await page.evaluate('window.__name=(target)=>target')
const waitPages = async (value: string) =>
  page.waitForFunction(
    (pages) =>
      document.querySelector('.reader-frame-layer.is-active')?.getAttribute('data-pages') === pages,
    value
  )
const reader = () => page.getByRole('dialog', { name: '漫畫閱讀器', exact: true })
const fit = async () =>
  page.waitForFunction(() => {
    const stage = document.querySelector('.reader-stage')!,
      image = document.querySelector('.is-active .reader-spread')!,
      toolbar = document.querySelector('.reader-toolbar'),
      info = document.querySelector('.reader-info'),
      box = stage.getBoundingClientRect(),
      picture = image.getBoundingClientRect()
    return (
      Math.abs(picture.top - box.top) < 1 &&
      Math.abs(picture.bottom - box.bottom) < 1 &&
      (!toolbar || Math.abs(toolbar.getBoundingClientRect().bottom - box.top) < 1) &&
      (!info || Math.abs(info.getBoundingClientRect().top - box.bottom) < 1)
    )
  })
const native = () =>
  app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    return { bounds: win.getBounds(), fullscreen: win.isFullScreen(), maximized: win.isMaximized() }
  })
const fullscreen = async (value: boolean) => {
  await page.waitForFunction((expected) => !!document.fullscreenElement === expected, value)
  await page.waitForTimeout(100)
}
const sameBounds = (
  actual: { x: number; y: number; width: number; height: number },
  expected: typeof actual
) => {
  for (const key of ['x', 'y', 'width', 'height'] as const)
    assert.ok(
      Math.abs(actual[key] - expected[key]) <= 2,
      `${key}: ${actual[key]} versus ${expected[key]}`
    )
}
try {
  await page.getByRole('button', { name: '開啟專案 Reader test', exact: true }).first().click()
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.unmaximize()
    win.setMinimumSize(500, 400)
    win.setBounds({ width: 1000, height: 760 })
  })
  await page.locator('.manga-gallery .media-thumbnail').first().click()
  await waitPages('1')
  await fit()
  assert.ok((await reader().locator('.is-active img').first().boundingBox())!.height > 160)
  for (let i = 2; i <= 12; i++) {
    await reader().getByRole('button', { name: '下一頁', exact: true }).click()
    await waitPages(String(i))
  }
  const input = reader().getByRole('textbox', { name: '頁碼', exact: true }),
    inputBox = (await input.boundingBox())!
  await page.mouse.click(inputBox.x + inputBox.width - 2, inputBox.y + inputBox.height / 2)
  await page.getByRole('listbox', { name: '頁碼', exact: true }).waitFor({ state: 'visible' })
  await page.getByRole('option', { name: '3', exact: true }).click()
  await waitPages('3')
  await page.keyboard.press('ArrowLeft')
  await waitPages('4')
  await reader().getByRole('button', { name: '上一頁', exact: true }).click()
  await waitPages('3')
  await page.keyboard.press('g')
  await input.fill('8')
  await page.getByRole('option', { name: '8', exact: true }).click()
  await waitPages('8')
  await page.keyboard.press('ArrowLeft')
  await waitPages('9')
  for (let i = 0; i < 3; i++)
    await reader().getByRole('button', { name: '下一頁', exact: true }).click()
  await waitPages('12')
  await reader().getByRole('button', { name: '雙頁', exact: true }).click()
  await waitPages('11–12')
  const prevPath = await reader()
      .locator('.reader-tool-group')
      .first()
      .getByRole('button')
      .first()
      .locator('path')
      .getAttribute('d'),
    nextPath = await reader()
      .locator('.reader-tool-group')
      .first()
      .getByRole('button')
      .last()
      .locator('path')
      .getAttribute('d')
  await reader().getByRole('button', { name: '由右至左', exact: true }).click()
  await reader().getByRole('button', { name: '由左至右', exact: true }).waitFor()
  await page.keyboard.press('ArrowRight')
  await waitPages('13–14')
  await page.keyboard.press('ArrowLeft')
  await waitPages('11–12')
  assert.equal(
    await reader()
      .locator('.reader-tool-group')
      .first()
      .getByRole('button')
      .first()
      .locator('path')
      .getAttribute('d'),
    prevPath
  )
  assert.equal(
    await reader()
      .locator('.reader-tool-group')
      .first()
      .getByRole('button')
      .last()
      .locator('path')
      .getAttribute('d'),
    nextPath
  )
  assert.equal(
    await reader()
      .locator('.reader-stage')
      .evaluate((element) => getComputedStyle(element).outlineStyle),
    'none'
  )
  await fit()
  assert.equal(
    await reader().evaluate((element) =>
      getComputedStyle(element).getPropertyValue('-webkit-app-region')
    ),
    'no-drag'
  )
  await reader()
    .getByRole('button', { name: '放大', exact: true })
    .click({ position: { x: 3, y: 3 } })
  await page.waitForFunction(
    () => document.querySelector('.reader-zoom-value')?.textContent === '125%'
  )
  await reader()
    .getByRole('button', { name: '縮小', exact: true })
    .click({ position: { x: 30, y: 30 } })
  await fit()
  await page.keyboard.press('+')
  await page.keyboard.press('r')
  await fit()
  const clickStage = async (left: boolean) => {
    const box = (await reader().locator('.reader-stage').boundingBox())!
    await page.mouse.click(box.x + box.width * (left ? 0.2 : 0.8), box.y + box.height / 2)
  }
  await clickStage(false)
  await waitPages('13–14')
  await clickStage(true)
  await waitPages('11–12')
  await reader().locator('.reader-stage').hover()
  await page.mouse.wheel(0, 400)
  await fit()
  await page.mouse.wheel(0, -400)
  await page.waitForFunction(
    () =>
      document.querySelector('.is-active .reader-spread')!.getBoundingClientRect().height >
      document.querySelector('.reader-stage')!.getBoundingClientRect().height * 1.5
  )
  const beforePan = await reader()
      .locator('.reader-stage')
      .evaluate((element) => element.scrollTop),
    stageBox = (await reader().locator('.reader-stage').boundingBox())!
  await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height * 0.7)
  await page.mouse.down()
  await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height * 0.4)
  await page.mouse.up()
  assert.ok(
    (await reader()
      .locator('.reader-stage')
      .evaluate((element) => element.scrollTop)) > beforePan
  )
  await reader().getByRole('button', { name: '重設縮放', exact: true }).click()
  await fit()
  await page.keyboard.press('+')
  await page.waitForFunction(
    () =>
      document.querySelector('.is-active .reader-spread')!.getBoundingClientRect().height >
      document.querySelector('.reader-stage')!.getBoundingClientRect().height * 1.2
  )
  await reader().getByRole('button', { name: '重設縮放', exact: true }).click()
  await fit()
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 600, height: 700 })
  )
  await fit()
  await page.screenshot({ path: path.join(root, 'reader-narrow.png') })
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1000, height: 760 })
  )
  await fit()
  await page.waitForTimeout(100)
  const before = await native()
  assert.equal(before.fullscreen, false)
  await reader().getByRole('button', { name: '沉浸閱讀', exact: true }).click()
  await fullscreen(true)
  assert.equal((await native()).fullscreen, true)
  assert.equal(await reader().locator('.reader-toolbar,.reader-info,.reader-close').count(), 0)
  await fit()
  await page.screenshot({ path: path.join(root, 'reader-fullscreen.png') })
  // R-262/R-263: the left edge slides in the tool rail, the bottom edge the progress bar.
  const viewportSize =
    page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
  await page.mouse.move(4, viewportSize.height / 2)
  await page.waitForTimeout(400)
  assert.equal(
    await reader().getByRole('navigation', { name: '閱讀工具', exact: true }).isVisible(),
    true
  )
  await page.screenshot({ path: path.join(root, 'reader-rail.png') })
  await page.mouse.move(viewportSize.width / 2, viewportSize.height - 4)
  await page.waitForTimeout(400)
  const progress = reader().getByRole('group', { name: '閱讀進度', exact: true })
  await progress.locator('.reader-progress-track').hover({ position: { x: 40, y: 10 } })
  await page.waitForTimeout(200)
  assert.equal(await progress.locator('.reader-progress-preview img').count(), 1)
  await page.screenshot({ path: path.join(root, 'reader-progress.png') })
  await page.mouse.move(viewportSize.width / 2, viewportSize.height / 2)
  await page.keyboard.press('Escape')
  await fullscreen(false)
  await reader().getByRole('button', { name: '沉浸閱讀', exact: true }).waitFor()
  await fit()
  sameBounds((await native()).bounds, before.bounds)
  await page.keyboard.press('F11')
  await fullscreen(true)
  await page.keyboard.press('F11')
  await fullscreen(false)
  await reader().waitFor()
  await page.keyboard.press('t')
  await fullscreen(true)
  await page.mouse.move(10, 2)
  await page.waitForTimeout(300)
  assert.equal(await reader().locator('.reader-toolbar,.reader-info,.reader-close').count(), 0)
  await fit()
  await page.keyboard.press('t')
  await fullscreen(false)
  await reader().getByRole('button', { name: '退出閱讀器', exact: true }).click()
  await reader().waitFor({ state: 'hidden' })
  await fullscreen(false)
  sameBounds((await native()).bounds, before.bounds)
  await page.waitForFunction(() =>
    document.querySelector('.statusbar')?.textContent?.includes('就緒')
  )
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].maximize())
  await page.locator('.manga-gallery .media-thumbnail').first().click()
  await waitPages('1–2')
  await page.keyboard.press('F11')
  await fullscreen(true)
  await page.keyboard.press('Escape')
  await fullscreen(false)
  assert.equal((await native()).maximized, true)
  await page.keyboard.press('Escape')
  await reader().waitFor({ state: 'hidden' })
  assert.deepEqual(errors, [])
  assert.equal(
    await page.evaluate(
      async () => (await navigator.permissions.query({ name: 'geolocation' })).state
    ),
    'denied'
  )
  console.log(
    'PASS: windowed/maximized fullscreen restore; fit-height minimum, detail zoom and pan; immersive stays hidden on hover; stable RTL chevrons and stage focus; whole-select hit area; page selection followed by arrows, repeated next and spreads. Artifacts: ' +
      root
  )
} catch (error) {
  await page.screenshot({ path: path.join(root, 'failure.png') }).catch(() => {})
  console.error('Artifacts: ' + root)
  console.error(
    await page.evaluate(() => ({
      active: document.activeElement?.outerHTML?.slice(0, 250),
      fullscreen: !!document.fullscreenElement,
      reader: document.querySelector('.reader')?.textContent,
      images: [...document.querySelectorAll('.reader-frame-layer')].map((element) => ({
        class: element.className,
        pages: element.getAttribute('data-pages'),
      })),
    }))
  )
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
