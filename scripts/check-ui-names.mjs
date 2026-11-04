// Fails when a UI test looks for visible text or an accessible name that no longer appears anywhere in the app's
// source or translations, so a renamed button is caught at commit time instead of after a 12-minute UI run.
// Usage: node scripts/check-ui-names.mjs [files…]   (default: every tests/*-ui.ts and tests/support/*.ts;
// given files that are not UI tests are ignored)
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const walk = (dir, match) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(file, match)
    return match.test(entry.name) ? [file] : []
  })
const uiTest = (file) => /(-ui\.ts|[\\/]support[\\/][\w-]+\.ts)$/.test(file)
const tests =
  process.argv.length > 2
    ? process.argv
        .slice(2)
        .map((file) => path.resolve(root, file))
        .filter(uiTest)
    : [
        ...walk(path.join(root, 'tests'), /-ui\.ts$/),
        ...walk(path.join(root, 'tests', 'support'), /\.ts$/),
      ]
const squash = (text) => text.replace(/\s+/g, ' ')

// Everything the window can show: component and main-process source text, plus every translation.
const sources = ['src', 'shared', 'electron'].flatMap((dir) =>
  walk(path.join(root, dir), /\.(ts|tsx)$/)
)
const messages = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/messages.json'), 'utf8'))
const texts = [
  ...sources.map((file) => squash(fs.readFileSync(file, 'utf8'))),
  ...Object.entries(messages).flatMap(([key, values]) =>
    [key, ...Object.values(values)].map(squash)
  ),
]
// Translations with {0} placeholders match any filled-in value.
const patterns = texts
  .filter((text) => text.length < 400 && /\{\d+\}/.test(text))
  .map(
    (text) =>
      new RegExp(
        text
          .split(/\{\d+\}/)
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('[^]*?')
      )
  )
// Whole messages only, for names joined from two translated pieces.
const whole = new Set(
  Object.entries(messages).flatMap(([key, values]) => [key, ...Object.values(values)].map(squash))
)
const inApp = (name) =>
  texts.some((text) => text.includes(name)) || patterns.some((pattern) => pattern.test(name))

// Text the tests make up themselves (project names, fixture files, field values): literals on lines that do not
// look anything up.
const locating = /getBy\w+|locator\(|hasText|filter\(|AccessibleName|waitForSelector/
const literal = /(['"`])((?:(?!\1)[^\\\n]|\\.)+)\1/g
const data = new Set(
  walk(path.join(root, 'tests'), /\.ts$/).flatMap((file) =>
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      // Text typed into the window, such as fill('新欄位'), is test data even on a lookup line.
      .map((line) =>
        locating.test(line) ? [...line.matchAll(/\.(?:fill|type)\(([^)]*)\)/g)].join(' ') : line
      )
      .flatMap((line) => [...line.matchAll(literal)].map((match) => squash(match[2]).trim()))
      .filter((text) => text.length >= 2)
  )
)
const fromTest = (name) => [...data].some((text) => text.includes(name) || name.includes(text))
// Names the window composes, such as "資料夾設定 · <folder>", "新增選項 <field>" or 保存 + 欄位資料, are checked
// part by part.
const known = (name) =>
  inApp(name) ||
  fromTest(name) ||
  [...name].some((_, at) => at > 0 && whole.has(name.slice(0, at)) && whole.has(name.slice(at))) ||
  [/ · /, /\s+/].some((separator) => {
    const parts = name.split(separator).filter(Boolean)
    return parts.length > 1 && parts.every((part) => inApp(part) || fromTest(part))
  })

// Literal names only: getByRole(…, { name: '…' }), getByText('…'), getByLabel('…'), hasText: '…', and so on.
const lookup =
  /\b(name|hasText|getByText|getByLabel|getByTitle|getByPlaceholder)\b\s*[:(]\s*(['"])((?:(?!\2)[^\\\n]|\\.)+)\2/g
const missing = []
for (const file of tests) {
  fs.readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => {
      if (!locating.test(line) || /ui-names: ignore/.test(line)) return
      for (const match of line.matchAll(lookup)) {
        const name = squash(match[3].replace(/\\(.)/g, '$1')).trim()
        if (name.length < 2 || known(name)) continue
        missing.push(`${path.relative(root, file)}:${index + 1}  ${match[1]} "${name}"`)
      }
    })
}
if (missing.length) {
  console.error(
    `UI tests look for ${missing.length} name(s) the app no longer has (renamed or removed?).\n` +
      'Update the test, or end the line with // ui-names: ignore when the text comes from elsewhere.\n'
  )
  for (const line of missing) console.error('  ' + line)
  process.exit(1)
}
console.log(`${tests.length} UI test files: every looked-up name exists in the app.`)
