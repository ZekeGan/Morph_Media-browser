// Runs every Electron UI test in tests/*-ui.ts one after another against the current build (`pnpm build` first).
// Usage: node scripts/run-ui-tests.mjs [name-substring…]
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const filters = process.argv.slice(2)
const files = readdirSync('tests')
  .filter(
    (name) => name.endsWith('-ui.ts') && (!filters.length || filters.some((f) => name.includes(f)))
  )
  .sort()
const results = []
for (const file of files) {
  const started = Date.now()
  const run = spawnSync('pnpm', ['exec', 'tsx', 'tests/' + file], { encoding: 'utf8', shell: true })
  const seconds = Math.round((Date.now() - started) / 1000)
  results.push({ file, ok: run.status === 0, seconds })
  console.log((run.status === 0 ? 'PASS ' : 'FAIL ') + file + ' (' + seconds + 's)')
  if (run.status !== 0) console.log((run.stdout + run.stderr).split('\n').slice(-12).join('\n'))
}
const failed = results.filter((r) => !r.ok)
console.log(
  `${results.length - failed.length}/${results.length} passed in ${results.reduce((a, r) => a + r.seconds, 0)}s`
)
process.exit(failed.length ? 1 : 0)
