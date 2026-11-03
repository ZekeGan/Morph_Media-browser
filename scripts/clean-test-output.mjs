// Deletes the leftovers of earlier test runs in .test-output (screenshots, scratch data, failure artifacts).
// The fixtures cache (generated sample videos) is kept because rebuilding it is slow.
//   node scripts/clean-test-output.mjs                    everything except fixtures
//   node scripts/clean-test-output.mjs --older-than 24    only entries untouched for 24 hours (what pnpm test, pnpm shot
//                                                         and the UI runner do on start, so failure artifacts last a day)
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const directory = resolve('.test-output')
const index = process.argv.indexOf('--older-than')
const hours = index >= 0 ? Number(process.argv[index + 1]) : 0
const cutoff = Date.now() - (Number.isFinite(hours) ? hours : 0) * 3600 * 1000
// Deep scratch trees made Node's own recursive delete crash on Windows once, so the shell deletes there.
const remove = (path) =>
  process.platform === 'win32'
    ? spawnSync('cmd', ['/c', 'rmdir', '/s', '/q', path], { windowsHide: true }).status === 0 ||
      !existsSync(path)
    : (rmSync(path, { recursive: true, force: true }), true)
let removed = 0
try {
  if (existsSync(directory))
    for (const entry of readdirSync(directory))
      if (entry !== 'fixtures') {
        const path = join(directory, entry)
        try {
          if (statSync(path).mtimeMs > cutoff) continue
          if (statSync(path).isDirectory()) {
            if (remove(path)) removed++
            else console.log(`Could not remove ${entry} (still in use?)`)
          } else {
            rmSync(path, { force: true })
            removed++
          }
        } catch {
          console.log(`Could not remove ${entry} (still in use?)`)
        }
      }
} catch (error) {
  console.log('Cleanup skipped: ' + String(error))
}
console.log(`Removed ${removed} entries from ${directory} (fixtures kept).`)
