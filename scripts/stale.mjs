// Points at what may be out of date, so the closing step reads only what it names instead of re-reading the docs.
// Advisory: prints findings and exits 0 (use --strict to exit 1 when anything is found).
//   pnpm stale
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { areas, problems, root } from './areas.mjs'

const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')
const git = (...args) =>
  spawnSync('git', args, { cwd: root, encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean)
const today = new Date().toISOString().slice(0, 10)
const specs = fs
  .readdirSync(path.join(root, 'docs'))
  .filter((name) => name.endsWith('.md'))
  .map((name) => 'docs/' + name)
const historyDocs = new Set([
  'docs/DECISIONS.md',
  'docs/WORK_ITEMS.md',
  'docs/README.md',
  'docs/IMPLEMENTATION.md',
  'docs/WORKFLOW_PROMPT.md',
])
const findings = []
const note = (group, line) => findings.push({ group, line })

// 1. Every source file belongs to an area and every named test exists.
for (const line of problems()) note('領域登錄表', line)

// 2. Spec cards whose code changed after their "最後確認" date.
const dirty = new Set(git('status', '--porcelain').map((line) => line.slice(3).replace(/\\/g, '/')))
const confirmedOf = (file) => /最後確認：(\d{4}-\d{2}-\d{2})/.exec(read(file).slice(0, 1500))?.[1]
let unconfirmed = 0
for (const spec of specs.filter((file) => !historyDocs.has(file))) {
  const name = path.basename(spec)
  const owners = areas.filter((area) => area.docs.some((doc) => doc.split('#')[0] === name))
  if (!owners.length) continue
  const confirmed = confirmedOf(spec)
  if (!confirmed) {
    unconfirmed++
    continue
  }
  const code = git('ls-files', 'src', 'electron', 'shared').filter((file) =>
    owners.some((area) =>
      area.code.some((pattern) =>
        new RegExp(
          '^' +
            pattern
              .split('*')
              .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
              .join('[^/]*') +
            '$'
        ).test(file)
      )
    )
  )
  const changed = code.some((file) => dirty.has(file))
    ? today
    : git('log', '-1', '--format=%cs', '--', ...code)[0]
  if (changed && changed > confirmed)
    note('規格卡可能過時', `${spec}：程式 ${changed} 有改動，最後確認 ${confirmed}`)
}

// 3. Docs naming files that no longer exist.
const docs = ['CLAUDE.md', 'README.md', 'README.zh-TW.md', 'README.ja.md', ...specs].filter((f) =>
  fs.existsSync(path.join(root, f))
)
for (const file of docs.filter((f) => f !== 'docs/DECISIONS.md')) {
  for (const match of read(file).matchAll(
    /`((?:src|electron|shared|tests|scripts)\/[\w./-]+\.\w+)`/g
  ))
    if (!fs.existsSync(path.join(root, match[1])) && !match[1].includes('*'))
      note('文件提到不存在的檔案', `${file}：${match[1]}`)
}

// 4. Translations no source text uses any more.
const source = git('ls-files', 'src', 'shared', 'electron')
  .filter((file) => /\.(ts|tsx)$/.test(file))
  .map((file) => read(file).replace(/\s+/g, ' '))
  .join('\n')
const messages = JSON.parse(read('src/i18n/messages.json'))
const unused = Object.keys(messages).filter((key) => !source.includes(key.replace(/\s+/g, ' ')))
for (const key of unused.slice(0, 15)) note('沒有程式使用的語系文字', key)
if (unused.length > 15) note('沒有程式使用的語系文字', `……共 ${unused.length} 筆`)

// 5. The requirement list keeps only open items.
const work = read('docs/WORK_ITEMS.md')
for (const match of work.matchAll(/^- \*\*(R-\d+)\*\*.*(?:｜|\|)\s*完成\b.*$/gm))
  note('需求清單', `${match[1]} 已完成卻還在清單上（完成的需求只留在 CHANGELOG）`)

// 6. Spec pages: history notes and size.
for (const spec of specs.filter((file) => !historyDocs.has(file))) {
  const text = read(spec)
  const dated = [...text.matchAll(/^#{1,6} .*（\d{4}-\d{2}-\d{2}[^）]*）/gm)].length
  if (dated) note('規格含歷史註記', `${spec}：${dated} 個標題帶日期`)
  // Legacy <a id> anchors keep old links working and are not claims about the present.
  const pending = text
    .split('\n')
    .filter((line) => /尚未實作|待實作/.test(line) && !/<a id=/.test(line))
  if (pending.length)
    note(
      '規格含歷史註記',
      `${spec}：${pending.length} 處提到「尚未實作／待實作」，確認需求清單是否還有這些項目`
    )
  if (text.length > 15000)
    note('規格卡過大（>15,000 字）', `${spec}：${text.length.toLocaleString()} 字，可依領域拆開`)
}

const groups = [...new Set(findings.map((f) => f.group))]
for (const group of groups) {
  console.log(`■ ${group}`)
  for (const { line } of findings.filter((f) => f.group === group)) console.log(`  ${line}`)
}
if (unconfirmed)
  console.log(`· 另有 ${unconfirmed} 份規格尚未標「最後確認」日期（下次改到時補上即可）`)
if (!findings.length) console.log('沒有發現可能過時的內容。')
if (findings.length && process.argv.includes('--strict')) process.exit(1)
