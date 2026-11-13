import { dateOrText } from '../../shared/fields'
import { Icon } from '../common/icons'
import { importedFieldLabels } from '../editor/importedFieldLabels'
import { metadataSources } from '../../shared/sources'
import {
  detectFolderKind,
  effectiveKind,
  folderKinds,
  sampleOf,
  type KindSample,
} from '../../shared/kind'
import { GameActionEditor, GameActionTargets } from '../game/GameActions'
import { GameExtraSettings } from '../game/GameExtras'
import {
  addCommonFields,
  cardPresets,
  presetDraft,
  rowCells,
  syncPresetDraft,
} from '../../shared/layouts'
import { commonFieldNames } from '../editor/commonFields'
import { t as tr, useLocale } from '../i18n'
import { HelpLabel, HelpTip } from '../common/HelpTip'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import {
  Alert,
  Badge,
  Button,
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
import { FolderSourceImport, useSourceImport } from '../metadata/FolderSourceImport'
import {
  contentCells,
  gameActionTemplates,
  type ActionTemplate,
  type ExplorerRequest,
  type ExplorerResponse,
} from '../../shared/explorer'
import { fieldValue } from '../../shared/model'
import { withBookCover } from '../../shared/explorer'
import { settleGrid } from '../editor/settleGrid'
import type { Attribute, FolderRow, Project, Request, Response } from '../../shared/model'
import { groupValue, isFilled } from '../../shared/cells'
import { groupOfField, setGroupSource } from '../../shared/fieldGroups'
import { fieldSource, fieldSourceGroups, rowFieldAttributes } from '../editor/fieldSources'
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
  onEditBookLayout,
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
  // R-363: opens the book template editor at a template (a folder's own).
  onEditBookLayout?: (preset?: string) => void
  initialTab?: string
}) {
  useLocale()

  const [error, setError] = useState(''),
    [privateValues, setPrivate] = useState(false),
    [values, setValues] = useState<Record<string, unknown>>({}),
    [newOptions, setNewOptions] = useState<Record<string, string>>({})
  const [editedFields, setEditedFields] = useState<string[]>([])
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
    )
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
    isFilled(effective(f.attributeId)) || editedFields.includes(f.attributeId)
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
  // Which website a field came from (its id prefix, or the import record), and the folder's address there.
  const providerOf = (attributeId: string) =>
    metadataSources.find((source) => attributeId.startsWith(source.id + '-'))?.id ??
    row.record?.attributes.find((a) => a.attributeId === attributeId)?.sourceRecord?.provider
  const own = tr('自建')
  const ownFields = fields.filter((f) => fieldSource(f.attributeId, attributes) === own)
  const siteFields = fields.filter((f) => fieldSource(f.attributeId, attributes) !== own)
  const handMade = (attributeId: string) =>
    editedFields.includes(attributeId) ||
    (privateValues
      ? row.record?.projectOverrides[row.projectId]?.find((a) => a.attributeId === attributeId)
      : row.record?.attributes.find((a) => a.attributeId === attributeId)
    )?.source === 'manual'
  const shownValue = (value: unknown) =>
    Array.isArray(value)
      ? value.join('、')
      : typeof value === 'boolean'
        ? value
          ? tr('是')
          : tr('否')
        : value == null
          ? ''
          : String(value)
  const importedLabels = importedFieldLabels()
  const fieldLabel = (attributeId: string) => {
    const key = fields.find((field) => field.attributeId === attributeId)?.key ?? attributeId
    return (
      project.fieldBindings.find((binding) => binding.attributeId === attributeId)?.alias ??
      importedLabels[key] ??
      key
    )
  }
  const refetch = (provider: string | undefined) => {
    const address =
      (provider &&
        row.record?.attributes.find((a) => a.attributeId === provider + '-source_url')?.value) ??
      row.record?.attributes.find((a) => providerOf(a.attributeId) === provider)?.sourceRecord?.url
    if (typeof address === 'string') importer.setSource(address)
    const input = document.getElementById('folder-source-url')
    input?.scrollIntoView({ block: 'center' })
    input?.focus()
  }
  const removeSite = (provider: string | undefined, name: string) => {
    if (!provider || !row.record) return
    if (!window.confirm(tr('移除「{0}」匯入的資料？你手動修改過的欄位會保留。', name))) return
    void run({ action: 'removeSource', rowId: row.rowId, revision: row.record.revision, provider })
  }
  const renderSites = () =>
    fieldSourceGroups(
      siteFields.filter((f) => isFilled(effective(f.attributeId)) || handMade(f.attributeId)),
      attributes
    ).map(({ source, fields: items }) => {
      const provider = providerOf(items[0].attributeId),
        fold = section('site:' + source, false)
      return (
        <details key={source} className="field-source-group site-fields" open={fold.open}>
          <summary onClick={fold.onClick}>
            {tr('來自 {0}', source)}{' '}
            <Text component="span" size="xs" c="dimmed">
              {tr('{0} 項', items.length)}
            </Text>
          </summary>
          <Group gap="xs" mb="xs">
            <Button
              size="compact-xs"
              variant="light"
              disabled={disabled}
              onClick={() => refetch(provider)}
            >
              {tr('重新取得')}
            </Button>
            {provider && (
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                disabled={disabled || fieldDirty}
                onClick={() => removeSite(provider, source)}
              >
                {tr('移除這個來源的資料')}
              </Button>
            )}
          </Group>
          <Stack gap="xs">
            {items.map((field) =>
              handMade(field.attributeId) ? (
                renderField(field)
              ) : (
                <div key={field.attributeId} className="site-field">
                  <Text size="xs" c="dimmed">
                    {fieldLabel(field.attributeId)}
                  </Text>
                  <Text size="sm" className="site-field-value">
                    {shownValue(effective(field.attributeId))}
                  </Text>
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    disabled={disabled}
                    aria-label={tr('改成手動 {0}', fieldLabel(field.attributeId))}
                    onClick={() =>
                      setEditedFields((ids) =>
                        ids.includes(field.attributeId) ? ids : [...ids, field.attributeId]
                      )
                    }
                  >
                    {tr('改成手動')}
                  </Button>
                </div>
              )
            )}
          </Stack>
        </details>
      )
    })
  // Empty fields of this project (yours, or a website's not filled here) wait as chips; a click opens the input.
  const emptyFields = fields.filter(
    (f) =>
      configured.has(f.attributeId) &&
      !groupOfField(project, f.attributeId) &&
      !isFilled(effective(f.attributeId)) &&
      !editedFields.includes(f.attributeId)
  )
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
      {row.error && <Alert color="orange">{tr(row.error)}</Alert>}
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
            {renderFieldGroups()}
            {(() => {
              const mine = ownFields.filter(
                (f) =>
                  !groupOfField(project, f.attributeId) &&
                  (isFilled(effective(f.attributeId)) || editedFields.includes(f.attributeId))
              )
              return mine.length ? (
                <section className="own-fields" aria-label={tr('你的欄位')}>
                  <Text size="sm" fw={600} mb={4}>
                    {tr('你的欄位')}
                  </Text>
                  <Stack>{mine.map(renderField)}</Stack>
                </section>
              ) : null
            })()}
            {emptyFields.length > 0 && (
              <div className="field-fill-chips" role="group" aria-label={tr('補填')}>
                <Text size="xs" c="dimmed">
                  {tr('補填：')}
                </Text>
                {emptyFields.map((field) => (
                  <Button
                    key={field.attributeId}
                    size="compact-xs"
                    variant="default"
                    disabled={disabled}
                    leftSection={<Icon name="plus" size={12} />}
                    onClick={() =>
                      setEditedFields((ids) =>
                        ids.includes(field.attributeId) ? ids : [...ids, field.attributeId]
                      )
                    }
                  >
                    {fieldLabel(field.attributeId)}
                  </Button>
                ))}
              </div>
            )}
            {renderSites()}
            {!mainFields.length && !project.fieldGroups?.length && !siteFields.length && (
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
              // R-340: how this folder counts in the "all works" view.
              <Select
                label={
                  <HelpLabel
                    label={tr('在「所有作品」裡')}
                    help={tr(
                      '自動：裝著自己的圖片、影片、音樂或文字書，或是一套分集的資料夾，就算一部作品；只裝資料夾的會被穿過。'
                    )}
                  />
                }
                allowDeselect={false}
                value={row.record.details?.browseAs ?? 'auto'}
                data={[
                  { value: 'auto', label: tr('自動判斷') },
                  { value: 'work', label: tr('算一部作品') },
                  { value: 'collection', label: tr('是分類，往裡面找') },
                ]}
                disabled={disabled || fieldDirty}
                onChange={(value) =>
                  value &&
                  void run({
                    action: 'browseAs',
                    rowId: row.rowId,
                    revision: row.record!.revision,
                    value: value === 'auto' ? null : (value as 'work' | 'collection'),
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
            {row.record && detectedKind.kind === 'book' && (
              <BookLayoutChoice
                project={project}
                folderId={row.record.folderId}
                folderName={row.name}
                disabled={busy || fieldDirty}
                act={act}
                onEdit={onEditBookLayout}
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
            <GameExtraSettings
              row={row}
              disabled={disabled || fieldDirty || targetDirty}
              run={run}
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

// R-363: which book template this folder shows. "Its own" copies the template it shows now into a new one used by this
// folder only and opens it in the editor; it is an ordinary template from then on.
const presetLabel = (preset: { id: string; name: string }) =>
  preset.id === 'default' && preset.name === '預設版面' ? tr('預設版面') : preset.name
function BookLayoutChoice({
  project,
  folderId,
  folderName,
  disabled,
  act,
  onEdit,
}: {
  project: Project
  folderId: string
  folderName: string
  disabled: boolean
  act: Act
  onEdit?: (preset?: string) => void
}) {
  // The project's default cells, an older edited template getting its cover component as the editor would (R-362).
  const defaultCells = project.contentCover
    ? contentCells(project, 'book')
    : settleGrid(withBookCover(contentCells(project, 'book')))
  const presets = project.bookPresets ?? [{ id: 'default', name: '預設版面', cells: defaultCells }]
  const current = presets.find((preset) => preset.id === (project.bookPresetId ?? presets[0].id))
  const own = project.folderBookPresets?.[folderId]
  const choose = async (value: string | null) => {
    const folders = { ...project.folderBookPresets }
    if (value === '__own') {
      const used = new Set(presets.map((preset) => preset.name.toLocaleLowerCase()))
      const base = folderName.slice(0, 90).trim() || tr('此資料夾')
      let name = base
      for (let n = 2; used.has(name.toLocaleLowerCase()); n++) name = base + ' (' + n + ')'
      const shown =
        presets.find((preset) => preset.id === own)?.cells ?? current?.cells ?? defaultCells
      const id = crypto.randomUUID()
      folders[folderId] = id
      const saved = await act({
        action: 'saveProject',
        project: {
          ...project,
          contentCells: { ...project.contentCells, book: current?.cells ?? defaultCells },
          contentCover: true,
          bookPresets: [...presets, { id, name, cells: structuredClone(shown) }],
          bookPresetId: current?.id ?? presets[0].id,
          folderBookPresets: folders,
        },
      })
      if (saved) onEdit?.(id)
      return
    }
    if (value) folders[folderId] = value
    else delete folders[folderId]
    void act({
      action: 'saveProject',
      project: {
        ...project,
        folderBookPresets: Object.keys(folders).length ? folders : undefined,
      },
    })
  }
  return (
    <Select
      label={
        <HelpLabel
          label={tr('此資料夾的漫畫展示')}
          help={tr(
            '右側漫畫資訊用哪個模板；「另做一份給這個資料夾」會複製目前的模板並打開編輯器。'
          )}
        />
      }
      allowDeselect={false}
      value={own && presets.some((preset) => preset.id === own) ? own : ''}
      data={[
        {
          value: '',
          label: tr('遵循專案預設（目前：{0}）', current ? presetLabel(current) : tr('預設版面')),
        },
        ...presets.map((preset) => ({ value: preset.id, label: presetLabel(preset) })),
        // Templates are limited to 30, as card layouts are.
        { value: '__own', label: tr('另做一份給這個資料夾…'), disabled: presets.length >= 30 },
      ]}
      disabled={disabled}
      onChange={(value) => void choose(value)}
    />
  )
}
