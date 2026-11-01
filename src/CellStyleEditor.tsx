import { useState, type ReactNode } from 'react'
import {
  ActionIcon,
  Button,
  Checkbox,
  Collapse,
  ColorInput,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core'
import { Icon } from './icons'
import { t as tr } from './i18n'
import type { Cell } from '../shared/model'

type Style = Cell['style']
const advancedKeys: (keyof Style)[] = [
  'padding',
  'radius',
  'borderColor',
  'borderWidth',
  'opacity',
  'lineHeight',
  'letterSpacing',
]
// A few ready-made looks; they only touch the optional style fields, never the colours.
const presets: Record<string, Partial<Style>> = {
  title: { weight: 'bold', fontSize: 'large' },
  note: { fontSize: 'small', opacity: 'soft' },
  highlight: {
    weight: 'bold',
    padding: 'roomy',
    radius: 'small',
    borderColor: '#3fb68b',
    borderWidth: 'thin',
  },
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="sm" fw={500} mb={4}>
        {label}
      </Text>
      {children}
    </div>
  )
}
// Each option is a segmented control whose first entry means "default" (the field is then removed from the cell).
function Segments<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T | undefined
  options: { value: T | 'default'; label: string }[]
  onChange: (value: T | undefined) => void
}) {
  return (
    <Row label={label}>
      <SegmentedControl
        size="xs"
        fullWidth
        aria-label={label}
        value={value ?? 'default'}
        data={options}
        onChange={(next) => onChange(next === 'default' ? undefined : (next as T))}
      />
    </Row>
  )
}

