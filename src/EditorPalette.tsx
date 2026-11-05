import { useState } from 'react'
import { Icon } from './icons'
import { t as tr } from './i18n'
import {
  Accordion,
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Tooltip,
} from '@mantine/core'
import type { Layout } from 'react-grid-layout'
import { fieldValue } from '../shared/model'
import type {
  Cell,
  Attribute,
  CellKind,
  FieldDeletionPreview,
  FolderRow,
  Project,
  Request,
  Response,
} from '../shared/model'
import { addCommonFields, editorFields } from '../shared/layouts'
import { commonFieldNames } from './commonFields'
import { typeKinds } from './editorKinds'
import { isFilled } from '../shared/cells'
import { fieldSource, fieldSourceGroups } from './fieldSources'

// One line of the previewed folder's value for a field; long values are cut with "…" and shown whole on hover.
function FieldValuePreview({ value }: { value: unknown }) {
  const text = Array.isArray(value)
    ? value.map(String).join(', ')
    : typeof value === 'boolean'
      ? value
        ? tr('是')
        : tr('否')
      : value == null
        ? ''
        : String(value)
  const clean = text.replace(/\s+/g, ' ').trim()
  return (
    <span
      className={clean ? 'palette-field-value' : 'palette-field-value is-empty'}
      title={clean ? clean.slice(0, 2000) : undefined}
    >
      {clean || tr('（此筆沒有值）')}
    </span>
  )
}

type Binding = Project['fieldBindings'][number]
type Source = ReturnType<typeof editorFields>[number]

// The left-hand palette: basic components, project fields, existing fields and the new-field form.
export type EditorPaletteProps = {
  project: Project
  draft: Project
  busy: boolean
  dirty: boolean
  hints: Record<CellKind, string>
  labels: Record<CellKind, string>
  typeLabels: Record<string, string>
  typeHints: Record<string, string>
  sources: Source[]
  availableFields: Source[]
  attributes: Attribute[]
  reference: (source: Binding) => void
  // The folder shown in the editor preview: each field lists its current value so the real data is visible.
  preview?: FolderRow
  // Game components stay folded away unless a game is in the project or already used on the card.
  hasGames: boolean
  dragImage: (event: React.DragEvent<HTMLDivElement>) => void
  act: (request: Request) => Promise<Response | undefined>
  add: (kind: CellKind, grid?: Cell['grid'], layout?: Layout, source?: Binding) => void
  change: (next: Project) => void
  setError: (message: string) => void
  setFieldDeletion: (preview: FieldDeletionPreview) => void
  setRenaming: (value: { id: string; name: string }) => void
}

