// One-command screenshot of a sample project, for checking a UI change without writing a throwaway script.
//   pnpm shot <game|manga|album|other> [--width 1000] [--height 800] [--mode CARD|TABLE|TREE]
//                                      [--child <folder name>] [--settings] [--project-settings [delete]] [--backup [create|undo]] [--editor [--select N] [--section NAME]] [--fields] [--theme dark|glass|paper] [--home] [--click BUTTON] [--press KEY] [--out path.png]
// Needs a current build (`pnpm build`). Writes the PNG under .test-output/shot/ and prints its path.
import fs from 'node:fs/promises'
import path from 'node:path'
import { Library } from '../../electron/library'
import { readFolder, saveFolder } from '../../electron/files'
import { closeApp, launchApp, removeTestRoot } from './app'

const args = process.argv.slice(2)
const kind = (['game', 'manga', 'album', 'other'] as const).find((name) => name === args[0])
const option = (name: string) => {
  const index = args.indexOf('--' + name)
  return index >= 0 ? args[index + 1] : undefined
}
if (!kind) {
  console.error(
    'Usage: pnpm shot <game|manga|album|other> [--width N] [--height N] [--mode CARD|TABLE|TREE] [--child NAME] [--settings] [--project-settings [delete]] [--backup [create|undo]] [--editor [--select N] [--section NAME]] [--fields] [--theme dark|glass|paper] [--home] [--click BUTTON] [--press KEY] [--out FILE]'
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
// --big N adds N files to the first folder, to see how heavy folders behave.
const big = Number(option('big') ?? 0)
if (big)
  for (let index = 0; index < big; index++)
    await fs.writeFile(path.join(media, folders[kind][0].split('/')[0], `extra-${index}.png`), png)
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

if (args.includes('--import-source')) {
  // Fields that came from a website, to see how the game field table shows their source.
  const dir = path.join(media, folders[kind][0].split('/')[0])
  const record = await readFolder(dir)
  const url = 'https://www.dlsite.com/maniax/work/=/product_id/RJ01117836.html'
  const field = (key: string, value: string, source: string) => ({
    attributeId: key.toLowerCase(),
    key,
    type: 'string' as const,
    value,
    source,
  })
  record.attributes = [
    field('SOURCE_URL', url, url),
    field('MAKER_ID', 'RG47502', url),
    field('PRODUCT_ID', 'RJ01117836', url),
    field('note', 'typed by hand', 'manual'),
  ]
  await saveFolder(dir, record, record.revision)
  await created.projects.length
}
if (args.includes('--fields')) {
  // Sample fields and bound components so the editor's field settings can be inspected.
  const project = created.projects[0].project!
  const style = { textColor: '#e4e6e8', backgroundColor: 'transparent' }
  const status = crypto.randomUUID(),
    score = crypto.randomUUID(),
    steam = crypto.randomUUID(),
    dlsite = crypto.randomUUID(),
    getchu = crypto.randomUUID(),
    groups = args.includes('--groups')
  if (groups) {
    // The first folder has only the DLsite title, so the group shows its second member.
    const dir = path.join(media, folders[kind][0].split('/')[0])
    const record = await readFolder(dir)
    record.attributes = [
      {
        attributeId: dlsite,
        key: 'DLsite 作品名',
        type: 'string',
        value: '夏の終わりに',
        source: 'manual',
      },
    ]
    await saveFolder(dir, record, record.revision)
  }
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
    ...(groups
      ? {
          fieldGroups: [
            { groupId: 'title-group', name: '遊戲標題', memberIds: [steam, dlsite, getchu] },
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
        // --groups: the title component shows a field group instead of listing fallback fields.
        ...(groups ? { groupId: 'title-group' } : { fallbackIds: [dlsite] }),
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
    await page.waitForTimeout(500)
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
    // In a narrow window the open folder panel overlays the toolbar; close it first.
    const closePanel = page.getByRole('button', { name: '關閉資料夾內容', exact: true })
    if (await closePanel.isVisible()) await closePanel.click()
    await page.getByRole('button', { name: '編輯版面', exact: true }).click()
    await page.locator('.editor-page').waitFor()
    const select = option('select')
    if (select) await page.locator('.editor-cell').nth(Number(select)).click()
    const section = option('section')
    if (section)
      await page
        .getByRole('tab', { name: section, exact: true })
        .or(page.getByRole('button', { name: section, exact: true }))
        .first()
        .click()
  }
  if (args.includes('--settings'))
    await page.getByRole('tab', { name: '設定', exact: true }).click()
  if (option('backup') === 'undo')
    // Shows the way back after a settings restore (the id is only displayed, not used).
    await page.evaluate(() =>
      localStorage.setItem(
        'morph.settingsUndo',
        JSON.stringify({ id: '00000000-0000-0000-0000-000000000000', at: new Date().toISOString() })
      )
    )
  if (args.includes('--backup')) {
    // Application settings › Backup; "create" makes one backup first so the list shows.
    await page.getByRole('button', { name: '應用程式設定', exact: true }).click()
    await page.getByRole('tab', { name: '備份', exact: true }).click()
    if (option('backup') === 'create') {
      await page.getByRole('button', { name: '建立備份', exact: true }).click()
      await page.getByRole('listitem').first().waitFor()
    }
  }
  if (args.includes('--project-settings')) {
    // The project's Backup and removal tab; "delete" also opens the delete-info step.
    await page.getByRole('button', { name: '開啟專案 Shot', exact: true }).first().hover()
    await page.getByRole('button', { name: '專案選單 Shot', exact: true }).click()
    await page.getByRole('menuitem', { name: '專案設定', exact: true }).click()
    await page.getByRole('tab', { name: '移除', exact: true }).click()
    if (option('project-settings') === 'delete')
      await page.getByRole('button', { name: '刪除這個專案的資訊…', exact: true }).click()
  }
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
    if (option('enter'))
      await page.locator('.folder-card').filter({ hasText: card }).first().dblclick()
    // Time from the click to the panel title changing, measured inside the page.
    const elapsed = await page.evaluate(async (name) => {
      const element = [...document.querySelectorAll<HTMLElement>('.folder-card')].find((c) =>
        c.textContent?.includes(name)
      )!
      const start = performance.now()
      element.click()
      await new Promise<void>((resolve) => {
        const tick = () =>
          document.querySelector('.folder-panel-header strong')?.textContent === name
            ? resolve()
            : requestAnimationFrame(tick)
        tick()
      })
      return Math.round(performance.now() - start)
    }, card)
    console.log('panel update after', elapsed, 'ms')
    await page.waitForTimeout(300)
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
  if (args.includes('--panel-timing')) {
    // Close the panel, then time how long opening it takes to show the folder's content.
    await page.locator('.folder-card').first().click()
    await page.waitForTimeout(800)
    await page.getByRole('button', { name: '關閉資料夾內容', exact: true }).click()
    await page.waitForTimeout(600)
    const timing = await page.evaluate(async () => {
      const toggle = document.querySelector<HTMLElement>('[aria-label="切換右側內容"]')!
      const start = performance.now()
      toggle.click()
      let shell = 0
      await new Promise<void>((resolve) => {
        const tick = () => {
          if (!shell && document.querySelector('.folder-panel-header'))
            shell = performance.now() - start
          const loading = document.querySelector('.folder-panel-body .media-loading')
          const body = document.querySelector('.folder-panel-body')
          if (
            shell &&
            body &&
            !loading &&
            document.querySelectorAll('.media-thumbnail img').length > 0
          )
            resolve()
          else requestAnimationFrame(tick)
        }
        tick()
      })
      return { shell: Math.round(shell), content: Math.round(performance.now() - start) }
    })
    console.log('panel open:', JSON.stringify(timing))
  }
  const text = option('text')
  if (text)
    for (const part of text.split('|')) await page.getByText(part, { exact: true }).first().click()
  const click = option('click')
  if (click) await page.getByRole('button', { name: click, exact: true }).first().click()
  const evaluate = option('eval')
  if (evaluate) console.log('eval:', await page.evaluate(evaluate))
  const press = option('press')
  if (press) await page.keyboard.press(press)
  if (press && (option('card') || option('enter'))) {
    await page.waitForTimeout(500)
    console.log(
      'after press:',
      await page
        .locator('.folder-panel-header strong')
        .first()
        .innerText()
        .catch(() => '(none)')
    )
  }
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
