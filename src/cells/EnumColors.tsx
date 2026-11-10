import { ColorInput, SimpleGrid, Stack, Text } from '@mantine/core'
import { HelpTip } from '../common/HelpTip'
import { t as tr } from '../i18n'
import type { Project } from '../../shared/model'

const swatches = [
  '#e8590c',
  '#f08c00',
  '#2f9e44',
  '#0c8599',
  '#1971c2',
  '#6741d9',
  '#c2255c',
  '#868e96',
]
type Binding = Project['fieldBindings'][number]

// A badge colour for each option of a single-choice field; options without a colour stay grey.
export function EnumColors({
  binding,
  options,
  onChange,
}: {
  binding?: Binding
  options: string[]
  onChange: (optionColors: Record<string, string> | undefined) => void
}) {
  const colors = binding?.optionColors ?? {}
  if (!options.length) return null
  return (
    <Stack gap={6}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <Text size="sm" fw={500}>
          {tr('選項顏色')}
        </Text>
        <HelpTip
          text={tr('在組件顯示方式為「狀態徽章」時，各選項用自己的顏色；沒設定的維持灰色。')}
        />
      </div>
      <SimpleGrid cols={2} spacing={6}>
        {options.map((option) => (
          <ColorInput
            key={option}
            size="xs"
            format="hex"
            aria-label={tr('選項顏色 {0}', option)}
            placeholder={option}
            leftSection={undefined}
            swatches={swatches}
            swatchesPerRow={8}
            value={colors[option] ?? ''}
            onChange={(value) => {
              const next = { ...colors }
              if (/^#[0-9a-f]{6}$/i.test(value)) next[option] = value
              else if (!value) delete next[option]
              else return
              onChange(Object.keys(next).length ? next : undefined)
            }}
          />
        ))}
      </SimpleGrid>
    </Stack>
  )
}
