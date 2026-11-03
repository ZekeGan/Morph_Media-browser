import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateDetails,
  validateFolder,
  validateProject,
  withoutGroupCells,
} from '../shared/model'
import { modelDetails, modelFolder, modelProject } from './support/model-fixtures'

const reject = (check: (value: unknown) => void, value: unknown, message: string) => {
  assert.throws(
    () => check(value),
    (error) => error instanceof Error && error.message === message
  )
}

test('portable validation accepts representative records without changing values or schema', () => {
  for (const [check, value] of [
    [validateFolder, modelFolder()],
    [validateProject, modelProject()],
    [validateDetails, modelDetails()],
  ] as const) {
    const before = structuredClone(value)
    check(value)
    assert.deepEqual(value, before)
    assert.equal(value.schemaVersion, 1)
    reject(
      check,
      { ...value, schemaVersion: 2 },
      check === validateFolder
        ? '記錄損壞、版本不支援或不屬於本程式；原檔保留'
        : check === validateProject
          ? '專案設定不合法或版本不支援'
          : '內容設定不合法'
    )
  }
})

test('folder identity, duplicate attributes and portable asset paths reject invalid input', () => {
  const message = '記錄損壞、版本不支援或不屬於本程式；原檔保留'
  for (const folderId of ['', '__proto__', 'constructor', 'prototype', 'a'.repeat(101)]) {
    reject(validateFolder, { ...modelFolder(), folderId }, message)
  }
  const folder = modelFolder()
  reject(
    validateFolder,
    { ...folder, attributes: [folder.attributes[0], folder.attributes[0]] },
    message
  )
  for (const relativePath of [
    '../cover.png',
    '/assets/cover.png',
    'C:/cover.png',
    'assets\\cover.png',
    'assets/cover.exe',
  ]) {
    reject(validateFolder, { ...folder, assets: [{ ...folder.assets[0], relativePath }] }, message)
  }
  assert.doesNotThrow(() =>
    validateFolder({ ...folder, projectOverrides: { another: folder.attributes } })
  )
  reject(validateFolder, { ...folder, projectOverrides: JSON.parse('{"__proto__":[]}') }, message)
})

test('CELL bounds, required field bindings, aliases and overlap keep distinct failures', () => {
  const project = {
    ...modelProject(),
    layoutPresets: undefined,
    activeLayoutId: undefined,
    contentCells: undefined,
  }
  const cell = project.cells[0]
  for (const grid of [
    { x: -1, y: 0, w: 1, h: 1 },
    { x: 0, y: 0.5, w: 1, h: 1 },
    { x: 11, y: 0, w: 2, h: 1 },
    { x: 0, y: 99, w: 1, h: 2 },
  ])
    reject(
      validateProject,
      { ...project, cells: [{ ...cell, grid }] },
      '專案設定不合法或版本不支援'
    )
  assert.doesNotThrow(() =>
    validateProject({ ...project, cells: [{ ...cell, grid: { x: 11, y: 99, w: 1, h: 1 } }] })
  )
  reject(
    validateProject,
    { ...project, cells: [{ ...cell, kind: 'field-text', attributeId: undefined }] },
    '專案設定不合法或版本不支援'
  )
  assert.doesNotThrow(() =>
    validateProject({ ...project, cells: [{ ...cell, kind: 'image', attributeId: undefined }] })
  )
  reject(
    validateProject,
    {
      ...project,
      fieldBindings: [
        project.fieldBindings[0],
        { alias: 'title', attributeId: 'another', type: 'string' },
      ],
    },
    '組件 ID 或欄位別名重複'
  )
  reject(
    validateProject,
    { ...project, cells: [cell, { ...cell, cellId: 'another' }] },
    '組件不能重疊'
  )
  reject(validateProject, { ...project, cells: [cell, cell] }, '組件 ID 或欄位別名重複')
})

test('optional project rules preserve CARD limits, presets and first error ordering', () => {
  const project = modelProject()
  assert.doesNotThrow(() =>
    validateProject({ ...project, cardView: { mode: 'single', level: 51 } })
  )
  reject(
    validateProject,
    { ...project, cardView: { mode: 'single', level: 'all' } },
    'CARD 顯示範圍不合法'
  )
  reject(validateProject, { ...project, activeLayoutId: 'missing' }, '作用中方案不存在')
  reject(validateProject, { ...project, layoutPresets: undefined }, '方案清單不存在')
  reject(validateProject, { ...project, contentCells: { invalid: [] } }, '內容模板不合法')
  reject(
    validateProject,
    { ...project, savedSearches: Array.from({ length: 101 }, () => project.savedSearches![0]) },
    '常用搜尋不合法'
  )
})

