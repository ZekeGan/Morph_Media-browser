import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ActionIcon,
  Button,
  FocusTrap,
  Popover,
  SegmentedControl,
  Slider,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
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
    [query, setQuery] = useState(''),
    [hits, setHits] = useState<{ chapter: number; at: number; snippet: string }[]>(),
    [immersive, setImmersive] = useState(false),
    [ending, setEnding] = useState(false),
    [box, setBox] = useState({ width: 1, height: 1 })
  const scroller = useRef<HTMLDivElement>(null),
    restore = useRef<number | 'end'>(saved?.position ?? 0),
    findAfterRender = useRef<{ text: string; nth: number } | undefined>(undefined)
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
    const { max, page } = extent()
    let value = target === 'end' ? max : Math.round(max * target)
    if (paged && page > 0) value = Math.min(max, Math.round(value / page) * page)
    scrollTo(value)
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
    const { at, max } = extent()
    setPosition(max > 0 ? Math.min(1, Math.max(0, at / max)) : 0)
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
      if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[role="combobox"]')) {
        if (event.key === 'Escape') {
          event.preventDefault()
          setPanel(undefined)
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
        if (ending) setEnding(false)
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
    const found: { chapter: number; at: number; snippet: string }[] = []
    texts.forEach((text, index) => {
      const lower = text.toLowerCase()
      let at = lower.indexOf(needle),
        nth = 0
      while (at >= 0 && found.length < 500) {
        found.push({
          chapter: index,
          at: nth++,
          snippet: text.slice(Math.max(0, at - 20), at + needle.length + 30).replace(/\s+/g, ' '),
        })
        at = lower.indexOf(needle, at + needle.length)
      }
    })
    setHits(found)
  }
  const showMatch = (text: string, nth: number) => {
    const root = scroller.current?.querySelector('.novel-content')
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
  const pad = Math.round(((vertical ? box.height : box.width) * settings.margin) / 100)
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
            padding: `${inlinePad}px ${pad}px`,
            columnWidth: box.height - 2 * inlinePad,
            columnGap: 2 * inlinePad,
            columnFill: 'auto',
          }
        : {
            width: box.width,
            height: box.height,
            padding: `${pad}px ${inlinePad}px`,
            columnWidth: box.width - 2 * inlinePad,
            columnGap: 2 * inlinePad,
            columnFill: 'auto',
          }
      : vertical
        ? { height: '100%', padding: `${inlinePad}px ${pad}px` }
        : { padding: `${pad}px ${inlinePad}px` }),
  }
  const title = book?.title || file.name
  const chapterLabel = (index: number) =>
    book?.chapters[index]?.title || tr('第 {0} 部分', index + 1)
  const percent = Math.round(bookPercent(lengths, chapter, position) * 100)
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
        {!immersive && (
          <div className="reader-toolbar novel-toolbar">
            {tool(
              tr('目錄、書籤與搜尋'),
              'list',
              () => setPanel(panel ? undefined : 'toc'),
              !!panel
            )}
            {tool(tr('上一章'), 'chevron-left', () => goChapter(chapter - 1))}
            <span className="novel-heading" title={title}>
              <strong>{title}</strong>
              <small>{current ? chapterLabel(chapter) : ''}</small>
            </span>
            {tool(tr('下一章'), 'chevron-right', () => goChapter(chapter + 1))}
            <span className="novel-tool-gap" />
            {tool(tr('橫排'), 'text-horizontal', () => setSettings({ vertical: false }), !vertical)}
            {tool(tr('直排'), 'text-vertical', () => setSettings({ vertical: true }), vertical)}
            {tool(tr('分頁'), 'page-single', () => setSettings({ paged: true }), paged)}
            {tool(tr('捲動'), 'scroll-mode', () => setSettings({ paged: false }), !paged)}
            <Popover position="bottom-end" withinPortal={false} shadow="md" width={280}>
              <Popover.Target>
                <ActionIcon aria-label={tr('閱讀設定')} size="lg" variant="subtle" color="gray">
                  <Icon name="sliders" />
                </ActionIcon>
              </Popover.Target>
              <Popover.Dropdown>
                <Stack gap="sm">
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
                  <SegmentedControl
                    size="xs"
                    aria-label={tr('背景')}
                    value={settings.theme}
                    onChange={(value) => setSettings({ theme: value as Settings['theme'] })}
                    data={[
                      { value: 'paper', label: tr('米色') },
                      { value: 'light', label: tr('白色') },
                      { value: 'dark', label: tr('深色') },
                    ]}
                  />
                </Stack>
              </Popover.Dropdown>
            </Popover>
            {tool(tr('加入書籤'), 'bookmark', () => {
              setBookmarks((list) => [
                ...list,
                {
                  chapter,
                  position: Math.round(position * 1000) / 1000,
                  label: `${chapterLabel(chapter)} · ${percent}%`.slice(0, 200),
                },
              ])
              setPanel('marks')
            })}
            {tool(tr('沉浸閱讀'), 'focus', () => void toggleImmersive(), false, 'F11 / T')}
            {tool(tr('退出 · ESC'), 'close', exit)}
          </div>
        )}
        <div className="novel-body">
          {panel && (
            <aside className="novel-panel" aria-label={tr('目錄、書籤與搜尋')}>
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
                <nav className="novel-list" aria-label={tr('目錄')}>
                  {book?.chapters.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      aria-current={index === chapter ? 'true' : undefined}
                      onClick={() => goChapter(index)}
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
                      <span>{hit.snippet}</span>
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
              <div
                className={'novel-content novel-font-' + settings.font}
                style={contentStyle}
                lang={/[぀-ヿ]/.test(texts[chapter]?.slice(0, 2000) ?? '') ? 'ja' : undefined}
              >
                {current.html !== undefined ? (
                  <HtmlChapter
                    html={current.html}
                    path={current.path ?? ''}
                    images={book.images ?? {}}
                    vertical={vertical}
                  />
                ) : (
                  <TextChapter
                    title={current.title}
                    text={current.text ?? ''}
                    vertical={vertical}
                  />
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
                {tr('下一本：{0}', next.name)} · {tr('再按一次下一頁開啟')}
              </span>
            )}
            <Button size="compact-xs" variant="subtle" onClick={() => setEnding(false)}>
              {tr('留在這裡')}
            </Button>
          </div>
        )}
        {!immersive && (
          <div className="reader-info novel-info" aria-live="polite">
            <strong>
              {book ? tr('第 {0} / {1} 章 · {2}%', chapter + 1, book.chapters.length, percent) : ''}
            </strong>
            {book?.format === 'txt' && <span>{book.encoding.toUpperCase()}</span>}
            <span>{tr('方向鍵／空白鍵翻頁 · F11 沉浸閱讀 · ESC 返回')}</span>
          </div>
        )}
      </div>
    </FocusTrap>
  )
  return embedded ? view : createPortal(view, document.body)
}
