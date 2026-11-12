import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { decodeText, readNovel, splitChapters } from '../electron/novel'
import { bookPercent, latestNovel, packagePath, rubyPieces } from '../shared/novel'
import { validateDetails } from '../shared/model'
import { Library } from '../electron/library'
import { Explorer } from '../electron/explorer'
import { readFolder } from '../electron/files'
import { detectFolderKind, sampleOf } from '../shared/kind'
import { tinyPng, zipFixture } from './support/archive-fixture'

const base = path.resolve('.test-output')

test('text books decode UTF-8, byte-order marks and Shift_JIS', () => {
  assert.equal(decodeText(Buffer.from('第一章　始まり\n本文', 'utf8')).encoding, 'utf-8')
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('こんにちは', 'utf16le')])
  assert.deepEqual(decodeText(utf16), { text: 'こんにちは', encoding: 'utf-16le' })
  // 「こんにちは、世界。」 in Shift_JIS.
  const sjis = Buffer.from([
    0x82, 0xb1, 0x82, 0xf1, 0x82, 0xc9, 0x82, 0xbf, 0x82, 0xcd, 0x81, 0x41, 0x90, 0xa2, 0x8a, 0x45,
    0x81, 0x42,
  ])
  assert.deepEqual(decodeText(sjis), { text: 'こんにちは、世界。', encoding: 'shift_jis' })
})

test('chapters are cut at heading lines; a long text without headings is cut into parts', () => {
  const chapters = splitChapters(
    '前書き\n\n第一章　出会い\n本文一\n\n第2話 再会\n本文二\nChapter 3\n本文三\n第一章は良い章だった。'
  )
  assert.deepEqual(
    chapters.map((c) => c.title),
    ['', '第一章　出会い', '第2話 再会', 'Chapter 3']
  )
  assert.match(chapters[3].text, /第一章は良い章だった/, 'a sentence is not a heading')
  const long = splitChapters(('あ'.repeat(80) + '\n\n').repeat(1000))
  assert.ok(long.length >= 3 && long.every((c) => c.text.length <= 25000))
})

test('web-novel ruby, package paths and book progress', () => {
  assert.deepEqual(rubyPieces('彼は｜魔法使い《ウィザード》と漢字《かんじ》を'), [
    '彼は',
    { base: '魔法使い', ruby: 'ウィザード' },
    'と',
    { base: '漢字', ruby: 'かんじ' },
    'を',
  ])
  assert.equal(packagePath('OEBPS/text/ch1.xhtml', '../img/a.png'), 'OEBPS/img/a.png')
  assert.equal(packagePath('OEBPS/ch1.xhtml', '../../../etc/passwd'), undefined)
  assert.equal(packagePath('OEBPS/ch1.xhtml', 'https://example.com/a.png'), undefined)
  assert.equal(packagePath('OEBPS/ch1.xhtml', 'file:///C:/a.png'), undefined)
  assert.equal(bookPercent([100, 300], 1, 0.5), 0.625)
  assert.equal(
    latestNovel({
      a: { percent: 0.2, updated: '2026-01-01T00:00:00Z' },
      b: { percent: 0.9, updated: '2026-02-01T00:00:00Z' },
    })?.percent,
    0.9
  )
})

