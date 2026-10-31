// Runs Electron UI tests (tests/*-ui.ts) one after another against the current build (`pnpm build` first).
//   node scripts/run-ui-tests.mjs                 every UI test (~12 min)
//   node scripts/run-ui-tests.mjs --smoke         the fast core set (~1-2 min)
//   node scripts/run-ui-tests.mjs --changed       tests mapped from files changed vs origin/main (+ working tree)
//   node scripts/run-ui-tests.mjs video media     tests whose file name contains any of the words
import { readdirSync } from 'node:fs'
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
    /src\/(Editor|Card|cells\.css)|shared\/(cells|layouts)/,
    ['cell-editor-ui', 'game-cover-cell-ui'],
  ],
  [
    /src\/(BrowseWorkspace|RightPanel|FolderPanel|FolderParts|FolderContent)/,
    ['folder-navigation-ui', 'settings-dock-ui', 'game-folder-page-ui', 'workspace-toolbar-ui'],
  ],
  [/src\/(Playback|FileMenu|ViewToggle|DesktopShell)/, ['audio-playback-ui']],
  [/src\/(Video|Subtitle)|video-player\.css/, ['video-player-ui']],
  [
    /src\/(Gallery|MediaBrowser|FileOverview|media-workspace\.css)/,
    ['media-scope-ui', 'media-workspace-ui', 'file-overview-ui'],
  ],
  [/src\/(Reader|DocumentViewer)/, ['reader-ui']],
  [/src\/SearchDialog/, ['search-dialog-ui']],
  [/src\/(Toasts|App\.tsx)|shared\/notifications/, ['notifications-ui']],
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

const files = all.filter((name) => chosen.includes(name))
const results = []
for (const name of files) {
  const started = Date.now()
  const run = spawnSync('pnpm', ['exec', 'tsx', `tests/${name}.ts`], {
    encoding: 'utf8',
    shell: true,
  })
  const seconds = Math.round((Date.now() - started) / 1000)
  results.push({ name, ok: run.status === 0, seconds })
  console.log(`${run.status === 0 ? 'PASS' : 'FAIL'} ${name} (${seconds}s)`)
  if (run.status !== 0) console.log((run.stdout + run.stderr).split('\n').slice(-12).join('\n'))
}
const failed = results.filter((r) => !r.ok)
console.log(
  `${results.length - failed.length}/${results.length} passed in ${results.reduce((a, r) => a + r.seconds, 0)}s`
)
process.exit(failed.length ? 1 : 0)
