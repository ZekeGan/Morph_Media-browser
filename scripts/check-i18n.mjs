// Interface text check (R-277): finds Chinese text that will not be translated when the app runs in another
// language. Two places:
//   window (src/)            text in components must go through tr(); a template made only of tr() parts is fine.
//   main process (electron/, shared/)
//                            messages shown in the window are translated by exact lookup, so a sentence needs a
//                            key in src/i18n/messages.json; a message with values in it cannot be found and stays
//                            Chinese.
// Main-process messages that already lacked a key are listed in scripts/i18n-baseline.json; only new ones fail, so
// the gap cannot grow while the existing ones are translated.
//   node scripts/check-i18n.mjs                     fail on new untranslated text
//   node scripts/check-i18n.mjs --update-baseline   rewrite the baseline (after translating or removing messages)
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = path.resolve(import.meta.dirname, '..')
const baselineFile = path.join(root, 'scripts', 'i18n-baseline.json')
const messages = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/messages.json'), 'utf8'))
const squash = (text) => text.replace(/\s+/g, ' ').trim()
const keys = new Set(Object.keys(messages).map(squash))
const han = /\p{Script=Han}/u
const slash = (file) => path.relative(root, file).split(path.sep).join('/')
const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : /\.tsx?$/.test(entry.name) ? [full] : []
  })
// Translation data itself, and lines a developer marks on purpose (`// i18n-ignore: why`).
const skippedFiles = /^src\/i18n\//
const ignored = (sf, node) => {
  const line = sf.getLineAndCharacterOfPosition(node.getStart()).line,
    lines = sf.text.split('\n')
  return [lines[line], lines[line - 1]].some((text) => text?.includes('i18n-ignore'))
}
const translateCall = (sf, node) =>
  !!node.parent &&
  ts.isCallExpression(node.parent) &&
  ['tr', 't'].includes(node.parent.expression.getText(sf))
// The fixed parts of a template, without its ${…} values.
const templateText = (node) =>
  [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join('')

const windowProblems = [],
  mainMessages = []
for (const dir of ['src', 'electron', 'shared']) {
  for (const file of walk(path.join(root, dir))) {
    const name = slash(file)
    if (skippedFiles.test(name)) continue
    const sf = ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    )
    const visit = (node) => {
      let text,
        template = false
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) text = node.text
      else if (ts.isTemplateExpression(node)) {
        text = templateText(node)
        template = true
      } else if (ts.isJsxText(node)) text = node.text.trim()
      if (text && han.test(text) && !ignored(sf, node)) {
        const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          where = `${name}:${line}`
        if (dir === 'src') {
          if (!translateCall(sf, node) && !keys.has(squash(text)))
            windowProblems.push(`${where}  ${squash(text).slice(0, 70)}`)
        } else if (template || !keys.has(squash(text)))
          mainMessages.push({ file: name, text: squash(text) })
      }
      ts.forEachChild(node, visit)
    }
    visit(sf)
  }
}

const id = (entry) => `${entry.file} | ${entry.text}`
const current = [...new Set(mainMessages.map(id))].sort()
if (process.argv.includes('--update-baseline')) {
  fs.writeFileSync(baselineFile, JSON.stringify(current, null, 2) + '\n')
  console.log(`Baseline: ${current.length} main-process messages without a translation key.`)
  process.exit(0)
}
const baseline = new Set(
  fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')) : []
)
const fresh = current.filter((entry) => !baseline.has(entry)),
  gone = [...baseline].filter((entry) => !current.includes(entry))
let failed = false
if (windowProblems.length) {
  failed = true
  console.error(
    'Window text that is not passed through tr() (wrap it, or mark the line with // i18n-ignore):'
  )
  for (const problem of windowProblems) console.error('  ' + problem)
}
if (fresh.length) {
  failed = true
  console.error(
    'New main-process messages without a translation key (add the sentence to messages.json, or build it in the\nwindow with tr() when it carries values):'
  )
  for (const entry of fresh) console.error('  ' + entry)
}
if (failed) process.exit(1)
console.log(
  `Interface text: window text all translated; ${current.length} main-process messages still without a key (baseline ${baseline.size}${gone.length ? `, ${gone.length} gone: run with --update-baseline` : ''}).`
)
