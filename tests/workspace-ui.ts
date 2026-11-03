import { _electron as electron, type Locator } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Library } from '../electron/library'
import { createHash } from 'node:crypto'
import { DATA_DIR } from '../shared/model'
import { folderFile } from '../electron/files'
import packageInfo from '../package.json'
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'workspace05-')),
  local = path.join(root, 'local'),
  album = path.join(root, 'Album'),
  game = path.join(root, 'Games'),
  video = path.join(root, 'Video'),
  fresh = path.join(root, 'Fresh'),
  screens = path.join(base, 'workspace05-screens')
for (const p of [
  path.join(album, 'A', 'B'),
  path.join(album, 'C'),
  path.join(game, 'Game', 'Game_Data'),
  video,
  fresh,
  screens,
])
  await fs.mkdir(p, { recursive: true })
const exec = promisify(execFile)
for (const ext of ['png', 'jpg', 'webp', 'gif', 'bmp', 'avif', 'ico'])
  await exec(
    'ffmpeg',
    [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=32x32:rate=1',
      '-frames:v',
      '1',
      ...(ext === 'avif'
        ? ['-c:v', 'libaom-av1', '-cpu-used', '8', '-still-picture', '1', '-pix_fmt', 'yuv420p']
        : []),
      path.join(album, '測試.' + ext),
    ],
    { windowsHide: true }
  )
await exec(
  'ffmpeg',
  [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=160x90:r=12',
    '-t',
    '2',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    path.join(video, 'sample.mp4'),
  ],
  { windowsHide: true }
)
for (const name of ['Game.exe', 'UnityPlayer.dll'])
  await fs.writeFile(path.join(game, 'Game', name), 'ORIGINAL')
const lib = new Library(local, undefined, false)
await lib.init()
const input = { depth: { mode: 'through' as const, level: 1 }, scanAll: true }
await lib.create(album, { ...input, name: '相簿收藏' })
await lib.create(game, { ...input, name: '遊戲收藏' })
await lib.create(video, { ...input, name: '影片收藏' })
const env: Record<string, string> = Object.fromEntries(
  Object.entries({ ...process.env, MEDIA_VIEWER_TEST_DATA: local }).filter(
    (e): e is [string, string] => e[1] !== undefined
  )
)
delete env.ELECTRON_RUN_AS_NODE
const app = await electron.launch({ args: ['.'], env, timeout: 30000 }),
  page = await app.firstWindow(),
  errors: string[] = []
page.on('pageerror', (e) => errors.push(e.message))
page.setDefaultTimeout(15000)
const open = async (name: string) => {
  await page
    .getByRole('button', { name: '開啟專案 ' + name, exact: true })
    .first()
    .click()
  await page.locator('.center-pane').waitFor()
  await page.waitForFunction(() =>
    document.querySelector('.statusbar')?.textContent?.includes('就緒')
  )
}
// HTML5 drag-and-drop through real mouse moves; a single dragTo can miss the drop target, so retry until it lands.
const dragUntil = async (source: Locator, target: Locator, landed: () => Promise<boolean>) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const from = (await source.boundingBox())!,
      to = (await target.boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 8, { steps: 4 })
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 })
    await page.mouse.up()
    for (let wait = 0; wait < 10; wait++) {
      if (await landed()) return
      await page.waitForTimeout(100)
    }
  }
  assert.ok(await landed(), 'drag did not land')
}
const card = (name: string) =>
  page
    .locator('.folder-card')
    .filter({ has: page.locator('.cell-name').filter({ hasText: new RegExp('^' + name + '$') }) })
