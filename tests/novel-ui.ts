import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { Library } from '../electron/library'
import { readFolder } from '../electron/files'
import { tinyPng, zipFixture } from './support/archive-fixture'
import { closeApp, launchApp, removeTestRoot, reportFailure } from './support/app'

// R-282: the novel reader. A TXT book with chapter headings and ruby, and an EPUB with a picture, in a folder of
// text books: pages turn, vertical text, contents, search and bookmarks work, and the place is kept.
const base = path.resolve('.test-output')
await fs.mkdir(path.join(base, 'shot'), { recursive: true })
const root = await fs.mkdtemp(path.join(base, 'novel-ui-')),
  media = path.join(root, 'Novels'),
  local = path.join(root, 'local')
await fs.mkdir(media)
const paragraph = '吾輩は猫である。名前はまだ無い。どこで生れたかとんと見当がつかぬ。'.repeat(6)
const story =
  '前書き\n\n' +
  [1, 2, 3]
    .map(
      (n) =>
        `第${n}章　章${n}\n` +
        `｜魔法使い《ウィザード》が${n}2回来た。\n` +
        Array.from({ length: 40 }, () => paragraph).join('\n') +
        (n === 2 ? '\n合言葉はペンギン。\n' : '\n')
    )
    .join('')
const storyBytes = Buffer.from(story, 'utf8')
await fs.writeFile(path.join(media, 'story.txt'), storyBytes)
const xml = (name: string, value: string) => ({ name, bytes: Buffer.from(value) })
await fs.writeFile(
  path.join(media, 'book.epub'),
  zipFixture([
    { name: 'mimetype', bytes: Buffer.from('application/epub+zip'), method: 0 },
    xml(
      'META-INF/container.xml',
      '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'
    ),
    xml(
      'OPS/book.opf',
      '<package><metadata><dc:title>Picture Book</dc:title></metadata><manifest>' +
        '<item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>' +
        '<item id="p" href="p.png" media-type="image/png"/></manifest><spine><itemref idref="c1"/></spine></package>'
    ),
    xml(
      'OPS/c1.xhtml',
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Opening</h1><p>Hello <ruby>漢<rt>かん</rt></ruby></p><img src="p.png" alt="art"/><script>window.hacked=1</script></body></html>'
    ),
    { name: 'OPS/p.png', bytes: tinyPng },
  ])
)
const library = new Library(local, undefined, false)
await library.init()
await library.create(media, {
  name: 'Novel test',
  depth: { mode: 'through', level: 1 },
  scanAll: true,
})
const errors: string[] = []
const { app, page } = await launchApp(local, errors, { width: 1200, height: 820 })
const reader = () => page.getByRole('dialog', { name: '小說閱讀器', exact: true })
const info = () => reader().locator('.novel-info strong').innerText()
// R-336: layout choices are in the "Aa" settings.
const choose = async (name: string) => {
  await reader().getByRole('button', { name: '閱讀設定', exact: true }).click()
  await reader().locator('.novel-settings label').getByText(name, { exact: true }).click()
  await page.keyboard.press('Escape')
  await reader().locator('.novel-settings').waitFor({ state: 'hidden' })
}
let passed = false
try {
  await page.getByRole('button', { name: '開啟專案 Novel test', exact: true }).first().click()
  await page.getByRole('button', { name: 'story.txt', exact: true }).click()
  await reader().waitFor()
  // Chapter 0 is the foreword; the ruby renders as <ruby>.
  // The book loads after the dialog opens; wait for its chapter label.
  await page.waitForFunction(() => !!document.querySelector('.novel-info strong')?.textContent)
  assert.match(await info(), /第 1 \/ 4 章/)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() =>
    /第 2 \/ 4 章/.test(document.querySelector('.novel-info strong')?.textContent ?? '')
  )
  assert.equal(await reader().locator('ruby', { hasText: '魔法使い' }).count(), 1)
  assert.equal(
    await reader().locator('.novel-tcy').count(),
    0,
    'no upright digits in horizontal text'
  )
  // Vertical text: the page reads right to left and short digit runs stand upright.
  // R-325: the settings button opens its panel.
  await reader().getByRole('button', { name: '閱讀設定', exact: true }).click()
  // The panel is on top of the page: the point at its slider belongs to the panel, not the reading area.
  const size = reader().getByText(/^字級 \d+$/)
  await size.waitFor({ timeout: 3000 })
  const sizeBox = (await size.boundingBox())!
  assert.ok(
    await page.evaluate(
      ([x, y]) => !!document.elementFromPoint(x, y)?.closest('.mantine-Popover-dropdown'),
      [sizeBox.x + 4, sizeBox.y + sizeBox.height / 2]
    ),
    'settings panel is visible above the page'
  )
  await page.keyboard.press('Escape')
  await choose('直排')
  await page.waitForFunction(() =>
    getComputedStyle(document.querySelector('.novel-content')!).writingMode.startsWith('vertical')
  )
  assert.ok((await reader().locator('.novel-tcy').count()) > 0)
  await page.screenshot({ path: path.join(base, 'shot', 'r282-novel-vertical.png') })
  // Contents: jump to chapter 3.
  await reader().getByRole('button', { name: '目錄、書籤與搜尋', exact: true }).click()
  await reader()
    .getByRole('navigation', { name: '目錄' })
    .getByRole('button', { name: '第3章　章3', exact: true }) // ui-names: ignore
    .click()
  await page.waitForFunction(() =>
    /第 4 \/ 4 章/.test(document.querySelector('.novel-info strong')?.textContent ?? '')
  )
  // R-326: in vertical text a new chapter starts at its beginning, on the right, in view.
  await page.waitForTimeout(300)
  assert.ok(
    await page.evaluate(() => {
      const page = document.querySelector('.novel-page')!,
        walker = document.createTreeWalker(
          document.querySelector('.novel-content')!,
          NodeFilter.SHOW_TEXT
        )
      let node = walker.nextNode()
      while (node && !node.textContent?.trim()) node = walker.nextNode()
      const range = document.createRange()
      range.setStart(node!, 0)
      range.setEnd(node!, 1)
      const first = range.getBoundingClientRect(),
        frame = page.getBoundingClientRect()
      return (
        first.right <= frame.right + 1 && first.left >= frame.left - 1 && first.top >= frame.top - 1
      )
    }),
    'the chapter opens at its first line'
  )
  // Scrolling vertical text from chapter 2 on.
  await choose('捲動')
  await reader()
    .getByRole('navigation', { name: '目錄' })
    .getByRole('button', { name: '第2章　章2', exact: true }) // ui-names: ignore
    .click()
  await page.waitForFunction(() =>
    /第 3 \/ 4 章/.test(document.querySelector('.novel-info strong')?.textContent ?? '')
  )
  // R-336: in scroll mode the next chapter follows the text, with only a line between them.
  const divider = reader().locator('[data-chapter="2"] .novel-chapter-divider')
  await divider.waitFor({ state: 'attached' })
  assert.match(await divider.innerText(), /完/)
  assert.equal(
    await reader().locator('[data-chapter="3"]').count(),
    1,
    'the next chapter is laid out'
  )
  // Scrolling on until the next chapter passes the reading line makes it the current one, and the text stays put.
  const placed = await page.evaluate(() => {
    const element = document.querySelector('.novel-page')!,
      next = element.querySelector('[data-chapter="3"]')!,
      frame = element.getBoundingClientRect()
    element.scrollLeft -=
      frame.right - next.getBoundingClientRect().right - element.clientWidth * 0.05
    return frame.right - next.getBoundingClientRect().right
  })
  await page.waitForFunction(() =>
    /第 4 \/ 4 章/.test(document.querySelector('.novel-info strong')?.textContent ?? '')
  )
  await page.waitForTimeout(200)
  const after = await page.evaluate(() => {
    const element = document.querySelector('.novel-page')!
    return (
      element.getBoundingClientRect().right -
      element.querySelector('[data-chapter="3"]')!.getBoundingClientRect().right
    )
  })
  assert.ok(Math.abs(after - placed) <= 3, `the text does not jump: ${placed} → ${after}`)
  await page.screenshot({ path: path.join(base, 'shot', 'r336-novel-continuous.png') })
  await choose('分頁')
  // R-342: in paged mode the last page of a chapter is its end page; at the end of the book it says so.
  await page.locator('.novel-page').focus()
  await page.keyboard.press('End')
  const endCard = reader().locator('.novel-end-card')
  await endCard.getByText('全書完', { exact: true }).waitFor()
  const cardBox = (await endCard.boundingBox())!,
    pageBox = (await reader().locator('.novel-page').boundingBox())!
  assert.ok(
    cardBox.y >= pageBox.y - 1 && cardBox.y + cardBox.height <= pageBox.y + pageBox.height + 1,
    'the end page is on screen'
  )
  await page.screenshot({ path: path.join(base, 'shot', 'r342-novel-end-page.png') })
  // Search finds the password in chapter 2 and goes there.
  await reader()
    .getByRole('radio', { name: '搜尋' })
    .click({ force: true })
    .catch(async () => {
      await reader().getByText('搜尋', { exact: true }).click()
    })
  const box = reader().getByRole('textbox', { name: '搜尋全文', exact: true })
  await box.fill('ペンギン')
  await box.press('Enter')
  await reader().getByText('找到 1 處', { exact: true }).waitFor()
  // R-323: the result marks the keyword.
  assert.equal(
    await reader().locator('.novel-list mark.novel-hit', { hasText: 'ペンギン' }).count(),
    1
  )
  await reader().locator('.novel-list button', { hasText: 'ペンギン' }).click()
  await page.waitForFunction(() =>
    /第 3 \/ 4 章/.test(document.querySelector('.novel-info strong')?.textContent ?? '')
  )
  // A bookmark at this place.
  await reader().getByRole('button', { name: '加入書籤', exact: true }).click()
  await reader().locator('.novel-mark').first().waitFor()
  await reader().getByRole('button', { name: '退出 · ESC', exact: true }).click()
  await reader().waitFor({ state: 'detached' })
  await page.waitForFunction(() =>
    document.querySelector('.statusbar')?.textContent?.includes('就緒')
  )
  // Saves are queued in order; wait for the last one (leaving the reader) to reach the record.
  let saved = (await readFolder(media)).details?.novels?.['story.txt']
  for (let i = 0; i < 50 && !(saved?.chapter === 2 && saved.bookmarks?.length); i++) {
    await page.waitForTimeout(100)
    saved = (await readFolder(media)).details?.novels?.['story.txt']
  }
  assert.equal(saved?.chapter, 2)
  assert.ok(saved && saved.percent > 0.4 && saved.percent < 0.9, 'percent ' + saved?.percent)
  assert.equal(saved?.bookmarks?.length, 1)
  assert.deepEqual(
    await fs.readFile(path.join(media, 'story.txt')),
    storyBytes,
    'the book is never written'
  )
  // Opening it again returns to chapter 3.
  await page.getByRole('button', { name: 'story.txt', exact: true }).click()
  await page.waitForFunction(() =>
    /第 3 \/ 4 章/.test(document.querySelector('.novel-info strong')?.textContent ?? '')
  )
  await page.keyboard.press('Escape')
  await reader().waitFor({ state: 'detached' })
  // EPUB: allowed elements only (no script runs), ruby kept, the picture comes from inside the book.
  await page.getByRole('button', { name: 'book.epub', exact: true }).click()
  await reader().locator('h1', { hasText: 'Opening' }).waitFor()
  assert.equal(await reader().locator('ruby rt', { hasText: 'かん' }).count(), 1)
  assert.equal(await reader().locator('script').count(), 0)
  await page.waitForFunction(() => {
    const image = document.querySelector<HTMLImageElement>('.novel-image')
    return !!image && image.complete && image.naturalWidth > 0
  })
  assert.equal(
    await page.evaluate(() => (window as unknown as { hacked?: number }).hacked),
    undefined
  )
  await page.screenshot({ path: path.join(base, 'shot', 'r282-novel-epub.png') })
  assert.deepEqual(errors, [])
  passed = true
  console.log(
    'PASS novel reader: TXT chapters, ruby, vertical text, contents, search, bookmark, saved place; EPUB. ' +
      root
  )
} catch (error) {
  await reportFailure(page, root)
  throw error
} finally {
  await closeApp(app)
  if (passed) await removeTestRoot(root)
}
