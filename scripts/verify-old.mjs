// Runs today's UI test against an older version of the app, to show a new test really catches the bug it guards:
// it should FAIL on the old code and pass on the current one. The old code is checked out into a separate git
// worktree under .test-output; the working tree is never touched, so a hang or crash cannot leave old code behind.
//   pnpm verify:old <test name part> [--ref <commit>]     (default ref: HEAD, i.e. the last commit)
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = path.resolve(import.meta.dirname, '..')
const args = process.argv.slice(2),
  refAt = args.indexOf('--ref'),
  ref = refAt >= 0 ? args[refAt + 1] : 'HEAD',
  words = args.filter((word, index) => !word.startsWith('--') && (refAt < 0 || index !== refAt + 1))
if (!words.length) {
  console.error('Usage: pnpm verify:old <test name part> [--ref <commit>]')
  process.exit(2)
}
const dir = path.join(root, '.test-output', 'old-' + Date.now())
const run = (command, commandArgs, options = {}) =>
  spawnSync(command, commandArgs, { encoding: 'utf8', shell: true, ...options })

// The junction to node_modules is removed before the worktree, so deleting the worktree can never reach the real
// dependencies.
function cleanUp() {
  const modules = path.join(dir, 'node_modules')
  try {
    if (fs.lstatSync(modules).isSymbolicLink() || fs.existsSync(modules)) fs.unlinkSync(modules)
  } catch {
    try {
      fs.rmdirSync(modules)
    } catch {
      // Not created.
    }
  }
  if (fs.existsSync(path.join(dir, 'node_modules')))
    throw new Error('node_modules link still present; leaving ' + dir + ' for manual removal')
  run('git', ['worktree', 'remove', '--force', JSON.stringify(dir)], { cwd: root })
  run('git', ['worktree', 'prune'], { cwd: root })
}

let code = 1
try {
  const add = run('git', ['worktree', 'add', '--detach', JSON.stringify(dir), ref], { cwd: root })
  if (add.status !== 0) throw new Error('git worktree add failed: ' + add.stderr)
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'), 'junction')
  // Today's UI tests (and their support files) against yesterday's app. Unit tests (*.test.ts) stay as they were
  // at that commit: new ones may use code the old version does not have, and the build type-checks them.
  fs.cpSync(path.join(root, 'tests'), path.join(dir, 'tests'), {
    recursive: true,
    force: true,
    filter: (source) => !source.endsWith('.test.ts'),
  })
  // Today's runner as well, so the old run reports the same way (which line failed, and why).
  for (const file of [
    'scripts/run-ui-tests.mjs',
    'scripts/test-report.mjs',
    'scripts/areas.mjs',
    'scripts/clean-test-output.mjs',
    'docs/areas.json',
  ])
    fs.cpSync(path.join(root, file), path.join(dir, file), { force: true })
  console.log(`Building ${ref} in ${path.relative(root, dir)} …`)
  const build = run('pnpm', ['build'], { cwd: dir, timeout: 5 * 60 * 1000 })
  if (build.status !== 0)
    throw new Error('build of ' + ref + ' failed:\n' + (build.stdout + build.stderr).slice(-1500))
  console.log(`Running ${words.join(' ')} against ${ref} …`)
  // The runner in the worktree keeps its per-test timeout and Electron cleanup.
  const test = run('node', [path.join('scripts', 'run-ui-tests.mjs'), ...words], {
    cwd: dir,
    timeout: 10 * 60 * 1000,
    env: { ...process.env, UI_TEST_TIMEOUT: '180' },
  })
  const output = (test.stdout ?? '') + (test.stderr ?? '')
  // The runner's own lines, without its build and clean-up notes: verdicts and, for a failure, what failed and where.
  console.log(
    output
      .split('\n')
      .filter((line) => line.trim() && !/^(Built in|Build time|Removed|Build is)/.test(line))
      .join('\n')
  )
  console.log(
    test.status === 0
      ? `On ${ref} the test PASSES: it does not catch the old behaviour.`
      : `On ${ref} the test FAILS, as expected for a test that guards a fix.`
  )
  code = 0
} catch (error) {
  console.error(String(error instanceof Error ? error.message : error))
} finally {
  cleanUp()
}
process.exit(code)
