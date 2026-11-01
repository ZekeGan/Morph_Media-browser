// Runs Electron UI tests (tests/*-ui.ts) one after another against the current build (`pnpm build` first).
//   node scripts/run-ui-tests.mjs                 every UI test (~12 min)
//   node scripts/run-ui-tests.mjs --smoke         the fast core set (~1-2 min)
//   node scripts/run-ui-tests.mjs --changed       tests mapped from files changed vs origin/main (+ working tree)
//   node scripts/run-ui-tests.mjs video media     tests whose file name contains any of the words
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

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
    ['folder-navigation-ui', 'settings-dock-ui', 'game-folder-page-ui', 'workspace-toolbar-ui'],
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
]

const git = (...args) =>
  spawnSync('git', args, { encoding: 'utf8' }).stdout.split('\n').filter(Boolean)
const all = readdirSync('tests')
  .filter((name) => name.endsWith('-ui.ts'))
  .map((name) => name.replace(/\.ts$/, ''))
  .sort()

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
      rmSync(join(outputDir, entry), { recursive: true, force: true })
process.exit(failed.length ? 1 : 0)
