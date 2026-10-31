import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { folderFile } from '../electron/files'
import { zipFixture, tinyPng } from './support/archive-fixture'
import { exportSettings } from '../electron/settings-package'
import { defaultWorkspace } from '../shared/workspace'

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
    mediaCategory: 'album',
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
      autoOpenContent: true,
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
  assert.equal(await page.locator('.center-mode').innerText(), '卡片\n表格\n樹狀圖')
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
    'disabled auto-open must preserve hidden pane'
  )
  await button('應用程式設定').click()
  await settings().getByRole('tab', { name: '瀏覽', exact: true }).click()
  await settings().getByRole('switch', { name: '自動開啟資料夾內容', exact: true }).click()
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLInputElement>('[aria-label="自動開啟資料夾內容"]')?.checked &&
      !document.querySelector<HTMLInputElement>('[aria-label="自動開啟資料夾內容"]')?.disabled
  )
  await page.keyboard.press('Escape')
  await settings().waitFor({ state: 'hidden' })
  await button('返回').click()
  await page.locator('.folder-panel').waitFor()
  await page.locator('.folder-panel-header strong').getByText('Library', { exact: true }).waitFor()
  await page.locator('.center-mode').getByText('卡片', { exact: true }).click()
  await button('更改樣式').click()
  await page.locator('.editor-page').waitFor()
  await button('新增方案').click()
  await page.getByLabel('方案名稱', { exact: true }).fill('空白 QA')
  await button('確認').click()
  await button('加入第一個組件').click()
  await page.getByLabel('版面文字內容', { exact: true }).fill('QA TEXT')
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
  await choose('Verified flag', '否')
  await drawer.getByRole('button', { name: '保存欄位資料', exact: true }).click()
  await page.waitForFunction(async () => {
    const snapshot = (await window.media.request({ action: 'snapshot' })).snapshot
    return snapshot.rows.some((row) =>
      row.record?.attributes.some((attribute) => attribute.value === false)
    )
  })
  await choose('此資料夾的版面方案', '預設版面')
  await drawer.getByRole('tab', { name: '來源匯入', exact: true }).click()
  await drawer.getByRole('textbox', { name: '資料來源', exact: true }).click()
  assert.equal(await page.getByRole('option').count(), 12)
  await page.screenshot({ path: path.join(screens, 'sources.png') })
  await page.keyboard.press('Escape')
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
  await choose('檔案展示方式', '完整路徑清單')
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
    await button('重新整理').click()
    await page.locator('.file-overview-notices').waitFor()
    assert.equal(await page.getByText('此範圍沒有可顯示的檔案', { exact: true }).count(), 0)
    await assert.rejects(fs.access(folderFile(media)))
  } finally {
    await fs.writeFile(folderFile(media), recordBytes)
  }
  await button('重新整理').click()
  await page.locator('.file-overview-item').first().waitFor()
  await choose('檔案展示方式', '依來源分組')
  await button('應用程式設定').click()
  await settings().getByRole('textbox', { name: '介面語言', exact: true }).click()
  await page.getByRole('option', { name: 'English', exact: true }).click()
  await page.waitForFunction(() =>
    document.querySelector('.file-overview-row > .path')?.textContent?.includes('2 files')
  )
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.documentElement.lang === 'zh-TW')
  await button('應用程式設定').click()
  await settings().getByRole('tab', { name: '設定移轉', exact: true }).click()
  const exported = path.join(root, 'exported.json')
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = (async () => ({
      canceled: false,
      filePath: file,
    })) as typeof dialog.showSaveDialog
  }, exported)
  await settings().getByRole('button', { name: '匯出設定包', exact: true }).click()
  await settings().getByText('設定包已匯出', { exact: true }).waitFor()
  const exportedValue = JSON.parse(await fs.readFile(exported, 'utf8'))
  assert.equal(exportedValue.kind, 'media-viewer.settings')
  assert.equal(exportedValue.prefs.browse, undefined)
  assert.equal(exportedValue.prefs.registry, undefined)
  await app.evaluate(({ dialog }) => {
    dialog.showOpenDialog = (async () => ({
      canceled: true,
      filePaths: [],
    })) as typeof dialog.showOpenDialog
  })
  await settings().getByRole('button', { name: '匯入設定包', exact: true }).click()
  assert.equal(await settings().getByText('設定匯入預覽', { exact: true }).count(), 0)
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({
      canceled: false,
      filePaths: [file],
    })) as typeof dialog.showOpenDialog
  }, incoming)
  await settings().getByRole('button', { name: '匯入設定包', exact: true }).click()
  await settings().getByText('設定匯入預覽', { exact: true }).waitFor()
  assert.equal(
    await page.evaluate(() => window.desktop.workspace()).then((state) => state.prefs.theme),
    undefined
  )
  await choose('匯入方式', '以匯入設定取代')
  await settings().getByRole('button', { name: '備份並匯入', exact: true }).click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'paper')
  await page.getByRole('heading', { name: '你的資料夾，你的瀏覽方式' }).waitFor()
  await button('應用程式設定').click()
  await settings().getByRole('tab', { name: '設定移轉', exact: true }).click()
  await settings().getByRole('button', { name: '復原此備份', exact: true }).first().waitFor()
  await page.screenshot({ path: path.join(screens, 'settings-backup.png') })
  await page.evaluate(() => {
    window.confirm = () => true
  })
  await settings().getByRole('button', { name: '復原此備份', exact: true }).first().click()
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark')
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
  await app.close().catch(() => {})
}
