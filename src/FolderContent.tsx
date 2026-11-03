import { MediaBrowser } from './MediaBrowser'
import { MediaViewer } from './MediaViewer'
import { isGameFolder, visibleFile } from '../shared/media'
import { effectiveKind, sampleOf } from '../shared/kind'
import { importedFieldLabels } from './importedFieldLabels'
import { metadataSources, sourceForUrl } from '../shared/sources'
import { useFileVisibility } from './useFileVisibility'
import { DocumentViewer } from './DocumentViewer'
import './game-actions.css'
import { cacheFolderStats } from './folderStats'
import { t as tr, useLocale } from './i18n'
import { Icon } from './icons'
import { useRefreshNonce } from './refresh'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ActionIcon, Button, Group, Menu, Text, Tooltip } from '@mantine/core'
import { Card } from './Card'
import { FolderDetails, FolderHeader } from './FolderParts'
import { Gallery } from './Gallery'
import {
  contentCells,
  gameActionTemplates,
  type ContentResult,
  type ExplorerRequest,
  type ExplorerResponse,
  type MediaPrefs,
} from '../shared/explorer'
import {
  fieldValue,
  type FolderRow,
  type Project,
  type Request,
  type Response,
} from '../shared/model'
const Reader = lazy(() => import('./Reader').then((module) => ({ default: module.Reader })))
const VideoViewer = lazy(() => import('./VideoViewer').then((m) => ({ default: m.VideoViewer })))
const isUrl = (value?: string): value is string => !!value && /^https?:\/\//i.test(value)
const siteName = (url: string) => {
  const id = sourceForUrl(url)
  if (id) return metadataSources.find((item) => item.id === id)?.name ?? id
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
// Rows whose data came from the summarised website show nothing here; other rows say where they come from.
const describeSource = (source: string | undefined, summary?: { url: string; name: string }) =>
  !source
    ? tr('未設定')
    : isUrl(source)
      ? siteName(source) === summary?.name
        ? ''
        : siteName(source)
      : source === 'manual'
        ? tr('手動')
        : source

export function FolderContent({
  row,
  project,
  run,
  onChild,
  act,
  busy,
  configure,
  selectedFileId,
  selectedEntry,
  childNames,
  sourceRows,
  onSource,
  mediaPrefs,
  onMediaPrefs,
}: {
  row: FolderRow
  project: Project
  run: (r: ExplorerRequest) => Promise<ExplorerResponse | undefined>
  onChild: (name: string) => void
  act: (r: Request) => Promise<Response | undefined>
  busy: boolean
  configure: (tab?: 'game') => void
  sourceRows: FolderRow[]
  onSource: (id: string) => void
  childNames?: string[]
  mediaPrefs?: MediaPrefs
  onMediaPrefs?: (prefs: MediaPrefs) => void
  selectedFileId?: string
  selectedEntry?: ContentResult['entries'][number]
}) {
  useLocale()
  const { visibility } = useFileVisibility()
  const contentRow = useRef(row.rowId)
  const [galleryFile, setGalleryFile] = useState<ContentResult['entries'][number]>()
  // Width of the 欄位 and 來源 columns of the game table (content takes the rest); a per-viewer convenience.
  const [gameWidths, setGameWidths] = useState<[number, number]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('morph.gameFieldWidths') ?? '[]')
      if (Array.isArray(saved) && saved.length === 2 && saved.every((n) => n >= 60 && n <= 800))
        return saved as [number, number]
    } catch {
      /* fall through to the defaults */
    }
    return [120, 110]
  })
  const gameDrag = useRef<{ column: 0 | 1; start: number; width: number } | undefined>(undefined)
  const dragGameColumn = (event: React.PointerEvent) => {
    const drag = gameDrag.current
    if (!drag) return
    const delta = event.clientX - drag.start,
      width = Math.min(800, Math.max(60, drag.width + (drag.column === 0 ? delta : -delta)))
    setGameWidths((current) => (drag.column === 0 ? [width, current[1]] : [current[0], width]))
  }
  const stopGameColumn = () => {
    gameDrag.current = undefined
    try {
      localStorage.setItem('morph.gameFieldWidths', JSON.stringify(gameWidths))
    } catch {
      /* the widths still apply until the page closes */
    }
  }
  const gameResizer = (column: 0 | 1, label: string) => (
    <span
      className="column-resizer"
      role="separator"
      aria-label={tr('調整 ') + label + tr(' 欄寬')}
      onPointerDown={(event) => {
        event.preventDefault()
        gameDrag.current = { column, start: event.clientX, width: gameWidths[column] }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={dragGameColumn}
      onPointerUp={stopGameColumn}
      onPointerCancel={() => {
        gameDrag.current = undefined
      }}
    />
  )

  const [content, setContent] = useState<ContentResult>(),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0),
    refresh = useRefreshNonce(),
    [, setReader] = useState(false),
    [fileReader, setFileReader] = useState(false),
    [documentFile, setDocumentFile] = useState<ContentResult['entries'][number]>()
  useEffect(() => {
    let alive = true
    if (contentRow.current !== row.rowId) {
      setContent(undefined)
      contentRow.current = row.rowId
    }
    setError('')
    const paged = !isGameFolder(row)
    void (async () => {
      let cursor: string | undefined
      const counted: ContentResult['entries'] = []
      do {
        const response = await window.explorer.request({
          action: 'content',
          rowId: row.rowId,
          ...(paged ? { limit: cursor ? 256 : 96, cursor } : {}),
        })
        if (!alive) return
        const chunk = response.content
        if (!chunk) throw new Error(tr('無法取得資料夾內容'))
        const append = !!cursor
        setContent((previous) =>
          append && previous
            ? {
                ...chunk,
                entries: [...previous.entries, ...chunk.entries],
                notices: [...previous.notices, ...chunk.notices],
              }
            : chunk
        )
        counted.push(...chunk.entries)
        cursor = chunk.nextCursor
        if (!cursor) cacheFolderStats(row.rowId, counted)
        // Yield between chunks so navigation and the first screen can render.
        if (cursor) await new Promise((resolve) => setTimeout(resolve, 50))
      } while (alive && cursor)
    })().catch((e) => {
      if (alive) setError(String(e))
    })
    return () => {
      alive = false
    }
  }, [row.rowId, row.path, reload, refresh])
  useEffect(() => {
    setFileReader(false)
    setDocumentFile(undefined)
  }, [row.rowId, selectedFileId])
  if (error && !content)
    return (
      <p role="alert" className="media-content-error">
        {error}
        <Button size="compact-xs" variant="subtle" onClick={() => setReload((value) => value + 1)}>
          {tr('重新載入')}
        </Button>
      </p>
    )
  if (!content) return <p className="media-loading">{tr('載入內容…')}</p>
  const visibleEntries = content.entries.filter((entry) => visibleFile(entry, visibility))
  const selectedFile = visibleEntries.find((entry) => entry.id === selectedFileId) ?? selectedEntry
  const kind = effectiveKind(row, sampleOf(content.entries))
  // Everything that is not a dedicated game ROOT or book uses the unified folder page.
  const unified = kind !== 'book' && !(kind === 'game' && isGameFolder(row))
  if (unified && (!selectedFile || ['audio', 'video'].includes(selectedFile.kind)))
    return (
      <MediaBrowser
        prefs={mediaPrefs}
        onPrefs={onMediaPrefs}
        row={row}
        project={project}
        entries={visibleEntries}
        loading={!!content.nextCursor && !error}
        error={[error, ...new Set(content.notices)].filter(Boolean).join('\n')}
        onChild={onChild}
        run={run}
        act={act}
        busy={busy}
        configure={configure}
        childNames={childNames}
        sourceRows={sourceRows}
        onSource={onSource}
      />
    )
  if (selectedFile && selectedFile.kind !== 'video')
    return (
      <div className="single-file-preview">
        <div className="single-file-heading">
          <h3 title={selectedFile.name}>{selectedFile.name}</h3>
          <Tooltip label={tr('開啟所在資料夾')}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={tr('開啟所在資料夾')}
              onClick={() => void act({ action: 'open', rowId: row.rowId })}
            >
              <Icon name="folder" size={15} />
            </ActionIcon>
          </Tooltip>
        </div>
        <small className="path">{row.path}</small>
        {documentFile && (
          <DocumentViewer
            rowId={row.rowId}
            file={documentFile}
            close={() => setDocumentFile(undefined)}
          />
        )}
        {['pdf', 'archive'].includes(selectedFile.kind) && (
          <Button onClick={() => setDocumentFile(selectedFile)}>{tr('開啟檢視器')}</Button>
        )}
        {selectedFile.kind === 'image' ? (
          <>
            <button
              type="button"
              className="single-file-image-open"
              aria-label={tr('開啟圖片 {0}', selectedFile.name)}
              onClick={() => setFileReader(true)}
            >
              <img className="single-file-image" src={selectedFile.url} alt={selectedFile.name} />
            </button>
            {fileReader && (
              <Suspense fallback={<p>{tr('載入內容…')}</p>}>
                <Reader
                  images={content.entries.filter((entry) => entry.kind === 'image')}
                  start={content.entries
                    .filter((entry) => entry.kind === 'image')
                    .findIndex((entry) => entry.id === selectedFile.id)}
                  manga={kind === 'book'}
                  prefs={row.record?.details?.reading}
                  close={() => setFileReader(false)}
                  save={(prefs) =>
                    void run({
                      action: 'reading',
                      rowId: row.rowId,
                      revision: row.record!.revision,
                      prefs,
                    })
                  }
                />
              </Suspense>
            )}
          </>
        ) : (
          <p>
            {selectedFile.mime} · {selectedFile.size.toLocaleString()} B
          </p>
        )}
      </div>
    )
  if (selectedFile?.kind === 'video')
    return (
      <Suspense fallback={<p>{tr('載入播放器…')}</p>}>
        <VideoViewer
          initialFileId={selectedFile?.id}
          key={row.rowId}
          row={row}
          entries={visibleEntries}
          run={run}
          busy={busy}
          autoplay
          autoNext={false}
          changeAutoplay={async () => false}
          changeAutoNext={async () => false}
        />
      </Suspense>
    )
  const cover =
      row.record?.assets.find((a) => a.assetId === row.record?.details?.bannerAssetId) ??
      row.record?.assets[0],
    first = content.entries.find((e) => e.kind === 'image')
  if (kind === 'game' && isGameFolder(row)) {
    const disabled = busy || !row.record || row.readonly || row.stopped || !!row.error
    const fields = [
      ...new Map(
        [
          ...project.fieldBindings.map((f) => ({ attributeId: f.attributeId, key: f.alias })),
          ...(row.record?.attributes ?? []),
          ...(row.record?.projectOverrides[row.projectId] ?? []),
        ].map((a) => [a.attributeId, a])
      ).values(),
    ]
    const importedLabels = importedFieldLabels()
    // Fields imported from one website all carry that site's address; show the site once instead of on every row.
    const importSource = (() => {
      const url = fields
        .map(
          (f) =>
            (
              row.record?.projectOverrides[row.projectId]?.find(
                (a) => a.attributeId === f.attributeId
              ) ?? row.record?.attributes.find((a) => a.attributeId === f.attributeId)
            )?.source
        )
        .find(isUrl)
      return url ? { url, name: siteName(url) } : undefined
    })()
    return (
      <div className="game-content">
        <FolderDetails
          row={row}
          project={project}
          openFolder={() => void act({ action: 'open', rowId: row.rowId })}
        />
        <div className="game-banner">
          {(row.boundary?.state === 'candidate' ||
            row.record?.details?.boundary?.state === 'candidate') && (
            <small className="game-candidate" role="status">
              {tr('候選遊戲，尚未確認')}
            </small>
          )}
          {cover ? (
            <img src={`media://asset/${row.rowId}/${cover.assetId}`} alt={cover.originalName} />
          ) : (
            <span>{tr('沒有遊戲封面')}</span>
          )}
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon
                className="cover-change"
                aria-label={tr('更換遊戲封面')}
                disabled={disabled}
                variant="default"
              >
                <Icon name="edit" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              {row.record?.assets.map((a) => (
                <Menu.Item
                  key={a.assetId}
                  onClick={() =>
                    void run({
                      action: 'banner',
                      rowId: row.rowId,
                      revision: row.record!.revision,
                      assetId: a.assetId,
                    })
                  }
                >
                  {a.originalName}
                </Menu.Item>
              ))}
              <Menu.Item
                onClick={async () => {
                  const result = await act({
                      action: 'image',
                      rowId: row.rowId,
                      revision: row.record!.revision,
                    }),
                    next =
                      result && !result.cancelled
                        ? result.snapshot.structure?.find((r) => r.rowId === row.rowId)?.record
                        : undefined,
                    asset = next?.assets.at(-1)
                  if (next && asset)
                    await run({
                      action: 'banner',
                      rowId: row.rowId,
                      revision: next.revision,
                      assetId: asset.assetId,
                    })
                }}
              >
                {tr('匯入封面圖片')}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </div>
        {(row.boundary?.state === 'candidate' ||
          row.record?.details?.boundary?.state === 'candidate') &&
          row.record && (
            <Group className="game-candidate-actions" gap="xs">
              <Button
                size="xs"
                disabled={disabled}
                onClick={() =>
                  void run({
                    action: 'boundary',
                    rowId: row.rowId,
                    revision: row.record!.revision,
                    state: 'root',
                  })
                }
              >
                {tr('確認為遊戲')}
              </Button>
              <Button
                size="xs"
                variant="subtle"
                disabled={disabled}
                onClick={() =>
                  void run({
                    action: 'boundary',
                    rowId: row.rowId,
                    revision: row.record!.revision,
                    state: 'not-game',
                  })
                }
              >
                {tr('這不是遊戲目錄')}
              </Button>
            </Group>
          )}
        <Group className="game-actions" gap="sm">
          {gameActionTemplates(project)
            // Only actions that are bound in this folder get a button; the eye in the folder settings can hide more.
            .filter(
              (t) =>
                row.record?.details?.targets?.[t.id]?.kind === t.kind &&
                !row.record?.details?.hiddenActions?.includes(t.id)
            )
            .map((t) => (
              <Button
                key={t.id}
                color={t.color}
                disabled={busy}
                title={row.record?.details?.targets?.[t.id]?.path}
                onClick={() => {
                  if (
                    ['exe', 'file-app', 'shortcut'].includes(t.kind) &&
                    !window.confirm(tr('啟動「{0}」？', t.label))
                  )
                    return
                  void run({ action: 'runTarget', rowId: row.rowId, templateId: t.id })
                }}
              >
                {t.id === 'default-launch-game' ? tr(t.label) : t.label}
              </Button>
            ))}
          {!gameActionTemplates(project).length && (
            <small className="muted">{tr('尚未設定操作按鈕')}</small>
          )}
          <Tooltip label={tr('自訂操作與目標')}>
            <ActionIcon
              aria-label={tr('自訂遊戲操作')}
              variant="subtle"
              onClick={() => configure('game')}
            >
              <Icon name="sliders" />
            </ActionIcon>
          </Tooltip>
        </Group>
        {gameActionTemplates(project).some((t) => t.id === 'default-launch-game') &&
          !row.record?.details?.targets?.['default-launch-game'] && (
            <small className="muted game-launch-hint">
              {tr('尚未指定啟動檔，「啟動遊戲」按鈕暫時無法使用。')}{' '}
              <Button size="compact-xs" variant="subtle" onClick={() => configure('game')}>
                {tr('前往設定指定啟動檔')}
              </Button>
            </small>
          )}
        {importSource && (
          <Text size="xs" c="dimmed" className="import-source">
            {tr('資料來源：')}
            <Tooltip label={importSource.url} multiline maw={320} withArrow>
              <span>{importSource.name}</span>
            </Tooltip>
          </Text>
        )}
        <table className="attribute-table game-fields">
          <colgroup>
            <col style={{ width: gameWidths[0] }} />
            <col />
            <col style={{ width: gameWidths[1] }} />
          </colgroup>
          <thead>
            <tr>
              <th>
                {tr('欄位')}
                {gameResizer(0, tr('欄位'))}
              </th>
              <th>
                {tr('內容')}
                {gameResizer(1, tr('來源'))}
              </th>
              <th>{tr('來源')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{tr('資料夾名稱')}</td>
              <td>{row.name}</td>
              <td>{tr('檔案系統')}</td>
            </tr>
            <tr>
              <td>{tr('目前路徑')}</td>
              <td>{row.path}</td>
              <td>{tr('檔案系統')}</td>
            </tr>
            {fields.map((f) => {
              const value = fieldValue(row, f.attributeId),
                attribute =
                  row.record?.projectOverrides[row.projectId]?.find(
                    (a) => a.attributeId === f.attributeId
                  ) ?? row.record?.attributes.find((a) => a.attributeId === f.attributeId)
              const alias = project.fieldBindings.find(
                  (b) => b.attributeId === f.attributeId
                )?.alias,
                plain = importedLabels[f.key]
              return (
                <tr key={f.attributeId}>
                  <td title={!alias && plain ? f.key : undefined}>{alias ?? plain ?? f.key}</td>
                  <td>
                    {value == null
                      ? '—'
                      : Array.isArray(value)
                        ? value.join(', ')
                        : typeof value === 'object'
                          ? JSON.stringify(value)
                          : String(value)}
                  </td>
                  <td title={isUrl(attribute?.source) ? attribute?.source : undefined}>
                    {describeSource(attribute?.source, importSource)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }
  return (
    <div className="media-content">
      {galleryFile && (
        <MediaViewer
          row={row}
          project={project}
          file={galleryFile}
          entries={visibleEntries}
          loading={!!content.nextCursor}
          run={run}
          act={act}
          busy={busy}
          manga={kind === 'book' || row.record?.details?.reading?.mode === 'manga'}
          close={() => setGalleryFile(undefined)}
        />
      )}
      {documentFile && (
        <DocumentViewer
          rowId={row.rowId}
          file={documentFile}
          close={() => setDocumentFile(undefined)}
        />
      )}
      <Group gap="xs">
        {content.entries
          .filter((entry) => ['archive', 'pdf'].includes(entry.kind))
          .map((entry) => (
            <Button key={entry.id} variant="light" onClick={() => setDocumentFile(entry)}>
              <Icon name="file" />
              {entry.name}
            </Button>
          ))}
      </Group>
      {error && (
        <p role="alert" className="media-content-error">
          {tr('部分內容讀取未完成，已載入的圖片仍可查看。')}
          {error}
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() => setReload((value) => value + 1)}
          >
            {tr('重新載入')}
          </Button>
        </p>
      )}
      <FolderHeader
        row={row}
        project={project}
        openFolder={() => void act({ action: 'open', rowId: row.rowId })}
        folders={content.entries.filter((e) => e.kind === 'folder')}
        childNames={childNames}
        busy={busy}
        onChild={onChild}
      />
      <div className="media-info-template">
        {kind === 'book' && first && (
          <img
            className="manga-cover"
            src={first.thumb ?? first.url}
            onError={(e) => {
              if (e.currentTarget.src !== first.url) e.currentTarget.src = first.url
              else e.currentTarget.style.display = 'none'
            }}
            alt={first.name}
          />
        )}
        {/* The default template (name and path) repeats the panel header and folder details, so only a user-edited one is shown. */}
        {project.contentCells?.[kind]?.length ? (
          <Card
            project={{
              ...project,
              folderLayouts: undefined,
              cells: contentCells(project, kind),
            }}
            row={row}
            open={() => {
              void window.media.request({ action: 'open', rowId: row.rowId })
            }}
          />
        ) : null}
      </div>
      {
        <Gallery
          entries={content.entries}
          loading={!!content.nextCursor && !error}
          manga={kind === 'book'}
          prefs={row.record?.details?.reading}
          onReader={setReader}
          suspended={!!galleryFile}
          onOpen={(entry) => setGalleryFile(entry)}
          save={(prefs) => {
            if (row.record && !row.readonly && !row.stopped && !row.error)
              void run({
                action: 'reading',
                rowId: row.rowId,
                revision: row.record.revision,
                prefs,
              })
          }}
        />
      }
    </div>
  )
}
