import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { ensureFolder, folderFile, readFolder } from '../electron/files'
import type { Cell } from '../shared/model'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// The "launch game" cell: disabled until the folder has a bound launch file, enabled afterwards. Never clicked here.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'game-launch-cell-ui-')),
  media = path.join(root, 'Games'),
  local = path.join(root, 'local')
for (const name of ['Unbound', 'Bound']) {
  await fs.mkdir(path.join(media, name), { recursive: true })
  await fs.writeFile(path.join(media, name, 'Game.exe'), 'x')
}
const lib = new Library(local, undefined, false)
await lib.init()
await lib.create(media, {
  name: 'Launch',
  mediaCategory: 'game',
  scanAll: true,
  depth: { mode: 'through', level: 2 },
})
const project = lib.snapshot().projects[0].project!,
  style = { textColor: '#e4e6e8', backgroundColor: 'transparent' }
const cells: Cell[] = [
  { cellId: 'name', kind: 'name', grid: { x: 0, y: 0, w: 12, h: 1 }, style },
  { cellId: 'launch', kind: 'game-launch', grid: { x: 0, y: 1, w: 6, h: 1 }, style },
]
await lib.saveProject({
  ...project,
  cells,
  layoutPresets: [{ id: 'default', name: 'Default', cells }],
  activeLayoutId: 'default',
  cardView: { mode: 'single', level: 2 },
})
await ensureFolder(path.join(media, 'Bound'), false)
const record = await readFolder(path.join(media, 'Bound'))
record.details = {
  schemaVersion: 1,
  targets: { 'default-launch-game': { kind: 'exe', path: 'Game.exe', relative: true, args: [] } },
}
await fs.writeFile(folderFile(path.join(media, 'Bound')), JSON.stringify(record))
await lib.scan()

const errors: string[] = []
const { app, page } = await launchApp(local, errors)
let passed = false
try {
  await page.getByRole('button', { name: '開啟專案 Launch', exact: true }).first().click()
  const card = (name: string) =>
    page
      .locator('.folder-card')
      .filter({ has: page.locator('.cell-name').getByText(name, { exact: true }) })
  await card('Bound').waitFor()
  assert.equal(await card('Unbound').getByRole('button', { name: '啟動遊戲' }).isDisabled(), true)
  assert.equal(await card('Bound').getByRole('button', { name: '啟動遊戲' }).isDisabled(), false)
  // The editor offers it for game projects only.
  await page.getByRole('button', { name: '更改樣式', exact: true }).click()
  await page
    .locator('.basic-palette')
    .getByRole('button', { name: '啟動遊戲', exact: true })
    .waitFor()
  assert.deepEqual(errors, [])
  passed = true
  console.log(
    'PASS game launch cell: disabled when unbound, enabled when bound, offered in the editor. ' +
      root
  )
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
