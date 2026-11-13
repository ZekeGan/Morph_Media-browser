import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ActionIcon,
  Button,
  DirectionProvider,
  FocusTrap,
  Menu,
  Popover,
  SegmentedControl,
  Slider,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import type {
  ExplorerRequest,
  ExplorerResponse,
  MediaEntry,
  NovelBook,
  NovelProgress,
} from '../../shared/explorer'
import type { FolderRow } from '../../shared/model'
import { bookPercent } from '../../shared/novel'
import { t as tr, useLocale } from '../i18n'
import { Icon, type IconName } from '../common/icons'
import { describeError } from '../notices/errors'
import { chapterText, HtmlChapter, TextChapter } from './NovelContent'
import './novel.css'

// R-282: the novel reader. Reading settings are this computer's (they suit the screen and the reader, not the book);
// the place in each book is kept in the folder record with the other reading records.
type Settings = {
  vertical: boolean
  paged: boolean
  font: 'serif' | 'sans'
  size: number
  lineHeight: number
  margin: number
  chars: number
  theme: 'paper' | 'light' | 'dark'
}
const defaults: Settings = {
  vertical: false,
  paged: true,
  font: 'serif',
  size: 18,
  lineHeight: 1.8,
  margin: 6,
  chars: 0,
  theme: 'paper',
}
const settingsKey = 'morph.novel.settings'
function loadSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(settingsKey) ?? '{}') }
  } catch {
    return defaults
  }
}
type Run = (request: ExplorerRequest) => Promise<ExplorerResponse | undefined>

