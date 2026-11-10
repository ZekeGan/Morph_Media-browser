import { readDate } from '../shared/fields'
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
import { yesNo } from './fieldTypes'

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
  // R-223 stage 1: switching a text field's "multiple values" / "fixed options" does not rewrite saved values, so
  // a folder may still hold the old type; it is edited in that type and the note says why.
  if (binding && binding.type !== f.type && ['string', 'tags', 'enum'].includes(binding.type))
    note = [note, tr('這個資料夾的值仍以原本的格式保存，編輯時沿用')].filter(Boolean).join(' · ')
  if (f.type === 'boolean')
    return (
      <Select
        label={f.key}
        description={note}
        placeholder={tr('未填')}
        clearable
        value={value === true ? 'true' : value === false ? 'false' : null}
        data={[
          { value: 'true', label: yesNo(true, binding) },
          { value: 'false', label: yesNo(false, binding) },
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
        // Text kept from before the field was a date shows as the date it reads as (R-240).
        value={f.type === 'date' ? (readDate(value, 'date') ?? '') : String(value ?? '')}
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
        splitChars={[',', '，']}
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
        value={readDate(value, 'datetime')?.replace(/^(\d{4}-\d{2}-\d{2})$/, '$1T00:00') ?? ''}
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
