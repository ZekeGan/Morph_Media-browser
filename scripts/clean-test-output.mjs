// Deletes the leftovers of earlier test runs in .test-output (screenshots, scratch data, failure artifacts).
// The fixtures cache (generated sample videos) is kept because rebuilding it is slow.
//   node scripts/clean-test-output.mjs
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const directory = '.test-output'
let removed = 0
if (existsSync(directory))
  for (const entry of readdirSync(directory))
    if (entry !== 'fixtures') {
      try {
        rmSync(join(directory, entry), { recursive: true, force: true })
        removed++
      } catch {
        console.log(`Could not remove ${entry} (still in use?)`)
      }
    }
console.log(`Removed ${removed} entries from ${directory} (fixtures kept).`)