test('subtitle, playback and launch validation retain numeric and path boundaries', () => {
  const details = modelDetails(),
    playback = details.playback!.video
  for (const time of [NaN, Infinity, -1, 1e9]) {
    reject(
      validateDetails,
      { ...details, playback: { video: { ...playback, time } } },
      '播放設定不合法'
    )
  }
  const settings = playback.settings!.sub
  for (const patch of [
    { offset: Infinity },
    { offset: 86400.1 },
    { size: 9 },
    { size: 80.1 },
    { bottom: 81 },
    { encoding: 'unknown' },
    { color: 'red' },
  ]) {
    reject(
      validateDetails,
      {
        ...details,
        playback: { video: { ...playback, settings: { sub: { ...settings, ...patch } } } },
      },
      '播放設定不合法'
    )
  }
  assert.doesNotThrow(() =>
    validateDetails({
      ...details,
      playback: {
        video: {
          time: 1e9 - 1,
          settings: { sub: { ...settings, offset: -86400, size: 80, bottom: 80 } },
        },
      },
    })
  )
  reject(
    validateDetails,
    { ...details, targets: { play: { ...details.targets!.play, path: '../outside.exe' } } },
    '任務設定不合法'
  )
  reject(
    validateDetails,
    { ...details, targets: { play: { ...details.targets!.play, args: ['bad\0argument'] } } },
    '任務設定不合法'
  )
  reject(
    validateDetails,
    {
      ...details,
      subtitles: [{ id: 'sub', name: 'sub', relativePath: 'subtitles/../outside.srt' }],
    },
    '字幕記錄不合法'
  )
  reject(validateDetails, { ...details, reading: { page: -1 } }, '閱讀設定不合法')
})

test('validation preserves existing optional null compatibility and rejected input values', () => {
  const legacy = {
    schemaVersion: 1,
    boundary: null,
    reading: null,
    targets: null,
    subtitles: null,
    playback: null,
  }
  const before = structuredClone(legacy)
  validateDetails(legacy)
  assert.deepEqual(legacy, before)
})

test('image fit is limited to image cells and valid values', () => {
  const project = modelProject()
  const cell = {
    cellId: 'fit-cell',
    kind: 'image' as const,
    imageFit: 'cover' as const,
    grid: { x: 0, y: 9, w: 12, h: 3 },
    style: { textColor: '#e4e6e8', backgroundColor: 'transparent' },
  }
  project.cells.push(cell)
  assert.doesNotThrow(() => validateProject(project))
  for (const imageFit of ['contain', 'cover', 'blur'] as const)
    assert.doesNotThrow(() =>
      validateProject({ ...project, cells: [...project.cells.slice(0, -1), { ...cell, imageFit }] })
    )
  reject(
    validateProject,
    { ...project, cells: [...project.cells.slice(0, -1), { ...cell, imageFit: 'stretch' }] },
    '專案設定不合法或版本不支援'
  )
  reject(
    validateProject,
    {
      ...project,
      cells: [...project.cells.slice(0, -1), { ...cell, kind: 'name', imageFit: 'cover' }],
    },
    '專案設定不合法或版本不支援'
  )
})

test('group cells were removed: they are invalid, and older saved projects load without them', () => {
  const style = { textColor: '#e4e6e8', backgroundColor: 'transparent' }
  const old = modelProject()
  old.cells.push({
    cellId: 'group-1',
    kind: 'group',
    grid: { x: 0, y: 8, w: 12, h: 3 },
    style,
    cells: [
      { cellId: 'a', kind: 'static-text', text: 'a', grid: { x: 0, y: 0, w: 12, h: 1 }, style },
    ],
  } as never)
  reject(validateProject, old, '專案設定不合法或版本不支援')
  const loaded = withoutGroupCells(old)
  assert.doesNotThrow(() => validateProject(loaded))
  assert.equal(
    loaded.cells.some((c) => c.cellId === 'group-1' || c.cellId === 'a'),
    false
  )
  assert.equal(
    old.cells.some((c) => c.cellId === 'group-1'),
    true
  )
})

