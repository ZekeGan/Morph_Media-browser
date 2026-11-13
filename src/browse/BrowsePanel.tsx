import '../media/media-workspace.css'
import { KindIcon } from './folderKind'
import { useFolderSample } from './folderStats'
import type { OverviewEntry } from '../../shared/explorer'
import { t as tr } from '../i18n'
import { Icon } from '../common/icons'
import { RightPanel } from '../panel/RightPanel'
import { lazy, Suspense } from 'react'
import { ActionIcon, Alert, Button, Group, Text, Tooltip } from '@mantine/core'
import { pathKey } from '../../shared/browse'
import { effectiveKind } from '../../shared/kind'
import { PanelSkeleton } from '../panel/PanelSkeleton'
import { type FolderRow, type Project, type Request, type Response } from '../../shared/model'
import type { BrowseState, ExplorerRequest, ExplorerResponse } from '../../shared/explorer'
const FolderContent = lazy(() =>
  import('../panel/FolderContent').then((m) => ({ default: m.FolderContent }))
)

type Props = {
  act: (request: Request) => Promise<Response | undefined>
  all: FolderRow[]
  browse: BrowseState
  busy: boolean
  canReturnTop: boolean
  child: (name: string) => void
  closeConfig: () => void
  config?: FolderRow
  detail?: FolderRow
  edit: (category?: string, preset?: string) => void
  expanded: boolean
  filePreview?: OverviewEntry
  folderMode: boolean
  moveWidth: (event: React.PointerEvent) => void
  navHistory: (delta: number) => void
  persist: (next: BrowseState) => void
  // Passed in on purpose: a bare `open` would silently resolve to window.open.
  open: (id: string, fromHistory?: number) => Promise<void>
  openConfig: (id: string, tab?: string) => void
  panelBody: React.RefObject<HTMLDivElement | null>
  panelOpen: boolean
  panelSlot: React.RefObject<HTMLDivElement | null>
  project: Project
  ready: boolean
  resize: { current?: { id: string; start: number; width: number } }
  run: (request: ExplorerRequest) => Promise<ExplorerResponse | undefined>
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>
  settingsBody: React.ReactNode
  stopWidth: () => void
  togglePanel: () => void
  history: { items: string[]; index: number }
  canEnter: boolean
  switchTo?: FolderRow
  switchDiscard: () => void
  switchStay: () => void
  // R-255: the folder after the shown one in the browse list, and the folder to open straight into reading.
  nextBook?: { name: string; open: (keepImmersive: boolean) => void }
  readNext?: { id: string; immersive: boolean }
  readNextDone: () => void
}

