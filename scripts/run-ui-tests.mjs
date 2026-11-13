// Runs Electron UI tests (tests/*-ui.ts) one after another against out/ (rebuilt automatically when missing or older than the sources).
//   node scripts/run-ui-tests.mjs                 every UI test (~12 min)
//   node scripts/run-ui-tests.mjs --smoke         the fast core set (~1-2 min)
//   node scripts/run-ui-tests.mjs --changed       tests mapped from files changed vs origin/main (+ working tree)
//   node scripts/run-ui-tests.mjs video media     tests whose file name contains any of the words
//   node scripts/run-ui-tests.mjs game --repeat 8 run each chosen test 8 times (no retry) to measure flakiness;
//                                                 always use this instead of looping `tsx tests/x-ui.ts` by hand,
//                                                 so every run keeps the timeout and the stray-Electron cleanup
//   node scripts/run-ui-tests.mjs novel --verbose also show everything the tests print (console.log while debugging)
// The output stays short: the build says only that it ran (its full output only when it fails), and a failed test
// shows its error, the line of the test it stopped at and where its screenshots are, not the whole log.
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { areasOf, isSource, smoke, uiTestsOf } from './areas.mjs'
import { failureSummary, plain } from './test-report.mjs'

// Leftovers older than a day (failure artifacts, old screenshots) are pruned on every start.
spawnSync(process.execPath, ['scripts/clean-test-output.mjs', '--older-than', '24'], {
  stdio: 'inherit',
})

// Fast set that exercises navigation, the right panel, settings, the editor and the media browser.
// Which UI tests cover which source files lives in docs/areas.json (one registry for tests, docs and stale checks).
const git = (...args) =>
  spawnSync('git', args, { encoding: 'utf8' }).stdout.split('\n').filter(Boolean)
const all = readdirSync('tests')
  .filter((name) => name.endsWith('-ui.ts'))
  .map((name) => name.replace(/\.ts$/, ''))
  .sort()

// An Electron left over from an interrupted run can make the next run hang. Only processes started from this
// project's node_modules are stopped, never other Electron-based programs.
function stopStrayElectron() {
  if (process.platform !== 'win32') return
  const script =
    '$root = $env:PROJECT_MODULES; Get-CimInstance Win32_Process -Filter "Name=\'electron.exe\'" | ' +
    'Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($root) } | ' +
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force }'
  spawnSync('powershell', ['-NoProfile', '-Command', script], {
    env: { ...process.env, PROJECT_MODULES: resolve('node_modules') },
    stdio: 'ignore',
  })
}
stopStrayElectron()

// The tests launch `electron .` against out/, so a build older than its sources shows the old UI. Rebuild first when
// out/ is missing or any source/config file is newer than the build output.
function newestMtime(path) {
  if (!existsSync(path)) return 0
  const stat = statSync(path)
  if (!stat.isDirectory()) return stat.mtimeMs
  return readdirSync(path).reduce(
    (latest, name) => Math.max(latest, newestMtime(join(path, name))),
    0
  )
}
const buildInputs = [
  'src',
  'shared',
  'electron',
  'electron.vite.config.ts',
  'package.json',
  'tsconfig.json',
]
const builtAt = newestMtime('out/main') && newestMtime('out/renderer') ? newestMtime('out') : 0
if (!builtAt || buildInputs.some((path) => newestMtime(path) > builtAt)) {
  console.log(
    `Build is ${builtAt ? 'older than the sources' : 'missing'}; running pnpm build first.`
  )
  const started = Date.now(),
    build = spawnSync('pnpm', ['build'], { encoding: 'utf8', shell: true })
  if (build.status !== 0) {
    console.log(
      plain((build.stdout ?? '') + (build.stderr ?? ''))
        .split('\n')
        .slice(-60)
        .join('\n')
    )
    console.log('pnpm build failed; UI tests not run.')
    process.exit(1)
  }
  console.log(`Built in ${Math.round((Date.now() - started) / 1000)}s.`)
}
console.log('Build time:', new Date(newestMtime('out')).toLocaleString())

const args = process.argv.slice(2)
const verbose = args.includes('--verbose')
const repeatAt = args.indexOf('--repeat'),
  repeat = repeatAt >= 0 ? Math.max(1, Math.min(50, Number(args[repeatAt + 1]) || 1)) : 1
