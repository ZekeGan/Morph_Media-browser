import fs from 'node:fs/promises'
import path from 'node:path'
import { archiveImage, archiveIndex, type ArchiveImage, type ArchiveIndex } from './archive'
import type { NovelBook } from '../shared/explorer'
import { packagePath } from '../shared/novel'

// R-282: text books for the novel reader. Everything is read only; EPUB content is returned as text for the window
// to rebuild from a short list of allowed elements, and nothing in it is ever run.
const MAX_TEXT = 32 * 1024 * 1024

// Japanese and Chinese novels are often saved in a legacy encoding. Valid UTF-8 (or a byte order mark) wins; otherwise
// the encoding that decodes with the fewest replacement characters, and then the most kana / common CJK, is used.
export function decodeText(bytes: Buffer): { text: string; encoding: string } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return { text: bytes.subarray(3).toString('utf8'), encoding: 'utf-8' }
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le' }
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be' }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' }
  } catch {}
  const sample = bytes.subarray(0, 256 * 1024)
  let best = { encoding: 'shift_jis', score: -Infinity }
  for (const encoding of ['shift_jis', 'gbk', 'big5', 'euc-jp', 'euc-kr']) {
    let text: string
    try {
      text = new TextDecoder(encoding).decode(sample)
    } catch {
      continue
    }
    const bad = (text.match(/\uFFFD/g) ?? []).length,
      kana = (text.match(/[\u3040-\u30ff]/g) ?? []).length,
      hangul = (text.match(/[가-힯]/g) ?? []).length
    const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
    const score =
      -bad * 50 +
      (encoding === 'shift_jis' || encoding === 'euc-jp' ? kana * 2 : 0) +
      (encoding === 'euc-kr' ? hangul * 2 : 0) +
      cjk
    if (score > best.score) best = { encoding, score }
  }
  return { text: new TextDecoder(best.encoding).decode(bytes), encoding: best.encoding }
}

// Chapter headings as novels write them: 第一章 / 第12話 / Chapter 3 / プロローグ / 序章 / 番外編…, on their own line.
const heading =
  /^[ \t\u3000]*(?:第[0-9０-９一二三四五六七八九十百千零〇两]+[章話话回節节卷部篇幕]|(?:chapter|CHAPTER|Chapter)\s*[0-9IVXLC]+|プロローグ|エピローグ|序章|終章|终章|序幕|楔子|番外編?|番外篇|あとがき|後記|后记)(?:[ \t\u3000:：.．、-].{0,40})?[ \t\u3000]*$/
export function splitChapters(text: string): { title: string; text: string }[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'),
    chapters: { title: string; lines: string[] }[] = [{ title: '', lines: [] }]
  for (const line of lines) {
    if (line.length <= 50 && heading.test(line))
      chapters.push({ title: line.trim().replace(/^\u3000+/, ''), lines: [] })
    else chapters[chapters.length - 1].lines.push(line)
  }
  const result = chapters
    .map((chapter) => ({ title: chapter.title, text: chapter.lines.join('\n').trim() }))
    .filter((chapter, index) => chapter.text || (index > 0 && chapter.title))
  if (result.length > 1 || (result[0]?.text.length ?? 0) <= 60000) return result
  // No headings in a long text: parts of about 20,000 characters, cut at a blank line when there is one nearby.
  const parts: { title: string; text: string }[] = []
  let rest = result[0]?.text ?? ''
  while (rest.length > 0) {
    let cut = rest.length <= 25000 ? rest.length : rest.indexOf('\n\n', 20000)
    if (cut < 0 || cut > 25000) cut = Math.min(rest.length, 20000)
    parts.push({ title: '', text: rest.slice(0, cut).trim() })
    rest = rest.slice(cut)
  }
  return parts
}

// --- EPUB ---
const attr = (tag: string, name: string) =>
  new RegExp('\\s' + name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i')
    .exec(tag)
    ?.slice(2)
    .find((v) => v !== undefined)
const decodeEntities = (value: string) =>
  value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (match, key: string) => {
    const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
    if (key[0] !== '#') return named[key.toLowerCase()] ?? match
    const code = key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1))
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
  })
// Package files are read with forward-only scanning: each search starts where the last one ended and stops at the
// first missing end, so a crafted file cannot make the scan slow. They are also capped at 1 MB.
const PACKAGE_LIMIT = 1024 * 1024
function tags(text: string, name: string) {
  const lower = text.toLowerCase(),
    open = '<' + name.toLowerCase(),
    found: string[] = []
  let at = 0
  while ((at = lower.indexOf(open, at)) >= 0) {
    const end = lower.indexOf('>', at)
    if (end < 0) break
    if (/[\s/>]/.test(lower[at + open.length] ?? '>'))
      found.push(text.slice(at, Math.min(end + 1, at + 4096)))
    at = end + 1
  }
  return found
}
function elements(text: string, name: string, nested = false) {
  const lower = text.toLowerCase(),
    open = '<' + name.toLowerCase(),
    close = '</' + name.toLowerCase(),
    found: { tag: string; inner: string }[] = []
  let at = 0
  while ((at = lower.indexOf(open, at)) >= 0) {
    const end = lower.indexOf('>', at)
    if (end < 0) break
    if (!/[\s/>]/.test(lower[at + open.length] ?? '>')) {
      at = end + 1
      continue
    }
    const finish = lower.indexOf(close, end)
    if (finish < 0) break
    found.push({
      tag: text.slice(at, Math.min(end + 1, at + 4096)),
      inner: text.slice(end + 1, Math.min(finish, end + 1 + 4096)),
    })
    // Nested elements (NCX navPoints inside navPoints) are read too, each by its own first label.
    at = nested ? end + 1 : finish + close.length
  }
  return found
}
const plain = (value: string) =>
  decodeEntities(value.slice(0, 1000).replace(/<[^<>]*>/g, '')).trim()
