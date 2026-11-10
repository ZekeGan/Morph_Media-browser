import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { folderFile, projectFile, readFolder, readJson } from '../electron/files'
import type { Project } from '../shared/model'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// Layout text chosen by rules ("released within 90 days" → New) and a component with two display conditions, any
// of which shows it (R-239).
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'condition-rules-ui-')),
  media = path.join(root, 'Library'),
  local = path.join(root, 'local')
await fs.mkdir(media, { recursive: true })
const library = new Library(local, undefined, false)
await library.init()
const created = await library.create(media, {
  name: 'Rules',
  scanAll: true,
  depth: { mode: 'through', level: 1 },
})
const project = created.projects[0].project!
const style = { textColor: '#e4e6e8', backgroundColor: 'transparent' }
await library.saveProject({
  ...project,
  fieldBindings: [
    { alias: 'Released', attributeId: 'released', type: 'date' },
    { alias: 'Score', attributeId: 'score', type: 'number' },
  ],
  cells: [
    ...project.cells,
    { cellId: 'label', kind: 'static-text', text: '', grid: { x: 0, y: 10, w: 6, h: 1 }, style },
    {
      cellId: 'note',
      kind: 'static-text',
      text: 'Shown',
      grid: { x: 6, y: 10, w: 6, h: 1 },
      style,
    },
  ],
})
const recent = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10)
const record = await readFolder(media)
record.attributes = [
  { attributeId: 'released', key: 'Released', type: 'date', value: recent, source: 'manual' },
  { attributeId: 'score', key: 'Score', type: 'number', value: 2, source: 'manual' },
]
await fs.writeFile(folderFile(media), JSON.stringify(record))
await library.scan()

const errors: string[] = []
const { app, page } = await launchApp(local, errors, { width: 1500, height: 950 })
let passed = false
try {
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const box = (name: string) => page.getByRole('textbox', { name, exact: true })
  const pick = async (name: string, option: string) => {
    await box(name).click()
    await page.getByRole('option', { name: option, exact: true }).click()
  }
  await page.getByRole('button', { name: '開啟專案 Rules', exact: true }).first().click()
  await button('編輯版面').click()
  await page.locator('.editor-page').waitFor()
  // A rule: released within 90 days shows "New"; with nothing matching the text stays empty.
  await page.locator('.editor-cell[data-cell-id="label"]').click()
  await page.getByRole('tab', { name: '內容', exact: true }).click()
  await button('新增規則').click()
  await pick('規則 1 的欄位', 'Released')
  await pick('規則 1 的條件', '距今 N 天內')
  await page.getByRole('textbox', { name: '規則 1 的比較值' }).fill('90')
  await box('規則 1 顯示的文字').fill('New')
  await page.getByLabel('其他情況顯示的文字（留空就不顯示）').waitFor()
  await page
    .locator('.editor-cell[data-cell-id="label"]')
    .getByText('New', { exact: true })
    .waitFor()
  // Two conditions: score above 4, or released within 90 days; any one shows the component.
  await page.locator('.editor-cell[data-cell-id="note"]').click()
  await button('其他選項').click()
  await pick('顯示條件欄位', 'Score')
  await pick('顯示條件', '大於')
  await page.getByRole('textbox', { name: '比較值' }).fill('4')
  await page.locator('.editor-cell[data-cell-id="note"] .cell-condition-hidden').waitFor()
  await button('新增條件').click()
  await pick('條件 2 的欄位', 'Released')
  await pick('條件 2', '距今 N 天內')
  await page.getByRole('radiogroup', { name: '條件要', exact: true }).getByText('任一符合').click()
  await page
    .locator('.editor-cell[data-cell-id="note"]')
    .getByText('Shown', { exact: true })
    .waitFor()
  await button('儲存').click()
  await page.locator('.editor-page').waitFor({ state: 'hidden' })
  const saved = (await readJson(projectFile(media, project.projectId))) as Project
  const label = saved.cells.find((c) => c.cellId === 'label')!,
    note = saved.cells.find((c) => c.cellId === 'note')!
  assert.deepEqual(label.textRules, [
    { when: { attributeId: 'released', operator: 'within', value: 90 }, text: 'New' },
  ])
  assert.equal(note.condition?.operator, 'gt')
  assert.equal(note.moreConditions?.[0].operator, 'within')
  assert.equal(note.conditionMode, 'any')
  // The card shows the rule's text.
  await page.locator('.card-grid').getByText('New', { exact: true }).first().waitFor()
  assert.deepEqual(errors, [])
  passed = true
  console.log('PASS condition rules: layout text by rule, two conditions with any. ' + root)
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
