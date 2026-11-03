import { _electron as electron } from 'playwright-core'
import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { Explorer } from '../electron/explorer'
import { WorkspaceStore } from '../electron/workspace'
import { folderFile, projectFile } from '../electron/files'
import { stabilizeQuery } from '../shared/query'

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'search-dialog-')),
  media = path.join(root, 'Folders'),
  other = path.join(root, 'Other'),
  local = path.join(root, 'local')
await fs.mkdir(path.join(media, 'Alpha'), { recursive: true })
await fs.mkdir(path.join(other, 'Beta'), { recursive: true })
const lib = new Library(local, undefined, false)
await lib.init()
await lib.create(media, {
  name: 'Search project',
  depth: { mode: 'through', level: 2 },
})
let project = lib.snapshot().projects[0].project!
const ast = stabilizeQuery('score:>=4', [
  { key: 'score', type: 'number', attributeId: 'score-id', projectId: project.projectId },
])
await lib.saveProject({
  ...project,
  fieldBindings: [{ attributeId: 'score-id', alias: 'rating', type: 'number' }],
  savedSearches: [
    { id: 'rated', name: 'Top rated', query: 'score:>=4', queryAst: ast },
    { id: 'alpha', name: 'Alpha folders', query: 'folder_name:Alpha' },
  ],
})
project = lib.snapshot().projects[0].project!
const explorer = new Explorer(lib, local, {
  choose: async () => undefined,
  open: async () => {},
  launch: async () => {},
  thumbnail: async () => Buffer.alloc(0),
})
const alpha = lib.snapshot().rows.find((row) => row.name === 'Alpha')!
await explorer.request({
  action: 'attributes',
  rowId: alpha.rowId,
  revision: alpha.record!.revision,
  private: false,
  values: [{ attributeId: 'score-id', key: 'rating', type: 'number', value: 5, source: 'manual' }],
})
explorer.index.close()
await lib.create(other, {
  name: 'Other project',
  depth: { mode: 'through', level: 2 },
})
const workspace = new WorkspaceStore(local, ['zh-TW'])
await workspace.init()
const originals = new Map(
  await Promise.all(
    [
      folderFile(media),
      folderFile(alpha.path),
      folderFile(other),
      projectFile(other, lib.snapshot().projects.find((p) => p.root === other)!.projectId),
    ].map(async (file) => [file, await fs.readFile(file)] as const)
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
page.setDefaultTimeout(12000)
const button = (name: string) => page.getByRole('button', { name, exact: true })
const record = async () =>
  JSON.parse(await fs.readFile(projectFile(media, project.projectId), 'utf8'))
try {
  await button('開啟專案 Search project').first().click()
  await page.keyboard.press('Control+k')
  const dialog = page.locator('.folder-search-dialog'),
    query = dialog.getByRole('textbox', { name: '資料夾名稱、路徑或欄位值', exact: true })
  await dialog.waitFor()
  assert.equal(
    await dialog.getByText('進階搜尋與索引', { exact: true }).count(),
    0,
    'advanced/index panel must be removed'
  )
  assert.equal(
    await dialog
      .locator('label')
      .filter({ hasText: /資料夾名稱、路徑或欄位值|搜尋範圍/ })
      .count(),
    0
  )
  await button('保存目前條件').waitFor()
  assert.equal(await button('保存目前條件').isDisabled(), true)
  await query.fill('Top')
  await page.locator('.saved-search-row').waitFor()
  assert.equal(await page.locator('.saved-search-row').count(), 1)
  assert.match((await page.locator('.saved-search-row').textContent()) ?? '', /Top rated/)
  assert.equal(
    await dialog.locator('.search-results button').count(),
    0,
    'saved matches are separate from content results'
  )
  await page.locator('.saved-search-apply').click()
  await page.waitForFunction(
    () => document.querySelector('.search-results button strong')?.textContent === 'Alpha'
  )
  assert.match(
    await query.inputValue(),
    /rating/,
    'saved condition restores its stable field after alias rename'
  )
  assert.equal(await page.locator('.saved-search-row').count(), 0)
  await query.fill('Alpha')
  await page.waitForFunction(
    () => document.querySelector('.search-results button strong')?.textContent === 'Alpha'
  )
  await button('常用搜尋').click()
  await button('保存目前條件').click()
  const name = dialog.getByRole('textbox', { name: '常用搜尋名稱', exact: true })
  await name.fill('Alpha folders')
  await button('取消保存').click()
  assert.equal((await record()).savedSearches.length, 2)
  await button('保存目前條件').click()
  await name.fill('Discard on Escape')
  await page.keyboard.press('Escape')
  await name.waitFor({ state: 'hidden' })
  assert.equal(await dialog.isVisible(), true)
  assert.equal(await query.evaluate((element) => element === document.activeElement), true)
  assert.equal((await record()).savedSearches.length, 2)
  await button('保存目前條件').click()
  await name.fill('Alpha folders')
  await button('保存到目前專案').click()
  await page.waitForFunction(() => !document.querySelector('.search-save-form'))
  const saved = (await record()).savedSearches
  assert.equal(saved.length, 3)
  assert.equal(
    new Set(saved.map((item: { id: string }) => item.id)).size,
    3,
    'same name/query text must create a distinct saved condition'
  )
  assert.deepEqual(saved.find((item: { id: string }) => item.id === 'rated').queryAst, ast)
  await button('常用搜尋').click()
  await page.locator('.saved-search-row').first().waitFor()
  assert.equal(await page.locator('.saved-search-row').count(), 2)
  await page
    .locator('.saved-search-row')
    .last()
    .getByRole('button', { name: '刪除常用搜尋 Alpha folders', exact: true })
    .click()
  await page.waitForFunction(() => document.querySelectorAll('.saved-search-row').length === 1)
  assert.equal((await record()).savedSearches.length, 2)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.saved-search-dropdown'))
  assert.equal(
    await dialog.isVisible(),
    true,
    'Escape closes saved dropdown before the search dialog'
  )
  await query.fill('"')
  await dialog.getByRole('alert').waitFor()
  assert.match((await dialog.getByRole('alert').textContent()) ?? '', /引號或跳脫未完成/)
  assert.equal(
    await dialog.getByRole('button', { name: '開啟資料夾', exact: true }).isDisabled(),
    true
  )
  await button('清除搜尋').click()
  await page.waitForFunction(() => !document.querySelector('.folder-search-dialog [role="alert"]'))
  const scope = dialog.getByRole('textbox', { name: '搜尋範圍', exact: true })
  await scope.click()
  await page.getByRole('option', { name: '全部已連結專案', exact: true }).click()
  await query.fill('Beta')
  await page.waitForFunction(
    () => document.querySelector('.search-results button strong')?.textContent === 'Beta'
  )
  await scope.click()
  await page.getByRole('option', { name: '目前專案 · Search project', exact: true }).click()
  await dialog.getByText('找不到符合的資料夾', { exact: true }).waitFor()
  assert.equal(await query.inputValue(), 'Beta')
  await scope.click()
  await page.getByRole('option', { name: '目前專案 · Search project', exact: true }).click()
  await dialog.getByText('找不到符合的資料夾', { exact: true }).waitFor()
  assert.equal(
    await dialog.locator('.search-results').getAttribute('aria-busy'),
    'false',
    'reselecting the current scope must not leave search busy'
  )
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.unmaximize()
    win.setMinimumSize(500, 400)
    win.setBounds({ width: 560, height: 760 })
  })
  await query.fill('Alpha')
  await page.waitForFunction(
    () => document.querySelector('.search-results button strong')?.textContent === 'Alpha'
  )
  if ((await button('常用搜尋').getAttribute('aria-expanded')) !== 'true')
    await button('常用搜尋').click()
  assert.ok(
    await page.locator('.saved-search-row button,.search-footer button').evaluateAll((elements) =>
      elements.every((element) => {
        const box = element.getBoundingClientRect()
        return box.left >= 0 && box.right <= innerWidth
      })
    )
  )
  await page.screenshot({ path: path.join(root, 'search-narrow.png') })
  await page.locator('.saved-search-apply').click()
  await page.waitForFunction(
    () => document.querySelector('.search-results button strong')?.textContent === 'Alpha'
  )
  await query.focus()
  await page.keyboard.press('Enter')
  await dialog.waitFor({ state: 'hidden' })
  assert.deepEqual(errors, [])
  for (const [file, bytes] of originals)
    assert.deepEqual(
      await fs.readFile(file),
      bytes,
      'unrelated project/folder records must remain unchanged'
    )
  console.log(
    'PASS search dialog: separate saved matches, stable field identity, explicit save/cancel/delete, duplicate identities, syntax errors, scope, focus, narrow layout, unrelated records. ' +
      root
  )
} catch (error) {
  console.error(
    'Search failure state:',
    await page.evaluate(() => ({
      query: document.querySelector<HTMLInputElement>('.search-query input')?.value,
      dialog: document.querySelector('.folder-search-dialog')?.textContent,
      alerts: [...document.querySelectorAll('[role="alert"]')].map(
        (element) => element.textContent
      ),
    }))
  )
  await page.screenshot({ path: path.join(root, 'failure.png') }).catch(() => {})
  throw error
} finally {
  await app.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.removeAllListeners('close')
      win.webContents.on('will-prevent-unload', (event) => event.preventDefault())
    }
  })
  await app.close()
}
