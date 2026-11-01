import { ActionIcon, Button, Group, Select, Stack, Text, Tooltip } from '@mantine/core'
import { Icon } from './icons'
import { t as tr } from './i18n'
import { cellField, isFilled } from '../shared/cells'
import { MAX_FALLBACKS, fieldValue, type Cell, type FolderRow, type Project } from '../shared/model'
import { cellType } from '../shared/explorer'

// Ordered fallback fields of a field cell: the first field holding a value is the one shown.
export function FallbackFields({
  cell,
  draft,
  preview,
  sources,
  setFallbackIds,
}: {
  cell: Cell
  draft: Project
  preview?: FolderRow
  // Fields found in the folders' records that the project has not used yet; choosing one adds it to the project.
  sources: { attributeId: string; key: string; type: string }[]
  setFallbackIds: (ids: string[], newSource?: string) => void
}) {
  const fallbacks = cell.fallbackIds ?? [],
    used = new Set([cell.attributeId, ...fallbacks]),
    sameType = draft.fieldBindings.filter((field) => field.type === cellType(cell.kind)),
    freeBound = sameType.filter((field) => !used.has(field.attributeId)),
    freeSources = sources.filter((source) => source.type === cellType(cell.kind)),
    free = [...freeBound.map((f) => f.attributeId), ...freeSources.map((f) => f.attributeId)],
    alias = (id?: string) => draft.fieldBindings.find((f) => f.attributeId === id)?.alias ?? '',
    shown = cellField(cell, preview),
    set = (next: string[], newSource?: string) => setFallbackIds(next, newSource),
    isSource = (id: string) => freeSources.some((source) => source.attributeId === id),
    move = (from: number, to: number) => {
      const next = [...fallbacks]
      next.splice(to, 0, next.splice(from, 1)[0])
      set(next)
    },
    state = (id?: string) =>
      !preview ? '' : isFilled(fieldValue(preview, id ?? '')) ? tr('有值') : tr('沒有值')
  return (
    <Stack gap={6} className="fallback-fields">
      <div>
        <Text size="sm" fw={500}>
          {tr('備用欄位')}
        </Text>
        <Text size="xs" c="dimmed">
          {tr('主要欄位沒有值時，依序改用下列欄位；兩者都有值時以排在前面的為準。')}
        </Text>
      </div>
      {fallbacks.map((id, index) => (
        <Group key={id} gap={4} wrap="nowrap" align="center" className="fallback-row">
          <Text size="xs" c="dimmed" w={16} ta="center" aria-hidden>
            {index + 2}
          </Text>
          <Select
            style={{ flex: 1, minWidth: 0 }}
            size="sm"
            aria-label={tr('第 {0} 順位欄位', index + 2)}
            allowDeselect={false}
            value={id}
            data={[
              {
                group: tr('專案欄位'),
                items: sameType
                  .filter((field) => field.attributeId === id || !used.has(field.attributeId))
                  .map((field) => ({ value: field.attributeId, label: field.alias })),
              },
              ...(freeSources.length
                ? [
                    {
                      group: tr('引用資料夾既有欄位'),
                      items: freeSources.map((source) => ({
                        value: source.attributeId,
                        label: source.key,
                      })),
                    },
                  ]
                : []),
            ]}
            onChange={(value) =>
              value &&
              set(
                fallbacks.map((old, i) => (i === index ? value : old)),
                isSource(value) ? value : undefined
              )
            }
          />
          <Tooltip label={tr('上移')}>
            <ActionIcon
              variant="default"
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
              variant="default"
              size="sm"
              aria-label={tr('下移 {0}', alias(id))}
              disabled={index === fallbacks.length - 1}
              onClick={() => move(index, index + 1)}
            >
              <span aria-hidden>↓</span>
            </ActionIcon>
          </Tooltip>
          <Tooltip label={tr('移除備用欄位')}>
            <ActionIcon
              variant="default"
              size="sm"
              aria-label={tr('移除備用欄位 {0}', alias(id))}
              onClick={() => set(fallbacks.filter((_, i) => i !== index))}
            >
              <Icon name="close" size={12} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ))}
      <Group gap="xs">
        <Button
          variant="default"
          size="xs"
          leftSection={<Icon name="plus" size={14} />}
          disabled={!free.length || fallbacks.length >= MAX_FALLBACKS}
          onClick={() => set([...fallbacks, free[0]], isSource(free[0]) ? free[0] : undefined)}
        >
          {tr('新增備用欄位')}
        </Button>
        {!free.length && fallbacks.length < MAX_FALLBACKS && (
          <Text size="xs" c="dimmed">
            {tr('沒有其他同型別欄位。先在左側欄位清單新增或匯入。')}
          </Text>
        )}
      </Group>
      {fallbacks.length > 0 && preview && (
        <Text size="xs" c="dimmed" role="status">
          {isFilled(shown.value)
            ? tr('預覽中的「{0}」顯示：{1}', preview.name, alias(shown.attributeId))
            : tr('預覽中的「{0}」所有欄位都沒有值', preview.name)}
          {' · '}
          {[cell.attributeId, ...fallbacks].map((id) => `${alias(id)}（${state(id)}）`).join('、')}
        </Text>
      )}
    </Stack>
  )
}
