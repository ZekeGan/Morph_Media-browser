import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { probeFile } from '../electron/explorer'

test('probeFile tells disguised and empty files from real media by their first bytes', async (t) => {
  const base = path.resolve('.test-output')
  await fs.mkdir(base, { recursive: true })
  const dir = await fs.mkdtemp(path.join(base, 'probe-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
  const sample = async (name: string, bytes: Buffer | string) => {
    const file = path.join(dir, name)
    await fs.writeFile(file, bytes)
    return probeFile(file)
  }
  assert.equal(await sample('zip.mp4', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0])), 'zip')
  assert.equal(await sample('rar.mp4', 'Rar!\x1a\x07\x00'), 'rar')
  assert.equal(
    await sample('7z.mp4', Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0, 4])),
    '7z'
  )
  assert.equal(await sample('page.mp4', '<!DOCTYPE html><html>'), 'html')
  assert.equal(await sample('empty.mp4', ''), 'empty')
  assert.equal(
    await sample(
      'real.mp4',
      Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom')])
    ),
    'media'
  )
  assert.equal(await sample('web.webm', Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 1, 0, 0, 0])), 'media')
  assert.equal(await sample('junk.mp4', Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9])), 'unknown')
})
