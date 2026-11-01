import { metadataSources, sourceForUrl, type MetadataSourceId } from '../shared/sources'
import { GameActionEditor, GameActionTargets } from './GameActions'
import { cardPresets, rowCells } from '../shared/layouts'
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
  NumberInput,
  Select,
  Stack,
  Tabs,
  TagsInput,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core'
import { visibleCells } from '../shared/layouts'
import { ImageUrlImport } from './ImageUrlImport'
import {
  contentCells,
  gameActionTemplates,
  type ActionTemplate,
  type ExplorerRequest,
  type ExplorerResponse,
  type MetadataPreview,
} from '../shared/explorer'
import type {
  Attribute,
  CleanupPreview,
  CleanupResult,
  FolderRow,
  Project,
  Request,
  Response,
} from '../shared/model'
type Act = (request: Request) => Promise<Response | undefined>
type Run = (request: ExplorerRequest) => Promise<ExplorerResponse | undefined>
export function FolderPanel({
  row,
  project,
  busy,
  act,
  run,
  onDirty,
  initialTab = 'fields',
}: {
  row: FolderRow
  project: Project
  busy: boolean
  act: Act
  run: Run
  onDirty: (dirty: boolean) => void
  initialTab?: string
}) {
  const sourceLabels: Record<string, string> = {
    TITLE: tr('名稱'),
    TITLE_ORIGINAL: tr('原文名稱'),
    TAGS: tr('標籤'),
    PARODY: tr('原作'),
    CHARACTER: tr('角色'),
    ARTIST: tr('作者'),
    GROUP: tr('社團'),
    COSPLAYER: tr('Cosplayer'),
    FEMALE: tr('女性標籤'),
    MALE: tr('男性標籤'),
    MIXED: tr('混合標籤'),
    OTHER: tr('其他標籤'),
    RECLASS: tr('重新分類'),
    DESCRIPTION: tr('簡介'),
    DEVELOPERS: tr('開發商'),
    PUBLISHERS: tr('發行商'),
    GENRES: tr('類型'),
    STORE_RELEASE_DATE: tr('Steam 商店發售日期'),
    STORE_URL: tr('商店網址'),
    APP_ID: 'Steam App ID',
    PRODUCT_TYPE: tr('商品類型'),
    RELEASE_STATUS: tr('發售狀態'),
    GALLERY_CATEGORY: tr('圖庫分類'),
    GALLERY_URL: tr('圖庫網址'),
    UPLOADER: tr('上傳者'),
    PAGE_COUNT: tr('頁數'),
    GALLERY_POSTED_UTC: tr('圖庫公開時間'),
    SOURCE_URL: tr('來源網址'),
    AUTHORS: tr('作者'),
    ARTISTS: tr('演出者'),
    FORMAT: tr('格式'),
    RELEASE_DATE: tr('來源日期'),
    LANGUAGE: tr('語言'),
    LANGUAGES: tr('語言'),
    PLATFORMS: tr('平台'),
    LICENSE: tr('授權'),
    COUNTRY: tr('國家'),
    BARCODE: tr('條碼'),
    TRACKS: tr('曲目'),
    CHAPTER_COUNT: tr('章節數'),
    EPISODE_COUNT: tr('集數'),
    ISBN: tr('ISBN'),
  }

  useLocale()

  const [error, setError] = useState(''),
    [privateValues, setPrivate] = useState(false),
    [values, setValues] = useState<Record<string, unknown>>({})
  const [tab, setTab] = useState<string | null>(initialTab),
    [tasks, setTasks] = useState<ActionTemplate[]>(),
    [targetDirty, setTargetDirty] = useState(false)
  useEffect(() => {
    setTab(initialTab === 'game' && project.mediaCategory !== 'game' ? 'fields' : initialTab)
    setTasks(undefined)
  }, [row.rowId, initialTab, project.mediaCategory])
  const [provider, setProvider] = useState<MetadataSourceId>(
      project.mediaCategory === 'game' ? 'steam' : 'eh'
    ),
    [source, setSource] = useState(''),
    [preview, setPreview] = useState<MetadataPreview>(),
    [keys, setKeys] = useState<string[]>([]),
    [cover, setCover] = useState(true),
    [sourceResult, setSourceResult] = useState(''),
    [replaceSource, setReplaceSource] = useState(false)
  const [cleanup, setCleanup] = useState<CleanupPreview>(),
    [cleanupResult, setCleanupResult] = useState<CleanupResult>(),
    [restart, setRestart] = useState(false)
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
      [...rowCells(project, row), ...contentCells(project, project.mediaCategory)]
        .filter((c) => c.kind === 'image')
        .map((c) => [c.cellId, c])
    ).values(),
  ]
  const assets = row.record?.assets ?? []
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
  const fieldDirty = fields.some(
    (f) =>
      Object.hasOwn(values, f.attributeId) &&
      JSON.stringify(values[f.attributeId]) !== JSON.stringify(original[f.attributeId])
  )
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
  const renderField = (f: (typeof fields)[number]) => {
    const value = effective(f.attributeId),
      binding = project.fieldBindings.find((binding) => binding.attributeId === f.attributeId)
    if (f.type === 'boolean')
      return (
        <Select
          key={f.attributeId}
          label={f.key}
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
    if (f.type === 'enum')
      return (
        <Select
          key={f.attributeId}
          label={f.key}
          placeholder={tr('未填')}
          clearable
          value={typeof value === 'string' ? value : null}
          data={[
            ...(binding?.options ?? []).map((option) => ({ value: option, label: option })),
            ...(typeof value === 'string' && !binding?.options?.includes(value)
              ? [{ value, label: value, disabled: true }]
              : []),
          ]}
          disabled={disabled || !binding?.options?.length}
          onChange={(value) => edit(f.attributeId, value)}
        />
      )
    if (f.type === 'url' || f.type === 'date')
      return (
        <TextInput
          key={f.attributeId}
          label={f.key}
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
        type="datetime-local"
        value={String(effective(f.attributeId) ?? '')}
        disabled={disabled}
        onChange={(e) => edit(f.attributeId, e.currentTarget.value)}
      />
    ) : f.type === 'string' ? (
      <Textarea
        key={f.attributeId}
        label={f.key}
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
  const loadPreview = async () => {
    setError('')
    setSourceResult('')
    if (sourceForUrl(source.trim()) !== provider) {
      setError(tr('來源網址與選定來源不符'))
      return
    }
    const result = await run({ action: 'metadataPreview', source: source.trim(), provider })
    if (result?.preview) {
      setReplaceSource(false)
      setPreview(result.preview)
      setKeys(result.preview.values.filter((v) => v.key !== 'COVER_STATUS').map((v) => v.key))
    }
  }
  const previewCleanup = async (scope: 'folder' | 'private') => {
    setCleanupResult(undefined)
    setRestart(false)
    const result = await act({ action: 'cleanupPreview', rowId: row.rowId, scope })
    if (result?.preview) setCleanup(result.preview)
  }
  return (
    <Stack gap="md" className="folder-settings">
      <div className="folder-settings-intro">
        <Text size="sm" c="dimmed" className="path">
          {row.path}
        </Text>
        <Group gap="xs">
          <Badge color={row.error ? 'red' : row.readonly || row.stopped ? 'orange' : 'gray'}>
            {row.error
              ? tr('需要處理')
              : row.readonly
                ? tr('受保護')
                : row.stopped
                  ? tr('已停止記錄')
                  : tr('資料夾設定')}
          </Badge>
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() => void act({ action: 'open', rowId: row.rowId })}
          >
            {tr('在檔案總管開啟')}
          </Button>
        </Group>
      </div>
      {row.error && <Alert color="orange">{row.error}</Alert>}
      {error && (
        <Alert color="orange" withCloseButton onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="fields">
            {tr('資料')}
            {privateValues && (
              <Badge ml={5} size="xs" color="orange">
                {tr('私有')}
              </Badge>
            )}
          </Tabs.Tab>
          {(imageCells.length > 0 || assets.length > 0 || project.mediaCategory === 'game') && (
            <Tabs.Tab value="images">{tr('圖片')}</Tabs.Tab>
          )}
          {project.mediaCategory === 'game' && <Tabs.Tab value="game">{tr('遊戲操作')}</Tabs.Tab>}
          <Tabs.Tab value="source">{tr('來源匯入')}</Tabs.Tab>
          <Tabs.Tab value="advanced">{tr('進階')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="fields" pt="md">
          <Stack>
            <Group justify="space-between">
              <div>
                <Group gap={4} wrap="nowrap">
                  <Text fw={600}>{tr('資料夾資料')}</Text>
                  <HelpTip text={tr('填寫與此資料夾有關的資訊，保存後立即顯示。')} />
                </Group>
              </div>
              <Badge color={privateValues ? 'orange' : 'gray'} variant="light">
                {privateValues ? tr('僅目前專案') : tr('共用資料')}
              </Badge>
            </Group>
            {row.record && (
              <>
                <Select
                  label={tr('此資料夾的版面方案')}
                  allowDeselect={false}
                  value={project.folderLayouts?.[row.record.folderId] ?? ''}
                  data={[
                    { value: '', label: tr('遵循通用設定（此專案版面）') },
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
                <Divider />
              </>
            )}
            {mainFields.map(renderField)}
            {!mainFields.length && (
              <Text c="dimmed" size="sm">
                {tr('專案尚未配置欄位，可在積木編輯器新增。')}
              </Text>
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
            <Group justify="flex-end">
              <Button disabled={disabled || !fieldDirty} loading={busy} onClick={() => void save()}>
                {tr('保存')}
                {privateValues ? tr('此專案資料') : tr('欄位資料')}
              </Button>
            </Group>
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
                asset = assets.find((a) => a.assetId === assigned)
              return (
                <section
                  className="settings-section image-slot"
                  key={cell.cellId}
                  data-cell-id={cell.cellId}
                >
                  <Group justify="space-between">
                    <Text fw={600}>
                      {tr('圖片')}
                      {index + 1}
                    </Text>
                    {asset && (
                      <img
                        src={'media://asset/' + row.rowId + '/' + asset.assetId}
                        alt={asset.originalName}
                      />
                    )}
                  </Group>
                  <Select
                    label={tr('圖片 ') + (index + 1) + tr(' 的來源')}
                    placeholder={tr('未設定（可留空）')}
                    clearable
                    value={assigned ?? null}
                    data={assets.map((a) => ({ value: a.assetId, label: a.originalName }))}
                    disabled={disabled || fieldDirty}
                    onChange={(assetId) =>
                      void run({
                        action: 'cellImage',
                        rowId: row.rowId,
                        revision: row.record!.revision,
                        cellId: cell.cellId,
                        assetId,
                      })
                    }
                  />
                  <Button
                    variant="default"
                    size="xs"
                    mt="sm"
                    disabled={disabled || fieldDirty}
                    onClick={() =>
                      void act({
                        action: 'image',
                        rowId: row.rowId,
                        revision: row.record!.revision,
                        cellId: cell.cellId,
                      })
                    }
                  >
                    {tr('匯入至圖片')}
                    {index + 1}
                  </Button>
                </section>
              )
            })}
            {!imageCells.length && (
              <Text size="sm" c="dimmed">
                {tr('目前版面沒有圖片組件，無須為每個資料夾指定圖片。')}
              </Text>
            )}
            {project.mediaCategory === 'game' && (
              <section className="settings-section">
                <Text fw={600} mb="sm">
                  {tr('遊戲封面')}
                </Text>
                <Select
                  label={tr('封面圖片')}
                  clearable={false}
                  value={row.record?.details?.bannerAssetId ?? assets[0]?.assetId ?? null}
                  data={assets.map((a) => ({ value: a.assetId, label: a.originalName }))}
                  disabled={disabled || fieldDirty}
                  onChange={(assetId) =>
                    assetId &&
                    void run({
                      action: 'banner',
                      rowId: row.rowId,
                      revision: row.record!.revision,
                      assetId,
                    })
                  }
                />
                <Button
                  variant="default"
                  size="xs"
                  mt="sm"
                  disabled={disabled || fieldDirty}
                  onClick={() =>
                    void act({ action: 'image', rowId: row.rowId, revision: row.record!.revision })
                  }
                >
                  {tr('匯入封面')}
                </Button>
                <ImageUrlImport row={row} run={run} disabled={disabled || fieldDirty} />
              </section>
            )}
            {!!assets.length && (
              <details>
                <summary>
                  {tr('已保存的圖片（')}
                  {assets.length}）
                </summary>
                <div className="images">
                  {assets.map((a) => (
                    <figure key={a.assetId}>
                      <img
                        src={'media://asset/' + row.rowId + '/' + a.assetId}
                        alt={a.originalName}
                      />
                      <figcaption>{a.originalName}</figcaption>
                    </figure>
                  ))}
                </div>
              </details>
            )}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="source" pt="md">
          <Stack>
            <div>
              <Group gap={4} wrap="nowrap">
                <Text fw={600}>{tr('從網站補充資訊')}</Text>
                <HelpTip text={tr('選來源、貼連結、預覽後再決定要匯入的欄位。')} />
              </Group>
            </div>
            <section className="settings-section">
              <Stack gap="sm">
                <Select
                  disabled={busy}
                  label={tr('資料來源')}
                  allowDeselect={false}
                  value={provider}
                  data={[...new Set(metadataSources.map((source) => source.group))].map(
                    (group) => ({
                      group: tr(group),
                      items: metadataSources
                        .filter((source) => source.group === group)
                        .map((source) => ({
                          value: source.id,
                          label:
                            source.name +
                            (source.categories.some(
                              (category) => category === project.mediaCategory
                            )
                              ? ' · ' + tr('適合此分類')
                              : ''),
                        })),
                    })
                  )}
                  onChange={(value) => {
                    setProvider((value ?? 'eh') as MetadataSourceId)
                    setSource('')
                    setPreview(undefined)
                    setSourceResult('')
                  }}
                />
                <TextInput
                  disabled={busy}
                  label={tr('作品網址或 ID')}
                  placeholder={metadataSources.find((source) => source.id === provider)?.hint}
                  value={source}
                  onChange={(event) => {
                    setSource(event.currentTarget.value)
                    setPreview(undefined)
                  }}
                />
                <Group justify="flex-end">
                  <Button
                    disabled={disabled || fieldDirty || !source.trim()}
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
                  {provider === 'steam'
                    ? tr('發售日保留 Steam 商店顯示的日期，不推定為作品首次發行日。')
                    : tr('日期依來源保留，不推定為作品首次發行日。')}
                  {tr('預設只填空值；人工欄位保持原樣。')}
                </Text>
                <Stack gap="sm">
                  {preview.values
                    .filter((v) => v.key !== 'COVER_STATUS')
                    .map((v) => (
                      <Checkbox
                        key={v.key}
                        label={
                          <span className="source-field">
                            <strong>{sourceLabels[v.key] ?? v.key}</strong>
                            <span>
                              {Array.isArray(v.value) ? v.value.join('、') : String(v.value)}
                            </span>
                            {row.record?.attributes.find(
                              (attribute) =>
                                attribute.attributeId ===
                                (preview.provider ?? 'eh') + '-' + v.key.toLowerCase()
                            ) && (
                              <small>
                                {tr(
                                  '目前值：{0}',
                                  String(
                                    row.record.attributes.find(
                                      (attribute) =>
                                        attribute.attributeId ===
                                        (preview.provider ?? 'eh') + '-' + v.key.toLowerCase()
                                    )!.value
                                  )
                                )}
                              </small>
                            )}
                          </span>
                        }
                        checked={keys.includes(v.key)}
                        onChange={(e) =>
                          setKeys((current) =>
                            e.currentTarget.checked
                              ? [...current, v.key]
                              : current.filter((k) => k !== v.key)
                          )
                        }
                      />
                    ))}
                </Stack>
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
                <Group justify="flex-end" mt="md">
                  <Button variant="default" disabled={busy} onClick={() => setPreview(undefined)}>
                    {tr('取消預覽')}
                  </Button>
                  <Button
                    disabled={disabled || fieldDirty || (!keys.length && !(preview.image && cover))}
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
        </Tabs.Panel>
        <Tabs.Panel value="game" pt="md" keepMounted>
          <Stack>
            <Group justify="space-between">
              <Group gap={4} wrap="nowrap">
                <Text fw={600}>{tr('遊戲操作')}</Text>
                <HelpTip text={tr('版型套用全專案；目標與參數只屬於目前資料夾。')} />
              </Group>
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
        <Tabs.Panel value="advanced" pt="md">
          <Stack>
            {' '}
            <section className="settings-section">
              <Text fw={600}>{tr('掃描邊界')}</Text>
              {row.boundary ? (
                <>
                  <Text size="sm" c="dimmed">
                    {row.boundary.engines.join('／')} · {row.boundary.evidence.join('；')}
                  </Text>
                  <Group mt="sm">
                    <Button size="xs" disabled={disabled} onClick={() => boundary('root')}>
                      {tr('確認遊戲 ROOT')}
                    </Button>
                    <Button
                      size="xs"
                      variant="default"
                      disabled={disabled}
                      onClick={() => boundary('root', true)}
                    >
                      {tr('唯讀查看內部')}
                    </Button>
                    <Button
                      size="xs"
                      variant="subtle"
                      disabled={disabled}
                      onClick={() => boundary('not-game')}
                    >
                      {tr('這不是遊戲目錄')}
                    </Button>
                  </Group>
                </>
              ) : (
                <Button size="xs" mt="sm" disabled={disabled} onClick={() => boundary('root')}>
                  {tr('標記為遊戲 ROOT')}
                </Button>
              )}
            </section>
            <section className="settings-section">
              <Text fw={600} mb="sm">
                {tr('資料範圍')}
              </Text>
              <Checkbox
                label={
                  <HelpLabel
                    label={tr('此專案使用獨立資料')}
                    help={tr('開啟後，修改僅用於目前專案；其他專案仍使用共用資料。')}
                  />
                }
                aria-label={tr('顯式編輯本專案私有覆寫')}
                checked={privateValues}
                disabled={disabled}
                onChange={(e) => {
                  if (!fieldDirty || window.confirm(tr('切換會放棄目前欄位草稿？'))) {
                    setValues({})
                    setPrivate(e.currentTarget.checked)
                  }
                }}
              />
            </section>
            <details className="settings-section">
              <summary>{tr('全部已存屬性與來源')}</summary>
              <pre>{JSON.stringify(row.record, null, 2) ?? tr('沒有可攜記錄')}</pre>
            </details>
            <section className="settings-section cleanup-section">
              <Group gap={4} wrap="nowrap">
                <Text fw={600}>{tr('清除此資料夾的程式資料')}</Text>
                <HelpTip text={tr('原始資料夾與媒體保留。先預覽範圍，確認後才清理。')} />
              </Group>
              <Group>
                <Button
                  size="xs"
                  variant="default"
                  color="red"
                  disabled={busy || fieldDirty || row.readonly}
                  onClick={() => void previewCleanup('folder')}
                >
                  {tr('預覽清除此資料夾資料')}
                </Button>
                {!!row.record?.projectOverrides[row.projectId]?.length && (
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    disabled={busy || fieldDirty}
                    onClick={() => void previewCleanup('private')}
                  >
                    {tr('只清此專案私有覆寫')}
                  </Button>
                )}
              </Group>
              {cleanup && (
                <Stack mt="md">
                  <Alert color="orange" title={tr('清理預覽')}>
                    {cleanup.scope === 'private'
                      ? tr('只移除目前專案私有覆寫')
                      : tr('移除此資料夾的受管記錄及資產')}
                    {tr('；共')}
                    {cleanup.count} {tr('筆。未知檔案、離線與未連結副本不在範圍。')}
                  </Alert>
                  <div className="file-list">
                    {cleanup.paths.map((p) => (
                      <div key={p}>{p}</div>
                    ))}
                  </div>
                  {cleanup.skipped.map((s, i) => (
                    <Text key={i} size="xs" c="dimmed">
                      {s}
                    </Text>
                  ))}
                  {cleanup.scope === 'folder' && (
                    <Checkbox
                      label={
                        <HelpLabel
                          label={tr('清除後立即重新開始記錄')}
                          help={tr('預設停止記錄，避免下次掃描立即建立資料。')}
                        />
                      }
                      checked={restart}
                      onChange={(e) => setRestart(e.currentTarget.checked)}
                    />
                  )}
                  <Group justify="flex-end">
                    <Button variant="default" disabled={busy} onClick={() => setCleanup(undefined)}>
                      {tr('取消清理')}
                    </Button>
                    <Button
                      color="red"
                      disabled={busy || fieldDirty}
                      loading={busy}
                      onClick={async () => {
                        const result = await act({
                          action: 'cleanup',
                          token: cleanup.token,
                          restart,
                        })
                        if (result?.cleanup) {
                          setCleanupResult(result.cleanup)
                          setCleanup(undefined)
                        } else {
                          setCleanup(undefined)
                          setError(tr('清理未完成，請重新預覽範圍後重試。'))
                        }
                      }}
                    >
                      {tr('確認清理列出的本程式資料')}
                    </Button>
                  </Group>
                </Stack>
              )}
              {cleanupResult && (
                <Alert
                  mt="md"
                  color={cleanupResult.failed.length ? 'orange' : 'teal'}
                  title={tr('已清理 ') + cleanupResult.removed + tr(' 筆')}
                >
                  <Text size="sm">{tr('原始媒體保留。')}</Text>
                  {[...cleanupResult.failed, ...cleanupResult.skipped].map((s, i) => (
                    <Text size="xs" key={i}>
                      {s}
                    </Text>
                  ))}
                </Alert>
              )}
            </section>
            {(row.stopped || row.duplicate || row.error) && (
              <section className="settings-section">
                <Text fw={600} mb="sm">
                  {tr('記錄復原')}
                </Text>
                <Stack gap="xs">
                  {row.stopped && (
                    <Button
                      variant="default"
                      onClick={() => void act({ action: 'resume', rowId: row.rowId })}
                    >
                      {tr('重新啟用記錄')}
                    </Button>
                  )}
                  {row.duplicate && (
                    <Button
                      color="orange"
                      onClick={() =>
                        window.confirm(tr('確認是副本？原值保留並分配新 ID。')) &&
                        void act({ action: 'copyIdentity', rowId: row.rowId })
                      }
                    >
                      {tr('這筆是副本，另配新 ID')}
                    </Button>
                  )}
                  {row.error && !row.duplicate && (
                    <Button
                      color="orange"
                      variant="default"
                      onClick={() =>
                        window.confirm(tr('從上一個有效備份恢復？原檔會保留。')) &&
                        void act({ action: 'restore', rowId: row.rowId })
                      }
                    >
                      {tr('從上一版備份恢復')}
                    </Button>
                  )}
                </Stack>
              </section>
            )}
          </Stack>
        </Tabs.Panel>
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
            {tr('保存工具列版型')}
          </Button>
        </Stack>
      </Modal>
    </Stack>
  )
}
