import { syncPresetDraft } from '../shared/layouts'
import { t as tr, useLocale } from './i18n'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  TextInput,
} from '@mantine/core'
import type {
  CleanupPreview,
  LegacyPreview,
  Project,
  ProjectInput,
  Request,
  Response,
  Snapshot,
} from '../shared/model'
import { Editor } from './Editor'
import { usePlayback } from './Playback'
import { ProjectSettings } from './ProjectSettings'
import { ApplicationSettings } from './ApplicationSettings'
import { DesktopShell } from './DesktopShell'
import { Toasts } from './Toasts'
import { saveCardPreset, visibleCells } from '../shared/layouts'
import { BrowseWorkspace } from './BrowseWorkspace'
import { contentCells, type ExplorerRequest, type ExplorerResponse } from '../shared/explorer'
import type { WorkspacePrefs } from '../shared/workspace'
import { describeError } from './errors'
import type { Notice } from '../shared/notifications'

const empty: Snapshot = {
  projects: [],
  rows: [],
  problems: [],
  progress: { visited: 0, created: 0, errors: 0, active: false, cancelled: false },
  legacyAvailable: false,
}
type Act = (request: Request) => Promise<Response | undefined>
function Depth({
  depth,
  change,
}: {
  depth: Project['depth']
  change: (d: Project['depth']) => void
}) {
  useLocale()

  return (
    <Group align="end">
      <Select
        label={tr('顯示模式（根為第 1 層）')}
        value={depth.mode}
        data={[
          { value: 'through', label: tr('顯示第 1 至 N 層') },
          { value: 'exact', label: tr('只顯示第 N 層') },
        ]}
        onChange={(v) => change({ ...depth, mode: v as 'through' | 'exact' })}
      />
      <NumberInput
        label={tr('N 層')}
        min={1}
        max={50}
        value={depth.level}
        onChange={(v) => typeof v === 'number' && change({ ...depth, level: v })}
      />
    </Group>
  )
}
export function App() {
  const categories = [
    { value: 'media', label: tr('媒體') },
    { value: 'manga', label: tr('漫畫') },
    { value: 'album', label: tr('相簿') },
    { value: 'game', label: tr('遊戲') },
    { value: 'video', label: tr('影片') },
    { value: 'music', label: tr('音樂') },
    { value: 'other', label: tr('其他') },
  ]

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
  const [createOpen, setCreateOpen] = useState(false),
    [input, setInput] = useState<ProjectInput>({
      // Filled with the localized default when the dialog opens (the locale is not loaded yet at first render).
      name: '',
      mediaCategory: 'manga',
      depth: { mode: 'through', level: 50 },
      scanAll: true,
    })
  const [rootChoice, setRootChoice] = useState<{ token: string; path: string }>(),
    [createGroup, setCreateGroup] = useState(''),
    [groups, setGroups] = useState<WorkspacePrefs['groups']>([]),
    [settingsOpen, setSettingsOpen] = useState(false)
  useEffect(() => {
    if (createOpen)
      setInput((current) => (current.name ? current : { ...current, name: tr('我的媒體') }))
  }, [createOpen])
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
    [restart, setRestart] = useState(false),
    [legacy, setLegacy] = useState<LegacyPreview>(),
    [legacyIds, setLegacyIds] = useState<string[]>([])
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
        if (result.legacy) {
          setLegacy(result.legacy)
          setLegacyIds([])
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
    !!legacy ||
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
      setRootChoice(undefined)
      setCreateGroup('')
      setCreateOpen(true)
    }
  }
  const beginLink = async () => {
    if (!confirmLeave()) return
    clearEditors()
    const before = new Set(snapshot.projects.map((p) => p.projectId)),
      result = await act({ action: 'link' })
    if (result && !result.cancelled) {
      const next =
        result.snapshot.projects.find((p) => !before.has(p.projectId)) ??
        result.snapshot.projects.at(-1)
      if (next) openProject(next.projectId, undefined, true)
    }
  }
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
  const chooseDetail = (id: string) => {
    setDetailsId(id)
    return true
  }
  const closeDetail = () => setDetailsId(undefined)
  const explore = async (request: ExplorerRequest): Promise<ExplorerResponse | undefined> => {
    // Preserve reader preferences even while another setting is saving.
    if (busyRef.current && request.action !== 'reading') return
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
      <DesktopShell
        toolbarRef={setToolbarTarget}
        projects={snapshot.projects}
        rows={snapshot.rows}
        selected={selected}
        busy={busy}
        dirty={unsaved}
        onSelect={openProject}
        onCreate={beginCreate}
        onSettings={() => {
          if (confirmLeave()) setSettingsOpen(true)
        }}
        onProjectSettings={(id) => {
          if (confirmLeave()) {
            const p = snapshot.projects.find((p) => p.projectId === id)?.project
            if (p) setSettings(structuredClone(p))
          }
        }}
        onLink={() => void beginLink()}
        onProblems={() => setProblems(true)}
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
        footer={
          <>
            {snapshot.legacyAvailable && (
              <Button variant="subtle" size="xs" onClick={() => act({ action: 'legacyPreview' })}>
                {tr('檢視舊資料匯入')}
              </Button>
            )}
            <Button
              color="red"
              variant="subtle"
              size="xs"
              disabled={busy || dirty}
              onClick={() => act({ action: 'cleanupAllPreview' })}
            >
              {tr('清理全部已連結資料')}
            </Button>
          </>
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
                    categories.find((c) => c.value === templateCategory)?.label ?? tr('媒體')
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
            <p>{tr('資料夾可能已搬移、離線，或記錄需要復原。')}</p>
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
                        tr('從有效備份恢復根記錄與專案設定？目前損壞檔會另外保留。')
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
                    {tr('取消失效連結（保留可攜檔）')}
                  </Button>
                </>
              )}
            </Group>
          </div>
        )}
      </DesktopShell>
      <Modal
        opened={createOpen}
        onClose={() => {
          if (!busy && window.confirm(tr('取消建立專案？尚未建立資料。'))) setCreateOpen(false)
        }}
        title={tr('建立媒體專案')}
        size="lg"
      >
        <Stack>
          <TextInput
            label={tr('專案名稱')}
            value={input.name}
            maxLength={100}
            onChange={(e) => setInput({ ...input, name: e.currentTarget.value })}
          />
          <Select
            label={tr('媒體分類')}
            data={categories.filter((category) =>
              ['media', 'manga', 'game'].includes(category.value)
            )}
            value={input.mediaCategory}
            onChange={(v) => setInput({ ...input, mediaCategory: v ?? 'other' })}
          />
          <Button
            variant="default"
            disabled={busy}
            onClick={async () => {
              const result = await act({ action: 'chooseRoot' })
              if (result?.rootSelection) setRootChoice(result.rootSelection)
            }}
          >
            {tr('選擇資料夾')}
          </Button>
          <p className="path" aria-label={tr('已選資料夾')}>
            {rootChoice?.path ?? tr('尚未選擇資料夾')}
          </p>
          <Select
            label={tr('所屬群組')}
            disabled={!rootChoice}
            value={createGroup}
            allowDeselect={false}
            data={[
              { value: '', label: tr('未分類') },
              ...groups.map((g) => ({ value: g.id, label: g.name })),
            ]}
            onChange={(v) => setCreateGroup(v ?? '')}
          />

          <Button
            loading={busy}
            disabled={!rootChoice || !input.name.trim()}
            onClick={async () => {
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
          >
            {tr('完成建立')}
          </Button>
          {(!rootChoice || !input.name.trim()) && (
            <small className="muted" role="status">
              {!input.name.trim() ? tr('請輸入專案名稱') : tr('請先選擇要瀏覽的資料夾')}
            </small>
          )}
        </Stack>
      </Modal>
      <ApplicationSettings
        opened={settingsOpen}
        close={() => setSettingsOpen(false)}
        onDirty={setAppearanceDirty}
        maintenance={
          <>
            <Button variant="default" disabled={busy} onClick={() => void beginLink()}>
              {tr('重新連結專案')}
            </Button>
            {snapshot.legacyAvailable && (
              <Button
                variant="default"
                disabled={busy}
                onClick={() => {
                  setSettingsOpen(false)
                  void act({ action: 'legacyPreview' })
                }}
              >
                {tr('檢視舊資料匯入')}
              </Button>
            )}
            <Button
              variant="subtle"
              color="red"
              disabled={busy}
              onClick={() => {
                setSettingsOpen(false)
                void act({ action: 'cleanupAllPreview' })
              }}
            >
              {tr('清理全部已連結資料')}
            </Button>
          </>
        }
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
            categories={categories}
            change={setSettings}
            act={act}
            close={() => setSettings(undefined)}
          />
        )}
      </Modal>
      <Modal
        opened={problems}
        onClose={() => setProblems(false)}
        title={tr('問題與復原')}
        size="xl"
      >
        <Stack>
          <p>
            {tr(
              '唯讀／損壞項目可從列表詳情重試或恢復；重複 ID 的副本可另配新 ID。根失效時使用「重新連結專案」。'
            )}
          </p>
          {[
            ...snapshot.problems,
            ...rows.filter((r) => r.duplicate).map((r) => `${r.path}: ${r.error}`),
          ].map((text, i) => (
            <Alert key={i} color="orange">
              {text}
            </Alert>
          ))}
          {!snapshot.problems.length && !rows.some((r) => r.duplicate) && (
            <p>{tr('目前沒有已知問題。')}</p>
          )}
          <Button loading={busy} onClick={() => act({ action: 'scan' })}>
            {tr('重新掃描並重建列表')}
          </Button>
        </Stack>
      </Modal>
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
                  ? tr('本專案私有覆寫')
                  : tr('此資料夾全部程式資料')}
              {tr('。找到')}
              {cleanup.count} {tr('筆記錄。')}
            </p>
            <div className="file-list">
              {cleanup.paths.map((p) => (
                <div key={p}>{p}</div>
              ))}
            </div>
            <Alert color="orange">
              {tr('未連結／離線副本不在本次範圍。未知檔案與無法驗證的記錄保留。')}
              {cleanup.skipped.map((s, i) => (
                <div key={i}>{s}</div>
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
              {tr('確認清理列出的本程式資料')}
            </Button>
          </Stack>
        )}
      </Modal>
      <Modal
        opened={!!legacy}
        onClose={() => setLegacy(undefined)}
        title={tr('舊資料匯入預覽')}
        size="xl"
      >
        {legacy && (
          <Stack>
            {legacy.warnings.map((w, i) => (
              <Alert key={i} color="orange">
                {w}
              </Alert>
            ))}
            {legacy.projects.map((p) => (
              <Checkbox
                key={p.id}
                checked={legacyIds.includes(p.id)}
                onChange={(e) =>
                  setLegacyIds(
                    e.currentTarget.checked
                      ? [...legacyIds, p.id]
                      : legacyIds.filter((id) => id !== p.id)
                  )
                }
                label={tr('{0} · {1} · {2} 筆', p.name, p.root, p.values)}
              />
            ))}
            <Depth depth={input.depth} change={(depth) => setInput({ ...input, depth })} />
            <Button
              loading={busy}
              disabled={!legacyIds.length}
              onClick={async () => {
                if (
                  await act({
                    action: 'legacyImport',
                    token: legacy.token,
                    ids: legacyIds,
                    depth: input.depth,
                  })
                )
                  setLegacy(undefined)
              }}
            >
              {tr('備份舊檔並匯入選定專案')}
            </Button>
          </Stack>
        )}
      </Modal>
    </>
  )
}
