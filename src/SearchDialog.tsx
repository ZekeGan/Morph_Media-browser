import { stabilizeQuery, type StableQuery } from '../shared/query'
import { t as tr, useLocale } from './i18n'
import { Icon } from './icons'
import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  Pagination,
  Popover,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import type { LinkedProject, Snapshot } from '../shared/model'
import type { SearchHit, SearchResult } from '../shared/explorer'
import './search-dialog.css'
export function SearchDialog({
  opened,
  close,
  selected,
  projects,
  onSelect,
  onSnapshot,
  dirty,
}: {
  opened: boolean
  close: () => void
  selected: string
  projects: LinkedProject[]
  onSelect: (projectId: string, rowId?: string) => boolean
  onSnapshot: (s: Snapshot) => void
  dirty: boolean
}) {
  useLocale()

  const [scope, setScope] = useState('all'),
    [query, setQuery] = useState(''),
    [page, setPage] = useState(1),
    [result, setResult] = useState<SearchResult>(),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [saveName, setSaveName] = useState(''),
    [hit, setHit] = useState<SearchHit>()
  const [queryAst, setQueryAst] = useState<StableQuery>()
  const [savedOpen, setSavedOpen] = useState(false),
    [saveOpen, setSaveOpen] = useState(false),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState('')
  const queryInput = useRef<HTMLInputElement>(null),
    nameInput = useRef<HTMLInputElement>(null)
  const project = projects.find((p) => p.projectId === selected)?.project
  const savedSearches = project?.savedSearches ?? [],
    match = query.trim().toLocaleLowerCase(),
    savedMatches = savedSearches.filter(
      (s) =>
        !match ||
        s.name.toLocaleLowerCase().includes(match) ||
        s.query.toLocaleLowerCase().includes(match)
    )
  const canSave =
    !!project &&
    !dirty &&
    !busy &&
    !saving &&
    !error &&
    !!query.trim() &&
    savedSearches.length < 100
  useEffect(() => {
    setScope(selected ? 'current' : 'all')
  }, [selected])
  useEffect(() => {
    setPage(1)
  }, [query, scope])
  useEffect(() => {
    setSavedOpen(false)
    setSaveOpen(false)
    setSaveName('')
    setSaveError('')
  }, [opened, selected])
  useEffect(() => {
    if (saveOpen) nameInput.current?.focus()
  }, [saveOpen])
  useEffect(() => {
    if (!opened || (!savedOpen && !saveOpen)) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return
      event.preventDefault()
      if (savedOpen) setSavedOpen(false)
      else if (!saving) {
        setSaveOpen(false)
        setSaveName('')
        setSaveError('')
      }
      queryInput.current?.focus()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [opened, savedOpen, saveOpen, saving])
  useEffect(() => {
    if (!opened) return
    let alive = true
    setBusy(true)
    setError('')
    setHit(undefined)
    setResult(undefined)
    const timer = setTimeout(() => {
      window.explorer
        .request({
          action: 'search',
          query,
          queryAst,
          projectId: scope === 'current' ? selected : undefined,
          offset: (page - 1) * 100,
          limit: 100,
        })
        .then((r) => {
          if (alive) {
            setResult(r.search)
            if (queryAst && r.search?.resolvedQuery) setQuery(r.search.resolvedQuery)
            setHit(r.search?.hits[0])
          }
        })
        .catch((e) => {
          if (alive) {
            setResult(undefined)
            setError(String(e))
          }
        })
        .finally(() => {
          if (alive) setBusy(false)
        })
    }, 150)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [opened, query, queryAst, scope, selected, page, projects])
  const changeQuery = (value: string) => {
    setQueryAst(undefined)
    setQuery(value)
    setHit(undefined)
    setResult(undefined)
    setBusy(true)
    setError('')
    setSaveError('')
    setSavedOpen(!!value.trim() && !!savedSearches.length)
  }
  const open = (target = hit) => {
    if (target && !busy && !saving && !error && onSelect(target.projectId, target.rowId)) close()
  }
  const cancelSave = () => {
    setSaveOpen(false)
    setSaveName('')
    setSaveError('')
    queryInput.current?.focus()
  }
  const save = async () => {
    if (!project || !canSave) return
    const name = saveName.trim() || query.trim().slice(0, 60)
    setSaving(true)
    setSaveError('')
    try {
      const response = await window.media.request({
        action: 'saveProject',
        project: {
          ...project,
          savedSearches: [
            ...savedSearches,
            {
              id: crypto.randomUUID(),
              name,
              query,
              queryAst: queryAst ?? stabilizeQuery(query, result?.fields ?? []),
            },
          ],
        },
      })
      onSnapshot(response.snapshot)
      cancelSave()
    } catch (e) {
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }
  const removeSaved = async (id: string) => {
    if (!project || dirty || saving) return
    setSaving(true)
    setSaveError('')
    try {
      const response = await window.media.request({
        action: 'saveProject',
        project: { ...project, savedSearches: savedSearches.filter((s) => s.id !== id) },
      })
      onSnapshot(response.snapshot)
    } catch (e) {
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal
      opened={opened}
      onClose={close}
      closeOnEscape={!savedOpen && !saveOpen}
      title={tr('搜尋資料夾')}
      size="xl"
      classNames={{ body: 'folder-search-dialog' }}
    >
      <Stack gap="md">
        <Stack gap="xs" className="search-keyword-block">
          <div className="folder-search-inputs">
            <Group gap="xs" wrap="nowrap">
              <TextInput
                ref={queryInput}
                className="search-query"
                aria-label={tr('資料夾名稱、路徑或欄位值')}
                placeholder={tr('搜尋資料夾名稱、路徑或欄位值…')}
                aria-describedby="search-input-hint"
                data-autofocus
                value={query}
                maxLength={2000}
                onChange={(e) => changeQuery(e.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    open()
                  }
                }}
                leftSection={<Icon name="search" size={17} />}
                rightSection={
                  query ? (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      aria-label={tr('清除搜尋')}
                      onClick={() => {
                        changeQuery('')
                        queryInput.current?.focus()
                      }}
                    >
                      <Icon name="close" size={15} />
                    </ActionIcon>
                  ) : null
                }
              />
              <ActionIcon
                size="lg"
                variant="default"
                aria-label={tr('保存目前條件')}
                title={canSave ? tr('保存目前條件') : tr('先輸入搜尋條件，才能保存為常用搜尋')}
                disabled={!canSave}
                onClick={() => {
                  setSavedOpen(false)
                  setSaveOpen(true)
                  setSaveError('')
                }}
              >
                <Icon name="plus" size={17} />
              </ActionIcon>
            </Group>
            <Select
              aria-label={tr('搜尋範圍')}
              placeholder={tr('搜尋範圍')}
              data={[
                {
                  value: 'current',
                  label: project ? tr('目前專案 · ') + project.name : tr('目前專案'),
                  disabled: !selected,
                },
                { value: 'all', label: tr('全部已連結專案') },
              ]}
              value={scope}
              allowDeselect={false}
              onChange={(v) => {
                const next = v ?? 'all'
                if (next === scope) return
                setScope(next)
                setHit(undefined)
                setResult(undefined)
                setBusy(true)
              }}
            />
          </div>
          {saveOpen && (
            <form
              className="search-save-form"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <TextInput
                ref={nameInput}
                className="search-query"
                label={tr('常用搜尋名稱')}
                value={saveName}
                maxLength={100}
                placeholder={tr('輸入名稱（留空使用搜尋文字）')}
                disabled={saving}
                onChange={(e) => setSaveName(e.currentTarget.value)}
              />
              <Group gap="xs">
                <Button size="sm" variant="default" disabled={saving} onClick={cancelSave}>
                  {tr('取消保存')}
                </Button>
                <Button size="sm" type="submit" disabled={!canSave} loading={saving}>
                  {tr('保存到目前專案')}
                </Button>
              </Group>
            </form>
          )}
          <Popover
            opened={savedOpen}
            onChange={setSavedOpen}
            position="bottom-start"
            width="target"
            withinPortal={false}
          >
            <Popover.Target>
              <Button
                className="saved-search-toggle"
                variant="subtle"
                color="gray"
                fullWidth
                aria-label={tr('常用搜尋')}
                onClick={() => setSavedOpen((v) => !v)}
                rightSection={<span aria-hidden="true">{savedMatches.length} ▾</span>}
              >
                {query.trim() ? tr('符合的常用搜尋') : tr('常用搜尋')}
                {savedMatches.length === 0 && !query.trim() ? ' · ' + tr('尚無') : ''}
              </Button>
            </Popover.Target>
            <Popover.Dropdown className="saved-search-dropdown">
              <Stack gap="xs">
                <Text size="xs" c="dimmed">
                  {tr('選擇條件以套用；右側 × 可刪除。')}
                </Text>
                <div className="saved-search-list">
                  {savedMatches.map((s) => (
                    <div className="saved-search-row" key={s.id}>
                      <button
                        className="saved-search-apply"
                        disabled={saving}
                        title={s.query}
                        onClick={() => {
                          setQueryAst(s.queryAst)
                          setQuery(s.query)
                          setPage(1)
                          if (query !== s.query || queryAst !== s.queryAst || page !== 1) {
                            setHit(undefined)
                            setResult(undefined)
                            setBusy(true)
                          }
                          setSavedOpen(false)
                          queryInput.current?.focus()
                        }}
                      >
                        <strong>{s.name}</strong>
                        <small>{s.query}</small>
                      </button>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="gray"
                        aria-label={tr('刪除常用搜尋 {0}', s.name)}
                        disabled={saving || dirty}
                        onClick={() => void removeSaved(s.id)}
                      >
                        <Icon name="close" size={15} />
                      </ActionIcon>
                    </div>
                  ))}
                  {!savedMatches.length && (
                    <Text size="sm" c="dimmed">
                      {!project
                        ? tr('開啟專案後可保存常用搜尋。')
                        : savedSearches.length
                          ? tr('沒有符合的常用搜尋')
                          : tr('尚未保存常用搜尋')}
                    </Text>
                  )}
                </div>
              </Stack>
            </Popover.Dropdown>
          </Popover>
          <Text id="search-input-hint" size="xs" c="dimmed">
            {tr('輸入會搜尋資料夾，並配對常用搜尋名稱與條件；按 + 保存目前條件。')}
          </Text>
          {error && (
            <Alert color="red" title={tr('搜尋未完成')}>
              {error}
            </Alert>
          )}
          {saveError && (
            <Alert color="red" title={tr('常用搜尋未更新')}>
              {saveError}
            </Alert>
          )}
          {!!result?.incomplete.length && (
            <Alert color="orange" title={tr('部分結果無法取得')}>
              {tr('以下專案離線或不完整：')}
              {result.incomplete.join('、')}
            </Alert>
          )}
        </Stack>
        <Group justify="space-between" gap="xs">
          <Text size="sm" c="dimmed">
            {query.trim() ? tr('搜尋結果') : tr('可搜尋的資料夾')}
          </Text>
          <Group gap="xs">
            {busy && <Loader size="xs" />}
            <Badge color="gray" variant="light">
              {busy ? tr('搜尋中…') : tr('{0} 個資料夾', result?.total ?? 0)}
            </Badge>
          </Group>
        </Group>
        <div className="search-results" aria-label={tr('搜尋結果')} aria-busy={busy}>
          {!error &&
            result?.hits.map((r) => (
              <button
                key={r.rowId}
                className={hit?.rowId === r.rowId ? 'selected' : ''}
                aria-pressed={hit?.rowId === r.rowId}
                disabled={busy || saving}
                onClick={() => setHit(r)}
                onDoubleClick={() => open(r)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    open(r)
                  }
                }}
              >
                <strong>{r.name}</strong>
                <span>{projects.find((p) => p.projectId === r.projectId)?.project?.name}</span>
                <small>{r.path}</small>
                {!!r.matched.length && (
                  <small>
                    {tr('符合：')}
                    {r.matched
                      .map((key) =>
                        key === 'folder_name' ? tr('資料夾名稱') : key === 'path' ? tr('路徑') : key
                      )
                      .join('、')}
                  </small>
                )}
              </button>
            ))}
          {!busy && !error && !result?.hits.length && (
            <div className="search-empty">
              <Text fw={500}>
                {query.trim() ? tr('找不到符合的資料夾') : tr('目前沒有可搜尋的資料夾')}
              </Text>
              <Text size="sm" c="dimmed">
                {query.trim()
                  ? tr('試試較短的關鍵字，或切換搜尋範圍。')
                  : tr('先建立／連結專案，並確認資料夾已完成掃描。')}
              </Text>
            </div>
          )}
        </div>
        {(result?.total ?? 0) > 100 && (
          <Pagination
            total={Math.ceil(result!.total / 100)}
            value={page}
            onChange={setPage}
            disabled={busy}
            size="sm"
          />
        )}
        <Group className="search-footer" justify="space-between">
          <Text size="xs" c="dimmed">
            {tr('選取結果後開啟，也可雙擊直接進入。')}
          </Text>
          <Group gap="xs">
            <Button variant="default" onClick={close}>
              {tr('取消')}
            </Button>
            <Button disabled={!hit || busy || saving || !!error} onClick={() => open()}>
              {tr('開啟資料夾')}
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