test('cell presentation extras are limited to the kinds that use them', () => {
  const withCell = (extra: Record<string, unknown>, kind = 'field-number') => {
    const project = modelProject()
    project.fieldBindings.push({ alias: 'N', attributeId: 'n-field', type: 'number' })
    project.cells.push({
      cellId: 'extra',
      kind,
      attributeId: kind.startsWith('field-') ? 'n-field' : undefined,
      grid: { x: 0, y: 9, w: 12, h: 1 },
      style: { textColor: '#e4e6e8', backgroundColor: 'transparent' },
      ...extra,
    } as never)
    return project
  }
  const bad = '專案設定不合法或版本不支援'
  assert.doesNotThrow(() =>
    validateProject(withCell({ unit: '分', unitPosition: 'prefix', decimals: 2 }))
  )
  reject(validateProject, withCell({ decimals: 7 }), bad)
  reject(validateProject, withCell({ unit: 'x'.repeat(21) }), bad)
  reject(validateProject, withCell({ unitPosition: 'left' }), bad)
  reject(validateProject, withCell({ unit: '分' }, 'static-text'), bad)
  assert.doesNotThrow(() => validateProject(withCell({ wrap: true }, 'name')))
  reject(validateProject, withCell({ wrap: true }), bad)
  const styled = (style: Record<string, unknown>) =>
    withCell({ style: { textColor: '#e4e6e8', backgroundColor: 'transparent', ...style } })
  assert.doesNotThrow(() => validateProject(styled({ fontSize: 'large', align: 'center' })))
  reject(validateProject, styled({ fontSize: 'huge' }), bad)
  reject(validateProject, styled({ align: 'justify' }), bad)
})

test('greater/less display conditions need a number or date field and a value of that type', () => {
  const build = (type: string, value: unknown, operator = 'gt') => {
    const project = modelProject()
    project.fieldBindings.push({ alias: 'M', attributeId: 'metric', type } as never)
    project.cells.push({
      cellId: 'cond',
      kind: 'static-text',
      text: 'x',
      grid: { x: 0, y: 9, w: 12, h: 1 },
      style: { textColor: '#e4e6e8', backgroundColor: 'transparent' },
      condition: { attributeId: 'metric', operator, value },
    } as never)
    return project
  }
  assert.doesNotThrow(() => validateProject(build('number', 3)))
  assert.doesNotThrow(() => validateProject(build('date', '2026-01-31', 'lt')))
  reject(validateProject, build('string', 'a'), '組件顯示條件不合法')
  reject(validateProject, build('boolean', true), '組件顯示條件不合法')
  reject(validateProject, build('date', 'not a date'), '組件顯示條件不合法')
  reject(validateProject, build('number', 'three'), '組件顯示條件不合法')
})

test('shortcut targets stay inside the game folder, take no arguments, and launch cells name a valid action', () => {
  const details = modelDetails()
  const shortcut = (extra: Record<string, unknown>) => ({
    ...details,
    targets: {
      le: { kind: 'shortcut', path: 'Game - LE.lnk', relative: true, args: [], ...extra },
    },
  })
  assert.doesNotThrow(() => validateDetails(shortcut({}) as never))
  assert.doesNotThrow(() => validateDetails(shortcut({ path: 'Store.url' }) as never))
  for (const bad of [
    { path: 'Game.exe' },
    { path: 'sub/Game.lnk' },
    { path: '..\\Game.lnk' },
    { relative: false, path: 'D:\\Game.lnk' },
    { args: ['--x'] },
  ])
    assert.throws(() => validateDetails(shortcut(bad) as never), Error, JSON.stringify(bad))

  const project = modelProject()
  const launch = {
    cellId: 'launch',
    kind: 'game-launch' as const,
    grid: { x: 0, y: 9, w: 6, h: 1 },
    style: { textColor: '#e4e6e8', backgroundColor: 'transparent' },
  }
  project.cells.push({ ...launch, actionId: 'le' })
  assert.doesNotThrow(() => validateProject(project))
  reject(
    validateProject,
    { ...project, cells: [...project.cells.slice(0, -1), { ...launch, actionId: 'bad id!' }] },
    '專案設定不合法或版本不支援'
  )
  reject(
    validateProject,
    {
      ...project,
      cells: [...project.cells.slice(0, -1), { ...launch, kind: 'name', actionId: 'le' }],
    },
    '專案設定不合法或版本不支援'
  )
  assert.doesNotThrow(() =>
    validateProject({
      ...project,
      actionTemplates: [{ id: 'le', label: 'LE', kind: 'shortcut', color: '#123456' }],
    })
  )
})