// The right-hand content panel: folder content or settings tabs, with its resizer and footer.
export function BrowsePanel(props: Props) {
  const {
    act,
    all,
    browse,
    busy,
    canReturnTop,
    child,
    closeConfig,
    config,
    detail,
    edit,
    expanded,
    filePreview,
    folderMode,
    moveWidth,
    navHistory,
    persist,
    open,
    openConfig,
    panelBody,
    panelOpen,
    panelSlot,
    project,
    ready,
    resize,
    run,
    setExpanded,
    settingsBody,
    stopWidth,
    togglePanel,
    history,
  } = props
  const { canEnter, switchTo, switchDiscard, switchStay, nextBook, readNext, readNextDone } = props
  // R-327: what the folder contains counts too (once its content was read), so a manga folder found by its pictures
  // gets its layout button like one marked by hand.
  const sample = useFolderSample(detail?.rowId)
  const kind = detail ? effectiveKind(detail, sample) : 'general'
  return (
    <div
      ref={panelSlot}
      className="content-panel-slot"
      data-open={panelOpen}
      data-resizing={resize.current?.id === 'panel'}
      aria-hidden={!panelOpen}
      style={{ '--panel-width': browse.panelWidth + 'px' } as React.CSSProperties}
    >
      {detail && panelOpen && (
        <RightPanel
          className={kind === 'media' ? 'video-panel' : ''}
          label={tr('資料夾內容')}
          resizerLabel={tr('調整資料夾內容寬度')}
          width={browse.panelWidth}
          onResizeStart={(e) => {
            resize.current = { id: 'panel', start: e.clientX, width: browse.panelWidth }
            e.currentTarget.setPointerCapture(e.pointerId)
          }}
          onResizeMove={moveWidth}
          onResizeEnd={stopWidth}
          bodyRef={panelBody}
          header={
            <>
              <Tooltip label={tr('返回上一個瀏覽位置')}>
                <ActionIcon
                  className="panel-history"
                  aria-label={tr('返回')}
                  disabled={!ready || busy || !history.index}
                  variant="subtle"
                  onClick={() => navHistory(-1)}
                >
                  <Icon name="arrow-left" />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={tr('前進至下一個瀏覽位置')}>
                <ActionIcon
                  className="panel-history"
                  aria-label={tr('前進')}
                  disabled={!ready || busy || history.index >= history.items.length - 1}
                  variant="subtle"
                  onClick={() => navHistory(1)}
                >
                  <Icon name="arrow-right" />
                </ActionIcon>
              </Tooltip>
              {kind !== 'media' && (
                <strong className="browse-panel-name">
                  <KindIcon row={detail} size={16} />
                  {detail.name}
                </strong>
              )}

              <Tooltip label={tr('在檔案總管開啟')}>
                <ActionIcon
                  aria-label={tr('在檔案總管開啟資料夾 {0}', detail.name)}
                  variant="subtle"
                  disabled={busy}
                  onClick={() => void act({ action: 'open', rowId: detail.rowId })}
                >
                  <Icon name="folder-go" />
                </ActionIcon>
              </Tooltip>
              {canEnter && (
                <Button
                  size="compact-xs"
                  variant="light"
                  disabled={busy}
                  leftSection={<Icon name="arrow-right" size={14} />}
                  onClick={() => void open(detail.rowId)}
                >
                  {tr('進入此資料夾')}
                </Button>
              )}
              {kind === 'book' && (
                <Tooltip label={tr('編輯此專案所有漫畫的資訊版面；卡片外觀另外設定')}>
                  <ActionIcon
                    aria-label={tr('編輯漫畫展示')}
                    variant="subtle"
                    color="gray"
                    disabled={busy}
                    onClick={() => edit('book')}
                  >
                    <Icon name="layout" />
                  </ActionIcon>
                </Tooltip>
              )}
              <ActionIcon
                aria-label={expanded ? tr('還原內容區') : tr('放大內容區')}
                variant="subtle"
                color="gray"
                onClick={() => setExpanded((v) => !v)}
              >
                <Icon name="maximize" />
              </ActionIcon>
              <ActionIcon
                aria-label={tr('關閉資料夾內容')}
                variant="subtle"
                color="gray"
                onClick={togglePanel}
              >
                <Icon name="close" />
              </ActionIcon>
            </>
          }
          tabs={
            <div className="folder-panel-dock-tabs" role="tablist" aria-label={tr('右側面板分頁')}>
              <Button
                size="compact-sm"
                variant={config ? 'subtle' : 'light'}
                role="tab"
                aria-selected={!config}
                onClick={closeConfig}
              >
                {tr('內容')}
              </Button>
              <Button
                size="compact-sm"
                variant={config ? 'light' : 'subtle'}
                role="tab"
                aria-selected={!!config}
                disabled={busy}
                onClick={() => !config && openConfig(detail.rowId)}
              >
                {tr('設定')}
              </Button>
              <span className="folder-panel-dock-spacer" />
              {config && (
                <Tooltip label={tr('關閉資料夾設定')}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={tr('關閉資料夾設定')}
                    onClick={closeConfig}
                  >
                    <Icon name="close" size={16} />
                  </ActionIcon>
                </Tooltip>
              )}
            </div>
          }
          footer={
            <>
              {canReturnTop && (
                <Button
                  className="manga-top"
                  size="compact-sm"
                  variant="default"
                  aria-label={tr('返回頂部')}
                  onClick={() =>
                    panelBody.current?.scrollTo({
                      top: 0,
                      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                        ? 'instant'
                        : 'smooth',
                    })
                  }
                >
                  <Icon name="arrow-up" size={15} />
                  {tr('返回頂部')}
                </Button>
              )}
            </>
          }
        >
          {switchTo && config && (
            <Alert color="orange" className="panel-switch-alert" role="alert">
              <Text size="sm">
                {tr('「{0}」的設定有未保存的變更。要切換到「{1}」嗎？', config.name, switchTo.name)}
              </Text>
              <Group gap="xs" mt="xs">
                <Button size="compact-xs" color="orange" onClick={switchDiscard}>
                  {tr('放棄變更並切換')}
                </Button>
                <Button size="compact-xs" variant="default" onClick={switchStay}>
                  {tr('留在此處')}
                </Button>
              </Group>
            </Alert>
          )}
          {config ? (
            <div
              className="folder-panel-dock-settings"
              role="region"
              aria-label={tr('資料夾設定 · ') + config.name}
            >
              {settingsBody}
            </div>
          ) : (
            <Suspense fallback={<PanelSkeleton />}>
              {panelOpen && (folderMode || filePreview) ? (
                <FolderContent
                  key={detail.rowId + '/' + (filePreview?.id ?? 'folder')}
                  selectedFileId={folderMode ? undefined : filePreview?.id}
                  row={detail}
                  project={project}
                  run={run}
                  act={act}
                  busy={busy}
                  configure={(tab) => openConfig(detail.rowId, tab)}
                  onChild={child}
                  mediaPrefs={browse.media}
                  onMediaPrefs={(media) => persist({ ...browse, media })}
                  sourceRows={all}
                  onSource={(id) => void open(id)}
                  nextBook={nextBook}
                  autoRead={
                    readNext?.id === detail.rowId
                      ? readNext.immersive
                        ? 'immersive'
                        : 'normal'
                      : undefined
                  }
                  onAutoRead={readNextDone}
                  childNames={all
                    .filter(
                      (row) =>
                        row.record &&
                        !row.error &&
                        !row.readonly &&
                        !row.stopped &&
                        pathKey(row.path).replace(/\/[^/]+$/, '') === pathKey(detail.path)
                    )
                    .map((row) => row.name)}
                />
              ) : panelOpen ? (
                <p>{tr('選擇檔案以預覽')}</p>
              ) : null}
            </Suspense>
          )}
        </RightPanel>
      )}
    </div>
  )
}
