import { _electron as electron } from 'playwright-core'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../electron/library'
import { WorkspaceStore } from '../electron/workspace'
import { folderFile, projectFile } from '../electron/files'
import { tinyPng } from './support/archive-fixture'
import { videoFixture } from './support/video-fixture'
import { closeApp } from './support/app'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'file-overview-large-')),
  local = path.join(root, 'local'),
  screens = path.join(root, 'screens')
await fs.mkdir(screens)
const count = 1200,
  video = await videoFixture(),
  library = new Library(local, undefined, false)
await library.init()
const workspace = new WorkspaceStore(local, ['zh-TW'])
await workspace.init()
const originals = new Map<string, Buffer>(),
  names = new Map<string, string[]>()
const projects = []
for (const category of ['album', 'video'] as const) {
  const media = path.join(root, category),
    name = category === 'album' ? '圖片大量 QA' : '影片大量 QA'
  await fs.mkdir(media)
  for (let start = 0; start < count; start += 32)
    await Promise.all(
      Array.from({ length: Math.min(32, count - start) }, async (_, offset) => {
        const file = path.join(
          media,
          `item-${String(start + offset).padStart(4, '0')}.${category === 'album' ? 'png' : 'mp4'}`
        )
        if (category === 'album') await fs.writeFile(file, tinyPng)
        else await fs.copyFile(video, file)
        if ([0, Math.floor(count / 2), count - 1].includes(start + offset))
          originals.set(file, await fs.readFile(file))
      })
    )
  let snapshot = await library.create(media, {
    name,
    depth: { mode: 'through', level: 1 },
  })
  const linked = snapshot.projects.at(-1)!,
    project = linked.project!
  snapshot = await library.saveProject(project)
  const row = snapshot.rows.find(
    (row) => row.projectId === project.projectId && row.path === media
  )!
  const ids = snapshot.projects.map((project) => project.projectId)
  await workspace.read(ids)
  await workspace.update(
    {
      action: 'browse',
      projectId: project.projectId,
      value: {
        mode: 'CARD',
        location: '',
        widths: {},
        panelWidth: 420,
        panelVisible: false,
        contentMode: 'files',
        filePresentation: 'tiles',
        fileScope: 'descendants',
        detailId: row.rowId,
      },
    },
    ids
  )
  for (const file of [folderFile(media), projectFile(media, project.projectId)])
    originals.set(file, await fs.readFile(file))
  names.set(media, (await fs.readdir(media)).sort())
  projects.push({ category, name })
}
const env: Record<string, string> = Object.fromEntries(
  Object.entries({ ...process.env, MEDIA_VIEWER_TEST_DATA: local }).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  )
)
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, timeout: 30000 }),
  page = await app.firstWindow(),
  errors: string[] = []
