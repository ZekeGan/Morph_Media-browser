import { NumberInput, Select, TextInput } from '@mantine/core'
import { HelpLabel } from '../common/HelpTip'
import { t as tr } from '../i18n'
import type { CellCondition, Project } from '../../shared/model'
import { typeKinds } from './editorKinds'
import { yesNo } from './fieldTypes'

type Binding = Project['fieldBindings'][number]

// One condition: a field, how it is compared, and the value to compare with. Used for display conditions and for
// the rules of layout text (R-239). Clearing the field removes the condition.
export function ConditionEditor({
  condition,
  fields,
  onChange,
  labels,
  help,
  placeholder,
}: {
  condition?: CellCondition
  fields: Binding[]
  onChange: (next: CellCondition | undefined) => void
  // Accessible names, distinct per row when there are several.
  labels: { field: string; operator: string; value: string }
  help?: string
  placeholder?: string
}) {
  const usable = fields.filter((field) => Object.hasOwn(typeKinds, field.type))
  const field = usable.find((f) => f.attributeId === condition?.attributeId)
  const dated = ['date', 'datetime'].includes(field?.type ?? '')
  const firstValue = (operator: CellCondition['operator']) =>
    ['within', 'older'].includes(operator)
      ? 30
      : field?.type === 'boolean'
        ? false
        : field?.type === 'number'
          ? 0
          : field?.type === 'enum'
            ? (field.options?.[0] ?? '')
            : ''
  return (
    <>
      <Select
        label={help ? <HelpLabel label={labels.field} help={help} /> : labels.field}
        placeholder={placeholder}
        // Picking the chosen field again must not remove the condition; the clear button does that.
        allowDeselect={false}
        clearable
        value={condition?.attributeId ?? null}
        data={usable.map((f) => ({ value: f.attributeId, label: f.alias }))}
        onChange={(attributeId) =>
          onChange(attributeId ? { attributeId, operator: 'set' } : undefined)
        }
      />
      {condition && (
        <>
          <Select
            label={labels.operator}
            allowDeselect={false}
            value={condition.operator}
            data={[
              { value: 'set', label: tr('已有值') },
              { value: 'unset', label: tr('未填') },
              ...(field?.type === 'tags'
                ? []
                : [
                    { value: 'equals', label: tr('等於') },
                    { value: 'not-equals', label: tr('不等於') },
                  ]),
              ...(['number', 'date', 'datetime'].includes(field?.type ?? '')
                ? [
                    { value: 'gt', label: tr('大於') },
                    { value: 'lt', label: tr('小於') },
                  ]
                : []),
              ...(dated
                ? [
                    { value: 'within', label: tr('距今 N 天內') },
                    { value: 'older', label: tr('距今超過 N 天') },
                  ]
                : []),
            ]}
            onChange={(operator) => {
              if (!operator) return
              const next: CellCondition = {
                attributeId: condition.attributeId,
                operator: operator as CellCondition['operator'],
              }
              if (operator !== 'set' && operator !== 'unset') next.value = firstValue(next.operator)
              onChange(next)
            }}
          />
          {['within', 'older'].includes(condition.operator) ? (
            <NumberInput
              label={labels.value}
              description={tr('天數，依今天計算')}
              min={1}
              max={36500}
              allowDecimal={false}
              clampBehavior="strict"
              value={condition.value as number}
              onChange={(value) =>
                typeof value === 'number' && value >= 1 && onChange({ ...condition, value })
              }
            />
          ) : ['equals', 'not-equals', 'gt', 'lt'].includes(condition.operator) ? (
            field?.type === 'boolean' ? (
              <Select
                label={labels.value}
                allowDeselect={false}
                value={String(condition.value)}
                data={[
                  { value: 'true', label: yesNo(true, field) },
                  { value: 'false', label: yesNo(false, field) },
                ]}
                onChange={(value) => value && onChange({ ...condition, value: value === 'true' })}
              />
            ) : field?.type === 'enum' ? (
              <Select
                label={labels.value}
                allowDeselect={false}
                value={String(condition.value ?? '')}
                data={(field.options ?? []).map((option) => ({ value: option, label: option }))}
                onChange={(value) => value && onChange({ ...condition, value })}
              />
            ) : field?.type === 'number' ? (
              <NumberInput
                label={labels.value}
                value={condition.value as number}
                onChange={(value) => typeof value === 'number' && onChange({ ...condition, value })}
              />
            ) : (
              <TextInput
                label={labels.value}
                value={String(condition.value ?? '')}
                maxLength={10000}
                type={
                  field?.type === 'date'
                    ? 'date'
                    : field?.type === 'datetime'
                      ? 'datetime-local'
                      : field?.type === 'url'
                        ? 'url'
                        : 'text'
                }
                onChange={(event) => onChange({ ...condition, value: event.currentTarget.value })}
              />
            )
          ) : null}
        </>
      )}
    </>
  )
}