const words = args.filter(
  (word, index) => !word.startsWith('--') && (repeatAt < 0 || index !== repeatAt + 1)
)
let chosen
if (args.includes('--smoke')) chosen = smoke
else if (args.includes('--changed')) {
  const files = [
    ...new Set([
      ...git('diff', '--name-only', 'origin/main'),
      ...git('ls-files', '--others', '--exclude-standard'),
    ]),
  ]
  const direct = files
    .filter((file) => /^tests\/.+-ui\.ts$/.test(file))
    .map((file) => file.slice(6, -3))
  const mapped = uiTestsOf(files)
  // A new source file not yet in docs/areas.json still gets the smoke set, and is named so it can be added.
  const unmapped = files.filter((file) => isSource(file) && !areasOf(file).length)
  chosen = [...new Set([...direct, ...mapped, ...(unmapped.length ? smoke : [])])]
  if (unmapped.length)
    console.log(
      'Not in any area of docs/areas.json (running smoke; add them there):\n  ' +
        unmapped.join('\n  ')
    )
  console.log('Changed files:', files.length, '-> tests:', chosen.join(', ') || '(none)')
} else if (words.length) chosen = all.filter((name) => words.some((word) => name.includes(word)))
else chosen = all

// Test runs leave their working folders in .test-output. When everything passes the new ones are removed again;
// after a failure they stay, because they hold the screenshots and data needed to see what went wrong.
const outputDir = '.test-output'
const existing = new Set(existsSync(outputDir) ? readdirSync(outputDir) : [])
const files = all.filter((name) => chosen.includes(name))
const results = []
// Native drag and drop and window focus make a few tests sensitive to the machine being used at the same time, so a
// failure is run once more; a pass on the second run is reported as flaky instead of hiding the first failure.
// A test that has not finished in UI_TEST_TIMEOUT seconds (default 240; the slowest normally takes under a minute)
// is stuck, usually on a prompt nobody answers: it is stopped, reported as TIMEOUT and not run again.
const limit = Number(process.env.UI_TEST_TIMEOUT || 240) * 1000
const execute = (name) => {
  const run = spawnSync('pnpm', ['exec', 'tsx', `tests/${name}.ts`], {
    encoding: 'utf8',
    shell: true,
    timeout: limit,
  })
  const timedOut = run.error?.code === 'ETIMEDOUT'
  // Killing the shell leaves its Electron behind, which would stall the next test.
  if (timedOut) stopStrayElectron()
  const output = { ...run, stdout: run.stdout ?? '', stderr: run.stderr ?? '', timedOut }
  if (verbose)
    console.log(`--- ${name} output ---\n` + plain(output.stdout + output.stderr).trimEnd())
  return output
}
// Repeat mode: every run counts, nothing is retried, so the pass count shows how flaky a test really is.
for (const name of repeat > 1 ? files : []) {
  const started = Date.now()
  let passed = 0,
    firstFailure
  for (let round = 1; round <= repeat; round++) {
    const run = execute(name)
    const verdict = run.status === 0 ? 'PASS' : run.timedOut ? 'TIMEOUT' : 'FAIL'
    console.log(`  ${name} run ${round}/${repeat}: ${verdict}`)
    if (run.status === 0) passed++
    else firstFailure ??= failureSummary(run.stdout + run.stderr, name)
  }
  const seconds = Math.round((Date.now() - started) / 1000)
  results.push({ name, ok: passed === repeat, seconds, flaky: false })
  console.log(
    `${passed === repeat ? 'PASS' : 'FAIL'} ${name}: ${passed}/${repeat} runs passed (${seconds}s)`
  )
  if (firstFailure) console.log('First failure:\n' + firstFailure)
}
for (const name of repeat > 1 ? [] : files) {
  const started = Date.now()
  let run = execute(name),
    flaky = false
  if (run.status !== 0 && !run.timedOut) {
    const first = run
    run = execute(name)
    if (run.status === 0) {
      flaky = true
      console.log('First run failed:\n' + failureSummary(first.stdout + first.stderr, name))
    }
  }
  const seconds = Math.round((Date.now() - started) / 1000)
  results.push({ name, ok: run.status === 0, seconds, flaky })
  const verdict = run.status === 0 ? (flaky ? 'FLAKY' : 'PASS') : run.timedOut ? 'TIMEOUT' : 'FAIL'
  console.log(`${verdict} ${name} (${seconds}s)`)
  if (run.status !== 0)
    console.log(
      run.timedOut
        ? `Stopped after ${limit / 1000}s (waiting on a prompt?). ` +
            failureSummary(run.stdout + run.stderr, name)
        : failureSummary(run.stdout + run.stderr, name)
    )
}
const failed = results.filter((r) => !r.ok)
if (results.some((r) => r.flaky))
  console.log(
    'Passed only on the second run:',
    results
      .filter((r) => r.flaky)
      .map((r) => r.name)
      .join(', ')
  )
console.log(
  `${results.length - failed.length}/${results.length} passed in ${results.reduce((a, r) => a + r.seconds, 0)}s`
)
if (!failed.length && existsSync(outputDir))
  for (const entry of readdirSync(outputDir))
    if (!existing.has(entry) && entry !== 'fixtures')
      try {
        rmSync(join(outputDir, entry), { recursive: true, force: true })
      } catch {
        // A folder still held by a process is left for the next `pnpm clean:test`.
      }
process.exit(failed.length ? 1 : 0)