// The "Style" section of the component settings: text, alignment, colours and the less used box styles.
export function CellStyleEditor({
  cell,
  updateCell,
  extra,
}: {
  cell: Cell
  updateCell: (update: Partial<Cell>) => void
  extra?: ReactNode
}) {
  const style = cell.style,
    [more, setMore] = useState(() => advancedKeys.some((key) => style[key] !== undefined))
  const patch = (changes: Partial<Style>) => {
    const next = { ...style, ...changes }
    for (const key of Object.keys(next) as (keyof Style)[])
      if (next[key] === undefined) delete next[key]
    updateCell({ style: next })
  }
  const toggles: { key: 'italic' | 'underline' | 'strike'; label: string; glyph: ReactNode }[] = [
    { key: 'italic', label: tr('斜體'), glyph: <i>I</i> },
    { key: 'underline', label: tr('底線'), glyph: <u>U</u> },
    { key: 'strike', label: tr('刪除線'), glyph: <s>S</s> },
  ]
  const isTags = cell.kind === 'field-tags'
  return (
    <Stack gap="sm">
      <Select
        size="xs"
        aria-label={tr('套用預設樣式')}
        placeholder={tr('套用預設樣式…')}
        value={null}
        data={[
          { value: 'title', label: tr('標題') },
          { value: 'note', label: tr('次要說明') },
          { value: 'highlight', label: tr('強調') },
          { value: 'reset', label: tr('清除樣式（保留顏色）') },
        ]}
        onChange={(value) => {
          if (!value) return
          const { textColor, backgroundColor } = style
          updateCell({
            style: { textColor, backgroundColor, ...(value === 'reset' ? {} : presets[value]) },
          })
        }}
      />
      <Segments
        label={tr('字級')}
        value={style.fontSize}
        options={[
          { value: 'xsmall', label: tr('特小') },
          { value: 'small', label: tr('小') },
          { value: 'default', label: tr('中') },
          { value: 'large', label: tr('大') },
          { value: 'xlarge', label: tr('特大') },
        ]}
        onChange={(fontSize) => patch({ fontSize })}
      />
      <Row label={tr('文字')}>
        <Group gap={6} wrap="nowrap">
          <SegmentedControl
            size="xs"
            style={{ flex: 1 }}
            aria-label={tr('粗細')}
            value={style.weight ?? 'default'}
            data={[
              { value: 'light', label: tr('細') },
              { value: 'default', label: tr('一般') },
              { value: 'bold', label: tr('粗') },
            ]}
            onChange={(value) =>
              patch({ weight: value === 'default' ? undefined : (value as Style['weight']) })
            }
          />
          {toggles.map((toggle) => (
            <Tooltip key={toggle.key} label={toggle.label}>
              <ActionIcon
                variant={style[toggle.key] ? 'filled' : 'default'}
                aria-label={toggle.label}
                aria-pressed={!!style[toggle.key]}
                onClick={() => patch({ [toggle.key]: style[toggle.key] ? undefined : true })}
              >
                {toggle.glyph}
              </ActionIcon>
            </Tooltip>
          ))}
        </Group>
      </Row>
      <Segments
        label={tr('對齊')}
        value={style.align}
        options={[
          { value: 'default', label: tr('靠左') },
          { value: 'center', label: tr('置中') },
          { value: 'right', label: tr('靠右') },
        ]}
        onChange={(align) => patch({ align })}
      />
      <Segments
        label={tr('垂直對齊')}
        value={style.valign}
        options={[
          { value: 'top', label: tr('靠上') },
          { value: 'default', label: tr('置中') },
          { value: 'bottom', label: tr('靠下') },
        ]}
        onChange={(valign) => patch({ valign })}
      />
      {extra}
      {isTags && (
        <>
          <Segments
            label={tr('標籤顏色')}
            value={cell.tagColors}
            options={[
              { value: 'default', label: tr('一律灰色') },
              { value: 'namespace', label: tr('依分類上色') },
            ]}
            onChange={(tagColors) => updateCell({ tagColors })}
          />
          <Checkbox
            label={tr('顯示分類前綴')}
            checked={cell.tagPrefix !== false}
            onChange={(event) =>
              updateCell({ tagPrefix: event.currentTarget.checked ? undefined : false })
            }
          />
        </>
      )}
      <ColorInput
        label={tr('文字顏色')}
        format="hex"
        value={style.textColor}
        onChange={(v) => /^#[0-9a-f]{6}$/i.test(v) && patch({ textColor: v })}
      />
      <Checkbox
        label={tr('背景透明')}
        checked={style.backgroundColor === 'transparent'}
        onChange={(e) =>
          patch({ backgroundColor: e.currentTarget.checked ? 'transparent' : '#282a2e' })
        }
      />
      <ColorInput
        label={tr('背景顏色')}
        format="hex"
        disabled={style.backgroundColor === 'transparent'}
        value={style.backgroundColor === 'transparent' ? '#282a2e' : style.backgroundColor}
        onChange={(v) => /^#[0-9a-f]{6}$/i.test(v) && patch({ backgroundColor: v })}
      />
      <Button
        variant="subtle"
        size="compact-sm"
        justify="space-between"
        fullWidth
        aria-expanded={more}
        rightSection={<Icon name={more ? 'minus' : 'plus'} size={12} />}
        onClick={() => setMore(!more)}
      >
        {tr('更多樣式')}
      </Button>
      <Collapse in={more}>
        <Stack gap="sm">
          <Segments
            label={tr('內距')}
            value={style.padding}
            options={[
              { value: 'compact', label: tr('緊湊') },
              { value: 'default', label: tr('標準') },
              { value: 'roomy', label: tr('寬鬆') },
            ]}
            onChange={(padding) => patch({ padding })}
          />
          <Segments
            label={tr('圓角')}
            value={style.radius}
            options={[
              { value: 'default', label: tr('無') },
              { value: 'small', label: tr('小') },
              { value: 'large', label: tr('大') },
            ]}
            onChange={(radius) => patch({ radius })}
          />
          <Segments
            label={tr('邊框')}
            value={style.borderWidth}
            options={[
              { value: 'default', label: tr('無') },
              { value: 'thin', label: tr('細') },
              { value: 'thick', label: tr('粗') },
            ]}
            onChange={(borderWidth) =>
              patch({
                borderWidth,
                borderColor: borderWidth ? (style.borderColor ?? '#8a8f98') : undefined,
              })
            }
          />
          {style.borderWidth && (
            <ColorInput
              label={tr('邊框顏色')}
              format="hex"
              value={style.borderColor ?? '#8a8f98'}
              onChange={(v) => /^#[0-9a-f]{6}$/i.test(v) && patch({ borderColor: v })}
            />
          )}
          <Segments
            label={tr('透明度')}
            value={style.opacity}
            options={[
              { value: 'default', label: tr('不透明') },
              { value: 'soft', label: tr('柔和') },
              { value: 'faint', label: tr('淡') },
            ]}
            onChange={(opacity) => patch({ opacity })}
          />
          <Segments
            label={tr('行距')}
            value={style.lineHeight}
            options={[
              { value: 'tight', label: tr('緊') },
              { value: 'default', label: tr('標準') },
              { value: 'loose', label: tr('鬆') },
            ]}
            onChange={(lineHeight) => patch({ lineHeight })}
          />
          <Segments
            label={tr('字距')}
            value={style.letterSpacing}
            options={[
              { value: 'default', label: tr('標準') },
              { value: 'wide', label: tr('加寬') },
            ]}
            onChange={(letterSpacing) => patch({ letterSpacing })}
          />
        </Stack>
      </Collapse>
    </Stack>
  )
}
