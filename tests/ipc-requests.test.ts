import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isExplorerRequest, isLibraryRequest, isWorkspaceCommand } from '../electron/ipc-requests'

test('library requests: known actions with the right field types pass', () => {
  assert.ok(isLibraryRequest({ action: 'snapshot' }))
  assert.ok(isLibraryRequest({ action: 'link' }))
  assert.ok(isLibraryRequest({ action: 'link', rootToken: 'abc' }))
  assert.ok(
    isLibraryRequest({
      action: 'create',
      input: { name: 'A', depth: { mode: 'exact', level: 1 } },
    })
  )
  assert.ok(isLibraryRequest({ action: 'saveFolder', rowId: 'r', revision: 3, values: { a: 'x' } }))
  assert.ok(
    isLibraryRequest({ action: 'restoreBackup', token: 't', settings: true, projects: ['p'] })
  )
})

test('library requests: unknown actions, missing fields and wrong types are refused', () => {
  for (const bad of [
    null,
    'snapshot',
    [],
    {},
    { action: 'toString' },
    { action: '__proto__' },
    { action: 'deleteEverything' },
    { action: 'unlink' },
    { action: 'unlink', projectId: '' },
    { action: 'unlink', projectId: 5 },
    { action: 'saveFolder', rowId: 'r', revision: '3', values: {} },
    { action: 'saveFolder', rowId: 'r', revision: 1.5, values: {} },
    { action: 'saveFolder', rowId: 'r', revision: 1, values: { a: 1 } },
    { action: 'cleanupPreview', rowId: 'r', scope: 'everything' },
    { action: 'cleanup', token: 't', restart: 'yes' },
    { action: 'create', input: { name: 'A', depth: 1 } },
    { action: 'restoreBackup', token: 't', settings: true, projects: [1] },
    { action: 'open', rowId: 'a\0b' },
  ])
    assert.equal(isLibraryRequest(bad), false, JSON.stringify(bad))
})

test('explorer requests check field types, including nested batch rows', () => {
  assert.ok(isExplorerRequest({ action: 'visit', rowId: 'r' }))
  assert.ok(isExplorerRequest({ action: 'search', query: '' }))
  assert.ok(isExplorerRequest({ action: 'folderKind', rowId: 'r', revision: 0, kind: null }))
  assert.ok(
    isExplorerRequest({
      action: 'batch',
      rows: [{ rowId: 'r', revision: 1 }],
      attributeId: 'a',
      value: ['x'],
      mode: 'add',
    })
  )
  assert.equal(isExplorerRequest(null), false)
  assert.equal(isExplorerRequest({ action: 'visit' }), false)
  assert.equal(
    isExplorerRequest({ action: 'batch', rows: [{ rowId: 'r' }], attributeId: 'a', mode: 'add' }),
    false
  )
  assert.equal(
    isExplorerRequest({ action: 'playback', rowId: 'r', revision: 1, fileId: 'f', time: NaN }),
    false
  )
  assert.equal(
    isExplorerRequest({
      action: 'bindTarget',
      rowId: 'r',
      revision: 1,
      templateId: 't',
      args: [1],
    }),
    false
  )
})

test('workspace commands check field types', () => {
  assert.ok(isWorkspaceCommand({ action: 'moveProject', projectId: 'p', groupId: null }))
  assert.ok(isWorkspaceCommand({ action: 'layout' }))
  assert.equal(isWorkspaceCommand({ action: 'favorite', projectId: 'p', value: 'true' }), false)
  assert.equal(isWorkspaceCommand({ action: 'reorderSections', ids: 'a,b' }), false)
  assert.equal(isWorkspaceCommand({ action: 'unknown' }), false)
})
