import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  Modal,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from '@mantine/core'
import { Icon } from '../common/icons'
import { OptionTagsInput } from './OptionTagsInput'
import { HelpTip } from '../common/HelpTip'
import { t as tr } from '../i18n'
import type { Attribute, FieldGroup, FolderRow, Project } from '../../shared/model'
import type { editorFields } from '../../shared/layouts'
import { copyableValue, groupValue, isFilled } from '../../shared/cells'
import { groupOfField } from '../../shared/fieldGroups'
import {
  dropHandlers,
  fieldDrag,
  UseCount,
  useGroupActions,
  type DropState,
} from './FieldGroupPalette'
import { fieldSource, orderedFieldSourceGroups, useSourceFolding } from './fieldSources'
import { EnumColors } from '../cells/EnumColors'
import {
  groupUseList,
  isTextType,
  purposeChangeImpact,
  purposeGlyph,
  purposeLabel,
  shownUses,
  dateConditionCount,
  switchDateToText,
  switchDateType,
  switchTextToDate,
  switchTextType,
  textTypes,
  type DateType,
  type TextType,
} from './fieldTypes'

type Binding = Project['fieldBindings'][number]
type Source = ReturnType<typeof editorFields>[number]

const tooLong = (options: string[]) => options.some((option) => option.length > 100)

