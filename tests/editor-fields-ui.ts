import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { folderFile, projectFile, readFolder, readJson } from '../electron/files'
import type { Project } from '../shared/model'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// The editor's "Your fields" section (source groups, not-yet-added rows, search, create from search, value filter,
// reference only), a field group shown by a text component (made from the row menu, a tags member converted, order
// changed in the opened group, saved) and the folder settings keeping 0 / false and a field being cleared visible.
// Folder records are never rewritten by the editor.
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

  // Fields are grouped by source in a fixed order: own fields first, then websites by name. A source with nothing
  // added starts folded, and fields not added yet fold into one line.
  const groups = await fields.locator('.field-source-group > summary').allInnerTexts()
  assert.deepEqual(
    groups.map((text) => text.split(/\s/)[0]),
    ['自建', 'DLsite', 'Steam']
  )
  const source = (name: string) =>
    fields
      .locator('.field-source-group')
      .filter({ has: page.locator('summary', { hasText: name }) })
  const unfold = async (name: string) => {
    await source(name).locator('summary').click()
    await source(name)
      .getByRole('button', { name: /個尚未加入$/ })
      .click()
  }
  assert.equal(await row('TITLE').count(), 0, 'folded until asked')
  await unfold('DLsite')
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
  await fields.getByText(/^已隱藏 \d+ 個未填欄位$/).waitFor({ state: 'hidden' })
  assert.equal(await button('只看有值').getAttribute('aria-pressed'), 'false')

  // "Reference only" adds the field to the project without putting it on the card.
  const before = await cells()
  await button('欄位操作 TITLE').click()
  await page.getByRole('menuitem', { name: '只引用欄位', exact: true }).click()
  await row('TITLE').getByText('使用 0 次', { exact: true }).waitFor()
  assert.equal(await cells(), before)
  await row('TITLE').waitFor()

  // A click on a not-yet-added field adds it and puts it on the card, selected.
  await unfold('Steam')
  await row('NAME').locator('.palette-row-main').click()
  await page.waitForFunction(
    (n) => document.querySelectorAll('.editor-cell').length === n + 1,
    before
  )
  await row('NAME').getByText('使用 1 次', { exact: true }).waitFor()

  // Field group (R-226): NAME starts a group from its row menu, Genre (tags) joins it, and the selected component
  // shows the group. The preview shows the tags as text, from the first member with a value.
  const menuPath = async (row: string, ...items: string[]) => {
    await button('欄位操作 ' + row).click()
    for (const item of items.slice(0, -1))
      await page.getByRole('menuitem', { name: item, exact: true }).hover()
    await page.getByRole('menuitem', { name: items.at(-1)!, exact: true }).click()
  }
  const groupName = 'NAME 群組'
  await menuPath('NAME', '加入群組', '新群組')
  await fields.getByRole('region', { name: '群組 ' + groupName, exact: true }).waitFor()
  await button('返回欄位清單').click()
  await source('自建')
    .getByRole('button', { name: /個尚未加入$/ })
    .click()
  await menuPath('Genre', '加入群組', groupName)
  assert.equal(await row('NAME').count(), 0, 'a grouped field moves into its group')
  await page.getByRole('tab', { name: '內容', exact: true }).click()
  await button('更換').click()
  await page.getByRole('option', { name: groupName, exact: true }).click()
  await page.getByRole('status').filter({ hasText: '預覽中的「Library」顯示：Genre' }).waitFor()
  const added = page.locator('.editor-cell.selected')
  await added.getByText('Action, RPG').waitFor()
  assert.equal(await button('找顯示後面欄位的資料夾').isDisabled(), false)
  await button('找顯示後面欄位的資料夾').click()
  assert.match(
    await page.getByRole('textbox', { name: '使用真實資料預覽', exact: true }).inputValue(),
    /^Library · /
  )
  const cellId = await added.getAttribute('data-cell-id')
  // The opened group changes the order.
  await button('打開群組 ' + groupName).click()
  await button('成員操作 Genre').click()
  await page.getByRole('menuitem', { name: '上移', exact: true }).click()
  await fields
    .locator('.palette-member .palette-field-name')
    .first()
    .filter({ hasText: 'Genre' })
    .waitFor()
  await button('返回欄位清單').click()

  await button('儲存').click()
  await page.locator('.editor-page').waitFor({ state: 'hidden' })
  const saved = (await readJson(projectFile(media, project.projectId))) as Project
  const cell = saved.cells.find((c) => c.cellId === cellId)!
  const group = saved.fieldGroups!.find((g) => g.name === groupName)!
  assert.deepEqual(group.memberIds, ['genre', 'steam-name'])
  assert.equal(cell.groupId, group.groupId)
  assert.equal(cell.fallbackIds, undefined)
  assert.ok(saved.fieldBindings.some((f) => f.attributeId === 'genre'))
  assert.ok(saved.fieldBindings.some((f) => f.attributeId === 'dlsite-title'))
  assert.ok(saved.fieldBindings.some((f) => f.alias === 'Zzz'))
  assert.deepEqual(await records(), originalRecords, 'the editor never rewrites folder records')

  // Reopened, the component still shows the group.
  await button('編輯版面').click()
  await page.locator(`.editor-cell[data-cell-id="${cellId}"]`).click()
  await page.getByRole('tab', { name: '內容', exact: true }).click()
  await page.getByText(`群組「${groupName}」`, { exact: true }).waitFor()

  // Field management window (R-225): the same source groups, one field's details beside the list.
  await button('管理欄位').click()
  const manager = page.getByRole('dialog', { name: '管理欄位', exact: true })
  const managed = (name: string) =>
    manager.locator('.field-manager-row').filter({ has: page.getByText(name, { exact: true }) })
  const heading = (name: string) => manager.getByRole('heading', { name, exact: true })
  const search2 = manager.getByRole('textbox', { name: '搜尋欄位', exact: true })
  await search2.fill('DLsite')
  assert.equal(await manager.locator('.field-manager-row').count(), 1, 'search matches the source')
  await search2.fill('')
  await managed('Note').click()
  await heading('Note').waitFor()
  await manager.getByText('1 個資料夾有值，例如：hello').waitFor()
  await managed('Note').getByText('文字 · 使用 0 次', { exact: true }).waitFor()
  // Changing the purpose says what will happen first, and only happens after confirming (R-223).
  const changeTo = async (purpose: string) => {
    await manager.getByRole('button', { name: '改成…', exact: true }).click()
    await page.getByRole('menuitem', { name: purpose, exact: true }).click()
  }
  const confirm = manager.getByRole('button', { name: '確認改用途', exact: true })
  await changeTo('單選')
  await manager.getByText('選項：hello', { exact: true }).waitFor()
  await managed('Note').getByText('文字 · 使用 0 次', { exact: true }).waitFor()
  await confirm.click()
  await managed('Note').getByText('單選 · 使用 0 次', { exact: true }).waitFor()
  await manager.locator('.mantine-Pill-label').filter({ hasText: 'hello' }).waitFor()
  await managed('Zzz').click()
  await changeTo('多個值')
  await manager.getByText('卡片上的組件保留原本的呈現', { exact: true }).waitFor()
  await confirm.click()
  await managed('Zzz').getByText('多個值 · 使用 0 次', { exact: true }).waitFor()
  // A field sharing a group cannot become a choice from a list; the reason is shown. Grouped fields are listed in
  // their group, whose details open a member's own details.
  await managed('NAME 群組').click()
  await manager.getByRole('button', { name: 'NAME', exact: true }).click()
  await heading('NAME').waitFor()
  await changeTo('單選')
  await manager.getByRole('alert').filter({ hasText: '群組' }).waitFor()
  assert.equal(await confirm.isDisabled(), true)
  await manager.getByRole('button', { name: '取消', exact: true }).click()
  // A new field is chosen by purpose and shown right away.
  await manager.getByRole('button', { name: '新增欄位', exact: true }).click()
  await form.getByLabel('欄位名稱').fill('Cast')
  await form.getByRole('radio', { name: /^多個值/ }).check()
  assert.equal(await form.getByLabel('選項（逗號或換行分隔）').count(), 0)
  await form.getByRole('radio', { name: /^單選/ }).check()
  await form.getByLabel('選項（逗號或換行分隔）').waitFor()
  await form.getByLabel('選項（逗號或換行分隔）').fill(', ，')
  await form.getByLabel('欄位名稱').fill('Cast')
  assert.equal(
    await form.getByRole('button', { name: '新增欄位', exact: true }).isDisabled(),
    true,
    'separators alone are not options'
  )
  await form.getByLabel('選項（逗號或換行分隔）').fill('')
  await form.getByRole('radio', { name: /^多個值/ }).check()
  await form.getByRole('button', { name: '新增欄位', exact: true }).click()
  await heading('Cast').waitFor()
  await managed('Cast').getByText('多個值 · 使用 0 次', { exact: true }).waitFor()
  // With no values to take options from, they are typed in first.
  await changeTo('單選')
  assert.equal(await confirm.isDisabled(), true)
  const typedOption = manager.getByRole('textbox', { name: '還沒有可用的值，請先輸入選項' })
  await typedOption.fill('A')
  await typedOption.press('Enter')
  await manager.getByText('選項：A', { exact: true }).waitFor()
  await manager.getByRole('button', { name: '取消', exact: true }).click()
  // Rename from the details opens the same rename dialog.
  await manager.getByRole('button', { name: '重新命名欄位 Cast', exact: true }).click()
  const rename = page.getByRole('dialog', { name: '重新命名欄位', exact: true })
  await rename.getByLabel('欄位名稱').fill('Cast list')
  await rename.getByRole('button', { name: '確認', exact: true }).click()
  await heading('Cast list').waitFor()
  // A narrow window shows the list or the details, with a way back.
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 900, height: 950 })
  )
  const list = manager.locator('.field-manager-list')
  await list.waitFor({ state: 'hidden' })
  await manager.getByRole('button', { name: '返回欄位清單', exact: true }).click()
  await list.waitFor()
  assert.equal(await manager.locator('.field-manager-detail').isVisible(), false)
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setBounds({ width: 1500, height: 950 })
  )
  // "Used N times" counts every layout and lists them on hover (R-228); the details have no "Used in" section.
  await managed('NAME 群組').getByText('使用 1 次', { exact: true }).hover()
  await page.getByRole('tooltip').filter({ hasText: '目前版面 1' }).waitFor()
  assert.equal(await manager.getByText('用在哪裡').count(), 0) // ui-names: ignore (checks the section is gone)
  await page.keyboard.press('Escape')
  await manager.waitFor({ state: 'hidden' })
  // The row's menu opens the same details directly.
  await button('欄位操作 Note').click()
  await page.getByRole('menuitem', { name: '欄位設定…', exact: true }).click()
  await heading('Note').waitFor()
  await page.keyboard.press('Escape')
  await manager.waitFor({ state: 'hidden' })
  await button('儲存').click()
  await page.locator('.editor-page').waitFor({ state: 'hidden' })
  const typed = (await readJson(projectFile(media, project.projectId))) as Project
  const binding = (id: string) => typed.fieldBindings.find((f) => f.attributeId === id)!
  assert.equal(binding('note').type, 'enum')
  assert.deepEqual(binding('note').options, ['hello'])
  assert.equal(typed.fieldBindings.find((f) => f.alias === 'Zzz')!.type, 'tags')
  assert.equal(typed.fieldBindings.find((f) => f.alias === 'Cast list')!.type, 'tags')
  assert.equal(binding('steam-name').type, 'string')
  assert.deepEqual(
    await records(),
    originalRecords,
    'switching types does not rewrite folder records'
  )

  // Folder settings: 0 and false are values (shown without "show empty fields"); a field being cleared stays.
  await button('目前資料夾設定').click()
  const drawer = page.getByRole('region', { name: '資料夾設定 · Library', exact: true })
  await drawer.waitFor()
  assert.equal(await drawer.getByLabel('Score', { exact: true }).inputValue(), '0')
  assert.equal(await drawer.getByRole('textbox', { name: 'Flag', exact: true }).inputValue(), '否')
  // A group lists its members together; this folder can choose the member it shows (saved in the project), and a
  // member without a value cannot be chosen.
  const groupBlock = drawer.locator('.field-group-block').filter({ hasText: groupName })
  await groupBlock.getByText('顯示「Genre」').waitFor()
  await groupBlock.getByRole('textbox', { name: '這個資料夾顯示', exact: true }).click()
  assert.equal(
    await page
      .getByRole('option', { name: 'NAME', exact: true })
      .getAttribute('data-combobox-disabled'),
    'true'
  )
  await page.getByRole('option', { name: 'Genre', exact: true }).click()
  const chosenSource = async () =>
    ((await readJson(projectFile(media, project.projectId))) as Project).groupSources?.[
      rootRecord.folderId
    ]?.[group.groupId]
  for (let i = 0; i < 50 && (await chosenSource()) !== 'genre'; i++) await page.waitForTimeout(100)
  assert.equal(await chosenSource(), 'genre')
  // Note is now a choice field but this folder saved it as text: it is edited as text, with a note why.
  await drawer.getByText('這個資料夾的值仍以原本的格式保存，編輯時沿用').waitFor()
  const note = drawer.getByLabel('Note', { exact: true })
  await note.fill('')
  await page.waitForTimeout(200)
  assert.equal(await note.isVisible(), true, 'a field being cleared does not disappear')

  assert.deepEqual(errors, [])
  passed = true
  console.log(
    'PASS editor fields: source groups, not-added rows, search, create from search, value filter, reference only, field group (row menu, tags member, shown by a component, order, saved), folder chooses a group member, field manager (list and details, search, purpose change with impact, refused change, new field by purpose, rename, narrow view, use count breakdown, row menu); folder settings keep 0/false, a cleared field and the old-type note. ' +
      root
  )
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
