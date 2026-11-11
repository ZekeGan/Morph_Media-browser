import { useState } from 'react'
import { ActionIcon, Button, Group, Select, Stack, Text, Tooltip } from '@mantine/core'
import { Icon } from '../common/icons'
import { t as tr } from '../i18n'
import { cellField, groupOf, isFilled } from '../../shared/cells'
import type { Attribute, Cell, FolderRow, Project } from '../../shared/model'
import { cellType } from '../../shared/explorer'
import { compatibleFieldTypes } from '../../shared/fields'
import { groupType } from '../../shared/fieldGroups'
import { fieldSource, fieldSourceGroups } from './fieldSources'
import { importedFieldLabels } from './importedFieldLabels'

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
  openGroup,
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
  // Opens the group in the left panel, where its order is edited.
  openGroup: (groupId: string) => void
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
    // Imported fields keep upper-case keys (TITLE_ORIGINAL_2); people read the plain name and the site instead.
    labels = importedFieldLabels(),
    friendly = (id: string) => {
      const key = attributes.find((a) => a.attributeId === id)?.key,
        plain = (key && labels[key]) || name(id),
        site = origin(id)
      return site === tr('自建') ? plain : `${plain} · ${site}`
    },
    members = group?.memberIds ?? chain ?? [],
    // What the component shows now, and where that is in the order (R-229): one short line, no folder name.
    nowText = !preview
      ? group
        ? tr('{0} 個欄位，依序取第一個有值的', members.length)
        : tr('備用來源（舊版）：{0} 個欄位', members.length)
      : isFilled(shown.value) && shown.attributeId
        ? tr(
            '目前：{0}（第 {1} 個）',
            friendly(shown.attributeId),
            members.indexOf(shown.attributeId) + 1
          )
        : tr('目前：都沒有值'),
    nowTitle = members.map((id, i) => `${i + 1}. ${friendly(id)}（${name(id)}）`).join('\n'),
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
      {(group || chain) && (
        <div className="display-source-now">
          <Text size="xs" c="dimmed" role="status" title={nowTitle}>
            {nowText}
          </Text>
          {group ? (
            <Button size="compact-xs" variant="subtle" onClick={() => openGroup(group.groupId)}>
              {tr('編輯群組')}
            </Button>
          ) : (
            <Button size="compact-xs" variant="light" onClick={convertToGroup}>
              {tr('轉成群組')}
            </Button>
          )}
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
    </Stack>
  )
}