export function EditorPalette(props: EditorPaletteProps) {
  const {
    project,
    draft,
    busy,
    dirty,
    hints,
    labels,
    typeLabels,
    typeHints,
    sources,
    availableFields,
    attributes,
    reference,
    preview,
    hasGames,
    dragImage,
    act,
    add,
    change,
    setError,
    setFieldDeletion,
    setRenaming,
  } = props
  const [newField, setNewField] = useState('')
  const [newType, setNewType] = useState('string')
  const [newOptions, setNewOptions] = useState('')
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState(''),
    [provider, setProvider] = useState<string | null>(null),
    [onlyFilled, setOnlyFilled] = useState(false)
  const matches = (binding: Binding, withEmpty = true) => {
    const origin = fieldSource(binding.attributeId, attributes)
    return (
      (!provider || provider === origin) &&
      `${binding.alias} ${origin}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()) &&
      (!withEmpty || !onlyFilled || !preview || isFilled(fieldValue(preview, binding.attributeId)))
    )
  }
  const hiddenCount = [
    ...draft.fieldBindings,
    ...availableFields.map((f) => ({ ...f, alias: f.key })),
  ].filter((f) => matches(f, false) && !matches(f)).length
  const grouped = (bindings: Binding[]) =>
    fieldSourceGroups(
      bindings.filter((f) => matches(f)),
      attributes
    ).map(({ source, fields }) => (
      <details key={source} className="field-source-group" open>
        <summary>
          {source}{' '}
          <Text component="span" size="xs" c="dimmed">
            {tr(
              '{0} 項有資料',
              fields.filter((f) =>
                preview
                  ? isFilled(fieldValue(preview, f.attributeId))
                  : sources.find((s) => s.attributeId === f.attributeId)?.hasData
              ).length
            )}
          </Text>
        </summary>
        <Stack gap="xs">{fields.map(paletteField)}</Stack>
      </details>
    ))
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
          {preview && <FieldValuePreview value={fieldValue(preview, binding.attributeId)} />}
          <span className="palette-field-meta">
            <Badge size="xs" color="gray">
              {fieldSource(binding.attributeId, attributes)}
            </Badge>
            <span>{typeLabels[binding.type]}</span>
            <span>
              {tr(
                '使用 {0} 次',
                draft.cells.filter(
                  (cell) =>
                    cell.attributeId === binding.attributeId ||
                    cell.fallbackIds?.includes(binding.attributeId)
                ).length
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
        {!draft.fieldBindings.some((f) => f.attributeId === binding.attributeId) && (
          <Button
            size="compact-xs"
            variant="light"
            disabled={source?.conflict}
            onClick={() => reference(binding)}
          >
            {tr('只引用欄位')}
          </Button>
        )}
        <Tooltip label={tr('重新命名欄位')}>
          <ActionIcon
            className="field-rename"
            variant="subtle"
            color="gray"
            aria-label={tr('重新命名欄位 {0}', binding.alias)}
            disabled={
              busy || !draft.fieldBindings.some((f) => f.attributeId === binding.attributeId)
            }
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
            disabled={
              busy ||
              dirty ||
              !draft.fieldBindings.some((f) => f.attributeId === binding.attributeId)
            }
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
  const paletteItem = (kind: CellKind) => (
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
  )
  return (
    <aside className="editor-palette" aria-label={tr('拖入組件')}>
      <h3>{tr('組件')}</h3>
      <section className="palette-section">
        <h4>{tr('要顯示的資訊')}</h4>
        <div className="basic-palette">
          {(['name', 'path', 'system-info', 'image', 'open-folder'] as CellKind[]).map(paletteItem)}
        </div>
      </section>
      <section className="palette-section">
        <h4>{tr('排版輔助')}</h4>
        <div className="basic-palette">
          {(['static-text', 'spacer', 'divider'] as CellKind[]).map(paletteItem)}
        </div>
      </section>
      <Accordion
        variant="separated"
        defaultValue={hasGames ? 'game' : null}
        className="game-palette"
      >
        <Accordion.Item value="game">
          <Accordion.Control>{tr('遊戲專用')}</Accordion.Control>
          <Accordion.Panel>
            <div className="basic-palette">
              {(['game-cover', 'game-launch'] as CellKind[]).map(paletteItem)}
            </div>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <section className="project-field-palette">
        <Group justify="space-between" align="center" mb={6}>
          <h4 style={{ margin: 0 }}>{tr('專案欄位')}</h4>
          <Button size="compact-xs" variant="light" onClick={() => setAdding(true)}>
            {tr('＋ 新增欄位')}
          </Button>
        </Group>
        {!draft.fieldBindings.length && (
          <Text size="xs" c="dimmed" mb={6}>
            {tr('還沒有欄位。按「＋ 新增欄位」建立，再拖到畫布。')}
          </Text>
        )}
        {!draft.fieldBindings.length && (
          <Button
            size="compact-xs"
            variant="filled"
            mb={6}
            onClick={() => change(addCommonFields(draft, commonFieldNames()))}
          >
            {tr('加入常用欄位')}
          </Button>
        )}
        <Stack gap="xs" mb="sm">
          <TextInput
            size="xs"
            aria-label={tr('搜尋欄位')}
            placeholder={tr('搜尋名稱或來源')}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
          />
          <Select
            size="xs"
            aria-label={tr('篩選來源')}
            placeholder={tr('全部來源')}
            clearable
            value={provider}
            onChange={setProvider}
            data={[
              ...new Set(
                [...draft.fieldBindings, ...availableFields].map((f) =>
                  fieldSource(f.attributeId, attributes)
                )
              ),
            ]}
          />
          <Checkbox
            size="xs"
            label={tr('只看預覽資料夾有值的欄位')}
            disabled={!preview}
            checked={onlyFilled}
            onChange={(e) => setOnlyFilled(e.currentTarget.checked)}
          />
          {hiddenCount > 0 && (
            <Group gap={4}>
              <Text size="xs" c="dimmed">
                {tr('已隱藏 {0} 個未填欄位', hiddenCount)}
              </Text>
              <Button size="compact-xs" variant="subtle" onClick={() => setOnlyFilled(false)}>
                {tr('顯示全部')}
              </Button>
            </Group>
          )}
        </Stack>
        {grouped(draft.fieldBindings)}
        {draft.fieldBindings.length > 0 && !draft.fieldBindings.some((f) => matches(f)) && (
          <Text size="xs" c="dimmed">
            {tr('沒有符合的欄位')}
          </Text>
        )}
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
                  {grouped(
                    availableFields
                      .filter((f) => f.shared)
                      .map((f) => ({ attributeId: f.attributeId, alias: f.key, type: f.type }))
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
                  {grouped(
                    availableFields
                      .filter((f) => !f.shared && f.private)
                      .map((f) => ({ attributeId: f.attributeId, alias: f.key, type: f.type }))
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
      <Modal opened={adding} onClose={() => setAdding(false)} title={tr('新增欄位')} size="sm">
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
            setAdding(false)
            setError('')
          }}
        >
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
      </Modal>
    </aside>
  )
}
