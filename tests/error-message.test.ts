import { test } from 'node:test'
import assert from 'node:assert/strict'
import { errorMessage } from '../shared/notifications'

test('IPC error prefixes are removed from user-facing messages', () => {
  assert.equal(
    errorMessage(
      "Error: Error invoking remote method 'explorer:request': Error: 此資料夾尚未建立資料"
    ),
    '此資料夾尚未建立資料'
  )
  assert.equal(errorMessage('Error: 無法開啟'), '無法開啟')
  assert.equal(
    errorMessage('專案已建立，但群組保存失敗：Error: x'),
    '專案已建立，但群組保存失敗：Error: x'
  )
})
