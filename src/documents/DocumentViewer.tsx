import { createPortal } from 'react-dom'
import { useEffect, useState, useRef, lazy, Suspense } from 'react'
import { Button, FocusTrap, Group } from '@mantine/core'
import type { ExplorerRequest, ExplorerResponse, MediaEntry } from '../../shared/explorer'
import type { FolderRow } from '../../shared/model'
import { t as tr, useLocale } from '../i18n'
const Reader = lazy(() => import('../reader/Reader').then((module) => ({ default: module.Reader })))
const NovelReader = lazy(() =>
  import('../novel/NovelReader').then((module) => ({ default: module.NovelReader }))
)
export function DocumentViewer({
  rowId,
  file,
  close,
  embedded = false,
  row,
  run,
  next,
}: {
  rowId: string
  file: MediaEntry
  close: () => void
  embedded?: boolean
  // Text books (R-282) open in the novel reader, which keeps the place in the folder record.
  row?: FolderRow
  run?: (request: ExplorerRequest) => Promise<ExplorerResponse | undefined>
  next?: { name: string; open: () => void }
}) {
  useLocale()
  const [images, setImages] = useState<MediaEntry[]>(),
    [error, setError] = useState('')
  const returnFocus = useRef(document.activeElement as HTMLElement),
    onClose = useRef(close)
  onClose.current = close
  useEffect(() => () => returnFocus.current?.focus({ preventScroll: true }), [])
  useEffect(() => {
    if (images || file.kind === 'text') return
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        onClose.current()
      }
    }
    document.addEventListener('keydown', key)
    return () => document.removeEventListener('keydown', key)
  }, [images])
  useEffect(() => {
    if (file.kind !== 'archive') return
    let alive = true
    void window.explorer
      .request({ action: 'archive', rowId, fileId: file.id })
      .then((result) => {
        if (!alive) return
        if (!result.content?.entries.length) throw new Error(tr('壓縮檔內沒有支援的圖片'))
        setImages(result.content.entries)
      })
      .catch((reason) => {
        if (alive) setError(String(reason))
      })
    return () => {
      alive = false
    }
  }, [rowId, file.id, file.kind])
  if (file.kind === 'text' && row)
    return (
      <Suspense fallback={<p>{tr('載入內容…')}</p>}>
        <NovelReader
          row={row}
          file={file}
          run={run}
          close={close}
          next={next}
          embedded={embedded}
        />
      </Suspense>
    )
  if (images)
    return (
      <Suspense fallback={<p>{tr('載入內容…')}</p>}>
        <Reader
          embedded={embedded}
          images={images}
          start={0}
          manga
          prefs={undefined}
          close={close}
          save={() => {}}
        />
      </Suspense>
    )
  const view = (
    <FocusTrap active={!embedded}>
      <div
        className={'document-viewer' + (embedded ? ' document-embedded' : ' overlay-frame')}
        role="dialog"
        aria-modal="true"
        aria-label={file.name}
      >
        {!embedded && (
          <Group justify="space-between">
            <strong>{file.name}</strong>
            <Button data-autofocus variant="default" onClick={close}>
              {tr('關閉')}
            </Button>
          </Group>
        )}
        {error ? (
          <p role="alert">{error}</p>
        ) : file.kind === 'pdf' ? (
          <iframe title={file.name} src={file.url} />
        ) : (
          <p>{tr('載入內容…')}</p>
        )}
      </div>
    </FocusTrap>
  )
  return embedded ? view : createPortal(view, document.body)
}
