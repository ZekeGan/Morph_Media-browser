import { useState, type ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import { t as tr } from './i18n'
import {
  ActionIcon,
  Badge,
  Button,
  Checkbox,
  Group,
  Menu,
  Modal,
  Select,
  Text,
  Textarea,
  TextInput,
  Tooltip,
  UnstyledButton,
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

// Every palette row starts with a small picture: components use an icon, fields a short glyph of their type.
const kindIcons: Partial<Record<CellKind, IconName>> = {
  name: 'folder',
  path: 'folder-go',
  'system-info': 'sliders',
  image: 'image',
  'open-folder': 'external',
  'static-text': 'edit',
  spacer: 'maximize',
  divider: 'minus',
  'game-cover': 'image',
  'game-launch': 'play',
}
const typeGlyphs: Record<string, string> = {
  string: 'Aa',
  tags: '#',
  number: '12',
  datetime: '⏱',
  boolean: '✓',
  enum: '◉',
  url: '↗',
  date: '▦',
}

// The left-hand materials panel: find something and put it on the card. Four sections share one heading style
// (folder info, your fields, layout, game); every row looks the same and is added by a click or a drag.
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
  // The game section is shown only in a project with games (or when game components are already on the card).
  hasGames: boolean
  dragImage: (event: React.DragEvent<HTMLDivElement>) => void
  act: (request: Request) => Promise<Response | undefined>
  add: (kind: CellKind, grid?: Cell['grid'], layout?: Layout, source?: Binding) => void
  change: (next: Project) => void
  setError: (message: string) => void
  setFieldDeletion: (preview: FieldDeletionPreview) => void
  setRenaming: (value: { id: string; name: string }) => void
}

function Section({
  id,
  title,
  open,
  toggle,
  action,
  className,
  children,
}: {
  id: string
  title: ReactNode
  open: boolean
  toggle: (id: string) => void
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={'palette-section' + (className ? ' ' + className : '')}>
      <div className="palette-section-head">
        <UnstyledButton
          className="palette-section-toggle"
          aria-expanded={open}
          aria-controls={'palette-' + id}
          onClick={() => toggle(id)}
        >
          <Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />
          <h4>{title}</h4>
        </UnstyledButton>
        {action}
      </div>
      {open && <div id={'palette-' + id}>{children}</div>}
    </section>
  )
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
    [onlyFilled, setOnlyFilled] = useState(false)
  const [closed, setClosed] = useState<string[]>([])
  const toggle = (id: string) =>
    setClosed((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]))
  const query = search.trim().toLocaleLowerCase()
  const bound = (attributeId: string) =>
    draft.fieldBindings.some((f) => f.attributeId === attributeId)
  const matches = (binding: Binding, withEmpty = true) => {
    const origin = fieldSource(binding.attributeId, attributes)
    return (
      `${binding.alias} ${origin}`.toLocaleLowerCase().includes(query) &&
      (!withEmpty || !onlyFilled || !preview || isFilled(fieldValue(preview, binding.attributeId)))
    )
  }
  // Fields already in this project's configuration and fields that only exist in folder records are one list;
  // whether a field is added is just the state of its row.
  const allFields: Binding[] = [
    ...draft.fieldBindings,
    ...availableFields.map((f) => ({ attributeId: f.attributeId, alias: f.key, type: f.type })),
  ]
  const shownFields = allFields.filter((f) => matches(f))
  const hiddenCount = allFields.filter((f) => matches(f, false) && !matches(f)).length
  const startNewField = (name = '') => {
    setNewField(name)
    setAdding(true)
  }
  const fieldRow = (binding: Binding) => {
    const source = sources.find((f) => f.attributeId === binding.attributeId),
      kind = typeKinds[binding.type],
      added = bound(binding.attributeId)
    if (!kind) return null
    const uses = draft.cells.filter(
      (cell) =>
        cell.attributeId === binding.attributeId || cell.fallbackIds?.includes(binding.attributeId)
    ).length
    const name = binding.alias || tr('未命名欄位')
    const origin = fieldSource(binding.attributeId, attributes)
    const scope = source?.shared === false && source.private ? tr('專案私有') : tr('共用')
    return (
      <div
        key={binding.attributeId}
        className={'palette-item palette-row palette-field' + (added ? '' : ' is-unbound')}
        data-attribute-id={binding.attributeId}
        draggable={!source?.conflict}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', kind)
          e.dataTransfer.setData('application/x-media-viewer-field', binding.attributeId)
          e.dataTransfer.effectAllowed = 'copy'
          dragImage(e)
        }}
      >
        <UnstyledButton
          className="palette-row-main"
          disabled={source?.conflict}
          title={
            source?.conflict
              ? tr('同一欄位的型別不一致，請先處理資料衝突')
              : `${name} · ${typeLabels[binding.type]} · ${origin} · ${scope}`
          }
          onClick={() => add(kind, undefined, undefined, binding)}
        >
          <span className="palette-row-icon is-glyph" aria-hidden>
            {typeGlyphs[binding.type] ?? '·'}
          </span>
          <span className="palette-row-text">
            <span className="palette-field-name">{name}</span>
            {preview ? (
              <FieldValuePreview value={fieldValue(preview, binding.attributeId)} />
            ) : (
              <span className="palette-row-meta">{typeLabels[binding.type]}</span>
            )}
          </span>
          {/* Shared is the usual case; only the exceptions get a mark (the full scope is in the tooltip). */}
          {source?.shared === false && source.private && (
            <Badge size="xs" color="orange" className="palette-row-scope">
              {tr('專案私有')}
            </Badge>
          )}
          {source?.shared && source.private && (
            <Badge size="xs" color="orange" className="palette-row-scope">
              {tr('有專案覆寫')}
            </Badge>
          )}
          <span className={'palette-row-state' + (added ? '' : ' is-unbound')}>
            {added ? tr('使用 {0} 次', uses) : tr('尚未加入')}
          </span>
        </UnstyledButton>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <Tooltip label={tr('欄位操作')} openDelay={300}>
              <ActionIcon
                className="palette-row-more"
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={tr('欄位操作 {0}', name)}
              >
                <Icon name="more" size={14} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            {!added && (
              <Menu.Item disabled={source?.conflict} onClick={() => reference(binding)}>
                {tr('只引用欄位')}
              </Menu.Item>
            )}
            <Menu.Item
              leftSection={<Icon name="edit" size={14} />}
              disabled={busy || !added}
              onClick={() => setRenaming({ id: binding.attributeId, name: binding.alias })}
            >
              {tr('重新命名欄位')}
            </Menu.Item>
            <Menu.Item
              color="red"
              leftSection={<Icon name="close" size={14} />}
              disabled={busy || dirty || !added}
              onClick={async () => {
                const result = await act({
                  action: 'deleteFieldPreview',
                  projectId: project.projectId,
                  attributeId: binding.attributeId,
                })
                if (result?.fieldDeletionPreview) setFieldDeletion(result.fieldDeletionPreview)
              }}
            >
              {tr('刪除欄位及資料')}
            </Menu.Item>
            {added && dirty && (
              <Menu.Label className="palette-menu-note">
                {tr('先保存版面後才能刪除欄位')}
              </Menu.Label>
            )}
          </Menu.Dropdown>
        </Menu>
      </div>
    )
  }
  const componentRow = (kind: CellKind) => (
    <div
      key={kind}
      className="palette-item palette-row"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', kind)
        e.dataTransfer.effectAllowed = 'copy'
        dragImage(e)
      }}
    >
      <UnstyledButton
        className="palette-row-main"
        aria-label={labels[kind]}
        title={hints[kind]}
        onClick={() => add(kind)}
      >
        <span className="palette-row-icon" aria-hidden>
          <Icon name={kindIcons[kind] ?? 'grid'} size={14} />
        </span>
        <span className="palette-row-text">
          <span className="palette-field-name">{labels[kind]}</span>
          <span className="palette-row-meta">{hints[kind]}</span>
        </span>
      </UnstyledButton>
    </div>
  )
  const components = (kinds: CellKind[]) =>
    kinds.filter((kind) => `${labels[kind]} ${hints[kind]}`.toLocaleLowerCase().includes(query))
  const componentSection = (id: string, title: string, kinds: CellKind[]) => {
    const shown = components(kinds)
    return (
      (!query || shown.length > 0) && (
        <Section id={id} title={title} open={!closed.includes(id)} toggle={toggle}>
          <div className="basic-palette">{shown.map(componentRow)}</div>
        </Section>
      )
    )
  }
  return (
    <aside className="editor-palette" aria-label={tr('素材')}>
      <div className="palette-search">
        <TextInput
          size="xs"
          aria-label={tr('搜尋組件與欄位')}
          placeholder={tr('搜尋組件、欄位或來源')}
          leftSection={<Icon name="search" size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <Tooltip label={tr('只看預覽資料夾有值的欄位')} openDelay={300}>
          <Checkbox
            size="xs"
            label={tr('只看有值')}
            disabled={!preview}
            checked={onlyFilled}
            onChange={(e) => setOnlyFilled(e.currentTarget.checked)}
          />
        </Tooltip>
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
      </div>
      {componentSection('info', tr('資料夾資訊'), [
        'name',
        'path',
        'system-info',
        'image',
        'open-folder',
      ])}
      <Section
        id="fields"
        title={tr('你的欄位')}
        className="project-field-palette"
        open={!closed.includes('fields')}
        toggle={toggle}
        action={
          <Tooltip label={tr('新增欄位')}>
            <ActionIcon
              variant="subtle"
              size="sm"
              aria-label={tr('新增欄位')}
              onClick={() => startNewField()}
            >
              <Icon name="plus" size={14} />
            </ActionIcon>
          </Tooltip>
        }
      >
        {!allFields.length && (
          <>
            <Text size="xs" c="dimmed" mb={6}>
              {tr('還沒有欄位。按「＋」建立，再拖到畫布。')}
            </Text>
            <Button
              size="compact-xs"
              variant="light"
              mb={6}
              onClick={() => change(addCommonFields(draft, commonFieldNames()))}
            >
              {tr('加入常用欄位')}
            </Button>
          </>
        )}
        {/* Field combinations (R-226) will be the first group here, above the source groups. */}
        {fieldSourceGroups(shownFields, attributes).map(({ source, fields }) => (
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
            <div className="palette-rows">{fields.map(fieldRow)}</div>
          </details>
        ))}
        {allFields.length > 0 && !shownFields.length && !query && (
          <Text size="xs" c="dimmed">
            {tr('沒有符合的欄位')}
          </Text>
        )}
        {query && !shownFields.length && (
          <Button
            size="compact-sm"
            variant="light"
            fullWidth
            className="palette-create"
            onClick={() => startNewField(search.trim())}
          >
            {tr('＋ 建立欄位「{0}」', search.trim())}
          </Button>
        )}
      </Section>
      {componentSection('layout', tr('排版'), ['static-text', 'spacer', 'divider'])}
      {hasGames && componentSection('game', tr('遊戲'), ['game-cover', 'game-launch'])}
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
            setSearch('')
            setError('')
          }}
        >
          <TextInput
            data-autofocus
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
