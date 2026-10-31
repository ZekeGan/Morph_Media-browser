import { Icon } from './icons'
import { t as tr, useLocale } from './i18n'
import { cellColors } from './themes/cellStyle'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Accordion,
  ActionIcon,
  Alert,
  Badge,
  Button,
  Checkbox,
  ColorInput,
  Group,
  Menu,
  Modal,
  NumberInput,
  Select,
  Stack,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core'
import GridLayout, { useContainerWidth, type Layout } from 'react-grid-layout'
import { transformStrategy } from 'react-grid-layout/core'
import { grabOffset, localDragPosition } from './editorDrag'
import {
  type Cell,
  type CellKind,
  type FolderRow,
  type Project,
  type Request,
  type Response,
  type FieldDeletionPreview,
  fieldValue,
} from '../shared/model'
import { CellContent } from './Card'
import { cellType, isFieldKind } from '../shared/explorer'
import {
  cardPresets,
  editorFields,
  presetDraft,
  syncPresetDraft,
  selectPreset,
  addPreset,
  renamePreset,
  removePreset,
} from '../shared/layouts'

const typeKinds: Record<string, CellKind> = {
  string: 'field-text',
  tags: 'field-tags',
  number: 'field-number',
  datetime: 'field-date',
  boolean: 'field-boolean',
  enum: 'field-enum',
  url: 'field-url',
  date: 'field-date-only',
}
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
  const [newField, setNewField] = useState(''),
    [error, setError] = useState('')
  const [newType, setNewType] = useState('string')
  const [newOptions, setNewOptions] = useState('')
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
  const dragImage = (event: React.DragEvent<HTMLDivElement>) => {
    const point = grabOffset(
      event.clientX,
      event.clientY,
      event.currentTarget.getBoundingClientRect()
    )
    dragGrab.current = point
    const ghost = event.currentTarget.cloneNode(true) as HTMLElement
    const rect = event.currentTarget.getBoundingClientRect()
    Object.assign(ghost.style, {
      position: 'fixed',
      left: '0px',
      top: '0px',
      width: rect.width + 'px',
      height: rect.height + 'px',
      margin: '0',
      transform: 'none',
      pointerEvents: 'none',
      zIndex: '-1',
    })
    ghost.setAttribute('aria-hidden', 'true')
    document.body.append(ghost)
    event.dataTransfer.setDragImage(ghost, point.x, point.y)
    setTimeout(() => ghost.remove(), 0)
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
      ['static-text', 'system-info', 'image', 'game-cover'].includes(selectedCell.kind))
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
    if (source && !bindings.some((f) => f.attributeId === source.attributeId)) {
      let alias = source.alias || tr('欄位'),
        i = 2
      while (bindings.some((f) => f.alias.toLocaleLowerCase() === alias.toLocaleLowerCase()))
        alias = (source.alias || tr('欄位')) + '_' + i++
      bindings = [
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
  const paletteField = (binding: Binding) => {
    const source = sources.find((f) => f.attributeId === binding.attributeId),
      kind = typeKinds[binding.type]
    if (!kind) return null
    return (
      <div
        key={binding.attributeId}
        className="palette-item palette-field"
        data-attribute-id={binding.attributeId}
        draggable={!source?.conflict}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', kind)
          e.dataTransfer.setData('application/x-media-viewer-field', binding.attributeId)
          e.dataTransfer.effectAllowed = 'copy'
          dragImage(e)
        }}
      >
        <Button
          fullWidth
          variant="default"
          disabled={source?.conflict}
          title={source?.conflict ? tr('同一欄位的型別不一致，請先處理資料衝突') : binding.alias}
          onClick={() => add(kind, undefined, undefined, binding)}
        >
          <span className="palette-field-name">{binding.alias || tr('未命名欄位')}</span>
          <span className="palette-field-meta">
            <span>{typeLabels[binding.type]}</span>
            <span>
              {tr(
                '使用 {0} 次',
                draft.cells.filter((cell) => cell.attributeId === binding.attributeId).length
              )}
            </span>
            <Badge size="xs" color={source?.shared === false && source.private ? 'orange' : 'gray'}>
              {source?.shared === false && source.private ? tr('專案私有') : tr('共用')}
            </Badge>
            {source?.shared && source.private && (
              <Badge size="xs" color="orange">
                {tr('有專案覆寫')}
              </Badge>
            )}
          </span>
        </Button>
        <Tooltip label={tr('重新命名欄位')}>
          <ActionIcon
            className="field-rename"
            variant="subtle"
            color="gray"
            aria-label={tr('重新命名欄位 {0}', binding.alias)}
            disabled={busy}
            onClick={() => setRenaming({ id: binding.attributeId, name: binding.alias })}
          >
            <Icon name="edit" size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={dirty ? tr('先保存版面後才能刪除欄位') : tr('刪除欄位及資料')}>
          <ActionIcon
            className="field-delete"
            variant="subtle"
            color="red"
            aria-label={tr('刪除欄位 {0}', binding.alias)}
            disabled={busy || dirty}
            onClick={async () => {
              const result = await act({
                action: 'deleteFieldPreview',
                projectId: project.projectId,
                attributeId: binding.attributeId,
              })
              if (result?.fieldDeletionPreview) setFieldDeletion(result.fieldDeletionPreview)
            }}
          >
            <Icon name="close" size={14} />
          </ActionIcon>
        </Tooltip>
      </div>
    )
  }
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
          {tr('CELL 積木編輯器')} · {targetLabel}
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
                              cells: draft.cells.filter(
                                (cell) =>
                                  cell.attributeId !== fieldDeletion.attributeId &&
                                  cell.condition?.attributeId !== fieldDeletion.attributeId
                              ),
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
        <aside className="editor-palette" aria-label={tr('拖入組件')}>
          <h3>{tr('組件')}</h3>
          <section className="palette-section">
            <h4>{tr('基礎組件')}</h4>
            <div className="basic-palette">
              {(
                [
                  'name',
                  'path',
                  'static-text',
                  'spacer',
                  'system-info',
                  'image',
                  ...(draft.mediaCategory === 'game' ? ['game-cover' as const] : []),
                  'divider',
                  'open-folder',
                ] as CellKind[]
              ).map((kind) => (
                <div
                  key={kind}
                  className="palette-item"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', kind)
                    e.dataTransfer.effectAllowed = 'copy'
                    dragImage(e)
                  }}
                >
                  <Tooltip label={hints[kind]} openDelay={300} multiline maw={220}>
                    <Button fullWidth size="xs" variant="default" onClick={() => add(kind)}>
                      {labels[kind]}
                    </Button>
                  </Tooltip>
                </div>
              ))}
            </div>
          </section>
          <section className="project-field-palette">
            <h4>{tr('專案欄位')}</h4>
            <Stack gap="xs">{draft.fieldBindings.map((binding) => paletteField(binding))}</Stack>
          </section>
          <Accordion variant="separated" className="existing-fields">
            <Accordion.Item value="existing">
              <Accordion.Control>
                {tr('引用資料夾既有欄位')}
                <Badge size="xs" color="gray">
                  {availableFields.length}
                </Badge>
              </Accordion.Control>
              <Accordion.Panel>
                {availableFields.some((f) => f.shared) && (
                  <>
                    <Text size="sm" fw={600} mb="xs">
                      {tr('共用欄位')}
                    </Text>
                    <Stack gap="xs" mb="sm">
                      {availableFields
                        .filter((f) => f.shared)
                        .map((f) =>
                          paletteField({ attributeId: f.attributeId, alias: f.key, type: f.type })
                        )}
                    </Stack>
                  </>
                )}
                {availableFields.some((f) => !f.shared && f.private) && (
                  <>
                    <Text size="sm" fw={600} mb="xs">
                      {tr('本專案私有欄位')}
                    </Text>
                    <Stack gap="xs">
                      {availableFields
                        .filter((f) => !f.shared && f.private)
                        .map((f) =>
                          paletteField({ attributeId: f.attributeId, alias: f.key, type: f.type })
                        )}
                    </Stack>
                  </>
                )}
                {!availableFields.length && (
                  <Text size="xs" c="dimmed">
                    {tr('沒有尚未引用的既有欄位。')}
                  </Text>
                )}
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
          <form
            className="new-field-form"
            aria-label={tr('新增欄位')}
            onSubmit={(e) => {
              e.preventDefault()
              const alias = newField.trim()
              if (
                !alias ||
                draft.fieldBindings.some(
                  (f) => f.alias.toLocaleLowerCase() === alias.toLocaleLowerCase()
                )
              ) {
                setError(tr('請輸入未使用的欄位名稱'))
                return
              }
              change({
                ...draft,
                fieldBindings: [
                  ...draft.fieldBindings,
                  {
                    alias,
                    attributeId: crypto.randomUUID(),
                    type: newType,
                    ...(newType === 'enum'
                      ? {
                          options: [
                            ...new Set(
                              newOptions
                                .split(/[,，\n]/)
                                .map((option) => option.trim())
                                .filter(Boolean)
                            ),
                          ],
                        }
                      : {}),
                  },
                ],
              })
              setNewField('')
              setNewOptions('')
              setError('')
            }}
          >
            <h4>{tr('新增欄位')}</h4>
            <TextInput
              label={tr('欄位名稱')}
              placeholder={tr('例如：作者、評分')}
              value={newField}
              maxLength={100}
              required
              onChange={(e) => setNewField(e.currentTarget.value)}
            />
            <Select
              label={tr('欄位型別')}
              allowDeselect={false}
              value={newType}
              onChange={(v) => v && setNewType(v)}
              description={typeHints[newType]}
              data={Object.entries(typeLabels).map(([value, label]) => ({ value, label }))}
            />
            {newType === 'enum' && (
              <Textarea
                label={tr('選項（逗號或換行分隔）')}
                value={newOptions}
                onChange={(event) => setNewOptions(event.currentTarget.value)}
              />
            )}
            <Button
              type="submit"
              fullWidth
              variant="default"
              disabled={!newField.trim() || (newType === 'enum' && !newOptions.trim())}
            >
              {tr('新增欄位')}
            </Button>
          </form>
        </aside>
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
        <aside className="editor-inspector" aria-label={tr('組件設定')}>
          <h3>{tr('組件設定')}</h3>
          {selectedCell ? (
            <Stack gap="sm">
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <div>
                  <strong>{labels[selectedCell.kind]}</strong>
                  <Text size="xs" c="dimmed">
                    {hints[selectedCell.kind]}
                  </Text>
                </div>
                <Tooltip label={tr('移除組件') + ' (Delete)'}>
                  <ActionIcon
                    color="red"
                    variant="light"
                    aria-label={tr('移除組件')}
                    onClick={removeSelected}
                  >
                    <Icon name="close" size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
              <Accordion
                multiple
                variant="separated"
                value={openSections}
                onChange={setOpenSections}
              >
                {hasContent && (
                  <Accordion.Item value="content">
                    <Accordion.Control>{tr('內容')}</Accordion.Control>
                    <Accordion.Panel>
                      <Stack gap="sm">
                        {isFieldKind(selectedCell.kind) && (
                          <Group gap="xs" align="flex-end" wrap="nowrap">
                            <Select
                              style={{ flex: 1 }}
                              label={tr('綁定欄位')}
                              description={tr('這個組件顯示哪一個欄位的值')}
                              value={selectedCell.attributeId}
                              data={draft.fieldBindings
                                .filter((f) => f.type === cellType(selectedCell.kind))
                                .map((f) => ({ value: f.attributeId, label: f.alias }))}
                              onChange={(v) => v && updateCell({ attributeId: v })}
                            />
                            <Tooltip label={tr('重新命名此欄位')}>
                              <ActionIcon
                                variant="default"
                                size="lg"
                                aria-label={tr('重新命名此欄位')}
                                disabled={!selectedCell.attributeId}
                                onClick={() => {
                                  const field = draft.fieldBindings.find(
                                    (f) => f.attributeId === selectedCell.attributeId
                                  )
                                  if (field)
                                    setRenaming({ id: field.attributeId, name: field.alias })
                                }}
                              >
                                <Icon name="edit" size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        )}
                        {(selectedCell.kind === 'static-text' ||
                          selectedCell.kind === 'field-url') && (
                          <Textarea
                            label={
                              selectedCell.kind === 'static-text'
                                ? tr('版面文字內容')
                                : tr('連結顯示文字')
                            }
                            value={selectedCell.text ?? ''}
                            maxLength={10000}
                            onChange={(event) => updateCell({ text: event.currentTarget.value })}
                          />
                        )}
                        {selectedCell.kind === 'system-info' && (
                          <Select
                            label={tr('系統資訊')}
                            allowDeselect={false}
                            value={selectedCell.systemInfo ?? 'category'}
                            data={[
                              { value: 'category', label: tr('分類') },
                              { value: 'files', label: tr('檔案數') },
                              { value: 'size', label: tr('容量') },
                            ]}
                            onChange={(value) =>
                              updateCell({ systemInfo: value as Cell['systemInfo'] })
                            }
                          />
                        )}
                        {selectedCell.kind === 'field-enum' && (
                          <div>
                            <TagsInput
                              label={tr('選項')}
                              description={tr(
                                '選項會成為資料夾設定中的下拉選單；使用中的選項不能移除。'
                              )}
                              error={optionError || undefined}
                              value={enumOptions}
                              onChange={(options) => {
                                const used = enumOptions.filter(
                                  (option) => !options.includes(option) && optionUsage(option) > 0
                                )
                                if (used.length) {
                                  setOptionError(
                                    tr(
                                      '「{0}」仍有 {1} 個資料夾使用，請先把這些資料夾改成其他值再移除。',
                                      used[0],
                                      optionUsage(used[0])
                                    )
                                  )
                                  return
                                }
                                if (!options.length) {
                                  setOptionError(tr('單選至少需要一個選項'))
                                  return
                                }
                                setOptionError('')
                                change({
                                  ...draft,
                                  fieldBindings: draft.fieldBindings.map((field) =>
                                    field.attributeId === selectedCell.attributeId
                                      ? { ...field, options }
                                      : field
                                  ),
                                })
                              }}
                            />
                            {enumOptions.some((option) => optionUsage(option) > 0) && (
                              <Text size="xs" c="dimmed" mt={4}>
                                {tr(
                                  '使用中：{0}',
                                  enumOptions
                                    .filter((option) => optionUsage(option) > 0)
                                    .map((option) => `${option} × ${optionUsage(option)}`)
                                    .join('、')
                                )}
                              </Text>
                            )}
                          </div>
                        )}
                        {['image', 'game-cover'].includes(selectedCell.kind) && (
                          <Select
                            label={tr('圖片填滿方式')}
                            allowDeselect={false}
                            value={
                              selectedCell.imageFit ??
                              (selectedCell.kind === 'game-cover' ? 'cover' : 'contain')
                            }
                            data={[
                              { value: 'cover', label: tr('填滿容器（裁切多餘部分）') },
                              { value: 'contain', label: tr('完整顯示（保留空白）') },
                            ]}
                            onChange={(value) =>
                              updateCell({ imageFit: value as Cell['imageFit'] })
                            }
                          />
                        )}
                        {selectedCell.kind === 'image' && (
                          <Text size="sm" c="dimmed">
                            {tr(
                              '這是選用圖片組件。可新增多張；保存版面後，在資料夾設定的「圖片」頁分別選圖，沒有圖片可留空。'
                            )}
                          </Text>
                        )}
                        {['field-number', 'field-enum', 'field-boolean'].includes(
                          selectedCell.kind
                        ) && (
                          <Select
                            label={tr('顯示方式')}
                            allowDeselect={false}
                            value={selectedCell.presentation ?? 'plain'}
                            data={[
                              { value: 'plain', label: tr('一般文字') },
                              ...(selectedCell.kind === 'field-number'
                                ? [
                                    { value: 'rating', label: tr('評分') },
                                    { value: 'progress', label: tr('進度') },
                                  ]
                                : [{ value: 'badge', label: tr('狀態徽章') }]),
                            ]}
                            onChange={(value) =>
                              updateCell({
                                presentation:
                                  value === 'plain' ? undefined : (value as Cell['presentation']),
                              })
                            }
                          />
                        )}
                        {selectedCell.kind === 'field-number' && selectedCell.presentation && (
                          <NumberInput
                            label={tr('滿分／總量')}
                            min={0.001}
                            max={1e9}
                            value={
                              selectedCell.maximum ??
                              (selectedCell.presentation === 'rating' ? 5 : 100)
                            }
                            onChange={(value) =>
                              typeof value === 'number' &&
                              value > 0 &&
                              updateCell({ maximum: value })
                            }
                          />
                        )}
                        {isFieldKind(selectedCell.kind) && (
                          <Checkbox
                            label={tr('顯示複製按鈕')}
                            checked={selectedCell.copyValue ?? false}
                            onChange={(event) =>
                              updateCell({ copyValue: event.currentTarget.checked })
                            }
                          />
                        )}
                      </Stack>
                    </Accordion.Panel>
                  </Accordion.Item>
                )}
                <Accordion.Item value="condition">
                  <Accordion.Control>
                    {tr('顯示條件')}
                    {selectedCell.condition && (
                      <Badge size="xs" ml="xs" color="teal">
                        {tr('已啟用')}
                      </Badge>
                    )}
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      <Select
                        label={tr('顯示條件欄位')}
                        description={tr('只在所選欄位符合條件時顯示這個組件；不符合時保留空位。')}
                        placeholder={tr('一律顯示')}
                        clearable
                        value={selectedCell.condition?.attributeId ?? null}
                        data={draft.fieldBindings
                          .filter((field) => Object.hasOwn(typeKinds, field.type))
                          .map((field) => ({ value: field.attributeId, label: field.alias }))}
                        onChange={(attributeId) =>
                          updateCell({
                            condition: attributeId ? { attributeId, operator: 'set' } : undefined,
                          })
                        }
                      />
                      {selectedCell.condition && (
                        <>
                          <Select
                            label={tr('顯示條件')}
                            allowDeselect={false}
                            value={selectedCell.condition.operator}
                            data={[
                              { value: 'set', label: tr('已有值') },
                              { value: 'unset', label: tr('未填') },
                              ...(conditionField?.type === 'tags'
                                ? []
                                : [
                                    { value: 'equals', label: tr('等於') },
                                    { value: 'not-equals', label: tr('不等於') },
                                  ]),
                            ]}
                            onChange={(operator) => {
                              if (!operator) return
                              const condition = {
                                ...selectedCell.condition!,
                                operator: operator as NonNullable<Cell['condition']>['operator'],
                              }
                              if (operator === 'set' || operator === 'unset') delete condition.value
                              else
                                condition.value =
                                  conditionField?.type === 'boolean'
                                    ? false
                                    : conditionField?.type === 'number'
                                      ? 0
                                      : conditionField?.type === 'enum'
                                        ? (conditionField.options?.[0] ?? '')
                                        : ''
                              updateCell({ condition })
                            }}
                          />
                          {['equals', 'not-equals'].includes(selectedCell.condition.operator) &&
                            (conditionField?.type === 'boolean' ? (
                              <Select
                                label={tr('比較值')}
                                allowDeselect={false}
                                value={String(selectedCell.condition.value)}
                                data={[
                                  { value: 'true', label: tr('是') },
                                  { value: 'false', label: tr('否') },
                                ]}
                                onChange={(value) =>
                                  value &&
                                  updateCell({
                                    condition: {
                                      ...selectedCell.condition!,
                                      value: value === 'true',
                                    },
                                  })
                                }
                              />
                            ) : conditionField?.type === 'enum' ? (
                              <Select
                                label={tr('比較值')}
                                allowDeselect={false}
                                value={String(selectedCell.condition.value ?? '')}
                                data={(conditionField.options ?? []).map((option) => ({
                                  value: option,
                                  label: option,
                                }))}
                                onChange={(value) =>
                                  value &&
                                  updateCell({ condition: { ...selectedCell.condition!, value } })
                                }
                              />
                            ) : conditionField?.type === 'number' ? (
                              <NumberInput
                                label={tr('比較值')}
                                value={selectedCell.condition.value as number}
                                onChange={(value) =>
                                  typeof value === 'number' &&
                                  updateCell({ condition: { ...selectedCell.condition!, value } })
                                }
                              />
                            ) : (
                              <TextInput
                                label={tr('比較值')}
                                value={String(selectedCell.condition.value ?? '')}
                                maxLength={10000}
                                type={
                                  conditionField?.type === 'date'
                                    ? 'date'
                                    : conditionField?.type === 'datetime'
                                      ? 'datetime-local'
                                      : conditionField?.type === 'url'
                                        ? 'url'
                                        : 'text'
                                }
                                onChange={(event) =>
                                  updateCell({
                                    condition: {
                                      ...selectedCell.condition!,
                                      value: event.currentTarget.value,
                                    },
                                  })
                                }
                              />
                            ))}
                        </>
                      )}
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item value="position">
                  <Accordion.Control>{tr('位置與大小')}</Accordion.Control>
                  <Accordion.Panel>
                    <div className="coordinates">
                      {(['x', 'y', 'w', 'h'] as const).map((key) => (
                        <NumberInput
                          key={key}
                          label={
                            {
                              x: tr('水平位置 X'),
                              y: tr('垂直位置 Y'),
                              w: tr('寬度'),
                              h: tr('高度'),
                            }[key]
                          }
                          min={key === 'w' || key === 'h' ? 1 : 0}
                          max={
                            key === 'x'
                              ? 12 - selectedCell.grid.w
                              : key === 'w'
                                ? 12 - selectedCell.grid.x
                                : 100
                          }
                          value={selectedCell.grid[key]}
                          onChange={(v) =>
                            typeof v === 'number' &&
                            updateCell({ grid: { ...selectedCell.grid, [key]: v } })
                          }
                        />
                      ))}
                    </div>
                  </Accordion.Panel>
                </Accordion.Item>
                <Accordion.Item value="style">
                  <Accordion.Control>{tr('樣式')}</Accordion.Control>
                  <Accordion.Panel>
                    <Stack gap="sm">
                      <ColorInput
                        label={tr('文字顏色')}
                        format="hex"
                        value={selectedCell.style.textColor}
                        onChange={(v) =>
                          /^#[0-9a-f]{6}$/i.test(v) &&
                          updateCell({ style: { ...selectedCell.style, textColor: v } })
                        }
                      />
                      <Checkbox
                        label={tr('背景透明')}
                        checked={selectedCell.style.backgroundColor === 'transparent'}
                        onChange={(e) =>
                          updateCell({
                            style: {
                              ...selectedCell.style,
                              backgroundColor: e.currentTarget.checked ? 'transparent' : '#282a2e',
                            },
                          })
                        }
                      />
                      <ColorInput
                        label={tr('背景顏色')}
                        format="hex"
                        disabled={selectedCell.style.backgroundColor === 'transparent'}
                        value={
                          selectedCell.style.backgroundColor === 'transparent'
                            ? '#282a2e'
                            : selectedCell.style.backgroundColor
                        }
                        onChange={(v) =>
                          /^#[0-9a-f]{6}$/i.test(v) &&
                          updateCell({ style: { ...selectedCell.style, backgroundColor: v } })
                        }
                      />
                    </Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            </Stack>
          ) : (
            <Stack gap={6} className="inspector-empty">
              <Text size="sm" fw={600}>
                {tr('選擇畫布上的組件')}
              </Text>
              <Text size="xs" c="dimmed">
                {tr('點選畫布上的組件，就能在這裡調整內容、條件、位置與樣式。')}
              </Text>
              <Text size="xs" c="dimmed">
                {tr('拖曳移動、拉邊角縮放；按 Delete 可移除。')}
              </Text>
              <Text size="xs" c="dimmed">
                {tr('要加入新組件或欄位，請從左側拖入畫布，或直接點選。')}
              </Text>
            </Stack>
          )}
        </aside>
      </div>
    </section>
  )
}
