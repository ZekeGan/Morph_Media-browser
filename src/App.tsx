import { syncPresetDraft } from '../shared/layouts'
import { t as tr, useLocale } from './i18n'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Group, Modal, Stack } from '@mantine/core'
import type {
  RootSelection,
  CleanupPreview,
  Project,
  ProjectInput,
  Request,
  Response,
  Snapshot,
} from '../shared/model'
import { Editor } from './editor/Editor'
import { usePlayback } from './media/Playback'
import { ProjectSettings } from './settings/ProjectSettings'
import { ProblemsDialog, problemCount } from './storage/ProblemsDialog'
import { CreateProjectDialog } from './shell/CreateProjectDialog'
import { ApplicationSettings } from './settings/ApplicationSettings'
import { DesktopShell } from './shell/DesktopShell'
import { RefreshContext } from './browse/refresh'
import { Toasts } from './notices/Toasts'
import { saveCardPreset, visibleCells } from '../shared/layouts'
import { BrowseWorkspace } from './browse/BrowseWorkspace'
import { contentCells, type ExplorerRequest, type ExplorerResponse } from '../shared/explorer'
import type { WorkspacePrefs } from '../shared/workspace'
import { describeError } from './notices/errors'
import type { Notice } from '../shared/notifications'

const empty: Snapshot = {
  projects: [],
  rows: [],
  problems: [],
  progress: { visited: 0, created: 0, errors: 0, active: false, cancelled: false },
}
type Act = (request: Request) => Promise<Response | undefined>
export function App() {
  useLocale()

  const [snapshot, setSnapshot] = useState(empty),
    [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false)
  const [notice, setNoticeState] = useState<Notice>(),
    [noticeVersion, setNoticeVersion] = useState(0)
  const setNotice = useCallback((value: Notice | undefined) => {
    setNoticeState(value)
    setNoticeVersion((v) => v + 1)
  }, [])
  const dismissNotice = useCallback(() => setNoticeState(undefined), [])
  const notifyError = useCallback(
    (message: string) => setNotice({ level: 'error', ...describeError(message) }),
    [setNotice]
  )
  // Async failures nobody caught used to vanish silently; surface them instead.
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error ? event.reason.message : String(event.reason)
      if (/AbortError|aborted|interrupted/i.test(reason + String(event.reason?.name))) return
      event.preventDefault()
      notifyError(reason)
    }
    window.addEventListener('unhandledrejection', onRejection)
    return () => window.removeEventListener('unhandledrejection', onRejection)
  }, [notifyError])
  const [settingsOverlay, setSettingsOverlay] = useState(false)
  const [toolbarTarget, setToolbarTarget] = useState<HTMLDivElement | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [createOpen, setCreateOpen] = useState(false),
    [input, setInput] = useState<ProjectInput>({
      // Filled with the localized default when the dialog opens (the locale is not loaded yet at first render).
      name: '',
      depth: { mode: 'through', level: 50 },
      scanAll: true,
    })
  const [rootChoice, setRootChoice] = useState<RootSelection>(),
    [createGroup, setCreateGroup] = useState(''),
    [groups, setGroups] = useState<WorkspacePrefs['groups']>([]),
    [settingsOpen, setSettingsOpen] = useState(false),
    [settingsStart, setSettingsStart] = useState<{ tab: string; site?: string }>()
  useEffect(() => {
    if (createOpen)
      void window.desktop
        .workspace()
        .then((r) => setGroups(r.prefs.groups))
        .catch((e) => notifyError(String(e)))
  }, [createOpen, notifyError])
  const [templateCategory, setTemplateCategory] = useState<string>()
  const [settings, setSettings] = useState<Project>(),
    [editor, setEditor] = useState(false),
    [detailsId, setDetailsId] = useState<string>(),
    [problems, setProblems] = useState(false)
  const [detailDirty, setDetailDirty] = useState(false),
    [editorDirty, setEditorDirty] = useState(false)
  const [shellDirty, setShellDirty] = useState(false),
    [shellOverlay, setShellOverlay] = useState(false)
  const [appearanceDirty, setAppearanceDirty] = useState(false)
  const [cleanup, setCleanup] = useState<CleanupPreview>(),
    [restart, setRestart] = useState(false)
  const act: Act = useCallback(
    async (request) => {
      if (busyRef.current && request.action !== 'cancelScan') return
      const ownBusy = request.action !== 'cancelScan'
      if (ownBusy) {
        busyRef.current = true
        setBusy(true)
      }
      try {
        const result = await window.media.request(request)
        setSnapshot(result.snapshot)
        if (!['snapshot', 'scan'].includes(request.action)) setNotice(undefined)
        if (result.notice) setNotice(result.notice)
        if (result.preview?.scope === 'all') {
          setCleanup(result.preview)
          setRestart(false)
        }
        return result
      } catch (error) {
        notifyError(String(error))
      } finally {
        if (ownBusy) {
          busyRef.current = false
          setBusy(false)
        }
      }
    },
    [notifyError, setNotice]
  )
  useEffect(() => {
    act({ action: 'snapshot' })
    return window.media.onProgress((progress) => setSnapshot((s) => ({ ...s, progress })))
  }, [act])
  useEffect(() => {
    if (selected && !snapshot.projects.some((p) => p.projectId === selected)) setSelected('')
  }, [snapshot.projects, selected])
  const modalOpen =
    createOpen ||
    settingsOpen ||
    !!settings ||
    editor ||
    detailDirty ||
    !!cleanup ||
    problems ||
    shellOverlay ||
    settingsOverlay
  useEffect(() => {
    const focus = () => {
      if (
        selected &&
        !modalOpen &&
        !busyRef.current &&
        !document.querySelector(
          '.mantine-Modal-content,.mantine-Drawer-content,.reader,.media-viewer-shell,.document-viewer'
        )
      )
        act({ action: 'scan' })
    }
    window.addEventListener('focus', focus)
    return () => window.removeEventListener('focus', focus)
  }, [modalOpen, selected, act])
  // Other parts of the window can open the settings on a tab, e.g. the website keys from a source preview (R-285).
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ tab: string; site?: string }>).detail
      setSettingsStart(detail)
      setSettingsOpen(true)
    }
    window.addEventListener('morph:open-settings', open)
    return () => window.removeEventListener('morph:open-settings', open)
  }, [])
  const playback = usePlayback()
  useEffect(() => {
    playback?.reconcile(snapshot.projects.map((link) => link.projectId))
  }, [snapshot.projects])
  const linked = snapshot.projects.find((p) => p.projectId === selected),
    project = linked?.project
  const settingsDirty =
    !!settings &&
    JSON.stringify(settings) !==
      JSON.stringify(snapshot.projects.find((p) => p.projectId === settings.projectId)?.project)
  const unsaved = detailDirty || editorDirty || settingsDirty || shellDirty || appearanceDirty
  const dirty = unsaved || createOpen
  const clearEditors = () => {
    setEditor(false)
    setTemplateCategory(undefined)
    setDetailsId(undefined)
    setSettings(undefined)
    setSettingsOpen(false)
  }
  const confirmLeave = () => !dirty || window.confirm(tr('離開會放棄尚未保存的草稿，確定繼續？'))
  const openProject = (id: string, rowId?: string, confirmed = false) => {
    if (!confirmed && !confirmLeave()) return false
    clearEditors()
    setCreateOpen(false)
    setSelected(id)
    if (rowId) setDetailsId(rowId)
    return true
  }
  const beginCreate = () => {
    if (confirmLeave()) {
      clearEditors()
      setInput((current) => ({ ...current, name: '' }))
      setRootChoice(undefined)
      setCreateGroup('')
      setCreateOpen(true)
    }
  }
  const beginLink = () => beginCreate()
  useLayoutEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || busyRef.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])
  const rows = useMemo(
    () => snapshot.rows.filter((r) => r.projectId === selected),
    [snapshot.rows, selected]
  )
  // Folders that more than one linked project shows; only these need the shared / this-project switch.
  const sharedFolders = useMemo(() => {
    const owners = new Map<string, Set<string>>()
    for (const r of snapshot.rows) {
      const id = r.record?.folderId
      if (id) owners.set(id, (owners.get(id) ?? new Set()).add(r.projectId))
    }
    return new Set([...owners].filter(([, set]) => set.size > 1).map(([id]) => id))
  }, [snapshot.rows])
  const chooseDetail = (id: string) => {
    setDetailsId(id)
    return true
  }
  const closeDetail = () => setDetailsId(undefined)
  const explore = async (request: ExplorerRequest): Promise<ExplorerResponse | undefined> => {
    // Preserve reader preferences even while another setting is saving.
    // Reading places (manga pages, novel positions) are saved even while something else runs.
    if (busyRef.current && request.action !== 'reading' && request.action !== 'novelProgress')
      return
    const ownBusy = !busyRef.current
    if (ownBusy) {
      busyRef.current = true
      setBusy(true)
    }
    try {
      const result = await window.explorer.request(request)
      if (result.snapshot) setSnapshot(result.snapshot)
      if (result.notice) setNotice(result.notice)
      return result
    } catch (error) {
      notifyError(String(error))
    } finally {
      if (ownBusy) {
        busyRef.current = false
        setBusy(false)
      }
    }
  }
  const saveEdited = async (p: Project, preset?: { name: string; asNew: boolean }) => {
    try {
      const next = templateCategory
        ? {
            ...p,
            cells: project!.cells,
            contentCells: { ...project!.contentCells, [templateCategory]: p.cells },
          }
        : p.layoutPresets
          ? syncPresetDraft(p)
          : saveCardPreset(
              p,
              preset ?? { name: tr('預設版面'), asNew: false },
              () => crypto.randomUUID(),
              project!
            )
      return !!(await act({ action: 'saveProject', project: next }))
    } catch (e) {
      notifyError(String(e))
      return false
    }
  }
  return (
    <>
      <Toasts
        notice={notice}
        version={noticeVersion}
        close={dismissNotice}
        progress={
          snapshot.progress.active ? (
            <>
              {tr('掃描 ') +
                snapshot.progress.visited +
                tr(' 筆 · 已建立 ') +
                snapshot.progress.created +
                tr(' 筆')}
              <Button
                size="compact-xs"
                variant="subtle"
                onClick={() => void act({ action: 'cancelScan' })}
              >
                {tr('取消掃描')}
              </Button>
            </>
          ) : null
        }
      />
      <RefreshContext.Provider value={refreshNonce}>
        <DesktopShell
          toolbarRef={setToolbarTarget}
          projects={snapshot.projects}
          rows={snapshot.rows}
          selected={selected}
          busy={busy}
          dirty={unsaved}
          onSelect={openProject}
          onCreate={() => beginCreate()}
          onSettings={() => {
            if (!confirmLeave()) return
            setSettingsStart(undefined)
            setSettingsOpen(true)
          }}
          onRefresh={() => {
            if (editor) return
            setRefreshNonce((value) => value + 1)
            void act({ action: 'scan' })
          }}
          onProjectSettings={(id) => {
            if (confirmLeave()) {
              const p = snapshot.projects.find((p) => p.projectId === id)?.project
              if (p) setSettings(structuredClone(p))
            }
          }}
          onProblems={() => setProblems(true)}
          problemCount={problemCount(snapshot)}
          onOverlay={setShellOverlay}
          onDirty={setShellDirty}
          onSnapshot={setSnapshot}
          status={
            snapshot.progress.active
              ? tr(
                  '掃描 {0} 筆 · 已建 {1} · 問題 {2}',
                  snapshot.progress.visited,
                  snapshot.progress.created,
                  snapshot.progress.errors
                )
              : busy
                ? tr('處理中…')
                : unsaved
                  ? tr('尚未保存')
                  : tr('就緒')
          }
          banner={null}
        >
          {editor && project ? (
            <Editor
              key={`${project.projectId}:${templateCategory ?? 'card'}`}
              act={act}
              presets={!templateCategory}
              targetLabel={
                templateCategory
                  ? tr(
                      '{0}資訊版面',
                      (
                        {
                          book: tr('書籍／漫畫'),
                          game: tr('遊戲'),
                          media: tr('影音'),
                          general: tr('一般'),
                        } as Record<string, string>
                      )[templateCategory] ?? tr('一般')
                    )
                  : tr('卡片')
              }
              onDirty={setEditorDirty}
              project={
                templateCategory
                  ? { ...project, cells: contentCells(project, templateCategory) }
                  : { ...project, cells: visibleCells(project) }
              }
              rows={(snapshot.structure ?? snapshot.rows).filter(
                (r) => r.projectId === selected && !r.readonly
              )}
              busy={busy}
              save={saveEdited}
              close={() => {
                setEditor(false)
                setTemplateCategory(undefined)
              }}
            />
          ) : project && !linked?.error ? (
            <BrowseWorkspace
              toolbarTarget={toolbarTarget}
              key={project.projectId}
              project={project}
              root={linked!.root}
              rows={rows}
              sharedFolders={sharedFolders}
              structure={(snapshot.structure ?? snapshot.rows).filter(
                (r) => r.projectId === selected
              )}
              selected={detailsId}
              onSelect={chooseDetail}
              onClose={closeDetail}
              busy={busy}
              act={act}
              run={explore}
              onDirty={setDetailDirty}
              onOverlay={setSettingsOverlay}
              notify={notifyError}
              edit={(category) => {
                if (!detailDirty || window.confirm(tr('放棄欄位草稿後編輯版面？'))) {
                  setTemplateCategory(category)
                  setEditor(true)
                }
              }}
            />
          ) : (
            <div className="empty">
              <h1>{tr('專案暫不可用')}</h1>
              <p className="path">{linked?.root}</p>
              <p>{tr('資料夾可能已搬移、離線，或資料夾資訊需要復原。')}</p>
              <Alert color="orange" mt="lg">
                {linked?.error ?? tr('請選擇專案或重新連結。')}
              </Alert>
              <Group justify="center" mt="md">
                <Button disabled={busy} onClick={beginLink}>
                  {tr('重新連結專案位置')}
                </Button>
                {linked && (
                  <>
                    <Button
                      color="orange"
                      variant="light"
                      disabled={busy}
                      onClick={() =>
                        window.confirm(
                          tr('從有效備份恢復主資料夾的資訊與專案設定？目前損壞的檔案會另外保留。')
                        ) && act({ action: 'restoreProject', projectId: linked.projectId })
                      }
                    >
                      {tr('從備份復原專案')}
                    </Button>
                    <Button
                      variant="default"
                      disabled={busy}
                      onClick={() => act({ action: 'unlink', projectId: linked.projectId })}
                    >
                      {tr('取消失效連結（保留資料夾資訊）')}
                    </Button>
                  </>
                )}
              </Group>
            </div>
          )}
        </DesktopShell>
      </RefreshContext.Provider>
      <CreateProjectDialog
        opened={createOpen}
        busy={busy}
        input={input}
        setInput={setInput}
        groups={groups}
        group={createGroup}
        setGroup={setCreateGroup}
        rootChoice={rootChoice}
        setRootChoice={setRootChoice}
        act={act}
        link={async (rootToken) => {
          const before = new Set(snapshot.projects.map((p) => p.projectId)),
            result = await act({ action: 'link', rootToken })
          if (!result || result.cancelled) return
          setCreateOpen(false)
          const next =
            result.snapshot.projects.find((p) => !before.has(p.projectId)) ??
            result.snapshot.projects.at(-1)
          if (next) openProject(next.projectId, undefined, true)
        }}
        close={() => {
          if (
            !busy &&
            ((!rootChoice && !input.name.trim()) ||
              window.confirm(tr('取消新增專案？尚未建立資料。')))
          )
            setCreateOpen(false)
        }}
        create={async () => {
          const result = await act({ action: 'create', input, rootToken: rootChoice!.token })
          if (result && !result.cancelled) {
            const id = result.snapshot.projects.at(-1)?.projectId
            if (id) {
              if (createGroup)
                try {
                  await window.desktop.updateWorkspace({
                    action: 'moveProject',
                    projectId: id,
                    groupId: createGroup,
                  })
                } catch (e) {
                  notifyError(tr('專案已建立，但群組保存失敗：') + String(e))
                }
              openProject(id, undefined, true)
            }
          }
        }}
      />
      <ApplicationSettings
        opened={settingsOpen}
        close={() => setSettingsOpen(false)}
        onDirty={setAppearanceDirty}
        act={act}
        busy={busy}
        start={settingsStart}
      />
      <Modal
        opened={!!settings}
        onClose={() => {
          if (!busy && (!settingsDirty || window.confirm(tr('放棄尚未保存的專案設定？'))))
            setSettings(undefined)
        }}
        title={
          tr('專案設定 · ') +
          (snapshot.projects.find((p) => p.projectId === settings?.projectId)?.project?.name ?? '')
        }
        size="lg"
      >
        {settings && (
          <ProjectSettings
            key={settings.projectId}
            project={settings}
            root={snapshot.projects.find((p) => p.projectId === settings.projectId)?.root ?? ''}
            busy={busy}
            dirty={settingsDirty}
            change={setSettings}
            act={act}
            close={() => setSettings(undefined)}
            saved={
              snapshot.projects.find((p) => p.projectId === settings.projectId)?.project ?? settings
            }
          />
        )}
      </Modal>
      <ProblemsDialog
        opened={problems}
        close={() => setProblems(false)}
        snapshot={snapshot}
        busy={busy}
        act={act}
        run={explore}
        relink={() => {
          setProblems(false)
          void beginLink()
        }}
        openFolder={(row) => {
          setProblems(false)
          openProject(row.projectId, row.rowId)
        }}
      />
      <Modal
        opened={!!cleanup}
        onClose={() => setCleanup(undefined)}
        title={tr('清理預覽：原始媒體不刪除')}
        size="xl"
      >
        {cleanup && (
          <Stack>
            <p>
              {tr('範圍：')}
              {cleanup.scope === 'all'
                ? tr('全部已連結可存取資料；完成後退出連結')
                : cleanup.scope === 'private'
                  ? tr('只在這個專案的資訊')
                  : tr('此資料夾所有 M:orph 建立的資訊')}
              {tr('。找到')}
              {cleanup.count} {tr('個資料夾的資訊。')}
            </p>
            <div className="file-list">
              {cleanup.paths.map((p) => (
                <div key={p}>{p}</div>
              ))}
            </div>
            <Alert color="orange">
              {tr('未連結或離線的副本不在這次範圍內。不認得的檔案與無法確認的資訊都會保留。')}
              {cleanup.skipped.map((s, i) => (
                <div key={i}>{tr(s)}</div>
              ))}
            </Alert>
            {cleanup.scope === 'folder' && (
              <Checkbox
                label={tr('清除後立即重新開始記錄（預設為停止記錄）')}
                checked={restart}
                onChange={(e) => setRestart(e.currentTarget.checked)}
              />
            )}
            <Button
              color="red"
              loading={busy}
              onClick={async () => {
                if (await act({ action: 'cleanup', token: cleanup.token, restart })) {
                  setCleanup(undefined)
                  setDetailsId(undefined)
                }
              }}
            >
              {tr('確認清除列出的 M:orph 資訊')}
            </Button>
          </Stack>
        )}
      </Modal>
    </>
  )
}
