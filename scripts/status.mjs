// Prints the status block that ends every reply, from docs/WORK_ITEMS.md (the section an item sits in is its state).
//   pnpm status            full block
//   pnpm status --short    one line, for replies that changed nothing
import fs from 'node:fs'
import path from 'node:path'
import { root } from './areas.mjs'

const text = fs.readFileSync(path.join(root, 'docs/WORK_ITEMS.md'), 'utf8').replace(/\r\n/g, '\n')
const sections = new Map()
let current
for (const line of text.split('\n')) {
  const heading = /^## (.+)$/.exec(line)
  if (heading) {
    current = heading[1].trim()
    sections.set(current, [])
    continue
  }
  const item = /^- \*\*(R-\d+)\*\*\s*(.+)$/.exec(line)
  if (item && current) {
    const [title, ...fields] = item[2].split('｜').map((part) => part.trim())
    const areas = /領域：([^｜]+)/.exec(item[2])?.[1].trim() ?? ''
    sections.get(current).push({ id: item[1], title, fields, areas })
  }
}
const list = (name) => sections.get(name) ?? []
const decide = list('待你決定'),
  review = list('待查收'),
  doing = list('進行中'),
  approved = list('已核定（未做）'),
  logged = list('已登記（未核定）'),
  parked = list('擱置')
const names = (items) => items.map((item) => `${item.id} ${item.title}`).join('、')

if (process.argv.includes('--short')) {
  const parts = [
    decide.length && `待決定 ${decide.length}`,
    review.length && `待查收 ${review.length}`,
    doing.length && `進行中 ${doing.length}`,
    approved.length && `已核定 ${approved.length}`,
  ].filter(Boolean)
  console.log(`狀態：${parts.join('｜') || '沒有待處理項目'}`)
} else {
  const lines = ['── 目前狀態 ──']
  if (decide.length) lines.push(`⚠ 待你決定（${decide.length}）：${names(decide)}`)
  if (review.length) lines.push(`✔ 待你查收（${review.length}）：${names(review)}`)
  if (doing.length) lines.push(`… 進行中（${doing.length}）：${names(doing)}`)
  if (approved.length) {
    // Approved items that share an area are suggested together (one read of the code, one test run).
    const byArea = new Map()
    for (const item of approved) {
      const key = item.areas.split(/[、,]/)[0]?.trim() || '—'
      byArea.set(key, [...(byArea.get(key) ?? []), item])
    }
    const [first] = [...byArea.values()].sort((a, b) => b.length - a.length)
    lines.push(`▶ 建議下一批：${names(first)}`)
  }
  lines.push(`· 已核定未做 ${approved.length}｜只登記 ${logged.length}｜擱置 ${parked.length}`)
  console.log(lines.join('\n'))
}