async function readEntry(file: string, index: ArchiveIndex, name: string, limit = MAX_TEXT) {
  const entry = index.texts?.find((item: ArchiveImage) => item.name === name)
  if (!entry || entry.size > limit) return undefined
  return (await archiveImage(file, index, entry)).toString('utf8')
}
export async function readEpub(
  file: string,
  imageUrl: (index: number) => string
): Promise<Omit<NovelBook, 'encoding'>> {
  const index = await archiveIndex(file, { texts: /\.(x?html?|opf|ncx|xml)$/i })
  const container = await readEntry(file, index, 'META-INF/container.xml', PACKAGE_LIMIT)
  const rootfile = container ? tags(container, 'rootfile')[0] : undefined,
    opfPath = rootfile && attr(rootfile, 'full-path')
  if (!opfPath) throw new Error('EPUB 缺少 container.xml 或套件檔')
  const opf = await readEntry(file, index, opfPath, PACKAGE_LIMIT)
  if (!opf) throw new Error('EPUB 套件檔無法讀取')
  const manifest = new Map<string, { href: string; type: string; properties: string }>()
  for (const tag of tags(opf, 'item')) {
    const id = attr(tag, 'id'),
      href = attr(tag, 'href')
    if (id && href)
      manifest.set(id, {
        href: packagePath(opfPath, decodeEntities(href)) ?? '',
        type: attr(tag, 'media-type') ?? '',
        properties: attr(tag, 'properties') ?? '',
      })
  }
  const spine = tags(opf, 'itemref')
    .map((tag) => manifest.get(attr(tag, 'idref') ?? ''))
    .filter((item): item is { href: string; type: string; properties: string } => !!item?.href)
  const title = plain(elements(opf, 'dc:title')[0]?.inner ?? '')
  // Chapter names from the EPUB 3 navigation document, else the EPUB 2 NCX.
  const names = new Map<string, string>()
  const nav = [...manifest.values()].find((item) => /\bnav\b/.test(item.properties))
  const navText = nav && (await readEntry(file, index, nav.href, PACKAGE_LIMIT))
  if (navText)
    for (const anchor of elements(navText, 'a')) {
      const href = attr(anchor.tag, 'href'),
        target = href && packagePath(nav!.href, decodeEntities(href)),
        label = plain(anchor.inner)
      if (target && label && !names.has(target)) names.set(target, label)
    }
  const ncx = [...manifest.values()].find((item) => item.type === 'application/x-dtbncx+xml')
  const ncxText = !names.size && ncx && (await readEntry(file, index, ncx.href, PACKAGE_LIMIT))
  if (ncxText)
    for (const point of elements(ncxText, 'navPoint', true)) {
      const label = plain(elements(point.inner, 'text')[0]?.inner ?? ''),
        content = tags(point.inner, 'content')[0],
        src = content && attr(content, 'src'),
        target = src && packagePath(ncx!.href, decodeEntities(src))
      if (target && label && !names.has(target)) names.set(target, label)
    }
  const chapters: NovelBook['chapters'] = []
  let total = 0
  for (const item of spine) {
    if (!/x?html/i.test(item.type) && !/\.x?html?$/i.test(item.href)) continue
    const html = await readEntry(file, index, item.href)
    if (html === undefined) continue
    total += html.length
    if (total > MAX_TEXT) throw new Error('EPUB 內容超出限制')
    chapters.push({ title: names.get(item.href) ?? '', html, path: item.href })
  }
  if (!chapters.length) throw new Error('EPUB 沒有可讀的章節')
  // Images are served through the existing read-only archive stream, by their position in the image list.
  const images: Record<string, string> = {}
  index.images.forEach((image, number) => {
    images[image.name] = imageUrl(number)
  })
  return { format: 'epub', title, chapters, images }
}

export async function readNovel(
  file: string,
  imageUrl: (index: number) => string
): Promise<NovelBook> {
  if (/\.epub$/i.test(file)) return { ...(await readEpub(file, imageUrl)), encoding: 'utf-8' }
  const stat = await fs.stat(file)
  if (stat.size > MAX_TEXT) throw new Error('文字檔超過 32 MB，無法開啟')
  const { text, encoding } = decodeText(await fs.readFile(file))
  return {
    format: 'txt',
    title: path.basename(file).replace(/\.txt$/i, ''),
    encoding,
    chapters: splitChapters(text),
  }
}
