import './media-workspace.css'
import type { OverviewEntry } from '../shared/explorer'
import { t as tr } from './i18n'
import { Icon } from './icons'
import { RightPanel } from './RightPanel'
import { lazy, Suspense } from 'react'
import { ActionIcon, Button, Tooltip } from '@mantine/core'
import { pathKey } from '../shared/browse'
import { type FolderRow, type Project, type Request, type Response } from '../shared/model'
import type { BrowseState, ExplorerRequest, ExplorerResponse } from '../shared/explorer'
const FolderContent = lazy(() =>
  import('./FolderContent').then((m) => ({ default: m.FolderContent }))
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
  edit: (category?: string) => void
  expanded: boolean
  filePreview?: OverviewEntry
  folderMode: boolean
  moveWidth: (event: React.PointerEvent) => void
  navHistory: (delta: number) => void
  persist: (next: BrowseState) => void
  // Passed in on purpose: a bare `open` would silently resolve to window.open.
  open: (id: string, fromHistory?: number) => Promise<void>
  openConfig: (id: string, tab?: string) => void
  panelBody: React.RefObject<HTMLDivElement>
  panelOpen: boolean
  panelSlot: React.RefObject<HTMLDivElement>
  project: Project
  ready: boolean
  resize: { current?: { id: string; start: number; width: number } }
  run: (request: ExplorerRequest) => Promise<ExplorerResponse | undefined>
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>
  settingsBody: React.ReactNode
  stopWidth: () => void
  togglePanel: () => void
  history: { items: string[]; index: number }
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
          className={project.mediaCategory === 'video' ? 'video-panel' : ''}
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
              {project.mediaCategory !== 'video' && <strong>{detail.name}</strong>}

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
              <Tooltip label={tr('資料夾設定')}>
                <ActionIcon
                  aria-label={tr('資料夾設定')}
                  variant="subtle"
                  onClick={() => openConfig(detail.rowId)}
                >
                  <Icon name="settings" />
                </ActionIcon>
              </Tooltip>
              {project.mediaCategory === 'manga' && (
                <Tooltip label={tr('編輯此專案所有漫畫的資訊版面；CARD 版面獨立')}>
                  <ActionIcon
                    aria-label={tr('編輯漫畫展示')}
                    variant="subtle"
                    color="gray"
                    disabled={busy}
                    onClick={() => edit('manga')}
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
                {config ? ' · ' + config.name : ''}
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
          {config ? (
            <div
              className="folder-panel-dock-settings"
              role="region"
              aria-label={tr('資料夾設定 · ') + config.name}
            >
              {settingsBody}
            </div>
          ) : (
            <Suspense fallback={<p>{tr('載入內容…')}</p>}>
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
