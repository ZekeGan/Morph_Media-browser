// Routine edits of docs/WORK_ITEMS.md and of spec cards' "最後確認" line (R-358), so a batch is closed with a few
// commands instead of hand edits. The section an item sits in is its state (see scripts/status.mjs).
//   pnpm item add "<標題>" --size 小 --risk 一般 --data 無 --areas novel,reader [--after R-1] [--replaces "…"]
//                          [--note "補充"] [--to approved|doing]      register (default: 已登記（未核定）)
//   pnpm item approve R-1 [R-2 …]                                      move to 已核定（未做）
//   pnpm item start R-1 [R-2 …]                                        move to 進行中
//   pnpm item review R-1 --check "驗收步驟"                             move to 待查收 with its acceptance steps
//   pnpm item accept R-1 [R-2 …]                                       delete items the user accepted (from 待查收)
//   pnpm item confirm docs/X.md [docs/Y.md …] [--refs R-1,R-2]         set the cards' 最後確認 date to today
//   pnpm item confirm --limits novel,reader                            same for known limits in those areas
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const sections = {
  decide: '待你決定',
  review: '待查收',
  doing: '進行中',
  approved: '已核定（未做）',
  logged: '已登記（未核定）',
  parked: '擱置',
}
const sizes = ['小', '中', '大'],
  risks = ['一般', '資料寫入', '安全邊界'],
  data = ['無', '設定', '新增欄位', '改結構']

export const today = () => new Date().toLocaleDateString('en-CA')

// The highest R number used anywhere it could have been (open items, the changelog, commit subjects), plus one.
export function nextId(...texts) {
  let max = 200
  for (const text of texts)
    for (const match of text.matchAll(/R-(\d+)/g)) max = Math.max(max, Number(match[1]))
  return 'R-' + (max + 1)
}

// An item is its "- **R-n**" line and the indented lines under it.
function findItem(lines, id) {
  const start = lines.findIndex((line) => line.startsWith(`- **${id}**`))
  if (start < 0) return undefined
  let end = start + 1
  while (end < lines.length && /^ {2}\S/.test(lines[end])) end++
  return { start, end }
}
function sectionOf(lines, index) {
  for (let i = index; i >= 0; i--) {
    const heading = /^## (.+)$/.exec(lines[i])
    if (heading) return heading[1].trim()
  }
  return undefined
}
function removeBlock(lines, { start, end }) {
  const block = lines.slice(start, end)
  // Drop the blank line that separated it from what follows.
  lines.splice(start, end - start + (lines[end] === '' ? 1 : 0))
  return block
}
function insertBlock(lines, section, block) {
  const heading = lines.findIndex((line) => line === '## ' + section)
  if (heading < 0) throw new Error(`沒有「${section}」這一節`)
  // Newest first, right under the heading and its blank line.
  const at = heading + (lines[heading + 1] === '' ? 2 : 1)
  lines.splice(at, 0, ...block, '')
}

export function addItem(text, options, id) {
  const { title, size, risk, data: impact, areas, after, replaces, note, to = 'logged' } = options
  if (!title) throw new Error('需要標題')
  if (!sizes.includes(size)) throw new Error('--size 要是 ' + sizes.join('／'))
  if (!risks.includes(risk)) throw new Error('--risk 要是 ' + risks.join('／'))
  if (!data.includes(impact)) throw new Error('--data 要是 ' + data.join('／'))
  if (!areas?.length) throw new Error('需要 --areas')
  if (!sections[to]) throw new Error('--to 要是 ' + Object.keys(sections).join('／'))
  const line =
    `- **${id}** ${title} ｜${size}｜${risk}｜${impact}｜領域：${areas.join('、')}｜依賴：${after || '無'}` +
    (replaces ? `｜取代：${replaces}` : '')
  const lines = text.split('\n')
  insertBlock(lines, sections[to], note ? [line, '  ' + note] : [line])
  return lines.join('\n')
}

export function moveItems(text, ids, to, check) {
  const lines = text.split('\n')
  for (const id of ids) {
    const found = findItem(lines, id)
    if (!found) throw new Error(`找不到 ${id}`)
    let block = removeBlock(lines, found)
    // Waiting for review, an item carries how to check it instead of its notes.
    if (to === 'review') {
      if (!check) throw new Error('移到待查收需要 --check "驗收步驟"')
      block = [block[0], '  驗收：' + check]
    }
    insertBlock(lines, sections[to], block)
  }
  return lines.join('\n')
}

export function acceptItems(text, ids, force = false) {
  const lines = text.split('\n')
  for (const id of ids) {
    const found = findItem(lines, id)
    if (!found) throw new Error(`找不到 ${id}`)
    const section = sectionOf(lines, found.start)
    if (section !== sections.review && !force)
      throw new Error(`${id} 在「${section}」，不在待查收（確定要刪就加 --force）`)
    removeBlock(lines, found)
  }
  return lines.join('\n')
}

