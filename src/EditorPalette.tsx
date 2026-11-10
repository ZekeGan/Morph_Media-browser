import { useEffect, useState, type ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import { OptionTagsInput } from './OptionTagsInput'
import { t as tr } from './i18n'
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Menu,
  Modal,
  Text,
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
import { fieldSource, orderedFieldSourceGroups, useSourceFolding } from './fieldSources'
import { FieldManager } from './FieldManager'
import { fieldPurposes, purposeGlyph, purposeLabel } from './fieldTypes'
import { groupValue } from '../shared/cells'
import { groupOfField, groupType } from '../shared/fieldGroups'
import {
  dropHandlers,
  fieldDrag,
  refusalText,
  FieldValuePreview,
  GroupRow,
  GroupView,
  useGroupActions,
  type DropState,
} from './FieldGroupPalette'

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

// The left-hand materials panel: find something and put it on the card. Four sections share one heading style
// (folder info, your fields, layout, game); every row looks the same and is added by a click or a drag.
export type EditorPaletteProps = {
  project: Project
  draft: Project
  busy: boolean
  dirty: boolean
  hints: Record<CellKind, string>
  labels: Record<CellKind, string>
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
  add: (
    kind: CellKind,
    grid?: Cell['grid'],
    layout?: Layout,
    source?: Binding,
    groupId?: string
  ) => void
  change: (next: Project) => void
  // Adds a field from folder records to the project's fields (unique name), as dropping it on the card does.
  bindSource: (bindings: Project['fieldBindings'], source: Binding) => Project['fieldBindings']
  // The project's folders, for which member each folder's group shows.
  rows: FolderRow[]
  // A group to open, asked for from the Content tab.
  groupRequest?: { id: string; at: number }
  // A field whose details to open in Manage fields, asked for from the Content tab.
  fieldRequest?: { id: string; at: number }
  setError: (message: string) => void
  setFieldDeletion: (preview: FieldDeletionPreview) => void
  setRenaming: (value: { id: string; name: string }) => void
  // The values a field holds in the project's folders (use counts and options taken from the data).
  values: (attributeId: string) => unknown[]
  // Purpose changes are offered only in the card layout editor.
  cardEditor: boolean
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
    values,
    cardEditor,
    bindSource,
    rows,
    groupRequest,
    fieldRequest,
  } = props
  const [newField, setNewField] = useState('')
  const [newType, setNewType] = useState('string')
  // Options are typed as tags, like in Manage fields: a comma (also full-width) or Enter makes one (R-229). Up to
  // 100 distinct options of up to 100 characters; anything else could not be saved with the layout.
  const [typedOptions, setTypedOptions] = useState<string[]>([])
  const [optionsProblem, setOptionsProblem] = useState('')
  const [managing, setManaging] = useState<{ focus?: string }>()
  // An opened group replaces the field list (like opening a folder); `fresh` focuses its name to rename it.
  const [openGroup, setOpenGroup] = useState<{ id: string; fresh?: boolean }>()
  // Fields picked with Ctrl+click (or the row menu) to form a group together.
  const [picked, setPicked] = useState<string[]>([])
  const [dropOver, setDropOver] = useState<{ id: string; state: DropState }>()
  useEffect(() => {
    if (!groupRequest) return
    setOpenGroup({ id: groupRequest.id })
    setClosed((now) => now.filter((id) => id !== 'fields'))
    setSearch('')
    requestAnimationFrame(() =>
      document.querySelector('.palette-group-view')?.scrollIntoView({ block: 'nearest' })
    )
  }, [groupRequest])
  useEffect(() => {
    if (fieldRequest) setManaging({ focus: fieldRequest.id })
  }, [fieldRequest])
  const groupActions = useGroupActions({
    draft,
    change,
    bindSource,
    setError,
    onCreated: (groupId) => {
      if (!groupId) return
      setPicked([])
      setOpenGroup({ id: groupId, fresh: true })
    },
  })
  const requestDelete = async (binding: Binding) => {
    const result = await act({
      action: 'deleteFieldPreview',
      projectId: project.projectId,
      attributeId: binding.attributeId,
    })
    if (result?.fieldDeletionPreview) setFieldDeletion(result.fieldDeletionPreview)
  }
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState(''),
    [onlyFilled, setOnlyFilled] = useState(false)
  const [closed, setClosed] = useState<string[]>([])
  const toggle = (id: string) =>
    setClosed((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]))
  const query = search.trim().toLocaleLowerCase()
  const folding = useSourceFolding(!!query || onlyFilled)
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
  const fieldOf = (attributeId: string) => allFields.find((f) => f.attributeId === attributeId)
  // A field in a group is listed inside the group, not under its source.
  const ungrouped = allFields.filter((f) => !groupOfField(draft, f.attributeId))
  const shownFields = ungrouped.filter((f) => matches(f))
  const hiddenCount = ungrouped.filter((f) => matches(f, false) && !matches(f)).length
  const groups = (draft.fieldGroups ?? []).filter((group) => {
    const members = group.memberIds.flatMap((id) => fieldOf(id) ?? [])
    return (
      (group.name.toLocaleLowerCase().includes(query) || members.some((m) => matches(m, false))) &&
      (!onlyFilled || !preview || isFilled(groupValue(draft, group, preview).value))
    )
  })
  const opened = draft.fieldGroups?.find((group) => group.groupId === openGroup?.id)
  const togglePick = (attributeId: string) =>
    setPicked((now) =>
      now.includes(attributeId) ? now.filter((id) => id !== attributeId) : [...now, attributeId]
    )
  const groupKind = (groupId: string) => {
    const group = draft.fieldGroups?.find((g) => g.groupId === groupId)
    return group ? typeKinds[groupType(draft, group) ?? ''] : undefined
  }
  const startNewField = (name = '') => {
    setNewField(name)
    setAdding(true)
  }
  const fieldRow = (binding: Binding) => {
    const source = sources.find((f) => f.attributeId === binding.attributeId),
      kind = typeKinds[binding.type],
      added = bound(binding.attributeId)
    if (!kind) return null
    const isPicked = picked.includes(binding.attributeId),
      over = dropOver?.id === binding.attributeId ? dropOver.state : undefined
    const name = binding.alias || tr('未命名欄位')
    const origin = fieldSource(binding.attributeId, attributes)
    const scope = source?.shared === false && source.private ? tr('專案私有') : tr('共用')
    return (
      <div
        key={binding.attributeId}
        className={
          'palette-item palette-row palette-field' +
          (added ? '' : ' is-unbound') +
          (isPicked ? ' is-picked' : '') +
          (over ? ' is-drop-' + over : '')
        }
        data-attribute-id={binding.attributeId}
        draggable={!source?.conflict}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', kind)
          e.dataTransfer.setData('application/x-media-viewer-field', binding.attributeId)
          e.dataTransfer.effectAllowed = 'copyMove'
          fieldDrag.start({ attributeId: binding.attributeId })
          dragImage(e)
        }}
        onDragEnd={() => fieldDrag.end()}
        {...(source?.conflict
          ? {}
          : dropHandlers(groupActions, { attributeId: binding.attributeId }, fieldOf, (state) =>
              setDropOver(state ? { id: binding.attributeId, state } : undefined)
            ))}
      >
        <UnstyledButton
          className="palette-row-main"
          disabled={source?.conflict}
          title={
            source?.conflict
              ? tr('同一欄位的型別不一致，請先處理資料衝突')
              : `${name} · ${purposeLabel(binding.type)} · ${origin} · ${scope}`
          }
          aria-pressed={picked.length ? isPicked : undefined}
          onClick={(event) => {
            if (event.ctrlKey || event.metaKey || picked.length) togglePick(binding.attributeId)
            else add(kind, undefined, undefined, binding)
          }}
        >
          <span className="palette-row-icon is-glyph" aria-hidden>
            {purposeGlyph(binding.type)}
          </span>
          <span className="palette-row-text">
            <span className="palette-field-name">{name}</span>
            {preview ? (
              <FieldValuePreview value={fieldValue(preview, binding.attributeId)} />
            ) : (
              <span className="palette-row-meta">{purposeLabel(binding.type)}</span>
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
          {!added && <span className="palette-row-state is-unbound">{tr('尚未加入')}</span>}
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
            <Menu.Item
              leftSection={<Icon name="settings" size={14} />}
              onClick={() => setManaging({ focus: binding.attributeId })}
            >
              {tr('欄位設定…')}
            </Menu.Item>
            {!added && (
              <Menu.Item disabled={source?.conflict} onClick={() => reference(binding)}>
                {tr('只引用欄位')}
              </Menu.Item>
            )}
            <Menu.Sub>
              <Menu.Sub.Target>
                <Menu.Sub.Item
                  leftSection={<Icon name="layers" size={14} />}
                  disabled={source?.conflict}
                >
                  {tr('加入群組')}
                </Menu.Sub.Item>
              </Menu.Sub.Target>
              <Menu.Sub.Dropdown>
                {(draft.fieldGroups ?? []).map((group) => {
                  const refusal = groupActions.refusal({ groupId: group.groupId }, binding)
                  return (
                    <Menu.Item
                      key={group.groupId}
                      disabled={!!refusal}
                      title={refusal ? refusalText(refusal) : undefined}
                      onClick={() => groupActions.join(group.groupId, binding)}
                    >
                      {group.name}
                    </Menu.Item>
                  )
                })}
                {!!draft.fieldGroups?.length && <Menu.Divider />}
                <Menu.Item onClick={() => groupActions.onCreated?.(groupActions.create([binding]))}>
                  {tr('新群組')}
                </Menu.Item>
              </Menu.Sub.Dropdown>
            </Menu.Sub>
            <Menu.Item onClick={() => togglePick(binding.attributeId)} disabled={source?.conflict}>
              {isPicked ? tr('取消選取') : tr('選取（組成群組用）')}
            </Menu.Item>
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
              onClick={() => void requestDelete(binding)}
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
      <Tooltip label={hints[kind]} position="right" openDelay={400} withArrow multiline maw={260}>
        <UnstyledButton
          className="palette-row-main"
          aria-label={labels[kind]}
          aria-description={hints[kind]}
          onClick={() => add(kind)}
        >
          <span className="palette-row-icon" aria-hidden>
            <Icon name={kindIcons[kind] ?? 'grid'} size={14} />
          </span>
          <span className="palette-row-text">
            <span className="palette-field-name">{labels[kind]}</span>
          </span>
        </UnstyledButton>
      </Tooltip>
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
          <>
            {/* The value filter only applies to fields, so it sits on this section's heading. */}
            <Tooltip label={tr('只看預覽資料夾有值的欄位')} openDelay={300}>
              <Button
                size="compact-xs"
                variant={onlyFilled ? 'light' : 'subtle'}
                color={onlyFilled ? undefined : 'gray'}
                className="palette-value-filter"
                aria-pressed={onlyFilled}
                disabled={!preview}
                leftSection={<Icon name={onlyFilled ? 'check' : 'eye'} size={12} />}
                onClick={() => setOnlyFilled(!onlyFilled)}
              >
                {tr('只看有值')}
              </Button>
            </Tooltip>
            <Tooltip label={tr('管理欄位')}>
              <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                aria-label={tr('管理欄位')}
                onClick={() => setManaging({})}
              >
                <Icon name="settings" size={14} />
              </ActionIcon>
            </Tooltip>
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
          </>
        }
      >
        {hiddenCount > 0 && (
          <Group gap={4} mb={4} className="palette-hidden-note">
            <Text size="xs" c="dimmed">
              {tr('已隱藏 {0} 個未填欄位', hiddenCount)}
            </Text>
            <Button size="compact-xs" variant="subtle" onClick={() => setOnlyFilled(false)}>
              {tr('顯示全部')}
            </Button>
          </Group>
        )}
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
        {opened ? (
          <GroupView
            key={opened.groupId}
            group={opened}
            project={draft}
            preview={preview}
            attributes={attributes}
            actions={groupActions}
            back={() => setOpenGroup(undefined)}
            focusName={openGroup?.fresh}
            dragImage={dragImage}
            memberKind={(binding) => typeKinds[binding.type]}
            addToCard={() => {
              const kind = groupKind(opened.groupId)
              if (kind) add(kind, undefined, undefined, undefined, opened.groupId)
            }}
          />
        ) : (
          <>
            {picked.length > 0 && (
              <div className="palette-pick-bar" role="status">
                <Text size="xs">{tr('已選 {0} 個欄位', picked.length)}</Text>
                <Button
                  size="compact-xs"
                  variant="light"
                  onClick={() =>
                    groupActions.onCreated?.(
                      groupActions.create(picked.flatMap((id) => fieldOf(id) ?? []))
                    )
                  }
                >
                  {tr('組成群組')}
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="gray"
                  onClick={() => setPicked([])}
                >
                  {tr('取消')}
                </Button>
              </div>
            )}
            {groups.length > 0 && (
              <div className="palette-rows palette-groups">
                {groups.map((group) => (
                  <GroupRow
                    key={group.groupId}
                    group={group}
                    project={draft}
                    preview={preview}
                    actions={groupActions}
                    fieldOf={fieldOf}
                    kind={groupKind(group.groupId)}
                    dragImage={dragImage}
                    open={() => setOpenGroup({ id: group.groupId })}
                    rename={() => setOpenGroup({ id: group.groupId, fresh: true })}
                    manage={() => setManaging({ focus: 'group:' + group.groupId })}
                  />
                ))}
              </div>
            )}
            {orderedFieldSourceGroups(shownFields, attributes).map(({ source, fields }) => {
              const addedFields = fields.filter((f) => bound(f.attributeId)),
                unadded = fields.filter((f) => !bound(f.attributeId))
              return (
                <details
                  key={source}
                  className="field-source-group"
                  open={folding.isOpen(source, addedFields.length > 0)}
                >
                  <summary
                    onClick={(event) => {
                      event.preventDefault()
                      folding.toggle(source, addedFields.length > 0)
                    }}
                  >
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
                  <div className="palette-rows">
                    {addedFields.map(fieldRow)}
                    {unadded.length > 0 && !folding.showsUnadded(source) ? (
                      <Button
                        size="compact-xs"
                        variant="subtle"
                        color="gray"
                        className="palette-unadded"
                        onClick={() => folding.showUnadded(source)}
                      >
                        {tr('＋ {0} 個尚未加入', unadded.length)}
                      </Button>
                    ) : (
                      unadded.map(fieldRow)
                    )}
                  </div>
                </details>
              )
            })}
            {allFields.length > 0 && !shownFields.length && !query && !hiddenCount && (
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
          </>
        )}
      </Section>
      {componentSection('layout', tr('排版'), ['static-text', 'spacer', 'divider'])}
      {hasGames && componentSection('game', tr('遊戲'), ['game-cover', 'game-launch'])}
      <Modal
        opened={adding}
        onClose={() => setAdding(false)}
        title={tr('新增欄位')}
        size="sm"
        zIndex={400}
      >
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
              ) ||
              draft.fieldGroups?.some(
                (g) => g.name.trim().toLocaleLowerCase() === alias.toLocaleLowerCase()
              )
            ) {
              setError(tr('請輸入未使用的欄位名稱'))
              return
            }
            const attributeId = crypto.randomUUID()
            change({
              ...draft,
              fieldBindings: [
                ...draft.fieldBindings,
                {
                  alias,
                  attributeId,
                  type: newType,
                  ...(newType === 'enum'
                    ? {
                        options: typedOptions,
                      }
                    : {}),
                },
              ],
            })
            setNewField('')
            setTypedOptions([])
            setOptionsProblem('')
            setNewType('string')
            setAdding(false)
            setManaging((now) => now && { focus: attributeId })
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
          <div className="purpose-cards" role="radiogroup" aria-label={tr('這個欄位要記什麼？')}>
            <Text size="sm" fw={500} className="purpose-cards-title">
              {tr('這個欄位要記什麼？')}
            </Text>
            {fieldPurposes().map((purpose) => (
              <label key={purpose.type} className="purpose-card">
                <input
                  type="radio"
                  name="field-purpose"
                  value={purpose.type}
                  checked={newType === purpose.type}
                  onChange={() => setNewType(purpose.type)}
                />
                <span className="palette-row-icon is-glyph" aria-hidden>
                  {purpose.glyph}
                </span>
                <span className="purpose-card-text">
                  <strong>{purpose.label}</strong>
                  <small>{purpose.example}</small>
                </span>
              </label>
            ))}
          </div>
          {newType === 'enum' && (
            <OptionTagsInput
              label={tr('選項')}
              placeholder={tr('輸入選項後按 Enter 或逗號')}
              value={typedOptions}
              splitChars={[',', '，']}
              maxTags={100}
              error={optionsProblem || undefined}
              onChange={(options) => {
                const clean = [...new Set(options.map((option) => option.trim()).filter(Boolean))]
                if (clean.some((option) => option.length > 100)) {
                  setOptionsProblem(tr('每個選項最多 100 個字'))
                  return
                }
                setOptionsProblem('')
                setTypedOptions(clean)
              }}
            />
          )}
          <Button
            type="submit"
            fullWidth
            variant="default"
            disabled={
              !newField.trim() || (newType === 'enum' && (!typedOptions.length || !!optionsProblem))
            }
          >
            {tr('新增欄位')}
          </Button>
        </form>
      </Modal>
      {managing && (
        <FieldManager
          focusId={managing.focus}
          onClose={() => setManaging(undefined)}
          draft={draft}
          busy={busy}
          dirty={dirty}
          sources={sources}
          availableFields={availableFields}
          attributes={attributes}
          cardEditor={cardEditor}
          values={values}
          change={change}
          onNewField={() => startNewField()}
          reference={reference}
          requestDelete={(binding) => void requestDelete(binding)}
          setRenaming={setRenaming}
          rows={rows}
          bindSource={bindSource}
          setError={setError}
        />
      )}
    </aside>
  )
}
