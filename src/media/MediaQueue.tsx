import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Tooltip } from '@mantine/core'
import type { MediaEntry } from '../../shared/explorer'
import { t as tr } from '../i18n'
import { ViewToggle } from '../browse/ViewToggle'
import { MediaThumb } from './MediaThumb'

export function MediaQueue({
  entries,
  selected,
  choose,
  loading,
  video,
  view,
  changeView,
}: {
  entries: MediaEntry[]
  selected: string
  choose: (file: MediaEntry) => void
  loading: boolean
  video: boolean
  view: 'list' | 'images'
  changeView: (view: 'list' | 'images') => void
}) {
  const root = useRef<HTMLDivElement>(null),
    [viewport, setViewport] = useState({ top: 0, height: 600 })
  const thumbnails = video && view === 'images',
    height = thumbnails ? 160 : 64
  useLayoutEffect(() => {
    const node = root.current
    if (!node) return
    const observer = new ResizeObserver(() =>
      setViewport((value) => ({ ...value, height: node.clientHeight }))
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    const node = root.current,
      index = entries.findIndex((entry) => entry.id === selected)
    if (!node || index < 0) return
    const top = index * height
    if (top < node.scrollTop || top + height > node.scrollTop + node.clientHeight)
      node.scrollTop = Math.max(0, top - node.clientHeight / 2)
    setViewport((value) => ({ ...value, top: node.scrollTop }))
  }, [selected, height, entries.length])
  const first = Math.max(0, Math.floor(viewport.top / height) - 3),
    last = Math.min(entries.length, Math.ceil((viewport.top + viewport.height) / height) + 3)
  return (
    <aside
      className={'media-queue' + (thumbnails ? ' media-queue-thumbnails' : '')}
      aria-label={tr('媒體佇列')}
    >
      <header>
        <strong>
          {tr('目前資料夾')} · {entries.length}
          {loading ? '…' : ''}
        </strong>
        {video && <ViewToggle view={view} change={changeView} />}
      </header>
      <div
        ref={root}
        className="media-queue-scroll"
        onScroll={(event) => {
          const top = event.currentTarget.scrollTop
          setViewport((value) => ({ ...value, top }))
        }}
      >
        <div style={{ height: entries.length * height, position: 'relative' }}>
          {entries.slice(first, last).map((entry, index) => (
            <Tooltip
              key={entry.id}
              zIndex={450}
              label={entry.name}
              disabled={!thumbnails}
              events={{ hover: true, focus: true, touch: false }}
            >
              <button
                className={entry.id === selected ? 'active' : ''}
                style={{ top: (first + index) * height, height }}
                aria-label={entry.name}
                aria-current={entry.id === selected ? 'true' : undefined}
                onClick={() => choose(entry)}
              >
                <div className="media-queue-preview">
                  <MediaThumb entry={entry} />
                </div>
                {!thumbnails && <span>{entry.name}</span>}
              </button>
            </Tooltip>
          ))}
        </div>
      </div>
    </aside>
  )
}
