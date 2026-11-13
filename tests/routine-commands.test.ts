import { test } from 'node:test'
import assert from 'node:assert/strict'
// @ts-expect-error - plain .mjs tooling modules without type declarations
import * as items from '../scripts/item.mjs'
// @ts-expect-error - plain .mjs tooling modules without type declarations
import { addMessages } from '../scripts/i18n.mjs'

const { acceptItems, addItem, confirmCard, confirmLimits, moveItems, nextId } = items

const list = [
  '# 需求清單',
  '',
  '## 待你決定',
  '',
  '## 待查收',
  '',
  '- **R-301** 舊的 ｜小｜一般｜無｜領域：novel｜依賴：無',
  '  驗收：看一下。',
  '',
  '## 進行中',
  '',
  '## 已核定（未做）',
  '',
  '## 已登記（未核定）',
  '',
  '- **R-302** 待做 ｜中｜一般｜無｜領域：browse｜依賴：無',
  '  說明一行。',
  '',
  '## 擱置',
  '',
  '## 已知限制（不是需求）',
  '',
  '- 很慢。（領域：novel、reader｜確認：2026-11-01）',
  '- 很大。（領域：core｜確認：2026-11-01）',
  '',
].join('\n')

test('R-358: the next number is one above any R number in use', () => {
  assert.equal(nextId(list, 'R-355 in the changelog', 'R-99'), 'R-356')
  assert.equal(nextId(''), 'R-201')
})

test('R-358: an item is registered in its section with the list format', () => {
  const text = addItem(
    list,
    {
      title: '新的',
      size: '小',
      risk: '一般',
      data: '無',
      areas: ['novel', 'reader'],
      note: '補充。',
    },
    'R-303'
  )
  assert.match(
    text,
    /## 已登記（未核定）\n\n- \*\*R-303\*\* 新的 ｜小｜一般｜無｜領域：novel、reader｜依賴：無\n {2}補充。\n\n- \*\*R-302\*\*/
  )
  assert.throws(() =>
    addItem(list, { title: 'x', size: '超大', risk: '一般', data: '無', areas: ['a'] }, 'R-1')
  )
})

test('R-358: items move between sections; review replaces the notes with how to check', () => {
  const started = moveItems(list, ['R-302'], 'doing')
  assert.match(started, /## 進行中\n\n- \*\*R-302\*\* 待做[^\n]*\n {2}說明一行。\n\n## 已核定/)
  assert.match(started, /## 已登記（未核定）\n\n## 擱置/)
  const reviewed = moveItems(started, ['R-302'], 'review', '打開看看。')
  assert.match(
    reviewed,
    /## 待查收\n\n- \*\*R-302\*\* 待做[^\n]*\n {2}驗收：打開看看。\n\n- \*\*R-301\*\*/
  )
  assert.doesNotMatch(reviewed, /說明一行/)
  assert.throws(() => moveItems(started, ['R-302'], 'review'), /--check/)
  assert.throws(() => moveItems(list, ['R-999'], 'doing'), /找不到/)
})

test('R-358: only reviewed items are accepted (deleted) unless forced', () => {
  const accepted = acceptItems(list, ['R-301'])
  assert.match(accepted, /## 待查收\n\n## 進行中/)
  assert.throws(() => acceptItems(list, ['R-302']), /不在待查收/)
  assert.doesNotMatch(acceptItems(list, ['R-302'], true), /R-302/)
})

test('R-358: confirming a spec card or known limits sets today', () => {
  const card = '# 卡\n\n> 最後確認：2026-11-01（R-1）。說明。\n'
  assert.equal(
    confirmCard(card, '2026-11-13', 'R-9'),
    '# 卡\n\n> 最後確認：2026-11-13（R-9）。說明。\n'
  )
  assert.equal(confirmCard(card, '2026-11-13'), '# 卡\n\n> 最後確認：2026-11-13（R-1）。說明。\n')
  assert.throws(() => confirmCard('# 沒有日期', '2026-11-13'))
  const limits = confirmLimits(list, '2026-11-13', ['reader'])
  assert.equal(limits.count, 1)
  assert.match(limits.text, /很慢。（領域：novel、reader｜確認：2026-11-13）/)
  assert.match(limits.text, /很大。（領域：core｜確認：2026-11-01）/)
})

test('R-358: messages come in all five languages with the same placeholders', () => {
  const { messages, added } = addMessages(
    { 舊: { 'zh-CN': '旧', en: 'Old', ja: '古い', es: 'Viejo' } },
    { '第 {0} 頁': ['第 {0} 页', 'Page {0}', '{0} ページ', 'Página {0}'] }
  )
  assert.deepEqual(added, ['第 {0} 頁'])
  assert.deepEqual(messages['第 {0} 頁'], {
    'zh-CN': '第 {0} 页',
    en: 'Page {0}',
    ja: '{0} ページ',
    es: 'Página {0}',
  })
  assert.throws(
    () => addMessages({}, { '第 {0} 頁': ['第页', 'Page {0}', '{0}', '{0}'] }),
    /佔位符/
  )
  assert.throws(() => addMessages({}, { 缺: ['缺', 'Missing', '欠け'] }), /缺少 es/)
  assert.throws(() => addMessages(messages, { 舊: ['旧', 'Old', '古い', 'Viejo'] }), /已經有翻譯/)
})
