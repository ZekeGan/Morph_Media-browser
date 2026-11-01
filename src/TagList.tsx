import { useLayoutEffect, useRef } from 'react'
import { Badge } from '@mantine/core'
import { t as tr } from './i18n'

// Colours of the E-Hentai style "namespace:name" tags; anything else stays grey.
const namespaceColors: Record<string, string> = {
  female: 'pink',
  male: 'blue',
  mixed: 'grape',
  other: 'gray',
  language: 'teal',
  parody: 'violet',
  character: 'orange',
  artist: 'cyan',
  group: 'indigo',
  cosplayer: 'lime',
  reclass: 'yellow',
}
function tagLook(tag: string, colors: 'namespace' | undefined, prefix: boolean) {
  const split = tag.indexOf(':'),
    space = split > 0 ? tag.slice(0, split) : ''
  return {
    text: !prefix && space && Object.hasOwn(namespaceColors, space) ? tag.slice(split + 1) : tag,
    color: colors === 'namespace' ? (namespaceColors[space] ?? 'gray') : 'gray',
  }
}
// Tags wrapped over as many lines as the cell is tall. Those that do not fit are replaced by a "+N" badge, and the
// whole list stays in the tooltip. In a scrolling cell nothing is hidden.
export function TagList({
  tags,
  fit,
  colors,
  prefix = true,
}: {
  tags: unknown[]
  fit: boolean
  colors?: 'namespace'
  prefix?: boolean
}) {
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
  }, [tags, fit, prefix])
  return (
    <div
      ref={box}
      className={fit ? 'tag-list tag-list-fit' : 'tag-list'}
      title={fit ? tags.map(String).join('、') : undefined}
    >
      {tags.map((tag, index) => {
        const look = tagLook(String(tag), colors, prefix)
        return (
          <Badge key={index} data-tag color={look.color} variant="light">
            {look.text}
          </Badge>
        )
      })}
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
