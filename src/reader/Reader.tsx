import { t as tr, useLocale } from '../i18n'
import { Icon, type IconName } from '../common/icons'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ActionIcon, Button, FocusTrap, Group, Select, Slider, Tooltip } from '@mantine/core'
import type { MediaEntry, ReadingPrefs } from '../../shared/explorer'
import { readingGroups, readerArrowStep, spreadGeometry, type ImageSize } from '../../shared/reader'
interface Frame {
  key: string
  token: number
  indices: number[]
  sizes: ImageSize[]
  loaded: Set<number>
  committed?: boolean
  // R-270: the side a page turn slides this frame in from; none for loads, mode changes and jumps from the queue.
  enter?: 'left' | 'right'
}
interface CachedImage {
  image: HTMLImageElement
  promise: Promise<ImageSize>
  animated: boolean
}
export function Reader({
  images,
  start,
  manga,
  prefs,
  close,
  save,
  embedded = false,
  selectedId,
  onActive,
  extraTools,
  openFolder,
  onImmersive,
  nextBook,
  startImmersive,
}: {
  images: MediaEntry[]
  start: number
  manga: boolean
  prefs?: ReadingPrefs
  close: () => void
  save: (prefs: ReadingPrefs) => void
  embedded?: boolean
  selectedId?: string
  onActive?: (id: string) => void
  extraTools?: ReactNode
  openFolder?: () => void
  // Told when immersive reading starts or ends, so the media viewer can offer its queue on the right edge.
  onImmersive?: (value: boolean) => void
  // The folder after this one in the browse list; offered after the last page (R-255).
  nextBook?: { name: string; open: (keepImmersive: boolean) => void }
  // The window is already in fullscreen from the previous book: start in immersive mode (R-275).
  startImmersive?: boolean
}) {
  useLocale()

  // R-253: opening a manga from its first page continues where it was left (the page the folder record keeps).
  // Decided once when the reader opens: the viewer's selection (and so start) follows the resumed page afterwards.
  const [resumeAt] = useState(() =>
    manga &&
    start <= 0 &&
    prefs?.page &&
    prefs.page > 0 &&
    // A book left on its last page counts as finished and opens from the start.
    prefs.page < images.length - (prefs.spread ? 2 : 1)
      ? prefs.page
      : undefined
  )
  const [page, setPage] = useState(resumeAt ?? Math.max(0, Math.min(start, images.length - 1))),
    [resumed, setResumed] = useState(resumeAt !== undefined),
    [ending, setEnding] = useState(false),
    [fit, setFit] = useState<'height' | 'width'>(
      !manga && prefs?.fit === 'width' ? 'width' : 'height'
    )
  const [spread, setSpread] = useState(prefs?.spread ?? false),
    [rtl, setRtl] = useState(prefs?.rtl ?? manga),
    [first, setFirst] = useState(prefs?.firstSingle ?? false)
  const [toolbar, setToolbar] = useState(true),
    [pageDropdown, setPageDropdown] = useState(false),
    [immersive, setImmersive] = useState(false),
    [zoom, setZoom] = useState(1),
    [box, setBox] = useState<ImageSize>({ width: 1, height: 1 })
  const [frames, setFrames] = useState<Frame[]>([]),
    [activeKey, setActiveKey] = useState(''),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0)
  useEffect(() => {
    if (error) setToolbar(true)
  }, [error])
  useEffect(() => {
    onImmersive?.(immersive)
  }, [immersive])
  const select = useRef<HTMLInputElement>(null),
    viewport = useRef<HTMLDivElement>(null),
    drag = useRef<
      | {
          x: number
          y: number
          left: number
          top: number
          pan: boolean
          moved: boolean
          time: number
        }
      | undefined
    >(undefined)
  const heading = useRef<'left' | 'right' | undefined>(undefined)
  const cache = useRef(new Map<string, CachedImage>()),
    sequence = useRef(0),
    activeRef = useRef(''),
    protectedUrls = useRef(new Set<string>()),
    returnFocus = useRef(document.activeElement as HTMLElement)
  const ownsFullscreen = useRef(false),
    handover = useRef(false),
    mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    const changed = () => {
      if (ownsFullscreen.current && !document.fullscreenElement) {
        ownsFullscreen.current = false
        setImmersive(false)
        setToolbar(true)
      }
    }
    document.addEventListener('fullscreenchange', changed)
    return () => {
      mounted.current = false
      document.removeEventListener('fullscreenchange', changed)
      if (ownsFullscreen.current && document.fullscreenElement && !handover.current) {
        ownsFullscreen.current = false
        void document.exitFullscreen().catch(() => {})
      }
    }
  }, [])
  useEffect(() => {
    if (!startImmersive || !document.fullscreenElement) return
    ownsFullscreen.current = true
    setImmersive(true)
    setToolbar(false)
    focusStage()
  }, [])
  const focusStage = () =>
    requestAnimationFrame(() => viewport.current?.focus({ preventScroll: true }))
  const leaveImmersive = async () => {
    if (ownsFullscreen.current && document.fullscreenElement) {
      try {
        await document.exitFullscreen()
      } catch (reason) {
        if (mounted.current) setError(tr('無法退出全螢幕：') + String(reason))
        return
      }
    }
    ownsFullscreen.current = false
    if (mounted.current) {
      setImmersive(false)
      setToolbar(true)
      focusStage()
    }
  }
  const toggleImmersive = async () => {
    if (immersive) {
      await leaveImmersive()
      return
    }
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        if (!mounted.current) {
          await document.exitFullscreen()
          return
        }
        ownsFullscreen.current = true
      }
      if (mounted.current) {
        setPageDropdown(false)
        setImmersive(true)
        setToolbar(false)
        focusStage()
      }
    } catch (reason) {
      if (mounted.current) {
        setToolbar(true)
        setError(tr('無法進入全螢幕：') + String(reason))
      }
    }
  }
  const groups = useMemo(
    () => readingGroups(images.length, manga && spread, first),
    [images.length, manga, spread, first]
  )
  const groupIndex = Math.max(
      0,
      groups.findIndex((group) => group.includes(page))
    ),
    group = groups[groupIndex] ?? []
  const active = frames.find((frame) => frame.key === activeKey),
    geometry = spreadGeometry(active?.sizes ?? [], fit, box, zoom)
  const surface = {
    width: Math.max(box.width, geometry.width),
    height: Math.max(box.height, geometry.height),
  }
  useLayoutEffect(() => {
    if (viewport.current) {
      viewport.current.scrollLeft = rtl ? Math.max(0, surface.width - box.width) : 0
      viewport.current.scrollTop = 0
    }
  }, [activeKey, rtl])
  const anchor = useRef<{ x: number; y: number; ratioX: number; ratioY: number } | undefined>(
    undefined
  )
  const latest = useRef({ zoom, geometry, surface, box, active })
  latest.current = { zoom, geometry, surface, box, active }
  activeRef.current = activeKey
  protectedUrls.current = new Set(
    [...group, ...(active?.indices ?? [])].flatMap((index) => images[index]?.url ?? [])
  )
  const trim = () => {
    for (const [url, item] of cache.current) {
      if (cache.current.size <= 10) break
      if (!protectedUrls.current.has(url)) {
        cache.current.delete(url)
        item.image.src = ''
      }
    }
  }
  const load = (entry: MediaEntry) => {
    const existing = cache.current.get(entry.url)
    if (existing) {
      cache.current.delete(entry.url)
      cache.current.set(entry.url, existing)
      return existing.promise
    }
    const image = new Image()
    image.decoding = 'async'
    const promise = new Promise<ImageSize>((resolve, reject) => {
      image.onload = () => {
        void image
          .decode()
          .catch(() => {})
          .then(() =>
            image.naturalWidth > 0
              ? resolve({ width: image.naturalWidth, height: image.naturalHeight })
              : reject(new Error(tr('無法解碼 ') + entry.name))
          )
      }
      image.onerror = () => reject(new Error(tr('無法載入 ') + entry.name))
    })
    cache.current.set(entry.url, { image, promise, animated: entry.mime === 'image/gif' })
    image.src = entry.url
    trim()
    return promise
  }
  const groupKey = group.map((index) => images[index]?.url).join('|')
  useEffect(() => {
    const token = ++sequence.current,
      enter = heading.current
    heading.current = undefined
    let cancelled = false
    setLoading(true)
    setError('')
    if (!group.length) {
      setLoading(false)
      return
    }
    void Promise.all(group.map((index) => load(images[index])))
      .then((sizes) => {
        if (cancelled || token !== sequence.current) return
        const frame: Frame = {
          key: String(token),
          token,
          indices: [...group],
          sizes,
          loaded: new Set(),
          enter,
        }
        setFrames((previous) => [
          ...previous.filter((item) => item.key === activeRef.current),
          frame,
        ])
      })
      .catch((reason) => {
        if (!cancelled && token === sequence.current) {
          setLoading(false)
          setError(String(reason))
        }
      })
    return () => {
      cancelled = true
    }
  }, [groupKey, retry])
  useEffect(() => {
    if (!active) return
    const index = groups.findIndex((group) => group.includes(active.indices[0]))
    for (const next of [groups[index + 1], groups[index + 2], groups[index - 1]])
      for (const i of next ?? [])
        if (images[i]?.mime !== 'image/gif') void load(images[i]).catch(() => {})
    for (const [url, item] of cache.current)
      if (item.animated && !protectedUrls.current.has(url)) {
        cache.current.delete(url)
        item.image.src = ''
      }
    trim()
  }, [activeKey, groups, images])
  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    // Measure a stable viewport: panning uses scroll offsets without layout scrollbars.
    const measure = () => {
      const bounds = element.getBoundingClientRect(),
        width = Math.max(1, bounds.width),
        height = Math.max(1, bounds.height)
      setBox((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height }
      )
    }
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [])
  useLayoutEffect(() => {
    if (!anchor.current || !viewport.current) return
    const point = anchor.current
    anchor.current = undefined
    viewport.current.scrollLeft =
      (surface.width - geometry.width) / 2 + point.ratioX * geometry.width - point.x
    viewport.current.scrollTop =
      (surface.height - geometry.height) / 2 + point.ratioY * geometry.height - point.y
  }, [zoom])
  useEffect(
    () => () => {
      sequence.current++
      for (const item of cache.current.values()) item.image.src = ''
      cache.current.clear()
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true })
    },
    []
  )
  const changeZoom = (value: number, x?: number, y?: number) => {
    const element = viewport.current,
      state = latest.current
    if (!element || !state.active) return
    const next = Math.min(10, Math.max(manga ? 1 : 0.1, value))
    if (next === state.zoom) return
    const pointX = x ?? element.clientWidth / 2,
      pointY = y ?? element.clientHeight / 2
    // Several wheel events can be batched before React commits the next geometry.
    // Keep the first anchor in that batch rather than mixing old sizes with new zoom.
    anchor.current ??= {
      x: pointX,
      y: pointY,
      ratioX:
        (element.scrollLeft + pointX - (state.surface.width - state.geometry.width) / 2) /
        state.geometry.width,
      ratioY:
        (element.scrollTop + pointY - (state.surface.height - state.geometry.height) / 2) /
        state.geometry.height,
    }
    latest.current = { ...state, zoom: next }
    setZoom(next)
  }
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      if (!latest.current.active) return
      event.preventDefault()
      const delta =
          event.deltaY *
          (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1),
        bounds = element.getBoundingClientRect()
      changeZoom(
        latest.current.zoom * Math.exp(-delta * 0.0015),
        event.clientX - bounds.left,
        event.clientY - bounds.top
      )
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => element.removeEventListener('wheel', wheel)
  }, [])
  const setFitMode = (value: typeof fit) => {
    anchor.current = undefined
    setFit(value)
    setZoom(1)
    viewport.current?.scrollTo(0, 0)
  }
  const readingNow = (): ReadingPrefs => ({
    page,
    ...(!manga ? { fit } : {}),
    spread,
    rtl,
    firstSingle: first,
  })
  // Leaving a manga any other way than exit (closing the viewer, another folder) keeps the reading place, but only
  // when it moved since opening: just looking, or a book still loading that could not resume, writes nothing.
  const savedOnExit = useRef(false),
    opened = useRef<ReadingPrefs | undefined>(undefined),
    leaving = useRef({ readingNow, save, manga })
  opened.current ??= readingNow()
  leaving.current = { readingNow, save, manga }
  useEffect(
    () => () => {
      if (savedOnExit.current || !leaving.current.manga) return
      const { readingNow, save } = leaving.current,
        now = readingNow(),
        start = opened.current
      if ((Object.keys(now) as (keyof ReadingPrefs)[]).some((key) => now[key] !== start?.[key]))
        save(now)
    },
    []
  )
  const exit = () => {
    if (ownsFullscreen.current && document.fullscreenElement) {
      ownsFullscreen.current = false
      void document.exitFullscreen().catch(() => {})
    }
    savedOnExit.current = true
    save(readingNow())
    close()
  }
  const goToGroup = (index: number) => {
    const target = groups[index]
    if (target) {
      setEnding(false)
      if (index !== groupIndex) {
        const forward = index > groupIndex
        heading.current = forward !== rtl ? 'right' : 'left'
      }
      setPage(target[0])
      setPageDropdown(false)
      focusStage()
    }
  }
  const step = (delta: number) => {
    // Past the last page: the first press says so (and names the next book), the second opens it.
    if (manga && delta > 0 && groupIndex === groups.length - 1) {
      if (ending && nextBook) {
        setEnding(false)
        // Hand the fullscreen window over to the next book instead of leaving it.
        handover.current = immersive
        nextBook.open(immersive)
        // If the switch never happens (for example a draft blocks it), leaving later exits fullscreen as usual.
        setTimeout(() => (handover.current = false), 5000)
      } else setEnding(true)
      return
    }
    setEnding(false)
    goToGroup(groupIndex + delta)
  }
  const canForward = manga || groupIndex < groups.length - 1
  useEffect(() => {
    if (!resumed) return
    const timer = setTimeout(() => setResumed(false), 4000)
    return () => clearTimeout(timer)
  }, [resumed])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.isComposing) return
      if (event.key === 'F11') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (!event.repeat) void toggleImmersive()
        return
      }
      if (
        (event.target as HTMLElement)?.closest(
          'input:not([type="checkbox"]):not([type="radio"]),textarea,select,[role="combobox"],[role="listbox"],[contenteditable="true"]'
        )
      ) {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopImmediatePropagation()
          setPageDropdown(false)
          focusStage()
        }
        return
      }
      if (event.ctrlKey || event.altKey || event.metaKey) return
      const direction = readerArrowStep(event.key, rtl)
      const actions: Record<string, () => void> = {
        ...(!manga ? { w: () => setFitMode('width'), h: () => setFitMode('height') } : {}),
        d: () => manga && setSpread((value) => !value),
        r: () => setFitMode(fit),
        g: () => {
          setToolbar(true)
          setPageDropdown(true)
          setTimeout(() => select.current?.focus(), 0)
        },
        t: () => {
          if (!event.repeat) void toggleImmersive()
        },
        Escape: () => {
          if (ending) setEnding(false)
          else if (immersive || ownsFullscreen.current) void leaveImmersive()
          else exit()
        },
        '+': () => changeZoom(zoom * 1.25),
        '=': () => changeZoom(zoom * 1.25),
        '-': () => changeZoom(zoom / 1.25),
      }
      const action = direction
        ? () => step(direction)
        : (actions[event.key] ?? actions[event.key.toLowerCase()])
      if (action) {
        event.preventDefault()
        event.stopImmediatePropagation()
        action()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  })
  const frameReady = async (image: HTMLImageElement, frame: Frame, index: number) => {
    if (frame.loaded.has(index) || frame.token !== sequence.current) return
    try {
      await image.decode()
    } catch {
      if (!image.naturalWidth) return
    }
    if (frame.loaded.has(index) || frame.token !== sequence.current) return
    frame.loaded.add(index)
    if (frame.loaded.size !== frame.indices.length || frame.committed) return
    frame.committed = true
    requestAnimationFrame(() => {
      if (frame.token !== sequence.current) return
      setActiveKey(frame.key)
      setLoading(false)
      viewport.current?.scrollTo(0, 0)
      // The new page fades in over the old one (R-260); the old layer goes once the fade is done.
      const settle = () =>
        setFrames((previous) =>
          previous.filter((item) => item.key === frame.key || item.token > frame.token)
        )
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        requestAnimationFrame(settle)
      else setTimeout(settle, 220)
    })
  }
  const openedWith = useRef(selectedId)
  useEffect(() => {
    // The viewer's selection still points at the clicked first page while resuming elsewhere.
    if (resumeAt !== undefined && selectedId === openedWith.current) return
    const index = images.findIndex((entry) => entry.id === selectedId)
    if (index >= 0 && !groups[groupIndex]?.includes(index)) setPage(index)
  }, [selectedId])
  useEffect(() => {
    if (active) onActive?.(images[active.indices[0]].id)
  }, [activeKey])
  const pageLabel = (indices: number[]) => indices.map((index) => index + 1).join('–')
  const icon = (kind: 'prev' | 'next' | 'minus' | 'plus' | 'reset' | 'focus' | 'settings') => (
    <Icon
      name={
        kind === 'prev'
          ? 'chevron-left'
          : kind === 'next'
            ? 'chevron-right'
            : kind === 'reset'
              ? 'refresh'
              : kind === 'settings'
                ? 'sliders'
                : kind
      }
    />
  )
  const iconTool = (
    label: string,
    key: string,
    kind: Parameters<typeof icon>[0],
    action: () => void,
    disabled = false
  ) => (
    <Tooltip zIndex={510} label={label + (key ? ' · ' + key : '')}>
      <ActionIcon
        aria-label={label}
        size="lg"
        variant="subtle"
        color="gray"
        disabled={disabled}
        onClick={action}
      >
        {icon(kind)}
      </ActionIcon>
    </Tooltip>
  )
  // One list of tools for the top toolbar and the immersive left rail (R-263): icons only, name and shortcut in the
  // tooltip, the mode in use marked as pressed.
  type ReaderTool = {
    label: string
    key: string
    icon: IconName
    action: () => void
    disabled?: boolean
    pressed?: boolean
  }
  const modeTools: ReaderTool[] = manga
    ? [
        {
          label: tr('單頁'),
          key: 'D',
          icon: 'page-single',
          pressed: !spread,
          action: () => setSpread(false),
        },
        {
          label: tr('雙頁'),
          key: 'D',
          icon: 'page-spread',
          pressed: spread,
          action: () => setSpread(true),
        },
        {
          label: tr('首張獨立顯示'),
          key: '',
          icon: 'page-cover',
          pressed: first,
          disabled: !spread,
          action: () => setFirst((value) => !value),
        },
        {
          label: rtl ? tr('由右至左') : tr('由左至右'),
          key: '',
          icon: rtl ? 'read-rtl' : 'read-ltr',
          action: () => setRtl((value) => !value),
        },
      ]
    : [
        {
          label: tr('寬度適應'),
          key: 'W',
          icon: 'fit-width',
          pressed: fit === 'width',
          action: () => setFitMode('width'),
        },
        {
          label: tr('高度適應'),
          key: 'H',
          icon: 'fit-height',
          pressed: fit === 'height',
          action: () => setFitMode('height'),
        },
      ]
  const zoomOut: ReaderTool = {
      label: tr('縮小'),
      key: '−',
      icon: 'minus',
      action: () => changeZoom(zoom / 1.25),
      disabled: zoom <= (manga ? 1 : 0.1),
    },
    zoomIn: ReaderTool = {
      label: tr('放大'),
      key: '+',
      icon: 'plus',
      action: () => changeZoom(zoom * 1.25),
      disabled: zoom >= 10,
    },
    zoomReset: ReaderTool = {
      label: tr('重設縮放'),
      key: 'R',
      icon: 'refresh',
      action: () => setFitMode(fit),
    },
    immersiveTool: ReaderTool = {
      label: immersive ? tr('退出沉浸閱讀') : tr('沉浸閱讀'),
      key: 'F11 / T',
      icon: immersive ? 'focus-exit' : 'focus',
      action: () => void toggleImmersive(),
    }
  const toolButton = (tool: ReaderTool, position?: 'right') => (
    <Tooltip
      key={tool.icon}
      zIndex={510}
      position={position}
      label={tool.label + (tool.key ? ' · ' + tool.key : '')}
    >
      <ActionIcon
        aria-label={tool.label}
        aria-pressed={tool.pressed}
        size="lg"
        variant={tool.pressed ? 'light' : 'subtle'}
        color={tool.pressed ? undefined : 'gray'}
        disabled={tool.disabled}
        onClick={tool.action}
      >
        <Icon name={tool.icon} />
      </ActionIcon>
    </Tooltip>
  )
  // Immersive edges (R-262, R-254): the bottom bar scrubs through pages and previews the page under the pointer.
  const track = useRef<HTMLDivElement>(null)
  const [scrub, setScrub] = useState<number>(),
    [hovered, setHovered] = useState<number>()
  const last = Math.max(1, groups.length - 1),
    place = (index: number) => {
      const ratio = index / last
      return (rtl ? 1 - ratio : ratio) * (track.current?.clientWidth ?? 0)
    },
    previewIndex = scrub ?? hovered,
    previewEntry = previewIndex === undefined ? undefined : images[groups[previewIndex]?.[0] ?? -1]
  const edges = immersive && (
    <>
      <div className="reader-edge reader-edge-left" aria-hidden="true" />
      <nav className="reader-rail" aria-label={tr('閱讀工具')}>
        {modeTools.map((tool) => toolButton(tool, 'right'))}
        <span className="reader-rail-gap" />
        {[zoomOut, zoomIn, zoomReset].map((tool) => toolButton(tool, 'right'))}
        <span className="reader-rail-gap" />
        {toolButton(immersiveTool, 'right')}
      </nav>
      <div className="reader-edge reader-edge-bottom" aria-hidden="true" />
      <div className="reader-progress" role="group" aria-label={tr('閱讀進度')}>
        {iconTool(
          rtl ? tr('下一頁') : tr('上一頁'),
          '←',
          'prev',
          () => step(rtl ? 1 : -1),
          rtl ? !canForward : groupIndex === 0
        )}
        <div
          ref={track}
          className="reader-progress-track"
          onMouseMove={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect(),
              ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
            setHovered(Math.round((rtl ? 1 - ratio : ratio) * last))
          }}
          onMouseLeave={() => setHovered(undefined)}
        >
          {/* Right to left: the bar runs the other way (first page at the right end, the read part filled from the
              right), so its position is the page counted from the end. */}
          <Slider
            aria-label={tr('閱讀進度')}
            min={0}
            max={last}
            step={1}
            label={null}
            inverted={rtl}
            disabled={groups.length < 2}
            value={rtl ? last - (scrub ?? groupIndex) : (scrub ?? groupIndex)}
            onChange={(value) => setScrub(rtl ? last - value : value)}
            onChangeEnd={(value) => {
              setScrub(undefined)
              goToGroup(rtl ? last - value : value)
            }}
          />
          {previewEntry && previewIndex !== undefined && (
            <div className="reader-progress-preview" style={{ left: place(previewIndex) }}>
              <img src={previewEntry.thumb ?? previewEntry.url} alt="" draggable={false} />
              <span>{pageLabel(groups[previewIndex])}</span>
            </div>
          )}
        </div>
        {iconTool(
          rtl ? tr('上一頁') : tr('下一頁'),
          '→',
          'next',
          () => step(rtl ? -1 : 1),
          rtl ? groupIndex === 0 : !canForward
        )}
        <span className="reader-progress-pages">
          {tr('第 {0} / {1} 頁', pageLabel(groups[scrub ?? groupIndex] ?? []), images.length)}
        </span>
      </div>
    </>
  )
  // R-269: in immersive reading the pointer hides after two seconds at rest, except over the tool rail or progress
  // bar; any movement brings it back.
  const [idle, setIdle] = useState(false),
    idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const rest = () => {
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setIdle(true), 2000)
  }
  const wake = (event: React.PointerEvent) => {
    if (!immersive) return
    setIdle(false)
    clearTimeout(idleTimer.current)
    if (!(event.target as HTMLElement).closest('.reader-rail,.reader-progress')) rest()
  }
  useEffect(() => {
    setIdle(false)
    if (immersive) rest()
    else clearTimeout(idleTimer.current)
    return () => clearTimeout(idleTimer.current)
  }, [immersive])
  const view = (
    <FocusTrap active={!embedded}>
      <div
        className={
          'reader' +
          (embedded ? '' : ' overlay-frame') +
          (embedded ? ' reader-embedded' : '') +
          (manga ? ' manga-reader' : '') +
          (toolbar ? '' : ' reader-focused') +
          (idle ? ' cursor-idle' : '')
        }
        role="dialog"
        aria-modal="true"
        aria-label={manga ? tr('漫畫閱讀器') : tr('圖片檢視')}
        onPointerMove={wake}
      >
        {toolbar && (
          <Tooltip zIndex={510} label={tr('退出 · ESC')}>
            <ActionIcon
              className="reader-close"
              variant="subtle"
              color="gray"
              size="lg"
              aria-label={tr('退出閱讀器')}
              onClick={exit}
            >
              <Icon name="close" />
            </ActionIcon>
          </Tooltip>
        )}
        {toolbar && (
          <div className="reader-toolbar">
            <Group className="reader-tool-group" gap={3} wrap="nowrap">
              {iconTool(
                rtl ? tr('下一頁') : tr('上一頁'),
                '←',
                'prev',
                () => step(rtl ? 1 : -1),
                rtl ? !canForward : groupIndex === 0
              )}
              <Tooltip zIndex={510} label={tr('跳至頁碼 · G')}>
                <div className="reader-page-select">
                  <Select
                    ref={select}
                    size="xs"
                    aria-label={tr('頁碼')}
                    comboboxProps={{ zIndex: 510 }}
                    searchable
                    limit={20}
                    allowDeselect={false}
                    dropdownOpened={pageDropdown}
                    onDropdownOpen={() => setPageDropdown(true)}
                    onDropdownClose={() => setPageDropdown(false)}
                    rightSectionPointerEvents="none"
                    value={String(groupIndex)}
                    data={groups.map((indices, index) => ({
                      value: String(index),
                      label: pageLabel(indices),
                    }))}
                    onChange={(value) => value !== null && goToGroup(Number(value))}
                    onOptionSubmit={() => {
                      setPageDropdown(false)
                      focusStage()
                    }}
                    w={85}
                  />
                </div>
              </Tooltip>
              <span className="reader-page-total">/ {images.length}</span>
              {iconTool(
                rtl ? tr('上一頁') : tr('下一頁'),
                '→',
                'next',
                () => step(rtl ? -1 : 1),
                rtl ? groupIndex === 0 : !canForward
              )}
            </Group>
            <Group className="reader-tool-group" gap={3} wrap="nowrap">
              {modeTools.map((tool) => toolButton(tool))}
            </Group>
            <Group className="reader-tool-group reader-zoom-tools" gap={3} wrap="nowrap">
              {toolButton(zoomOut)}
              <span
                className="reader-zoom-value"
                title={manga ? tr('100%＝貼合可視區高度；可繼續放大查看細節') : undefined}
              >
                {Math.round(zoom * 100)}%
              </span>
              {toolButton(zoomIn)}
              {toolButton(zoomReset)}
              {toolButton(immersiveTool)}
            </Group>
            {extraTools}
          </div>
        )}
        <div
          ref={viewport}
          className={
            'reader-viewport reader-stage' +
            (geometry.width > box.width || geometry.height > box.height ? ' can-pan' : '')
          }
          tabIndex={0}
          onPointerDown={(event) => {
            if (event.button !== 0) return
            const element = event.currentTarget,
              pan = geometry.width > box.width || geometry.height > box.height
            if (pan) event.preventDefault()
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              left: element.scrollLeft,
              top: element.scrollTop,
              pan,
              moved: false,
              time: performance.now(),
            }
            element.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            const start = drag.current
            if (!start) return
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) start.moved = true
            if (start.pan && start.moved) {
              event.currentTarget.scrollLeft = start.left - (event.clientX - start.x)
              event.currentTarget.scrollTop = start.top - (event.clientY - start.y)
            }
          }}
          onPointerUp={(event) => {
            const start = drag.current
            drag.current = undefined
            // R-264: a sideways drag on a page that fits turns it, like a swipe. Short drags stay clicks, a zoomed
            // page keeps panning, and drags starting at the left, right or bottom edge belong to the edge panels.
            if (manga && start && !start.pan && start.moved) {
              const bounds = event.currentTarget.getBoundingClientRect(),
                dx = event.clientX - start.x,
                dy = event.clientY - start.y,
                fast = Math.abs(dx) > 40 && performance.now() - start.time < 250,
                edge =
                  start.x - bounds.left < 24 ||
                  bounds.right - start.x < 24 ||
                  bounds.bottom - start.y < 24
              if (
                !edge &&
                Math.abs(dx) > Math.abs(dy) &&
                (Math.abs(dx) > bounds.width * 0.15 || fast)
              )
                step(readerArrowStep(dx < 0 ? 'ArrowRight' : 'ArrowLeft', rtl))
              return
            }
            if (
              manga &&
              start &&
              !start.moved &&
              Math.hypot(event.clientX - start.x, event.clientY - start.y) <= 5
            ) {
              const bounds = event.currentTarget.getBoundingClientRect()
              step(
                readerArrowStep(
                  event.clientX < bounds.left + bounds.width / 2 ? 'ArrowLeft' : 'ArrowRight',
                  rtl
                )
              )
            }
          }}
          onPointerCancel={() => {
            drag.current = undefined
          }}
        >
          <div className="reader-surface" style={{ width: surface.width, height: surface.height }}>
            {frames.map((frame) => {
              const size = spreadGeometry(frame.sizes, fit, box, zoom),
                isActive = frame.key === activeKey,
                isPrevious = !!active && frame.token < active.token
              return (
                <div
                  key={frame.key}
                  className={
                    'reader-frame-layer ' +
                    (isActive ? 'is-active' : isPrevious ? 'is-previous' : 'is-pending') +
                    (isActive && frame.enter ? ' enter-' + frame.enter : '') +
                    (isPrevious && active?.enter
                      ? ' leave-' + (active.enter === 'right' ? 'left' : 'right')
                      : '')
                  }
                  aria-hidden={!isActive}
                  data-pages={pageLabel(frame.indices)}
                  style={{ zIndex: isActive ? 2 : isPrevious ? 1 : 3 }}
                >
                  <div
                    className={'reader-spread' + (rtl ? ' rtl' : '')}
                    style={{
                      left: Math.max(0, (surface.width - size.width) / 2),
                      top: Math.max(0, (surface.height - size.height) / 2),
                      width: size.width,
                      height: size.height,
                    }}
                  >
                    {frame.indices.map((index, position) => (
                      <img
                        key={images[index].id}
                        ref={(image) => {
                          if (image?.complete && image.naturalWidth)
                            void frameReady(image, frame, index)
                        }}
                        src={images[index].url}
                        alt={images[index].name}
                        draggable={false}
                        style={{ width: size.widths[position], height: size.height }}
                        onLoad={(event) => void frameReady(event.currentTarget, frame, index)}
                        onError={() => {
                          if (frame.token === sequence.current) {
                            setLoading(false)
                            setError(tr('無法載入 ') + images[index].name)
                          }
                        }}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
            {!frames.length && (
              <div className="reader-loading">
                {images.length ? tr('載入圖片…') : tr('沒有圖片')}
              </div>
            )}
          </div>
        </div>
        {edges}
        {resumed && resumeAt !== undefined && (
          <div className="reader-notice" role="status">
            <span>{tr('從第 {0} 頁繼續', String(resumeAt + 1))}</span>
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => {
                setResumed(false)
                goToGroup(0)
              }}
            >
              {tr('從頭開始')}
            </Button>
          </div>
        )}
        {ending && (
          <div className="reader-notice reader-end" role="status">
            <strong>{tr('已是最後一頁')}</strong>
            {nextBook && (
              <span>
                {tr('下一本：{0}', nextBook.name)} · {tr('再按一次下一頁開啟')}
              </span>
            )}
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => {
                setEnding(false)
                focusStage()
              }}
            >
              {tr('留在這裡')}
            </Button>
          </div>
        )}
        {toolbar && (
          <div className="reader-info" aria-live="polite">
            <strong>
              {active ? tr('第 {0} / {1} 頁', pageLabel(active.indices), images.length) : ''}
            </strong>
            <span
              className="reader-image-info"
              title={active?.indices
                .map(
                  (index, position) =>
                    images[index].name +
                    ' · ' +
                    active.sizes[position].width +
                    ' × ' +
                    active.sizes[position].height +
                    ' · ' +
                    images[index].mime
                )
                .join(' ｜ ')}
            >
              {error ? (
                <span role="alert">
                  {error}
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    onClick={() => {
                      for (const index of group) {
                        const item = cache.current.get(images[index].url)
                        if (item) {
                          cache.current.delete(images[index].url)
                          item.image.src = ''
                        }
                      }
                      setRetry((value) => value + 1)
                    }}
                  >
                    {tr('重試')}
                  </Button>
                </span>
              ) : loading ? (
                tr('載入第 {0} 頁…', pageLabel(group))
              ) : (
                active?.indices
                  .map(
                    (index, position) =>
                      images[index].name +
                      ' · ' +
                      active.sizes[position].width +
                      ' × ' +
                      active.sizes[position].height +
                      ' · ' +
                      images[index].mime +
                      ' · ' +
                      (images[index].size / 1024).toFixed(1) +
                      ' KB'
                  )
                  .join(' ｜ ')
              )}
            </span>
            {openFolder && (
              <Tooltip label={tr('開啟所在資料夾')}>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label={tr('開啟所在資料夾')}
                  onClick={openFolder}
                >
                  <Icon name="folder" size={14} />
                </ActionIcon>
              </Tooltip>
            )}
            <span>{tr('滾輪縮放 · F11 沉浸閱讀 · ESC 返回')}</span>
          </div>
        )}
      </div>
    </FocusTrap>
  )
  return embedded ? view : createPortal(view, document.body)
}
