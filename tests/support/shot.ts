// One-command screenshot of a sample project, for checking a UI change without writing a throwaway script.
//   pnpm shot <game|manga|album|other> [--width 1000] [--height 800] [--mode CARD|TABLE|TREE]
//                                      [--child <folder name>] [--settings] [--editor [--select N] [--section NAME]] [--fields] [--out path.png]
// Needs a current build (`pnpm build`). Writes the PNG under .test-output/shot/ and prints its path.
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../../electron/library'
import { closeApp, launchApp, removeTestRoot } from './app'

const args = process.argv.slice(2)
const kind = (['game', 'manga', 'album', 'other'] as const).find((name) => name === args[0])
const option = (name: string) => {
  const index = args.indexOf('--' + name)
  return index >= 0 ? args[index + 1] : undefined
}
if (!kind) {
  console.error(
    'Usage: pnpm shot <game|manga|album|other> [--width N] [--height N] [--mode CARD|TABLE|TREE] [--child NAME] [--settings] [--editor [--select N] [--section NAME]] [--fields] [--out FILE]'
  )
  process.exit(2)
}
const width = Number(option('width') ?? 1500),
  height = Number(option('height') ?? 900)

// A 1x1 PNG is enough for thumbnails and covers.
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9X8AAAAASUVORK5CYII=',
  'base64'
)
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'shot-')),
  media = path.join(root, 'Library'),
  local = path.join(root, 'local')
const folders: Record<typeof kind, string[]> = {
  game: ['Game A/Game_Data', 'Game B/Game_Data', 'Notes'],
  manga: ['Work 1', 'Work 2'],
  album: ['Album 1', 'Album 2'],
  other: ['Folder 1', 'Folder 2'],
}
for (const folder of folders[kind]) await fs.mkdir(path.join(media, folder), { recursive: true })
for (const folder of folders[kind]) {
  const top = path.join(media, folder.split('/')[0])
  for (let index = 1; index <= 3; index++) await fs.writeFile(path.join(top, `${index}.png`), png)
}
if (kind === 'game') {
  await fs.writeFile(path.join(media, 'Game A', 'Game.exe'), 'x')
  await fs.writeFile(path.join(media, 'Game B', 'Game.exe'), 'x')
}
const library = new Library(local, undefined, false)
await library.init()
const created = await library.create(media, {
  name: 'Shot',
  mediaCategory: kind,
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})

if (args.includes('--fields')) {
  // Sample fields and bound components so the editor's field settings can be inspected.
  const project = created.projects[0].project!
  const style = { textColor: '#e4e6e8', backgroundColor: 'transparent' }
  const status = crypto.randomUUID(),
    score = crypto.randomUUID()
  await library.saveProject({
    ...project,
    fieldBindings: [
      { alias: '狀態', attributeId: status, type: 'enum', options: ['進行中', '已完成'] },
      { alias: '評分', attributeId: score, type: 'number' },
    ],
    cells: [
      ...project.cells,
      {
        cellId: crypto.randomUUID(),
        kind: 'field-enum',
        attributeId: status,
        grid: { x: 0, y: 6, w: 6, h: 1 },
        style,
      },
      {
        cellId: crypto.randomUUID(),
        kind: 'field-number',
        attributeId: score,
        grid: { x: 6, y: 6, w: 6, h: 1 },
        style,
        presentation: 'rating',
      },
    ],
  })
}
const errors: string[] = []
const { app, page } = await launchApp(local, errors, { width, height })
try {
  await page.getByRole('button', { name: '開啟專案 Shot', exact: true }).first().click()
  await page.locator('.workspace-toolbar').waitFor()
  const mode = option('mode')
  if (mode) {
    const label = { CARD: '卡片', TABLE: '表格', TREE: '樹狀圖' }[mode as 'CARD']
    await page.locator('.center-mode').getByText(label, { exact: true }).click()
  }
  const child = option('child')
  if (child)
    await page.locator('.media-subfolder').getByRole('button', { name: child, exact: true }).click()
  if (args.includes('--editor')) {
    await page.getByRole('button', { name: '更改樣式', exact: true }).click()
    await page.locator('.editor-page').waitFor()
    const select = option('select')
    if (select) await page.locator('.editor-cell').nth(Number(select)).click()
    const section = option('section')
    if (section) await page.getByRole('button', { name: section, exact: true }).click()
  }
  if (args.includes('--settings'))
    await page
      .locator('.folder-panel-header')
      .getByRole('button', { name: '資料夾設定', exact: true })
      .click()
  await page.waitForTimeout(900)
  const out = path.resolve(
    option('out') ??
      path.join(base, 'shot', `${kind}-${width}x${height}${mode ? '-' + mode : ''}.png`)
  )
  await fs.mkdir(path.dirname(out), { recursive: true })
  await page.screenshot({ path: out })
  console.log(out)
  if (errors.length) console.log('Renderer errors:', errors.join(' | '))
} finally {
  await closeApp(app)
  await removeTestRoot(root)
}
