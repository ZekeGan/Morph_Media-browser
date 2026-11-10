import { dateOrText } from '../shared/fields'
import { metadataSources } from '../shared/sources'
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
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  Text,
} from '@mantine/core'
import { FolderAdvanced } from './FolderAdvanced'
import { FolderFieldInput } from './FolderFieldInput'
import { FolderImages } from './FolderImages'
import { FolderSourceImport, useSourceImport } from './FolderSourceImport'
import {
  contentCells,
  gameActionTemplates,
  type ActionTemplate,
  type ExplorerRequest,
  type ExplorerResponse,
} from '../shared/explorer'
import { fieldValue } from '../shared/model'
import type { Attribute, FolderRow, Project, Request, Response } from '../shared/model'
import { groupValue, isFilled } from '../shared/cells'
import { groupOfField, setGroupSource } from '../shared/fieldGroups'
import { fieldSource, fieldSourceGroups, rowFieldAttributes } from './fieldSources'
type Act = (request: Request) => Promise<Response | undefined>
type Run = (request: ExplorerRequest) => Promise<ExplorerResponse | undefined>
// The tab you were on stays when you move to another folder.
let lastTab: string | null = null
export function FolderPanel({
  row,
  shared,
  project,
  busy,
  act,
  run,
  onDirty,
  onEditLayout,
  initialTab = 'fields',
}: {
  row: FolderRow
  // Another linked project also shows this folder.
  shared?: boolean
  project: Project
  busy: boolean
  act: Act
  run: Run
  onDirty: (dirty: boolean) => void
  onEditLayout?: () => void
  initialTab?: string
}) {
  useLocale()

  const [error, setError] = useState(''),
    [privateValues, setPrivate] = useState(false),
    [values, setValues] = useState<Record<string, unknown>>({}),
    [newOptions, setNewOptions] = useState<Record<string, string>>({})
  const [showEmpty, setShowEmpty] = useState(false),
    [editedFields, setEditedFields] = useState<string[]>([])
  useEffect(() => setEditedFields([]), [row.rowId, privateValues])
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
  const importer = useSourceImport()
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
    () =>
      [
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
      ].map((a) => {
        // A field switched between text and date is edited, and saved, with its current type (R-240).
        const type = project.fieldBindings.find((f) => f.attributeId === a.attributeId)?.type
        return type && type !== a.type && dateOrText(a.type, type) ? { ...a, type } : a
      }),
    [project.fieldBindings, row.record]
  )
  const configured = new Set(project.fieldBindings.map((f) => f.attributeId)),
    // Fields in a group are shown together under the group (R-226), not in their source.
    mainFields = fields.filter(
      (f) => configured.has(f.attributeId) && !groupOfField(project, f.attributeId)
    ),
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
    if (
      (tab === 'images' && !showImages) ||
      (tab === 'game' && !isGame) ||
      (tab === 'appearance' && !row.record)
    )
      setTab('fields')
  }, [tab, showImages, isGame, row.record])
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
  const edit = (id: string, value: unknown) => {
    setEditedFields((ids) => (ids.includes(id) ? ids : [...ids, id]))
    setValues((v) => ({ ...v, [id]: value }))
  }
  const effective = (id: string) => (Object.hasOwn(values, id) ? values[id] : original[id])
  const attributes = rowFieldAttributes([row])
  const visibleField = (f: { attributeId: string }) =>
    showEmpty || isFilled(effective(f.attributeId)) || editedFields.includes(f.attributeId)
  const hiddenFields = fields.filter(
    (f) => !visibleField(f) && !groupOfField(project, f.attributeId)
  ).length
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
    const origin = fieldSource(attributeId, attributes)
    const attribute =
      (privateValues
        ? row.record?.projectOverrides[row.projectId]?.find((a) => a.attributeId === attributeId)
        : undefined) ?? row.record?.attributes.find((a) => a.attributeId === attributeId)
    if (Object.hasOwn(values, attributeId) || attribute?.source === 'manual')
      return origin === tr('自建') ? undefined : `${origin} · ${tr('已手動修改')}`
    if (!attribute) return origin === tr('自建') ? undefined : origin
    const provider = attribute.sourceRecord?.provider,
      name = metadataSources.find((item) => item.id === provider)?.name
    return name ? tr('來自 {0}', name) : tr('來自網站匯入')
  }
  const renderField = (f: (typeof fields)[number]) => (
    <FolderFieldInput
      key={f.attributeId}
      field={f}
      value={effective(f.attributeId)}
      binding={project.fieldBindings.find((binding) => binding.attributeId === f.attributeId)}
      note={fieldNote(f.attributeId)}
      disabled={disabled}
      busy={busy}
      draftOption={newOptions[f.attributeId] ?? ''}
      onDraftOption={(text) => setNewOptions((v) => ({ ...v, [f.attributeId]: text }))}
      onChange={(value) => edit(f.attributeId, value)}
      onAddOption={(option) => void addOption(f.attributeId, option)}
    />
  )
  // Field sections (sources and groups) start folded so the Data tab stays short; the titles show how many hold data.
  // A list with a single section shows it open. What the user opens stays open until another folder is shown (R-231).
  const [openSections, setOpenSections] = useState<string[]>([])
  useEffect(() => setOpenSections([]), [row.rowId])
  const section = (key: string, alone: boolean) => ({
    open: alone || openSections.includes(key),
    onClick: (event: React.MouseEvent) => {
      if (alone) return
      event.preventDefault()
      setOpenSections((now) =>
        now.includes(key) ? now.filter((item) => item !== key) : [...now, key]
      )
    },
  })
  const mainSections =
    (project.fieldGroups?.length ?? 0) +
    fieldSourceGroups(mainFields.filter(visibleField), attributes).length
  // A field group: every member's value side by side, and which member this folder shows (saved in the project).
  const folderId = row.record?.folderId
  const renderFieldGroups = () =>
    (project.fieldGroups ?? []).map((group) => {
      const alias = (id: string) =>
          project.fieldBindings.find((field) => field.attributeId === id)?.alias ?? id,
        shown = groupValue(project, group, row),
        chosen = folderId ? project.groupSources?.[folderId]?.[group.groupId] : undefined,
        members = group.memberIds.flatMap((id) => fields.find((f) => f.attributeId === id) ?? [])
      const fold = section('group:' + group.groupId, mainSections <= 1)
      return (
        <details
          key={group.groupId}
          className="field-source-group field-group-block"
          open={fold.open}
        >
          <summary onClick={fold.onClick}>
            {group.name}{' '}
            <Text component="span" size="xs" c="dimmed">
              {shown.attributeId ? tr('顯示「{0}」', alias(shown.attributeId)) : tr('都沒有值')}
            </Text>
          </summary>
          <Stack gap="xs">
            <Select
              size="xs"
              label={tr('這個資料夾顯示')}
              disabled={busy || !folderId}
              allowDeselect={false}
              value={chosen ?? ''}
              data={[
                { value: '', label: tr('自動（依群組順序）') },
                ...group.memberIds.map((id) => ({
                  value: id,
                  label: alias(id),
                  disabled: id !== chosen && !isFilled(fieldValue(row, id)),
                })),
              ]}
              onChange={(value) =>
                folderId &&
                void act({
                  action: 'saveProject',
                  project: setGroupSource(project, folderId, group.groupId, value || undefined),
                })
              }
            />
            {shown.chosenEmpty && chosen && (
              <Text size="xs" c="orange" role="status">
                {shown.attributeId
                  ? tr(
                      '指定的「{0}」目前沒有值，暫時依順序顯示「{1}」。',
                      alias(chosen),
                      alias(shown.attributeId)
                    )
                  : tr('指定的「{0}」目前沒有值。', alias(chosen))}
              </Text>
            )}
            <Stack>{members.map(renderField)}</Stack>
          </Stack>
        </details>
      )
    })
  const renderGroups = (items: typeof fields, sections: number, prefix = '') =>
    fieldSourceGroups(items.filter(visibleField), attributes).map(({ source, fields }) => {
      const fold = section(prefix + source, sections <= 1)
      return (
        <details key={source} className="field-source-group" open={fold.open}>
          <summary onClick={fold.onClick}>
            {source}{' '}
            <Text component="span" size="xs" c="dimmed">
              {tr('{0} 項有資料', fields.filter((f) => isFilled(effective(f.attributeId))).length)}
            </Text>
          </summary>
          <Stack>{fields.map(renderField)}</Stack>
        </details>
      )
    })
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
      configured.size &&
      fields.every((f) => !configured.has(f.attributeId) || empty(original[f.attributeId])) &&
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
          <Text size="sm">{tr('偵測到遊戲，為了保護內部檔案，不會在裡面建立資訊。')}</Text>
          <Group gap="xs" mt="xs">
            <Button size="compact-sm" disabled={disabled} onClick={() => boundary('root')}>
              {tr('確認為遊戲主資料夾')}
            </Button>
            <Button
              size="compact-sm"
              variant="default"
              disabled={disabled}
              onClick={() => boundary('not-game')}
            >
              {tr('這不是遊戲目錄')}
            </Button>
            <Button size="compact-sm" variant="subtle" onClick={() => setTab('advanced')}>
              {tr('更多選項')}
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
          {row.record && <Tabs.Tab value="appearance">{tr('外觀')}</Tabs.Tab>}
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
              {(shared ||
                privateValues ||
                !!row.record?.projectOverrides[row.projectId]?.length) && (
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
              )}
            </Group>
            <FolderSourceImport
              importer={importer}
              row={row}
              busy={busy}
              disabled={disabled}
              fieldDirty={fieldDirty}
              run={run}
              setError={setError}
            />
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
            <Checkbox
              size="xs"
              label={tr(
                '顯示未填欄位（{0}）',
                fields.filter((f) => !isFilled(effective(f.attributeId))).length
              )}
              checked={showEmpty}
              onChange={(event) => setShowEmpty(event.currentTarget.checked)}
            />
            {hiddenFields > 0 && (
              <Text size="xs" c="dimmed">
                {tr('已隱藏 {0} 個未填欄位', hiddenFields)}
              </Text>
            )}
            {renderFieldGroups()}
            {renderGroups(mainFields, mainSections)}
            {!mainFields.length && !project.fieldGroups?.length && (
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
                    <Stack>
                      {renderGroups(
                        otherFields,
                        fieldSourceGroups(otherFields.filter(visibleField), attributes).length,
                        'other:'
                      )}
                    </Stack>
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
        {/* Folder type and card layout: how this folder looks, apart from its data (R-235). */}
        <Tabs.Panel value="appearance" pt="md">
          <Stack>
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
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="images" pt="md">
          <FolderImages
            row={row}
            assets={assets}
            imageCells={imageCells}
            isGame={isGame}
            disabled={disabled}
            locked={fieldDirty}
            act={act}
            run={run}
          />
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
