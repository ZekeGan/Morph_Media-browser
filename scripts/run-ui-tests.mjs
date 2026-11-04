// Runs Electron UI tests (tests/*-ui.ts) one after another against out/ (rebuilt automatically when missing or older than the sources).
//   node scripts/run-ui-tests.mjs                 every UI test (~12 min)
//   node scripts/run-ui-tests.mjs --smoke         the fast core set (~1-2 min)
//   node scripts/run-ui-tests.mjs --changed       tests mapped from files changed vs origin/main (+ working tree)
//   node scripts/run-ui-tests.mjs video media     tests whose file name contains any of the words
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

// Leftovers older than a day (failure artifacts, old screenshots) are pruned on every start.
spawnSync(process.execPath, ['scripts/clean-test-output.mjs', '--older-than', '24'], {
  stdio: 'inherit',
})

// Fast set that exercises navigation, the right panel, settings, the editor and the media browser.
const smoke = [
  'folder-navigation-ui',
  'settings-dock-ui',
  'game-folder-page-ui',
  'cell-editor-ui',
  'media-scope-ui',
  'workspace-toolbar-ui',
]
// Changed source file pattern -> the UI tests that cover it. Unmapped UI/main changes fall back to smoke.
const coverage = [
  [
    /src\/(Editor|Card|Cell|TagList|EnumColors|cells\.css)|src\/themes\/cellStyle|shared\/(cells|layouts)/,
    [
      'cell-editor-ui',
      'field-edit-ui',
      'game-cover-cell-ui',
      'game-launch-cell-ui',
      'cell-scroll-ui',
      'image-nth-ui',
      'cell-style-ui',
    ],
  ],
  [
    /src\/(BrowseWorkspace|RightPanel|FolderPanel|FolderParts|FolderContent)/,
    [
      'folder-navigation-ui',
      'settings-dock-ui',
      'game-folder-page-ui',
      'workspace-toolbar-ui',
      'image-delete-ui',
    ],
  ],
  [/shared\/browse|src\/BrowseToolbar/, ['workspace-toolbar-ui', 'folder-navigation-ui']],
  [/src\/(Playback|FileMenu|ViewToggle|DesktopShell)/, ['audio-playback-ui']],
  [/src\/(Video|Subtitle)|video-player\.css/, ['video-player-ui']],
  [
    /src\/(Gallery|MediaBrowser|FileOverview|media-workspace\.css)/,
    ['media-scope-ui', 'media-workspace-ui', 'file-overview-ui'],
  ],
  [/src\/(Reader|DocumentViewer)/, ['reader-ui']],
  [/src\/SearchDialog/, ['search-dialog-ui']],
  [
    /src\/(Toasts|App\.tsx|errors|ErrorBoundary)|shared\/notifications/,
    ['notifications-ui', 'error-recovery-ui'],
  ],
  [/src\/(Application|themes|i18n)/, ['appearance-ui']],
  [/src\/(GameActions|game-actions)/, ['game-actions-ui']],
  [/src\/(ProjectSettings|SettingsPreview)|electron\/settings/, ['decided-ui']],
  [
    /src\/(ApplicationSettings|CreateProjectDialog)|electron\/(backup|library-export)|shared\/backup/,
    ['backup-ui', 'decided-ui'],
  ],
]

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
  if (spawnSync('pnpm', ['build'], { stdio: 'inherit', shell: true }).status !== 0) {
    console.log('pnpm build failed; UI tests not run.')
    process.exit(1)
  }
}
console.log('Build time:', new Date(newestMtime('out')).toLocaleString())

const args = process.argv.slice(2)
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
  const mapped = files.flatMap((file) =>
    coverage.filter(([pattern]) => pattern.test(file)).flatMap(([, tests]) => tests)
  )
  const touchesApp = files.some((file) => /^(src|electron|shared)\//.test(file))
  chosen = [...new Set([...direct, ...mapped, ...(touchesApp && !mapped.length ? smoke : [])])]
  console.log('Changed files:', files.length, '-> tests:', chosen.join(', ') || '(none)')
} else if (args.length) chosen = all.filter((name) => args.some((word) => name.includes(word)))
else chosen = all

// Test runs leave their working folders in .test-output. When everything passes the new ones are removed again;
// after a failure they stay, because they hold the screenshots and data needed to see what went wrong.
const outputDir = '.test-output'
const existing = new Set(existsSync(outputDir) ? readdirSync(outputDir) : [])
const files = all.filter((name) => chosen.includes(name))
const results = []
// Native drag and drop and window focus make a few tests sensitive to the machine being used at the same time, so a
// failure is run once more; a pass on the second run is reported as flaky instead of hiding the first failure.
const execute = (name) =>
  spawnSync('pnpm', ['exec', 'tsx', `tests/${name}.ts`], { encoding: 'utf8', shell: true })
for (const name of files) {
  const started = Date.now()
  let run = execute(name),
    flaky = false
  if (run.status !== 0) {
    const first = run
    run = execute(name)
    if (run.status === 0) {
      flaky = true
      console.log(
        'First run failed:\n' + (first.stdout + first.stderr).split('\n').slice(-12).join('\n')
      )
    }
  }
  const seconds = Math.round((Date.now() - started) / 1000)
  results.push({ name, ok: run.status === 0, seconds, flaky })
  console.log(`${run.status === 0 ? (flaky ? 'FLAKY' : 'PASS') : 'FAIL'} ${name} (${seconds}s)`)
  if (run.status !== 0) console.log((run.stdout + run.stderr).split('\n').slice(-12).join('\n'))
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
