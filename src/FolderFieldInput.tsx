import {
  Button,
  Group,
  NumberInput,
  Select,
  Stack,
  TagsInput,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core'
import type { Project } from '../shared/model'
import { t as tr } from './i18n'

type FieldBinding = Project['fieldBindings'][number]

export interface EditableField {
  attributeId: string
  key: string
  type: string
}

// One folder field as an input that matches its type; a choice field can also gain a new option here.
export function FolderFieldInput({
  field: f,
  value,
  binding,
  note,
  disabled,
  busy,
  draftOption,
  onDraftOption,
  onChange,
  onAddOption,
}: {
  field: EditableField
  value: unknown
  binding?: FieldBinding
  // Where an imported value came from, shown under the label.
  note?: string
  disabled: boolean
  busy: boolean
  draftOption: string
  onDraftOption: (text: string) => void
  onChange: (value: unknown) => void
  onAddOption: (option: string) => void
}) {
  if (f.type === 'boolean')
    return (
      <Select
        label={f.key}
        description={note}
        placeholder={tr('未填')}
        clearable
        value={value === true ? 'true' : value === false ? 'false' : null}
        data={[
          { value: 'true', label: tr('是') },
          { value: 'false', label: tr('否') },
        ]}
        disabled={disabled}
        onChange={(value) => onChange(value === null ? null : value === 'true')}
      />
    )
  if (f.type === 'enum') {
    const options = binding?.options ?? [],
      draft = draftOption.trim(),
      known = options.includes(draft),
      full = options.length >= 100
    return (
      <Stack gap={6}>
        <Select
          label={f.key}
          description={note}
          placeholder={tr('未填')}
          clearable
          value={typeof value === 'string' ? value : null}
          data={[
            ...options.map((option) => ({ value: option, label: option })),
            ...(typeof value === 'string' && !options.includes(value)
              ? [{ value, label: value, disabled: true }]
              : []),
          ]}
          disabled={disabled || !options.length}
          onChange={(value) => onChange(value)}
        />
        {binding && (
          <Group gap="xs" wrap="nowrap" align="flex-end">
            <TextInput
              flex={1}
              size="xs"
              aria-label={tr('新增選項') + ' ' + f.key}
              placeholder={tr('輸入新選項，所有資料夾共用')}
              maxLength={100}
              value={draftOption}
              disabled={disabled || busy}
              onChange={(event) => onDraftOption(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  onAddOption(draft)
                }
              }}
            />
            <Button
              size="xs"
              variant="default"
              disabled={disabled || busy || !draft || (full && !known)}
              onClick={() => onAddOption(draft)}
            >
              {known ? tr('選用') : tr('新增選項')}
            </Button>
          </Group>
        )}
      </Stack>
    )
  }
  if (f.type === 'url' || f.type === 'date')
    return (
      <TextInput
        label={f.key}
        description={note}
        type={f.type === 'url' ? 'url' : 'date'}
        value={String(value ?? '')}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value || null)}
      />
    )
  if (f.type === 'tags')
    return (
      <TagsInput
        label={f.key}
        description={note}
        placeholder={tr('以逗號分隔多個標籤')}
        value={Array.isArray(value) ? (value as string[]) : []}
        disabled={disabled}
        onChange={(v) => onChange(v)}
        splitChars={[',']}
      />
    )
  if (f.type === 'number')
    return (
      <NumberInput
        label={f.key}
        description={note}
        value={typeof value === 'number' ? value : ''}
        disabled={disabled}
        onChange={(v) => onChange(v)}
      />
    )
  if (f.type === 'datetime')
    return (
      <TextInput
        label={f.key}
        description={note}
        type="datetime-local"
        value={String(value ?? '')}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    )
  if (f.type === 'string')
    return (
      <Textarea
        label={f.key}
        description={note}
        placeholder={tr('尚未填寫')}
        autosize
        minRows={1}
        value={String(value ?? '')}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    )
  return (
    <Text size="sm">
      {f.key}
      {tr('：目前不支援編輯')}
      {f.type}
      {tr('，原值保留。')}
    </Text>
  )
}