// A spec card's first "最後確認：date（refs）" becomes today's date; refs are replaced when given, kept otherwise.
export function confirmCard(text, date, refs) {
  const pattern = /最後確認：\d{4}-\d{2}-\d{2}(（[^）]*）)?/
  const head = text.slice(0, 1500)
  if (!pattern.test(head)) throw new Error('頁首沒有「最後確認」')
  return text.replace(
    pattern,
    (_, kept) => `最後確認：${date}${refs ? `（${refs}）` : (kept ?? '')}`
  )
}

// Known limits in WORK_ITEMS end with "（領域：…｜確認：date）"; those in the given areas get today's date.
export function confirmLimits(text, date, areas) {
  let count = 0
  const out = text.replace(/（領域：([^｜）]+)｜確認：\d{4}-\d{2}-\d{2}）/g, (whole, list) => {
    if (!list.split(/[、,]/).some((area) => areas.includes(area.trim()))) return whole
    count++
    return `（領域：${list}｜確認：${date}）`
  })
  return { text: out, count }
}

function option(args, name) {
  const at = args.indexOf('--' + name)
  return at >= 0 ? args[at + 1] : undefined
}
function positional(args) {
  const valued = new Set([
    'size',
    'risk',
    'data',
    'areas',
    'after',
    'replaces',
    'note',
    'to',
    'check',
    'refs',
    'limits',
  ])
  return args.filter(
    (arg, index) => !arg.startsWith('--') && !(index > 0 && valued.has(args[index - 1].slice(2)))
  )
}

function main() {
  const root = path.resolve(import.meta.dirname, '..'),
    file = path.join(root, 'docs/WORK_ITEMS.md')
  const [command, ...args] = process.argv.slice(2)
  const read = () => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'),
    write = (text) => fs.writeFileSync(file, text)
  const ids = positional(args).filter((arg) => /^R-\d+$/.test(arg))
  switch (command) {
    case 'add': {
      const areas = (option(args, 'areas') ?? '')
        .split(/[,、]/)
        .map((a) => a.trim())
        .filter(Boolean)
      const known = JSON.parse(
        fs.readFileSync(path.join(root, 'docs/areas.json'), 'utf8')
      ).areas.map((a) => a.id)
      const unknown = areas.filter((area) => !known.includes(area))
      if (unknown.length) throw new Error('docs/areas.json 沒有這些領域：' + unknown.join('、'))
      const log =
        spawnSync('git', ['log', '--format=%s'], { cwd: root, encoding: 'utf8' }).stdout ?? ''
      const id = nextId(read(), fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), log)
      write(
        addItem(
          read(),
          {
            title: positional(args)[0],
            size: option(args, 'size'),
            risk: option(args, 'risk'),
            data: option(args, 'data'),
            areas,
            after: option(args, 'after'),
            replaces: option(args, 'replaces'),
            note: option(args, 'note'),
            to: option(args, 'to'),
          },
          id
        )
      )
      console.log(`登記 ${id}`)
      return
    }
    case 'approve':
    case 'start':
    case 'review': {
      if (!ids.length) throw new Error('需要 R 編號')
      const to = { approve: 'approved', start: 'doing', review: 'review' }[command]
      write(moveItems(read(), ids, to, option(args, 'check')))
      console.log(`${ids.join('、')} → ${sections[to]}`)
      return
    }
    case 'accept': {
      if (!ids.length) throw new Error('需要 R 編號')
      write(acceptItems(read(), ids, args.includes('--force')))
      console.log(`已刪除 ${ids.join('、')}`)
      return
    }
    case 'confirm': {
      const limits = option(args, 'limits')
      if (limits) {
        const result = confirmLimits(
          read(),
          today(),
          limits.split(/[,、]/).map((a) => a.trim())
        )
        write(result.text)
        console.log(`已知限制更新 ${result.count} 條`)
        return
      }
      const cards = positional(args)
      if (!cards.length) throw new Error('需要規格檔路徑')
      for (const card of cards) {
        const target = path.join(root, card)
        fs.writeFileSync(
          target,
          confirmCard(fs.readFileSync(target, 'utf8'), today(), option(args, 'refs'))
        )
      }
      console.log(`最後確認 → ${today()}：${cards.join('、')}`)
      return
    }
    default:
      console.log(
        fs
          .readFileSync(import.meta.filename, 'utf8')
          .split('\n')
          .filter((l) => l.startsWith('//'))
          .join('\n')
      )
      process.exit(command ? 2 : 0)
  }
}
if (import.meta.url === pathToFileURL(process.argv[1]).href)
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
