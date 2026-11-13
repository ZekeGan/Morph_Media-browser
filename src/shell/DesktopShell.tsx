import { t as tr, useLocale } from '../i18n'
import { Icon } from '../common/icons'
import { BrandMark } from '../common/BrandMark'
import { describeError } from '../notices/errors'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import type { FolderRow, LinkedProject, Snapshot } from '../../shared/model'
import { SearchDialog } from '../search/SearchDialog'
import { usePlayback } from '../media/Playback'
import {
  defaultWorkspace,
  sectionIds,
  sectionProjects,
  type WorkspaceCommand,
  type WorkspaceState,
} from '../../shared/workspace'

interface Props {
  projects: LinkedProject[]
  rows: FolderRow[]
  selected: string
  busy: boolean
  dirty: boolean
  onSelect: (projectId: string, rowId?: string) => boolean
  onCreate: () => void
  onProblems: () => void
  problemCount: number
  onSettings: () => void
  onRefresh: () => void
  onProjectSettings: (projectId: string) => void
  onOverlay: (value: boolean) => void
  onDirty: (value: boolean) => void
  onSnapshot: (snapshot: Snapshot) => void
  toolbarRef?: (node: HTMLDivElement | null) => void
  banner: ReactNode
  status: string
  children: ReactNode
}
const title = (p: LinkedProject) => p.project?.name ?? tr('待重新連結')
export function DesktopShell(props: Props) {
  useLocale()
  const playback = usePlayback()

  const { projects, selected, onOverlay, onDirty } = props
  const [workspace, setWorkspace] = useState<WorkspaceState>({ prefs: defaultWorkspace() })
  const [ready, setReady] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('')
  const [maximized, setMaximized] = useState(false),
    [liveWidth, setLiveWidth] = useState<number>()
  const [form, setForm] = useState<{ id?: string; original: string }>(),
    [name, setName] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [dragging, setDragging] = useState<{ kind: 'project' | 'group'; id: string }>()
  // dragover can arrive before React re-renders with the new state; the ref is set at once, so a quick drag is
  // never refused (which would silently cancel the drop).
  const dragNow = useRef<{ kind: 'project' | 'group'; id: string }>(undefined)
  const startDrag = (value: { kind: 'project' | 'group'; id: string }) => {
    dragNow.current = value
    setDragging(value)
  }
  const [dropTarget, setDropTarget] = useState('')
  const [groupDrop, setGroupDrop] = useState<{ id: string; after: boolean }>()
  const [openMenu, setOpenMenu] = useState('')
  const resizing = useRef(false)
  const sidebarSlot = useRef<HTMLDivElement>(null),
    sidebarToggle = useRef<HTMLButtonElement>(null)
  const groupPositions = useRef(new Map<string, number>())
  const idsKey = projects.map((p) => p.projectId).join('|')
  useEffect(() => {
    let alive = true
    window.desktop
      .workspace()
      .then((state) => {
        if (alive) {
          setWorkspace(state)
          setError('')
          setReady(true)
        }
      })
      .catch((e) => {
        if (alive) {
          setError(String(e))
          setReady(true)
        }
      })
    return () => {
      alive = false
    }
  }, [idsKey])
  useEffect(() => {
    let alive = true
    window.desktop
      .windowAction('state')
      .then((s) => {
        if (alive) setMaximized(s.maximized)
      })
      .catch((e) => setError(String(e)))
    const remove = window.desktop.onWindowState((s) => setMaximized(s.maximized))
    return () => {
      alive = false
      remove()
    }
  }, [])
  useEffect(() => {
    onOverlay(searchOpen || !!form)
    return () => onOverlay(false)
  }, [searchOpen, form, onOverlay])
  useEffect(() => {
    onDirty(!!form && name !== form.original)
    return () => onDirty(false)
  }, [form, name, onDirty])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        !document.querySelector('.reader,.mantine-Drawer-content,.mantine-Modal-content') &&
        !form &&
        !e.isComposing &&
        e.ctrlKey &&
        e.key.toLowerCase() === 'k'
      ) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [form])
  const mutate = useCallback(async (command: WorkspaceCommand) => {
    setSaving(true)
    try {
      setWorkspace(await window.desktop.updateWorkspace(command))
      setError('')
      return true
    } catch (e) {
      setError(String(e))
      return false
    } finally {
      setSaving(false)
    }
  }, [])
  const prefs = workspace.prefs
  // While the sidebar is hidden, resting the pointer on its button in the top bar lays it over the page without moving
  // anything; it goes away again when the pointer leaves or a project is picked. The window's left edge does not open
  // it (R-360): the pointer passes there too often by accident.
  const [peek, setPeek] = useState(false),
    peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const peeking = peek && !!prefs.sidebarHidden
  // Closing on purpose (Esc, picking a project) while the pointer rests on the button must not reopen it: the browser
  // sends a mouse move after the layout change, which the button would take as a fresh hover.
  // So it stays closed until the pointer has left the button once.
  const peekBlocked = useRef(false)
  const closePeekNow = () => {
    setPeek(false)
    peekBlocked.current = true
    const away = (event: MouseEvent) => {
      if (sidebarToggle.current?.contains(event.target as Node)) return
      peekBlocked.current = false
      window.removeEventListener('mousemove', away)
    }
    window.addEventListener('mousemove', away)
  }
  const openPeek = () => {
    clearTimeout(peekTimer.current)
    // Immersive reading owns the left edge for its tool rail.
    if (document.querySelector('.reader-focused')) return
    if (prefs.sidebarHidden && !peekBlocked.current) setPeek(true)
  }
  const closePeekSoon = () => {
    clearTimeout(peekTimer.current)
    peekTimer.current = setTimeout(function check() {
      // A menu or dialog opened from the sidebar keeps it in place until it is closed.
      const open = Array.from(
        document.querySelectorAll(
          '.mantine-Menu-dropdown,.mantine-Modal-content,.mantine-Popover-dropdown'
        )
      ).some((node) => node.getClientRects().length > 0)
      if (open) peekTimer.current = setTimeout(check, 400)
      else setPeek(false)
    }, 300)
  }
  useEffect(() => {
    if (!peeking) return
    const key = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !document.querySelector('.mantine-Menu-dropdown,.mantine-Modal-content')
      )
        closePeekNow()
    }
    // Captured first: the button's tooltip takes Esc for itself on the document and stops it there (R-360).
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [peeking])
  useEffect(() => () => clearTimeout(peekTimer.current), [])
  const selectFromSidebar = (id: string) => {
    props.onSelect(id)
    closePeekNow()
  }
  useLayoutEffect(() => {
    const slot = sidebarSlot.current
    if (!slot) return
    if (prefs.sidebarHidden && slot.contains(document.activeElement)) sidebarToggle.current?.focus()
    slot.inert = !!prefs.sidebarHidden && !peeking
  }, [prefs.sidebarHidden, peeking])
  // A failed settings write must not hide otherwise usable projects.
  const placements = { ...prefs.projects }
  projects.forEach((p, i) => {
    if (!placements[p.projectId])
      placements[p.projectId] = { groupId: null, favorite: false, addedOrder: i + 1 }
  })
  const view = { ...prefs, projects: placements }
  const members = (section: string) =>
    sectionProjects(
      projects.map((p) => p.projectId),
      view,
      section
    ).map((id) => projects.find((p) => p.projectId === id)!)
  const unclassified = members('unclassified'),
    favorites = members('favorites'),
    sections = sectionIds(prefs)
  const locked = props.busy || saving || !ready || !!workspace.error
  useLayoutEffect(() => {
    const elements = [
      ...(sidebarSlot.current?.querySelectorAll<HTMLElement>('[data-group-id]') ?? []),
    ]
    for (const element of elements)
      element.getAnimations().forEach((animation) => animation.cancel())
    const next = new Map<string, number>()
    for (const element of elements) {
      const id = element.dataset.groupId!,
        top = element.getBoundingClientRect().top,
        previous = groupPositions.current.get(id)
      next.set(id, top)
      if (
        previous !== undefined &&
        previous !== top &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        element.animate(
          [{ transform: `translateY(${previous - top}px)` }, { transform: 'translateY(0)' }],
          { duration: 180, easing: 'ease-out' }
        )
    }
    groupPositions.current = next
  }, [prefs.sections])
  const closeForm = () => {
    if (!form || name === form.original || window.confirm(tr('放棄尚未保存的群組名稱？')))
      setForm(undefined)
  }
  const editGroup = (id?: string) => {
    const original = prefs.groups.find((g) => g.id === id)?.name ?? ''
    setName(original)
    setForm({ id, original })
  }
  const move = (projectId: string, groupId: string | null) =>
    mutate({ action: 'moveProject', projectId, groupId })
  const endDrag = () => {
    dragNow.current = undefined
    setDragging(undefined)
    setDropTarget('')
    setGroupDrop(undefined)
  }
  const groupAfter = (e: React.DragEvent<HTMLElement>) => {
    const heading = e.currentTarget.querySelector('.section-heading')!.getBoundingClientRect()
    return e.clientY >= heading.top + heading.height / 2
  }
  const drop = (e: React.DragEvent<HTMLElement>, sectionId: string, beforeId?: string) => {
    e.stopPropagation()
    const id = e.dataTransfer.getData('application/x-media-viewer-project')
    const groupId = e.dataTransfer.getData('application/x-media-viewer-group')
    if (!locked && groupId && groupId !== sectionId && sections.includes(groupId)) {
      e.preventDefault()
      const ids = sections.filter((v) => v !== groupId)
      ids.splice(ids.indexOf(sectionId) + (groupAfter(e) ? 1 : 0), 0, groupId)
      if (ids.some((id, i) => id !== sections[i])) void mutate({ action: 'reorderSections', ids })
    }
    if (!locked && projects.some((p) => p.projectId === id) && id !== beforeId) {
      e.preventDefault()
      if (sectionId === 'favorites') {
        void (async () => {
          if (
            !placements[id].favorite &&
            !(await mutate({ action: 'favorite', projectId: id, value: true }))
          )
            return
          await mutate({ action: 'reorderProject', projectId: id, sectionId, beforeId })
        })()
      } else
        void mutate({
          action: 'moveProject',
          projectId: id,
          groupId: sectionId === 'unclassified' ? null : sectionId,
          beforeId,
        })
    }
    endDrag()
  }
  const shiftSection = (id: string, delta: number) => {
    const ids = [...sections],
      i = ids.indexOf(id),
      j = i + delta
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    void mutate({ action: 'reorderSections', ids })
  }
  const projectRow = (p: LinkedProject, sectionId: string) => (
    <div
      key={p.projectId}
      className={`sidebar-project ${selected === p.projectId ? 'selected' : ''} ${dropTarget === sectionId + ':' + p.projectId ? 'insert-before' : ''}`}
      draggable={!locked}
      onDragOver={(e) => {
        if (!locked && dragNow.current?.kind === 'project') {
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'move'
          setDropTarget(sectionId + ':' + p.projectId)
        }
      }}
      onDrop={(e) => {
        if (dragNow.current?.kind === 'project') drop(e, sectionId, p.projectId)
      }}
      onDragStart={(e) => {
        e.stopPropagation()
        e.dataTransfer.setData('application/x-media-viewer-project', p.projectId)
        e.dataTransfer.effectAllowed = 'move'
        startDrag({ kind: 'project', id: p.projectId })
      }}
      onDragEnd={endDrag}
    >
      <button
        className="project-select"
        disabled={props.busy}
        title={p.root}
        aria-label={tr('開啟專案 {0}', title(p))}
        onClick={() => selectFromSidebar(p.projectId)}
      >
        <span className="project-mark">{p.error ? '!' : <Icon name="folder" />}</span>
        <span className="project-name">{title(p)}</span>
      </button>
      <div
        className={`project-actions ${openMenu === 'project:' + sectionId + ':' + p.projectId ? 'menu-open' : ''}`}
      >
        <Tooltip label={placements[p.projectId].favorite ? tr('取消最愛') : tr('加入最愛')}>
          <ActionIcon
            variant="subtle"
            color={placements[p.projectId].favorite ? undefined : 'gray'}
            aria-label={`${placements[p.projectId].favorite ? tr('取消最愛') : tr('加入最愛')} ${title(p)}`}
            disabled={locked}
            onClick={() =>
              void mutate({
                action: 'favorite',
                projectId: p.projectId,
                value: !placements[p.projectId].favorite,
              })
            }
          >
            <Icon name="heart" filled={placements[p.projectId].favorite} />
          </ActionIcon>
        </Tooltip>
        <Menu
          position="right-start"
          withinPortal
          opened={openMenu === 'project:' + sectionId + ':' + p.projectId}
          onChange={(opened) =>
            setOpenMenu(opened ? 'project:' + sectionId + ':' + p.projectId : '')
          }
        >
          <Menu.Target>
            <ActionIcon
              aria-label={tr('專案選單 {0}', title(p))}
              variant="subtle"
              color="gray"
              disabled={locked}
            >
              <Icon name="more" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>{title(p)}</Menu.Label>
            <Menu.Item
              disabled={!p.project || !!p.error}
              onClick={() => props.onProjectSettings(p.projectId)}
            >
              {tr('專案設定')}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Label>{tr('移至群組')}</Menu.Label>
            <Menu.Item onClick={() => void move(p.projectId, null)}>{tr('未分類')}</Menu.Item>
            {prefs.groups.map((g) => (
              <Menu.Item key={g.id} onClick={() => void move(p.projectId, g.id)}>
                {g.name}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </div>
    </div>
  )
  const section = (
    id: string,
    label: string,
    items: LinkedProject[],
    collapsed: boolean,
    custom = false
  ) => (
    <section
      key={id}
      className={`sidebar-section ${dragging?.kind === 'project' ? 'drop-ready' : ''} ${dropTarget === id + ':end' ? 'insert-end' : ''} ${groupDrop?.id === id ? (groupDrop.after ? 'group-insert-after' : 'group-insert-before') : ''}`}
      data-group-id={id}
      onDragOver={(e) => {
        const dragging = dragNow.current
        if (locked || !dragging) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (dragging.kind === 'group') {
          setDropTarget('')
          setGroupDrop(dragging.id === id ? undefined : { id, after: groupAfter(e) })
        } else setDropTarget(id + ':end')
      }}
      onDrop={(e) => drop(e, id)}
    >
      <div className="section-heading">
        <button
          className="section-toggle"
          disabled={locked}
          draggable={!locked}
          title={tr('拖曳調整群組順序；Alt+↑／↓ 亦可移動')}
          onDragStart={(e) => {
            e.stopPropagation()
            e.dataTransfer.setData('application/x-media-viewer-group', id)
            e.dataTransfer.effectAllowed = 'move'
            startDrag({ kind: 'group', id })
            setOpenMenu('')
          }}
          onDragEnd={endDrag}
          onKeyDown={(e) => {
            if (!locked && e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) {
              e.preventDefault()
              shiftSection(id, e.key === 'ArrowUp' ? -1 : 1)
            }
          }}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? tr('展開') : tr('收合')} ${label}`}
          onClick={() =>
            void mutate(
              custom
                ? { action: 'collapseGroup', id, value: !collapsed }
                : {
                    action: 'collapseSection',
                    section: id as 'favorites' | 'unclassified',
                    value: !collapsed,
                  }
            )
          }
        >
          <span className="section-label">{label}</span>
          <Icon
            name="chevron-right"
            size={14}
            className={`section-chevron ${collapsed ? '' : 'expanded'}`}
          />
          <span className="section-count">{items.length}</span>
        </button>
        <div className={`group-actions ${openMenu === 'group:' + id ? 'menu-open' : ''}`}>
          <Menu
            position="right-start"
            withinPortal
            opened={openMenu === 'group:' + id}
            onChange={(opened) => setOpenMenu(opened ? 'group:' + id : '')}
          >
            <Menu.Target>
              <ActionIcon
                aria-label={tr('管理群組 {0}', label)}
                variant="subtle"
                color="gray"
                disabled={locked}
              >
                <Icon name="more" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => editGroup()}>{tr('新增群組')}</Menu.Item>
              {custom && (
                <>
                  <Menu.Item onClick={() => editGroup(id)}>{tr('重新命名群組')}</Menu.Item>
                  <Menu.Divider />
                  <Menu.Item
                    color="red"
                    onClick={() => {
                      if (
                        !items.length ||
                        window.confirm(
                          tr(
                            '刪除「{0}」群組？其中 {1} 個專案會移至未分類，資料及收藏保留。',
                            label,
                            items.length
                          )
                        )
                      )
                        void mutate({ action: 'removeGroup', id })
                    }}
                  >
                    {tr('刪除群組')}
                  </Menu.Item>
                </>
              )}
            </Menu.Dropdown>
          </Menu>
        </div>
      </div>
      {!collapsed && (
        <div className="section-projects">
          {items.length ? (
            items.map((p) => projectRow(p, id))
          ) : (
            <p
              className="section-empty"
              title={id === 'favorites' ? tr('點專案愛心加入最愛') : undefined}
            >
              {custom
                ? tr('拖入專案，或用專案選單移動')
                : id === 'favorites'
                  ? tr('尚無最愛')
                  : tr('沒有未分類的專案')}
            </p>
          )}
        </div>
      )}
    </section>
  )
  const windowAction = (action: 'minimize' | 'toggleMaximize' | 'close') => {
    void window.desktop.windowAction(action).catch((e) => setError(String(e)))
  }
  return (
    <div className="desktop-shell">
      <header className="titlebar">
        <button
          className="app-brand"
          aria-label={tr('返回首頁')}
          title={tr('首頁')}
          disabled={props.busy}
          onClick={() => props.onSelect('')}
        >
          <BrandMark height={17} />
        </button>
        <Tooltip label={prefs.sidebarHidden ? tr('顯示專案欄') : tr('隱藏專案欄')}>
          <ActionIcon
            ref={sidebarToggle}
            color="gray"
            variant="subtle"
            aria-label={tr('切換專案欄')}
            disabled={locked}
            onMouseEnter={openPeek}
            onMouseLeave={() => peeking && closePeekSoon()}
            onClick={() => void mutate({ action: 'layout', sidebarHidden: !prefs.sidebarHidden })}
          >
            <Icon name="panel-left" />
          </ActionIcon>
        </Tooltip>
        <div className="global-search">
          <button
            className="search-launcher"
            aria-label={tr('開啟搜尋')}
            onClick={() => setSearchOpen(true)}
          >
            <Icon name="search" /> {tr('搜尋資料夾')}
            <kbd>Ctrl K</kbd>
          </button>
        </div>
        {selected && <div className="project-toolbar-slot" ref={props.toolbarRef} />}
        {props.dirty && (
          <span className="dirty-indicator" title={tr('尚未保存')}>
            ●
          </span>
        )}
        {!!playback?.count && (
          <span className="playback-toggle">
            <Tooltip label={tr('播放佇列')}>
              <ActionIcon
                aria-label={tr('播放佇列') + ' · ' + playback.count}
                variant="subtle"
                color="gray"
                onClick={playback.openQueue}
              >
                <Icon name="list" />
              </ActionIcon>
            </Tooltip>
            <span className="playback-toggle-count" aria-hidden="true">
              {playback.count > 99 ? '99+' : playback.count}
            </span>
          </span>
        )}
        {selected && (
          <Tooltip label={tr('重新整理')}>
            <ActionIcon
              className="global-refresh"
              aria-label={tr('重新整理')}
              variant="subtle"
              color="gray"
              disabled={props.busy}
              onClick={props.onRefresh}
            >
              <Icon name="refresh" />
            </ActionIcon>
          </Tooltip>
        )}
        <Tooltip label={tr('應用程式設定')}>
          <ActionIcon
            className="global-settings"
            aria-label={tr('應用程式設定')}
            variant="subtle"
            color="gray"
            disabled={props.busy}
            onClick={props.onSettings}
          >
            <Icon name="settings" />
          </ActionIcon>
        </Tooltip>
        <div className="window-controls">
          <button aria-label={tr('最小化視窗')} onClick={() => windowAction('minimize')}>
            −
          </button>
          <button
            aria-label={maximized ? tr('還原視窗') : tr('最大化視窗')}
            onClick={() => windowAction('toggleMaximize')}
          >
            <Icon name={maximized ? 'restore' : 'maximize'} size={15} />
          </button>
          <button
            className="window-close"
            aria-label={tr('關閉視窗')}
            onClick={() => windowAction('close')}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      </header>
      <div className="desktop-body">
        <div
          ref={sidebarSlot}
          className="sidebar-slot"
          data-open={!prefs.sidebarHidden}
          data-peek={peeking}
          onMouseEnter={() => peeking && clearTimeout(peekTimer.current)}
          onMouseLeave={() => peeking && closePeekSoon()}
          data-resizing={liveWidth !== undefined}
          aria-hidden={!!prefs.sidebarHidden && !peeking}
          style={
            { '--sidebar-width': (liveWidth ?? prefs.sidebarWidth) + 'px' } as React.CSSProperties
          }
        >
          <aside className="project-sidebar" style={{ width: liveWidth ?? prefs.sidebarWidth }}>
            <div className="sidebar-tools">
              <Tooltip label={tr('首頁')}>
                <ActionIcon
                  aria-label={tr('首頁')}
                  variant="subtle"
                  color="gray"
                  disabled={props.busy}
                  onClick={() => selectFromSidebar('')}
                >
                  <Icon name="home" />
                </ActionIcon>
              </Tooltip>
            </div>
            <div className="sidebar-groups">
              <div className="groups-title">
                <span>{tr('我的群組')}</span>
                <Tooltip label={tr('新增群組')}>
                  <ActionIcon
                    aria-label={tr('新增群組')}
                    variant="subtle"
                    color="gray"
                    disabled={locked}
                    onClick={() => editGroup()}
                  >
                    <Icon name="plus" />
                  </ActionIcon>
                </Tooltip>
              </div>
              {sections.map((id) => {
                const group = prefs.groups.find((g) => g.id === id)
                return section(
                  id,
                  group?.name ?? (id === 'favorites' ? tr('最愛') : tr('未分類')),
                  members(id),
                  group?.collapsed ??
                    (id === 'favorites'
                      ? prefs.collapsed.favorites
                      : (prefs.collapsed.unclassified ?? prefs.collapsed.recent)),
                  !!group
                )
              })}
            </div>
            <div className="sidebar-footer">
              <Button
                aria-label={tr('新增專案')}
                fullWidth
                variant="subtle"
                color="gray"
                disabled={props.busy}
                onClick={props.onCreate}
              >
                <Icon name="plus" size={16} /> {tr('新增專案')}
              </Button>
            </div>
          </aside>
          <div
            role="separator"
            tabIndex={0}
            aria-label={tr('調整專案欄寬')}
            aria-orientation="vertical"
            aria-valuemin={200}
            aria-valuemax={360}
            aria-valuenow={liveWidth ?? prefs.sidebarWidth}
            className="sidebar-resizer"
            onPointerDown={(e) => {
              if (locked) return
              resizing.current = true
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (resizing.current)
                setLiveWidth(Math.round(Math.min(360, Math.max(200, e.clientX))))
            }}
            onPointerUp={(e) => {
              if (!resizing.current) return
              resizing.current = false
              e.currentTarget.releasePointerCapture(e.pointerId)
              const width = Math.round(Math.min(360, Math.max(200, e.clientX)))
              void mutate({ action: 'layout', sidebarWidth: width }).finally(() =>
                setLiveWidth(undefined)
              )
            }}
            onPointerCancel={() => {
              resizing.current = false
              setLiveWidth(undefined)
            }}
            onKeyDown={(e) => {
              if (!locked && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
                e.preventDefault()
                void mutate({
                  action: 'layout',
                  sidebarWidth:
                    e.key === 'Home'
                      ? 200
                      : e.key === 'End'
                        ? 360
                        : Math.max(
                            200,
                            Math.min(360, prefs.sidebarWidth + (e.key === 'ArrowRight' ? 10 : -10))
                          ),
                })
              }
            }}
          />
        </div>
        <main className={'content' + (selected ? ' workspace-content' : '')}>
          {(error || workspace.error) && (
            <Alert color="orange" mb="md" title={tr('側欄／視窗設定')}>
              {describeError(error || workspace.error).message}
              {describeError(error || workspace.error).hint && (
                <Text size="sm" c="dimmed">
                  {describeError(error || workspace.error).hint}
                </Text>
              )}
            </Alert>
          )}
          {props.banner}
          {selected ? (
            props.children
          ) : (
            <div className="home-page">
              <div className="home-intro">
                <Badge variant="light" color="gray">
                  {tr('本機資料夾檢視器')}
                </Badge>
                <h1>{tr('你的資料夾，你的瀏覽方式')}</h1>
                <p>{tr('從一個資料夾開始，把收藏整理成適合自己的畫面。')}</p>
                <Group>
                  <Button onClick={props.onCreate} disabled={props.busy}>
                    <Icon name="plus" size={16} /> {tr('新增專案')}
                  </Button>
                </Group>
              </div>
              {favorites.length > 0 && (
                <div className="home-section">
                  <h2>{tr('我的最愛')}</h2>
                  <div className="home-projects">
                    {favorites.map((p) => (
                      <button
                        key={p.projectId}
                        disabled={props.busy}
                        onClick={() => props.onSelect(p.projectId)}
                      >
                        <span>
                          <Icon name="heart" filled />
                        </span>
                        <strong>{title(p)}</strong>
                        <small>{p.root}</small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="home-section">
                <h2>{tr('未分類')}</h2>
                {unclassified.length ? (
                  <div className="home-projects">
                    {unclassified.map((p) => (
                      <button
                        key={p.projectId}
                        disabled={props.busy}
                        onClick={() => props.onSelect(p.projectId)}
                      >
                        <span>
                          <Icon name="folder" />
                        </span>
                        <strong>{title(p)}</strong>
                        <small>{p.root}</small>
                        <em>{p.error ? tr('需要重新連結') : tr('開啟專案 →')}</em>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="home-empty">
                    {projects.length
                      ? tr('目前專案都已歸組；可從左側群組開啟。')
                      : tr('尚未建立專案，選擇資料夾開始。')}
                  </div>
                )}
              </div>
              {projects.some((p) => p.error) && (
                <div className="home-section">
                  <h2>{tr('需要處理')}</h2>
                  {projects
                    .filter((p) => p.error)
                    .map((p) => (
                      <button
                        className="problem-project"
                        key={p.projectId}
                        disabled={props.busy}
                        onClick={() => props.onSelect(p.projectId)}
                      >
                        <strong>{title(p)}</strong>
                        <span>{p.root}</span>
                        <small>{p.error}</small>
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
      <footer className="statusbar">
        <span role="status" key={saving ? 'saving' : props.status}>
          {saving ? tr('保存側欄設定…') : props.status}
        </span>
        <span>
          {projects.length} {tr('個已連結專案')}
        </span>
        <span className="status-version" title={tr('應用程式版本')}>
          v{__APP_VERSION__}
        </span>
        <button
          onClick={props.onProblems}
          className={props.problemCount ? 'status-problems has-problems' : 'status-problems'}
          aria-label={tr('查看問題')}
        >
          {props.problemCount ? tr('{0} 個問題', props.problemCount) : tr('沒有問題')}
        </button>
      </footer>
      <Modal
        opened={!!form}
        onClose={closeForm}
        title={form?.id ? tr('重新命名群組') : tr('新增群組')}
        size="sm"
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (
              await mutate(
                form?.id
                  ? { action: 'renameGroup', id: form.id, name }
                  : { action: 'createGroup', name }
              )
            )
              setForm(undefined)
          }}
        >
          <Stack>
            <TextInput
              label={tr('群組名稱')}
              placeholder={tr('例如：動作遊戲、愛情漫畫')}
              value={name}
              maxLength={60}
              autoFocus
              onChange={(e) => setName(e.currentTarget.value)}
              required
            />
            {error && <Alert color="red">{error}</Alert>}
            <Group justify="flex-end">
              <Button variant="default" onClick={closeForm}>
                {tr('取消')}
              </Button>
              <Button type="submit" loading={saving} disabled={!name.trim()}>
                {tr('保存群組')}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
      <SearchDialog
        opened={searchOpen}
        close={() => setSearchOpen(false)}
        selected={selected}
        projects={projects}
        onSelect={props.onSelect}
        onSnapshot={props.onSnapshot}
        dirty={props.dirty}
      />
    </div>
  )
}
