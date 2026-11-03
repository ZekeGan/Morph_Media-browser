import { visibleFile } from '../shared/media'
import { useFileVisibility } from './useFileVisibility'
import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Group,
  Loader,
  Popover,
  SegmentedControl,
  Select,
  Text,
} from '@mantine/core'
import type { FolderRow } from '../shared/model'
import type { OverviewEntry } from '../shared/explorer'
import { Icon } from './icons'
import { iconLabel } from './IconLabel'
import { useRefreshNonce } from './refresh'
import { t as tr, useLocale } from './i18n'

type Presentation = 'tiles' | 'groups' | 'list'
const presentations = [
  { value: 'tiles', icon: 'image', label: '縮圖' },
  { value: 'groups', icon: 'layers', label: '分組' },
  { value: 'list', icon: 'list', label: '清單' },
] as const
export function FileOverview({
  toolbarTarget,
  scopeTarget,
  root,
  scope,
  presentation,
  busy,
  change,
  open,
  chooseRoot,
}: {
  toolbarTarget: HTMLDivElement | null
  scopeTarget: HTMLDivElement | null
  root: FolderRow
  scope: 'current' | 'descendants'
  presentation: Presentation
  busy: boolean
  change: (scope: 'current' | 'descendants', presentation: Presentation) => void
  open: (entry: OverviewEntry) => void
  chooseRoot: (id: string) => void
}) {
  const locale = useLocale()
  const { visibility } = useFileVisibility()
  const [entries, setEntries] = useState<OverviewEntry[]>([]),
    [notices, setNotices] = useState<string[]>([]),
    [loading, setLoading] = useState(false),
    reload = useRefreshNonce(),
    [filter, setFilter] = useState('all')
  const [view, setView] = useState({ top: 0, height: 500, width: 600 }),
    viewport = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let alive = true
    setEntries([])
    setNotices([])
    setLoading(true)
    viewport.current?.scrollTo(0, 0)
    void (async () => {
      let cursor: string | undefined
      do {
        const response = await window.explorer.request({
          action: 'overview',
          rowId: root.rowId,
          scope,
          limit: 96,
          cursor,
        })
        if (!alive) return
        if (!response.overview) throw new Error(tr('無法取得檔案總覽'))
        const result = response.overview
        setEntries((previous) => [...previous, ...result.entries])
        setNotices((previous) => [...new Set([...previous, ...result.notices])].slice(0, 100))
        cursor = result.nextCursor
      } while (alive && cursor)
    })()
      .catch((reason) => {
        if (alive) setNotices((previous) => [...previous, String(reason)])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [root.rowId, root.path, scope, reload])
  useLayoutEffect(() => {
    const element = viewport.current
    if (!element) return
    const update = () =>
      setView({ top: element.scrollTop, height: element.clientHeight, width: element.clientWidth })
    const observer = new ResizeObserver(update)
    observer.observe(element)
    update()
    return () => observer.disconnect()
  }, [])
  const visibleEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          visibleFile(entry, visibility) &&
          (filter === 'all' ||
            (filter === 'other' ? !['image', 'video'].includes(entry.kind) : entry.kind === filter))
      ),
    [entries, filter, visibility]
  )
  const columns = presentation === 'list' ? 1 : Math.max(1, Math.floor((view.width - 20) / 160))
  const layout = useMemo(() => {
    const rows: {
      top: number
      height: number
      label?: string
      rowId?: string
      entries: OverviewEntry[]
    }[] = []
    let top = 0
    const append = (items: OverviewEntry[]) => {
      for (let index = 0; index < items.length; index += columns) {
        const height = presentation === 'list' ? 60 : 166
        rows.push({ top, height, entries: items.slice(index, index + columns) })
        top += height
      }
    }
    if (presentation === 'groups') {
      const groups = new Map<string, OverviewEntry[]>()
      for (const entry of visibleEntries) {
        const group = groups.get(entry.sourcePath) ?? []
        group.push(entry)
        groups.set(entry.sourcePath, group)
      }
      for (const [label, group] of groups) {
        rows.push({
          top,
          height: 50,
          label: label + ' · ' + tr('{0} 個檔案', group.length),
          rowId: group[0].rowId,
          entries: [],
        })
        top += 50
        append(group)
      }
    } else append(visibleEntries)
    return { rows, height: top }
  }, [visibleEntries, columns, presentation, locale])
  const rendered = layout.rows.filter(
    (row) => row.top + row.height >= view.top - 250 && row.top <= view.top + view.height + 250
  )
  return (
    <div className="file-overview">
      {toolbarTarget &&
        createPortal(
          <>
            <SegmentedControl
              size="xs"
              aria-label={tr('檔案總覽展示方式')}
              value={presentation}
              disabled={busy}
              onChange={(value) => change(scope, value as Presentation)}
              data={presentations.map(({ value, icon, label }) => ({
                value,
                label: iconLabel(icon, tr(label)),
              }))}
            />
            <Select
              size="xs"
              aria-label={tr('檔案類型')}
              value={filter}
              allowDeselect={false}
              onChange={(value) => setFilter(value ?? 'all')}
              data={[
                { value: 'all', label: tr('全部') },
                { value: 'image', label: tr('圖片') },
                { value: 'video', label: tr('影片') },
                { value: 'other', label: tr('其他') },
              ]}
            />
          </>,
          toolbarTarget
        )}
      {scopeTarget &&
        createPortal(
          <Popover position="bottom-end" withArrow shadow="md" width={240}>
            <Popover.Target>
              <Button
                className="scope-button"
                size="xs"
                variant="default"
                aria-label={tr('檔案總覽範圍設定')}
                leftSection={<Icon name="sliders" size={14} />}
              >
                {scope === 'current' ? tr('目前資料夾') : tr('含子資料夾')}
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <Text size="xs" c="dimmed" mb={4}>
                {tr('列出哪些資料夾的檔案')}
              </Text>
              <SegmentedControl
                size="xs"
                fullWidth
                aria-label={tr('檔案總覽範圍')}
                value={scope}
                disabled={busy}
                onChange={(value) => change(value as typeof scope, presentation)}
                data={[
                  { value: 'current', label: tr('目前資料夾') },
                  { value: 'descendants', label: tr('包含子資料夾') },
                ]}
              />
            </Popover.Dropdown>
          </Popover>,
          scopeTarget
        )}
      <Group gap="xs" px="sm" py={4}>
        <Text size="xs" c="dimmed">
          {tr('已找到 {0} 個檔案', entries.length)} · {tr('目前已納入且允許瀏覽的範圍')}
        </Text>
        {loading && <Loader size="xs" />}
      </Group>
      {!!notices.length && (
        <Alert color="orange" className="file-overview-notices">
          <details>
            <summary>{tr('部分內容未能列出')}</summary>
            {notices.map((notice, index) => (
              <div key={index}>{notice}</div>
            ))}
          </details>
        </Alert>
      )}
      <div
        className="file-overview-scroll"
        ref={viewport}
        onScroll={(event) => {
          // React may run the updater after the scroll handler has returned.
          const top = event.currentTarget.scrollTop
          setView((previous) => (previous.top === top ? previous : { ...previous, top }))
        }}
        role="region"
        aria-label={tr('檔案總覽')}
      >
        {!loading && !visibleEntries.length && !notices.length && (
          <p>{tr('此範圍沒有可顯示的檔案')}</p>
        )}
        <div style={{ height: layout.height, position: 'relative' }}>
          {rendered.map((row) => (
            <div
              key={row.top}
              className={
                'file-overview-row ' + (presentation === 'list' ? 'file-overview-list' : '')
              }
              style={{
                position: 'absolute',
                top: row.top,
                left: 0,
                right: 0,
                height: row.height,
                display: 'grid',
                gridTemplateColumns: `repeat(${columns},minmax(0,1fr))`,
                gap: 8,
              }}
            >
              {row.label ? (
                <button
                  type="button"
                  className="file-overview-group path"
                  title={tr('進入此資料夾')}
                  disabled={busy || !row.rowId || row.rowId === root.rowId}
                  onClick={() => row.rowId && chooseRoot(row.rowId)}
                >
                  {row.label}
                </button>
              ) : (
                row.entries.map((entry) => (
                  <button
                    type="button"
                    key={entry.rowId + '/' + entry.id}
                    className="file-overview-item"
                    title={entry.sourcePath + '/' + entry.name}
                    disabled={busy}
                    onClick={() => open(entry)}
                  >
                    <span className="file-overview-thumb">
                      {entry.thumb ? (
                        <img
                          src={entry.thumb}
                          alt=""
                          loading="lazy"
                          onError={(event) => {
                            event.currentTarget.style.visibility = 'hidden'
                          }}
                        />
                      ) : (
                        <Icon
                          name={
                            entry.kind === 'video'
                              ? 'play'
                              : entry.kind === 'image'
                                ? 'image'
                                : 'file'
                          }
                          size={28}
                        />
                      )}
                    </span>
                    <span className="file-overview-name">{entry.name}</span>
                    <small className="path">{entry.sourcePath}</small>
                  </button>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
