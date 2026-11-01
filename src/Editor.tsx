import { Icon } from './icons'
import { t as tr, useLocale } from './i18n'
import { cellColors } from './themes/cellStyle'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Menu,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import GridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import { transformStrategy } from 'react-grid-layout/core'
import { localDragPosition } from './editorDrag'
import {
  type Cell,
  type CellKind,
  type FolderRow,
  type Project,
  type Request,
  type Response,
  type FieldDeletionPreview,
  fieldValue,
  cellsWithoutField,
} from '../shared/model'
import { CellContent } from './Card'
import { EditorInspector } from './EditorInspector'
import { EditorPalette } from './EditorPalette'
import { cellType, isFieldKind } from '../shared/explorer'
import {
  editorFields,
  presetDraft,
  syncPresetDraft,
  selectPreset,
  addPreset,
  renamePreset,
  removePreset,
} from '../shared/layouts'

export function Editor({
  project,
  rows,
  busy,
  save,
  close,
  act,
  onDirty,
  targetLabel = tr('卡片'),
  presets = false,
}: {
  project: Project
  rows: FolderRow[]
  busy: boolean
  act: (request: Request) => Promise<Response | undefined>
  save: (p: Project, preset?: { name: string; asNew: boolean }) => Promise<boolean>
  close: () => void
  onDirty: (dirty: boolean) => void
  targetLabel?: string
  presets?: boolean
}) {
  const labels: Record<CellKind, string> = {
    name: tr('資料夾名稱'),
    path: tr('目前路徑'),
    'field-text': tr('文字欄位'),
    'field-tags': tr('標籤'),
    'field-number': tr('數字'),
    'field-date': tr('日期時間'),
    'field-boolean': tr('是／否'),
    'field-enum': tr('單選'),
    'field-url': tr('網址'),
    'field-date-only': tr('日期'),
    'static-text': tr('版面文字'),
    spacer: tr('空白間距'),
    'system-info': tr('系統資訊'),
    image: tr('圖片'),
    divider: tr('分隔線'),
    'open-folder': tr('開啟資料夾'),
    'game-cover': tr('遊戲封面'),
    'game-launch': tr('啟動遊戲'),
  }
  // One line saying what each component is for; shown as palette tooltips and under the inspector title.
  const hints: Record<CellKind, string> = {
    name: tr('顯示資料夾名稱'),
    path: tr('顯示資料夾的完整路徑'),
    'field-text': tr('顯示一個文字欄位的值'),
    'field-tags': tr('顯示一個標籤欄位的值'),
    'field-number': tr('顯示一個數字欄位，可呈現為評分或進度'),
    'field-date': tr('顯示一個日期時間欄位的值'),
    'field-boolean': tr('顯示一個是／否欄位的值'),
    'field-enum': tr('顯示一個單選欄位的值'),
    'field-url': tr('顯示一個網址欄位，可自訂連結文字'),
    'field-date-only': tr('顯示一個日期欄位的值'),
    'static-text': tr('只存在版面的標題或說明，不是資料夾的資料'),
    spacer: tr('空白位置，用來撐開版面'),
    'system-info': tr('顯示分類、檔案數或容量'),
    image: tr('可為每個資料夾各自選圖，也可留空'),
    divider: tr('分隔線'),
    'open-folder': tr('一鍵開啟這個資料夾'),
    'game-cover': tr('顯示這個遊戲資料夾的封面'),
    'game-launch': tr('一鍵啟動這個遊戲（使用資料夾綁定的啟動檔）'),
  }
  const typeHints: Record<string, string> = {
    string: tr('一般文字，例如備註、作者'),
    tags: tr('多個標籤，例如類型、角色'),
    number: tr('數字，組件可呈現為評分或進度'),
    datetime: tr('日期加時間'),
    boolean: tr('是／否／未填'),
    enum: tr('從固定選項中選一個，例如狀態'),
    url: tr('網址，可自訂連結文字'),
    date: tr('只有日期，例如發售日'),
  }
  const typeLabels: Record<string, string> = {
    string: tr('文字'),
    tags: tr('標籤'),
    number: tr('數字'),
    datetime: tr('日期時間'),
    boolean: tr('是／否'),
    enum: tr('單選'),
    url: tr('網址'),
    date: tr('日期'),
  }

  useLocale()

  const [initial, setInitial] = useState(() =>
    presets ? presetDraft(project) : structuredClone(project)
  )
  const [draft, setDraft] = useState(() => structuredClone(initial))
  const [past, setPast] = useState<Project[]>([]),
    [future, setFuture] = useState<Project[]>([])
  const [selected, setSelected] = useState(''),
    [previewId, setPreviewId] = useState<string | undefined>(rows[0]?.rowId)
  const [error, setError] = useState('')
  const [openSections, setOpenSections] = useState<string[]>(['content', 'position']),
    [optionError, setOptionError] = useState(''),
    [renaming, setRenaming] = useState<{ id: string; name: string }>()
  const [schemeAction, setSchemeAction] = useState<'new' | 'copy' | 'rename'>(),
    [schemeName, setSchemeName] = useState('')
  const [pendingPreset, setPendingPreset] = useState<string>()
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const [fieldDeletion, setFieldDeletion] = useState<FieldDeletionPreview>()

  useLayoutEffect(() => {
    onDirty(dirty)
    return () => onDirty(false)
  }, [dirty, onDirty])
  const { width, containerRef, mounted } = useContainerWidth()
  const dragGrab = useRef({ x: 0, y: 0 })
  // The browser's own drag picture is positioned by the OS and can land away from the cursor, so it is replaced by
  // a transparent one and a copy of the item that follows the cursor with its middle under the pointer.
  const dragImage = (event: React.DragEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    dragGrab.current = { x: rect.width / 2, y: rect.height / 2 }
    const ghost = event.currentTarget.cloneNode(true) as HTMLElement,
      blank = document.createElement('canvas')
    blank.width = blank.height = 1
    event.dataTransfer.setDragImage(blank, 0, 0)
    ghost.classList.add('palette-drag-ghost')
    ghost.setAttribute('aria-hidden', 'true')
    Object.assign(ghost.style, { width: rect.width + 'px', height: rect.height + 'px' })
    const place = (x: number, y: number) => {
      ghost.style.left = x - rect.width / 2 + 'px'
      ghost.style.top = y - rect.height / 2 + 'px'
    }
    place(event.clientX, event.clientY)
    document.body.append(ghost)
    const move = (e: DragEvent) => {
      // Some drag events report 0,0 while leaving the window; keep the last known place.
      if (e.clientX || e.clientY) place(e.clientX, e.clientY)
    }
    const end = () => {
      ghost.remove()
      for (const name of ['dragover', 'drag'])
        document.removeEventListener(name, move as EventListener, true)
      for (const name of ['dragend', 'drop']) document.removeEventListener(name, end, true)
    }
    for (const name of ['dragover', 'drag'])
      document.addEventListener(name, move as EventListener, true)
    for (const name of ['dragend', 'drop']) document.addEventListener(name, end, true)
  }
  const gridPosition = useMemo(
    () => ({
      ...transformStrategy,
      calcDragPosition: (clientX: number, clientY: number, offsetX: number, offsetY: number) => {
        const grid = containerRef.current?.querySelector<HTMLElement>('.react-grid-layout')
        return grid
          ? localDragPosition(
              clientX,
              clientY,
              offsetX,
              offsetY,
              grid.getBoundingClientRect(),
              1,
              grid.scrollLeft,
              grid.scrollTop
            )
          : { left: 0, top: 0 }
      },
    }),
    [containerRef]
  )
  const level = draft.cells
  const withLevel = (cells: Cell[]): Project => ({ ...draft, cells })
  const selectedCell = level.find((c) => c.cellId === selected),
    preview = rows.find((r) => r.rowId === previewId)
  const conditionField = draft.fieldBindings.find(
    (field) => field.attributeId === selectedCell?.condition?.attributeId
  )
  const hasContent =
    !!selectedCell &&
    (isFieldKind(selectedCell.kind) ||
      ['static-text', 'system-info', 'image', 'game-cover', 'game-launch'].includes(
        selectedCell.kind
      ))
  const enumOptions =
    draft.fieldBindings.find((field) => field.attributeId === selectedCell?.attributeId)?.options ??
    []
  // Folders (of this project) whose value is currently this option, so a used option is never silently orphaned.
  const optionUsage = (option: string) =>
    rows.filter((row) => fieldValue(row, selectedCell?.attributeId ?? '') === option).length
  useEffect(() => setOptionError(''), [selected])
  // A component that has a display condition opens the condition section, so the reason it may be hidden is visible.
  useEffect(() => {
    if (selectedCell?.condition)
      setOpenSections((open) => (open.includes('condition') ? open : [...open, 'condition']))
  }, [selected])
  const renameError = (name: string, id: string) => {
    const alias = name.trim()
    if (!alias) return tr('請輸入欄位名稱')
    if (
      draft.fieldBindings.some(
        (f) => f.attributeId !== id && f.alias.toLocaleLowerCase() === alias.toLocaleLowerCase()
      )
    )
      return tr('已有同名欄位')
    return ''
  }
  const applyRename = () => {
    if (!renaming || renameError(renaming.name, renaming.id)) return
    const alias = renaming.name.trim()
    change({
      ...draft,
      fieldBindings: draft.fieldBindings.map((f) =>
        f.attributeId === renaming.id ? { ...f, alias } : f
      ),
    })
    setRenaming(undefined)
  }
  const sources = useMemo(() => editorFields(rows, project.projectId), [rows, project.projectId])
  const availableFields = sources.filter(
    (a) => !draft.fieldBindings.some((f) => f.attributeId === a.attributeId)
  )
  const change = (next: Project) => {
    if (JSON.stringify(next) === JSON.stringify(draft)) return
    setPast([...past.slice(-49), structuredClone(draft)])
    setFuture([])
    setDraft(next)
  }
  const setFallbackIds = (ids: string[], newSource?: string) => {
    const source = newSource ? availableFields.find((f) => f.attributeId === newSource) : undefined
    change({
      ...withLevel(
        level.map((c) =>
          c.cellId === selected ? { ...c, fallbackIds: ids.length ? ids : undefined } : c
        )
      ),
      fieldBindings: source
        ? withSourceBinding(draft.fieldBindings, {
            attributeId: source.attributeId,
            alias: source.key,
            type: source.type,
          })
        : draft.fieldBindings,
    })
  }
  const updateCell = (update: Partial<Cell>) =>
    change(withLevel(level.map((c) => (c.cellId === selected ? { ...c, ...update } : c))))
  const layoutChange = (layout: Layout) => {
    change(
      withLevel(
        level.map((c) => {
          const item = layout.find((l) => l.i === c.cellId)
          return item ? { ...c, grid: { x: item.x, y: item.y, w: item.w, h: item.h } } : c
        })
      )
    )
  }
  // A folder-record field used for the first time becomes a project field: unique alias, enum options from the data.
  const withSourceBinding = (
    bindings: Project['fieldBindings'],
    source: Project['fieldBindings'][number]
  ) => {
    if (bindings.some((f) => f.attributeId === source.attributeId)) return bindings
    let alias = source.alias || tr('欄位'),
      i = 2
    while (bindings.some((f) => f.alias.toLocaleLowerCase() === alias.toLocaleLowerCase()))
      alias = (source.alias || tr('欄位')) + '_' + i++
    return [
      ...bindings,
      {
        ...source,
        alias,
        ...(source.type === 'enum' && !source.options
          ? {
              options: [
                ...new Set(
                  rows
                    .map(
                      (row) =>
                        row.record?.projectOverrides[project.projectId]?.find(
                          (attribute) => attribute.attributeId === source.attributeId
                        )?.value ??
                        row.record?.attributes.find(
                          (attribute) => attribute.attributeId === source.attributeId
                        )?.value
                    )
                    .filter(
                      (value): value is string =>
                        typeof value === 'string' && value.length > 0 && value.length <= 100
                    )
                ),
              ],
            }
          : {}),
      },
    ]
  }
  const add = (
    kind: CellKind,
    grid?: Cell['grid'],
    layout?: Layout,
    source?: Project['fieldBindings'][number]
  ) => {
    if (source && source.type !== cellType(kind)) {
      setError(tr('欄位與組件型別不符'))
      return
    }
    if (draft.cells.length >= 50) {
      setError(tr('POC 每張卡片最多 50 個組件'))
      return
    }
    const cells = level.map((c) => {
      const moved = layout?.find((l) => l.i === c.cellId)
      return moved ? { ...c, grid: { x: moved.x, y: moved.y, w: moved.w, h: moved.h } } : c
    })
    const y = Math.max(0, ...cells.map((c) => c.grid.y + c.grid.h))
    let bindings = draft.fieldBindings,
      attributeId = source?.attributeId
    if (source) bindings = withSourceBinding(bindings, source)
    attributeId ??= bindings.find((f) => f.type === cellType(kind))?.attributeId
    if (isFieldKind(kind) && !attributeId) {
      attributeId = crypto.randomUUID()
      let alias = cellType(kind),
        i = 2
      while (bindings.some((f) => f.alias.toLowerCase() === alias.toLowerCase()))
        alias = `${cellType(kind)}_${i++}`
      bindings = [...bindings, { attributeId, alias, type: cellType(kind) }]
    }
    if (kind === 'image') attributeId = crypto.randomUUID()
    const cell: Cell = {
      cellId: crypto.randomUUID(),
      kind,
      ...(isFieldKind(kind) || kind === 'image' ? { attributeId } : {}),
      grid: grid ?? {
        x: 0,
        y,
        w: 12,
        h: kind === 'image' || kind === 'game-cover' ? 3 : 1,
      },
      style: { textColor: '#e4e6e8', backgroundColor: 'transparent' },
    }
    if (cell.grid.y + cell.grid.h > 100) {
      setError(tr('畫布沒有空間，請先移動或刪除組件'))
      return
    }
    change({ ...withLevel([...cells, cell]), fieldBindings: bindings })
    setSelected(cell.cellId)
    setError('')
  }
  const removeSelected = () => {
    if (!selected || busy) return
    change(withLevel(level.filter((c) => c.cellId !== selected)))
    setSelected('')
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        event.key !== 'Delete' ||
        event.isComposing ||
        event.defaultPrevented ||
        !selected ||
        busy
      )
        return
      if (
        (event.target as HTMLElement)?.closest(
          'input,textarea,select,[role="combobox"],[contenteditable="true"],.mantine-Modal-content'
        )
      )
        return
      event.preventDefault()
      removeSelected()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [draft, selected, past, busy])
  type Binding = Project['fieldBindings'][number]
  const switchTo = (id: string) => {
    const current = draft.layoutPresets?.find((preset) => preset.id === draft.activeLayoutId)
    if (current && JSON.stringify(current.cells) !== JSON.stringify(draft.cells)) {
      setPendingPreset(id)
      return
    }
    change(selectPreset(draft, id))
  }
  const applyScheme = () => {
    try {
      change(
        schemeAction === 'rename'
          ? renamePreset(draft, schemeName)
          : addPreset(draft, schemeName, crypto.randomUUID(), schemeAction === 'copy')
      )
      setSchemeAction(undefined)
      setError('')
    } catch (reason) {
      setError(String(reason))
    }
  }
  const leave = () => {
    if (!dirty || window.confirm(tr('放棄尚未保存的版面變更？'))) close()
  }
  return (
    <section className="editor-page">
      <header className="editor-toolbar">
        <strong title={project.name}>
          {tr('積木編輯器')} · {targetLabel}
        </strong>
        {presets && (
          <Group className="scheme-toolbar" align="end" gap="xs">
            <Select
              title={
                draft.layoutPresets!.find((preset) => preset.id === draft.activeLayoutId)?.name
              }
              label={tr('版面方案')}
              allowDeselect={false}
              value={draft.activeLayoutId}
              data={draft.layoutPresets!.map((preset) => ({
                value: preset.id,
                label:
                  preset.id === 'default' && preset.name === '預設版面'
                    ? tr('預設版面')
                    : preset.name,
              }))}
              onChange={(id) => id && switchTo(id)}
            />
            <Button
              variant="light"
              onClick={() => {
                setSchemeName('')
                setSchemeAction('new')
              }}
            >
              {tr('新增方案')}
            </Button>
            <Menu>
              <Menu.Target>
                <ActionIcon size="input-sm" aria-label={tr('方案操作')} variant="default">
                  <Icon name="more" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item
                  onClick={() => {
                    setSchemeName('')
                    setSchemeAction('copy')
                  }}
                >
                  {tr('複製方案')}
                </Menu.Item>
                <Menu.Item
                  onClick={() => {
                    setSchemeName(
                      draft.layoutPresets!.find((p) => p.id === draft.activeLayoutId)!.name
                    )
                    setSchemeAction('rename')
                  }}
                >
                  {tr('重新命名')}
                </Menu.Item>
                <Menu.Item
                  color="red"
                  disabled={draft.layoutPresets!.length < 2}
                  onClick={() => change(removePreset(draft))}
                >
                  {tr('刪除方案')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        )}
        <Group className="editor-history" gap="xs">
          <Tooltip label={tr('復原')}>
            <ActionIcon
              aria-label={tr('復原')}
              variant="subtle"
              disabled={!past.length}
              onClick={() => {
                setFuture([draft, ...future])
                setDraft(past.at(-1)!)
                setPast(past.slice(0, -1))
              }}
            >
              <Icon name="undo" />
            </ActionIcon>
          </Tooltip>
          <Tooltip label={tr('重做')}>
            <ActionIcon
              aria-label={tr('重做')}
              variant="subtle"
              disabled={!future.length}
              onClick={() => {
                setPast([...past, draft])
                setDraft(future[0])
                setFuture(future.slice(1))
              }}
            >
              <Icon name="redo" />
            </ActionIcon>
          </Tooltip>
        </Group>
        <Group className="editor-save" gap="xs">
          <Button variant="default" onClick={leave}>
            {tr('取消')}
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              if (await save(presets ? syncPresetDraft(draft) : draft)) close()
            }}
          >
            {tr('儲存變更')}
          </Button>
        </Group>
      </header>
      <Modal
        opened={!!fieldDeletion}
        onClose={() => !busy && setFieldDeletion(undefined)}
        title={tr('刪除自訂欄位')}
      >
        <Stack>
          {fieldDeletion && (
            <>
              <Text>{tr('刪除欄位「{0}」及其資料', fieldDeletion.name)}</Text>
              <Text size="sm" c="dimmed">
                {tr('引用此欄位的組件與常用搜尋會一併移除；其他欄位值保留。')}
              </Text>
              <Text size="sm">
                {tr(
                  '受影響欄位：{0}；資料夾：{1}；已有值：{2}',
                  fieldDeletion.fields,
                  fieldDeletion.folders,
                  fieldDeletion.values
                )}
              </Text>
              <Text size="sm">
                {tr(
                  '版面引用：{0}；表格引用：{1}；常用搜尋：{2}',
                  fieldDeletion.layouts,
                  fieldDeletion.tables,
                  fieldDeletion.searches
                )}
              </Text>
              <Text size="sm">{tr('已驗證備份：{0}', fieldDeletion.backups)}</Text>
              <Alert color="orange">
                {tr('刪除影響以下專案；原始媒體保留。')}
                {fieldDeletion.projects.map((ref) => (
                  <Text size="sm" key={ref.projectId}>
                    {ref.name}
                    <small className="path"> · {ref.root}</small>
                  </Text>
                ))}
              </Alert>
              {fieldDeletion.skipped.map((text) => (
                <Text key={text} size="xs" c="dimmed">
                  {text}
                </Text>
              ))}
              <Text size="xs" className="path">
                {tr('復原位置：')}
                {fieldDeletion.recoveryPath}
              </Text>
              <Group justify="flex-end">
                <Button
                  variant="default"
                  disabled={busy}
                  onClick={() => setFieldDeletion(undefined)}
                >
                  {tr('取消')}
                </Button>
                <Button
                  color="red"
                  loading={busy}
                  onClick={async () => {
                    const result = await act({ action: 'deleteField', token: fieldDeletion.token })
                    if (result?.recoveryPath) {
                      const saved = result.snapshot.projects.find(
                        (ref) => ref.projectId === project.projectId
                      )?.project
                      if (saved) {
                        const next = presets
                          ? presetDraft(saved)
                          : {
                              ...saved,
                              cells: cellsWithoutField(draft.cells, fieldDeletion.attributeId),
                            }
                        setDraft(next)
                        setInitial(structuredClone(next))
                        setPast([])
                        setFuture([])
                        setSelected('')
                      }
                    }
                    setFieldDeletion(undefined)
                  }}
                >
                  {tr('確認刪除欄位及資料')}
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>
      <Modal
        opened={!!schemeAction}
        onClose={() => setSchemeAction(undefined)}
        title={
          schemeAction === 'new'
            ? tr('新增方案')
            : schemeAction === 'copy'
              ? tr('複製方案')
              : tr('重新命名')
        }
      >
        <Stack>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <TextInput
            label={tr('方案名稱')}
            value={schemeName}
            maxLength={100}
            onChange={(event) => setSchemeName(event.currentTarget.value)}
          />
          <Button disabled={!schemeName.trim()} onClick={applyScheme}>
            {tr('確認')}
          </Button>
        </Stack>
      </Modal>
      <Modal
        opened={!!pendingPreset}
        onClose={() => setPendingPreset(undefined)}
        title={tr('目前方案有未保存的調整')}
      >
        <Stack>
          <Button
            disabled={busy}
            onClick={async () => {
              if (await save(syncPresetDraft(draft))) {
                setInitial(syncPresetDraft(draft))
                const next = selectPreset(draft, pendingPreset!)
                setDraft(next)
                setPast([])
                setFuture([])
                setPendingPreset(undefined)
              }
            }}
          >
            {tr('保存後切換')}
          </Button>
          <Button
            variant="default"
            onClick={() => {
              const current = draft.layoutPresets!.find((p) => p.id === draft.activeLayoutId)!
              change(
                selectPreset({ ...draft, cells: structuredClone(current.cells) }, pendingPreset!)
              )
              setPendingPreset(undefined)
            }}
          >
            {tr('捨棄')}
          </Button>
          <Button variant="subtle" onClick={() => setPendingPreset(undefined)}>
            {tr('繼續編輯')}
          </Button>
        </Stack>
      </Modal>
      <Modal
        opened={!!renaming}
        onClose={() => setRenaming(undefined)}
        title={tr('重新命名欄位')}
        size="sm"
      >
        {renaming && (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              applyRename()
            }}
          >
            <Stack gap="sm">
              <TextInput
                data-autofocus
                label={tr('欄位名稱')}
                value={renaming.name}
                maxLength={100}
                error={
                  renaming.name === ''
                    ? undefined
                    : renameError(renaming.name, renaming.id) || undefined
                }
                onChange={(event) => setRenaming({ ...renaming, name: event.currentTarget.value })}
              />
              <Text size="xs" c="dimmed">
                {tr('只改顯示名稱，不會改動任何資料夾的資料；搜尋語法中的欄位名稱也會一併改變。')}
              </Text>
              <Group justify="flex-end">
                <Button variant="default" onClick={() => setRenaming(undefined)}>
                  {tr('取消')}
                </Button>
                <Button type="submit" disabled={!!renameError(renaming.name, renaming.id)}>
                  {tr('確認')}
                </Button>
              </Group>
            </Stack>
          </form>
        )}
      </Modal>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="editor">
        <EditorPalette
          project={project}
          draft={draft}
          busy={busy}
          dirty={dirty}
          hints={hints}
          labels={labels}
          typeLabels={typeLabels}
          typeHints={typeHints}
          sources={sources}
          availableFields={availableFields}
          dragImage={dragImage}
          act={act}
          add={add}
          change={change}
          setError={setError}
          setFieldDeletion={setFieldDeletion}
          setRenaming={setRenaming}
        />
        <main className="canvas-wrap">
          <Select
            label={tr('使用真實資料預覽')}
            placeholder={tr('尚無資料夾')}
            data={rows.map((r) => ({ value: r.rowId, label: `${r.name} · ${r.path}` }))}
            searchable
            value={previewId ?? null}
            onChange={(v) => setPreviewId(v ?? undefined)}
            mb="md"
          />
          <div ref={containerRef as React.RefObject<HTMLDivElement>} className="canvas">
            {!level.length && (
              <Stack gap={6} align="center" className="canvas-empty">
                <Button variant="light" onClick={() => add('static-text')}>
                  {tr('加入第一個組件')}
                </Button>
                <Text size="xs" c="dimmed">
                  {tr('或從左側把組件、欄位拖進這裡')}
                </Text>
              </Stack>
            )}
            {mounted && (
              <GridLayout
                positionStrategy={gridPosition}
                width={width}
                style={{ minHeight: 320 }}
                layout={level.map((c) => ({
                  i: c.cellId,
                  ...c.grid,
                  ...(c.kind === 'spacer'
                    ? { static: true, isDraggable: true, isResizable: true }
                    : {}),
                }))}
                gridConfig={{
                  cols: 12,
                  rowHeight: 42,
                  maxRows: 100,
                  margin: [4, 4],
                  containerPadding: [0, 0],
                }}
                dropConfig={{
                  enabled: true,
                  defaultItem: { w: 6, h: 1 },
                  onDragOver: () => ({
                    dragOffsetX: (width / 2 - 2) / 2 - dragGrab.current.x,
                    dragOffsetY: 21 - dragGrab.current.y,
                  }),
                }}
                onDrop={(layout, item, event) => {
                  const transfer = (event as DragEvent).dataTransfer,
                    kind = transfer?.getData('text/plain') as CellKind,
                    id = transfer?.getData('application/x-media-viewer-field'),
                    source = id
                      ? (draft.fieldBindings.find((f) => f.attributeId === id) ??
                        availableFields
                          .filter((f) => !f.conflict)
                          .map((f) => ({ attributeId: f.attributeId, alias: f.key, type: f.type }))
                          .find((f) => f.attributeId === id))
                      : undefined
                  if (id && !source) {
                    setError(tr('欄位已變更或型別衝突，請重新選擇'))
                    return
                  }
                  if (item && kind in labels)
                    add(kind, { x: item.x, y: item.y, w: item.w, h: item.h }, layout, source)
                }}
                onDragStop={layoutChange}
                onResizeStop={layoutChange}
              >
                {level.map((cell) => (
                  <div
                    key={cell.cellId}
                    onDragStart={(event) => event.preventDefault()}
                    className={`editor-cell ${selected === cell.cellId ? 'selected' : ''}`}
                    style={{ ...cellColors(cell) }}
                    tabIndex={0}
                    onFocus={() => setSelected(cell.cellId)}
                    onClick={() => setSelected(cell.cellId)}
                  >
                    <CellContent cell={cell} row={preview} project={draft} preview />
                  </div>
                ))}
              </GridLayout>
            )}
          </div>
        </main>
        <EditorInspector
          selectedCell={selectedCell}
          draft={draft}
          conditionField={conditionField}
          preview={preview}
          fieldSources={availableFields.filter((f) => !f.conflict)}
          setFallbackIds={setFallbackIds}
          enumOptions={enumOptions}
          hasContent={hasContent}
          hints={hints}
          labels={labels}
          openSections={openSections}
          setOpenSections={setOpenSections}
          optionError={optionError}
          setOptionError={setOptionError}
          optionUsage={optionUsage}
          change={change}
          updateCell={updateCell}
          removeSelected={removeSelected}
          setRenaming={setRenaming}
        />
      </div>
    </section>
  )
}
