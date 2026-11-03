import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Library } from '../electron/library'
import { WorkspaceStore } from '../electron/workspace'
import { folderFile, projectFile } from '../electron/files'
import { catalog } from '../src/i18n/catalog'
import type { LocaleId } from '../shared/locales'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'workspace-polish-')),
  local = path.join(root, 'local'),
  album = path.join(root, 'Album'),
  game = path.join(root, 'Games'),
  screens = path.join(root, 'screens')
await fs.mkdir(album)
await fs.mkdir(screens)
await fs.mkdir(path.join(game, 'Game', 'Game_Data'), { recursive: true })
for (const name of ['Game.exe', 'UnityPlayer.dll'])
  await fs.writeFile(path.join(game, 'Game', name), 'CONTROLLED')
const exec = promisify(execFile)
for (const [index, size] of ['800x1200', '1600x800', '300x3000'].entries())
  await exec(
    'ffmpeg',
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc=size=${size}:rate=1`,
      '-frames:v',
      '1',
      path.join(album, `${index + 1}.png`),
    ],
    { windowsHide: true }
  )
for (let i = 0; i < 140; i++)
  await fs.mkdir(
    path.join(
      album,
      `Folder-${String(i).padStart(3, '0')}-long-parent-name-for-path-search`,
      'Same-name'
    ),
    { recursive: true }
  )
const library = new Library(local, undefined, false)
await library.init()
await library.create(album, {
  name: 'Polish Album',
  scanAll: true,
  depth: { mode: 'through', level: 3 },
})
const snapshot = await library.create(game, {
  name: 'Polish Game',
  scanAll: true,
  depth: { mode: 'through', level: 3 },
})
const workspace = new WorkspaceStore(local, ['zh-TW'])
await workspace.init()
const ids = snapshot.projects.map((project) => project.projectId)
for (const linked of snapshot.projects) {
  const row = snapshot.rows.find(
    (row) => row.projectId === linked.projectId && row.path === linked.root
  )!
  await workspace.update(
    {
      action: 'browse',
      projectId: linked.projectId,
      value: {
        mode: 'CARD',
        location: '',
        widths: {},
        panelWidth: 420,
        panelVisible: true,
        contentMode: linked.root === game ? 'files' : 'folders',
        detailId: row.rowId,
      },
    },
    ids
  )
}
// A legacy original-size preference must open safely at the new height-fit baseline.
const albumRecord = JSON.parse(await fs.readFile(folderFile(album), 'utf8'))
albumRecord.details = { schemaVersion: 1, reading: { page: 0, fit: 'original' } }
await fs.writeFile(folderFile(album), JSON.stringify(albumRecord))
const originals = new Map<string, Buffer>()
for (const file of [
  path.join(album, '1.png'),
  path.join(album, '2.png'),
  path.join(album, '3.png'),
  path.join(game, 'Game', 'Game.exe'),
  folderFile(path.join(game, 'Game')),
  ...snapshot.projects.map((linked) => projectFile(linked.root, linked.projectId)),
])
  originals.set(file, await fs.readFile(file))
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
page.setDefaultTimeout(15000)
let locale: LocaleId = 'zh-TW'
const tr = (text: string) => catalog[locale][text] ?? text
const button = (text: string) => page.getByRole('button', { name: tr(text), exact: true })
const edit = async () => {
  if (await button('編輯版面').isVisible()) await button('編輯版面').click()
  else {
    await button('版面方案選單').click()
    await page.getByRole('menuitem', { name: tr('編輯版面'), exact: true }).click()
  }
}
const open = async (name: string) => {
  await page
    .getByRole('button', { name: tr('開啟專案 {0}').replace('{0}', name), exact: true })
    .first()
    .click()
  await page.waitForFunction(() =>
    document.querySelector('.statusbar')?.textContent?.includes('就緒')
  )
}
const fit = async (axis: 'width' | 'height') =>
  page.waitForFunction((axis) => {
    const stage = document.querySelector('.reader-stage')!.getBoundingClientRect(),
      image = document.querySelector('.is-active .reader-spread')!.getBoundingClientRect()
    return axis === 'width'
      ? Math.abs(image.left - stage.left) < 1 && Math.abs(image.right - stage.right) < 1
      : Math.abs(image.top - stage.top) < 1 && Math.abs(image.bottom - stage.bottom) < 1
  }, axis)
const resize = async (width: number, height = 860) => {
  await app.evaluate(
    ({ BrowserWindow }, { width, height }) => {
      const win = BrowserWindow.getAllWindows()[0]
      win.unmaximize()
      win.setMinimumSize(500, 400)
      win.setBounds({ width, height })
    },
    { width, height }
  )
}
try {
  await resize(1440)
  await page.evaluate(() => {
    window.confirm = () => true
  })
  await open('Polish Album')
  if (process.env.POLISH_SCOPE !== 'layout') {
    if (process.env.POLISH_SCOPE !== 'folders') {
      await page
        .locator('.gallery .media-thumbnail,.virtual-gallery .media-thumbnail')
        .first()
        .click()
      await page.locator('.is-active img').waitFor()
      await fit('height')
      assert.equal(await button('100%／原尺寸').count(), 0)
      for (const axis of ['width', 'height'] as const) {
        await button(axis === 'width' ? '寬度適應' : '高度適應').click()
        await fit(axis)
        await button('放大').click()
        await button('縮小').click()
        await button('重設縮放').click()
        await fit(axis)
      }
      // Batched wheel events cross the old scrollbar threshold without changing the fit base.
      await page.locator('.reader-stage').evaluate((element) => {
        const box = element.getBoundingClientRect()
        for (let i = 0; i < 12; i++)
          element.dispatchEvent(
            new WheelEvent('wheel', {
              deltaY: -60,
              clientX: box.left + box.width / 2,
              clientY: box.top + box.height / 2,
              bubbles: true,
              cancelable: true,
            })
          )
      })
      await page.waitForFunction(
        () =>
          Number(document.querySelector('.reader-zoom-value')?.textContent?.replace('%', '')) > 250
      )
      const geometry = await page.locator('.reader-stage').evaluate((element) => {
        const stage = element.getBoundingClientRect(),
          image = element.querySelector('.is-active .reader-spread')!.getBoundingClientRect()
        return {
          width: stage.width,
          height: stage.height,
          top: image.top,
          left: image.left,
          imageHeight: image.height,
        }
      })
      await page.waitForTimeout(250)
      assert.deepEqual(
        await page.locator('.reader-stage').evaluate((element) => {
          const stage = element.getBoundingClientRect(),
            image = element.querySelector('.is-active .reader-spread')!.getBoundingClientRect()
          return {
            width: stage.width,
            height: stage.height,
            top: image.top,
            left: image.left,
            imageHeight: image.height,
          }
        }),
        geometry,
        'geometry must settle without scrollbar feedback'
      )
      assert.ok(
        await page.locator('.reader-stage').evaluate((element) => {
          const stage = element.getBoundingClientRect(),
            image = element.querySelector('.is-active .reader-spread')!.getBoundingClientRect()
          return (
            Math.abs((image.top + image.bottom - stage.top - stage.bottom) / 2) < 1 &&
            Math.abs((image.left + image.right - stage.left - stage.right) / 2) < 1
          )
        }),
        'the center anchor must survive batched zoom'
      )
      const bounds = (await page.locator('.reader-stage').boundingBox())!
      const before = await page.locator('.reader-stage').evaluate((element) => element.scrollTop)
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.6)
      await page.mouse.down()
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.4)
      await page.mouse.up()
      assert.ok(
        (await page.locator('.reader-stage').evaluate((element) => element.scrollTop)) > before
      )
      await button('重設縮放').click()
      await fit('height')
      for (const number of ['2', '3']) {
        await button('下一頁').click()
        await page.waitForFunction(
          (number) => document.querySelector('.is-active')?.getAttribute('data-pages') === number,
          number
        )
        await fit('height')
        await button('寬度適應').click()
        await fit('width')
        await resize(800, 700)
        await fit('width')
        await resize(1440)
        await fit('width')
        await button('高度適應').click()
      }
      await button('沉浸閱讀').click()
      await page.waitForFunction(() => !!document.fullscreenElement)
      await fit('height')
      await page.keyboard.press('Escape')
      await page.waitForFunction(() => !document.fullscreenElement)
      await fit('height')
      await page.screenshot({ path: path.join(screens, 'image-reader.png') })
      await button('退出閱讀器').click()
      // A closed content pane immediately unloads the reader/media; its space can animate.
      await button('關閉資料夾內容').click()
      await page.waitForFunction(
        () => document.querySelector('.content-panel-slot')!.getBoundingClientRect().width === 0
      )
      assert.equal(await page.locator('.folder-panel').count(), 0)
      await button('切換右側內容').click()
      await page.locator('.folder-panel').waitFor()
      for (let i = 0; i < 4; i++) {
        await button('切換右側內容').click()
        await button('切換右側內容').click()
      }
      await page.waitForFunction(
        () => document.querySelector('.content-panel-slot')!.getBoundingClientRect().width > 400
      )
      await button('切換專案欄').click()
      await page.waitForFunction(
        () => document.querySelector('.sidebar-slot')!.getBoundingClientRect().width === 0
      )
      assert.equal(
        await page.locator('.sidebar-slot').evaluate((element) => (element as HTMLElement).inert),
        true
      )
      await button('切換專案欄').click()
      await page.waitForFunction(
        () => document.querySelector('.sidebar-slot')!.getBoundingClientRect().width > 200
      )
      const leftResize = page.getByRole('separator', { name: '調整專案欄寬', exact: true })
      await leftResize.press('End')
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="調整專案欄寬"]')?.getAttribute('aria-valuenow') ===
          '360'
      )
      await leftResize.press('Home')
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="調整專案欄寬"]')?.getAttribute('aria-valuenow') ===
          '200'
      )
      const rightResize = (await page
        .getByRole('separator', { name: '調整資料夾內容寬度', exact: true })
        .boundingBox())!
      await page.mouse.move(rightResize.x + 2, rightResize.y + 100)
      await page.mouse.down()
      await page.mouse.move(rightResize.x - 58, rightResize.y + 100)
      await page.mouse.up()
      assert.ok(
        (await page
          .locator('.content-panel-slot')
          .evaluate((element) => element.getBoundingClientRect().width)) > 450
      )
      await button('放大內容區').click()
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('.content-expanded').count(), 0)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      assert.equal(
        await page
          .locator('.sidebar-slot')
          .evaluate((element) => getComputedStyle(element).transitionDuration),
        '0s'
      )
      assert.equal(
        await page
          .locator('.content-panel-slot')
          .evaluate((element) => getComputedStyle(element).transitionDuration),
        '0s'
      )
      await page.emulateMedia({ reducedMotion: 'no-preference' })
    }
    // Long paths and duplicate names remain compact, searchable and keyboard operable.
    await page.locator('[aria-label="展示內容"]').getByText('檔案', { exact: true }).click()
    const picker = page.getByRole('textbox', { name: '檔案總覽範圍資料夾', exact: true })
    await picker.click()
    await picker.fill('no-such-folder-__')
    await page.getByText('找不到符合的資料夾', { exact: true }).waitFor()
    await picker.click()
    await picker.fill('Same-name')
    await page.getByRole('option').first().waitFor()
    assert.equal(await page.getByRole('option').count(), 100)
    assert.ok((await page.getByRole('option').first().boundingBox())!.height < 65)
    assert.ok(
      await page.locator('.overview-folder-dropdown').evaluate((element) => {
        const dropdown = element.getBoundingClientRect()
        return [...element.querySelectorAll('.overview-folder-option')].every(
          (option) => option.getBoundingClientRect().right <= dropdown.right
        )
      }),
      'long paths must ellipsize within the dropdown, not extend its internal table'
    )
    await picker.fill('Folder-139')
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('[role=option]')].filter(
          (element) => element.getBoundingClientRect().height > 0
        ).length === 2
    )
    await picker.press('ArrowDown')
    await page.getByRole('tooltip').filter({ hasText: 'Folder-139' }).waitFor()
    await picker.press('Enter')
    await page.getByRole('listbox').waitFor({ state: 'hidden' })
    await page.waitForFunction(() =>
      document
        .querySelector<HTMLInputElement>('[aria-label="檔案總覽範圍資料夾"]')
        ?.title.includes('Folder-139')
    )
    await resize(800, 700)
    // At this width the open right panel becomes an overlay with a scrim over the toolbar.
    if (await button('關閉資料夾內容').isVisible()) await button('關閉資料夾內容').click()
    await picker.click()
    await picker.fill('Same-name')
    await page.getByRole('option').first().waitFor()
    assert.ok((await page.getByRole('listbox').boundingBox())!.height <= 310)
    await page.screenshot({ path: path.join(screens, 'folder-picker.png') })
    await picker.press('Escape')
    await resize(1440)
    await page.locator('[aria-label="展示內容"]').getByText('資料夾', { exact: true }).click()
  }
  if (process.env.POLISH_SCOPE !== 'folders') {
    for (const [theme, index] of ['dark', 'glass', 'paper'].map(
      (theme, index) => [theme, index] as const
    )) {
      await button('應用程式設定').click()
      await page.locator('.theme-option').nth(index).click()
      await page.keyboard.press('Escape')
      await page.locator('[role=dialog]').waitFor({ state: 'hidden' })
      await edit()
      await page.locator('.scheme-toolbar').waitFor()
      const rects = await page.locator('.scheme-toolbar').evaluate((element) =>
        [...element.querySelectorAll('input,button')].map((item) => {
          const rect = item.getBoundingClientRect()
          return { height: rect.height, bottom: rect.bottom }
        })
      )
      assert.ok(
        rects
          .filter((rect) => rect.height > 0)
          .every(
            (rect) => Math.abs(rect.height - 36) < 1 && Math.abs(rect.bottom - rects[0].bottom) < 1
          )
      )
      await page.screenshot({ path: path.join(screens, `scheme-${theme}.png`) })
      await page.keyboard.press('Escape')
      await page.keyboard.press('Control+k')
      await page.locator('.folder-search-dialog').waitFor()
      await page.locator('.search-footer button').first().focus()
      assert.equal(
        await page
          .locator('.search-footer')
          .evaluate((element) => getComputedStyle(element).position),
        'static'
      )
      await page.screenshot({ path: path.join(screens, `search-${theme}.png`) })
      await page.keyboard.press('Escape')
    }
    // Check translated controls and wrapping in the editor/search at a narrow width.
    for (const next of ['ja', 'zh-CN', 'en', 'es', 'zh-TW'] as const) {
      await button('應用程式設定').click()
      await page.getByRole('textbox', { name: tr('介面語言'), exact: true }).click()
      await page
        .getByRole('option', {
          name: {
            ja: '日本語',
            'zh-CN': '简体中文',
            en: 'English',
            es: 'Español',
            'zh-TW': '繁體中文',
          }[next],
          exact: true,
        })
        .click()
      locale = next
      await page.keyboard.press('Escape')
      await resize(800, 700)
      if (await button('關閉資料夾內容').isVisible()) await button('關閉資料夾內容').click()
      await edit()
      await page.locator('.scheme-toolbar').waitFor()
      await button('新增方案').click()
      await page
        .getByRole('textbox', { name: tr('方案名稱'), exact: true })
        .fill('Long scheme name · 長方案名稱 '.repeat(3))
      await button('確認').click()
      const visible = await page.locator('.scheme-toolbar').evaluate((element) =>
        [...element.querySelectorAll('input,button')]
          .filter((item) => item.getBoundingClientRect().height > 0)
          .every((item) => {
            const rect = item.getBoundingClientRect()
            return rect.left >= 0 && rect.right <= innerWidth
          })
      )
      assert.ok(visible)
      await page.keyboard.press('Escape')
      await page.keyboard.press('Control+k')
      await page.locator('.folder-search-dialog').waitFor()
      assert.ok(
        await page.locator('.search-footer button').evaluateAll((elements) =>
          elements.every((element) => {
            const rect = element.getBoundingClientRect()
            return rect.left >= 0 && rect.right <= innerWidth
          })
        )
      )
      await page.locator('.search-footer button').first().focus()
      await page.screenshot({ path: path.join(screens, `search-${next}-narrow.png`) })
      await page.keyboard.press('Escape')
      await resize(1440)
    }
  }
  await open('Polish Game')
  assert.equal(await page.locator('[aria-label="展示內容"]').count(), 0)
  assert.equal(await page.locator('.file-overview').count(), 0)
  await page.reload()
  await page.getByRole('button', { name: '開啟專案 Polish Game', exact: true }).first().waitFor()
  await open('Polish Game')
  assert.equal(await page.locator('.file-overview').count(), 0)
  await open('Polish Album')
  assert.equal(await page.locator('[aria-label="展示內容"]').count(), 1)
  for (const [file, bytes] of originals) assert.deepEqual(await fs.readFile(file), bytes, file)
  await assert.rejects(fs.access(path.join(game, 'Game', 'Game_Data', '.media-viewer')))
  assert.deepEqual(errors, [])
  console.log(
    'PASS ' +
      (process.env.POLISH_SCOPE ?? 'all') +
      ': ' +
      (process.env.POLISH_SCOPE === 'folders'
        ? 'compact searchable folders and keyboard path hints'
        : process.env.POLISH_SCOPE === 'layout'
          ? 'three themes/five languages and long scheme names'
          : 'stable album fit/zoom/pan/resize, compact searchable folders, pane lifecycle/reduced motion, three themes/five languages') +
      '; game fallback; unchanged originals/project records. ' +
      screens
  )
} catch (error) {
  await page.screenshot({ path: path.join(screens, 'failure.png') }).catch(() => {})
  console.error('ARTIFACTS ' + root)
  console.error(
    await page.locator('.overview-folder-dropdown').evaluateAll((elements) =>
      elements.flatMap((element) =>
        [element, ...element.querySelectorAll('div,span,strong,small')]
          .slice(0, 12)
          .map((item) => ({
            tag: item.tagName,
            cls: item.className,
            style: item.getAttribute('style'),
            display: getComputedStyle(item).display,
            width: getComputedStyle(item).width,
            left: item.getBoundingClientRect().left,
            right: item.getBoundingClientRect().right,
          }))
      )
    )
  )
  console.error(
    await page.locator('[role=option]').evaluateAll((elements) =>
      elements.map((element) => ({
        text: element.textContent,
        role: element.getAttribute('role'),
        height: element.getBoundingClientRect().height,
      }))
    )
  )
  throw error
} finally {
  await app
    .evaluate(({ BrowserWindow }) => {
      for (const win of BrowserWindow.getAllWindows()) win.destroy()
    })
    .catch(() => {})
  await app.close().catch(() => {})
}
