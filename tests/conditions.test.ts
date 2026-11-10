import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cellVisible, ruleText } from '../shared/cells'
import {
  cellsWithoutField,
  validateProject,
  type Cell,
  type FolderRow,
  type Project,
} from '../shared/model'
import { modelProject } from './support/model-fixtures'

// Display conditions with several parts, relative dates, and layout text chosen by rules (R-239).
const style = { textColor: '#ffffff', backgroundColor: 'transparent' }
const cell = (patch: Partial<Cell>): Cell => ({
  cellId: 'c',
  kind: 'static-text',
  text: 'Other',
  grid: { x: 0, y: 0, w: 12, h: 1 },
  style,
  ...patch,
})
const row = (values: Record<string, unknown>) =>
  ({
    projectId: 'p',
    record: {
      attributes: Object.entries(values).map(([attributeId, value]) => ({ attributeId, value })),
      projectOverrides: {},
    },
  }) as unknown as FolderRow
const project = (cells: Cell[]): Project => ({
  ...modelProject(),
  fieldBindings: [
    { alias: 'Released', attributeId: 'released', type: 'date' },
    { alias: 'Score', attributeId: 'score', type: 'number' },
    { alias: 'Note', attributeId: 'note', type: 'string' },
  ],
  cells,
  layoutPresets: undefined,
  activeLayoutId: undefined,
  contentCells: undefined,
})
const now = Date.parse('2026-11-10T12:00:00Z')

test('within and older compare a date with today, in days', () => {
  const recent = cell({ condition: { attributeId: 'released', operator: 'within', value: 90 } })
  const old = cell({ condition: { attributeId: 'released', operator: 'older', value: 90 } })
  const fresh = row({ released: '2026-10-01' }),
    stale = row({ released: '2015-05-05' })
  assert.equal(cellVisible(recent, fresh, undefined, now), true)
  assert.equal(cellVisible(recent, stale, undefined, now), false)
  assert.equal(cellVisible(old, stale, undefined, now), true)
  assert.equal(
    cellVisible(old, row({}), undefined, now),
    false,
    'no date is neither recent nor old'
  )
  // A date alone counts whole days: exactly N days ago is still within, whatever the time of day.
  const week = cell({ condition: { attributeId: 'released', operator: 'within', value: 7 } })
  const local = (h: number) => new Date(2026, 10, 10, h).getTime()
  assert.equal(cellVisible(week, row({ released: '2026-11-03' }), undefined, local(1)), true)
  assert.equal(cellVisible(week, row({ released: '2026-11-03' }), undefined, local(23)), true)
  assert.equal(cellVisible(week, row({ released: '2026-11-02' }), undefined, local(1)), false)
})

test('several conditions must all hold, or any one with "any"', () => {
  const both = cell({
    condition: { attributeId: 'score', operator: 'gt', value: 4 },
    moreConditions: [{ attributeId: 'note', operator: 'set' }],
  })
  assert.equal(cellVisible(both, row({ score: 5, note: 'x' })), true)
  assert.equal(cellVisible(both, row({ score: 5 })), false)
  const either = { ...both, conditionMode: 'any' as const }
  assert.equal(cellVisible(either, row({ score: 5 })), true)
  assert.equal(cellVisible(either, row({ score: 1 })), false)
})

test('layout text takes the first rule that holds, then its own text', () => {
  const rules = cell({
    textRules: [
      { when: { attributeId: 'released', operator: 'within', value: 90 }, text: 'New' },
      { when: { attributeId: 'released', operator: 'lt', value: '2016-01-01' }, text: 'Classic' },
    ],
  })
  assert.equal(ruleText(rules, row({ released: '2026-10-01' }), undefined, now), 'New')
  assert.equal(ruleText(rules, row({ released: '2015-05-05' }), undefined, now), 'Classic')
  assert.equal(ruleText(rules, row({ released: '2020-01-01' }), undefined, now), 'Other')
  assert.equal(ruleText({ ...rules, text: '' }, row({}), undefined, now), '', 'empty means nothing')
})

test('validation keeps the new condition parts consistent', () => {
  const ok = (c: Partial<Cell>) => validateProject(project([cell(c)]))
  const bad = (c: Partial<Cell>) => assert.throws(() => validateProject(project([cell(c)])))
  ok({ condition: { attributeId: 'released', operator: 'within', value: 30 } })
  bad({ condition: { attributeId: 'score', operator: 'within', value: 30 } })
  bad({ condition: { attributeId: 'released', operator: 'within', value: 0 } })
  bad({ moreConditions: [{ attributeId: 'note', operator: 'set' }] })
  bad({ condition: { attributeId: 'note', operator: 'set' }, conditionMode: 'any' })
  ok({
    textRules: [{ when: { attributeId: 'note', operator: 'set' }, text: 'Has note' }],
  })
  ok({ textRules: [{ when: { attributeId: 'note', operator: 'set' }, text: '' }] })
  bad({
    textRules: Array.from({ length: 11 }, () => ({
      when: { attributeId: 'note', operator: 'set' as const },
      text: 'x',
    })),
  })
  assert.throws(() =>
    validateProject(
      project([
        {
          ...cell({}),
          kind: 'field-text',
          attributeId: 'note',
          textRules: [{ when: { attributeId: 'note', operator: 'set' }, text: 'x' }],
        },
      ])
    )
  )
})

test('deleting a field drops the extra conditions and rules that read it', () => {
  const c = cell({
    condition: { attributeId: 'score', operator: 'gt', value: 4 },
    moreConditions: [{ attributeId: 'note', operator: 'set' }],
    conditionMode: 'any',
    textRules: [{ when: { attributeId: 'note', operator: 'set' }, text: 'Has note' }],
  })
  const [kept] = cellsWithoutField([c], 'note')
  assert.equal(kept.moreConditions, undefined)
  assert.equal(kept.conditionMode, undefined)
  assert.equal(kept.textRules, undefined)
  assert.equal(
    cellsWithoutField([c], 'score').length,
    0,
    'the main condition still removes the cell'
  )
})
