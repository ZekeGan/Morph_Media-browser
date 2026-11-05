import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { folderFile } from '../electron/files'
import { zipFixture, tinyPng } from './support/archive-fixture'
import { exportSettings } from '../electron/settings-package'
import { defaultWorkspace } from '../shared/workspace'
import { closeApp } from './support/app'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'decided-ui-')),
  local = path.join(root, 'local'),
  media = path.join(root, 'Library'),
  screens = path.join(root, 'screens')
await fs.mkdir(screens)
await fs.mkdir(path.join(media, 'A'), { recursive: true })
await fs.mkdir(path.join(media, 'B'))
for (const folder of ['A', 'B'])
  for (let index = 0; index < 120; index++)
    await fs.writeFile(path.join(media, folder, `page${index}.png`), tinyPng)
const zip = path.join(media, 'A', 'book.cbz')
await fs.writeFile(
  zip,
  zipFixture([
    { name: '02.png', bytes: tinyPng },
    { name: '01.png', bytes: tinyPng },
  ])
)
// A minimal real one-page PDF with an xref table, rather than an iframe placeholder.
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length 45 >>\nstream\nBT /F1 24 Tf 40 400 Td (PDF QA VERIFIED) Tj ET\nendstream',
]
let pdf = '%PDF-1.4\n',
  offsets = [0]
