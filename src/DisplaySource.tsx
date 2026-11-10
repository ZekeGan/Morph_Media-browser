import { useState } from 'react'
import { ActionIcon, Button, Group, Select, Stack, Text, Tooltip } from '@mantine/core'
import { Icon } from './icons'
import { t as tr } from './i18n'
import { cellField, groupOf, isFilled } from '../shared/cells'
import type { Attribute, Cell, FolderRow, Project } from '../shared/model'
import { cellType } from '../shared/explorer'
import { compatibleFieldTypes } from '../shared/fields'
import { groupType } from '../shared/fieldGroups'
import { fieldSource, fieldSourceGroups } from './fieldSources'

const GROUP = 'group:'

// What a field component shows: one field or one field group, changed with "Change". Components saved with
// fallback fields keep working and can be turned into a group (R-226).
export function DisplaySource({
  cell,
  draft,
  preview,
  sources,
  attributes,
  setFieldIds,
  setGroup,
  convertToGroup,
  setRenaming,
}: {
  cell: Cell
  draft: Project
  preview?: FolderRow
  sources: { attributeId: string; key: string; type: string }[]
  attributes: Attribute[]
  setFieldIds: (ids: string[], newSource?: string) => void
  setGroup: (groupId: string) => void
  convertToGroup: () => void
  setRenaming: (value: { id: string; name: string }) => void
}) {
  const [picking, setPicking] = useState(false)
  const display = cellType(cell.kind),
    group = groupOf(draft, cell.groupId),
    candidates = [...draft.fieldBindings, ...sources.map((f) => ({ ...f, alias: f.key }))].filter(
      (f) => compatibleFieldTypes(display, f.type)
    ),
    groups = (draft.fieldGroups ?? []).filter((g) =>
      compatibleFieldTypes(display, groupType(draft, g))
    ),
    name = (id: string) => candidates.find((f) => f.attributeId === id)?.alias ?? id,
    origin = (id: string) => fieldSource(id, attributes),
    shown = cellField(cell, preview, draft),
    chain = cell.fallbackIds?.length ? [cell.attributeId!, ...cell.fallbackIds] : undefined,
    current = group ? GROUP + group.groupId : (cell.attributeId ?? null)
  const choose = (value: string | null) => {
    setPicking(false)
    if (!value || value === current) return
    if (value.startsWith(GROUP)) setGroup(value.slice(GROUP.length))
    else setFieldIds([value], sources.some((f) => f.attributeId === value) ? value : undefined)
  }
  return (
    <Stack gap={6} className="display-source">
      <Group gap={6} wrap="nowrap" className="display-source-head">
        <Text size="sm" fw={500}>
          {tr('顯示：')}
        </Text>
        {group ? (
          <span className="display-source-name">
            <span className="palette-row-icon is-group" aria-hidden>
              <Icon name="layers" size={12} />
            </span>
            {tr('群組「{0}」', group.name)}
          </span>
        ) : (
          <span className="display-source-name">
            {cell.attributeId ? tr('欄位「{0}」', name(cell.attributeId)) : tr('未選擇')}
          </span>
        )}
        {!group && cell.attributeId && (
          <Tooltip label={tr('重新命名此欄位')}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              aria-label={tr('重新命名此欄位')}
              onClick={() => setRenaming({ id: cell.attributeId!, name: name(cell.attributeId!) })}
            >
              <Icon name="edit" size={12} />
            </ActionIcon>
          </Tooltip>
        )}
        <Button size="compact-xs" variant="default" onClick={() => setPicking(!picking)}>
          {tr('更換')}
        </Button>
      </Group>
      {picking && (
        <Select
          size="sm"
          aria-label={tr('更換顯示的欄位或群組')}
          placeholder={tr('搜尋欄位或群組')}
          searchable
          autoFocus
          defaultDropdownOpened
          allowDeselect={false}
          value={current}
          onChange={choose}
          onDropdownClose={() => setPicking(false)}
          comboboxProps={{ withinPortal: true }}
          data={[
            ...(groups.length
              ? [
                  {
                    group: tr('群組'),
                    items: groups.map((g) => ({ value: GROUP + g.groupId, label: g.name })),
                  },
                ]
              : []),
            ...fieldSourceGroups(candidates, attributes).map(({ source, fields }) => ({
              group: source,
              items: fields.map((f) => ({ value: f.attributeId, label: `${f.alias} · ${source}` })),
            })),
          ]}
        />
      )}
      {group && (
        <Text size="xs" c="dimmed">
          {tr('依序取第一個有值的：{0}', group.memberIds.map(name).join(' → '))}
        </Text>
      )}
      {chain && (
        <div className="display-source-legacy">
          <Text size="xs" c="dimmed">
            {tr('備用來源（舊版設定）：{0}', chain.map(name).join(' → '))}
          </Text>
          <Button size="compact-xs" variant="light" onClick={convertToGroup}>
            {tr('轉成群組')}
          </Button>
        </div>
      )}
      {['string', 'tags'].includes(display) &&
        (group?.memberIds ?? chain ?? []).some(
          (id) => candidates.find((f) => f.attributeId === id)?.type !== display
        ) && (
          <Text size="xs" c="dimmed">
            {display === 'string'
              ? tr('標籤合併成文字，原始資料不變。')
              : tr('文字整段顯示為一個標籤，不自動拆分。')}
          </Text>
        )}
      {preview && (group || chain) && (
        <Text size="xs" c="dimmed" role="status">
          {isFilled(shown.value)
            ? tr(
                '預覽中的「{0}」顯示：{1}',
                preview.name,
                `${name(shown.attributeId!)} · ${origin(shown.attributeId!)}`
              )
            : tr('預覽中的「{0}」所有欄位都沒有值', preview.name)}
        </Text>
      )}
    </Stack>
  )
}
