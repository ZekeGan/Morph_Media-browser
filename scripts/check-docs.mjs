// Dependency-free repository link checks; semantic consistency remains a review task.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const inside = (base, file) => {
  const relative = path.relative(base, file)
  return !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep)
}

function prose(markdown) {
  let fence
  return markdown
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => {
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1]
      if (fence) {
        if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined
        return ''
      }
      if (marker) {
        fence = marker
        return ''
      }
      return line
    })
    .join('\n')
}

function anchors(markdown) {
  const ids = new Set(),
    counts = new Map(),
    text = prose(markdown)
  for (const match of text.matchAll(/\b(?:id|name)=["']([^"']+)["']/g)) ids.add(match[1])
  for (const match of text.matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const heading = match[1].replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    const slug = heading
      .toLowerCase()
      .replace(/[^\p{L}\p{M}\p{N}_\- ]/gu, '')
      .replace(/ /g, '-')
    const count = counts.get(slug) ?? 0
    let id = count ? `${slug}-${count}` : slug
    let next = count
    while (ids.has(id)) id = `${slug}-${++next}`
    ids.add(id)
    counts.set(slug, next + 1)
  }
  return ids
}

function links(markdown) {
  const text = prose(markdown).replace(/`+[^`\n]*`+/g, ''),
    targets = []
  const definitions = new Map()
  for (const match of text.matchAll(/^ {0,3}\[([^\]]+)\]:\s*(<[^>]+>|\S+)/gm)) {
    definitions.set(match[1].trim().toLowerCase(), match[2])
    targets.push(match[2])
  }
  for (const match of text.matchAll(
    /!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+["'][^\n]*["'])?\s*\)/g
  ))
    targets.push(match[1])
  for (const match of text.matchAll(/\[([^\]\n]+)\]\[([^\]\n]*)\]/g)) {
    const name = (match[2] || match[1]).trim().toLowerCase()
    if (!definitions.has(name)) targets.push(`missing-reference:${name}`)
  }
  return targets
}

export function checkDocuments(base, files) {
  files = [...new Set(files)]
  const errors = [],
    cache = new Map()
  let checked = 0
  const read = (file) => {
    if (!cache.has(file)) cache.set(file, fs.readFileSync(file, 'utf8'))
    return cache.get(file)
  }
  for (const input of files) {
    const source = path.resolve(base, input)
    if (!inside(base, source) || !/\.md$/i.test(source)) {
      errors.push(`${input}: expected a repository Markdown file`)
      continue
    }
    let content
    try {
      content = read(source)
    } catch {
      errors.push(`${input}: document not found`)
      continue
    }
    for (const raw of links(content)) {
      if (raw.startsWith('missing-reference:')) {
        errors.push(`${input}: ${raw}`)
        continue
      }
      const target = raw.startsWith('<') ? raw.slice(1, -1) : raw
      if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(target)) continue
      try {
        const hash = target.indexOf('#'),
          name = hash < 0 ? target : target.slice(0, hash)
        const fragment = hash < 0 ? '' : decodeURIComponent(target.slice(hash + 1))
        const file = name ? path.resolve(path.dirname(source), decodeURIComponent(name)) : source
        checked++
        if (!inside(base, file)) throw new Error('link leaves repository')
        if (!fs.existsSync(file)) throw new Error('target not found')
        if (fragment && /\.md$/i.test(file) && !anchors(read(file)).has(fragment))
          throw new Error('anchor not found')
      } catch (error) {
        errors.push(`${input}: ${target} — ${error.message}`)
      }
    }
  }
  return { documents: files.length, links: checked, errors }
}

function selfTest() {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'media-viewer-docs-'))
  const index = path.join(fixture, 'README.md'),
    target = path.join(fixture, 'target.md')
  const source = path.join(fixture, 'source file.ts')
  try {
    fs.writeFileSync(target, '# 重複標題\n## 重複標題\n<a id="legacy"></a>\n')
    fs.writeFileSync(source, '')
    const valid =
      '[章節](target.md#重複標題-1)\n[舊連結](target.md#legacy)\n[來源](<source file.ts>)\n[來源編碼](source%20file.ts)\n[ref][r]\n[r]: target.md#重複標題\n[外站](https://example.invalid/)\n```md\n[範例](missing.md)\n```\n`[行內範例](missing.md)`'
    fs.writeFileSync(index, valid)
    assert.equal(checkDocuments(fixture, ['README.md']).errors.length, 0)
    assert.equal(checkDocuments(fixture, ['README.md', 'README.md']).documents, 1)
    for (const broken of [
      'missing.md',
      'target.md#missing',
      'source%XX.ts',
      '../outside.md',
      'tests/absent.ts',
    ]) {
      fs.writeFileSync(index, `[錯誤](${broken})`)
      assert.equal(checkDocuments(fixture, ['README.md']).errors.length, 1, broken)
    }
    fs.writeFileSync(index, '[reference][unknown]')
    assert.equal(checkDocuments(fixture, ['README.md']).errors.length, 1)
    assert.equal(checkDocuments(fixture, ['absent.md']).errors.length, 1)
    console.log('Document checker self-test passed (valid links and seven failure cases).')
  } finally {
    // Only the three files created above are removed; never recursively delete a path.
    for (const file of [index, target, source]) if (fs.existsSync(file)) fs.unlinkSync(file)
    fs.rmdirSync(fixture)
  }
}

const args = process.argv.slice(2)
if (args.length === 1 && args[0] === '--self-test') selfTest()
else {
  const result = checkDocuments(
    root,
    args.length ? args : ['CLAUDE.md', 'docs/README.md', 'docs/WORK_ITEMS.md']
  )
  for (const error of result.errors) console.error(error)
  console.log(
    `${result.documents} documents, ${result.links} local links, ${result.errors.length} errors.`
  )
  if (result.errors.length) process.exitCode = 1
}
