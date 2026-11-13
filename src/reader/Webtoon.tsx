import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import type { MediaEntry } from '../../shared/explorer'
import { t as tr } from '../i18n'
import { useWheel } from '../common/readerInput'

// R-256: webtoon reading. Every page in one column without gaps, as wide as the chosen share of the window; the page
// number is the page under the middle of the window. Pages load as they come near (the browser's lazy loading) and
// keep their place while pages above them load (scroll anchoring).
export interface WebtoonHandle {
  // Scroll so this page starts at the top of the window.
  toPage(index: number): void
  // One window height down (1) or up (-1); false when already at that end.
  screen(direction: 1 | -1): boolean
  edge(end: boolean): void
}
export const WEBTOON_MIN = 30,
  WEBTOON_MAX = 100
export const clampWidth = (value: number) =>
  Math.round(Math.min(WEBTOON_MAX, Math.max(WEBTOON_MIN, value)))
// The width used for a book that has none of its own: the last one chosen on this computer.
const widthKey = 'morph.webtoonWidth'
export function lastWebtoonWidth() {
  try {
    const value = Number(localStorage.getItem(widthKey))
    return value ? clampWidth(value) : 60
  } catch {
    return 60
  }
}
export function rememberWebtoonWidth(value: number) {
  try {
    localStorage.setItem(widthKey, String(clampWidth(value)))
  } catch {}
}
// A book probably is a webtoon when one of its first pages is much taller than wide.
export const looksLikeWebtoon = (sizes: { width: number; height: number }[]) =>
  sizes.some((size) => size.width > 0 && size.height > size.width * 2.5)

export const Webtoon = forwardRef<
  WebtoonHandle,
  {
    images: MediaEntry[]
    start: number
    width: number
    onPage: (index: number) => void
    onWidth: (value: number) => void
  }
>(function Webtoon({ images, start, width, onPage, onWidth }, handle) {
  const scroller = useRef<HTMLDivElement>(null),
    pages = useRef<(HTMLImageElement | null)[]>([]),
    current = useRef(start),
    frame = useRef(0)
  const toPage = (index: number) => {
    const element = scroller.current,
      page = pages.current[index]
    if (!element || !page) return
    element.scrollTop = page.offsetTop
    current.current = index
    onPage(index)
  }
  useImperativeHandle(handle, () => ({
    toPage,
    screen(direction) {
      const element = scroller.current
      if (!element) return false
      const before = element.scrollTop
      element.scrollTop = before + direction * element.clientHeight * 0.9
      return element.scrollTop !== before
    },
    edge(end) {
      const element = scroller.current
      if (element) element.scrollTop = end ? element.scrollHeight : 0
    },
  }))
  // Open at the saved page once the column is laid out.
  useLayoutEffect(() => {
    if (start > 0) toPage(Math.min(start, images.length - 1))
  }, [])
  // The page under the middle of the window is the current page.
  const track = () => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const element = scroller.current
      if (!element) return
      const middle = element.scrollTop + element.clientHeight / 2
      let low = 0,
        high = pages.current.length - 1
      while (low < high) {
        const mid = Math.ceil((low + high) / 2),
          top = pages.current[mid]?.offsetTop ?? 0
        if (top <= middle) low = mid
        else high = mid - 1
      }
      if (low !== current.current) {
        current.current = low
        onPage(low)
      }
    })
  }
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  // Ctrl + wheel changes the column width; the plain wheel scrolls.
  const latestWidth = useRef(width)
  latestWidth.current = width
  useWheel(
    scroller,
    (event) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      onWidth(clampWidth(latestWidth.current + (event.deltaY < 0 ? 5 : -5)))
    },
    [onWidth]
  )
  return (
    <div
      ref={scroller}
      className="reader-viewport reader-stage reader-webtoon"
      tabIndex={0}
      onScroll={track}
      aria-label={tr('條漫')}
    >
      <div className="reader-webtoon-column" style={{ width: width + '%' }}>
        {images.map((image, index) => (
          <img
            key={image.id}
            ref={(node) => {
              pages.current[index] = node
            }}
            className="reader-webtoon-page pending"
            src={image.url}
            alt={image.name}
            loading="lazy"
            decoding="async"
            draggable={false}
            data-page={index + 1}
            onLoad={(event) => event.currentTarget.classList.remove('pending')}
          />
        ))}
      </div>
    </div>
  )
})
