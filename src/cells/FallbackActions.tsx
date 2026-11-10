import { ActionIcon, Button, Group, Select, Stack, Text, Tooltip } from '@mantine/core'
import { Icon } from '../common/icons'
import { HelpTip } from '../common/HelpTip'
import { t as tr } from '../i18n'
import { MAX_FALLBACKS, type Cell, type FolderRow, type Project } from '../../shared/model'
import { launchChoice, launchTemplates } from '../../shared/explorer'

// Ordered fallback actions of a launch cell: the first action this folder has a target for is the one it starts.
export function FallbackActions({
  cell,
  draft,
  preview,
  updateCell,
}: {
  cell: Cell
  draft: Project
  preview?: FolderRow
  updateCell: (update: Partial<Cell>) => void
}) {
  const fallbacks = cell.fallbackActionIds ?? [],
    all = launchTemplates(draft),
    label = (id: string) => {
      const t = all.find((item) => item.id === id)
      return t ? (t.id === 'default-launch-game' ? tr(t.label) : t.label) : id
    },
    main = launchChoice(draft, cell.actionId, undefined, undefined)?.id,
    used = new Set([main, ...fallbacks]),
    free = all.filter((t) => !used.has(t.id)),
    set = (next: string[]) => updateCell({ fallbackActionIds: next.length ? next : undefined }),
    move = (from: number, to: number) => {
      const next = [...fallbacks]
      next.splice(to, 0, next.splice(from, 1)[0])
      set(next)
    },
    shown = preview
      ? launchChoice(draft, cell.actionId, cell.fallbackActionIds, preview.record?.details?.targets)
      : undefined,
    bound = (id: string) =>
      preview?.record?.details?.targets?.[id]?.kind === all.find((t) => t.id === id)?.kind
  return (
    <Stack gap={6} className="fallback-fields">
      <Group gap={4} wrap="nowrap">
        <Text size="sm" fw={500}>
          {tr('備用動作')}
        </Text>
        <HelpTip
          text={tr(
            '這個遊戲沒有綁定上面的動作時，依序改用下列動作；例如有些遊戲用 EXE、有些用捷徑。'
          )}
        />
      </Group>
      {fallbacks.map((id, index) => (
        <Group key={id} gap={4} wrap="nowrap" align="center" className="fallback-row">
          <Text size="xs" c="dimmed" w={16} ta="center" aria-hidden>
            {index + 2}
          </Text>
          <Select
            style={{ flex: 1, minWidth: 0 }}
            size="sm"
            aria-label={tr('第 {0} 順位動作', index + 2)}
            allowDeselect={false}
            value={id}
            data={all
              .filter((t) => t.id === id || !used.has(t.id))
              .map((t) => ({ value: t.id, label: label(t.id) }))}
            onChange={(value) =>
              value && set(fallbacks.map((old, i) => (i === index ? value : old)))
            }
          />
          <Tooltip label={tr('上移')}>
            <ActionIcon
              variant="default"
              size="sm"
              aria-label={tr('上移 {0}', label(id))}
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
              aria-label={tr('下移 {0}', label(id))}
              disabled={index === fallbacks.length - 1}
              onClick={() => move(index, index + 1)}
            >
              <span aria-hidden>↓</span>
            </ActionIcon>
          </Tooltip>
          <Tooltip label={tr('移除備用動作')}>
            <ActionIcon
              variant="default"
              size="sm"
              aria-label={tr('移除備用動作 {0}', label(id))}
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
          onClick={() => set([...fallbacks, free[0].id])}
        >
          {tr('新增備用動作')}
        </Button>
        {!free.length && fallbacks.length < MAX_FALLBACKS && (
          <Text size="xs" c="dimmed">
            {tr('沒有其他可啟動的動作。先在遊戲操作新增。')}
          </Text>
        )}
      </Group>
      {fallbacks.length > 0 && shown && preview && (
        <Group gap={4} wrap="nowrap">
          <Text size="xs" c="dimmed" role="status">
            {bound(shown.id)
              ? tr('預覽中的「{0}」使用：{1}', preview.name, label(shown.id))
              : tr('預覽中的「{0}」沒有綁定任何一個動作', preview.name)}
          </Text>
          <HelpTip
            text={[main, ...fallbacks]
              .filter((id): id is string => !!id)
              .map((id) => `${label(id)}（${bound(id) ? tr('已綁定') : tr('未綁定')}）`)
              .join('、')}
          />
        </Group>
      )}
    </Stack>
  )
}
