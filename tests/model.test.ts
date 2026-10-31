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

test('game cover cells are accepted only by game projects', () => {
  const withCover = (category: string, where: 'cells' | 'preset' | 'content') => {
    const project = modelProject()
    const cover = {
      cellId: 'game-cover-cell',
      kind: 'game-cover' as const,
      grid: { x: 0, y: 8, w: 12, h: 3 },
      style: { textColor: '#e4e6e8', backgroundColor: 'transparent' },
    }
    project.mediaCategory = category
    if (where === 'cells') project.cells.push(cover)
    else if (where === 'preset')
      project.layoutPresets![0].cells.push({ ...cover, cellId: 'game-cover-preset' })
    else project.contentCells!.manga.push({ ...cover, cellId: 'game-cover-content' })
    return project
  }
  for (const where of ['cells', 'preset', 'content'] as const) {
    assert.doesNotThrow(() => validateProject(withCover('game', where)))
    reject(validateProject, withCover('manga', where), '遊戲封面組件只能用於遊戲專案')
  }
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
