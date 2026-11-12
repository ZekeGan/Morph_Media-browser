import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { keySites } from '../shared/keys'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// R-285: the website keys tab lists every keyed site, and pasting a keyed site's address in the import panel says a
// key is needed and opens that row. No request leaves the computer in this test.
const base = path.resolve('.test-output')
await fs.mkdir(path.join(base, 'shot'), { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'keys-ui-')),
  media = path.join(root, 'Library'),
  local = path.join(root, 'local')
await fs.mkdir(path.join(media, 'Film'), { recursive: true })
const library = new Library(local, undefined, false)
await library.init()
await library.create(media, {
  name: 'Keys test',
  depth: { mode: 'through', level: 2 },
  scanAll: true,
})
const errors: string[] = []
const { app, page } = await launchApp(local, errors, { width: 1300, height: 860 })
let passed = false
try {
  await page.locator('.titlebar').getByRole('button', { name: '應用程式設定', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '應用程式設定', exact: true })
  await settings.getByRole('tab', { name: '網站金鑰', exact: true }).click()
  for (const site of keySites)
    await settings.getByRole('region', { name: site.name, exact: true }).waitFor()
  const tmdb = settings.getByRole('region', { name: 'TMDB', exact: true })
  assert.ok((await tmdb.innerText()).includes('未設定'))
  await tmdb.getByRole('button', { name: '怎麼申請', exact: true }).click()
  await tmdb.getByText(/themoviedb\.org/).waitFor()
  await page.screenshot({ path: path.join(base, 'shot', 'r285-site-keys.png') })
  await page.keyboard.press('Escape')
  await settings.waitFor({ state: 'detached' })
  // The import panel: a TMDB address needs a key, so preview is off and "Open settings" goes to the TMDB row.
  await page.getByRole('button', { name: '開啟專案 Keys test', exact: true }).first().click()
  await page.getByRole('button', { name: '目前資料夾設定', exact: true }).click()
  const drawer = page.locator('.folder-panel-dock-settings')
  const address = drawer.getByRole('textbox', { name: '作品網址或 ID', exact: true })
  await address.fill('https://www.themoviedb.org/movie/603-the-matrix')
  await drawer.getByText('TMDB 需要你自己的金鑰才能查資料。', { exact: true }).waitFor()
  assert.equal(
    await drawer.getByRole('button', { name: '取得預覽', exact: true }).isDisabled(),
    true
  )
  await drawer.getByRole('button', { name: '前往設定', exact: true }).click()
  await settings.waitFor()
  assert.equal(
    await settings
      .getByRole('tab', { name: '網站金鑰', exact: true })
      .getAttribute('aria-selected'),
    'true'
  )
  await settings.locator('.site-key.focused', { hasText: 'TMDB' }).waitFor()
  assert.deepEqual(errors, [])
  passed = true
  console.log(
    'PASS website keys tab, how-to steps, key-needed prompt and jump to the site row. ' + root
  )
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
