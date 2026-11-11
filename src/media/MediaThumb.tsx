import { useEffect, useRef, useState } from 'react'
import type { MediaEntry } from '../../shared/explorer'
import { Icon, type IconName } from '../common/icons'

// Embedded audio covers are read once per file and kept for the session; a file without one is remembered too.
const covers = new Map<string, Promise<string | undefined>>()
const limit = 300
export function audioCover(url: string) {
  let cover = covers.get(url)
  if (!cover) {
    const source = new URL(url)
    source.hostname = 'audio-cover'
    cover = fetch(source)
      .then(async (response) =>
        response.status === 200 ? URL.createObjectURL(await response.blob()) : undefined
      )
      .catch(() => undefined)
    covers.set(url, cover)
    if (covers.size > limit) {
      const [oldest, value] = covers.entries().next().value!
      covers.delete(oldest)
      void value.then((blob) => blob && URL.revokeObjectURL(blob))
    }
  }
  return cover
}

const kindIcon = (kind: MediaEntry['kind']): IconName =>
  kind === 'audio' ? 'music' : kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'file'

// The preview square shared by the media queues: the kind icon underneath, the thumbnail (or audio cover) on top.
export function MediaThumb({
  entry,
  icon,
  size = 24,
}: {
  entry: MediaEntry
  icon?: IconName
  size?: number
}) {
  const box = useRef<HTMLSpanElement>(null),
    still = entry.thumb && entry.mime !== 'image/gif' ? entry.thumb : undefined,
    [cover, setCover] = useState<string>()
  useEffect(() => {
    setCover(undefined)
    const node = box.current
    if (entry.kind !== 'audio' || !node) return
    let active = true
    const observer = new IntersectionObserver((seen) => {
      if (!seen.some((item) => item.isIntersecting)) return
      observer.disconnect()
      void audioCover(entry.url).then((url) => active && setCover(url))
    })
    observer.observe(node)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [entry.kind, entry.url])
  const src = still ?? cover
  return (
    <span ref={box} className="media-thumb">
      <Icon name={icon ?? kindIcon(entry.kind)} size={size} />
      {src && (
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.style.visibility = 'hidden'
          }}
        />
      )}
    </span>
  )
}
