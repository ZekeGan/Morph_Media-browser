// The area registry (docs/areas.json) names each area's spec sections, code, UI tests and data tests once; the UI
// test runner, the stale-content check and the routing table in docs/README.md are derived from it.
//   node scripts/areas.mjs check            every source file belongs to an area; every named test exists
//   node scripts/areas.mjs readme           regenerate the table between the markers in docs/README.md
//   node scripts/areas.mjs which <file…>    which areas (and tests) a file belongs to
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const registry = JSON.parse(fs.readFileSync(path.join(root, 'docs/areas.json'), 'utf8'))
export const smoke = registry.smoke
export const areas = registry.areas

const toRegExp = (pattern) =>
  new RegExp(
    '^' +
      pattern
        .split('*')
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]*') +
      '$'
  )
const matchers = areas.map((area) => ({ area, patterns: area.code.map(toRegExp) }))
const slash = (file) => file.replace(/\\/g, '/')

export const areasOf = (file) =>
  matchers.filter(({ patterns }) => patterns.some((p) => p.test(slash(file)))).map((m) => m.area)
export const isSource = (file) => /^(src|electron|shared)\//.test(slash(file))
const expand = (tests) => tests.flatMap((name) => (name === '@smoke' ? smoke : [name]))
export const uiTestsOf = (files) => [
  ...new Set(files.flatMap((file) => areasOf(file).flatMap((area) => expand(area.ui)))),
]
export const sourceFiles = () =>
  spawnSync('git', ['ls-files', 'src', 'electron', 'shared'], { cwd: root, encoding: 'utf8' })
    .stdout.split('\n')
    .filter(Boolean)

export function problems() {
  const out = [],
    files = sourceFiles()
  for (const file of files) if (!areasOf(file).length) out.push(`未歸入任何領域：${file}`)
  for (const area of areas) {
    for (const name of expand(area.ui))
      if (!fs.existsSync(path.join(root, 'tests', name + '.ts')))
        out.push(`${area.id}：找不到 UI 測試 tests/${name}.ts`)
    for (const name of area.tests)
      if (!fs.existsSync(path.join(root, 'tests', name)))
        out.push(`${area.id}：找不到資料測試 tests/${name}`)
    for (const pattern of area.code)
      if (!files.some((file) => toRegExp(pattern).test(file)))
        out.push(`${area.id}：程式樣式沒有對到任何檔案：${pattern}`)
  }
  return out
}

// The routing table in docs/README.md, generated so it cannot drift from the registry.
function table() {
  const docLink = (target) => {
    const [file, anchor] = target.split('#')
    return `[${anchor ?? file.replace(/\.md$/, '')}](${target})`
  }
  const rows = areas.map((area) => {
    const ui = expand(area.ui)
      .filter((name, index, all) => all.indexOf(name) === index)
      .map((name) => `\`${name}\``)
    const data = area.tests.map((name) => `\`${name.replace(/\.test\.ts$/, '')}\``)
    return `| ${area.name}（\`${area.id}\`） | ${area.docs.map(docLink).join('、')} | ${area.code
      .map((pattern) => `\`${pattern}\``)
      .join(' ')} | ${[...data, ...ui].join(' ') || '—'} |`
  })
  return ['| 領域 | 規格 | 程式 | 測試（資料、UI） |', '| --- | --- | --- | --- |', ...rows].join(
    '\n'
  )
}
const START = '<!-- areas:start（由 node scripts/areas.mjs readme 產生，勿手改） -->',
  END = '<!-- areas:end -->'
export function readmeTable() {
  return `${START}\n\n${table()}\n\n${END}`
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  if (command === 'check') {
    const found = problems()
    for (const line of found) console.error(line)
    if (found.length) process.exit(1)
    console.log(`${areas.length} 個領域涵蓋全部 ${sourceFiles().length} 個原始檔。`)
  } else if (command === 'readme') {
    const file = path.join(root, 'docs/README.md'),
      text = fs.readFileSync(file, 'utf8'),
      crlf = text.includes('\r\n'),
      plain = text.replace(/\r\n/g, '\n'),
      start = plain.indexOf('<!-- areas:start'),
      end = plain.indexOf(END)
    if (start < 0 || end < 0) throw new Error('docs/README.md 缺少 areas 標記')
    const next = plain.slice(0, start) + readmeTable() + plain.slice(end + END.length)
    fs.writeFileSync(file, crlf ? next.replace(/\n/g, '\r\n') : next)
    console.log('docs/README.md 定位表已更新。')
  } else if (command === 'which') {
    for (const file of args) {
      const found = areasOf(path.relative(root, path.resolve(file)))
      console.log(
        `${file}: ${found.map((a) => a.id).join(', ') || '（未歸入）'}；UI 測試：${uiTestsOf([path.relative(root, path.resolve(file))]).join(', ') || '無'}`
      )
    }
  } else {
    console.error('用法：node scripts/areas.mjs check | readme | which <file…>')
    process.exit(2)
  }
}
