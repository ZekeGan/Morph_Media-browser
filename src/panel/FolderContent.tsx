import { MediaBrowser } from '../media/MediaBrowser'
import { BookShelf, FilePage } from './FilePage'
import { MediaViewer } from '../media/MediaViewer'
import { isGameFolder, visibleFile } from '../../shared/media'
import { effectiveKind, sampleOf } from '../../shared/kind'
import { importedFieldLabels } from '../editor/importedFieldLabels'
import { isUrl, siteName } from '../metadata/importSource'
import { PanelSkeleton } from './PanelSkeleton'
import { useFileVisibility } from '../files/useFileVisibility'
import { DocumentViewer } from '../documents/DocumentViewer'
import '../game/game-actions.css'
import { cacheFolderStats } from '../browse/folderStats'
import { GameExtraButtons } from '../game/GameExtras'
import { t as tr, useLocale } from '../i18n'
import { yesNo } from '../editor/fieldTypes'
import { Icon } from '../common/icons'
import { useRefreshNonce } from '../browse/refresh'
import { Fragment, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { isFilled } from '../../shared/cells'
import { fieldSourceGroups, rowFieldAttributes } from '../editor/fieldSources'
import { ActionIcon, Button, Group, Menu, Tooltip } from '@mantine/core'
import { Card } from '../cells/Card'
import { FolderDetails, FolderHeader } from './FolderParts'
import { Gallery } from '../gallery/Gallery'
import {
  contentCells,
  gameActionTemplates,
  type ContentResult,
  type ExplorerRequest,
  type ExplorerResponse,
  type MediaPrefs,
} from '../../shared/explorer'
import {
  fieldValue,
  type FolderRow,
  type Project,
  type Request,
  type Response,
} from '../../shared/model'
const Reader = lazy(() => import('../reader/Reader').then((module) => ({ default: module.Reader })))
const VideoViewer = lazy(() =>
  import('../video/VideoViewer').then((m) => ({ default: m.VideoViewer }))
)
// Imported rows name the website; other rows say where they come from.
const describeSource = (source?: string) =>
  !source
    ? tr('未設定')
    : isUrl(source)
      ? siteName(source)
      : source === 'manual'
        ? tr('手動')
        : source

// The last folders' listings, so opening the panel on a folder seen a moment ago shows it at once while a fresh
// listing loads behind it.
const contentCache = new Map<string, ContentResult>()
const rememberContent = (rowId: string, value: ContentResult) => {
  contentCache.delete(rowId)
  contentCache.set(rowId, value)
  if (contentCache.size > 24) contentCache.delete(contentCache.keys().next().value!)
}

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
  nextBook,
  autoRead,
  onAutoRead,
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
  // R-255: the next folder in the browse list, and whether this folder was opened as that next book.
  nextBook?: { name: string; open: (keepImmersive: boolean) => void }
  // 'immersive' when the previous book was read in immersive mode, which carries over (R-275).
  autoRead?: 'normal' | 'immersive'
  onAutoRead?: () => void
}) {
  useLocale()
  const { visibility } = useFileVisibility()
  const contentRow = useRef(row.rowId)
  const [galleryFile, setGalleryFile] = useState<ContentResult['entries'][number]>(),
    [galleryImmersive, setGalleryImmersive] = useState(false)
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

  const [content, setContent] = useState<ContentResult | undefined>(() =>
      contentCache.get(row.rowId)
    ),
    [error, setError] = useState(''),
    [reload, setReload] = useState(0),
    refresh = useRefreshNonce(),
    [, setReader] = useState(false),
    [fileReader, setFileReader] = useState(false),
    [documentFile, setDocumentFile] = useState<ContentResult['entries'][number]>()
  // R-282: after the last page of a text book, the next text book in this folder.
  const nextText = (file: ContentResult['entries'][number]) => {
    const books = (content?.entries ?? []).filter((entry) => entry.kind === 'text'),
      following = books[books.findIndex((entry) => entry.id === file.id) + 1]
    return following && following.id !== file.id
      ? { name: following.name, open: () => setDocumentFile(following) }
      : undefined
  }
  useEffect(() => {
    let alive = true
    if (contentRow.current !== row.rowId) {
      setContent(contentCache.get(row.rowId))
      contentRow.current = row.rowId
    }
    setError('')
    const paged = !isGameFolder(row)
    void (async () => {
      let cursor: string | undefined
      const counted: ContentResult['entries'] = []
      let accumulated: ContentResult | undefined
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
        accumulated =
          append && accumulated
            ? {
                ...chunk,
                entries: [...accumulated.entries, ...chunk.entries],
                notices: [...accumulated.notices, ...chunk.notices],
              }
            : chunk
        setContent(accumulated)
        counted.push(...chunk.entries)
        cursor = chunk.nextCursor
        if (!cursor) {
          cacheFolderStats(row.rowId, counted)
          if (accumulated) rememberContent(row.rowId, accumulated)
        }
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
  // Opened as the next book: go straight to reading from its first image. Remembered from the first render, since
  // the workspace drops the request as soon as the panel has switched.
  const readFirst = useRef(autoRead)
  useEffect(() => {
    if (!readFirst.current || !content) return
    const first = content.entries.find(
      (entry) => entry.kind === 'image' && visibleFile(entry, visibility)
    )
    const immersive = readFirst.current === 'immersive'
    readFirst.current = undefined
    if (first) {
      setGalleryImmersive(immersive)
      setGalleryFile(first)
    } else if (immersive && document.fullscreenElement)
      void document.exitFullscreen().catch(() => {})
    onAutoRead?.()
  }, [content])
  if (error && !content)
    return (
      <p role="alert" className="media-content-error">
        {error}
        <Button size="compact-xs" variant="subtle" onClick={() => setReload((value) => value + 1)}>
          {tr('重新載入')}
        </Button>
      </p>
    )
  if (!content) return <PanelSkeleton />
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
      <FilePage
        row={row}
        file={selectedFile}
        openFolder={() => void act({ action: 'open', rowId: row.rowId })}
        open={
          ['pdf', 'archive', 'text'].includes(selectedFile.kind)
            ? () => setDocumentFile(selectedFile)
            : selectedFile.kind === 'image'
              ? () => setFileReader(true)
              : undefined
        }
      >
        {documentFile && (
          <DocumentViewer
            rowId={row.rowId}
            file={documentFile}
            close={() => setDocumentFile(undefined)}
            row={row}
            run={run}
            next={nextText(documentFile)}
          />
        )}
        {selectedFile.kind === 'image' && fileReader && (
          <Suspense fallback={<PanelSkeleton />}>
            <Reader
              images={content.entries.filter((entry) => entry.kind === 'image')}
              start={content.entries
                .filter((entry) => entry.kind === 'image')
                .findIndex((entry) => entry.id === selectedFile.id)}
              manga={kind === 'book'}
              // R-322: an image picked by hand opens at that image, never at the book's saved page.
              resume={false}
              prefs={row.record?.details?.reading}
              close={() => setFileReader(false)}
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
          </Suspense>
        )}
      </FilePage>
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
    first = content.entries.find((e) => e.kind === 'image'),
    // R-362: only an edited book template from before the cover became a component still has it drawn beside it.
    legacyCover =
      kind === 'book' && project.contentCells?.book !== undefined && !project.contentCover
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
                    !window.confirm(tr('啟動「{0}」？', tr(t.label)))
                  )
                    return
                  void run({ action: 'runTarget', rowId: row.rowId, templateId: t.id })
                }}
              >
                {tr(t.label)}
              </Button>
            ))}
          <GameExtraButtons row={row} busy={busy} run={run} />
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
            {fieldSourceGroups(
              fields.filter((f) => isFilled(fieldValue(row, f.attributeId))),
              rowFieldAttributes([row])
            ).map(({ source, fields }) => (
              <Fragment key={source}>
                <tr className="field-source-heading">
                  <th colSpan={3}>{source}</th>
                </tr>
                {fields.map((f) => {
                  const value = fieldValue(row, f.attributeId),
                    attribute =
                      row.record?.projectOverrides[row.projectId]?.find(
                        (a) => a.attributeId === f.attributeId
                      ) ?? row.record?.attributes.find((a) => a.attributeId === f.attributeId)
                  const binding = project.fieldBindings.find(
                      (b) => b.attributeId === f.attributeId
                    ),
                    alias = binding?.alias,
                    plain = importedLabels[f.key]
                  return (
                    <tr key={f.attributeId}>
                      <td title={!alias && plain ? f.key : undefined}>{alias ?? plain ?? f.key}</td>
                      <td>
                        {value == null
                          ? '—'
                          : Array.isArray(value)
                            ? value.join(', ')
                            : typeof value === 'boolean'
                              ? yesNo(value, binding)
                              : typeof value === 'object'
                                ? JSON.stringify(value)
                                : String(value)}
                      </td>
                      <td title={isUrl(attribute?.source) ? attribute?.source : undefined}>
                        {describeSource(attribute?.source)}
                      </td>
                    </tr>
                  )
                })}
              </Fragment>
            ))}
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
          close={() => {
            setGalleryFile(undefined)
            setGalleryImmersive(false)
          }}
          nextBook={nextBook}
          startImmersive={galleryImmersive}
        />
      )}
      {documentFile && (
        <DocumentViewer
          rowId={row.rowId}
          file={documentFile}
          close={() => setDocumentFile(undefined)}
          row={row}
          run={run}
          next={nextText(documentFile)}
        />
      )}
      <BookShelf
        row={row}
        entries={content.entries.filter((entry) => ['archive', 'pdf', 'text'].includes(entry.kind))}
        open={setDocumentFile}
      />
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
        {legacyCover && first && (
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
        {/* The default template (name and path) repeats the panel header and folder details, so only a user-edited one is
            shown; a book always shows its template, which starts with the cover (R-362). */}
        {kind === 'book' || project.contentCells?.[kind]?.length ? (
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
      {/* R-338: a folder of books only has no picture list to show. */}
      {(content.entries.some((entry) => entry.kind === 'image') ||
        !content.entries.some((entry) => ['archive', 'pdf', 'text'].includes(entry.kind))) && (
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
      )}
    </div>
  )
}
