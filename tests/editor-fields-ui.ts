import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { folderFile, projectFile, readFolder, readJson } from '../electron/files'
import type { Project } from '../shared/model'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// The editor's "Your fields" section (source groups, not-yet-added rows, search, create from search, value filter,
// reference only), a text component with a tags fallback (order, conversion, saved order) and the folder settings
// keeping 0 / false and a field being cleared visible. Folder records are never rewritten by the editor.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'editor-fields-ui-')),
  media = path.join(root, 'Library'),
  child = path.join(media, 'B'),
  local = path.join(root, 'local')
await fs.mkdir(child, { recursive: true })
const library = new Library(local, undefined, false)
await library.init()
await library.create(media, { name: 'Fields', scanAll: true, depth: { mode: 'through', level: 1 } })
const project = library.snapshot().projects[0].project!
await library.saveProject({
  ...project,
  fieldBindings: [
    { alias: 'Note', attributeId: 'note', type: 'string' },
    { alias: 'Score', attributeId: 'score', type: 'number' },
    { alias: 'Flag', attributeId: 'flag', type: 'boolean' },
  ],
})
const rootRecord = await readFolder(media)
rootRecord.attributes = [
  { attributeId: 'note', key: 'Note', type: 'string', value: 'hello', source: 'manual' },
  { attributeId: 'score', key: 'Score', type: 'number', value: 0, source: 'manual' },
  { attributeId: 'flag', key: 'Flag', type: 'boolean', value: false, source: 'manual' },
  { attributeId: 'genre', key: 'Genre', type: 'tags', value: ['Action, RPG'], source: 'manual' },
  { attributeId: 'dlsite-title', key: 'TITLE', type: 'string', value: 'DL Root', source: 'manual' },
]
await fs.writeFile(folderFile(media), JSON.stringify(rootRecord))
await library.scan()
const childRecord = await readFolder(child)
childRecord.attributes = [
  { attributeId: 'steam-name', key: 'NAME', type: 'string', value: 'Steam B', source: 'manual' },
  { attributeId: 'genre', key: 'Genre', type: 'tags', value: ['Puzzle'], source: 'manual' },
]
await fs.writeFile(folderFile(child), JSON.stringify(childRecord))
await library.scan()
const records = async () =>
  Promise.all([fs.readFile(folderFile(media)), fs.readFile(folderFile(child))])
const originalRecords = await records()