const mode = async (name: string) => {
  await page
    .locator('.center-mode')
    .getByText(
      ({ CARD: '卡片', TABLE: '表格', TREE: '樹狀圖' } as Record<string, string>)[name] ?? name,
      { exact: true }
    )
    .click()
}
const header = () => page.locator('.folder-panel-header strong')
try {
  await page.getByRole('heading', { name: '你的資料夾，你的瀏覽方式' }).waitFor()
  await page.evaluate(() => {
    window.confirm = () => true
  })
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), packageInfo.version)
  await open('相簿收藏')
  await header().getByText('Album', { exact: true }).waitFor()
  for (let i = 0; i < 7; i++) {
    const tile = page.locator('.media-thumbnail').nth(i)
    await tile.scrollIntoViewIfNeeded()
    await tile.locator('img').waitFor()
    await page.waitForFunction((index) => {
      const img = document.querySelectorAll('.media-thumbnail')[index]?.querySelector('img')
      return !!img && img.complete && img.naturalWidth > 0
    }, i)
  }
  const formats = await page.evaluate(async () => {
    const s = (await window.media.request({ action: 'snapshot' })).snapshot,
      row = s.structure!.find((r) => r.path.endsWith('Album'))!,
      content = (await window.explorer.request({ action: 'content', rowId: row.rowId })).content!
    return Promise.all(
      content.entries
        .filter((e) => e.kind === 'image')
        .map(async (e) => {
          const thumb = await fetch(e.thumb!)
          return {
            name: e.name,
            thumb: thumb.status,
            bytes: (await thumb.arrayBuffer()).byteLength,
          }
        })
    )
  })
  assert.ok(
    formats.every((f) => f.thumb === 200 && f.bytes > 10),
    JSON.stringify(formats)
  )
  console.log('PASS original and thumbnail decode: PNG/JPEG/WebP/GIF/BMP/AVIF/ICO', formats)
  const stat = await fs.stat(path.join(album, '測試.webp')),
    cache = path.join(
      local,
      'thumbnails',
      createHash('sha256')
        .update(path.join(album, '測試.webp') + '/' + stat.size + '/' + stat.mtimeMs)
        .digest('hex') + '.jpg'
    )
  await fs.writeFile(cache, 'broken cache')
  const recovered = await page.evaluate(async () => {
    const s = (await window.media.request({ action: 'snapshot' })).snapshot,
      row = s.structure!.find((r) => r.path.endsWith('Album'))!,
      entries = (await window.explorer.request({ action: 'content', rowId: row.rowId })).content!
        .entries,
      url = entries.find((e) => e.name === '測試.webp')!.thumb!
    return Promise.all(
      Array.from({ length: 4 }, async () => {
        const response = await fetch(url)
        return { status: response.status, bytes: (await response.arrayBuffer()).byteLength }
      })
    )
  })
  assert.ok(recovered.every((r) => r.status === 200 && r.bytes > 10))
  assert.equal(
    (await fs.readdir(path.join(local, 'thumbnails'))).some((f) => f.endsWith('.tmp')),
    false
  )
  await page.locator('.media-thumbnail img[alt="測試.webp"]').evaluate((e) => {
    ;(e as HTMLImageElement).src = 'media://thumb/missing/missing'
  })
  await page.waitForFunction(() => {
    const i = document.querySelector('.media-thumbnail img[alt="測試.webp"]') as HTMLImageElement
    return i.src.startsWith('media://file/') && i.complete && i.naturalWidth > 0
  })
  console.log('PASS corrupt thumbnail cache, concurrent requests and original-image fallback')
  const tops = await page.evaluate(() => [
    document.querySelector('.workspace-toolbar')!.getBoundingClientRect().top,
    document.querySelector('.folder-panel-header')!.getBoundingClientRect().top,
  ])
  assert.equal(tops[0], tops[1])
  await page.locator('.titlebar').hover()
  assert.equal(
    await page
      .locator('.sidebar-project.selected .project-actions')
      .evaluate((e) => getComputedStyle(e).visibility),
    'hidden'
  )
  assert.equal(await page.getByRole('button', { name: '新增專案', exact: true }).count(), 1)
  await page.getByRole('button', { name: '新增群組', exact: true }).click()
  await page.getByLabel('群組名稱').fill('測試群組')
  await page.getByRole('button', { name: '保存群組', exact: true }).click()
  const group = page
    .locator('.sidebar-section')
    .filter({ has: page.getByRole('button', { name: '收合 測試群組', exact: true }) })
  await group.waitFor()
  await dragUntil(
    page.getByRole('button', { name: '開啟專案 遊戲收藏', exact: true }).first().locator('..'),
    group,
    async () =>
      (await group.getByRole('button', { name: '開啟專案 遊戲收藏', exact: true }).count()) > 0
  )
  const firstInGroup = () =>
    page.evaluate(
      () =>
        [...document.querySelectorAll('.sidebar-section')]
          .find((e) => e.textContent?.includes('測試群組'))
          ?.querySelector('.project-name')?.textContent
    )
  await dragUntil(
    page.getByRole('button', { name: '開啟專案 相簿收藏', exact: true }).first().locator('..'),
    group.getByRole('button', { name: '開啟專案 遊戲收藏', exact: true }).locator('..'),
    async () => (await firstInGroup()) === '相簿收藏'
  )
  await dragUntil(
    group.getByRole('button', { name: '開啟專案 遊戲收藏', exact: true }).locator('..'),
    group.getByRole('button', { name: '開啟專案 相簿收藏', exact: true }).locator('..'),
    async () => (await firstInGroup()) === '遊戲收藏'
  )
  console.log('PASS project drag/drop across groups and manual ordering')
  await card('A').dblclick()
  await header().getByText('A', { exact: true }).waitFor()
  assert.equal(await card('B').count(), 1)
  assert.ok((await page.locator('.breadcrumb-path').innerText()).endsWith('A'))
  await mode('TREE')
  await page.locator('.react-flow__node').first().waitFor()
  await page.getByRole('button', { name: '展開 A 子資料夾', exact: true }).click()
  const nodes = await page.evaluate(async () =>
    ((await window.media.request({ action: 'snapshot' })).snapshot.structure ?? [])
      .map((row) => row.rowId)
      .sort()
  )
  await page
    .locator('.react-flow__node')
    .filter({ has: page.getByText('B', { exact: true }) })
    .dblclick()
  await header().getByText('B', { exact: true }).waitFor()
  assert.deepEqual(
    await page.evaluate(async () =>
      ((await window.media.request({ action: 'snapshot' })).snapshot.structure ?? [])
        .map((row) => row.rowId)
        .sort()
    ),
    nodes
  )
  assert.equal(await page.getByLabel('組件 版面方案').count(), 0)
  assert.equal(await page.getByRole('button', { name: '卡片 顯示設定', exact: true }).count(), 0)
  await mode('TABLE')
  await page.locator('.folder-table').waitFor()
  assert.equal(
    await page.locator('[aria-label="資料夾路徑"] [aria-current="page"]').innerText(),
    'B'
  )
  await page
    .getByRole('navigation', { name: '資料夾路徑' })
    .getByRole('button', { name: 'Album', exact: true })
    .click()
  await header().getByText('Album', { exact: true }).waitFor()
  assert.equal(await page.locator('.folder-table tbody tr').count(), 2)
  await page.locator('.folder-table tbody tr').filter({ hasText: 'A' }).first().dblclick()
  await page.locator('.folder-table').getByText('B', { exact: true }).waitFor()
  await header().getByText('A', { exact: true }).waitFor()
  await page
    .locator('.workspace-breadcrumb')
    .getByRole('button', { name: '返回', exact: true })
    .click()
  await header().getByText('Album', { exact: true }).waitFor()
  const original = await fs.readFile(folderFile(path.join(album, 'A')))
  await fs.unlink(folderFile(path.join(album, 'A')))
  await page
    .locator('.folder-table tbody tr')
    .filter({ has: page.getByText('A', { exact: true }) })
    .dblclick()
  await page.getByText(/此資料夾尚未建立資料/).waitFor()
  assert.equal(await header().innerText(), 'Album')
  await assert.rejects(fs.access(folderFile(path.join(album, 'A'))))
  await fs.writeFile(folderFile(path.join(album, 'A')), original)
  await mode('CARD')
  await page
    .getByRole('navigation', { name: '資料夾路徑' })
    .getByRole('button', { name: 'Album', exact: true })
    .click()
  await card('A').waitFor()
  assert.equal(await card('B').count(), 0)
  await card('A').dblclick()
  await card('B').waitFor()
  await header().getByText('A', { exact: true }).waitFor()
  await page.getByRole('button', { name: '關閉資料夾內容', exact: true }).click()
  await page.locator('.folder-panel').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '切換右側內容', exact: true }).click()
  await header().getByText('A', { exact: true }).waitFor()
  await page.getByRole('button', { name: '目前資料夾設定', exact: true }).click()
  const drawer = page.getByRole('region', { name: '資料夾設定 · A', exact: true })
  await drawer.waitFor()
  assert.equal(await page.locator('.folder-panel-header strong').innerText(), 'A')
  await page.getByRole('button', { name: '關閉資料夾設定', exact: true }).click()
  await drawer.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '切換右側內容', exact: true }).click()
  await page.getByRole('button', { name: '更改樣式', exact: true }).click()
  await page.getByRole('button', { name: '新增方案', exact: true }).click()
  await page.getByLabel('方案名稱', { exact: true }).fill('第二方案')
  await page.getByRole('button', { name: '確認', exact: true }).click()
  await page.getByRole('button', { name: '儲存變更', exact: true }).click()
  await page.locator('.center-pane').waitFor()
  assert.equal(
    await page.evaluate(
      async () =>
        (await window.media.request({ action: 'snapshot' })).snapshot.projects.find(
          (p) => p.project?.name === '相簿收藏'
        )!.project!.layoutPresets!.length
    ),
    2
  )
  await page.getByRole('button', { name: '應用程式設定', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '應用程式設定', exact: true })
  await settings.getByRole('tab', { name: '連結與維護', exact: true }).click()
  await settings.getByRole('button', { name: '重新連結專案', exact: true }).waitFor()
  assert.equal(await settings.getByLabel('專案名稱', { exact: true }).count(), 0)
  await page.keyboard.press('Escape')
  await settings.waitFor({ state: 'hidden' })
  await page
    .getByRole('button', { name: '開啟專案 相簿收藏', exact: true })
    .first()
    .locator('..')
    .hover()
  await page.getByRole('button', { name: '專案選單 相簿收藏', exact: true }).first().click()
  await page.getByRole('menuitem', { name: '專案設定', exact: true }).click()
  const projectSettings = page.getByRole('dialog', { name: '專案設定 · 相簿收藏', exact: true })
  assert.equal(
    await projectSettings.getByLabel('專案名稱', { exact: true }).inputValue(),
    '相簿收藏'
  )
  assert.equal(await projectSettings.getByLabel('每頁筆數', { exact: true }).count(), 0)
  await page.keyboard.press('Escape')
  await projectSettings.waitFor({ state: 'hidden' })
  await page.screenshot({ path: path.join(screens, 'card.png') })
  console.log(
    'PASS mode-specific navigation, missing-record guard, presets, drawer, pane and settings'
  )
  await open('遊戲收藏')
  // The boundary filter lives in the top toolbar, not in its own row.
  assert.equal(await page.locator('.toolbar-left .game-boundary-filter').count(), 1)
  assert.equal(await page.locator('.game-boundary-filter').count(), 1)
  await card('Game').dblclick()
  await header().getByText('Game', { exact: true }).waitFor()
  await page.locator('.game-fields').waitFor()
  // The game table's columns can be resized by dragging the header separators.
  const gameColumn = () =>
    page
      .locator('.game-fields col')
      .first()
      .evaluate((col) => col.getBoundingClientRect().width)
  const columnBefore = await gameColumn(),
    separator = (await page.getByRole('separator', { name: '調整 欄位 欄寬' }).boundingBox())!
  await page.mouse.move(separator.x + 3, separator.y + separator.height / 2)
  await page.mouse.down()
  await page.mouse.move(separator.x + 63, separator.y + separator.height / 2, { steps: 4 })
  await page.mouse.up()
  assert.ok((await gameColumn()) > columnBefore + 40, 'dragging the separator widens the column')
  assert.equal(await page.locator('.game-content .game-banner').count(), 1)
  assert.equal(await page.locator('.game-content .game-actions').count(), 1)
  assert.equal(await page.locator('.game-content .content-subfolders').count(), 0)
  assert.equal(
    await page
      .locator('.game-content .game-banner')
      .evaluate((e) => parseFloat(getComputedStyle(e).borderTopWidth) > 0),
    true,
    'banner is framed'
  )
  await app.evaluate(
    ({ dialog }, file) => {
      dialog.showOpenDialog = (async () => ({
        canceled: false,
        filePaths: [file],
      })) as typeof dialog.showOpenDialog
    },
    path.join(album, '測試.webp')
  )
  await page.getByRole('button', { name: '更換遊戲封面', exact: true }).click()
  await page.getByRole('menuitem', { name: '匯入封面圖片', exact: true }).click()
  await page.waitForFunction(() => {
    const i = document.querySelector('.game-banner img') as HTMLImageElement
    return i?.complete && i.naturalWidth > 0
  })
  assert.equal(
    await fs.readdir(path.join(game, 'Game', 'Game_Data')).then((a) => a.includes(DATA_DIR)),
    false
  )
  // The cover is written as asset then banner reference; wait for the settled record.
  await page.waitForFunction(() =>
    document.querySelector('.statusbar')?.textContent?.includes('就緒')
  )
  for (let n = 0; n < 50; n++) {
    if ((await fs.readFile(folderFile(path.join(game, 'Game')), 'utf8')).includes('bannerAssetId'))
      break
    await page.waitForTimeout(100)
  }
  const beforeCancel = await fs.readFile(folderFile(path.join(game, 'Game')), 'utf8')
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = (async () => ({
      canceled: true,
      filePaths: [],
    })) as typeof dialog.showOpenDialog
  })
  await page.getByRole('button', { name: '更換遊戲封面', exact: true }).click()
  await page.getByRole('menuitem', { name: '匯入封面圖片', exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector('.statusbar')?.textContent?.includes('就緒')
  )
  assert.equal(await fs.readFile(folderFile(path.join(game, 'Game')), 'utf8'), beforeCancel)
  await page.screenshot({ path: path.join(screens, 'game.png') })
  console.log('PASS game three-zone content and portable WebP cover')
  await open('影片收藏')
  await page.locator('.mixed-media-browser .media-thumbnail').first().click()
  await page.locator('.video-stage video').waitFor()
  await page.waitForFunction(() => {
    const v = document.querySelector('video')
    return v && v.readyState >= 2
  })
  assert.equal(await page.locator('.video-panel .media-info-template').count(), 0)
  await page.evaluate(async () => {
    const v = document.querySelector('video')!
    await v.play()
  })
  await page.waitForFunction(() => document.querySelector('video')!.currentTime > 0.15)
  await page.evaluate(() => document.querySelector('video')!.pause())
  await page.waitForFunction(() =>
    document.querySelector('.statusbar')?.textContent?.includes('就緒')
  )
  console.log('PASS minimal video pane and actual H.264 playback')
  await page.getByRole('button', { name: '關閉媒體檢視器', exact: true }).click()
  await page.getByRole('dialog', { name: '播放佇列', exact: true }).waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '新增專案', exact: true }).click()
  const create = page.getByRole('dialog', { name: '建立媒體專案', exact: true })
  await create.getByLabel('專案名稱').fill('新專案')
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [folder],
    })) as typeof dialog.showOpenDialog
  }, fresh)
  await create.getByRole('button', { name: '選擇資料夾', exact: true }).click()
  await create.getByLabel('已選資料夾').filter({ hasText: fresh }).waitFor()
  await assert.rejects(fs.access(path.join(fresh, DATA_DIR)))
  await create.getByRole('button', { name: '完成建立', exact: true }).click()
  await create.waitFor({ state: 'hidden' })
  const created = await page.evaluate(
    async () =>
      (await window.media.request({ action: 'snapshot' })).snapshot.projects.find(
        (p) => p.project?.name === '新專案'
      )!.project!
  )
  assert.equal(created.scanAll, true)
  assert.deepEqual(created.cardView, { mode: 'single', level: 1 })
  console.log('PASS staged native folder choice and create defaults')
  await page.getByRole('button', { name: '關閉資料夾內容', exact: true }).click()
  await page.setViewportSize({ width: 800, height: 650 })
  await page.screenshot({ path: path.join(screens, 'narrow.png') })
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
    false
  )
  await page.reload()
  await page.getByRole('heading', { name: '你的資料夾，你的瀏覽方式' }).waitFor()
  await open('相簿收藏')
  const restored = await page.evaluate(() => window.desktop.workspace())
  assert.equal(
    Object.values(restored.prefs.browse ?? {}).find(
      (b) => b.mode === 'CARD' && b.panelVisible === false
    )?.panelVisible,
    false
  )
  assert.deepEqual(errors, [])
  console.log('PASS reload, 800px and no renderer exceptions; screenshots: ' + screens)
} catch (e) {
  console.log(
    'UI diagnostics',
    await page.evaluate(() => ({
      dialogs: [...document.querySelectorAll('[role=dialog]')].map((e) =>
        e.textContent?.slice(0, 300)
      ),
      labels: [...document.querySelectorAll('label')].map((e) => e.textContent),
      toast: document.querySelector('.app-toasts')?.textContent,
    }))
  )
  await page.screenshot({ path: path.join(screens, 'failure.png') }).catch(() => {})
  throw e
} finally {
  await app.close()
}