export function NovelReader({
  row,
  file,
  run,
  close,
  next,
  embedded = false,
}: {
  row: FolderRow
  file: MediaEntry
  run?: Run
  close: () => void
  // The next text book in the folder, offered after the last page.
  next?: { name: string; open: () => void }
  embedded?: boolean
}) {
  useLocale()
  const [book, setBook] = useState<NovelBook>(),
    [error, setError] = useState(''),
    [settings, setSettingsState] = useState(loadSettings),
    saved = row.record?.details?.novels?.[file.name],
    [chapter, setChapter] = useState(saved?.chapter ?? 0),
    [position, setPosition] = useState(saved?.position ?? 0),
    [bookmarks, setBookmarks] = useState(saved?.bookmarks ?? []),
    [panel, setPanel] = useState<'toc' | 'marks' | 'search'>(),
    [settingsOpen, setSettingsOpen] = useState(false),
    [query, setQuery] = useState(''),
    [hits, setHits] =
      useState<{ chapter: number; at: number; before: string; match: string; after: string }[]>(),
    // The next book (R-345) opens in a new reader while the window is still in fullscreen: it stays immersive.
    [immersive, setImmersive] = useState(() => !!document.fullscreenElement),
    // R-349: the panel was brought out by the mouse at the left edge in immersive reading and leaves with it.
    [peek, setPeek] = useState(false),
    [ending, setEnding] = useState(false),
    [box, setBox] = useState({ width: 1, height: 1 })
  const scroller = useRef<HTMLDivElement>(null),
    restore = useRef<number | 'end'>(saved?.position ?? 0),
    findAfterRender = useRef<{ text: string; nth: number } | undefined>(undefined),
    // Scroll mode: how far into the newly current chapter the view was when scrolling crossed into it.
    anchor = useRef<number | undefined>(undefined)
  const setSettings = (change: Partial<Settings>) =>
    setSettingsState((previous) => {
      const next = { ...previous, ...change }
      try {
        localStorage.setItem(settingsKey, JSON.stringify(next))
      } catch {}
      restore.current = position
      return next
    })
  useEffect(() => {
    let alive = true
    void window.explorer
      .request({ action: 'novel', rowId: row.rowId, fileId: file.id })
      .then((result) => {
        if (!alive || !result.novel) return
        setBook(result.novel)
        setChapter((value) => Math.min(value, result.novel!.chapters.length - 1))
      })
      .catch((reason) => alive && setError(describeError(reason).message))
    return () => {
      alive = false
    }
  }, [row.rowId, file.id])
  const lengths = useMemo(
    () => book?.chapters.map((c) => (c.text ?? c.html ?? '').length) ?? [],
    [book]
  )
  const current = book?.chapters[chapter]
  // --- Geometry: paged mode lays the chapter out in columns one window wide (or tall, in vertical text). ---
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    const measure = () =>
      setBox((previous) =>
        previous.width === element.clientWidth && previous.height === element.clientHeight
          ? previous
          : { width: element.clientWidth, height: element.clientHeight }
      )
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [!!book])
  const { vertical, paged } = settings
  const extent = () => {
    const element = scroller.current!
    return paged
      ? vertical
        ? {
            at: element.scrollTop,
            max: element.scrollHeight - element.clientHeight,
            page: element.clientHeight,
          }
        : {
            at: element.scrollLeft,
            max: element.scrollWidth - element.clientWidth,
            page: element.clientWidth,
          }
      : vertical
        ? {
            at: Math.abs(element.scrollLeft),
            max: element.scrollWidth - element.clientWidth,
            page: element.clientWidth * 0.9,
          }
        : {
            at: element.scrollTop,
            max: element.scrollHeight - element.clientHeight,
            page: element.clientHeight * 0.9,
          }
  }
  const sectionBox = (index: number) => {
    const element = scroller.current,
      section = element?.querySelector<HTMLElement>(`[data-chapter="${index}"]`)
    if (!element || !section) return undefined
    const frame = element.getBoundingClientRect(),
      rect = section.getBoundingClientRect()
    return vertical
      ? { start: frame.right - rect.right + Math.abs(element.scrollLeft), size: rect.width }
      : { start: rect.top - frame.top + element.scrollTop, size: rect.height }
  }
  const viewSize = () =>
    scroller.current ? (vertical ? scroller.current.clientWidth : scroller.current.clientHeight) : 1
  const scrollTo = (value: number) => {
    const element = scroller.current!
    if (paged && vertical) element.scrollTop = value
    else if (paged) element.scrollLeft = value
    else if (vertical) element.scrollLeft = -value
    else element.scrollTop = value
  }
  // Put the reader back at the saved place (or the start / end of a chapter) once the chapter is laid out.
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element || !current) return
    const target = restore.current
    restore.current = 0
    const box = paged ? undefined : sectionBox(chapter)
    if (box) {
      const span = Math.max(0, box.size - viewSize()),
        into = anchor.current ?? (target === 'end' ? span : span * target)
      anchor.current = undefined
      scrollTo(box.start + into)
    } else {
      const { max, page } = extent()
      let value = target === 'end' ? max : Math.round(max * target)
      if (paged && page > 0) value = Math.min(max, Math.round(value / page) * page)
      scrollTo(value)
    }
    track()
    if (findAfterRender.current) {
      const { text, nth } = findAfterRender.current
      findAfterRender.current = undefined
      showMatch(text, nth)
    }
  }, [
    chapter,
    current,
    vertical,
    paged,
    box,
    settings.size,
    settings.lineHeight,
    settings.margin,
    settings.chars,
    settings.font,
  ])
  const track = () => {
    if (!scroller.current) return
    const { at, max } = extent()
    if (paged) return setPosition(max > 0 ? Math.min(1, Math.max(0, at / max)) : 0)
    const view = viewSize(),
      line = at + view * 0.1,
      shown = [chapter - 1, chapter + 1].find((index) => {
        const box = sectionBox(index)
        return box && line >= box.start && line < box.start + box.size
      })
    if (shown !== undefined) {
      anchor.current = at - sectionBox(shown)!.start
      setEnding(false)
      setChapter(shown)
      return
    }
    const box = sectionBox(chapter)
    if (!box) return
    const span = box.size - view
    setPosition(
      span > 0 ? Math.min(1, Math.max(0, (at - box.start) / span)) : at >= box.start ? 1 : 0
    )
  }
  // --- Saving the place: on chapter change, every half minute while reading, and when leaving. ---
  const latest = useRef({ chapter, position, bookmarks, lengths })
  latest.current = { chapter, position, bookmarks, lengths }
  const lastSaved = useRef(
      JSON.stringify({ c: saved?.chapter, p: saved?.position, b: saved?.bookmarks ?? [] })
    ),
    target = useRef({ run, row })
  target.current = { run, row }
  // One stable function: it reads the latest place and is only marked saved once the write went through (a busy
  // window drops it, and the next chance tries again).
  const save = useCallback(() => {
    const { run, row } = target.current
    if (!run || !row.record || row.readonly || row.stopped) return
    const { chapter, position, bookmarks, lengths } = latest.current
    const stamp = JSON.stringify({
      c: chapter,
      p: Math.round(position * 1000) / 1000,
      b: bookmarks,
    })
    if (stamp === lastSaved.current || !lengths.length) return
    const progress: NovelProgress = {
      chapter,
      position: Math.round(position * 1000) / 1000,
      percent: Math.round(bookPercent(lengths, chapter, position) * 1000) / 1000,
      updated: new Date().toISOString(),
      ...(bookmarks.length ? { bookmarks } : {}),
    }
    void run({ action: 'novelProgress', rowId: row.rowId, fileId: file.id, progress }).then(
      (result) => {
        if (result) lastSaved.current = stamp
      }
    )
  }, [file.id])
  useEffect(() => {
    const timer = setInterval(save, 30000)
    return () => {
      clearInterval(timer)
      save()
    }
  }, [save])
  useEffect(() => save(), [chapter])
  // --- Moving ---
  const goChapter = (index: number, at: number | 'end' = 0) => {
    if (!book || index < 0 || index >= book.chapters.length) return
    setEnding(false)
    restore.current = at
    setChapter(index)
    if (index === chapter && !paged) {
      const box = sectionBox(index)
      if (box) {
        const span = Math.max(0, box.size - viewSize())
        scrollTo(box.start + (at === 'end' ? span : span * at))
      }
      track()
      return
    }
    if (index === chapter) {
      // Same chapter (a bookmark or search result in it): only the place changes.
      const { max, page } = extent()
      let value = at === 'end' ? max : Math.round(max * at)
      if (paged && page > 0) value = Math.round(value / page) * page
      scrollTo(value)
      track()
    }
  }
  const turn = (direction: 1 | -1) => {
    if (!book || !scroller.current) return
    const { at, max, page } = extent()
    if (direction > 0 && at >= max - 2) {
      if (chapter < book.chapters.length - 1) goChapter(chapter + 1, 0)
      else if (ending && next) next.open()
      else setEnding(true)
      return
    }
    if (direction < 0 && at <= 2) {
      if (chapter > 0) goChapter(chapter - 1, 'end')
      return
    }
    setEnding(false)
    scrollTo(Math.min(max, Math.max(0, at + direction * page)))
    track()
  }
  const exit = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    save()
    close()
  }
  const toggleImmersive = async () => {
    try {
      if (immersive) {
        if (document.fullscreenElement) await document.exitFullscreen()
        setImmersive(false)
      } else {
        await document.documentElement.requestFullscreen()
        setImmersive(true)
        setPanel(undefined)
      }
    } catch (reason) {
      setError(String(reason))
    }
    requestAnimationFrame(() => scroller.current?.focus({ preventScroll: true }))
  }
  useEffect(() => {
    const changed = () => !document.fullscreenElement && setImmersive(false)
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  }, [])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && !event.altKey) {
        event.preventDefault()
        event.stopImmediatePropagation()
        setPanel('search')
        return
      }
      if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[role="combobox"]')) {
        if (event.key === 'Escape') {
          event.preventDefault()
          // Esc in the settings closes them first, then the side panel.
          if (settingsOpen) setSettingsOpen(false)
          else setPanel(undefined)
          scroller.current?.focus({ preventScroll: true })
        }
        return
      }
      const forward = ['PageDown', 'ArrowDown', vertical ? 'ArrowLeft' : 'ArrowRight'],
        back = ['PageUp', 'ArrowUp', vertical ? 'ArrowRight' : 'ArrowLeft']
      let handled = true
      if (event.key === ' ') turn(event.shiftKey ? -1 : 1)
      else if (forward.includes(event.key)) turn(1)
      else if (back.includes(event.key)) turn(-1)
      else if (event.key === 'Home') goChapter(0)
      else if (event.key === 'End') book && goChapter(book.chapters.length - 1, 'end')
      else if (event.key === 'F11' || event.key.toLowerCase() === 't') void toggleImmersive()
      else if (event.key === 'Escape') {
        if (settingsOpen) setSettingsOpen(false)
        else if (ending) setEnding(false)
        else if (panel) setPanel(undefined)
        else if (immersive) void toggleImmersive()
        else exit()
      } else handled = false
      if (handled) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  })
  // In paged mode the wheel turns pages; in scroll mode it scrolls (sideways in vertical text).
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    let lock = 0
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey) return
      if (paged) {
        event.preventDefault()
        if (performance.now() - lock < 250 || Math.abs(event.deltaY) < 4) return
        lock = performance.now()
        turn(event.deltaY > 0 ? 1 : -1)
      } else if (vertical && Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        event.preventDefault()
        element.scrollLeft -= event.deltaY
      }
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  })
  // --- Search: every chapter's text, then the n-th match highlighted after its chapter is shown. ---
  const texts = useMemo(() => book?.chapters.map(chapterText) ?? [], [book])
  const search = () => {
    const needle = query.trim().toLowerCase()
    if (!needle) return setHits(undefined)
    const found: { chapter: number; at: number; before: string; match: string; after: string }[] =
      []
    texts.forEach((text, index) => {
      const lower = text.toLowerCase()
      let at = lower.indexOf(needle),
        nth = 0
      while (at >= 0 && found.length < 500) {
        found.push({
          chapter: index,
          at: nth++,
          // R-323: the snippet keeps the match apart so the list can mark it.
          before: text.slice(Math.max(0, at - 20), at).replace(/\s+/g, ' '),
          match: text.slice(at, at + needle.length),
          after: text.slice(at + needle.length, at + needle.length + 30).replace(/\s+/g, ' '),
        })
        at = lower.indexOf(needle, at + needle.length)
      }
    })
    setHits(found)
  }
  const showMatch = (text: string, nth: number) => {
    const root = scroller.current?.querySelector(`[data-chapter="${chapter}"]`)
    if (!root) return
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        node.parentElement?.closest('rt,rp') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    })
    const needle = text.toLowerCase()
    let seen = 0
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = (node.textContent ?? '').toLowerCase()
      let at = value.indexOf(needle)
      while (at >= 0) {
        if (seen++ === nth) {
          const range = document.createRange()
          range.setStart(node, at)
          range.setEnd(node, at + needle.length)
          const highlights = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights,
            Highlight = (window as unknown as { Highlight?: new (range: Range) => unknown })
              .Highlight
          if (highlights && Highlight) highlights.set('novel-search', new Highlight(range))
          const rect = range.getBoundingClientRect(),
            element = scroller.current!,
            frame = element.getBoundingClientRect(),
            { page, max } = extent()
          const offset = paged
            ? vertical
              ? element.scrollTop + rect.top - frame.top
              : element.scrollLeft + rect.left - frame.left
            : vertical
              ? Math.abs(element.scrollLeft) + (frame.right - rect.right) - frame.width / 3
              : element.scrollTop + rect.top - frame.top - frame.height / 3
          scrollTo(Math.min(max, Math.max(0, paged ? Math.floor(offset / page) * page : offset)))
          track()
          return
        }
        at = value.indexOf(needle, at + needle.length)
      }
    }
  }
  const openHit = (hit: { chapter: number; at: number }) => {
    const text = query.trim()
    if (hit.chapter === chapter) showMatch(text, hit.at)
    else {
      findAfterRender.current = { text, nth: hit.at }
      goChapter(hit.chapter)
    }
  }
  // --- Layout ---
  // R-350: the margin sets the ends of a line (left and right, or top and bottom for vertical text); across the lines
  // the page keeps a small edge of its own.
  const pad = Math.round(((vertical ? box.height : box.width) * settings.margin) / 100)
  const edge = Math.round(
    Math.min(32, Math.max(16, ((vertical ? box.width : box.height) * 3) / 100))
  )
  const charLimit = settings.chars ? settings.chars * settings.size : 0
  const inlineSpace = (vertical ? box.height : box.width) - 2 * pad
  const inlinePad = charLimit && inlineSpace > charLimit ? pad + (inlineSpace - charLimit) / 2 : pad
  const contentStyle: React.CSSProperties = {
    fontSize: settings.size,
    lineHeight: settings.lineHeight,
    ...(paged
      ? vertical
        ? {
            width: box.width,
            height: box.height,
            padding: `${inlinePad}px ${edge}px`,
            columnWidth: box.height - 2 * inlinePad,
            columnGap: 2 * inlinePad,
            columnFill: 'auto',
          }
        : {
            width: box.width,
            height: box.height,
            padding: `${edge}px ${inlinePad}px`,
            columnWidth: box.width - 2 * inlinePad,
            columnGap: 2 * inlinePad,
            columnFill: 'auto',
          }
      : vertical
        ? { height: '100%', padding: `${inlinePad}px ${edge}px` }
        : { padding: `${edge}px ${inlinePad}px` }),
  }
  const title = book?.title || file.name
  const chapterLabel = (index: number) =>
    book?.chapters[index]?.title || tr('第 {0} 部分', index + 1)
  const percent = Math.round(bookPercent(lengths, chapter, position) * 100)
  // R-336: the bottom slider works on the whole book (per mille); a point on it maps back to a chapter and place.
  const total = lengths.reduce((sum, value) => sum + value, 0) || 1
  const starts = lengths.reduce<number[]>(
    (list, value, index) => [...list, index ? list[index - 1] + lengths[index - 1] : 0],
    []
  )
  const placeAt = (permille: number) => {
    const at = (permille / 1000) * total
    let index = starts.findIndex((start, i) => at >= start && at < start + lengths[i])
    if (index < 0) index = Math.max(0, lengths.length - 1)
    return { chapter: index, position: lengths[index] ? (at - starts[index]) / lengths[index] : 0 }
  }
  const [dragging, setDragging] = useState<number>()
  const narrow = useMediaQuery('(max-width: 900px)')
  // The panel floats over the page on a narrow window and in immersive reading (R-335, R-349).
  const floating = narrow || immersive
  useEffect(() => {
    if (!panel) setPeek(false)
  }, [panel])
  const left = (() => {
    if (!paged || !scroller.current) return undefined
    const { at, max, page } = extent()
    return page > 0 ? Math.max(0, Math.round((max - at) / page)) : undefined
  })()
  // The list scrolls to the chapter being read when the contents open.
  const panelList = useRef<HTMLElement>(null)
  useEffect(() => {
    const list = panelList.current,
      item = panel === 'toc' ? list?.querySelector('[aria-current="true"]') : undefined
    // R-346: moving the list itself keeps the tabs above it in place (scrollIntoView also scrolled the panel).
    if (list && item) {
      const box = list.getBoundingClientRect(),
        at = item.getBoundingClientRect()
      list.scrollTop += at.top - box.top - (list.clientHeight - at.height) / 2
    }
  }, [panel])
  const addBookmark = () => {
    setBookmarks((list) => [
      ...list,
      {
        chapter,
        position: Math.round(position * 1000) / 1000,
        label: `${chapterLabel(chapter)} · ${percent}%`.slice(0, 200),
      },
    ])
    setPanel('marks')
  }
  const nextName = next?.name.replace(/\.(txt|epub)$/i, '')
  const tool = (label: string, icon: IconName, action: () => void, pressed?: boolean, key = '') => (
    <Tooltip zIndex={510} label={label + (key ? ' · ' + key : '')}>
      <ActionIcon
        aria-label={label}
        aria-pressed={pressed}
        size="lg"
        variant={pressed ? 'light' : 'subtle'}
        color={pressed ? undefined : 'gray'}
        onClick={action}
      >
        <Icon name={icon} />
      </ActionIcon>
    </Tooltip>
  )
  const view = (
    <FocusTrap active={!embedded}>
      <div
        className={
          'novel-reader reader' +
          (embedded ? ' reader-embedded' : ' overlay-frame') +
          (immersive ? ' novel-immersive' : '')
        }
        role="dialog"
        aria-modal="true"
        aria-label={tr('小說閱讀器')}
      >
        {/* R-336: title on the left; search, bookmark, the Aa settings, immersive and close on the right. In immersive
            reading the bar hides and comes back when the mouse reaches the top edge. */}
        <div className="reader-toolbar novel-toolbar">
          {tool(tr('目錄、書籤與搜尋'), 'list', () => setPanel(panel ? undefined : 'toc'), !!panel)}
          <span className="novel-heading" title={title}>
            <strong>{title}</strong>
            <small>{current ? chapterLabel(chapter) : ''}</small>
          </span>
          <span className="novel-tool-gap" />
          {narrow ? (
            <Menu position="bottom-end" withinPortal={false}>
              <Menu.Target>
                <ActionIcon aria-label={tr('更多')} size="lg" variant="subtle" color="gray">
                  <Icon name="more" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  leftSection={<Icon name="search" size={16} />}
                  onClick={() => setPanel('search')}
                >
                  {tr('搜尋全文')}
                </Menu.Item>
                <Menu.Item leftSection={<Icon name="bookmark" size={16} />} onClick={addBookmark}>
                  {tr('加入書籤')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : (
            <>
              {tool(
                tr('搜尋全文'),
                'search',
                () => setPanel(panel === 'search' ? undefined : 'search'),
                panel === 'search',
                'Ctrl+F'
              )}
              {tool(tr('加入書籤'), 'bookmark', addBookmark)}
            </>
          )}
          <Popover
            position="bottom-end"
            withinPortal={false}
            shadow="md"
            width={300}
            opened={settingsOpen}
            onChange={setSettingsOpen}
            transitionProps={{ transition: 'fade' }}
          >
            <Popover.Target>
              <ActionIcon
                aria-label={tr('閱讀設定')}
                size="lg"
                variant={settingsOpen ? 'light' : 'subtle'}
                color="gray"
                onClick={() => setSettingsOpen((open) => !open)}
              >
                <Icon name="typography" />
              </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap="sm" className="novel-settings">
                <div className="novel-setting-row">
                  <Text size="xs">{tr('排版')}</Text>
                  <SegmentedControl
                    size="xs"
                    aria-label={tr('排版')}
                    value={vertical ? 'vertical' : 'horizontal'}
                    onChange={(value) => setSettings({ vertical: value === 'vertical' })}
                    data={[
                      { value: 'horizontal', label: tr('橫排') },
                      { value: 'vertical', label: tr('直排') },
                    ]}
                  />
                </div>
                <div className="novel-setting-row">
                  <Text size="xs">{tr('翻頁')}</Text>
                  <SegmentedControl
                    size="xs"
                    aria-label={tr('翻頁')}
                    value={paged ? 'paged' : 'scrolled'}
                    onChange={(value) => setSettings({ paged: value === 'paged' })}
                    data={[
                      { value: 'paged', label: tr('分頁') },
                      { value: 'scrolled', label: tr('捲動') },
                    ]}
                  />
                </div>
                <div className="novel-setting-row">
                  <Text size="xs">{tr('字型')}</Text>
                  <SegmentedControl
                    size="xs"
                    aria-label={tr('字型')}
                    value={settings.font}
                    onChange={(value) => setSettings({ font: value as Settings['font'] })}
                    data={[
                      { value: 'serif', label: tr('明體') },
                      { value: 'sans', label: tr('黑體') },
                    ]}
                  />
                </div>
                <Text size="xs">{tr('字級 {0}', settings.size)}</Text>
                <Slider
                  aria-label={tr('字級')}
                  min={12}
                  max={36}
                  value={settings.size}
                  onChange={(size) => setSettings({ size })}
                />
                <Text size="xs">{tr('行距 {0}', settings.lineHeight.toFixed(1))}</Text>
                <Slider
                  aria-label={tr('行距')}
                  min={1.2}
                  max={2.6}
                  step={0.1}
                  label={null}
                  value={settings.lineHeight}
                  onChange={(lineHeight) => setSettings({ lineHeight })}
                />
                <Text size="xs">{tr('邊界 {0}%', settings.margin)}</Text>
                <Slider
                  aria-label={tr('邊界')}
                  min={0}
                  max={20}
                  value={settings.margin}
                  onChange={(margin) => setSettings({ margin })}
                />
                <Text size="xs">
                  {settings.chars ? tr('每行 {0} 字', settings.chars) : tr('每行字數：自動')}
                </Text>
                <Slider
                  aria-label={tr('每行字數')}
                  min={0}
                  max={60}
                  step={5}
                  label={null}
                  value={settings.chars}
                  onChange={(chars) => setSettings({ chars })}
                />
                <div className="novel-setting-row">
                  <Text size="xs">{tr('背景')}</Text>
                  <div className="novel-swatches" role="radiogroup" aria-label={tr('背景')}>
                    {(
                      [
                        ['paper', tr('米色')],
                        ['light', tr('白色')],
                        ['dark', tr('深色')],
                      ] as const
                    ).map(([value, label]) => (
                      <Tooltip key={value} zIndex={510} label={label}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={settings.theme === value}
                          aria-label={label}
                          className={'novel-swatch novel-theme-' + value}
                          onClick={() => setSettings({ theme: value })}
                        />
                      </Tooltip>
                    ))}
                  </div>
                </div>
                {book?.format === 'txt' && (
                  <Text size="xs" c="dimmed">
                    {tr('編碼：{0}', book.encoding.toUpperCase())}
                  </Text>
                )}
              </Stack>
            </Popover.Dropdown>
          </Popover>
          {tool(tr('沉浸閱讀'), 'focus', () => void toggleImmersive(), immersive, 'F11 / T')}
          {tool(tr('退出 · ESC'), 'close', exit)}
        </div>
        <div className="novel-body">
          {immersive && !panel && (
            <div
              className="novel-edge"
              aria-hidden="true"
              onMouseEnter={() => {
                setPeek(true)
                setPanel('toc')
              }}
            />
          )}
          {panel && floating && !peek && (
            <button
              type="button"
              className="novel-panel-backdrop"
              aria-label={tr('關閉目錄')}
              onClick={() => setPanel(undefined)}
            />
          )}
          {panel && (
            <aside
              className={'novel-panel' + (floating ? ' floating' : '')}
              aria-label={tr('目錄、書籤與搜尋')}
              onMouseLeave={peek ? () => setPanel(undefined) : undefined}
            >
              <SegmentedControl
                size="xs"
                fullWidth
                value={panel}
                onChange={(value) => setPanel(value as typeof panel)}
                data={[
                  { value: 'toc', label: tr('目錄') },
                  { value: 'marks', label: tr('書籤') },
                  { value: 'search', label: tr('搜尋') },
                ]}
              />
              {panel === 'toc' && (
                <nav className="novel-list" aria-label={tr('目錄')} ref={panelList}>
                  {book?.chapters.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-current={index === chapter ? 'true' : undefined}
                      onClick={() => {
                        goChapter(index)
                        if (floating) setPanel(undefined)
                      }}
                    >
                      {chapterLabel(index)}
                    </button>
                  ))}
                </nav>
              )}
              {panel === 'marks' && (
                <div className="novel-list">
                  {!bookmarks.length && (
                    <Text size="sm" c="dimmed">
                      {tr('還沒有書籤')}
                    </Text>
                  )}
                  {bookmarks.map((mark, index) => (
                    <div key={index} className="novel-mark">
                      <button type="button" onClick={() => goChapter(mark.chapter, mark.position)}>
                        {mark.label}
                      </button>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        aria-label={tr('刪除書籤 {0}', mark.label)}
                        onClick={() => setBookmarks((list) => list.filter((_, i) => i !== index))}
                      >
                        <Icon name="close" size={14} />
                      </ActionIcon>
                    </div>
                  ))}
                </div>
              )}
              {panel === 'search' && (
                <div className="novel-list">
                  <TextInput
                    size="xs"
                    data-autofocus
                    autoFocus
                    aria-label={tr('搜尋全文')}
                    placeholder={tr('搜尋全文')}
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                    onKeyDown={(event) => event.key === 'Enter' && search()}
                    rightSection={
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        aria-label={tr('搜尋')}
                        onClick={search}
                      >
                        <Icon name="search" size={14} />
                      </ActionIcon>
                    }
                  />
                  {hits && (
                    <Text size="xs" c="dimmed">
                      {tr('找到 {0} 處', hits.length)}
                    </Text>
                  )}
                  {hits?.map((hit, index) => (
                    <button key={index} type="button" onClick={() => openHit(hit)}>
                      <small>{chapterLabel(hit.chapter)}</small>
                      <span>
                        {hit.before}
                        <mark className="novel-hit">{hit.match}</mark>
                        {hit.after}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </aside>
          )}
          <div
            ref={scroller}
            tabIndex={0}
            className={
              'novel-page reader-stage novel-theme-' +
              settings.theme +
              (vertical ? ' vertical' : ' horizontal') +
              (paged ? ' paged' : ' scrolled')
            }
            onScroll={track}
            onClick={(event) => {
              if (!paged || (event.target as HTMLElement).closest('a,button')) return
              const bounds = event.currentTarget.getBoundingClientRect(),
                left = event.clientX < bounds.left + bounds.width / 2
              // Vertical text reads right to left: the left half is the next page.
              turn(left === vertical ? 1 : -1)
            }}
          >
            {error ? (
              <p role="alert" className="novel-message">
                {error}
              </p>
            ) : !book || !current ? (
              <p className="novel-message">{tr('載入內容…')}</p>
            ) : (
              <div className={'novel-content novel-font-' + settings.font} style={contentStyle}>
                {(paged ? [chapter] : [chapter - 1, chapter, chapter + 1])
                  .filter((index) => index >= 0 && index < book.chapters.length)
                  .map((index) => {
                    const part = book.chapters[index]
                    return (
                      <section
                        key={index}
                        data-chapter={index}
                        className="novel-section"
                        lang={/[぀-ヿ]/.test(texts[index]?.slice(0, 2000) ?? '') ? 'ja' : undefined}
                      >
                        {part.html !== undefined ? (
                          <HtmlChapter
                            html={part.html}
                            path={part.path ?? ''}
                            images={book.images ?? {}}
                            vertical={vertical}
                          />
                        ) : (
                          <TextChapter
                            title={part.title}
                            text={part.text ?? ''}
                            vertical={vertical}
                          />
                        )}
                        {!paged && index < book.chapters.length - 1 && (
                          <div className="novel-chapter-divider" role="separator">
                            {tr('{0} 完', chapterLabel(index))}
                          </div>
                        )}
                      </section>
                    )
                  })}
                {/* R-342: in paged mode a chapter ends with a page of its own; turning it goes on. On the last chapter the
                    page says the book is done and offers the next book. In scroll mode a line marks the end. */}
                {paged ? (
                  <div
                    className="novel-end-page"
                    style={{
                      blockSize: Math.max(1, (vertical ? box.width : box.height) - 2 * edge),
                    }}
                  >
                    {chapter < book.chapters.length - 1 ? (
                      <button
                        type="button"
                        className="novel-end-card"
                        onClick={() => goChapter(chapter + 1)}
                      >
                        <strong>{tr('{0} 完', chapterLabel(chapter))}</strong>
                        <span>{tr('下一章：{0}', chapterLabel(chapter + 1))}</span>
                        <small>
                          {tr(
                            '還有 {0} 章 · 全書 {1}%',
                            book.chapters.length - chapter - 1,
                            Math.round(bookPercent(lengths, chapter + 1, 0) * 100)
                          )}
                        </small>
                        <small className="novel-end-hint">{tr('翻頁繼續')}</small>
                      </button>
                    ) : (
                      <div className="novel-end-card">
                        <strong>{tr('全書完')}</strong>
                        {next && (
                          <>
                            <span>{tr('下一本：{0}', nextName ?? '')}</span>
                            <Button variant="outline" onClick={() => next.open()}>
                              {tr('開啟下一本')}
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  chapter >= book.chapters.length - 2 && (
                    <div className="novel-chapter-end" role="separator">
                      {next ? (
                        <Button variant="outline" onClick={() => next.open()}>
                          {tr('下一本：{0}', nextName ?? '')}
                        </Button>
                      ) : (
                        <span>{tr('全書完')}</span>
                      )}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
        {ending && (
          <div className="reader-notice reader-end" role="status">
            <strong>{tr('已讀完')}</strong>
            {next && (
              <span>
                {tr('下一本：{0}', next.name.replace(/\.(txt|epub)$/i, ''))} ·{' '}
                {tr('再按一次下一頁開啟')}
              </span>
            )}
            <Button size="compact-xs" variant="subtle" onClick={() => setEnding(false)}>
              {tr('留在這裡')}
            </Button>
          </div>
        )}
        <div className={'novel-progress' + (vertical ? ' rtl' : '')}>
          {tool(tr('上一章'), vertical ? 'chevron-right' : 'chevron-left', () =>
            goChapter(chapter - 1)
          )}
          {/* Vertical text reads right to left, so the slider runs that way too. */}
          <DirectionProvider
            key={String(vertical)}
            initialDirection={vertical ? 'rtl' : 'ltr'}
            detectDirection={false}
          >
            <div className="novel-progress-slider" dir={vertical ? 'rtl' : 'ltr'}>
              <Slider
                aria-label={tr('全書進度')}
                min={0}
                max={1000}
                value={dragging ?? Math.round(bookPercent(lengths, chapter, position) * 1000)}
                label={(value) => {
                  const place = placeAt(value)
                  return chapterLabel(place.chapter) + ' · ' + Math.round(value / 10) + '%'
                }}
                marks={
                  lengths.length > 1 && lengths.length <= 200
                    ? starts
                        .slice(1)
                        .map((start) => ({ value: Math.round((start / total) * 1000) }))
                    : undefined
                }
                onChange={setDragging}
                onChangeEnd={(value) => {
                  setDragging(undefined)
                  const place = placeAt(value)
                  goChapter(place.chapter, place.position)
                }}
              />
            </div>
          </DirectionProvider>
          {tool(tr('下一章'), vertical ? 'chevron-left' : 'chevron-right', () =>
            goChapter(chapter + 1)
          )}
          <div className="reader-info novel-info" aria-live="polite">
            <strong>
              {book
                ? narrow
                  ? `${chapter + 1}/${book.chapters.length} · ${percent}%`
                  : tr('第 {0} / {1} 章 · {2}%', chapter + 1, book.chapters.length, percent)
                : ''}
            </strong>
            {!narrow && paged && left !== undefined && <span>{tr('本章剩 {0} 頁', left)}</span>}
          </div>
        </div>
      </div>
    </FocusTrap>
  )
  return embedded ? view : createPortal(view, document.body)
}
