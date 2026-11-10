import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { removeEmptiedDir } from '../electron/files'

// R-227: a folder emptied a moment ago may still report ENOTEMPTY on Windows while another program closes its handle
// on a deleted file. The retry must never wait for, or remove, anything the operation did not delete itself.
const base = path.resolve('.test-output')
async function folder(t: { after: (fn: () => Promise<void>) => void }) {
  await fs.mkdir(base, { recursive: true })
  const dir = await fs.mkdtemp(path.join(base, 'remove-dir-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  return dir
}
const busy = (code: string) => Object.assign(new Error(code), { code })

test('a folder still listing only what was just deleted is retried until it goes', async (t) => {
  const dir = await folder(t),
    target = path.join(dir, 'meta')
  await fs.mkdir(target)
  // The deleted file is still listed, as Windows does while a scanner holds it.
  await fs.writeFile(path.join(target, 'folder.json'), '{}')
  let calls = 0
  await removeEmptiedDir(target, [path.join(target, 'folder.json')], {
    rmdir: async (folder) => {
      calls++
      if (calls < 3) throw busy('ENOTEMPTY')
      await fs.rm(folder, { recursive: true })
    },
  })
  assert.equal(calls, 3)
  await assert.rejects(fs.stat(target), /ENOENT/)
})

test('real content left in the folder is never waited for or removed', async (t) => {
  const dir = await folder(t),
    target = path.join(dir, 'meta')
  await fs.mkdir(target)
  await fs.writeFile(path.join(target, 'unknown.txt'), 'KEEP')
  let calls = 0
  await assert.rejects(
    removeEmptiedDir(target, [path.join(target, 'folder.json')], {
      rmdir: async () => {
        calls++
        throw busy('ENOTEMPTY')
      },
    }),
    /ENOTEMPTY/
  )
  assert.equal(calls, 1, 'no retry when something unknown is there')
  assert.equal(await fs.readFile(path.join(target, 'unknown.txt'), 'utf8'), 'KEEP')
})

test('other errors are not retried, and retries stop after the last attempt', async (t) => {
  const dir = await folder(t)
  let calls = 0
  await assert.rejects(
    removeEmptiedDir(path.join(dir, 'missing'), [], {
      rmdir: async () => {
        calls++
        throw busy('ENOENT')
      },
    }),
    /ENOENT/
  )
  assert.equal(calls, 1)
  calls = 0
  await assert.rejects(
    removeEmptiedDir(dir, [], {
      attempts: 3,
      rmdir: async () => {
        calls++
        throw busy('EBUSY')
      },
    }),
    /EBUSY/
  )
  assert.equal(calls, 3)
})

test('a real empty folder is removed on the first try', async (t) => {
  const dir = await folder(t),
    target = path.join(dir, 'empty')
  await fs.mkdir(target)
  await removeEmptiedDir(target, [])
  await assert.rejects(fs.stat(target), /ENOENT/)
})

test('a folder holding both deleted and unknown entries keeps its unknown entry at once', async (t) => {
  const dir = await folder(t),
    target = path.join(dir, 'meta')
  await fs.mkdir(target)
  await fs.writeFile(path.join(target, 'folder.json'), '{}')
  await fs.writeFile(path.join(target, 'unknown.txt'), 'KEEP')
  let calls = 0
  await assert.rejects(
    removeEmptiedDir(target, [path.join(target, 'folder.json')], {
      rmdir: async () => {
        calls++
        throw busy('ENOTEMPTY')
      },
    }),
    /ENOTEMPTY/
  )
  assert.equal(calls, 1)
})

test('the first error is reported, and a folder that cannot be listed is not waited for', async (t) => {
  const dir = await folder(t)
  let calls = 0
  await assert.rejects(
    removeEmptiedDir(dir, [], {
      attempts: 3,
      rmdir: async () => {
        calls++
        throw busy(calls === 1 ? 'ENOTEMPTY' : 'EPERM')
      },
    }),
    /^Error: ENOTEMPTY$/
  )
  calls = 0
  await assert.rejects(
    removeEmptiedDir(path.join(dir, 'gone'), [], {
      rmdir: async () => {
        calls++
        throw busy('ENOTEMPTY')
      },
    }),
    /ENOTEMPTY/
  )
  assert.equal(calls, 1, 'listing fails for a missing folder, so no retry')
})