for (const [index, object] of objects.entries()) {
  offsets.push(Buffer.byteLength(pdf))
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
}
const xref = Buffer.byteLength(pdf)
pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
  .slice(1)
  .map((offset) => String(offset).padStart(10, '0') + ' 00000 n ')
  .join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`
const pdfFile = path.join(media, 'A', 'sample.pdf')
await fs.writeFile(pdfFile, pdf)
const library = new Library(local, undefined, false)
await library.init()
const state = await library.create(media, {
    name: 'Decided QA',
    depth: { mode: 'through', level: 2 },
  }),
  project = state.projects[0].project!
const originals = new Map<string, Buffer>()
for (const file of [
  zip,
  pdfFile,
  path.join(media, 'A', 'page0.png'),
  path.join(media, 'B', 'page0.png'),
])
  originals.set(file, await fs.readFile(file))
const incoming = path.join(root, 'incoming.json')
await fs.writeFile(
  incoming,
  JSON.stringify(
    exportSettings({
      ...defaultWorkspace(),
      theme: 'paper',
      locale: 'zh-TW',
    })
  )
)
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
await page.setViewportSize({ width: 1600, height: 950 })
const button = (name: string) => page.getByRole('button', { name, exact: true }),
  open = () => button('開啟專案 Decided QA').first().click(),
  settings = () => page.getByRole('dialog', { name: '應用程式設定', exact: true })
const presentation = async (name: string) => {
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
try {
  await page.getByRole('heading', { name: '你的資料夾，你的瀏覽方式' }).waitFor()
  await page.evaluate(() => {
    window.confirm = () => true
  })
  await open()
  await page.locator('.center-pane').waitFor()
  await page.locator('.center-mode').getByText('卡片', { exact: true }).waitFor()
  const modeText = (await page.locator('.center-mode').textContent()) ?? ''
  for (const name of ['卡片', '表格', '樹狀圖']) assert.ok(modeText.includes(name), name)
  await page.locator('.center-mode').getByText('表格', { exact: true }).click()
  await button('切換右側內容').click()
  assert.equal(await page.locator('.folder-panel').count(), 0)
  await page
    .locator('.folder-table tbody tr')
    .filter({ has: page.getByText('A', { exact: true }) })
    .dblclick()
  assert.equal(
    await page.locator('.folder-panel').count(),
    0,
    'entering a folder must not open a hidden pane'
  )
  await button('切換右側內容').click()
  await button('返回').click()
  await page.locator('.folder-panel').waitFor()
  await page.locator('.folder-panel-header strong').getByText('Library', { exact: true }).waitFor()
  await page.locator('.center-mode').getByText('卡片', { exact: true }).click()
  await button('編輯版面').click()
  await page.locator('.editor-page').waitFor()
  await button('新增方案').click()
  await page.getByLabel('方案名稱', { exact: true }).fill('空白 QA')
  await button('確認').click()
  // The empty canvas's templates step aside while a component is dragged over the canvas and come back when it
  // leaves; a drop near the top lands there instead of below the templates.
  {
    const empty = page.locator('.canvas-empty'),
      canvas = (await page.locator('.canvas').boundingBox())!,
      palette = page.locator('.basic-palette .palette-item').first(),
      transfer = await page.evaluateHandle(() => new DataTransfer())
    const over = (x: number, y: number) =>
      page
        .locator('body')
        .dispatchEvent('dragover', { clientX: x, clientY: y, dataTransfer: transfer })
    assert.equal(await empty.evaluate((node) => node.classList.contains('stepped-aside')), false)
    await palette.dispatchEvent('dragstart', { dataTransfer: transfer })
    await over(canvas.x + canvas.width / 2, canvas.y + 40)
    await page.locator('.canvas-empty.stepped-aside').waitFor({ state: 'attached' })
    await over(5, 5)
    await page.locator('.canvas-empty:not(.stepped-aside)').waitFor({ state: 'attached' })
    await over(canvas.x + canvas.width / 2, canvas.y + 40)
    const top = {
      clientX: canvas.x + canvas.width / 2,
      clientY: canvas.y + 30,
      dataTransfer: transfer,
    }
    await page.locator('.react-grid-layout').dispatchEvent('dragenter', top)
    await page.locator('.react-grid-layout').dispatchEvent('drop', top)
    await palette.dispatchEvent('dragend', { dataTransfer: transfer })
    await page.locator('.editor-cell').first().waitFor()
    assert.equal(await empty.count(), 0, 'the templates go once something is placed')
    await button('復原').click()
    await empty.waitFor()
  }
  await button('加入第一個組件').click()
  await page.getByLabel('版面文字內容', { exact: true }).fill('QA TEXT')
  await page.getByRole('button', { name: '＋ 新增欄位', exact: true }).click()
  const form = page.getByRole('form', { name: '新增欄位' })
  await form.getByLabel('欄位名稱').fill('Verified flag')
  await choose('欄位型別', '是／否')
  await form.getByRole('button', { name: '新增欄位', exact: true }).click()
  await page
    .locator('.project-field-palette')
    .getByRole('button')
    .filter({ hasText: 'Verified flag' })
    .click()
  await button('空白間距').click()
  await page
    .locator('.basic-palette')
    .getByRole('button', { name: '系統資訊', exact: true })
    .click()
  await choose('系統資訊', '檔案數')
  await button('儲存變更').click()
  await page.locator('.center-pane').waitFor()
  let saved = (await page.evaluate(() => window.media.request({ action: 'snapshot' }))).snapshot
    .projects[0].project!
  assert.equal(saved.layoutPresets!.length, 2)
  assert.ok(
    saved.fieldBindings.some((field) => field.alias === 'Verified flag' && field.type === 'boolean')
  )
  await page.screenshot({ path: path.join(screens, 'scheme.png') })
  await button('目前資料夾設定').click()
  const drawer = page.getByRole('region', { name: '資料夾設定 · Library', exact: true })
  await drawer.waitFor()
  await drawer.getByRole('checkbox', { name: /顯示未填欄位/ }).check()
  await choose('Verified flag', '否')
  await drawer.getByRole('button', { name: '保存欄位資料', exact: true }).click()
  await page.waitForFunction(async () => {
    const snapshot = (await window.media.request({ action: 'snapshot' })).snapshot
    return snapshot.rows.some((row) =>
      row.record?.attributes.some((attribute) => attribute.value === false)
    )
  })
  await choose('此資料夾的卡片外觀', '預設版面')
  // The source is recognised from the address; the preview button is enabled only for a known site.
  const address = drawer.getByRole('textbox', { name: '作品網址或 ID', exact: true }),
    preview = drawer.getByRole('button', { name: '取得預覽', exact: true })
  assert.equal(await preview.isDisabled(), true)
  await address.fill('https://unknown.example.test/work/1')
  assert.equal(await preview.isDisabled(), true)
  await drawer.getByText('無法辨識這個網址的來源').waitFor()
  await address.fill('https://www.dlsite.com/maniax/work/=/product_id/RJ123456.html')
  await drawer.locator('.mantine-Badge-root').filter({ hasText: 'DLsite' }).waitFor()
  assert.equal(await preview.isDisabled(), false)
  await address.fill('620')
  await drawer.locator('.mantine-Badge-root').filter({ hasText: 'Steam' }).waitFor()
  await page.screenshot({ path: path.join(screens, 'sources.png') })
  await address.fill('')
  await page.getByRole('button', { name: '關閉資料夾設定', exact: true }).click()

  await page.locator('[aria-label="展示內容"]').getByText('檔案', { exact: true }).click()
  await page.locator('.file-overview-item').first().waitFor()
  await page.waitForFunction(() =>
    document.querySelector('.file-overview')?.textContent?.includes('242')
  )
  assert.ok(
    (await page.locator('.file-overview-item').count()) < 60,
    'virtualization bounds visible files'
  )
  await page
    .locator('.file-overview-scroll')
    .evaluate((element) => (element.scrollTop = element.scrollHeight))
  await page.waitForTimeout(100)
  assert.ok((await page.locator('.file-overview-item').count()) < 60)
  await presentation('完整路徑清單')
  await page.locator('.file-overview-scroll').evaluate((element) => (element.scrollTop = 0))
  await page.locator('.file-overview-item').filter({ hasText: 'book.cbz' }).click()
  await button('開啟檢視器').click()
  await page.getByRole('dialog', { name: '漫畫閱讀器', exact: true }).waitFor()
  await page.waitForFunction(() => {
    const image = document.querySelector('.reader-spread img') as HTMLImageElement
    return image?.complete && image.naturalWidth > 0
  })
  await page.screenshot({ path: path.join(screens, 'archive.png') })
  await page.keyboard.press('Escape')
  await page.getByRole('dialog', { name: '漫畫閱讀器', exact: true }).waitFor({ state: 'hidden' })
  await choose('檔案類型', '其他')
  await page.locator('.file-overview-item').filter({ hasText: 'sample.pdf' }).click()
  await button('開啟檢視器').click()
  await page.locator('.document-viewer iframe').waitFor()
  await page.waitForTimeout(1600)
  await page.screenshot({ path: path.join(screens, 'pdf.png') })
  assert.ok(
    page.frames().some((frame) => frame.url().startsWith('chrome-extension:')),
    'native PDF viewer must load'
  )
  assert.equal(
    page.frames().some((frame) => frame.url().startsWith('chrome-error:')),
    false,
    'PDF must render, not just open an iframe'
  )
  await page.locator('.document-viewer').getByRole('button', { name: '關閉', exact: true }).click()
  await page.screenshot({ path: path.join(screens, 'overview.png') })
  const recordBytes = await fs.readFile(folderFile(media))
  await fs.unlink(folderFile(media))
  try {
    // The top-bar refresh also rescans (which would recreate the record), so reload the overview by changing its scope.
    await page.getByRole('button', { name: '檔案總覽範圍設定', exact: true }).click()
    const scope = page.getByRole('radiogroup', { name: '檔案總覽範圍' })
    await scope.getByText('目前資料夾', { exact: true }).click()
    await scope.getByText('包含子資料夾', { exact: true }).click()
    await page.locator('.file-overview-notices').waitFor()
    assert.equal(await page.getByText('此範圍沒有可顯示的檔案', { exact: true }).count(), 0)
    await assert.rejects(fs.access(folderFile(media)))
  } finally {
    await fs.writeFile(folderFile(media), recordBytes)
  }
  await button('重新整理').click()
  await page.locator('.file-overview-item').first().waitFor()
  await presentation('依來源分組')
  await button('應用程式設定').click()
  await settings().getByRole('textbox', { name: '介面語言', exact: true }).click()
  await page.getByRole('option', { name: 'English', exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector('.file-overview-row > .path')?.textContent?.includes('2 files')
  )
  // Choosing a language applies and saves at once.
  await page.waitForFunction(() => document.documentElement.lang === 'en')
  await page
    .getByRole('dialog')
    .getByRole('textbox', { name: 'Interface language', exact: true })
    .click()
  await page.getByRole('option', { name: '繁體中文', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.lang === 'zh-TW')
  await page.waitForFunction(
    () => !!document.querySelector('.application-settings [role=status]')?.textContent?.trim()
  )
  await page.keyboard.press('Escape')
  await button('應用程式設定').click()
  await settings().getByRole('tab', { name: '備份', exact: true }).click()
  // Backups are kept in the app's own folder; "Create backup" asks nothing.
  const backups = path.join(local, 'backups')
  await settings().getByRole('button', { name: '建立備份', exact: true }).click()
  const list = settings().getByRole('list', { name: '備份清單', exact: true })
  await list.getByText('手動備份', { exact: false }).waitFor()
  const made = path.join(
    backups,
    (await fs.readdir(backups)).find((name) => name.startsWith('M-orph-backup-'))!
  )
  const exportedValue = JSON.parse(await fs.readFile(path.join(made, 'settings.json'), 'utf8'))
  assert.equal(exportedValue.kind, 'media-viewer.settings')
  assert.equal(exportedValue.prefs.browse, undefined)
  assert.equal(exportedValue.prefs.registry, undefined)
  const answer = (folder: string | undefined) =>
    app.evaluate(({ dialog }, chosen) => {
      dialog.showOpenDialog = (async () => ({
        canceled: !chosen,
        filePaths: chosen ? [chosen] : [],
      })) as typeof dialog.showOpenDialog
    }, folder)
  // Cancelling the folder choice shows nothing.
  await answer(undefined)
  await settings().getByRole('button', { name: '從檔案還原…', exact: true }).click()
  assert.equal(await settings().locator('.restore-preview').count(), 0)
  // A backup from elsewhere carries other settings (paper theme), to see the restore take effect.
  const elsewhere = path.join(root, 'from-elsewhere')
  await fs.cp(made, elsewhere, { recursive: true })
  await fs.copyFile(incoming, path.join(elsewhere, 'settings.json'))
  await answer(elsewhere)
  await settings().getByRole('button', { name: '從檔案還原…', exact: true }).click()
  const restore = settings().locator('.restore-preview')
  await restore.waitFor()
  assert.equal(
    await page.evaluate(() => window.desktop.workspace()).then((state) => state.prefs.theme),
    'dark'
  )
  // Only the settings are restored here; project boxes are cleared.
  const boxes = restore.getByRole('checkbox')
  for (let index = 1; index < (await boxes.count()); index++) await boxes.nth(index).uncheck()
  await restore.getByRole('button', { name: '還原勾選的項目', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'paper')
  await page.getByRole('heading', { name: '你的資料夾，你的瀏覽方式' }).waitFor()
  // The restore left an automatic backup of the state before it; restoring that one undoes it.
  await button('應用程式設定').click()
  await settings().getByRole('tab', { name: '備份', exact: true }).click()
  // The settings restore offers its way back right there; it makes no backup entry of its own.
  const back = settings().getByRole('button', { name: '回到還原之前', exact: true })
  await back.waitFor()
  assert.equal(await settings().getByRole('listitem').count(), 1)
  await page.screenshot({ path: path.join(screens, 'settings-backup.png') })
  await back.click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
  await button('應用程式設定').click()
  await settings().getByRole('tab', { name: '備份', exact: true }).click()
  assert.equal(await back.count(), 0)
  await page.keyboard.press('Escape')
  for (const [file, bytes] of originals) assert.deepEqual(await fs.readFile(file), bytes)
  const snapshot = (await page.evaluate(() => window.media.request({ action: 'snapshot' })))
    .snapshot
  assert.equal(snapshot.projects[0].projectId, project.projectId)
  assert.ok((await fs.readFile(folderFile(media), 'utf8')).includes('"schemaVersion": 1'))
  assert.deepEqual(errors, [])
  console.log(
    'PASS new fields/schemes, translated modes, auto-open preference, virtual overview, archive reader, native PDF pages, settings preview/import/recovery, readonly originals; ' +
      screens
  )
} catch (error) {
  await page.screenshot({ path: path.join(screens, 'failure.png') }).catch(() => {})
  console.error('ARTIFACTS', root, error)
  console.error(
    await page
      .locator('[role=switch]')
      .evaluateAll((elements) => elements.map((element) => element.outerHTML))
      .catch(() => [])
  )
  throw error
} finally {
  await app
    .evaluate(({ BrowserWindow }) => {
      for (const win of BrowserWindow.getAllWindows()) win.destroy()
    })
    .catch(() => {})
  await closeApp(app).catch(() => {})
}
