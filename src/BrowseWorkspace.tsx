import './media-workspace.css'
import { isGameFolder } from '../shared/media'
import { FileOverview } from './FileOverview'
import type { OverviewEntry } from '../shared/explorer'
import type { FolderNavigation } from '../shared/workspace'
import { t as tr, useLocale, currentLocale } from './i18n'
import { Icon } from './icons'
import { BoundaryFlag } from './BoundaryFlag'
import { BrowseToolbar } from './BrowseToolbar'
import { BrowsePanel } from './BrowsePanel'
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { ActionIcon, Breadcrumbs, Pagination, Tooltip } from '@mantine/core'
import { Card } from './Card'
import { KindBatchBar } from './KindBatchBar'
import { cardPresets } from '../shared/layouts'
import {
  browserRows,
  cardDisplay,
  folderBreadcrumbs,
  maxBrowseDepth,
  pathKey,
} from '../shared/browse'
import {
  fieldValue,
  type FolderRow,
  type Project,
  type Request,
  type Response,
} from '../shared/model'
import type { BrowseMode, BrowseState, ExplorerRequest, ExplorerResponse } from '../shared/explorer'
const FolderPanel = lazy(() => import('./FolderPanel').then((m) => ({ default: m.FolderPanel })))
const Tree = lazy(() => import('./TreeView'))
const initial: BrowseState = {
  mode: 'CARD',
  location: '',
  widths: { name: 200, path: 320, depth: 90 },
  panelWidth: 420,
  panelVisible: true,
}
type Act = (r: Request) => Promise<Response | undefined>
type Run = (r: ExplorerRequest) => Promise<ExplorerResponse | undefined>
interface Props {
  toolbarTarget: HTMLDivElement | null
  project: Project
  root: string
  rows: FolderRow[]
  structure: FolderRow[]
  busy: boolean
  selected?: string
  onSelect: (id: string) => boolean
  onClose: () => void
  act: Act
  run: Run
  onDirty: (v: boolean) => void
  edit: (category?: string) => void
  notify: (message: string) => void
  onOverlay: (v: boolean) => void
}
export function BrowseWorkspace({
  toolbarTarget,
  project,
  root,
  rows,
  structure,
  busy,
  selected,
  onSelect,
  act,
  run,
  onDirty,
  edit,
  notify,
  onOverlay,
}: Props) {
  const locale = useLocale()

  const [browse, setBrowse] = useState(initial),
    [ready, setReady] = useState(false),
    [page, setPage] = useState(1)
  const [sort, setSort] = useState({ field: 'name', asc: true }),
    [highlight, setHighlight] = useState<string>(),
    [marked, setMarked] = useState<string[]>([]),
    [configId, setConfigId] = useState<string>(),
    [configDirty, setConfigDirty] = useState(false),
    [expanded, setExpanded] = useState(false)
  const [filePreview, setFilePreview] = useState<OverviewEntry>()
  const markAnchor = useRef<string>(undefined)
  const panelSlot = useRef<HTMLDivElement>(null),
    panelToggle = useRef<HTMLButtonElement>(null)
  const panelBody = useRef<HTMLDivElement>(null),
    [canReturnTop, setCanReturnTop] = useState(false)
  const navigation = useRef(0),
    mounted = useRef(false)
  const workspaceRoot = useRef<HTMLDivElement>(null),
    sideNavigation = useRef<(event: FolderNavigation) => void>(() => {})
  useEffect(() => window.desktop.onFolderNavigation((event) => sideNavigation.current(event)), [])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      navigation.current++
    }
  }, [])
  const [overviewTools, setOverviewTools] = useState<HTMLDivElement | null>(null),
    [columnQuery, setColumnQuery] = useState(''),
    [configTab, setConfigTab] = useState('fields')
  const [display, setDisplay] = useState(cardDisplay(project)),
    [density, setDensity] = useState<{ itemsPerRow: number | string; pageSize: number | string }>(
      project.list
    )
  const [cardPending, setCardPending] = useState(false),
    [cardSaveError, setCardSaveError] = useState('')
  const cardEdit = useRef(0),
    cardSaving = useRef(false),
    projectLive = useRef(project)
  projectLive.current = project
  const validDensity =
    typeof density.itemsPerRow === 'number' &&
    Number.isInteger(density.itemsPerRow) &&
    density.itemsPerRow >= 1 &&
    density.itemsPerRow <= 6 &&
    typeof density.pageSize === 'number' &&
    Number.isInteger(density.pageSize) &&
    density.pageSize >= 1 &&
    density.pageSize <= 500
  const liveList = validDensity
    ? { itemsPerRow: Number(density.itemsPerRow), pageSize: Number(density.pageSize) }
    : project.list
  const changedCard = () => {
    cardEdit.current++
    setCardPending(true)
    setCardSaveError('')
  }
  const [dragColumn, setDragColumn] = useState(''),
    [columnDrop, setColumnDrop] = useState<{ id: string; after: boolean }>()
  const histories = useRef<Partial<Record<BrowseMode, { items: string[]; index: number }>>>({}),
    [, renderHistory] = useState(0)
  const scroll = useRef<HTMLDivElement>(null),
    state = useRef(browse),
    resize = useRef<{ id: string; start: number; width: number } | undefined>(undefined),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const all = structure.length ? structure : rows,
    rootRow = all.find((r) => pathKey(r.path) === pathKey(root)),
    detail = all.find((r) => r.rowId === selected),
    config = all.find((r) => r.rowId === configId),
    card = display
  state.current = browse
  useEffect(() => {
    let alive = true
    window.desktop
      .workspace()
      .then((r) => {
        if (!alive) return
        const saved = r.prefs.browse?.[project.projectId] ?? initial,
          target = all.find((r) => r.rowId === (selected ?? saved.detailId)) ?? rootRow,
          next = {
            ...saved,
            location:
              target && pathKey(target.path) !== pathKey(root) ? target.path : saved.location || '',
            locations: undefined,
            detailId: target?.rowId,
            panelVisible: saved.panelVisible ?? true,
          }
        setBrowse(next)
        state.current = next
        const history = { items: [next.location], index: 0 }
        histories.current = { CARD: history, TABLE: history, TREE: history }
        setHighlight(target?.rowId)
        setReady(true)
        if (target?.record) onSelect(target.rowId)
      })
      .catch((e) => {
        notify(String(e))
        setReady(true)
      })
    return () => {
      alive = false
      clearTimeout(timer.current)
    }
  }, [project.projectId])
  const persist = (next: BrowseState) => {
    state.current = next
    setBrowse(next)
    if (ready)
      void window.desktop
        .updateWorkspace({ action: 'browse', projectId: project.projectId, value: next })
        .catch((e) => notify(String(e)))
  }
  // The game folder filter is a saved choice, not session state.
  const boundariesOnly = browse.gameFilter === 'boundaries'
  const setBoundariesOnly = (only: boolean) =>
    persist({ ...state.current, gameFilter: only ? 'boundaries' : 'all' })
  const reportDirty = useCallback(
    (value: boolean) => {
      setConfigDirty(value)
      onDirty(value)
    },
    [onDirty]
  )
  useEffect(() => {
    onOverlay(!!configId)
    return () => onOverlay(false)
  }, [configId, onOverlay])
  useEffect(() => {
    setPage(1)
  }, [browse.location, browse.mode, project.cardView, project.list.pageSize])
  useEffect(() => {
    if (ready) scroll.current?.scrollTo(0, browse.scrolls?.[browse.mode] ?? 0)
  }, [browse.mode, ready])
  useEffect(() => {
    if (ready && selected && selected !== state.current.detailId && !busy) void open(selected)
  }, [selected, ready, busy])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !e.defaultPrevented &&
        !document.querySelector('.reader,.mantine-Drawer-content,.mantine-Modal-content') &&
        expanded
      ) {
        e.preventDefault()
        setExpanded(false)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [expanded])
  const location =
    browse.location && all.some((r) => pathKey(r.path) === pathKey(browse.location))
      ? browse.location
      : ''
  const currentFolder = all.find((r) => pathKey(r.path) === pathKey(location || root))
  const base = useMemo(
    () =>
      browserRows(
        all,
        { ...project, cardView: display, list: liveList },
        root,
        browse.mode,
        location
      ).filter((row) => !boundariesOnly || browse.mode === 'TREE' || isGameFolder(row)),
    [all, project, root, browse.mode, location, display, density, boundariesOnly]
  )
  const filtered = useMemo(
    () =>
      [...base].sort((a, b) => {
        const get = (r: FolderRow) =>
          sort.field === 'name'
            ? r.name
            : sort.field === 'path'
              ? r.path
              : sort.field === 'depth'
                ? r.depth
                : fieldValue(r, sort.field)
        const av = get(a),
          bv = get(b)
        if (av == null || bv == null)
          return av == null ? (bv == null ? a.rowId.localeCompare(b.rowId) : 1) : -1
        return (
          (typeof av === 'number' && typeof bv === 'number'
            ? av - bv
            : String(av).localeCompare(String(bv), currentLocale(), { numeric: true })) *
            (sort.asc ? 1 : -1) || a.rowId.localeCompare(b.rowId)
        )
      }),
    [base, sort, locale]
  )
  const pageSize = browse.mode === 'CARD' ? liveList.pageSize : 100,
    pages = Math.max(1, Math.ceil(filtered.length / pageSize)),
    current = filtered.slice(
      (Math.min(page, pages) - 1) * pageSize,
      Math.min(page, pages) * pageSize
    )
  useEffect(() => {
    if (browse.mode !== 'CARD' || !ready || card.mode !== 'multi' || !selected) return
    const index = filtered.findIndex((r) => r.rowId === selected)
    if (index < 0) return
    setPage(Math.floor(index / pageSize) + 1)
    const frame = requestAnimationFrame(() =>
      scroll.current
        ?.querySelector<HTMLElement>('[data-row-id="' + selected + '"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    )
    return () => cancelAnimationFrame(frame)
  }, [browse.mode, browse.location, ready, selected, filtered, pageSize, card.mode])
  const navigable = true,
    history = histories.current[browse.mode] ?? { items: [location], index: 0 }
  const moveTo = (target: string) => {
    const mode = state.current.mode,
      h = histories.current[mode] ?? { items: [state.current.location], index: 0 }
    if (pathKey(target || root) !== pathKey(state.current.location || root)) {
      const items = [...h.items.slice(0, h.index + 1), target].slice(-100)
      const next = { items, index: items.length - 1 }
      histories.current = { CARD: next, TABLE: next, TREE: next }
      renderHistory((v) => v + 1)
    }
    persist({
      ...state.current,
      location: target,
      locations: undefined,
    })
  }
  // Entering a folder: the center moves there and the panel follows. Whether the panel is open stays the user's call.
  const open = async (id: string, fromHistory?: number) => {
    // A single click already started showing this folder in the panel; let that finish instead of dropping the double click.
    const pending = previewing.current
    if (pending) await pending
    const row = all.find((r) => r.rowId === id)
    if (!row || (busy && !pending) || draftBlocks(id, true)) return
    const operation = ++navigation.current
    const result = await run({ action: 'visit', rowId: id })
    if (!mounted.current || operation !== navigation.current || !result?.snapshot || !onSelect(id))
      return
    setFilePreview(undefined)
    setHighlight(id)
    persist({
      ...state.current,
      detailId: id,
    })
    if (navigable) {
      if (fromHistory !== undefined) {
        const next = { ...history, index: fromHistory }
        histories.current = { CARD: next, TABLE: next, TREE: next }
        renderHistory((v) => v + 1)
        persist({
          ...state.current,
          location: row.path,
          locations: undefined,
        })
      } else moveTo(row.path)
    }
  }
  // A single click shows that folder in the right panel at once, without entering it: the center stays where it is.
  const previewing = useRef<Promise<void> | undefined>(undefined)
  const previewDetail = (id: string) => {
    if (busy || !ready || id === state.current.detailId || !all.some((r) => r.rowId === id)) return
    if (draftBlocks(id, false)) return
    const task = (async () => {
      const operation = ++navigation.current
      const result = await run({ action: 'visit', rowId: id })
      if (
        !mounted.current ||
        operation !== navigation.current ||
        !result?.snapshot ||
        !onSelect(id)
      )
        return
      setFilePreview(undefined)
      persist({ ...state.current, detailId: id })
    })()
    previewing.current = task
    void task.finally(() => {
      if (previewing.current === task) previewing.current = undefined
    })
  }
  // The panel always shows what is selected; when it is hidden nothing loads until it is opened.
  useEffect(() => {
    if (highlight && browse.panelVisible !== false) previewDetail(highlight)
  }, [highlight, browse.panelVisible])
  // Unsaved folder settings are never dropped silently: switching waits for an answer shown in the panel.
  const [switching, setSwitching] = useState<{ id: string; enter: boolean }>()
  const draftBlocks = (id: string, enter: boolean) => {
    if (discardOnce.current) {
      discardOnce.current = false
      return false
    }
    if (!configDirty || !configId || id === configId) return false
    setSwitching({ id, enter })
    return true
  }
  useEffect(() => {
    if (!configDirty) setSwitching(undefined)
  }, [configDirty])
  const discardOnce = useRef(false)
  const switchDiscard = () => {
    const target = switching
    if (!target) return
    setSwitching(undefined)
    discardOnce.current = true
    setConfigDirty(false)
    onDirty(false)
    if (target.enter) void open(target.id)
    else previewDetail(target.id)
  }
  const switchStay = () => {
    setSwitching(undefined)
    if (configId) setHighlight(configId)
  }
  const previewFile = async (entry: OverviewEntry) => {
    if (busy) return
    const operation = ++navigation.current,
      result = await run({ action: 'visit', rowId: entry.rowId })
    if (
      !mounted.current ||
      operation !== navigation.current ||
      !result?.snapshot ||
      !onSelect(entry.rowId)
    )
      return
    setFilePreview(entry)
    persist({ ...state.current, detailId: entry.rowId, panelVisible: true })
  }
  const navHistory = (delta: number) => {
    if (
      !ready ||
      busy ||
      Array.from(
        document.querySelectorAll(
          '.reader,.media-viewer-shell,.document-viewer,.mantine-Drawer-content,.mantine-Modal-content,.mantine-Menu-dropdown,.mantine-Select-dropdown,[role="dialog"]'
        )
      ).some(
        (node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden'
      )
    )
      return
    const i = history.index + delta
    if (i < 0 || i >= history.items.length) return
    const target = all.find((r) => pathKey(r.path) === pathKey(history.items[i] || root))
    if (target) void open(target.rowId, i)
  }
  sideNavigation.current = (event) => {
    if (
      !Number.isFinite(event.x) ||
      !Number.isFinite(event.y) ||
      (event.delta !== -1 && event.delta !== 1)
    )
      return
    const target = document.elementFromPoint(event.x, event.y)
    if (target && workspaceRoot.current?.contains(target)) navHistory(event.delta)
  }
  const openConfig = (id: string, tab = 'fields') => {
    if (configDirty && id !== configId && !window.confirm(tr('放棄尚未保存的資料夾設定？'))) return
    setHighlight(id)
    setConfigTab(tab)
    setConfigId(id)
    if (state.current.panelVisible === false) persist({ ...state.current, panelVisible: true })
  }
  const closeConfig = () => {
    if (!configDirty || window.confirm(tr('放棄尚未保存的資料夾設定？'))) setConfigId(undefined)
  }
  // The settings tab belongs to the folder shown in the panel: follow it when another folder is opened.
  useEffect(() => {
    if (!configId || !detail || detail.rowId === configId || configDirty) return
    setConfigId(detail.rowId)
  }, [detail?.rowId])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.altKey &&
        event.key === 'Enter' &&
        !event.isComposing &&
        !event.repeat &&
        currentFolder &&
        !busy &&
        !document.querySelector('.reader,.mantine-Drawer-content,.mantine-Modal-content') &&
        !(event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]')
      ) {
        event.preventDefault()
        openConfig(currentFolder.rowId)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [currentFolder?.rowId, busy, configDirty])
  const child = (name: string) => {
    if (!detail) return
    const next = all.find((r) => pathKey(r.path) === pathKey(detail.path + '/' + name))
    if (next) void open(next.rowId)
    else
      notify(
        detail.boundary
          ? tr('此資料夾受遊戲邊界保護，無法建立資料')
          : tr('此資料夾尚未建立資料，請先明確重新掃描')
      )
  }
  const availableColumns = [
    { id: 'name', label: tr('資料夾名稱') },
    { id: 'path', label: tr('目前路徑') },
    { id: 'depth', label: tr('層級') },
    ...project.fieldBindings.map((f) => ({ id: f.attributeId, label: f.alias })),
  ]
  const orderedColumns = [
    ...(browse.columnOrder ?? []).flatMap((id) => availableColumns.find((c) => c.id === id) ?? []),
    ...availableColumns.filter((c) => !browse.columnOrder?.includes(c.id)),
  ]
  const columns = orderedColumns.filter(
    (column) => column.id === 'name' || !browse.hiddenColumns?.includes(column.id)
  )
  const reorderColumn = (source: string, target: string, after: boolean) => {
    if (busy || source === target || !columns.some((c) => c.id === source)) return
    const ids = orderedColumns.map((c) => c.id).filter((id) => id !== source),
      index = ids.indexOf(target)
    if (index < 0) return
    ids.splice(index + (after ? 1 : 0), 0, source)
    if (ids.some((id, i) => orderedColumns[i].id !== id))
      persist({ ...state.current, columnOrder: ids })
  }
  const endColumnDrag = () => {
    setDragColumn('')
    setColumnDrop(undefined)
  }
  const deepest = maxBrowseDepth(all),
    crumbs = folderBreadcrumbs(all, root, currentFolder?.path ?? root)
  const overviewRoot = currentFolder ?? rootRow
  const folderMode = browse.contentMode !== 'files'
  const hasGames = all.some(isGameFolder)
  const panelOpen = !!detail && browse.panelVisible !== false
  const settingsBody = config && (
    <Suspense fallback={<p>{tr('載入設定…')}</p>}>
      <FolderPanel
        key={config.rowId}
        initialTab={configTab}
        row={config}
        project={project}
        busy={busy}
        act={act}
        run={run}
        onDirty={reportDirty}
        onEditLayout={() => edit()}
      />
    </Suspense>
  )
  useEffect(() => {
    const body = panelBody.current
    setCanReturnTop(false)
    if (!body || !panelOpen) return
    const update = () => setCanReturnTop(body.scrollTop > 0)
    const resize = new ResizeObserver(update),
      mutation = new MutationObserver(update)
    resize.observe(body)
    mutation.observe(body, { childList: true, subtree: true, attributes: true })
    body.addEventListener('scroll', update, { passive: true })
    update()
    return () => {
      resize.disconnect()
      mutation.disconnect()
      body.removeEventListener('scroll', update)
    }
  }, [panelOpen, detail?.rowId, filePreview?.id])
  useLayoutEffect(() => {
    const slot = panelSlot.current
    if (!slot) return
    if (!panelOpen && slot.contains(document.activeElement)) panelToggle.current?.focus()
    slot.inert = !panelOpen
  }, [panelOpen])
  useEffect(() => {
    if (cardPending) return
    const next = cardDisplay(project)
    setDisplay({ ...next, level: next.level === 'all' ? 'all' : Math.min(next.level, deepest) })
    setDensity(project.list)
  }, [project.revision, deepest])
  useEffect(() => {
    if (!cardPending || !validDensity || busy || cardSaving.current) return
    const edit = cardEdit.current,
      projectId = project.projectId
    const timeout = setTimeout(() => {
      cardSaving.current = true
      void act({
        action: 'saveProject',
        project: { ...projectLive.current, cardView: display, list: liveList },
      })
        .then((result) => {
          if (!mounted.current || projectLive.current.projectId !== projectId) return
          if (edit === cardEdit.current) {
            setCardPending(false)
            if (!result) setCardSaveError(tr('顯示設定未保存，請重試'))
          }
        })
        .finally(() => {
          cardSaving.current = false
        })
    }, 300)
    return () => clearTimeout(timeout)
  }, [cardPending, display, density, busy, project.revision])
  const moveWidth = (e: React.PointerEvent) => {
    if (!resize.current) return
    const r = resize.current
    if (r.id === 'panel')
      setBrowse((v) => ({
        ...v,
        panelWidth: Math.round(Math.max(280, Math.min(1000, r.width + r.start - e.clientX))),
      }))
    else
      setBrowse((v) => ({
        ...v,
        widths: {
          ...v.widths,
          [r.id]: Math.round(Math.max(80, Math.min(1000, r.width + e.clientX - r.start))),
        },
      }))
  }
  const stopWidth = () => {
    resize.current = undefined
    persist(state.current)
  }
  // Ctrl/Cmd+click marks folders one by one, Shift+click marks a range; a plain click clears the marks.
  const gestures = (id: string) => ({
    onClick: (e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        markAnchor.current = id
        setMarked((now) => (now.includes(id) ? now.filter((m) => m !== id) : [...now, id]))
        return
      }
      const from = current.findIndex((r) => r.rowId === markAnchor.current),
        to = current.findIndex((r) => r.rowId === id)
      if (e.shiftKey && from >= 0 && to >= 0) {
        setMarked(current.slice(Math.min(from, to), Math.max(from, to) + 1).map((r) => r.rowId))
        return
      }
      markAnchor.current = id
      if (marked.length) setMarked([])
      setHighlight(id)
    },
    onDoubleClick: () => void open(id),
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      openConfig(id)
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        void open(id)
      }
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault()
        openConfig(id)
      }
    },
  })
  const presets = cardPresets(project),
    pickPreset = (id: string) => {
      const preset = presets.find((p) => p.id === id)
      if (preset)
        void act({
          action: 'saveProject',
          project: {
            ...project,
            cells: preset.cells,
            layoutPresets: presets,
            activeLayoutId: preset.id,
          },
        })
    }
  const switchMode = async (mode: BrowseMode) => {
    if (busy || !ready) return
    if (highlight && highlight !== state.current.detailId) {
      const row = all.find((r) => r.rowId === highlight),
        result = await run({ action: 'visit', rowId: highlight })
      if (!row || !result?.snapshot || !onSelect(highlight)) return
      moveTo(row.path)
      persist({ ...state.current, detailId: highlight })
    }
    persist({ ...state.current, mode, locations: undefined })
    renderHistory((v) => v + 1)
  }
  const showPanelFor = (id: string) => {
    setHighlight(id)
    persist({ ...state.current, panelVisible: true })
  }
  // The files view lists what is under the folder shown in the path bar. Switching to it from a selected folder
  // goes there first, so both views always describe the same place.
  const switchContent = async (value: 'folders' | 'files') => {
    setFilePreview(undefined)
    if (value === 'files' && highlight && highlight !== currentFolder?.rowId) await open(highlight)
    persist({
      ...state.current,
      contentMode: value,
      filePresentation: state.current.filePresentation ?? 'tiles',
      fileScope: state.current.fileScope ?? 'descendants',
    })
  }
  const togglePanel = () => {
    if (panelSlot.current?.contains(document.activeElement)) panelToggle.current?.focus()
    setExpanded(false)
    persist({ ...state.current, panelVisible: state.current.panelVisible === false })
  }
  return (
    <div
      ref={workspaceRoot}
      className={'project-workspace' + (expanded ? ' content-expanded' : '')}
    >
      {toolbarTarget &&
        createPortal(
          <Tooltip label={browse.panelVisible === false ? tr('顯示右側內容') : tr('隱藏右側內容')}>
            <ActionIcon
              ref={panelToggle}
              variant="subtle"
              color="gray"
              aria-label={tr('切換右側內容')}
              aria-pressed={browse.panelVisible !== false}
              disabled={!ready}
              onClick={togglePanel}
            >
              <Icon name="panel-right" size={20} />
            </ActionIcon>
          </Tooltip>,
          toolbarTarget
        )}
      <section className="center-pane" aria-label={tr('資料夾瀏覽區')}>
        <BrowseToolbar
          boundariesOnly={boundariesOnly}
          browse={browse}
          busy={busy}
          cardSaveError={cardSaveError}
          changedCard={changedCard}
          columnQuery={columnQuery}
          currentFolder={currentFolder}
          deepest={deepest}
          density={density}
          display={display}
          edit={edit}
          folderMode={folderMode}
          switchContent={switchContent}
          hasGames={hasGames}
          openConfig={openConfig}
          orderedColumns={orderedColumns}
          persist={persist}
          pickPreset={pickPreset}
          presets={presets}
          project={project}
          ready={ready}
          setBoundariesOnly={setBoundariesOnly}
          setColumnQuery={setColumnQuery}
          setDensity={setDensity}
          setDisplay={setDisplay}
          setOverviewTools={setOverviewTools}
          setPage={setPage}
          state={state}
          switchMode={switchMode}
        />
        <div className="workspace-breadcrumb">
          <Tooltip label={tr('返回上一個瀏覽位置')}>
            <ActionIcon
              aria-label={tr('返回')}
              disabled={!ready || !navigable || !history.index || busy}
              variant="subtle"
              color="gray"
              onClick={() => navHistory(-1)}
            >
              <Icon name="arrow-left" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={tr('前進至下一個瀏覽位置')}>
            <ActionIcon
              aria-label={tr('前進')}
              disabled={!ready || !navigable || history.index >= history.items.length - 1 || busy}
              variant="subtle"
              color="gray"
              onClick={() => navHistory(1)}
            >
              <Icon name="arrow-right" />
            </ActionIcon>
          </Tooltip>
          <nav className="breadcrumb-path" aria-label={tr('資料夾路徑')} title={location || root}>
            <Breadcrumbs separator={String.fromCharCode(92)}>
              {crumbs.map((r, i) =>
                i === crumbs.length - 1 ? (
                  <span
                    key={r.rowId}
                    aria-current="page"
                    className="breadcrumb-current"
                    title={r.path}
                  >
                    {r.name}
                  </span>
                ) : (
                  <button
                    key={r.rowId}
                    className="breadcrumb-link"
                    title={r.path}
                    disabled={busy}
                    onClick={() => void open(r.rowId)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      openConfig(r.rowId)
                    }}
                  >
                    {r.name}
                  </button>
                )
              )}
            </Breadcrumbs>
          </nav>
          {folderMode && (
            <small
              className="view-count"
              title={tr('Ctrl／Shift 點選可多選資料夾，再批次指定類型')}
            >
              {filtered.length} {tr('筆')}
              {browse.mode === 'CARD'
                ? ' · ' +
                  (card.mode === 'multi' ? tr('多層') : tr('單層')) +
                  ' · ' +
                  (card.level === 'all'
                    ? tr('全部（最深第 ') + deepest + tr(' 層）')
                    : card.mode === 'multi'
                      ? tr('第 1–') + card.level + tr(' 層')
                      : tr('第 ') + card.level + tr(' 層'))
                : ''}
            </small>
          )}
        </div>
        <div
          className="browse-main"
          ref={scroll}
          onScroll={(e) => {
            state.current = {
              ...state.current,
              scrolls: { ...state.current.scrolls, [browse.mode]: e.currentTarget.scrollTop },
            }
            clearTimeout(timer.current)
            timer.current = setTimeout(() => persist(state.current), 400)
          }}
        >
          {folderMode && marked.length > 0 && (
            <KindBatchBar
              rows={all.filter((r) => marked.includes(r.rowId))}
              busy={busy}
              run={run}
              clear={() => setMarked([])}
            />
          )}
          {!folderMode && overviewRoot ? (
            <FileOverview
              toolbarTarget={overviewTools}
              root={overviewRoot}
              scope={browse.fileScope ?? 'descendants'}
              presentation={browse.filePresentation ?? 'tiles'}
              busy={busy}
              change={(scope, presentation) => {
                setFilePreview(undefined)
                persist({ ...state.current, fileScope: scope, filePresentation: presentation })
              }}
              chooseRoot={(id) => void open(id)}
              open={(entry) => void previewFile(entry)}
            />
          ) : browse.mode === 'TREE' ? (
            <Suspense fallback={<p>{tr('載入樹狀圖…')}</p>}>
              <Tree
                rows={base}
                selected={highlight}
                focusId={location ? currentFolder?.rowId : undefined}
                onSelect={setHighlight}
                onOpen={(id) => void open(id)}
                onConfigure={openConfig}
                collapsed={browse.treeCollapsed}
                onCollapsed={(treeCollapsed) => persist({ ...state.current, treeCollapsed })}
                viewport={browse.viewport}
                save={(viewport) => persist({ ...state.current, viewport })}
              />
            </Suspense>
          ) : browse.mode === 'TABLE' ? (
            <div className="table-scroll">
              <table className="folder-table">
                <thead>
                  <tr>
                    {columns.map((c) => (
                      <th
                        key={c.id}
                        data-column-id={c.id}
                        className={
                          columnDrop?.id === c.id
                            ? columnDrop.after
                              ? 'column-insert-after'
                              : 'column-insert-before'
                            : ''
                        }
                        aria-sort={
                          sort.field === c.id ? (sort.asc ? 'ascending' : 'descending') : 'none'
                        }
                        style={{
                          width: browse.widths[c.id] ?? 180,
                          minWidth: browse.widths[c.id] ?? 180,
                        }}
                        onDragOver={(e) => {
                          if (!busy && dragColumn && dragColumn !== c.id) {
                            e.preventDefault()
                            e.dataTransfer.dropEffect = 'move'
                            const rect = e.currentTarget.getBoundingClientRect()
                            const after = e.clientX >= rect.left + rect.width / 2
                            setColumnDrop((previous) =>
                              previous?.id === c.id && previous.after === after
                                ? previous
                                : { id: c.id, after }
                            )
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          const rect = e.currentTarget.getBoundingClientRect()
                          reorderColumn(
                            e.dataTransfer.getData('application/x-media-viewer-column'),
                            c.id,
                            e.clientX >= rect.left + rect.width / 2
                          )
                          endColumnDrag()
                        }}
                      >
                        <button
                          disabled={busy}
                          draggable={!busy}
                          title={tr('點擊排序；拖曳調整欄位順序（Alt+←／→）')}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('application/x-media-viewer-column', c.id)
                            e.dataTransfer.effectAllowed = 'move'
                            setDragColumn(c.id)
                          }}
                          onDragEnd={endColumnDrag}
                          onKeyDown={(e) => {
                            if (e.altKey && ['ArrowLeft', 'ArrowRight'].includes(e.key)) {
                              e.preventDefault()
                              const index = columns.findIndex((column) => column.id === c.id),
                                next = columns[index + (e.key === 'ArrowLeft' ? -1 : 1)]
                              if (next) reorderColumn(c.id, next.id, e.key === 'ArrowRight')
                            }
                          }}
                          onClick={() =>
                            setSort((s) => ({ field: c.id, asc: s.field === c.id ? !s.asc : true }))
                          }
                        >
                          {c.label}
                          {sort.field === c.id ? (sort.asc ? ' ↑' : ' ↓') : ''}
                        </button>
                        <span
                          className="column-resizer"
                          role="separator"
                          aria-label={tr('調整 ') + c.label + tr(' 欄寬')}
                          onPointerDown={(e) => {
                            e.preventDefault()
                            resize.current = {
                              id: c.id,
                              start: e.clientX,
                              width: browse.widths[c.id] ?? 180,
                            }
                            e.currentTarget.setPointerCapture(e.pointerId)
                          }}
                          onPointerMove={moveWidth}
                          onPointerUp={stopWidth}
                          onPointerCancel={() => {
                            resize.current = undefined
                          }}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {current.map((r) => (
                    <tr
                      key={r.rowId}
                      data-row-id={r.rowId}
                      className={
                        (highlight === r.rowId ? 'selected ' : '') +
                        (marked.includes(r.rowId) ? 'marked' : '')
                      }
                      tabIndex={0}
                      {...gestures(r.rowId)}
                    >
                      {columns.map((c) => (
                        <td
                          key={c.id}
                          style={{ maxWidth: browse.widths[c.id] ?? 180 }}
                          title={c.id === 'path' ? r.path : undefined}
                        >
                          {c.id === 'name' ? (
                            <>
                              {r.name}
                              {!r.record ? ' ⚠' : r.boundary ? <BoundaryFlag /> : null}
                              {!panelOpen && (
                                <button
                                  type="button"
                                  className="row-info"
                                  aria-label={tr('顯示資料夾內容')}
                                  title={tr('顯示資料夾內容')}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    showPanelFor(r.rowId)
                                  }}
                                >
                                  <Icon name="panel-right" size={14} />
                                </button>
                              )}
                            </>
                          ) : c.id === 'path' ? (
                            r.path
                          ) : c.id === 'depth' ? (
                            r.depth
                          ) : Array.isArray(fieldValue(r, c.id)) ? (
                            (fieldValue(r, c.id) as unknown[]).join(', ')
                          ) : typeof fieldValue(r, c.id) === 'boolean' ? (
                            fieldValue(r, c.id) ? (
                              tr('是')
                            ) : (
                              tr('否')
                            )
                          ) : (
                            String(fieldValue(r, c.id) ?? '')
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div
              className="cards"
              style={{ '--columns': liveList.itemsPerRow } as React.CSSProperties}
            >
              {current.map((row) => (
                <article
                  key={row.rowId}
                  data-row-id={row.rowId}
                  className={
                    'folder-card ' +
                    (highlight === row.rowId ? 'selected ' : '') +
                    (marked.includes(row.rowId) ? 'marked' : '')
                  }
                  tabIndex={0}
                  {...gestures(row.rowId)}
                >
                  {!panelOpen && (
                    <Tooltip label={tr('顯示資料夾內容')}>
                      <ActionIcon
                        className="card-info"
                        variant="default"
                        size="sm"
                        aria-label={tr('顯示資料夾內容')}
                        onClick={(e) => {
                          e.stopPropagation()
                          showPanelFor(row.rowId)
                        }}
                      >
                        <Icon name="panel-right" size={14} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                  <Card
                    project={project}
                    row={row}
                    open={() => void act({ action: 'open', rowId: row.rowId })}
                  />
                  {(row.error || !row.record || row.readonly || row.boundary) && (
                    <small className="folder-state">
                      {row.error ? (
                        tr('需要處理')
                      ) : row.readonly ? (
                        tr('受保護')
                      ) : !row.record ? (
                        tr('尚未建立資料')
                      ) : (
                        <BoundaryFlag />
                      )}
                    </small>
                  )}
                </article>
              ))}
            </div>
          )}
          {!current.length && browse.mode !== 'TREE' && (
            <div className="empty-folder">
              {tr('此資料夾沒有子資料夾')}
              <small>{tr('資料夾的內容顯示在右側面板。')}</small>
            </div>
          )}
        </div>
        {folderMode && browse.mode !== 'TREE' && (
          <div className="browse-pagination">
            <Pagination size="xs" total={pages} value={Math.min(page, pages)} onChange={setPage} />
            <small>
              {tr('每頁')}
              {pageSize} {tr('筆')}
            </small>
          </div>
        )}
      </section>
      {panelOpen && <div className="panel-scrim" aria-hidden="true" onClick={togglePanel} />}
      <BrowsePanel
        persist={persist}
        act={act}
        all={all}
        browse={browse}
        busy={busy}
        canReturnTop={canReturnTop}
        child={child}
        closeConfig={closeConfig}
        config={config}
        detail={detail}
        edit={edit}
        expanded={expanded}
        filePreview={filePreview}
        folderMode={folderMode}
        canEnter={!!detail && pathKey(detail.path) !== pathKey(location || root)}
        switchTo={switching ? all.find((r) => r.rowId === switching.id) : undefined}
        switchDiscard={switchDiscard}
        switchStay={switchStay}
        moveWidth={moveWidth}
        navHistory={navHistory}
        open={open}
        openConfig={openConfig}
        panelBody={panelBody}
        panelOpen={panelOpen}
        panelSlot={panelSlot}
        project={project}
        ready={ready}
        resize={resize}
        run={run}
        setExpanded={setExpanded}
        settingsBody={settingsBody}
        stopWidth={stopWidth}
        togglePanel={togglePanel}
        history={history}
      />
    </div>
  )
}
