// R-278: every saved sample from a released version (tests/compat/<version>/) opens in this version with the same
// projects, folder records and local settings, and opening it writes nothing.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { files, placeCompatSample, summariseCompatSample, SHELF } from './support/compat-sample'

const samples = path.resolve('tests', 'compat')
const versions = (await fs.readdir(samples).catch(() => [] as string[])).sort()

test('there is at least one saved sample from a released version', () => {
  assert.ok(versions.length > 0, 'run tests/support/make-compat-sample.ts when releasing')
})

for (const version of versions)
  test(`data saved by ${version} opens unchanged`, async (t) => {
    const base = path.resolve('.test-output')
    await fs.mkdir(base, { recursive: true })
    const dir = await fs.mkdtemp(path.join(base, `compat-${version}-`))
    t.after(() => fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }))
    await fs.cp(path.join(samples, version, 'data'), dir, { recursive: true })
    await placeCompatSample(dir)
    const digest = async () =>
      Object.fromEntries(
        await Promise.all(
          (await files(dir))
            .filter((file) => !file.endsWith('search.sqlite'))
            .map(async (file) => [
              path.relative(dir, file),
              createHash('sha256')
                .update(await fs.readFile(file))
                .digest('hex'),
            ])
        )
      )
    const before = await digest()
    const summary = await summariseCompatSample(dir)
    const placed = JSON.stringify(path.join(dir, 'Shelf')).slice(1, -1)
    const expected = JSON.parse(
      (await fs.readFile(path.join(samples, version, 'expected.json'), 'utf8'))
        .split(SHELF)
        .join(placed)
    )
    assert.deepEqual(summary, expected)
    assert.deepEqual(await digest(), before, 'opening old data must not rewrite it')
  })