test('an EPUB is read from its package, navigation and spine; scripts stay text and images stay inside', async (t) => {
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'novel-'))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const file = path.join(root, 'book.epub')
  const text = (name: string, value: string) => ({ name, bytes: Buffer.from(value) })
  await fs.writeFile(
    file,
    zipFixture([
      { name: 'mimetype', bytes: Buffer.from('application/epub+zip'), method: 0 },
      text(
        'META-INF/container.xml',
        '<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
      ),
      text(
        'OEBPS/content.opf',
        '<package><metadata><dc:title>Test &amp; Book</dc:title></metadata><manifest>' +
          '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' +
          '<item id="c1" href="text/c1.xhtml" media-type="application/xhtml+xml"/>' +
          '<item id="c2" href="text/c2.xhtml" media-type="application/xhtml+xml"/>' +
          '<item id="img" href="img/a.png" media-type="image/png"/>' +
          '</manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>'
      ),
      text(
        'OEBPS/nav.xhtml',
        '<html><body><nav epub:type="toc"><ol><li><a href="text/c1.xhtml">一、始まり</a></li><li><a href="text/c2.xhtml#x">二、終わり</a></li></ol></nav></body></html>'
      ),
      text(
        'OEBPS/text/c1.xhtml',
        '<html><body><p>本文<script>alert(1)</script></p><img src="../img/a.png"/></body></html>'
      ),
      text('OEBPS/text/c2.xhtml', '<html><body><p>二章</p></body></html>'),
      { name: 'OEBPS/img/a.png', bytes: tinyPng },
    ])
  )
  // A crafted navigation file full of unclosed tags is read in linear time and simply yields no names.
  const crafted = path.join(root, 'crafted.epub')
  await fs.writeFile(
    crafted,
    zipFixture([
      text('META-INF/container.xml', '<rootfile full-path="o.opf"/>'),
      text(
        'o.opf',
        '<item id="n" href="n.xhtml" properties="nav"/><item id="c" href="c.xhtml" media-type="application/xhtml+xml"/><itemref idref="c"/>'
      ),
      text('n.xhtml', '<a href="c.xhtml">'.repeat(40000)),
      text('c.xhtml', '<p>x</p>'),
    ])
  )
  const started = performance.now()
  const craftedBook = await readNovel(crafted, () => '')
  assert.ok(performance.now() - started < 2000, 'scan time ' + (performance.now() - started))
  assert.deepEqual(
    craftedBook.chapters.map((c) => c.title),
    ['']
  )
  const book = await readNovel(file, (n) => 'media://archive/x/y/z/' + n)
  assert.equal(book.format, 'epub')
  assert.equal(book.title, 'Test & Book')
  assert.deepEqual(
    book.chapters.map((c) => [c.title, c.path]),
    [
      ['一、始まり', 'OEBPS/text/c1.xhtml'],
      ['二、終わり', 'OEBPS/text/c2.xhtml'],
    ]
  )
  assert.deepEqual(book.images, { 'OEBPS/img/a.png': 'media://archive/x/y/z/0' })
})

test('a folder of text books opens in the novel reader and keeps its place in the record', async (t) => {
  await fs.mkdir(base, { recursive: true })
  const root = await fs.mkdtemp(path.join(base, 'novel-folder-')),
    media = path.join(root, 'Novels')
  await fs.mkdir(media)
  await fs.writeFile(path.join(media, 'story.txt'), '第一章\n本文\n第二章\n続き')
  const library = new Library(path.join(root, 'local'), undefined, false)
  await library.init()
  const explorer = new Explorer(library, library.userData, {
    choose: async () => undefined,
    open: async () => {},
    launch: async () => {},
    thumbnail: async () => Buffer.alloc(0),
  })
  t.after(async () => {
    explorer.index.close()
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
  })
  await library.create(media, { name: 'Novels', depth: { mode: 'through', level: 1 } })
  const row = () => library.snapshot().rows.find((r) => r.path === media)!
  const entries = (await explorer.content(row().rowId)).entries,
    story = entries.find((e) => e.name === 'story.txt')!
  assert.equal(story.kind, 'text')
  assert.equal(detectFolderKind(row(), sampleOf(entries)).kind, 'book')
  const book = (await explorer.request({ action: 'novel', rowId: row().rowId, fileId: story.id }))
    .novel!
  assert.deepEqual(
    book.chapters.map((c) => c.title),
    ['第一章', '第二章']
  )
  const progress = {
    chapter: 1,
    position: 0.5,
    percent: 0.75,
    updated: '2026-11-12T00:00:00.000Z',
    bookmarks: [{ chapter: 0, position: 0, label: '第一章' }],
  }
  await explorer.request({
    action: 'novelProgress',
    rowId: row().rowId,
    fileId: story.id,
    progress,
  })
  assert.deepEqual((await readFolder(media)).details!.novels!['story.txt'], progress)
  assert.equal(
    await fs.readFile(path.join(media, 'story.txt'), 'utf8'),
    '第一章\n本文\n第二章\n続き'
  )
  for (const bad of [
    { 'x.txt': { ...progress, extra: 'x'.repeat(1000) } },
    { 'x.txt': { ...progress, bookmarks: [{ chapter: 0, position: 0, label: 'a', more: 1 }] } },
    { 'a/b.txt': progress },
    { 'x.txt': { ...progress, position: 2 } },
    { 'x.txt': { ...progress, updated: 'yesterday' } },
  ])
    assert.throws(() => validateDetails({ schemaVersion: 1, novels: bad as never }))
})
