// One-command screenshot of a sample project, for checking a UI change without writing a throwaway script.
//   pnpm shot <game|manga|album|other> [--width 1000] [--height 800] [--mode CARD|TABLE|TREE]
//                                      [--child <folder name>] [--settings] [--editor [--select N] [--section NAME]] [--fields] [--theme dark|glass|paper] [--home] [--click BUTTON] [--press KEY] [--out path.png]
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
    'Usage: pnpm shot <game|manga|album|other> [--width N] [--height N] [--mode CARD|TABLE|TREE] [--child NAME] [--settings] [--editor [--select N] [--section NAME]] [--fields] [--theme dark|glass|paper] [--home] [--click BUTTON] [--press KEY] [--out FILE]'
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
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})

if (args.includes('--fields')) {
  // Sample fields and bound components so the editor's field settings can be inspected.
  const project = created.projects[0].project!
  const style = { textColor: '#e4e6e8', backgroundColor: 'transparent' }
  const status = crypto.randomUUID(),
    score = crypto.randomUUID(),
    steam = crypto.randomUUID(),
    dlsite = crypto.randomUUID(),
    getchu = crypto.randomUUID()
  await library.saveProject({
    ...project,
    ...(kind === 'game'
      ? {
          actionTemplates: [
            {
              id: 'default-launch-game',
              label: '啟動遊戲',
              kind: 'exe' as const,
              color: '#168c77',
            },
            { id: 'le', label: '用 LE 啟動', kind: 'shortcut' as const, color: '#123456' },
          ],
        }
      : {}),
    fieldBindings: [
      { alias: '狀態', attributeId: status, type: 'enum', options: ['進行中', '已完成'] },
      { alias: '評分', attributeId: score, type: 'number' },
      { alias: 'Steam 遊戲名', attributeId: steam, type: 'string' },
      { alias: 'DLsite 作品名', attributeId: dlsite, type: 'string' },
      { alias: 'Getchu タイトル', attributeId: getchu, type: 'string' },
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
      {
        cellId: crypto.randomUUID(),
        kind: 'field-text',
        attributeId: steam,
        fallbackIds: [dlsite],
        grid: { x: 0, y: 7, w: 12, h: 1 },
        style,
      },
      {
        cellId: crypto.randomUUID(),
        kind: 'image' as const,
        attributeId: crypto.randomUUID(),
        imageIndex: 2,
        grid: { x: 0, y: 9, w: 6, h: 3 },
        style,
      },
      ...(kind === 'game'
        ? [
            {
              cellId: crypto.randomUUID(),
              kind: 'game-launch' as const,
              fallbackActionIds: ['le'],
              grid: { x: 0, y: 8, w: 12, h: 1 },
              style,
            },
          ]
        : []),
    ],
  })
}
const errors: string[] = []
const { app, page } = await launchApp(local, errors, { width, height })
try {
  const theme = option('theme')
  if (theme) {
    // Switch through the real appearance dialog so Mantine's color scheme follows the app theme.
    const name = { glass: '霧白玻璃', paper: '暖紙墨橘', dark: '深色經典' }[theme as 'dark']
    await page.getByRole('button', { name: '應用程式設定', exact: true }).click()
    await page.getByRole('button', { name: name + ' 主題', exact: true }).click()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  if (!args.includes('--home')) {
    await page.getByRole('button', { name: '開啟專案 Shot', exact: true }).first().click()
    await page.locator('.workspace-toolbar').waitFor()
  }
  const mode = option('mode')
  if (mode) {
    const label = { CARD: '卡片', TABLE: '表格', TREE: '樹狀圖' }[mode as 'CARD']
    await page.locator('.center-mode').getByText(label, { exact: true }).click()
  }
  const child = option('child')
  if (child)
    await page.locator('.media-subfolder').getByRole('button', { name: child, exact: true }).click()
  if (args.includes('--editor')) {
    await page.getByRole('button', { name: '編輯版面', exact: true }).click()
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
  if (args.includes('--mark')) {
    // Ctrl+click marks the first two folders so the batch type bar can be inspected.
    const items = page.locator('.folder-card, .folder-table tbody tr')
    await items.nth(0).click({ modifiers: ['Control'] })
    await items.nth(1).click({ modifiers: ['Control'] })
  }
  // --card NAME selects a folder card (single click), --enter NAME opens it (double click); the panel title and the
  // center path are printed so panel/center behaviour can be checked without a throwaway script.
  const card = option('card') ?? option('enter')
  if (card) {
    const target = page.locator('.folder-card').filter({ hasText: card }).first()
    if (option('enter')) await target.dblclick()
    else await target.click()
    await page.waitForTimeout(500)
    console.log(
      'panel:',
      await page
        .locator('.folder-panel-header strong')
        .first()
        .innerText()
        .catch(() => '(none)'),
      '| center:',
      await page.getByRole('navigation', { name: '資料夾路徑' }).innerText()
    )
  }
  const text = option('text')
  if (text) await page.getByText(text, { exact: true }).first().click()
  const click = option('click')
  if (click) await page.getByRole('button', { name: click, exact: true }).first().click()
  const press = option('press')
  if (press) await page.keyboard.press(press)
  await page.waitForTimeout(900)
  const out = path.resolve(
    option('out') ??
      path.join(base, 'shot', `${kind}-${width}x${height}${mode ? '-' + mode : ''}.png`)
  )
  await fs.mkdir(path.dirname(out), { recursive: true })
  const crop = option('crop')?.split(',').map(Number)
  await page.screenshot({
    path: out,
    ...(crop?.length === 4
      ? { clip: { x: crop[0], y: crop[1], width: crop[2], height: crop[3] } }
      : {}),
  })
  console.log(out)
  if (errors.length) console.log('Renderer errors:', errors.join(' | '))
} finally {
  await closeApp(app)
  await removeTestRoot(root)
}