// One field's details: what it is, its real data, where it is used, and what can be done with it. Keyed by field, so
// a half-finished purpose change never carries over to another field.
function FieldDetail({
  binding,
  added,
  source,
  attributes,
  draft,
  busy,
  dirty,
  cardEditor,
  values,
  change,
  reference,
  requestDelete,
  setRenaming,
  showSource,
}: {
  binding: Binding
  added: boolean
  source?: Source
  attributes: Attribute[]
  draft: Project
  busy: boolean
  dirty: boolean
  cardEditor: boolean
  values: unknown[]
  change: (next: Project) => void
  reference: (binding: Binding) => void
  requestDelete: (binding: Binding) => void
  setRenaming: (value: { id: string; name: string }) => void
  showSource: (source: string) => void
}) {
  const id = binding.attributeId,
    name = binding.alias || tr('未命名欄位'),
    origin = fieldSource(id, attributes)
  const [wording, setWording] = useState<{ trueLabel?: string; falseLabel?: string }>({}),
    [wordingError, setWordingError] = useState('')
  const [target, setTarget] = useState<TextType>(),
    // Between date and text (R-240): 'string' for a date field, a date type for a text field.
    [dateTarget, setDateTarget] = useState<'string' | DateType>(),
    [typed, setTyped] = useState<string[]>([]),
    [typedProblem, setTypedProblem] = useState(''),
    [optionProblem, setOptionProblem] = useState('')
  const reasons: Record<string, string> = {
    fallback: tr('這個欄位用在備用來源，請先移除備用來源。'),
    group: tr('這個欄位在群組裡，請先移出群組。'),
    condition: tr('這個欄位用在「等於／不等於」顯示條件，請先改條件。'),
    'condition-option': tr('這個欄位用在「等於／不等於」顯示條件，比較值不在選項內，請先改條件。'),
    'too-many': tr('這個欄位有超過 100 種不同的值，不適合做成單選。'),
  }
  // A dry run: the change is applied only after the impact has been read and confirmed.
  const planned = target
    ? switchTextType(
        typed.length
          ? {
              ...draft,
              fieldBindings: draft.fieldBindings.map((field) =>
                field.attributeId === id ? { ...field, options: typed } : field
              ),
            }
          : draft,
        id,
        target,
        values
      )
    : undefined
  const plannedOptions =
    planned && 'project' in planned
      ? planned.project.fieldBindings.find((field) => field.attributeId === id)?.options
      : undefined
  const impact = target ? purposeChangeImpact(draft, id, target) : 0
  const datePlan = !dateTarget
      ? undefined
      : dateTarget === 'string'
        ? switchDateToText(draft, id)
        : switchTextToDate(draft, id, dateTarget, values),
    removedConditions = dateTarget === 'string' ? dateConditionCount(draft, id) : 0,
    shownCount = shownUses(draft, id, true).length
  const usage = (option: string) =>
    values.filter((value) => value === option || (Array.isArray(value) && value.includes(option)))
      .length
  const setOptions = (options: string[]) => {
    if (tooLong(options)) return setOptionProblem(tr('每個選項最多 100 個字'))
    const used = (binding.options ?? []).filter(
      (option) => !options.includes(option) && usage(option) > 0
    )
    if (used.length)
      return setOptionProblem(
        tr(
          '「{0}」仍有 {1} 個資料夾使用，請先把這些資料夾改成其他值再移除。',
          used[0],
          usage(used[0])
        )
      )
    if (!options.length) return setOptionProblem(tr('至少需要一個選項'))
    setOptionProblem('')
    change({
      ...draft,
      fieldBindings: draft.fieldBindings.map((field) =>
        field.attributeId === id
          ? {
              ...field,
              options,
              ...(field.optionColors
                ? {
                    optionColors: Object.fromEntries(
                      Object.entries(field.optionColors).filter(([option]) =>
                        options.includes(option)
                      )
                    ),
                  }
                : {}),
            }
          : field
      ),
    })
  }
  const filled = values.filter(isFilled)
  const examples = [...new Set(filled.map((value) => copyableValue(value) ?? ''))]
    .filter(Boolean)
    .slice(0, 3)
    .map((text) => (text.length > 40 ? text.slice(0, 40) + '…' : text))
  return (
    <div className="field-detail">
      <div className="field-detail-head">
        <h3>{name}</h3>
        {added && (
          <Tooltip label={tr('重新命名欄位')}>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={tr('重新命名欄位') + ' ' + name}
              disabled={busy}
              onClick={() => setRenaming({ id, name: binding.alias })}
            >
              <Icon name="edit" size={14} />
            </ActionIcon>
          </Tooltip>
        )}
      </div>
      <dl className="field-detail-facts">
        <dt>{tr('用途')}</dt>
        <dd className="field-detail-purpose">
          <span>{purposeLabel(binding.type)}</span>
          {added && ['date', 'datetime'].includes(binding.type) && cardEditor && (
            <Button
              size="compact-xs"
              variant="default"
              onClick={() => {
                const next = binding.type === 'date' ? 'datetime' : 'date'
                const timed = values.filter(
                  (value) => typeof value === 'string' && value.length > 10
                ).length
                if (
                  next === 'date' &&
                  timed &&
                  !window.confirm(
                    tr(
                      '有 {0} 個資料夾的值含時間；改成只有日期後只顯示日期，已存的值不會改寫。',
                      timed
                    )
                  )
                )
                  return
                const result = switchDateType(draft, id, next)
                if ('project' in result) change(result.project)
                else window.alert(reasons[result.error])
              }}
            >
              {binding.type === 'date' ? tr('改成包含時間') : tr('改成只有日期')}
            </Button>
          )}
          {added && ['date', 'datetime'].includes(binding.type) && cardEditor && (
            <Button
              size="compact-xs"
              variant="default"
              onClick={() => {
                setTarget(undefined)
                setDateTarget('string')
              }}
            >
              {tr('改成文字')}
            </Button>
          )}
          {added && isTextType(binding.type) && cardEditor && (
            <Menu position="bottom-start">
              <Menu.Target>
                <Button size="compact-xs" variant="default">
                  {tr('改成…')}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {textTypes
                  .filter((type) => type !== binding.type)
                  .map((type) => (
                    <Menu.Item
                      key={type}
                      onClick={() => {
                        setTyped([])
                        setDateTarget(undefined)
                        setTarget(type)
                      }}
                    >
                      {purposeLabel(type)}
                    </Menu.Item>
                  ))}
                {binding.type === 'string' &&
                  (['date', 'datetime'] as const).map((type) => (
                    <Menu.Item
                      key={type}
                      onClick={() => {
                        setTarget(undefined)
                        setDateTarget(type)
                      }}
                    >
                      {purposeLabel(type)}
                    </Menu.Item>
                  ))}
              </Menu.Dropdown>
            </Menu>
          )}
        </dd>
        <dt>{tr('來源')}</dt>
        <dd>
          <Tooltip label={tr('只看這個來源')} openDelay={300}>
            <Button size="compact-xs" variant="subtle" onClick={() => showSource(origin)}>
              {origin}
            </Button>
          </Tooltip>
          {source?.shared === false && source.private && ' · ' + tr('專案私有')}
          {source?.shared && source.private && ' · ' + tr('有專案覆寫')}
        </dd>
        <dt>{tr('資料')}</dt>
        <dd>
          {filled.length
            ? tr('{0} 個資料夾有值，例如：{1}', filled.length, examples.join('、'))
            : tr('目前沒有資料夾有值')}
        </dd>
      </dl>
      {added &&
        (isTextType(binding.type) || ['date', 'datetime'].includes(binding.type)) &&
        !cardEditor && (
          <Text size="xs" c="dimmed">
            {tr('改用途請到卡片版面編輯器。')}
          </Text>
        )}
      {dateTarget && datePlan && (
        <div className="field-detail-change">
          <Text size="sm" fw={600}>
            {tr('改成「{0}」', purposeLabel(dateTarget))}
          </Text>
          {'error' in datePlan ? (
            <Text size="xs" c="orange" role="alert">
              {datePlan.error === 'unreadable'
                ? tr(
                    '有 {0} 個值讀不成日期，不能改：{1}',
                    datePlan.values.length,
                    datePlan.values.slice(0, 10).join('、') +
                      (datePlan.values.length > 10 ? '…' : '')
                  )
                : reasons[datePlan.error]}
            </Text>
          ) : (
            <ul>
              <li>
                {shownCount
                  ? tr('卡片上 {0} 個組件會換成新的呈現', shownCount)
                  : tr('卡片上的組件保留原本的呈現')}
              </li>
              {removedConditions > 0 && (
                <li>{tr('{0} 個比較日期的條件（大於、小於、距今）會移除', removedConditions)}</li>
              )}
              <li>
                {dateTarget === 'string'
                  ? tr('資料夾裡已存的值不會改寫，照原樣顯示')
                  : tr('資料夾裡已存的文字不會改寫，顯示時讀成日期')}
              </li>
            </ul>
          )}
          <Group gap="xs">
            <Button
              size="xs"
              disabled={'error' in datePlan}
              onClick={() => {
                if ('project' in datePlan) change(datePlan.project)
                setDateTarget(undefined)
              }}
            >
              {tr('確認改用途')}
            </Button>
            <Button size="xs" variant="default" onClick={() => setDateTarget(undefined)}>
              {tr('取消')}
            </Button>
          </Group>
        </div>
      )}
      {target && planned && (
        <div className="field-detail-change">
          <Text size="sm" fw={600}>
            {tr('改成「{0}」', purposeLabel(target))}
          </Text>
          {'error' in planned && planned.error !== 'options' ? (
            <Text size="xs" c="orange" role="alert">
              {reasons[planned.error]}
            </Text>
          ) : (
            <ul>
              <li>
                {impact
                  ? tr('卡片上 {0} 個組件會換成新的呈現', impact)
                  : tr('卡片上的組件保留原本的呈現')}
              </li>
              <li>{tr('資料夾裡已存的值不會改寫，顯示時自動轉換')}</li>
              {binding.optionColors && target !== 'enum' && <li>{tr('選項顏色會被移除')}</li>}
              {plannedOptions && target === 'enum' && (
                <li>{tr('選項：{0}', plannedOptions.join('、'))}</li>
              )}
            </ul>
          )}
          {target === 'enum' &&
            (typed.length > 0 || ('error' in planned && planned.error === 'options')) && (
              <OptionTagsInput
                size="xs"
                label={tr('還沒有可用的值，請先輸入選項')}
                placeholder={tr('輸入選項後按 Enter')}
                value={typed}
                splitChars={[',', '，']}
                error={typedProblem || undefined}
                onChange={(options) => {
                  setTypedProblem(tooLong(options) ? tr('每個選項最多 100 個字') : '')
                  if (!tooLong(options)) setTyped(options)
                }}
              />
            )}
          <Group gap="xs">
            <Button
              size="xs"
              disabled={'error' in planned}
              onClick={() => {
                if ('project' in planned) change(planned.project)
                setTarget(undefined)
              }}
            >
              {tr('確認改用途')}
            </Button>
            <Button size="xs" variant="default" onClick={() => setTarget(undefined)}>
              {tr('取消')}
            </Button>
          </Group>
        </div>
      )}
      {!added && (
        <div className="field-detail-part">
          <Text size="sm">{tr('這個欄位還沒加入本專案。')}</Text>
          <Button
            size="xs"
            variant="default"
            disabled={source?.conflict}
            onClick={() => reference(binding)}
          >
            {tr('只引用欄位')}
          </Button>
          {source?.conflict && (
            <Text size="xs" c="orange">
              {tr('同一欄位的型別不一致，請先處理資料衝突')}
            </Text>
          )}
        </div>
      )}
      {added && binding.type === 'boolean' && (
        <div className="field-detail-part">
          <Text size="sm" fw={600}>
            {tr('顯示文字')}
          </Text>
          <Group gap="xs" grow>
            {(['trueLabel', 'falseLabel'] as const).map((key) => (
              <TextInput
                key={key}
                size="xs"
                label={key === 'trueLabel' ? tr('「是」顯示為') : tr('「否」顯示為')}
                placeholder={key === 'trueLabel' ? tr('是') : tr('否')}
                maxLength={20}
                value={wording[key] ?? binding[key] ?? ''}
                error={wordingError && key === 'falseLabel' ? wordingError : undefined}
                onChange={(event) => {
                  const text = event.currentTarget.value
                  const other = binding[key === 'trueLabel' ? 'falseLabel' : 'trueLabel']
                  setWording((now) => ({ ...now, [key]: text }))
                  // The same words for yes and no could not be told apart; they are kept here until they differ.
                  if (
                    text.trim() &&
                    other?.trim().toLocaleLowerCase() === text.trim().toLocaleLowerCase()
                  ) {
                    setWordingError(tr('「是」和「否」的文字不能相同'))
                    return
                  }
                  setWordingError('')
                  change({
                    ...draft,
                    fieldBindings: draft.fieldBindings.map((field) => {
                      if (field.attributeId !== id) return field
                      const { [key]: _old, ...rest } = field
                      return text.trim() ? { ...rest, [key]: text } : rest
                    }),
                  })
                }}
              />
            ))}
          </Group>
          <Text size="xs" c="dimmed">
            {tr('卡片、表格、資料夾設定與搜尋都用這組文字；留空用「是／否」。')}
          </Text>
        </div>
      )}
      {added && binding.type === 'enum' && (
        <div className="field-detail-part">
          <OptionTagsInput
            size="xs"
            label={tr('選項')}
            value={binding.options ?? []}
            splitChars={[',', '，']}
            error={optionProblem || undefined}
            onChange={setOptions}
          />
          <EnumColors
            binding={binding}
            options={binding.options ?? []}
            onChange={(optionColors) =>
              change({
                ...draft,
                fieldBindings: draft.fieldBindings.map((field) => {
                  if (field.attributeId !== id) return field
                  const { optionColors: _old, ...rest } = field
                  return optionColors ? { ...rest, optionColors } : rest
                }),
              })
            }
          />
        </div>
      )}
      {added && (
        <div className="field-detail-danger">
          <Button
            size="xs"
            variant="subtle"
            color="red"
            disabled={busy || dirty}
            onClick={() => requestDelete(binding)}
          >
            {tr('刪除欄位及資料')}
          </Button>
          {dirty && (
            <Text size="xs" c="dimmed">
              {tr('先保存版面後才能刪除欄位')}
            </Text>
          )}
        </div>
      )}
    </div>
  )
}