page.on('pageerror', (error) => errors.push(error.message))
page.setDefaultTimeout(20000)
await page.setViewportSize({ width: 1440, height: 900 })
const presentationChoice = async (name: string) => {
  const short: Record<string, string> = {
    平鋪縮圖: '縮圖',
    依來源分組: '分組',
    完整路徑清單: '清單',
  }
  await page
    .getByRole('radiogroup', { name: '檔案總覽展示方式', exact: true })
    .getByText(short[name], { exact: true })
    .click()
}
const choose = async (label: string, option: string) => {
  await page.getByRole('textbox', { name: label, exact: true }).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
const healthy = async () => {
  assert.deepEqual(errors, [], 'scrolling must not crash the renderer')
  assert.equal(await page.locator('.titlebar').count(), 1)
  assert.ok(
    (await page.locator('.file-overview-item').count()) > 0,
    'visible files must remain rendered'
  )
  assert.ok((await page.locator('.file-overview-item').count()) < 150, 'DOM must stay bounded')
  assert.ok(
    (await page.locator('.file-overview-scroll').evaluate((element) => element.clientHeight)) > 100
  )
  assert.ok(
    await page.locator('.file-overview-scroll').evaluate((element) => {
      const viewport = element.getBoundingClientRect()
      return [...element.querySelectorAll('.file-overview-item')].some((item) => {
        const bounds = item.getBoundingClientRect()
        return (
          bounds.bottom > viewport.top &&
          bounds.top < viewport.bottom &&
          bounds.right > viewport.left &&
          bounds.left < viewport.right
        )
      })
    }),
    'the viewport must contain visible files, not only offscreen DOM'
  )
}
// A burst during paging also exercises React's deferred state updater. Native
// scroll events can arrive faster than React commits a large list update.
const burst = async () => {
  await page.locator('.file-overview-scroll').evaluate((element) => {
    for (let index = 0; index < 30; index++) {
      element.scrollTop = index % 2 ? 0 : element.scrollHeight
      element.dispatchEvent(new Event('scroll'))
    }
  })
  await page.waitForTimeout(100)
  // Deferred updates may leave a short blank frame; a persistent blank still fails the wait.
  await page.waitForFunction(() => document.querySelector('.file-overview-item'))
  await healthy()
}
try {
  await page.getByRole('heading', { name: '你的資料夾，你的瀏覽方式' }).waitFor()
  for (const { category, name } of projects) {
    await page
      .getByRole('button', { name: '開啟專案 ' + name, exact: true })
      .first()
      .click()
    await page.locator('.file-overview-item').first().waitFor()
    await burst()
    await page.waitForFunction(
      (total) =>
        document.querySelector('.file-overview')?.textContent?.includes(`已找到 ${total} 個檔案`) &&
        !document.querySelector('.file-overview .mantine-Loader-root'),
      count
    )
    for (const presentation of ['平鋪縮圖', '依來源分組', '完整路徑清單']) {
      await presentationChoice(presentation)
      await burst()
      for (const fraction of [1, 0.5, 0]) {
        await page.locator('.file-overview-scroll').evaluate((element, fraction) => {
          element.scrollTop = (element.scrollHeight - element.clientHeight) * fraction
        }, fraction)
        await page.waitForTimeout(100)
        await healthy()
      }
      await page
        .locator('.file-overview-scroll')
        .evaluate((element) => (element.scrollTop = element.scrollHeight))
      await page.waitForTimeout(100)
      await choose('檔案類型', '其他')
      await page.getByText('此範圍沒有可顯示的檔案', { exact: true }).waitFor()
      await choose('檔案類型', category === 'album' ? '圖片' : '影片')
      await page.locator('.file-overview-item').first().waitFor()
      await healthy()
    }
    await presentationChoice('平鋪縮圖')
    for (const size of [
      { width: 800, height: 650 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(size)
      await page.waitForTimeout(100)
      await burst()
    }
    await page.getByRole('button', { name: '重新整理', exact: true }).click()
    await page.locator('.file-overview-item').first().waitFor()
    await burst()
    await page.screenshot({ path: path.join(screens, category + '.png') })
    console.log(
      `PASS ${category}: ${count} files; paging, scroll bursts, three presentations, filters, resize and refresh`
    )
  }
  for (const [file, bytes] of originals)
    assert.deepEqual(await fs.readFile(file), bytes, 'modified original: ' + file)
  for (const [media, expected] of names)
    assert.deepEqual((await fs.readdir(media)).sort(), expected)
  assert.deepEqual(errors, [])
  console.log('PASS original media and portable records unchanged; ' + screens)
} catch (error) {
  await page.screenshot({ path: path.join(screens, 'failure.png') }).catch(() => {})
  console.error('ARTIFACTS', root, 'RENDERER ERRORS', errors)
  throw error
} finally {
  await app
    .evaluate(({ BrowserWindow }) => {
      for (const win of BrowserWindow.getAllWindows()) win.destroy()
    })
    .catch(() => {})
  await closeApp(app).catch(() => {})
}
