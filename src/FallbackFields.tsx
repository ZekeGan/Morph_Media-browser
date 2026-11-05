import { ActionIcon, Button, Group, Select, Stack, Text, Tooltip } from '@mantine/core'
import { Icon } from './icons'
import { HelpTip } from './HelpTip'
import { t as tr } from './i18n'
import { cellField, isFilled } from '../shared/cells'
import {
  MAX_FALLBACKS,
  fieldValue,
  type Attribute,
  type Cell,
  type FolderRow,
  type Project,
} from '../shared/model'
import { cellType } from '../shared/explorer'
import { compatibleFieldTypes } from '../shared/fields'
import { fieldSource, fieldSourceGroups } from './fieldSources'

// One order for the main field and its fallbacks. Conversions affect display only, never stored field values.
export function FallbackFields({
  cell,
  draft,
  preview,
  sources,
  attributes,
  setFieldIds,
  setRenaming,
}: {
  cell: Cell
  draft: Project
  preview?: FolderRow
  sources: { attributeId: string; key: string; type: string }[]
  attributes: Attribute[]
  setFieldIds: (ids: string[], newSource?: string) => void
  setRenaming: (value: { id: string; name: string }) => void
}) {
  const ids = [cell.attributeId!, ...(cell.fallbackIds ?? [])],
    used = new Set(ids),
    display = cellType(cell.kind),
    candidates = [...draft.fieldBindings, ...sources.map((f) => ({ ...f, alias: f.key }))].filter(
      (f) => compatibleFieldTypes(display, f.type)
    ),
    free = candidates.filter((f) => !used.has(f.attributeId)),
    shown = cellField(cell, preview),
    binding = (id: string) => candidates.find((f) => f.attributeId === id),
    name = (id: string) => binding(id)?.alias ?? id,
    origin = (id: string) => fieldSource(id, attributes),
    isSource = (id: string) => sources.some((f) => f.attributeId === id),
    set = (next: string[], newId?: string) =>
      setFieldIds(next, newId && isSource(newId) ? newId : undefined),
    move = (from: number, to: number) => {
      const next = [...ids]
      next.splice(to, 0, next.splice(from, 1)[0])
      set(next)
    },
    conversion = (id: string) =>
      binding(id)?.type === display
        ? ''
        : display === 'string'
          ? tr('標籤 → 文字')
          : tr('文字 → 標籤')
  return (
    <Stack gap={6} className="fallback-fields">
      <Group gap={4}>
        <Text size="sm" fw={500}>
          {tr('資料來源')}
        </Text>
        <HelpTip text={tr('主要欄位沒有值時，依序改用下列欄位；兩者都有值時以排在前面的為準。')} />
      </Group>
      {ids.map((id, index) => (
        <div key={id} className="field-source-row" data-source-id={id}>
          <Group gap={4} wrap="nowrap" align="flex-end" className="fallback-row">
            <Select
              style={{ flex: 1, minWidth: 0 }}
              size="sm"
              label={index === 0 ? tr('綁定欄位') : undefined}
              aria-label={index === 0 ? tr('綁定欄位') : tr('第 {0} 順位欄位', index + 1)}
              allowDeselect={false}
              searchable
              value={id}
              data={fieldSourceGroups(
                candidates.filter((f) => f.attributeId === id || !used.has(f.attributeId)),
                attributes
              ).map(({ source, fields }) => ({
                group: source,
                items: fields.map((f) => ({
                  value: f.attributeId,
                  label: `${f.alias} · ${source}${conversion(f.attributeId) ? ' · ' + conversion(f.attributeId) : ''}`,
                })),
              }))}
              onChange={(value) =>
                value &&
                set(
                  ids.map((old, i) => (i === index ? value : old)),
                  value
                )
              }
            />
            <Tooltip label={tr('上移')}>
              <ActionIcon
                variant="default"
                size="sm"
                aria-label={tr('上移 {0}', name(id))}
                disabled={index === 0}
                onClick={() => move(index, index - 1)}
              >
                <span aria-hidden>↑</span>
              </ActionIcon>
            </Tooltip>
            <Tooltip label={tr('下移')}>
              <ActionIcon
                variant="default"
                size="sm"
                aria-label={tr('下移 {0}', name(id))}
                disabled={index === ids.length - 1}
                onClick={() => move(index, index + 1)}
              >
                <span aria-hidden>↓</span>
              </ActionIcon>
            </Tooltip>
            <Tooltip label={index === 0 ? tr('重新命名此欄位') : tr('移除備用欄位')}>
              <ActionIcon
                variant="default"
                size="sm"
                aria-label={index === 0 ? tr('重新命名此欄位') : tr('移除備用欄位 {0}', name(id))}
                onClick={() =>
                  index === 0
                    ? setRenaming({ id, name: name(id) })
                    : set(ids.filter((_, i) => i !== index))
                }
              >
                <Icon name={index === 0 ? 'edit' : 'close'} size={12} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <Text size="xs" c="dimmed" mt={3}>
            {index + 1} · {origin(id)}
            {conversion(id) && ` · ${conversion(id)}`}
            {preview &&
              ` · ${isFilled(fieldValue(preview, id)) ? (shown.attributeId === id ? tr('使用中') : tr('有值')) : tr('沒有值')}`}
          </Text>
        </div>
      ))}
      <Group gap="xs">
        <Button
          variant="default"
          size="xs"
          leftSection={<Icon name="plus" size={14} />}
          disabled={!free.length || ids.length > MAX_FALLBACKS}
          onClick={() => set([...ids, free[0].attributeId], free[0].attributeId)}
        >
          {tr('新增備用欄位')}
        </Button>
        {!free.length && ids.length <= MAX_FALLBACKS && (
          <Text size="xs" c="dimmed">
            {tr('沒有其他相容欄位。先在左側欄位清單新增或匯入。')}
          </Text>
        )}
      </Group>
      {['string', 'tags'].includes(display) && (
        <Text size="xs" c="dimmed">
          {display === 'string'
            ? tr('標籤合併成文字，原始資料不變。')
            : tr('文字整段顯示為一個標籤，不自動拆分。')}
        </Text>
      )}
      {preview && (
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
