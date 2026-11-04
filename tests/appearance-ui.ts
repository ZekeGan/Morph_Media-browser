import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Library } from '../electron/library'
import { folderFile } from '../electron/files'
import { catalog } from '../src/i18n/catalog'
import type { LocaleId } from '../shared/locales'
import { nativeText } from '../shared/native-messages'
import { closeApp } from './support/app'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'appearance-')),
  local = path.join(root, 'local'),
  media = path.join(root, 'Library'),
  screens = path.join(root, 'screens')
await fs.mkdir(screens)
const originals = new Map<string, Buffer>()
for (const folder of [
  '雨後書店',
  'Café 日常',
  'Long folder name · 長いフォルダー名 · Nombre largo',
]) {
  const dir = path.join(media, folder)
  await fs.mkdir(path.join(dir, 'Chapter 01'), { recursive: true })
  for (let index = 0; index < 3; index++) {
    const file = path.join(dir, `${index + 1}.png`)
    await promisify(execFile)(
      'ffmpeg',
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        `testsrc=size=180x260:rate=1`,
        '-vf',
        'hue=s=0',
        '-frames:v',
        '1',
        file,
      ],
      { windowsHide: true }
    )
    originals.set(file, await fs.readFile(file))
  }
}
const lib = new Library(local, undefined, false)
await lib.init()
await lib.create(media, {
  name: '主題查收 · Theme QA',
  scanAll: true,
  depth: { mode: 'through', level: 1 },
})
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
const tr = (source: string) => catalog[locale][source] ?? source
const button = (source: string) => page.getByRole('button', { name: tr(source), exact: true })
const settings = () => page.getByRole('dialog', { name: tr('應用程式設定'), exact: true })
const setLanguage = async (value: LocaleId) => {
  await settings().getByLabel(tr('介面語言'), { exact: true }).click()
  const names = {
    'zh-TW': '繁體中文',
    ja: '日本語',
    'zh-CN': '简体中文',
    en: 'English',
    es: 'Español',
  }
  await page.getByRole('option', { name: names[value], exact: true }).click()
  locale = value
  await settings().waitFor()
}
try {
  await page.getByRole('heading', { name: '你的資料夾，你的瀏覽方式' }).waitFor()
  assert.equal(
    await page
      .locator('.project-sidebar')
      .getByRole('button', { name: '應用程式設定', exact: true })
      .count(),
    0
  )
  assert.equal(
    await page
      .locator('.titlebar')
      .getByRole('button', { name: '應用程式設定', exact: true })
      .count(),
    1
  )
  // Choosing a language applies and saves at once; reload every language, checking labels and unchanged user names.
  for (const next of ['ja', 'zh-CN', 'en', 'es', 'zh-TW'] as const) {
    await button('應用程式設定').click()
    await setLanguage(next)
    await page.waitForFunction(
      () => !!document.querySelector('.application-settings [role=status]')?.textContent?.trim()
    )
    await page.keyboard.press('Escape')
    await settings().waitFor({ state: 'hidden' })
    await page.waitForFunction(() => !document.querySelector('.dirty-indicator'))
    await page.reload()
    await page.waitForFunction((value) => document.documentElement.lang === value, next)
    const nativePrompt = await app.evaluate(({ BrowserWindow, dialog }) => {
      const original = dialog.showMessageBoxSync
      let message = ''
      dialog.showMessageBoxSync = ((_window: unknown, options: { message: string }) => {
        message = options.message
        return 0
      }) as typeof dialog.showMessageBoxSync
      try {
        BrowserWindow.getAllWindows()[0].webContents.emit('will-prevent-unload', {
          preventDefault() {},
        })
        return message
      } finally {
        dialog.showMessageBoxSync = original
      }
    })
    assert.equal(nativePrompt, nativeText('要放棄尚未保存的變更嗎？', next))
    await button('應用程式設定').waitFor()
    await page.getByRole('heading', { name: tr('你的資料夾，你的瀏覽方式') }).waitFor()
    assert.ok(
      await page
        .getByRole('button', {
          name: tr('開啟專案 {0}').replace('{0}', '主題查收 · Theme QA'),
          exact: true,
        })
        .count()
    )
    await page.screenshot({ animations: 'disabled', path: path.join(screens, `home-${next}.png`) })
  }
  await page
    .getByRole('button', { name: '開啟專案 主題查收 · Theme QA', exact: true })
    .first()
    .click()
  await page
    .locator('.media-subfolder')
    .getByRole('button', { name: '雨後書店', exact: true })
    .click()
  await page.locator('.media-thumbnail img').first().waitFor()
  const records = new Map<string, Buffer>()
  for (const row of (await page.evaluate(() => window.media.request({ action: 'snapshot' })))
    .snapshot.structure ?? [])
    if (row.record) records.set(folderFile(row.path), await fs.readFile(folderFile(row.path)))
  for (const [theme, name] of [
    ['glass', '霧白玻璃'],
    ['paper', '暖紙墨橘'],
    ['dark', '深色經典'],
  ] as const) {
    await button('應用程式設定').click()
    await button(name + ' 主題').click()
    await page.waitForFunction(
      () => !!document.querySelector('.application-settings [role=status]')?.textContent?.trim()
    )
    await page.keyboard.press('Escape')
    await settings().waitFor({ state: 'hidden' })
    await page.waitForFunction(() => !document.querySelector('.dirty-indicator'))
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme)
    for (const mode of ['CARD', 'TABLE', 'TREE']) {
      await page
        .locator('.center-mode')
        .getByText(
          ({ CARD: '卡片', TABLE: '表格', TREE: '樹狀圖' } as Record<string, string>)[mode],
          { exact: true }
        )
        .click()
      if (mode === 'TREE') {
        await page.locator('.react-flow__node').first().waitFor()
        await button('重設縮放').click()
      }
      await page.screenshot({
        animations: 'disabled',
        path: path.join(screens, `${theme}-${mode}.png`),
      })
      assert.equal(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        false
      )
    }
    for (const [file, bytes] of records)
      assert.deepEqual(
        await fs.readFile(file),
        bytes,
        'Appearance changed a folder record: ' + file
      )
    await page.locator('.media-thumbnail').first().click()
    await page.getByRole('dialog', { name: '漫畫閱讀器', exact: true }).waitFor()
    await page.locator('.reader-spread img').first().waitFor()
    await page.screenshot({
      animations: 'disabled',
      path: path.join(screens, `${theme}-reader.png`),
    })
    await button('退出閱讀器').click()
    await page.locator('.reader').waitFor({ state: 'hidden' })
    await page.waitForFunction(() =>
      document.querySelector('.statusbar')?.textContent?.includes('就緒')
    )
    // The existing reader saves reading preferences on exit. Allow only that
    // intentional change, then use the new bytes as the next appearance baseline.
    for (const [file, bytes] of records) {
      const next = await fs.readFile(file),
        normalize = (record: any) => {
          delete record.revision
          if (record.details) {
            delete record.details.reading
            if (Object.keys(record.details).every((key) => key === 'schemaVersion'))
              delete record.details
          }
          return record
        }
      assert.deepEqual(
        normalize(JSON.parse(next.toString())),
        normalize(JSON.parse(bytes.toString())),
        file
      )
      records.set(file, next)
    }
    await button('目前資料夾設定').click()
    await page.locator('.folder-settings').waitFor()
    await page.screenshot({
      animations: 'disabled',
      path: path.join(screens, `${theme}-folder-settings.png`),
    })
    await button('關閉資料夾設定').click()
    await page.locator('.folder-settings').waitFor({ state: 'hidden' })
    // Global settings remains reachable with the sidebar hidden.
    await button('切換專案欄').click()
    await button('應用程式設定').click()
    await settings().waitFor()
    await page.screenshot({
      animations: 'disabled',
      path: path.join(screens, `${theme}-settings.png`),
    })
    await page.keyboard.press('Escape')
    await button('切換專案欄').click()
    await page.setViewportSize({ width: 800, height: 650 })
    await button('應用程式設定').click()
    await settings().waitFor()
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    )
    await page.screenshot({
      animations: 'disabled',
      path: path.join(screens, `${theme}-narrow.png`),
    })
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1440, height: 900 })
  }
  for (const [file, bytes] of [...originals, ...records])
    assert.deepEqual(await fs.readFile(file), bytes, file)
  assert.deepEqual(errors, [])
  console.log(
    'PASS three themes across CARD/TABLE/TREE, five languages, preview/cancel, reload, sidebar hidden, 800px, unchanged user data and no renderer exceptions'
  )
  console.log('Screenshots: ' + screens)
} catch (error) {
  await page
    .screenshot({ animations: 'disabled', path: path.join(screens, 'failure.png') })
    .catch(() => {})
  throw error
} finally {
  await closeApp(app)
}
