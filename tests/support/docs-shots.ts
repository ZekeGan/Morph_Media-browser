// Screenshots for the documentation, from the generated sample library. Needs a current build (`pnpm build`).
//   pnpm shot:docs [name…]    writes PNGs under docs/images/ (all of them when no name is given)
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Page } from 'playwright-core'
import { Library } from '../../electron/library'
import { closeApp, launchApp, removeTestRoot } from './app'
import { readFolder, saveFolder } from '../../electron/files'
import type { Cell } from '../../shared/model'
import { buildDemoLibrary, demoDetails } from './demo-data'

const out = path.resolve('docs/images'),
  want = process.argv.slice(2)
const themeName = { glass: '霧白玻璃', paper: '暖紙墨橘' }

type Shot = {
  name: string
  width?: number
  height?: number
  theme?: keyof typeof themeName
  run: (page: Page) => Promise<void>
}
const openProject = async (page: Page) => {
  await page.getByRole('button', { name: '開啟專案 示範收藏', exact: true }).first().click()
  await page.locator('.workspace-toolbar').waitFor()
}
const mode = (label: string) => async (page: Page) => {
  await openProject(page)
  await page.locator('.center-mode').getByText(label, { exact: true }).click()
}
const select = (name: string) => async (page: Page) => {
  await mode('卡片')(page)
  const card = page.locator('.folder-card').filter({ hasText: name }).first()
  // The list only renders the cards near the viewport.
  for (let step = 0; step < 8 && !(await card.count()); step++) {
    await page.mouse.move(700, 500)
    await page.mouse.wheel(0, 500)
    await page.waitForTimeout(300)
  }
  await card.click()
  await page.locator('.folder-panel-header').filter({ hasText: name }).waitFor()
}
const shots: Shot[] = [
  { name: '01-main-card', run: select('月光花園') },
  { name: '02-table', run: mode('表格') },
  { name: '03-tree', run: mode('樹狀圖') },
  {
    name: '04-editor',
    run: async (page) => {
      await openProject(page)
      await page.getByRole('button', { name: '編輯版面', exact: true }).click()
      await page.locator('.editor-page').waitFor()
      await page.getByRole('textbox', { name: '使用真實資料預覽' }).click()
      await page.getByRole('option').filter({ hasText: '月光花園' }).first().click()
      await page.locator('.editor-cell').first().click()
    },
  },
  {
    name: '05-create-project',
    run: async (page) => {
      await page.getByRole('button', { name: '新增專案', exact: true }).first().click()
      await page.getByRole('dialog').waitFor()
    },
  },
  { name: '06-theme-glass', theme: 'glass', run: select('月光花園') },
  { name: '07-theme-paper', theme: 'paper', run: select('月光花園') },
  {
    name: '08-narrow',
    width: 900,
    run: async (page) => {
      await openProject(page)
      // On a narrow window the folder panel opens over the list; close it so the cards show.
      const close = page.getByRole('button', { name: '關閉資料夾內容', exact: true })
      if (await close.count()) await close.click()
      await page.locator('.panel-scrim').waitFor({ state: 'hidden' })
    },
  },
]

const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
await fs.mkdir(out, { recursive: true })
// The sample library sits at the top of the drive, so no personal folder name shows in the screenshots.
const root = path.join(path.parse(base).root, 'Morph-Demo'),
  local = path.join(base, 'docs-shots-local')
await fs.rm(root, { recursive: true, force: true })
await fs.rm(local, { recursive: true, force: true })
await fs.mkdir(root, { recursive: true })
const media = await buildDemoLibrary(root)
const library = new Library(local, undefined, false)
await library.init()
const created = await library.create(media, {
  name: '示範收藏',
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})
// A card with a cover, name, tags, rating and status, so the screenshots show what a finished layout looks like.
const project = created.projects[0].project!,
  style = { textColor: '#e4e6e8', backgroundColor: 'transparent' },
  ids = { tags: 'demo-tags', score: 'demo-score', status: 'demo-status' }
const at = (y: number, h: number, x = 0, w = 12) => ({ x, y, w, h })
const cells: Cell[] = [
  {
    cellId: 'cover',
    kind: 'image',
    attributeId: 'demo-cover',
    imageIndex: 1,
    imageFit: 'cover',
    grid: at(0, 4),
    style,
  },
  { cellId: 'name', kind: 'name', grid: at(4, 1), style: { ...style, weight: 'bold' } },
  { cellId: 'tags', kind: 'field-tags', attributeId: ids.tags, grid: at(5, 2), style },
  {
    cellId: 'score',
    kind: 'field-number',
    attributeId: ids.score,
    presentation: 'rating',
    maximum: 5,
    grid: at(7, 1, 0, 7),
    style,
  },
  {
    cellId: 'status',
    kind: 'field-enum',
    attributeId: ids.status,
    presentation: 'badge',
    grid: at(7, 1, 7, 5),
    style,
  },
]
await library.saveProject({
  ...project,
  cells,
  fieldBindings: [
    { alias: '標籤', attributeId: ids.tags, type: 'tags' },
    { alias: '評分', attributeId: ids.score, type: 'number' },
    { alias: '狀態', attributeId: ids.status, type: 'enum', options: ['進行中', '已完成', '想看'] },
  ],
})
for (const [name, info] of Object.entries(demoDetails)) {
  const dir = path.join(media, name),
    record = await readFolder(dir)
  record.attributes = [
    { attributeId: ids.tags, key: '標籤', type: 'tags', value: info.tags, source: 'manual' },
    { attributeId: ids.score, key: '評分', type: 'number', value: info.score, source: 'manual' },
    { attributeId: ids.status, key: '狀態', type: 'enum', value: info.status, source: 'manual' },
  ]
  await saveFolder(dir, record, record.revision)
}
await library.scan()
try {
  for (const shot of shots.filter((s) => !want.length || want.some((n) => s.name.includes(n)))) {
    const errors: string[] = []
    // Every shot starts from the same saved state; the app remembers the folder it was left in.
    const copy = local + '-run'
    await fs.rm(copy, { recursive: true, force: true })
    await fs.cp(local, copy, { recursive: true })
    const { app, page } = await launchApp(copy, errors, {
      width: shot.width ?? 1500,
      height: shot.height ?? 900,
    })
    try {
      if (shot.theme) {
        await page.getByRole('button', { name: '應用程式設定', exact: true }).click()
        await page
          .getByRole('button', { name: themeName[shot.theme] + ' 主題', exact: true })
          .click()
        await page.waitForTimeout(500)
        await page.keyboard.press('Escape')
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
      }
      await shot.run(page)
      await page.mouse.move(5, 890)
      await page.waitForTimeout(1200)
      const file = path.join(out, shot.name + '.png')
      await page.screenshot({ path: file })
      console.log(file)
      if (errors.length) console.log('Renderer errors:', errors.join(' | '))
    } finally {
      await closeApp(app)
    }
  }
} finally {
  if (path.basename(root) === 'Morph-Demo') await fs.rm(root, { recursive: true, force: true })
  await removeTestRoot(local)
  await removeTestRoot(local + '-run')
}
