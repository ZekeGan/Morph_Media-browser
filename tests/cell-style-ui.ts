import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { ensureFolder, folderFile, readFolder } from '../electron/files'
import type { Cell } from '../shared/model'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// Text, box and tag/choice colour styles show on cards and can be set in the editor's Style section.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'cell-style-ui-')),
  media = path.join(root, 'Library'),
  local = path.join(root, 'local')
await fs.mkdir(path.join(media, 'Item'), { recursive: true })
const lib = new Library(local, undefined, false)
await lib.init()
await lib.create(media, {
  name: 'Styles',
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})
const project = lib.snapshot().projects[0].project!,
  plain = { textColor: '#e4e6e8', backgroundColor: 'transparent' },
  cells: Cell[] = [
    {
      cellId: 'name',
      kind: 'name',
      grid: { x: 0, y: 0, w: 12, h: 1 },
      style: {
        ...plain,
        weight: 'bold',
        italic: true,
        underline: true,
        strike: true,
        fontSize: 'xlarge',
        letterSpacing: 'wide',
        lineHeight: 'loose',
        opacity: 'soft',
      },
    },
    {
      cellId: 'box',
      kind: 'path',
      grid: { x: 0, y: 1, w: 12, h: 1 },
      style: {
        ...plain,
        padding: 'roomy',
        radius: 'large',
        borderColor: '#3fb68b',
        borderWidth: 'thick',
        valign: 'bottom',
        align: 'right',
      },
    },
    {
      cellId: 'tags',
      kind: 'field-tags',
      attributeId: 'tags',
      tagColors: 'namespace',
      tagPrefix: false,
      grid: { x: 0, y: 2, w: 12, h: 1 },
      style: plain,
    },
    {
      cellId: 'status',
      kind: 'field-enum',
      attributeId: 'status',
      presentation: 'badge',
      grid: { x: 0, y: 3, w: 12, h: 1 },
      style: plain,
    },
  ]
await lib.saveProject({
  ...project,
  fieldBindings: [
    { alias: '標籤', attributeId: 'tags', type: 'tags' },
    {
      alias: '狀態',
      attributeId: 'status',
      type: 'enum',
      options: ['進行中', '已完成'],
      optionColors: { 已完成: '#2f9e44' },
    },
  ],
  cells,
  layoutPresets: [{ id: 'default', name: 'Default', cells }],
  activeLayoutId: 'default',
  cardView: { mode: 'single', level: 2 },
})
await ensureFolder(path.join(media, 'Item'), false)
const record = await readFolder(path.join(media, 'Item'))
record.attributes.push(
  {
    attributeId: 'tags',
    key: 'TAGS',
    type: 'tags',
    value: ['female:ahegao', 'male:condom', 'language:chinese'],
    source: 'manual',
  },
  { attributeId: 'status', key: 'STATUS', type: 'enum', value: '已完成', source: 'manual' }
)
await fs.writeFile(folderFile(path.join(media, 'Item')), JSON.stringify(record))
await lib.scan()

const errors: string[] = []
const { app, page } = await launchApp(local, errors)
let passed = false
try {
  await page.getByRole('button', { name: '開啟專案 Styles', exact: true }).first().click()
  const card = page.locator('.folder-card').filter({ has: page.locator('.cell-name') })
  await card.waitFor()
  const css = (selector: string, props: string[]) =>
    card
      .locator(selector)
      .first()
      .evaluate((node, names) => {
        const style = getComputedStyle(node)
        return Object.fromEntries(names.map((name) => [name, style.getPropertyValue(name)]))
      }, props)
  const name = await css('.card-cell:has(.cell-name)', [
    'font-weight',
    'font-style',
    'text-decoration-line',
    'letter-spacing',
    'opacity',
  ])
  assert.equal(name['font-weight'], '700')
  assert.equal(name['font-style'], 'italic')
  assert.ok(
    name['text-decoration-line'].includes('underline') &&
      name['text-decoration-line'].includes('line-through')
  )
  assert.notEqual(name['letter-spacing'], 'normal')
  assert.equal(name.opacity, '0.7')
  const box = await css('.card-cell:nth-child(2)', [
    'border-top-width',
    'border-top-left-radius',
    'padding-top',
    'align-items',
    'justify-content',
  ])
  // Device scaling can round the width (2px shows as 1.6px at 125%), so only check that it is thicker than 1px.
  assert.ok(parseFloat(box['border-top-width']) > 1.2)
  assert.equal(box['border-top-left-radius'], '14px')
  assert.equal(box['padding-top'], '12px')
  assert.equal(box['align-items'], 'flex-end')
  assert.equal(box['justify-content'], 'flex-end')
  // Tags: namespace colours differ and the prefix is left out; a choice uses its own colour.
  const badges = card.locator('.tag-list [data-tag]')
  assert.deepEqual(await badges.allInnerTexts(), ['ahegao', 'condom', 'chinese'])
  const tint = (index: number) =>
    badges.nth(index).evaluate((node) => getComputedStyle(node).backgroundColor)
  assert.notEqual(await tint(0), await tint(1))
  const status = card.locator('.mantine-Badge-root').filter({ hasText: '已完成' })
  const green = await status.evaluate((node) => getComputedStyle(node).color)
  assert.notEqual(green, await badges.first().evaluate((node) => getComputedStyle(node).color))

  // Editor: set the style of the selected cell through the Style section.
  await page.getByRole('button', { name: '編輯版面', exact: true }).click()
  await page.locator('.editor-cell').first().click()
  const inspector = page.getByRole('complementary', { name: '組件設定', exact: true })
  const section = inspector.getByRole('button', { name: '樣式', exact: true })
  if ((await section.getAttribute('aria-expanded')) !== 'true') await section.click()
  await inspector.getByRole('button', { name: '底線', exact: true }).waitFor()
  // The "title" preset makes it bold and large, and clears the other optional styles.
  await inspector.getByRole('textbox', { name: '套用預設樣式', exact: true }).click()
  await page.getByRole('option', { name: '標題', exact: true }).click()
  await page.waitForFunction(() => {
    const node = document.querySelector('.editor-cell') as HTMLElement
    return (
      getComputedStyle(node).fontWeight === '700' && getComputedStyle(node).fontStyle === 'normal'
    )
  })
  const italic = inspector.getByRole('button', { name: '斜體', exact: true })
  assert.equal(await italic.getAttribute('aria-pressed'), 'false')
  await italic.click()
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('.editor-cell')!).fontStyle === 'italic'
  )
  assert.equal(await italic.getAttribute('aria-pressed'), 'true')
  // The box styles open by themselves when the cell already uses some.
  const more = inspector.getByRole('button', { name: '更多樣式', exact: true })
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click()
  await inspector
    .getByRole('radiogroup', { name: '圓角', exact: true })
    .getByText('大', { exact: true })
    .click()
  await page.waitForFunction(
    () => getComputedStyle(document.querySelector('.editor-cell')!).borderTopLeftRadius === '14px'
  )
  await page.screenshot({ path: path.join(root, 'style-editor.png') })
  assert.deepEqual(errors, [])
  passed = true
  console.log(
    'PASS cell styles: text, box, tag and choice colours on cards; Style section with presets in the editor. ' +
      root
  )
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
