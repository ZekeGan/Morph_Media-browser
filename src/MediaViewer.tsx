import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ActionIcon, Button, FocusTrap, Tooltip } from '@mantine/core'
import type { ExplorerRequest, ExplorerResponse, MediaEntry } from '../shared/explorer'
import type { FolderRow, Project, Request, Response } from '../shared/model'
import { canPreviewMedia, mediaQueue } from '../shared/media'
import { effectiveKind } from '../shared/kind'
import { MediaQueue } from './MediaQueue'
import { Icon } from './icons'
import { t as tr } from './i18n'
import './media-workspace.css'
const Reader = lazy(() => import('./Reader').then((module) => ({ default: module.Reader })))
const VideoViewer = lazy(() =>
  import('./VideoViewer').then((module) => ({ default: module.VideoViewer }))
)
const AudioViewer = lazy(() =>
  import('./AudioViewer').then((module) => ({ default: module.AudioViewer }))
)
const DocumentViewer = lazy(() =>
  import('./DocumentViewer').then((module) => ({ default: module.DocumentViewer }))
)

export function MediaViewer({
  row,
  project,
  file,
  entries,
  coverEntries = entries,
  loading,
  close,
  run,
  act,
  busy,
  manga: mangaHint,
}: {
  row: FolderRow
  project: Project
  file: MediaEntry
  entries: MediaEntry[]
  coverEntries?: MediaEntry[]
  loading: boolean
  close: () => void
  run: (request: ExplorerRequest) => Promise<ExplorerResponse | undefined>
  act: (request: Request) => Promise<Response | undefined>
  busy: boolean
  // The folder page already knows the folder's type (it looked at the files); without it only the record is used.
  manga?: boolean
}) {
  const [audioNext, setAudioNext] = useState(false)
  const [queueView, setQueueView] = useState<'list' | 'images'>('list')
  const [selected, setSelected] = useState(file.id),
    [showQueue, setShowQueue] = useState(false),
    [queueMounted, setQueueMounted] = useState(false),
    [manga, setManga] = useState(
      mangaHint ?? (effectiveKind(row) === 'book' || row.record?.details?.reading?.mode === 'manga')
    )
  const queueSlot = useRef<HTMLDivElement>(null),
    queueToggle = useRef<HTMLButtonElement>(null)
  const supported = canPreviewMedia(file)
  const returnFocus = useRef(document.activeElement as HTMLElement),
    closing = useRef(close)
  closing.current = close
  const queue = mediaQueue(entries, file),
    current = queue.find((entry) => entry.id === selected),
    index = queue.findIndex((entry) => entry.id === selected)
  const unavailable = !loading && !current
  useEffect(() => {
    if (!supported) return
    const key = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('.mantine-Menu-dropdown,.mantine-Select-dropdown')
      ) {
        event.preventDefault()
        closing.current()
      }
    }
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('keydown', key)
      if (returnFocus.current?.isConnected) returnFocus.current.focus({ preventScroll: true })
    }
  }, [supported])
  useLayoutEffect(() => {
    const slot = queueSlot.current
    if (!slot) return
    if (!showQueue && slot.contains(document.activeElement))
      queueToggle.current?.focus({ preventScroll: true })
    slot.inert = !showQueue
  }, [showQueue, supported])
  const queueButton = (
    <Tooltip zIndex={450} label={showQueue ? tr('隱藏佇列') : tr('顯示佇列')}>
      <ActionIcon
        ref={queueToggle}
        variant="subtle"
        aria-label={tr('切換媒體佇列')}
        aria-controls="media-viewer-queue"
        aria-pressed={showQueue}
        onClick={() => {
          setQueueMounted(true)
          setShowQueue((value) => !value)
        }}
      >
        <Icon name="list" />
      </ActionIcon>
    </Tooltip>
  )
  const cover = row.record?.assets.find(
    (asset) => asset.assetId === row.record?.details?.bannerAssetId
  )
  const image = current?.kind === 'image' && !unavailable
  if (!supported) return null
  return createPortal(
    <FocusTrap>
      <div
        className="media-viewer-shell overlay-frame"
        role="dialog"
        aria-modal="true"
        aria-label={tr('媒體檢視器')}
      >
        {!image && (
          <header>
            <strong title={current?.name ?? file.name}>{current?.name ?? file.name}</strong>
            <small className="media-viewer-source" title={row.path}>
              {row.name}
            </small>
            <Tooltip label={tr('開啟所在資料夾')}>
              <ActionIcon
                variant="subtle"
                aria-label={tr('開啟所在資料夾')}
                onClick={() => void act({ action: 'open', rowId: row.rowId })}
              >
                <Icon name="folder" />
              </ActionIcon>
            </Tooltip>
            {queueButton}
            <ActionIcon
              data-autofocus
              variant="subtle"
              aria-label={tr('關閉媒體檢視器')}
              onClick={close}
            >
              <Icon name="close" />
            </ActionIcon>
          </header>
        )}
        <div className="media-viewer-layout">
          <main className="media-viewer-content">
            <Suspense fallback={<p role="status">{tr('載入內容…')}</p>}>
              {unavailable ? (
                <p role="alert">{tr('檔案已不存在於目前清單，請關閉後重新整理。')}</p>
              ) : current?.kind === 'image' ? (
                <Reader
                  key={String(manga)}
                  openFolder={() => void act({ action: 'open', rowId: row.rowId })}
                  embedded
                  images={queue}
                  start={index}
                  selectedId={selected}
                  onActive={setSelected}
                  manga={manga}
                  prefs={row.record?.details?.reading}
                  close={close}
                  save={(prefs) => {
                    if (row.record && !row.readonly && !row.stopped && !row.error)
                      void run({
                        action: 'reading',
                        rowId: row.rowId,
                        revision: row.record.revision,
                        prefs: { ...prefs, mode: manga ? 'manga' : 'image' },
                      })
                  }}
                  extraTools={
                    <>
                      <small className="media-viewer-source" title={row.path}>
                        {row.name}
                      </small>
                      {effectiveKind(row) !== 'book' && (
                        <Button
                          size="compact-xs"
                          variant="subtle"
                          onClick={() => setManga((value) => !value)}
                        >
                          {manga ? tr('圖片模式') : tr('漫畫模式')}
                        </Button>
                      )}
                      {queueButton}
                    </>
                  }
                />
              ) : current?.kind === 'video' ? (
                <VideoViewer
                  row={row}
                  entries={[...queue, ...entries.filter((entry) => entry.kind === 'subtitle')]}
                  run={run}
                  busy={busy}
                  autoplay={true}
                  autoNext={false}
                  changeAutoNext={async () => false}
                  changeAutoplay={async () => false}
                  initialFileId={selected}
                  hideStrip
                  onSelected={setSelected}
                />
              ) : current?.kind === 'audio' ? (
                <AudioViewer
                  autoNext={audioNext}
                  changeAutoNext={setAudioNext}
                  key={current.id}
                  file={current}
                  cover={cover ? `media://asset/${row.rowId}/${cover.assetId}` : undefined}
                  covers={coverEntries.filter((entry) => entry.kind === 'image')}
                  previous={index > 0 ? () => setSelected(queue[index - 1].id) : undefined}
                  next={
                    index >= 0 && index + 1 < queue.length
                      ? () => setSelected(queue[index + 1].id)
                      : undefined
                  }
                />
              ) : current && ['pdf', 'archive'].includes(current.kind) ? (
                <DocumentViewer
                  key={current.id}
                  embedded
                  rowId={row.rowId}
                  file={current}
                  close={close}
                />
              ) : (
                <p>{tr('載入內容…')}</p>
              )}
            </Suspense>
          </main>
          <div
            ref={queueSlot}
            id="media-viewer-queue"
            className={'media-queue-slot' + (showQueue ? ' queue-open' : '')}
            aria-hidden={!showQueue}
          >
            {queueMounted && (
              <MediaQueue
                entries={queue}
                selected={selected}
                choose={(entry) => setSelected(entry.id)}
                loading={loading}
                video={file.kind === 'video'}
                view={queueView}
                changeView={setQueueView}
              />
            )}
          </div>
        </div>
      </div>
    </FocusTrap>,
    document.body
  )
}
