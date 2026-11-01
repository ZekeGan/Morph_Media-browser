import { useLayoutEffect, useRef } from 'react'
import { Badge } from '@mantine/core'
import { t as tr } from './i18n'

// Tags wrapped over as many lines as the cell is tall. Those that do not fit are replaced by a "+N" badge, and the
// whole list stays in the tooltip. In a scrolling cell nothing is hidden.
export function TagList({ tags, fit }: { tags: unknown[]; fit: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = box.current
    if (!node || !fit) return
    const measure = () => {
      const tagNodes = [...node.querySelectorAll<HTMLElement>('[data-tag]')],
        more = node.querySelector<HTMLElement>('[data-more]')!
      for (const tag of tagNodes) tag.style.display = ''
      more.style.display = 'none'
      const clipped = () => {
        const limit = node.clientHeight
        return (el: HTMLElement) => el.offsetTop + el.offsetHeight > limit + 1
      }
      if (!tagNodes.some(clipped())) return
      let shown = tagNodes.length
      more.style.display = ''
      const hideLast = () => {
        shown--
        tagNodes[shown].style.display = 'none'
        more.textContent = '+' + (tagNodes.length - shown)
      }
      more.textContent = '+' + 0
      // Hide from the end until the "+N" badge itself fits on the last visible line.
      for (let i = 0; i < tagNodes.length; i++) {
        if (clipped()(tagNodes[shown - 1] ?? more) || clipped()(more)) hideLast()
        else break
        if (shown === 0) break
      }
      more.textContent = '+' + (tagNodes.length - shown)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [tags, fit])
  return (
    <div
      ref={box}
      className={fit ? 'tag-list tag-list-fit' : 'tag-list'}
      title={fit ? tags.map(String).join('、') : undefined}
    >
      {tags.map((tag, index) => (
        <Badge key={index} data-tag color="gray" variant="light">
          {String(tag)}
        </Badge>
      ))}
      {fit && (
        <Badge
          data-more
          color="gray"
          variant="filled"
          aria-label={tr('還有更多標籤')}
          style={{ display: 'none' }}
        >
          +0
        </Badge>
      )}
    </div>
  )
}
