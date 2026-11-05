import { useState } from 'react'
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Modal,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { Icon } from './icons'
import { t as tr } from './i18n'
import type { Attribute, Project } from '../shared/model'
import type { editorFields } from '../shared/layouts'
import { fieldSource } from './fieldSources'
import { EnumColors } from './EnumColors'
import { isTextType, switchTextType, textType, type SwitchResult } from './fieldTypes'

type Binding = Project['fieldBindings'][number]
type Source = ReturnType<typeof editorFields>[number]

// The field management window (R-225), opened from the "Your fields" heading: every field with its type,
// source, use count and meaning; rename, delete (with the impact preview), the text switches of R-223 and the
// options of a fixed-options field. Field combinations (R-226) will get their own part here.
export function FieldManager({
  opened,
  onClose,
  draft,
  busy,
  dirty,
  sources,
  availableFields,
  attributes,
  typeLabels,
  typeHints,
  values,
  change,
  onNewField,
  reference,
  requestDelete,
  setRenaming,
  switchable,
}: {
  opened: boolean
  onClose: () => void
  draft: Project
  busy: boolean
  dirty: boolean
  sources: Source[]
  availableFields: Source[]
  attributes: Attribute[]
  typeLabels: Record<string, string>
  typeHints: Record<string, string>
  // The values this field holds in the project's folders (for use counts and options taken from the data).
  values: (attributeId: string) => unknown[]
  change: (next: Project) => void
  onNewField: () => void
  reference: (binding: Binding) => void
  requestDelete: (binding: Binding) => void
  setRenaming: (value: { id: string; name: string }) => void
  // Type switches convert every layout's components, so they are offered only in the card layout editor
  // (a content template editor saves its own cells only).
  switchable: boolean
}) {
  const [search, setSearch] = useState('')
  // Per field: why a switch was refused, and options typed in before fixed options can be turned on.
  const [problems, setProblems] = useState<Record<string, string>>({})
  const [pending, setPending] = useState<Record<string, string[]>>({})
  const query = search.trim().toLocaleLowerCase()
  const fields: { binding: Binding; added: boolean }[] = [
    ...draft.fieldBindings.map((binding) => ({ binding, added: true })),
    ...availableFields.map((f) => ({
      binding: { attributeId: f.attributeId, alias: f.key, type: f.type },
      added: false,
    })),
  ].filter(({ binding }) =>
    `${binding.alias} ${fieldSource(binding.attributeId, attributes)} ${typeLabels[binding.type] ?? ''}`
      .toLocaleLowerCase()
      .includes(query)
  )
  const uses = (id: string) =>
    [
      ...draft.cells,
      ...(draft.layoutPresets ?? [])
        .filter((preset) => preset.id !== draft.activeLayoutId)
        .flatMap((preset) => preset.cells),
    ].filter((cell) => cell.attributeId === id || cell.fallbackIds?.includes(id)).length
  const reasons: Record<string, string> = {
    fallback: tr('這個欄位用在備用來源，請先移除備用來源再切換「限定選項」。'),
    condition: tr('這個欄位用在「等於／不等於」顯示條件，請先改條件再開啟「多個值」。'),
    options: tr('還沒有可用的值，請先輸入至少一個選項。'),
    'too-many': tr('這個欄位有超過 100 種不同的值，不適合限定選項。'),
    'condition-option': tr('這個欄位用在「等於／不等於」顯示條件，比較值不在選項內，請先改條件。'),
    long: tr('每個選項最多 100 個字'),
  }
  const apply = (id: string, result: SwitchResult) => {
    if ('error' in result) {
      setProblems((now) => ({ ...now, [id]: result.error }))
      if (result.error === 'options') setPending((now) => ({ ...now, [id]: now[id] ?? [] }))
      return
    }
    setProblems(({ [id]: _old, ...rest }) => rest)
    setPending(({ [id]: _old, ...rest }) => rest)
    change(result.project)
  }
  const usage = (id: string, option: string) =>
    values(id).filter(
      (value) => value === option || (Array.isArray(value) && value.includes(option))
    ).length
  const tooLong = (id: string, options: string[]) => {
    if (!options.some((option) => option.length > 100)) return false
    setProblems((now) => ({ ...now, [id]: 'long' }))
    return true
  }
  const setOptions = (binding: Binding, options: string[]) => {
    if (tooLong(binding.attributeId, options)) return
    const used = (binding.options ?? []).filter(
      (option) => !options.includes(option) && usage(binding.attributeId, option) > 0
    )
    if (used.length) {
      setProblems((now) => ({
        ...now,
        [binding.attributeId]: tr(
          '「{0}」仍有 {1} 個資料夾使用，請先把這些資料夾改成其他值再移除。',
          used[0],
          usage(binding.attributeId, used[0])
        ),
      }))
      return
    }
    if (!options.length) {
      setProblems((now) => ({ ...now, [binding.attributeId]: tr('單選至少需要一個選項') }))
      return
    }
    setProblems(({ [binding.attributeId]: _old, ...rest }) => rest)
    change({
      ...draft,
      fieldBindings: draft.fieldBindings.map((field) =>
        field.attributeId === binding.attributeId
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
  const row = ({ binding, added }: { binding: Binding; added: boolean }) => {
    const id = binding.attributeId,
      name = binding.alias || tr('未命名欄位'),
      source = sources.find((f) => f.attributeId === id),
      text = isTextType(binding.type),
      problem = problems[id]
    return (
      <div key={id} className="field-manager-row" data-attribute-id={id}>
        <Group justify="space-between" wrap="nowrap" align="flex-start" gap="xs">
          <div className="field-manager-name">
            <Text fw={600} size="sm">
              {name}
            </Text>
            <Text size="xs" c="dimmed">
              {typeLabels[binding.type] ?? binding.type} · {fieldSource(id, attributes)} ·{' '}
              {added ? tr('使用 {0} 次', uses(id)) : tr('尚未加入')}
              {source?.shared === false && source.private ? ' · ' + tr('專案私有') : ''}
            </Text>
            <Text size="xs" c="dimmed" className="field-manager-hint">
              {typeHints[binding.type]}
            </Text>
          </div>
          <Group gap={4} wrap="nowrap">
            {added ? (
              <>
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
                <Tooltip label={dirty ? tr('先保存版面後才能刪除欄位') : tr('刪除欄位及資料')}>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    aria-label={tr('刪除欄位及資料') + ' ' + name}
                    disabled={busy || dirty}
                    onClick={() => requestDelete(binding)}
                  >
                    <Icon name="close" size={14} />
                  </ActionIcon>
                </Tooltip>
              </>
            ) : (
              <Button
                size="compact-xs"
                variant="light"
                disabled={source?.conflict}
                onClick={() => reference(binding)}
              >
                {tr('只引用欄位')}
              </Button>
            )}
          </Group>
        </Group>
        {added && text && (
          <Group gap="lg" mt={6}>
            <Switch
              size="xs"
              label={tr('多個值')}
              checked={binding.type === 'tags'}
              disabled={!switchable || binding.type === 'enum'}
              onChange={(event) =>
                apply(
                  id,
                  switchTextType(
                    draft,
                    id,
                    textType(event.currentTarget.checked, false),
                    values(id)
                  )
                )
              }
            />
            <Switch
              size="xs"
              label={tr('限定選項')}
              checked={binding.type === 'enum'}
              disabled={!switchable || binding.type === 'tags'}
              onChange={(event) =>
                apply(
                  id,
                  switchTextType(
                    draft,
                    id,
                    textType(false, event.currentTarget.checked),
                    values(id)
                  )
                )
              }
            />
          </Group>
        )}
        {added && text && !switchable && (
          <Text size="xs" c="dimmed" mt={4}>
            {tr('「多個值」「限定選項」請在卡片版面編輯器切換。')}
          </Text>
        )}
        {added && text && binding.type !== 'enum' && pending[id] && (
          <Group gap="xs" mt={6} align="flex-end" wrap="nowrap">
            <TagsInput
              flex={1}
              size="xs"
              label={tr('選項')}
              placeholder={tr('輸入選項後按 Enter')}
              value={pending[id]}
              splitChars={[',', '，']}
              onChange={(options) =>
                !tooLong(id, options) && setPending((now) => ({ ...now, [id]: options }))
              }
            />
            <Button
              size="xs"
              variant="default"
              disabled={!pending[id].length}
              onClick={() =>
                apply(
                  id,
                  switchTextType(
                    {
                      ...draft,
                      fieldBindings: draft.fieldBindings.map((field) =>
                        field.attributeId === id ? { ...field, options: pending[id] } : field
                      ),
                    },
                    id,
                    'enum',
                    values(id)
                  )
                )
              }
            >
              {tr('開啟限定選項')}
            </Button>
          </Group>
        )}
        {added && binding.type === 'enum' && (
          <Stack gap={4} mt={6}>
            <TagsInput
              size="xs"
              label={tr('選項')}
              value={binding.options ?? []}
              splitChars={[',', '，']}
              onChange={(options) => setOptions(binding, options)}
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
          </Stack>
        )}
        {problem && (
          <Text size="xs" c="orange" mt={4} role="alert">
            {reasons[problem] ?? problem}
          </Text>
        )}
      </div>
    )
  }
  return (
    <Modal opened={opened} onClose={onClose} title={tr('管理欄位')} size="lg">
      <Stack gap="sm">
        <Group gap="xs" wrap="nowrap">
          <TextInput
            flex={1}
            size="xs"
            aria-label={tr('搜尋欄位')}
            placeholder={tr('搜尋名稱、型別或來源')}
            leftSection={<Icon name="search" size={14} />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <Button
            size="xs"
            variant="light"
            leftSection={<Icon name="plus" size={14} />}
            onClick={onNewField}
          >
            {tr('新增欄位')}
          </Button>
        </Group>
        <Text size="xs" c="dimmed">
          {tr('切換「多個值」「限定選項」只改欄位設定；資料夾裡已存的值不會改寫，顯示時自動轉換。')}
        </Text>
        {fields.length ? (
          <div className="field-manager-list">{fields.map(row)}</div>
        ) : (
          <Text size="sm" c="dimmed">
            {tr('沒有符合的欄位')}
          </Text>
        )}
        <Group gap={6}>
          <Badge size="xs" color="gray">
            {tr('{0} 個欄位', draft.fieldBindings.length)}
          </Badge>
        </Group>
      </Stack>
    </Modal>
  )
}
