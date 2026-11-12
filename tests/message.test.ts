import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fmt, hasMessage, plainMessage, renderMessages } from '../shared/message'
import { errorMessage } from '../shared/notifications'
import { setLocale, t } from '../src/i18n'

test('marked messages fill their values back in for plain text', () => {
  const text = fmt('建立可攜記錄失敗：{0}', 'D:\\收藏\\a "b"')
  assert.ok(hasMessage(text))
  assert.equal(plainMessage(text), '建立可攜記錄失敗：D:\\收藏\\a "b"')
  assert.equal(plainMessage('沒有標記'), '沒有標記')
  assert.equal(hasMessage('沒有標記'), false)
})

test('messages joined with other text and nested in values still come apart', () => {
  const text = fmt('匯入失敗：{0}{1}{2}', 'x', fmt('；已還原變更'), fmt('（備份：{0}）', 'C:\\b'))
  assert.equal(plainMessage(text), '匯入失敗：x；已還原變更（備份：C:\\b）')
  const joined = '摘要\n' + fmt('{0}: 略過連結', 'a') + '\n' + fmt('{0}: 略過連結', 'b')
  assert.equal(plainMessage(joined), '摘要\na: 略過連結\nb: 略過連結')
  assert.equal(
    renderMessages(joined, (key, values) => `[${key}|${values.join(',')}]`),
    '摘要\n[{0}: 略過連結|a]\n[{0}: 略過連結|b]'
  )
})

test('the window translates the sentence, then the values, after IPC prefixes are removed', () => {
  const sent = errorMessage(
    "Error: Error invoking remote method 'explorer:request': Error: " +
      fmt('匯入失敗：{0}{1}{2}', 'x', fmt('；已還原變更'), fmt('（備份：{0}）', 'C:\\b'))
  )
  setLocale('en')
  try {
    assert.equal(t(sent), 'Import failed: x; the changes were undone (backup: C:\\b)')
  } finally {
    setLocale('zh-TW')
  }
  assert.equal(t(sent), '匯入失敗：x；已還原變更（備份：C:\\b）')
})

test('a damaged marker is left as it is rather than dropped', () => {
  const broken = '\u001e鍵\u001fnot json\u001d'
  assert.equal(plainMessage(broken), broken)
})