// One group's details (R-226): its name, members in order, which member each folder shows, and dissolving it. Members open their own details.
function GroupDetail({
  group,
  draft,
  rows,
  attributes,
  cardEditor,
  actions,
  openField,
}: {
  group: FieldGroup
  draft: Project
  rows: FolderRow[]
  attributes: Attribute[]
  cardEditor: boolean
  actions: ReturnType<typeof useGroupActions>
  openField: (attributeId: string) => void
}) {
  const [name, setName] = useState(group.name)
  useEffect(() => setName(group.name), [group.name])
  const alias = (id: string) =>
    draft.fieldBindings.find((field) => field.attributeId === id)?.alias ?? id
  const shown = rows.map((row) => groupValue(draft, group, row))
  const count = (id?: string) => shown.filter((value) => value.attributeId === id).length
  const chosen = Object.values(draft.groupSources ?? {}).filter(
    (choice) => choice[group.groupId]
  ).length
  const move = (from: number, to: number) => {
    const ids = [...group.memberIds]
    ids.splice(to, 0, ids.splice(from, 1)[0])
    actions.reorder(group.groupId, ids)
  }
  const commit = () => {
    if (name.trim() !== group.name && !actions.rename(group.groupId, name)) setName(group.name)
  }
  return (
    <div className="field-detail">
      <div className="field-detail-head">
        <span className="palette-row-icon is-group" aria-hidden>
          <Icon name="layers" size={14} />
        </span>
        <TextInput
          size="sm"
          flex={1}
          aria-label={tr('群組名稱')}
          value={name}
          maxLength={100}
          onChange={(event) => setName(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => event.key === 'Enter' && commit()}
        />
      </div>
      <Text size="xs" c="dimmed">
        {tr('依順序顯示第一個有值的欄位；個別資料夾可在資料夾設定指定來源。')}
      </Text>
      <div className="field-detail-part">
        <Text size="sm" fw={600}>
          {tr('成員與顯示來源')}
        </Text>
        <ol className="field-group-members">
          {group.memberIds.map((id, index) => (
            <li key={id}>
              <Button size="compact-xs" variant="subtle" onClick={() => openField(id)}>
                {alias(id)}
              </Button>
              <Text component="span" size="xs" c="dimmed">
                {fieldSource(id, attributes)} · {tr('{0} 個資料夾顯示這個', count(id))}
              </Text>
              <span className="field-group-member-tools">
                <Tooltip label={tr('上移')}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={tr('上移 {0}', alias(id))}
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                  >
                    <span aria-hidden>↑</span>
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={tr('下移')}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={tr('下移 {0}', alias(id))}
                    disabled={index === group.memberIds.length - 1}
                    onClick={() => move(index, index + 1)}
                  >
                    <span aria-hidden>↓</span>
                  </ActionIcon>
                </Tooltip>
                <Tooltip label={tr('移出群組')}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="sm"
                    aria-label={tr('移出群組 {0}', alias(id))}
                    onClick={() => actions.remove(id)}
                  >
                    <Icon name="close" size={12} />
                  </ActionIcon>
                </Tooltip>
              </span>
            </li>
          ))}
        </ol>
        <Text size="xs" c="dimmed">
          {tr('{0} 個資料夾都沒有值', count(undefined))}
          {chosen > 0 && ' · ' + tr('{0} 個資料夾指定了來源', chosen)}
        </Text>
      </div>
      <div className="field-detail-danger">
        <Button
          size="xs"
          variant="subtle"
          color="red"
          onClick={() => actions.dissolve(group.groupId)}
        >
          {tr('解散群組')}
        </Button>
        <Text size="xs" c="dimmed">
          {tr('欄位回到原本的來源分類；顯示這個群組的組件改顯示第一個欄位。')}
        </Text>
      </div>
    </div>
  )
}

// The field management window (R-225): the same source groups as the "Your fields" list on the left, with one field's
// details beside them. Everything here edits the layout draft, so it can be undone and only counts after saving.
// Field groups (R-226) come first; a field in a group is listed inside it, and the same drags make and fill groups.
export function FieldManager({
  focusId,
  onClose,
  draft,
  busy,
  dirty,
  sources,
  availableFields,
  attributes,
  cardEditor,
  values,
  change,
  onNewField,
  reference,
  requestDelete,
  setRenaming,
  rows,
  bindSource,
  setError,
}: {
  // The field (or "group:" and a group ID) to show first, also after creating one from this window.
  focusId?: string
  rows: FolderRow[]
  bindSource: (bindings: Project['fieldBindings'], source: Binding) => Project['fieldBindings']
  setError: (message: string) => void
  onClose: () => void
  draft: Project
  busy: boolean
  dirty: boolean
  sources: Source[]
  availableFields: Source[]
  attributes: Attribute[]
  // Purpose changes convert every layout's components, so they are offered only in the card layout editor (a content
  // template editor saves its own cells only).
  cardEditor: boolean
  // The values a field holds in the project's folders (data examples, option use and options from the data).
  values: (attributeId: string) => unknown[]
  change: (next: Project) => void
  onNewField: () => void
  reference: (binding: Binding) => void
  requestDelete: (binding: Binding) => void
  setRenaming: (value: { id: string; name: string }) => void
}) {
  const [search, setSearch] = useState(''),
    [selected, setSelected] = useState(focusId)
  const query = search.trim().toLocaleLowerCase()
  const folding = useSourceFolding(!!query)
  // A field asked for from outside is always visible in the list, even in a folded source or under a search.
  useEffect(() => {
    if (!focusId) return
    setSelected(focusId)
    setSearch('')
    if (!focusId.startsWith('group:')) folding.reveal(fieldSource(focusId, attributes))
  }, [focusId])
  const [dropOver, setDropOver] = useState<{ id: string; state: DropState }>()
  const actions = useGroupActions({
    draft,
    change,
    bindSource,
    setError,
    onCreated: (groupId) => groupId && setSelected('group:' + groupId),
  })
  const bound = (id: string) => draft.fieldBindings.some((field) => field.attributeId === id)
  const all: Binding[] = [
    ...draft.fieldBindings,
    ...availableFields.map((f) => ({ attributeId: f.attributeId, alias: f.key, type: f.type })),
  ]
  const fieldOf = (id: string) => all.find((binding) => binding.attributeId === id)
  const matches = (binding: Binding) =>
    `${binding.alias} ${fieldSource(binding.attributeId, attributes)} ${purposeLabel(binding.type)}`
      .toLocaleLowerCase()
      .includes(query)
  const shown = all.filter(
    (binding) => !groupOfField(draft, binding.attributeId) && matches(binding)
  )
  const groups = (draft.fieldGroups ?? []).filter(
    (group) =>
      group.name.toLocaleLowerCase().includes(query) ||
      group.memberIds.some((id) => {
        const binding = fieldOf(id)
        return !!binding && matches(binding)
      })
  )
  const current = all.find((binding) => binding.attributeId === selected)
  const currentGroup = draft.fieldGroups?.find((group) => 'group:' + group.groupId === selected)
  const currentRow = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    currentRow.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])
  const row = (binding: Binding) => {
    const id = binding.attributeId,
      added = bound(id),
      name = binding.alias || tr('未命名欄位'),
      uses = shownUses(draft, id, cardEditor)
    return (
      <UnstyledButton
        key={id}
        ref={id === selected ? currentRow : undefined}
        className={
          'field-manager-row' +
          (added ? '' : ' is-unbound') +
          (dropOver?.id === id ? ' is-drop-' + dropOver.state : '')
        }
        data-attribute-id={id}
        aria-current={id === selected ? 'true' : undefined}
        onClick={() => setSelected(id)}
        draggable
        onDragStart={(event: React.DragEvent) => {
          event.dataTransfer.setData('application/x-media-viewer-field', id)
          event.dataTransfer.effectAllowed = 'move'
          fieldDrag.start({ attributeId: id })
        }}
        onDragEnd={() => fieldDrag.end()}
        {...dropHandlers(actions, { attributeId: id }, fieldOf, (state) =>
          setDropOver(state ? { id, state } : undefined)
        )}
      >
        <span className="palette-row-icon is-glyph" aria-hidden>
          {purposeGlyph(binding.type)}
        </span>
        <span className="field-manager-name">{name}</span>
        <span className="field-manager-meta">
          {purposeLabel(binding.type)} · {added ? <UseCount uses={uses} /> : tr('尚未加入')}
        </span>
      </UnstyledButton>
    )
  }
  return (
    <Modal opened onClose={onClose} title={tr('管理欄位')} size="min(1000px, 92vw)">
      <div className="field-manager" data-view={current || currentGroup ? 'detail' : 'list'}>
        <Group gap="xs" wrap="nowrap" className="field-manager-tools">
          <HelpTip text={tr('這裡整理欄位本身：名稱、用途與選項。要放上卡片，請用左側清單。')} />
          <TextInput
            flex={1}
            size="xs"
            aria-label={tr('搜尋欄位')}
            placeholder={tr('搜尋名稱、用途或來源')}
            leftSection={<Icon name="search" size={14} />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <Button
            size="xs"
            variant="default"
            leftSection={<Icon name="plus" size={14} />}
            onClick={onNewField}
          >
            {tr('新增欄位')}
          </Button>
        </Group>
        <div className="field-manager-body">
          <div className="field-manager-list">
            {groups.length > 0 && (
              <div className="field-manager-groups">
                {groups.map((group) => {
                  const key = 'group:' + group.groupId
                  return (
                    <UnstyledButton
                      key={key}
                      ref={key === selected ? currentRow : undefined}
                      className={
                        'field-manager-row field-manager-group' +
                        (dropOver?.id === key ? ' is-drop-' + dropOver.state : '')
                      }
                      aria-current={key === selected ? 'true' : undefined}
                      onClick={() => setSelected(key)}
                      {...dropHandlers(actions, { groupId: group.groupId }, fieldOf, (state) =>
                        setDropOver(state ? { id: key, state } : undefined)
                      )}
                    >
                      <span className="palette-row-icon is-group" aria-hidden>
                        <Icon name="layers" size={14} />
                      </span>
                      <span className="field-manager-name">{group.name}</span>
                      <span className="field-manager-meta">
                        {tr('群組 · {0} 個欄位', group.memberIds.length)} ·{' '}
                        <UseCount uses={groupUseList(draft, group.groupId, cardEditor)} />
                      </span>
                    </UnstyledButton>
                  )
                })}
              </div>
            )}
            {orderedFieldSourceGroups(shown, attributes).map(({ source, fields }) => {
              const added = fields.filter((f) => bound(f.attributeId)),
                unadded = fields.filter((f) => !bound(f.attributeId))
              return (
                <details
                  key={source}
                  className="field-source-group"
                  open={folding.isOpen(source, added.length > 0)}
                >
                  <summary
                    onClick={(event) => {
                      event.preventDefault()
                      folding.toggle(source, added.length > 0)
                    }}
                  >
                    {source}{' '}
                    <Text component="span" size="xs" c="dimmed">
                      {tr('{0} 個欄位 · 已加入 {1}', fields.length, added.length)}
                    </Text>
                  </summary>
                  {added.map(row)}
                  {unadded.length > 0 && !folding.showsUnadded(source) ? (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="gray"
                      onClick={() => folding.showUnadded(source)}
                    >
                      {tr('＋ {0} 個尚未加入', unadded.length)}
                    </Button>
                  ) : (
                    unadded.map(row)
                  )}
                </details>
              )
            })}
            {!shown.length && !groups.length && (
              <Text size="sm" c="dimmed">
                {tr('沒有符合的欄位')}
              </Text>
            )}
          </div>
          <div className="field-manager-detail">
            {currentGroup ? (
              <>
                <Button
                  className="field-manager-back"
                  size="compact-xs"
                  variant="subtle"
                  leftSection={<Icon name="arrow-left" size={14} />}
                  onClick={() => setSelected(undefined)}
                >
                  {tr('返回欄位清單')}
                </Button>
                <GroupDetail
                  key={currentGroup.groupId}
                  group={currentGroup}
                  draft={draft}
                  rows={rows}
                  attributes={attributes}
                  cardEditor={cardEditor}
                  actions={actions}
                  openField={setSelected}
                />
              </>
            ) : current ? (
              <>
                <Button
                  className="field-manager-back"
                  size="compact-xs"
                  variant="subtle"
                  leftSection={<Icon name="arrow-left" size={14} />}
                  onClick={() => setSelected(undefined)}
                >
                  {tr('返回欄位清單')}
                </Button>
                <FieldDetail
                  key={current.attributeId}
                  binding={current}
                  added={bound(current.attributeId)}
                  source={sources.find((f) => f.attributeId === current.attributeId)}
                  attributes={attributes}
                  draft={draft}
                  busy={busy}
                  dirty={dirty}
                  cardEditor={cardEditor}
                  values={values(current.attributeId)}
                  change={change}
                  reference={reference}
                  requestDelete={requestDelete}
                  setRenaming={setRenaming}
                  showSource={(source) => {
                    setSearch(source)
                    setSelected(undefined)
                  }}
                />
              </>
            ) : (
              <Text size="sm" c="dimmed">
                {tr('選擇左邊的欄位，就能在這裡查看與設定。')}
              </Text>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
