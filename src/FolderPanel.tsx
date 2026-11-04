import { metadataSources, sourceForUrl } from '../shared/sources'
import {
  detectFolderKind,
  effectiveKind,
  folderKinds,
  sampleOf,
  type KindSample,
} from '../shared/kind'
import { GameActionEditor, GameActionTargets } from './GameActions'
import {
  addCommonFields,
  cardPresets,
  presetDraft,
  rowCells,
  syncPresetDraft,
} from '../shared/layouts'
import { commonFieldNames } from './commonFields'
import { t as tr, useLocale } from './i18n'
import { HelpLabel, HelpTip } from './HelpTip'
import { importedFieldLabels } from './importedFieldLabels'
import { Icon } from './icons'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Menu,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  TagsInput,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core'
import { ImageUrlImport } from './ImageUrlImport'
import { FolderAdvanced } from './FolderAdvanced'
import {
  contentCells,
  gameActionTemplates,
  type ActionTemplate,
  type ExplorerRequest,
  type ExplorerResponse,
  type MetadataPreview,
} from '../shared/explorer'
import type { Attribute, FolderRow, Project, Request, Response } from '../shared/model'
type Act = (request: Request) => Promise<Response | undefined>
type Run = (request: ExplorerRequest) => Promise<ExplorerResponse | undefined>
// The tab you were on stays when you move to another folder.
let lastTab: string | null = null
export function FolderPanel({
  row,
  project,
  busy,
  act,
  run,
  onDirty,
  onEditLayout,
  initialTab = 'fields',
}: {
  row: FolderRow
  project: Project
  busy: boolean
  act: Act
  run: Run
  onDirty: (dirty: boolean) => void
  onEditLayout?: () => void
  initialTab?: string
}) {
  const sourceLabels = importedFieldLabels()

  useLocale()

  const [error, setError] = useState(''),
    [privateValues, setPrivate] = useState(false),
    [values, setValues] = useState<Record<string, unknown>>({}),
    [newOptions, setNewOptions] = useState<Record<string, string>>({})
  const [tab, setTab] = useState<string | null>(
      initialTab === 'source'
        ? 'fields'
        : initialTab === 'fields'
          ? (lastTab ?? 'fields')
          : initialTab
    ),
    [tasks, setTasks] = useState<ActionTemplate[]>(),
    [targetDirty, setTargetDirty] = useState(false)
  useEffect(() => {
    setTab(
      initialTab === 'source' || (initialTab === 'game' && effectiveKind(row) !== 'game')
        ? 'fields'
        : initialTab
    )
    setTasks(undefined)
  }, [row.rowId, initialTab])
  const [source, setSource] = useState(''),
    [preview, setPreview] = useState<MetadataPreview>(),
    [keys, setKeys] = useState<string[]>([]),
    [cover, setCover] = useState(true),
    [sourceResult, setSourceResult] = useState(''),
    [replaceSource, setReplaceSource] = useState(false)
  useEffect(() => {
    if (tab) lastTab = tab
  }, [tab])
  // A short look at the folder's files tells what it probably is; it is listed once per folder.
  const [sample, setSample] = useState<KindSample>()
  useEffect(() => {
    let alive = true
    setSample(undefined)
    void window.explorer
      .request({ action: 'content', rowId: row.rowId, limit: 60 })
      .then((result) => {
        if (alive && result.content) setSample(sampleOf(result.content.entries))
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [row.rowId])
  const detectedKind = detectFolderKind(row, sample)
  const isGame = effectiveKind(row, sample) === 'game'
  const kindLabel: Record<string, string> = {
    game: tr('遊戲'),
    book: tr('書籍／漫畫'),
    media: tr('影音'),
    general: tr('一般'),
  }
  const layoutName = (id?: string) => {
    const preset = cardPresets(project).find((p) => p.id === id) ?? cardPresets(project)[0]
    return preset.id === 'default' && preset.name === '預設版面' ? tr('預設版面') : preset.name
  }
  const kindLayoutId = project.kindLayouts?.[effectiveKind(row, sample)]
  const effectiveLayout = layoutName(kindLayoutId ?? project.activeLayoutId)
  const kindReason: Record<string, string> = {
    game: tr('偵測到遊戲引擎'),
    reading: tr('已用漫畫模式閱讀'),
    content: tr('依檔案內容判斷'),
    default: tr('無法判斷，視為一般'),
    manual: '',
  }
  const fields = useMemo(
    () => [
      ...new Map(
        [
          ...project.fieldBindings.map((f) => ({
            attributeId: f.attributeId,
            key: f.alias,
            type: f.type,
          })),
          ...(row.record?.attributes ?? []),
          ...(row.record?.projectOverrides[row.projectId] ?? []),
        ].map((a) => [a.attributeId, a])
      ).values(),
    ],
    [project.fieldBindings, row.record]
  )
  const configured = new Set(project.fieldBindings.map((f) => f.attributeId)),
    mainFields = fields.filter((f) => configured.has(f.attributeId)),
    otherFields = fields.filter((f) => !configured.has(f.attributeId))
  const imageCells = [
    ...new Map(
      [...rowCells(project, row), ...contentCells(project, effectiveKind(row, sample))]
        .filter((c) => c.kind === 'image')
        .map((c) => [c.cellId, c])
    ).values(),
  ]
  const assets = row.record?.assets ?? []
  const showImages = imageCells.length > 0 || assets.length > 0 || isGame
  useEffect(() => {
    if ((tab === 'images' && !showImages) || (tab === 'game' && !isGame)) setTab('fields')
  }, [tab, showImages, isGame])
  // Confirm first, naming every place that shows the picture; the file and all references go in one write.
  const deleteImage = (assetId: string, name: string) => {
    const details = row.record?.details,
      used = [
        ...imageCells.flatMap((cell, index) =>
          details?.cellImages?.[cell.attributeId ?? cell.cellId] === assetId
            ? [tr('圖片') + (index + 1)]
            : []
        ),
        ...(details?.bannerAssetId === assetId ? [tr('遊戲封面')] : []),
      ]
    if (
      !window.confirm(
        tr('刪除已保存的圖片「{name}」？').replace('{name}', name) +
          (used.length
            ? '\n' +
              tr('正在使用：{places}，刪除後會一併清除。').replace('{places}', used.join('、'))
            : '') +
          '\n' +
          tr('只刪除此資料夾內保存的副本，原始檔案不受影響。')
      )
    )
      return
    void run({ action: 'deleteImage', rowId: row.rowId, revision: row.record!.revision, assetId })
  }
  const original = useMemo(
    () =>
      Object.fromEntries(
        fields.map((f) => {
          const own = privateValues
            ? row.record?.projectOverrides[row.projectId]?.find(
                (a) => a.attributeId === f.attributeId
              )
            : undefined
          return [
            f.attributeId,
            own
              ? own.value
              : row.record?.attributes.find((a) => a.attributeId === f.attributeId)?.value,
          ]
        })
      ),
    [fields, row.record, privateValues]
  )
  const changedCount = fields.filter(
    (f) =>
      Object.hasOwn(values, f.attributeId) &&
      JSON.stringify(values[f.attributeId]) !== JSON.stringify(original[f.attributeId])
  ).length
  const fieldDirty = changedCount > 0
  const taskDirty =
    tasks !== undefined && JSON.stringify(tasks) !== JSON.stringify(gameActionTemplates(project))
  useLayoutEffect(() => {
    onDirty(fieldDirty || taskDirty || targetDirty)
    return () => onDirty(false)
  }, [fieldDirty, taskDirty, targetDirty, onDirty])
  useEffect(() => {
    if (!fieldDirty) setValues({})
  }, [row.record?.revision])
  const disabled = busy || row.readonly || row.stopped || !!row.error || !row.record
  const edit = (id: string, value: unknown) => setValues((v) => ({ ...v, [id]: value }))
  const effective = (id: string) => (Object.hasOwn(values, id) ? values[id] : original[id])
  const save = async () => {
    const changed: Attribute[] = fields
      .filter(
        (f) =>
          Object.hasOwn(values, f.attributeId) &&
          JSON.stringify(values[f.attributeId]) !== JSON.stringify(original[f.attributeId])
      )
      .map((f) => ({ ...f, value: values[f.attributeId], source: 'manual' }))
    if (
      await run({
        action: 'attributes',
        rowId: row.rowId,
        revision: row.record!.revision,
        values: changed,
        private: privateValues,
      })
    )
      setValues({})
  }
  // A new option joins the project's choice field (shared by every folder), then fills this folder's value.
  const addOption = async (attributeId: string, option: string) => {
    if (!option) return
    const binding = project.fieldBindings.find((field) => field.attributeId === attributeId)
    if (!binding) return
    if (!binding.options?.includes(option)) {
      const saved = await act({
        action: 'saveProject',
        project: {
          ...project,
          fieldBindings: project.fieldBindings.map((field) =>
            field.attributeId === attributeId
              ? { ...field, options: [...(field.options ?? []), option] }
              : field
          ),
        },
      })
      if (!saved) return
    }
    edit(attributeId, option)
    setNewOptions((v) => ({ ...v, [attributeId]: '' }))
  }
  // Where an imported value came from, shown under its label until the value is edited.
  const fieldNote = (attributeId: string) => {
    if (Object.hasOwn(values, attributeId)) return undefined
    const attribute =
      (privateValues
        ? row.record?.projectOverrides[row.projectId]?.find((a) => a.attributeId === attributeId)
        : undefined) ?? row.record?.attributes.find((a) => a.attributeId === attributeId)
    if (!attribute || attribute.source === 'manual') return undefined
    const provider = attribute.sourceRecord?.provider,
      name = metadataSources.find((item) => item.id === provider)?.name
    return name ? tr('來自 {0}', name) : tr('來自網站匯入')
  }
  const renderField = (f: (typeof fields)[number]) => {
    const value = effective(f.attributeId),
      binding = project.fieldBindings.find((binding) => binding.attributeId === f.attributeId)
    if (f.type === 'boolean')
      return (
        <Select
          key={f.attributeId}
          label={f.key}
          description={fieldNote(f.attributeId)}
          placeholder={tr('未填')}
          clearable
          value={value === true ? 'true' : value === false ? 'false' : null}
          data={[
            { value: 'true', label: tr('是') },
            { value: 'false', label: tr('否') },
          ]}
          disabled={disabled}
          onChange={(value) => edit(f.attributeId, value === null ? null : value === 'true')}
        />
      )
    if (f.type === 'enum') {
      const options = binding?.options ?? [],
        draft = (newOptions[f.attributeId] ?? '').trim(),
        known = options.includes(draft),
        full = options.length >= 100
      return (
        <Stack key={f.attributeId} gap={6}>
          <Select
            label={f.key}
            description={fieldNote(f.attributeId)}
            placeholder={tr('未填')}
            clearable
            value={typeof value === 'string' ? value : null}
            data={[
              ...options.map((option) => ({ value: option, label: option })),
              ...(typeof value === 'string' && !options.includes(value)
                ? [{ value, label: value, disabled: true }]
                : []),
            ]}
            disabled={disabled || !options.length}
            onChange={(value) => edit(f.attributeId, value)}
          />
          {binding && (
            <Group gap="xs" wrap="nowrap" align="flex-end">
              <TextInput
                flex={1}
                size="xs"
                aria-label={tr('新增選項') + ' ' + f.key}
                placeholder={tr('輸入新選項，所有資料夾共用')}
                maxLength={100}
                value={newOptions[f.attributeId] ?? ''}
                disabled={disabled || busy}
                onChange={(event) => {
                  const text = event.currentTarget.value
                  setNewOptions((v) => ({ ...v, [f.attributeId]: text }))
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void addOption(f.attributeId, draft)
                  }
                }}
              />
              <Button
                size="xs"
                variant="default"
                disabled={disabled || busy || !draft || (full && !known)}
                onClick={() => void addOption(f.attributeId, draft)}
              >
                {known ? tr('選用') : tr('新增選項')}
              </Button>
            </Group>
          )}
        </Stack>
      )
    }
    if (f.type === 'url' || f.type === 'date')
      return (
        <TextInput
          key={f.attributeId}
          label={f.key}
          description={fieldNote(f.attributeId)}
          type={f.type === 'url' ? 'url' : 'date'}
          value={String(value ?? '')}
          disabled={disabled}
          onChange={(event) => edit(f.attributeId, event.currentTarget.value || null)}
        />
      )
    return f.type === 'tags' ? (
      <TagsInput
        key={f.attributeId}
        label={f.key}
        description={fieldNote(f.attributeId)}
        placeholder={tr('以逗號分隔多個標籤')}
        value={
          Array.isArray(effective(f.attributeId)) ? (effective(f.attributeId) as string[]) : []
        }
        disabled={disabled}
        onChange={(v) => edit(f.attributeId, v)}
        splitChars={[',']}
      />
    ) : f.type === 'number' ? (
      <NumberInput
        key={f.attributeId}
        label={f.key}
        description={fieldNote(f.attributeId)}
        value={
          typeof effective(f.attributeId) === 'number' ? (effective(f.attributeId) as number) : ''
        }
        disabled={disabled}
        onChange={(v) => edit(f.attributeId, v)}
      />
    ) : f.type === 'datetime' ? (
      <TextInput
        key={f.attributeId}
        label={f.key}
        description={fieldNote(f.attributeId)}
        type="datetime-local"
        value={String(effective(f.attributeId) ?? '')}
        disabled={disabled}
        onChange={(e) => edit(f.attributeId, e.currentTarget.value)}
      />
    ) : f.type === 'string' ? (
      <Textarea
        key={f.attributeId}
        label={f.key}
        description={fieldNote(f.attributeId)}
        placeholder={tr('尚未填寫')}
        autosize
        minRows={1}
        value={String(effective(f.attributeId) ?? '')}
        disabled={disabled}
        onChange={(e) => edit(f.attributeId, e.currentTarget.value)}
      />
    ) : (
      <Text key={f.attributeId} size="sm">
        {f.key}
        {tr('：目前不支援編輯')}
        {f.type}
        {tr('，原值保留。')}
      </Text>
    )
  }
  // One thumbnail that opens a menu: pick a saved image, import a new one, or clear the choice.
  const imageChooser = ({
    label,
    current,
    onPick,
    onImport,
    onClear,
  }: {
    label: string
    current?: string
    onPick: (assetId: string) => void
    onImport: () => void
    onClear?: () => void
  }) => {
    const asset = assets.find((a) => a.assetId === current)
    return (
      <Menu position="bottom-start" withinPortal>
        <Menu.Target>
          <button
            type="button"
            className="image-thumb"
            aria-label={label}
            disabled={disabled || fieldDirty}
          >
            {asset ? (
              <img
                src={'media://asset/' + row.rowId + '/' + asset.assetId}
                alt={asset.originalName}
              />
            ) : (
              <span className="image-thumb-empty">
                <Icon name="plus" size={18} />
                {tr('選擇圖片')}
              </span>
            )}
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          {assets.map((a) => (
            <Menu.Item
              key={a.assetId}
              leftSection={
                <img
                  className="image-thumb-mini"
                  src={'media://asset/' + row.rowId + '/' + a.assetId}
                  alt=""
                />
              }
              rightSection={a.assetId === current ? <Icon name="check" size={14} /> : undefined}
              onClick={() => onPick(a.assetId)}
            >
              {a.originalName}
            </Menu.Item>
          ))}
          {!!assets.length && <Menu.Divider />}
          <Menu.Item onClick={onImport}>{tr('匯入新圖片…')}</Menu.Item>
          {asset && onClear && (
            <Menu.Item color="red" onClick={onClear}>
              {tr('清除指定')}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    )
  }
  const boundary = (state: 'root' | 'not-game' | 'candidate', traverse = false) => {
    if (!row.record || (fieldDirty && !window.confirm(tr('套用邊界前放棄欄位草稿？')))) return
    void run({
      action: 'boundary',
      rowId: row.rowId,
      revision: row.record.revision,
      state,
      traverse,
    })
  }
  // The source is recognised from the pasted address alone; the preview button only works for a known site.
  const detected = sourceForUrl(source.trim()),
    detectedName = metadataSources.find((item) => item.id === detected)?.name
  const loadPreview = async () => {
    setError('')
    setSourceResult('')
    if (!detected) {
      setError(tr('無法辨識這個網址的來源'))
      return
    }
    const result = await run({
      action: 'metadataPreview',
      source: source.trim(),
      provider: detected,
    })
    if (result?.preview) {
      setReplaceSource(false)
      setPreview(result.preview)
      setKeys(result.preview.values.filter((v) => v.key !== 'COVER_STATUS').map((v) => v.key))
    }
  }
  // Boundaries belong to games; other projects only see them when a game was actually detected in this folder.
  const gameDetected = !!row.boundary || !!row.record?.details?.boundary?.state
  const showBoundary = isGame || gameDetected
  // What this folder still lacks, each with a button that goes straight to the place that fixes it.
  const empty = (value: unknown) =>
    value == null || value === '' || (Array.isArray(value) && value.length === 0)
  const todo: { key: string; text: string; button: string; go: () => void }[] = []
  if (row.record && !disabled) {
    if (
      isGame &&
      gameActionTemplates(project).some((t) => t.id === 'default-launch-game') &&
      !row.record.details?.targets?.['default-launch-game']
    )
      todo.push({
        key: 'launch',
        text: tr('尚未指定啟動檔'),
        button: tr('指定啟動檔'),
        go: () => setTab('game'),
      })
    if (isGame && !row.record.details?.bannerAssetId && !assets.length)
      todo.push({
        key: 'cover',
        text: tr('還沒有封面'),
        button: tr('選擇封面'),
        go: () => setTab('images'),
      })
    if (
      mainFields.length &&
      mainFields.every((f) => empty(original[f.attributeId])) &&
      !row.record.attributes.some((a) => a.sourceRecord)
    )
      todo.push({
        key: 'data',
        text: tr('尚無作品資料'),
        button: tr('從網址取得資料'),
        go: () => {
          setTab('fields')
          requestAnimationFrame(() => {
            const input = document.getElementById('folder-source-url')
            input?.scrollIntoView({ block: 'center' })
            input?.focus()
          })
        },
      })
  }
  return (
    <Stack
      gap="md"
      className="folder-settings"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's' && fieldDirty) {
          event.preventDefault()
          if (!disabled) void save()
        }
      }}
    >
      <div className="folder-settings-intro">
        <Text size="xs" c="dimmed" className="path-line" title={row.path}>
          {row.path}
        </Text>
        {(row.error || row.readonly || row.stopped) && (
          <Badge color={row.error ? 'red' : 'orange'}>
            {row.error ? tr('需要處理') : row.readonly ? tr('受保護') : tr('已停止記錄')}
          </Badge>
        )}
      </div>
      {row.error && <Alert color="orange">{row.error}</Alert>}
      {error && (
        <Alert color="orange" withCloseButton onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {!isGame && row.boundary && (
        <Alert color="blue" className="folder-boundary-note">
          <Group justify="space-between" wrap="nowrap" gap="xs">
            <Text size="sm">{tr('偵測到遊戲，為了保護內部檔案，不會在裡面建立資訊。')}</Text>
            <Button size="compact-sm" variant="light" onClick={() => setTab('advanced')}>
              {tr('邊界設定')}
            </Button>
          </Group>
        </Alert>
      )}
      {todo.length > 0 && (
        <section className="settings-section folder-todo" aria-label={tr('還可以補上')}>
          <Text fw={600} size="sm" mb={6}>
            {tr('還可以補上')}
          </Text>
          <Stack gap={6}>
            {todo.map((item) => (
              <Group key={item.key} justify="space-between" wrap="nowrap" gap="xs">
                <Text size="sm">{item.text}</Text>
                <Button size="compact-sm" variant="light" onClick={item.go}>
                  {item.button}
                </Button>
              </Group>
            ))}
          </Stack>
        </section>
      )}
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="fields">
            {tr('資料')}
            {fieldDirty && <span className="tab-dirty-dot" role="img" aria-label={tr('未保存')} />}
            {privateValues && (
              <Badge ml={5} size="xs" color="orange">
                {tr('私有')}
              </Badge>
            )}
          </Tabs.Tab>
          {showImages && <Tabs.Tab value="images">{tr('圖片')}</Tabs.Tab>}
          {isGame && <Tabs.Tab value="game">{tr('遊戲操作')}</Tabs.Tab>}
          <Tabs.Tab value="advanced">{tr('進階')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="fields" pt="md">
          <Stack>
            <Group justify="space-between">
              <div>
                <Group gap={4} wrap="nowrap">
                  <Text fw={600}>{tr('資料夾資料')}</Text>
                  <HelpTip
                    text={
                      tr('填寫與此資料夾有關的資訊，保存後立即顯示。') +
                      ' ' +
                      (privateValues
                        ? tr('修改只用在目前專案；其他專案仍用各專案共用的資訊。')
                        : tr('修改會同步到使用這個資料夾的其他專案。'))
                    }
                  />
                </Group>
              </div>
              <SegmentedControl
                size="xs"
                aria-label={tr('資料範圍')}
                value={privateValues ? 'private' : 'shared'}
                disabled={disabled}
                data={[
                  { value: 'shared', label: tr('各專案共用的資訊') },
                  { value: 'private', label: tr('僅目前專案') },
                ]}
                onChange={(value) => {
                  if (!fieldDirty || window.confirm(tr('切換會放棄目前欄位草稿？'))) {
                    setValues({})
                    setPrivate(value === 'private')
                  }
                }}
              />
            </Group>
            {row.record && (
              <Select
                label={
                  <HelpLabel
                    label={tr('資料夾類型')}
                    help={
                      row.record.details?.kind
                        ? tr('已手動指定類型；選「自動」可改回自動判斷。')
                        : (sample || detectedKind.source !== 'default'
                            ? kindReason[detectedKind.source]
                            : tr('偵測中…')) +
                          '。' +
                          tr('也可以手動指定。')
                    }
                  />
                }
                allowDeselect={false}
                value={row.record.details?.kind ?? 'auto'}
                data={[
                  {
                    value: 'auto',
                    label: tr('自動（偵測為 {0}）', kindLabel[detectedKind.kind]),
                  },
                  ...folderKinds.map((kind) => ({ value: kind, label: kindLabel[kind] })),
                ]}
                disabled={disabled || fieldDirty}
                onChange={(value) =>
                  value &&
                  void run({
                    action: 'folderKind',
                    rowId: row.rowId,
                    revision: row.record!.revision,
                    kind: value === 'auto' ? null : (value as (typeof folderKinds)[number]),
                  })
                }
              />
            )}
            {row.record && (
              <Select
                label={
                  <HelpLabel
                    label={tr('此資料夾的卡片外觀')}
                    help={tr('版面套用優先序：資料夾自選 › 類型預設 › 專案目前版面。')}
                  />
                }
                allowDeselect={false}
                value={project.folderLayouts?.[row.record.folderId] ?? ''}
                data={[
                  { value: '', label: tr('遵循類型與專案設定（目前：{0}）', effectiveLayout) },
                  ...cardPresets(project).map((preset) => ({
                    value: preset.id,
                    label:
                      preset.id === 'default' && preset.name === '預設版面'
                        ? tr('預設版面')
                        : preset.name,
                  })),
                ]}
                disabled={busy || fieldDirty}
                onChange={(id) => {
                  const folderLayouts = { ...project.folderLayouts }
                  if (id) folderLayouts[row.record!.folderId] = id
                  else delete folderLayouts[row.record!.folderId]
                  void act({ action: 'saveProject', project: { ...project, folderLayouts } })
                }}
              />
            )}
            <Stack gap="sm" className="folder-source">
              <div>
                <Group gap={4} wrap="nowrap">
                  <Text fw={600}>{tr('從網站補充資訊')}</Text>
                  <HelpTip text={tr('選來源、貼連結、預覽後再決定要匯入的欄位。')} />
                </Group>
              </div>
              <section className="settings-section">
                <Stack gap="sm">
                  <TextInput
                    id="folder-source-url"
                    disabled={busy}
                    label={
                      <HelpLabel
                        label={tr('作品網址或 ID')}
                        help={
                          tr('直接貼上網址，自動辨識來源。支援：') +
                          metadataSources.map((item) => item.name).join('、')
                        }
                      />
                    }
                    placeholder={tr('貼上作品網址（Steam 可直接輸入 App ID）')}
                    error={source.trim() && !detected ? tr('無法辨識這個網址的來源') : undefined}
                    rightSectionWidth={detectedName ? 96 : undefined}
                    rightSection={
                      detectedName ? (
                        <Badge
                          color="teal"
                          variant="light"
                          leftSection={<Icon name="check" size={10} />}
                        >
                          {detectedName}
                        </Badge>
                      ) : undefined
                    }
                    value={source}
                    onChange={(event) => {
                      setSource(event.currentTarget.value)
                      setPreview(undefined)
                    }}
                  />
                  <Group justify="flex-end">
                    <Button
                      disabled={disabled || fieldDirty || !detected}
                      loading={busy}
                      onClick={() => void loadPreview()}
                    >
                      {tr('取得預覽')}
                    </Button>
                  </Group>
                </Stack>
              </section>

              {sourceResult && <Alert color="teal">{sourceResult}</Alert>}
              {preview && (
                <Checkbox
                  label={
                    <HelpLabel
                      label={tr('覆寫已填來源欄位')}
                      help={tr('預設只填空值；人工欄位保持原樣。')}
                    />
                  }
                  checked={replaceSource}
                  onChange={(event) => setReplaceSource(event.currentTarget.checked)}
                />
              )}
              {preview && (
                <section className="settings-section source-preview">
                  <Group align="start">
                    {preview.image && (
                      <img className="metadata-cover" src={preview.image} alt={tr('候選封面')} />
                    )}
                    <div>
                      <Text fw={600}>{preview.title}</Text>
                      <Text size="xs" c="dimmed" className="path">
                        {preview.source}
                      </Text>
                    </div>
                  </Group>
                  <Text size="sm" c="dimmed" my="sm">
                    {preview.provider === 'steam'
                      ? tr('發售日保留 Steam 商店顯示的日期，不推定為作品首次發行日。')
                      : tr('日期依來源保留，不推定為作品首次發行日。')}
                    {tr('預設只填空值；人工欄位保持原樣。')}
                  </Text>
                  <table className="source-diff">
                    <thead>
                      <tr>
                        <th aria-label={tr('匯入')} />
                        <th>{tr('欄位')}</th>
                        <th>{tr('現值')}</th>
                        <th>{tr('新值')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.values
                        .filter((v) => v.key !== 'COVER_STATUS')
                        .map((v) => {
                          const next = Array.isArray(v.value)
                              ? v.value.join('、')
                              : String(v.value),
                            existing = row.record?.attributes.find(
                              (attribute) =>
                                attribute.attributeId ===
                                (preview.provider ?? 'eh') + '-' + v.key.toLowerCase()
                            ),
                            current = existing
                              ? Array.isArray(existing.value)
                                ? existing.value.join('、')
                                : String(existing.value)
                              : '',
                            same = !!existing && current === next
                          return (
                            <tr key={v.key} className={same ? 'same' : undefined}>
                              <td>
                                <Checkbox
                                  aria-label={sourceLabels[v.key] ?? v.key}
                                  checked={keys.includes(v.key)}
                                  onChange={(e) =>
                                    setKeys((list) =>
                                      e.currentTarget.checked
                                        ? [...list, v.key]
                                        : list.filter((k) => k !== v.key)
                                    )
                                  }
                                />
                              </td>
                              <th scope="row">{sourceLabels[v.key] ?? v.key}</th>
                              <td>{current || '—'}</td>
                              <td>{same ? tr('相同') : next}</td>
                            </tr>
                          )
                        })}
                    </tbody>
                  </table>
                  {preview.values.find((v) => v.key === 'COVER_STATUS') && (
                    <Alert color="orange" mt="sm">
                      {String(preview.values.find((v) => v.key === 'COVER_STATUS')!.value)}
                    </Alert>
                  )}
                  {preview.image && (
                    <Checkbox
                      mt="md"
                      label={tr('同時保存封面圖片')}
                      checked={cover}
                      onChange={(e) => setCover(e.currentTarget.checked)}
                    />
                  )}
                  <Group justify="flex-end" mt="md" className="settings-savebar">
                    <Button variant="default" disabled={busy} onClick={() => setPreview(undefined)}>
                      {tr('取消預覽')}
                    </Button>
                    <Button
                      disabled={
                        disabled || fieldDirty || (!keys.length && !(preview.image && cover))
                      }
                      onClick={async () => {
                        if (
                          await run({
                            action: 'metadataApply',
                            rowId: row.rowId,
                            revision: row.record!.revision,
                            token: preview.token,
                            keys,
                            image: !!preview.image && cover,
                            mode: replaceSource ? 'replace' : 'fill',
                          })
                        ) {
                          setSourceResult(tr('已匯入選定資料，可至「資料」查看。'))
                          setPreview(undefined)
                        }
                      }}
                    >
                      {tr('匯入選定資料')}
                    </Button>
                  </Group>
                </section>
              )}
            </Stack>
            {fieldDirty && (
              <Text size="xs" c="dimmed">
                {tr('先保存或放棄下方未保存的變更，才能套用網站資料。')}
              </Text>
            )}
            {row.record && (
              <>
                <Divider />
              </>
            )}
            {mainFields.map(renderField)}
            {!mainFields.length && (
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text c="dimmed" size="sm">
                  {tr('專案尚未配置欄位。')}
                </Text>
                <Group gap={6} wrap="nowrap">
                  <Button
                    size="compact-sm"
                    variant="filled"
                    disabled={busy || fieldDirty}
                    onClick={() =>
                      void act({
                        action: 'saveProject',
                        project: syncPresetDraft(
                          addCommonFields(presetDraft(project), commonFieldNames())
                        ),
                      })
                    }
                  >
                    {tr('加入常用欄位')}
                  </Button>
                  {onEditLayout && (
                    <Button size="compact-sm" variant="light" onClick={onEditLayout}>
                      {tr('新增欄位')}
                    </Button>
                  )}
                </Group>
              </Group>
            )}
            {!!otherFields.length && (
              <Accordion variant="separated">
                <Accordion.Item value="other">
                  <Accordion.Control>
                    {tr('匯入及其他欄位（')}
                    {otherFields.length}）
                  </Accordion.Control>
                  <Accordion.Panel>
                    <Stack>{otherFields.map(renderField)}</Stack>
                  </Accordion.Panel>
                </Accordion.Item>
              </Accordion>
            )}
            {fieldDirty && (
              <div className="settings-savebar" role="region" aria-label={tr('未保存的變更')}>
                <Text size="sm">{tr('有 {0} 項未保存', changedCount)}</Text>
                <Group gap="xs" wrap="nowrap">
                  <Button variant="default" disabled={busy} onClick={() => setValues({})}>
                    {tr('放棄')}
                  </Button>
                  <Button disabled={disabled} loading={busy} onClick={() => void save()}>
                    {tr('保存')}
                    {privateValues ? tr('此專案資料') : tr('欄位資料')}
                  </Button>
                </Group>
              </div>
            )}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="images" pt="md">
          <Stack>
            <div>
              <Group gap={4} wrap="nowrap">
                <Text fw={600}>{tr('選用圖片')}</Text>
                <HelpTip text={tr('每個圖片組件可分別選圖。沒有圖片的資料夾可以留空。')} />
              </Group>
            </div>
            {imageCells.map((cell, index) => {
              const assigned = row.record?.details?.cellImages?.[cell.attributeId ?? cell.cellId],
                label = tr('圖片 ') + (index + 1) + tr(' 的來源')
              return (
                <section
                  className="settings-section image-slot"
                  key={cell.cellId}
                  data-cell-id={cell.cellId}
                >
                  <Text fw={600} mb="xs">
                    {tr('圖片')}
                    {index + 1}
                  </Text>
                  {imageChooser({
                    label,
                    current: assigned,
                    onPick: (assetId) =>
                      void run({
                        action: 'cellImage',
                        rowId: row.rowId,
                        revision: row.record!.revision,
                        cellId: cell.cellId,
                        assetId,
                      }),
                    onImport: () =>
                      void act({
                        action: 'image',
                        rowId: row.rowId,
                        revision: row.record!.revision,
                        cellId: cell.cellId,
                      }),
                    onClear: () =>
                      void run({
                        action: 'cellImage',
                        rowId: row.rowId,
                        revision: row.record!.revision,
                        cellId: cell.cellId,
                        assetId: null,
                      }),
                  })}
                </section>
              )
            })}
            {!imageCells.length && (
              <Text size="sm" c="dimmed">
                {tr('目前版面沒有圖片組件，無須為每個資料夾指定圖片。')}
              </Text>
            )}
            {isGame && (
              <section className="settings-section">
                <Text fw={600} mb="sm">
                  {tr('遊戲封面')}
                </Text>
                {imageChooser({
                  label: tr('封面圖片'),
                  current: row.record?.details?.bannerAssetId ?? assets[0]?.assetId,
                  onPick: (assetId) =>
                    void run({
                      action: 'banner',
                      rowId: row.rowId,
                      revision: row.record!.revision,
                      assetId,
                    }),
                  onImport: () =>
                    void act({ action: 'image', rowId: row.rowId, revision: row.record!.revision }),
                })}
                <ImageUrlImport row={row} run={run} disabled={disabled || fieldDirty} />
              </section>
            )}
            {!!assets.length && (
              <section className="settings-section image-library">
                <Text fw={600} mb="xs">
                  {tr('圖片庫')}（{assets.length}）
                </Text>
                <div className="images">
                  {assets.map((a) => {
                    const used = [
                      ...imageCells
                        .map((cell, index) =>
                          row.record?.details?.cellImages?.[cell.attributeId ?? cell.cellId] ===
                          a.assetId
                            ? tr('圖片') + (index + 1)
                            : ''
                        )
                        .filter(Boolean),
                      ...(isGame &&
                      (row.record?.details?.bannerAssetId ?? assets[0]?.assetId) === a.assetId
                        ? [tr('封面')]
                        : []),
                    ]
                    return (
                      <figure key={a.assetId}>
                        <img
                          src={'media://asset/' + row.rowId + '/' + a.assetId}
                          alt={a.originalName}
                        />
                        <figcaption>{a.originalName}</figcaption>
                        <small className="muted">
                          {used.length ? tr('用於：{0}', used.join('、')) : tr('未使用')}
                        </small>
                        <Button
                          variant="subtle"
                          color="red"
                          size="compact-xs"
                          aria-label={tr('刪除圖片 ') + a.originalName}
                          disabled={disabled || fieldDirty}
                          onClick={() => deleteImage(a.assetId, a.originalName)}
                        >
                          {tr('刪除圖片')}
                        </Button>
                      </figure>
                    )
                  })}
                </div>
              </section>
            )}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="game" pt="md" keepMounted>
          <Stack>
            <Group justify="space-between">
              <div>
                <Text fw={600}>{tr('遊戲操作')}</Text>
                <Text size="sm" c="dimmed">
                  {tr('工具列套用到整個專案；目標與參數只屬於目前資料夾。')}
                </Text>
              </div>
              <Button
                size="xs"
                variant="default"
                disabled={disabled || fieldDirty || targetDirty}
                onClick={() => setTasks(structuredClone(gameActionTemplates(project)))}
              >
                {tr('自訂工具列')}
              </Button>
            </Group>
            <GameActionTargets
              key={row.rowId}
              row={row}
              project={project}
              disabled={disabled || fieldDirty}
              run={run}
              onDirty={setTargetDirty}
            />
          </Stack>
        </Tabs.Panel>
        <FolderAdvanced
          row={row}
          disabled={disabled}
          busy={busy}
          fieldDirty={fieldDirty}
          showBoundary={showBoundary}
          boundary={boundary}
          act={act}
          error={error}
          setError={setError}
        />
      </Tabs>
      <Modal
        zIndex={450}
        opened={tasks !== undefined}
        title={tr('自訂工具列')}
        onClose={() => {
          if (!taskDirty || window.confirm(tr('放棄未保存工具列？'))) setTasks(undefined)
        }}
        size="lg"
      >
        <Stack>
          {tasks && <GameActionEditor tasks={tasks} onChange={setTasks} disabled={busy} />}
          <Button
            disabled={busy || !tasks?.every((task) => task.label.trim())}
            onClick={async () => {
              if (
                await act({
                  action: 'saveProject',
                  project: { ...project, actionTemplates: tasks },
                })
              )
                setTasks(undefined)
            }}
          >
            {tr('保存工具列')}
          </Button>
        </Stack>
      </Modal>
    </Stack>
  )
}
