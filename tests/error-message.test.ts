import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyError, errorMessage } from '../shared/notifications'

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

test('system errors are classified so the UI can say what to do next', () => {
  const kind = (text: string) => classifyError(errorMessage(text))
  assert.equal(kind("Error: EPERM: operation not permitted, rename 'C:\a' -> 'C:\b'"), 'permission')
  assert.equal(kind("EACCES: permission denied, open '/x'"), 'permission')
  assert.equal(kind('EBUSY: resource busy or locked'), 'busy')
  assert.equal(kind('ENOSPC: no space left on device'), 'diskFull')
  assert.equal(kind("ENOENT: no such file or directory, open 'x'"), 'missing')
  assert.equal(kind('getaddrinfo ENOTFOUND img.example.test'), 'offline')
  assert.equal(kind('版本衝突，請重新載入'), 'conflict')
  assert.equal(
    kind('欄位不存在，無法複製'),
    'unknown',
    'app messages that are already clear are left alone'
  )
})
