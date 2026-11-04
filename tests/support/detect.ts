// Read-only game-engine check: runs the app's own detection on folders and prints what it finds. It never writes,
// creates records or launches anything, so it is safe on real game folders.
// Usage: pnpm detect <folder> [more folders…] [--children]
//   --children   check every direct subfolder of each given folder (a folder of games) instead of the folder itself
import fs from 'node:fs/promises'
import path from 'node:path'
import { detectGame, GameProbeLimit } from '../../electron/game-detection'

const args = process.argv.slice(2),
  children = args.includes('--children'),
  roots = args.filter((arg) => !arg.startsWith('--')).map((arg) => path.resolve(arg))
if (!roots.length) {
  console.error('Usage: pnpm detect <folder> [more folders…] [--children]')
  process.exit(2)
}

const folders: string[] = []
for (const root of roots) {
  if (!children) {
    folders.push(root)
    continue
  }
  for (const entry of await fs.readdir(root, { withFileTypes: true }))
    if (entry.isDirectory() && !entry.name.startsWith('.'))
      folders.push(path.join(root, entry.name))
}

let found = 0
for (const folder of folders) {
  const name = children ? path.basename(folder) : folder
  try {
    const result = await detectGame(folder)
    if (!result) {
      console.log(`-  ${name}: no game detected`)
      continue
    }
    found++
    console.log(`✓  ${name}: ${result.engines.join(', ') || '(game, engine unknown)'}`)
    for (const line of result.evidence) console.log(`     ${line}`)
  } catch (error) {
    const limit = error instanceof GameProbeLimit
    console.log(`${limit ? '?' : '!'}  ${name}: ${error instanceof Error ? error.message : error}`)
  }
}
if (folders.length > 1) console.log(`\n${found}/${folders.length} detected as games`)