const errors: string[] = []
const { app, page } = await launchApp(local, errors, { width: 1500, height: 950 })
let passed = false
try {
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  await page.getByRole('button', { name: '開啟專案 Fields', exact: true }).first().click()
  await button('編輯版面').click()
  await page.locator('.editor-page').waitFor()
  const fields = page.locator('.project-field-palette')
  const row = (name: string) =>
    fields.locator('.palette-field').filter({ has: page.getByText(name, { exact: true }) })
  const cells = () => page.locator('.editor-cell').count()

  // Fields are grouped by source; fields only in folder records are rows marked "not added yet".
  const groups = await fields.locator('.field-source-group > summary').allInnerTexts()
  for (const source of ['DLsite', 'Steam', '自建'])
    assert.ok(
      groups.some((text) => text.startsWith(source)),
      source + ' group: ' + groups
    )
  await row('TITLE').getByText('尚未加入', { exact: true }).waitFor()
  assert.match((await row('Note').getAttribute('class'))!, /palette-field(?! is-unbound)/)

  // One search box matches field names and source names.
  const search = page.getByRole('textbox', { name: '搜尋組件與欄位', exact: true })
  await search.fill('Steam')
  assert.deepEqual(
    await fields.locator('.palette-field .palette-field-name').allInnerTexts(),
    ['NAME'],
    'searching a source name keeps only its fields'
  )
  // A search that finds no field offers to create it with that name.
  await search.fill('Zzz')
  await button('＋ 建立欄位「Zzz」').click()
  const form = page.getByRole('form', { name: '新增欄位' })
  assert.equal(await form.getByLabel('欄位名稱').inputValue(), 'Zzz')
  await form.getByRole('button', { name: '新增欄位', exact: true }).click()
  await form.waitFor({ state: 'hidden' })
  assert.equal(await search.inputValue(), '', 'the search is cleared after creating')
  await row('Zzz').getByText('使用 0 次', { exact: true }).waitFor()

  // The value filter on the section heading hides fields the previewed folder has no value for.
  await page.getByRole('textbox', { name: '使用真實資料預覽', exact: true }).click()
  await page.getByRole('option', { name: /^Library · / }).click()
  await button('只看有值').click()
  await fields.getByText(/^已隱藏 \d+ 個未填欄位$/).waitFor()
  assert.equal(await row('NAME').count(), 0)
  assert.equal(await row('TITLE').count(), 1)
  await fields.getByRole('button', { name: '顯示全部', exact: true }).click()
  await row('NAME').waitFor()
  assert.equal(await button('只看有值').getAttribute('aria-pressed'), 'false')

  // "Reference only" adds the field to the project without putting it on the card.
  const before = await cells()
  await button('欄位操作 TITLE').click()
  await page.getByRole('menuitem', { name: '只引用欄位', exact: true }).click()
  await row('TITLE').getByText('使用 0 次', { exact: true }).waitFor()
  assert.equal(await cells(), before)

  // A click on a not-yet-added field adds it and puts it on the card, selected.
  await row('NAME').locator('.palette-row-main').click()
  await page.waitForFunction(
    (n) => document.querySelectorAll('.editor-cell').length === n + 1,
    before
  )
  await row('NAME').getByText('使用 1 次', { exact: true }).waitFor()

  // Text component with a tags fallback: the preview shows the tags as text, the order can be changed.
  await page.getByRole('tab', { name: '內容', exact: true }).click()
  await button('新增備用欄位').click()
  await page.getByRole('textbox', { name: '第 2 順位欄位', exact: true }).click()
  await page.getByRole('option', { name: /^Genre · 自建 · 標籤 → 文字$/ }).click()
  await page.getByRole('status').filter({ hasText: '預覽中的「Library」顯示：Genre' }).waitFor()
  const added = page.locator('.editor-cell.selected')
  await added.getByText('Action, RPG').waitFor()
  assert.equal(await button('找使用備用欄位的資料夾').isDisabled(), false)
  await button('找使用備用欄位的資料夾').click()
  assert.match(
    await page.getByRole('textbox', { name: '使用真實資料預覽', exact: true }).inputValue(),
    /^Library · /
  )
  const cellId = await added.getAttribute('data-cell-id')
  await button('上移 Genre').click()
  assert.match(
    await page.getByRole('textbox', { name: '綁定欄位', exact: true }).inputValue(),
    /^Genre/
  )

  await button('儲存').click()
  await page.locator('.editor-page').waitFor({ state: 'hidden' })
  const saved = (await readJson(projectFile(media, project.projectId))) as Project
  const cell = saved.cells.find((c) => c.cellId === cellId)!
  assert.equal(cell.attributeId, 'genre')
  assert.deepEqual(cell.fallbackIds, ['steam-name'])
  assert.ok(saved.fieldBindings.some((f) => f.attributeId === 'dlsite-title'))
  assert.ok(saved.fieldBindings.some((f) => f.alias === 'Zzz'))
  assert.deepEqual(await records(), originalRecords, 'the editor never rewrites folder records')

  // Reopened, the order is kept.
  await button('編輯版面').click()
  await page.locator(`.editor-cell[data-cell-id="${cellId}"]`).click()
  await page.getByRole('tab', { name: '內容', exact: true }).click()
  assert.match(
    await page.getByRole('textbox', { name: '綁定欄位', exact: true }).inputValue(),
    /^Genre/
  )
  await page.getByRole('button', { name: /^(放棄變更|關閉)$/ }).click()
  await page.locator('.editor-page').waitFor({ state: 'hidden' })

  // Folder settings: 0 and false are values (shown without "show empty fields"); a field being cleared stays.
  await button('目前資料夾設定').click()
  const drawer = page.getByRole('region', { name: '資料夾設定 · Library', exact: true })
  await drawer.waitFor()
  assert.equal(await drawer.getByLabel('Score', { exact: true }).inputValue(), '0')
  assert.equal(await drawer.getByRole('textbox', { name: 'Flag', exact: true }).inputValue(), '否')
  const note = drawer.getByLabel('Note', { exact: true })
  await note.fill('')
  await page.waitForTimeout(200)
  assert.equal(await note.isVisible(), true, 'a field being cleared does not disappear')

  assert.deepEqual(errors, [])
  passed = true
  console.log(
    'PASS editor fields: source groups, not-added rows, search, create from search, value filter, reference only, text with tags fallback order; folder settings keep 0/false and a cleared field. ' +
      root
  )
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
