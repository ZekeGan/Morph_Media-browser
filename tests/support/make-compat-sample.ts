// Saves the old-data sample of the version being released (R-278), step 5 of docs/RELEASING.md:
//   pnpm exec tsx tests/support/make-compat-sample.ts
// Writes tests/compat/<package version>/ (the sample, with paths as a placeholder) and expected.json (what this
// version reads back). Later versions must read the same from it: tests/compat.test.ts.
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildCompatSample, placeCompatSample, summariseCompatSample } from './compat-sample'

const version = JSON.parse(await fs.readFile('package.json', 'utf8')).version as string
const target = path.resolve('tests', 'compat', version)
await fs.rm(target, { recursive: true, force: true })
await fs.mkdir(target, { recursive: true })
const data = path.join(target, 'data')
await buildCompatSample(data)
// Read it back through a placed copy, so the stored sample keeps the placeholder.
const base = path.resolve('.test-output')
await fs.mkdir(base, { recursive: true })
const scratch = await fs.mkdtemp(path.join(base, 'compat-make-'))
try {
  await fs.cp(data, scratch, { recursive: true })
  await placeCompatSample(scratch)
  const summary = await summariseCompatSample(scratch)
  const placed = JSON.stringify(path.join(scratch, 'Shelf')).slice(1, -1)
  await fs.writeFile(
    path.join(target, 'expected.json'),
    JSON.stringify(summary, null, 2).split(placed).join('__COMPAT_SHELF__') + '\n'
  )
} finally {
  await fs.rm(scratch, { recursive: true, force: true })
}
console.log('Saved the ' + version + ' sample in ' + path.relative(process.cwd(), target))
