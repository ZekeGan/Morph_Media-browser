import { useEffect, useState } from 'react'
import { ActionIcon, Button, Menu, TextInput, Tooltip, UnstyledButton } from '@mantine/core'
import { Icon } from './icons'
import { HelpTip } from './HelpTip'
import { t as tr } from './i18n'
import {
  fieldValue,
  type Attribute,
  type FieldGroup,
  type FolderRow,
  type Project,
} from '../shared/model'
import { groupValue } from '../shared/cells'
import {
  addToGroup,
  createGroup,
  dissolveGroup,
  freeGroupName,
  groupType,
  joinRefusal,
  removeFromGroup,
  renameGroup,
  reorderGroup,
  type GroupRefusal,
} from '../shared/fieldGroups'
import { fieldSource } from './fieldSources'
import { groupUseList, purposeGlyph, usesSummary, type FieldUse } from './fieldTypes'

type Binding = Project['fieldBindings'][number]

// One line of the previewed folder's value for a field; long values are cut with "…" and shown whole on hover.
export function FieldValuePreview({ value }: { value: unknown }) {
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

export function refusalText(refusal: GroupRefusal | string) {
  return refusal === 'type'
    ? tr('型別不同的欄位不能放在同一個群組（文字和多個值可以）')
    : refusal === 'full'
      ? tr('一個群組最多 {0} 個欄位', 20)
      : refusal === 'name'
        ? tr('群組名稱需為 1～100 字，且不可與欄位或其他群組重複')
        : tr('這個欄位已在群組裡')
}

// The field being dragged in the field lists (dataTransfer cannot be read while dragging over a target).
let dragged: { attributeId?: string; groupId?: string; member?: string } = {}
export const fieldDrag = {
  start: (value: typeof dragged) => (dragged = value),
  end: () => (dragged = {}),
  current: () => dragged,
}

// Group changes for the editor: fields not added to the project yet are added first, in the same undo step.
export function useGroupActions({
  draft,
  change,
  bindSource,
  setError,
  onCreated,
}: {
  draft: Project
  change: (next: Project) => void
  bindSource: (bindings: Project['fieldBindings'], source: Binding) => Project['fieldBindings']
  setError: (message: string) => void
  // A new group made by a drag opens at once, so it can be named.
  onCreated?: (groupId: string | undefined) => void
}) {
  const bound = (fields: Binding[]) => ({
    ...draft,
    fieldBindings: fields.reduce(bindSource, draft.fieldBindings),
  })
  const attempt = (make: () => Project) => {
    try {
      change(make())
      setError('')
      return true
    } catch (error) {
      setError(refusalText(error instanceof Error ? error.message : String(error)))
      return false
    }
  }
  return {
    onCreated,
    refuse: (refusal: GroupRefusal) => setError(refusalText(refusal)),
    // A new group of the given fields, named after the first; returns its ID.
    create(fields: Binding[]) {
      const next = bound(fields),
        groupId = crypto.randomUUID(),
        first = next.fieldBindings.find((f) => f.attributeId === fields[0].attributeId)
      const name = freeGroupName(next, tr('{0} 群組', first?.alias ?? fields[0].alias))
      return attempt(() =>
        createGroup(
          next,
          fields.map((f) => f.attributeId),
          name,
          groupId
        )
      )
        ? groupId
        : undefined
    },
    join(groupId: string, field: Binding, index?: number) {
      return attempt(() => addToGroup(bound([field]), groupId, field.attributeId, index))
    },
    remove(attributeId: string) {
      return attempt(() => removeFromGroup(draft, attributeId))
    },
    reorder(groupId: string, memberIds: string[]) {
      return attempt(() => reorderGroup(draft, groupId, memberIds))
    },
    rename(groupId: string, name: string) {
      return attempt(() => renameGroup(draft, groupId, name))
    },
    dissolve(groupId: string) {
      return attempt(() => dissolveGroup(draft, groupId))
    },
    refusal(target: { groupId: string } | { attributeId: string }, field: Binding) {
      // A field not added yet is checked by its type alone.
      const next = bound([field])
      if ('attributeId' in target && target.attributeId === field.attributeId) return 'same'
      return joinRefusal(next, target, field.attributeId)
    },
  }
}
export type GroupActions = ReturnType<typeof useGroupActions>

// Where a dragged field would land on a row: start a group with it, join the group, or be refused (with why).
export type DropState = 'ok' | 'refused' | undefined
export function useDropTarget(
  actions: GroupActions,
  target: { groupId: string } | { attributeId: string },
  fieldOf: (attributeId: string) => Binding | undefined
) {
  const [over, setOver] = useState<DropState>()
  return { over, props: dropHandlers(actions, target, fieldOf, setOver) }
}
export function dropHandlers(
  actions: GroupActions,
  target: { groupId: string } | { attributeId: string },
  fieldOf: (attributeId: string) => Binding | undefined,
  setOver: (state: DropState) => void
) {
  return {
    onDragOver: (event: React.DragEvent) => {
      const now = fieldDrag.current(),
        moving = now.attributeId && !now.member ? fieldOf(now.attributeId) : undefined
      if (!moving) return
      const refusal = actions.refusal(target, moving)
      if (refusal === 'same') return
      event.preventDefault()
      event.dataTransfer.dropEffect = refusal ? 'none' : 'move'
      setOver(refusal ? 'refused' : 'ok')
    },
    onDragLeave: () => setOver(undefined),
    onDrop: (event: React.DragEvent) => {
      setOver(undefined)
      const now = fieldDrag.current(),
        moving = now.attributeId && !now.member ? fieldOf(now.attributeId) : undefined
      if (!moving) return
      event.preventDefault()
      event.stopPropagation()
      fieldDrag.end()
      const refusal = actions.refusal(target, moving)
      if (refusal === 'same') return
      if (refusal) return actions.refuse(refusal)
      if ('groupId' in target) actions.join(target.groupId, moving)
      else {
        const into = fieldOf(target.attributeId)
        if (into) actions.onCreated?.(actions.create([into, moving]))
      }
    },
  }
}

export function UseCount({ uses }: { uses: FieldUse[] }) {
  const text = tr('使用 {0} 次', uses.length)
  return uses.length ? (
    <Tooltip label={usesSummary(uses)} openDelay={300}>
      <span>{text}</span>
    </Tooltip>
  ) : (
    <span>{text}</span>
  )
}

// A group row looks like a field row; only its picture differs (the accent colour, a stack of layers).
export function GroupRow({
  group,
  project,
  preview,
  actions,
  fieldOf,
  open,
  rename,
  manage,
  dragImage,
  kind,
  cardEditor,
}: {
  cardEditor: boolean
  group: FieldGroup
  project: Project
  preview?: FolderRow
  actions: GroupActions
  fieldOf: (attributeId: string) => Binding | undefined
  open: () => void
  rename: () => void
  manage: () => void
  dragImage: (event: React.DragEvent<HTMLDivElement>) => void
  kind?: string
}) {
  const drop = useDropTarget(actions, { groupId: group.groupId }, fieldOf)
  const shown = preview ? groupValue(project, group, preview) : undefined
  return (
    <div
      className={
        'palette-item palette-row palette-field palette-group' +
        (drop.over ? ' is-drop-' + drop.over : '')
      }
      data-group-id={group.groupId}
      draggable={!!kind}
      onDragStart={(e) => {
        if (!kind) return
        e.dataTransfer.setData('text/plain', kind)
        e.dataTransfer.setData('application/x-media-viewer-group', group.groupId)
        e.dataTransfer.effectAllowed = 'copy'
        fieldDrag.start({ groupId: group.groupId })
        dragImage(e)
      }}
      onDragEnd={() => fieldDrag.end()}
      {...drop.props}
    >
      <UnstyledButton
        className="palette-row-main"
        title={tr('{0} · 群組，{1} 個欄位', group.name, group.memberIds.length)}
        aria-label={tr('打開群組 {0}', group.name)}
        onClick={open}
      >
        <span className="palette-row-icon is-group" aria-hidden>
          <Icon name="layers" size={14} />
        </span>
        <span className="palette-row-text">
          <span className="palette-field-name">{group.name}</span>
          {preview ? (
            <FieldValuePreview value={shown?.value} />
          ) : (
            <span className="palette-row-meta">{tr('{0} 個欄位', group.memberIds.length)}</span>
          )}
        </span>
        <span className="palette-row-state">
          <UseCount uses={groupUseList(project, group.groupId, cardEditor)} />
        </span>
      </UnstyledButton>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <Tooltip label={tr('群組操作')} openDelay={300}>
            <ActionIcon
              className="palette-row-more"
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={tr('群組操作 {0}', group.name)}
            >
              <Icon name="more" size={14} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<Icon name="layers" size={14} />} onClick={open}>
            {tr('打開群組')}
          </Menu.Item>
          <Menu.Item leftSection={<Icon name="edit" size={14} />} onClick={rename}>
            {tr('重新命名群組')}
          </Menu.Item>
          <Menu.Item leftSection={<Icon name="settings" size={14} />} onClick={manage}>
            {tr('群組設定…')}
          </Menu.Item>
          <Menu.Item
            color="red"
            leftSection={<Icon name="close" size={14} />}
            onClick={() => actions.dissolve(group.groupId)}
          >
            {tr('解散群組')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  )
}

// An opened group: its name, its members in order (drag or the menu to reorder), which one the previewed folder
// shows, and a way back. Members can still be put on the card one by one.
export function GroupView({
  group,
  project,
  preview,
  attributes,
  actions,
  back,
  addToCard,
  dragImage,
  memberKind,
  focusName,
}: {
  group: FieldGroup
  project: Project
  preview?: FolderRow
  attributes: Attribute[]
  actions: GroupActions
  back: () => void
  addToCard?: () => void
  dragImage?: (event: React.DragEvent<HTMLDivElement>) => void
  memberKind?: (binding: Binding) => string | undefined
  focusName?: boolean
}) {
  const [name, setName] = useState(group.name),
    [overMember, setOverMember] = useState<string>()
  useEffect(() => setName(group.name), [group.name])
  const shown = preview ? groupValue(project, group, preview) : undefined
  const move = (from: string, to: number) => {
    const ids = group.memberIds.filter((id) => id !== from)
    ids.splice(Math.max(0, Math.min(ids.length, to)), 0, from)
    actions.reorder(group.groupId, ids)
  }
  const commitName = () => {
    if (name.trim() !== group.name && !actions.rename(group.groupId, name)) setName(group.name)
  }
  const type = groupType(project, group)
  return (
    <div className="palette-group-view" aria-label={tr('群組 {0}', group.name)} role="region">
      <div className="palette-group-head">
        <Tooltip label={tr('返回欄位清單')} openDelay={300}>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={tr('返回欄位清單')}
            onClick={back}
          >
            <Icon name="arrow-left" size={14} />
          </ActionIcon>
        </Tooltip>
        <span className="palette-row-icon is-group" aria-hidden>
          <Icon name="layers" size={14} />
        </span>
        <TextInput
          size="xs"
          className="palette-group-name"
          aria-label={tr('群組名稱')}
          value={name}
          maxLength={100}
          data-autofocus={focusName || undefined}
          autoFocus={focusName}
          onChange={(e) => setName(e.currentTarget.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName()
            if (e.key === 'Escape') setName(group.name)
          }}
        />
        <HelpTip
          text={tr('依順序顯示第一個有值的欄位。拖動可調整順序；把其他欄位拖到群組上即可加入。')}
        />
      </div>
      {addToCard && (
        <Button size="compact-xs" variant="light" mb={4} onClick={addToCard} disabled={!type}>
          {tr('加到卡片')}
        </Button>
      )}
      <div className="palette-rows" role="list" aria-label={tr('群組成員')}>
        {group.memberIds.map((id, index) => {
          const binding = project.fieldBindings.find((f) => f.attributeId === id)
          if (!binding) return null
          const kind = memberKind?.(binding),
            isShown = shown?.attributeId === id
          return (
            <div
              key={id}
              role="listitem"
              className={
                'palette-item palette-row palette-field palette-member' +
                (overMember === id ? ' is-drop-ok' : '')
              }
              data-attribute-id={id}
              draggable
              onDragStart={(e) => {
                if (kind) e.dataTransfer.setData('text/plain', kind)
                e.dataTransfer.setData('application/x-media-viewer-field', id)
                e.dataTransfer.effectAllowed = 'copyMove'
                fieldDrag.start({ attributeId: id, member: group.groupId })
                dragImage?.(e)
              }}
              onDragEnd={() => fieldDrag.end()}
              onDragOver={(e) => {
                const now = fieldDrag.current()
                if (now.member !== group.groupId || now.attributeId === id) return
                e.preventDefault()
                setOverMember(id)
              }}
              onDragLeave={() => setOverMember(undefined)}
              onDrop={(e) => {
                const now = fieldDrag.current()
                setOverMember(undefined)
                if (now.member !== group.groupId || !now.attributeId) return
                e.preventDefault()
                e.stopPropagation()
                fieldDrag.end()
                move(now.attributeId, index)
              }}
            >
              <div
                className="palette-row-main"
                title={`${binding.alias} · ${fieldSource(id, attributes)}`}
              >
                <span className="palette-row-icon is-glyph" aria-hidden>
                  {purposeGlyph(binding.type)}
                </span>
                <span className="palette-row-text">
                  <span className="palette-field-name">
                    {index + 1}. {binding.alias}
                  </span>
                  {preview ? (
                    <FieldValuePreview value={fieldValue(preview, id)} />
                  ) : (
                    <span className="palette-row-meta">{fieldSource(id, attributes)}</span>
                  )}
                </span>
                {isShown && (
                  <Tooltip label={tr('預覽資料夾顯示這個欄位')} openDelay={300}>
                    <span className="palette-member-shown" aria-label={tr('顯示中')}>
                      <Icon name="check" size={12} />
                    </span>
                  </Tooltip>
                )}
              </div>
              <Menu position="bottom-end" withinPortal>
                <Menu.Target>
                  <Tooltip label={tr('成員操作')} openDelay={300}>
                    <ActionIcon
                      className="palette-row-more"
                      variant="subtle"
                      color="gray"
                      size="sm"
                      aria-label={tr('成員操作 {0}', binding.alias)}
                    >
                      <Icon name="more" size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item disabled={index === 0} onClick={() => move(id, index - 1)}>
                    {tr('上移')}
                  </Menu.Item>
                  <Menu.Item
                    disabled={index === group.memberIds.length - 1}
                    onClick={() => move(id, index + 1)}
                  >
                    {tr('下移')}
                  </Menu.Item>
                  <Menu.Item
                    leftSection={<Icon name="close" size={14} />}
                    onClick={() => actions.remove(id)}
                  >
                    {tr('移出群組')}
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </div>
          )
        })}
      </div>
    </div>
  )
}
