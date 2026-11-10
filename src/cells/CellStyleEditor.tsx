import { useState, type ReactNode } from 'react'
import {
  ActionIcon,
  Button,
  Collapse,
  ColorInput,
  Group,
  Menu,
  Popover,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { Icon } from '../common/icons'
import { t as tr } from '../i18n'
import type { Cell, Project } from '../../shared/model'

type Style = Cell['style']
// The two groups of the Style tab (R-233). Colours are always set, so they only count as changed when the background
// is not transparent.
const textKeys: (keyof Style)[] = [
  'fontSize',
  'weight',
  'italic',
  'underline',
  'strike',
  'align',
  'valign',
  'lineHeight',
  'letterSpacing',
]
const boxKeys: (keyof Style)[] = ['padding', 'radius', 'borderColor', 'borderWidth', 'opacity']
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
// A titled group that folds; when folded its title names what was changed, and a changed group can be reset.
function Section({
  title,
  open,
  toggle,
  changed,
  summary,
  reset,
  children,
}: {
  title: string
  open: boolean
  toggle: () => void
  changed: boolean
  summary: string
  reset: () => void
  children: ReactNode
}) {
  return (
    <section className="style-section">
      <div className="style-section-head">
        <Button
          variant="subtle"
          size="compact-sm"
          color="gray"
          className="style-section-toggle"
          aria-expanded={open}
          leftSection={<Icon name={open ? 'chevron-down' : 'chevron-right'} size={12} />}
          onClick={toggle}
        >
          {title}
        </Button>
        {changed && (
          <span
            className="style-changed"
            role="img"
            aria-label={tr('已調整')}
            title={tr('已調整')}
          />
        )}
        {!open && summary && (
          <Text size="xs" c="dimmed" className="style-section-summary">
            {summary}
          </Text>
        )}
        {changed && (
          <Tooltip label={tr('重設{0}', title)}>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              className="style-section-reset"
              aria-label={tr('重設{0}', title)}
              onClick={reset}
            >
              <Icon name="undo" size={12} />
            </ActionIcon>
          </Tooltip>
        )}
      </div>
      <Collapse in={open}>
        <Stack gap="sm" pt={4}>
          {children}
        </Stack>
      </Collapse>
    </section>
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

// The Style tab: a preset menu, then Text (open) and Box (folded, its title naming what changed). Changed groups show a
// dot and can be reset; position and size follow in the inspector (R-233).
export function CellStyleEditor({
  cell,
  updateCell,
  extra,
  saved = [],
  onSaved,
}: {
  cell: Cell
  updateCell: (update: Partial<Cell>) => void
  extra?: ReactNode
  // This project's own named styles; changing them edits the layout draft, saved with the layout.
  saved?: NonNullable<Project['stylePresets']>
  onSaved?: (presets: NonNullable<Project['stylePresets']>) => void
}) {
  const [naming, setNaming] = useState(false),
    [name, setName] = useState('')
  const trimmed = name.trim(),
    duplicate = saved.some((p) => p.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase())
  const saveCurrent = () => {
    if (!onSaved || !trimmed || duplicate || saved.length >= 20) return
    onSaved([
      ...saved,
      { id: crypto.randomUUID(), name: trimmed, style: structuredClone(cell.style) },
    ])
    setName('')
    setNaming(false)
  }
  const style = cell.style
  const transparent = style.backgroundColor === 'transparent'
  const textChanged = textKeys.some((key) => style[key] !== undefined),
    boxChanged = !transparent || boxKeys.some((key) => style[key] !== undefined)
  const [textOpen, setTextOpen] = useState(true),
    [boxOpen, setBoxOpen] = useState(false)
  const patch = (changes: Partial<Style>) => {
    const next = { ...style, ...changes }
    for (const key of Object.keys(next) as (keyof Style)[])
      if (next[key] === undefined) delete next[key]
    updateCell({ style: next })
  }
  const without = (keys: (keyof Style)[], extraChanges: Partial<Style> = {}) => {
    const next: Style = { ...style, ...extraChanges }
    for (const key of keys) delete next[key]
    updateCell({ style: next })
  }
  const toggles: { key: 'italic' | 'underline' | 'strike'; label: string; glyph: ReactNode }[] = [
    { key: 'italic', label: tr('斜體'), glyph: <i>I</i> },
    { key: 'underline', label: tr('底線'), glyph: <u>U</u> },
    { key: 'strike', label: tr('刪除線'), glyph: <s>S</s> },
  ]
  const boxSummary = [
    !transparent && tr('背景'),
    style.borderWidth && tr('邊框'),
    style.radius && tr('圓角'),
    style.padding && tr('內距'),
    style.opacity && tr('透明度'),
  ]
    .filter(Boolean)
    .join(tr('、'))
  const textSummary = [
    style.fontSize && tr('字級'),
    (style.weight || style.italic || style.underline || style.strike) && tr('粗細'),
    (style.align || style.valign) && tr('對齊'),
    (style.lineHeight || style.letterSpacing) && tr('行距'),
  ]
    .filter(Boolean)
    .join(tr('、'))
  return (
    <Stack gap="sm">
      <Popover opened={naming} onChange={setNaming} position="bottom-start" withinPortal trapFocus>
        <Popover.Target>
          <Group gap={4} wrap="nowrap">
            <Select
              size="xs"
              style={{ flex: 1 }}
              aria-label={tr('套用預設樣式')}
              placeholder={tr('套用預設樣式…')}
              value={null}
              data={[
                {
                  group: tr('內建'),
                  items: [
                    { value: 'title', label: tr('標題') },
                    { value: 'note', label: tr('次要說明') },
                    { value: 'highlight', label: tr('強調') },
                  ],
                },
                ...(saved.length
                  ? [
                      {
                        group: tr('此專案的樣式'),
                        items: saved.map((p) => ({ value: 'saved:' + p.id, label: p.name })),
                      },
                    ]
                  : []),
              ]}
              onChange={(value) => {
                if (!value) return
                // A saved style replaces the whole look, colours included.
                const own = saved.find((p) => 'saved:' + p.id === value)
                if (own) {
                  updateCell({ style: structuredClone(own.style) })
                  return
                }
                const { textColor, backgroundColor } = style
                updateCell({ style: { textColor, backgroundColor, ...presets[value] } })
              }}
            />
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Tooltip label={tr('樣式操作')} openDelay={300}>
                  <ActionIcon variant="subtle" color="gray" aria-label={tr('樣式操作')}>
                    <Icon name="more" size={14} />
                  </ActionIcon>
                </Tooltip>
              </Menu.Target>
              <Menu.Dropdown>
                {onSaved && (
                  <Menu.Item
                    disabled={saved.length >= 20}
                    title={saved.length >= 20 ? tr('最多 20 個自訂樣式') : undefined}
                    onClick={() => setNaming(true)}
                  >
                    {tr('存成樣式…')}
                  </Menu.Item>
                )}
                {onSaved && saved.length > 0 && (
                  <Menu.Sub>
                    <Menu.Sub.Target>
                      <Menu.Sub.Item>{tr('刪除樣式')}</Menu.Sub.Item>
                    </Menu.Sub.Target>
                    <Menu.Sub.Dropdown>
                      {saved.map((p) => (
                        <Menu.Item
                          key={p.id}
                          color="red"
                          onClick={() => onSaved(saved.filter((other) => other.id !== p.id))}
                        >
                          {p.name}
                        </Menu.Item>
                      ))}
                    </Menu.Sub.Dropdown>
                  </Menu.Sub>
                )}
                <Menu.Item
                  onClick={() =>
                    updateCell({
                      style: { textColor: style.textColor, backgroundColor: style.backgroundColor },
                    })
                  }
                >
                  {tr('清除樣式（保留顏色）')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="xs" w={220}>
            <TextInput
              size="xs"
              label={tr('樣式名稱')}
              maxLength={40}
              value={name}
              error={duplicate ? tr('已有同名的樣式') : undefined}
              onChange={(event) => setName(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  saveCurrent()
                }
              }}
            />
            <Text size="xs" c="dimmed">
              {tr('只存在這個專案，套用時會取代組件的整個樣式。')}
            </Text>
            <Button size="xs" disabled={!trimmed || duplicate} onClick={saveCurrent}>
              {tr('儲存樣式')}
            </Button>
          </Stack>
        </Popover.Dropdown>
      </Popover>
      <Section
        title={tr('文字')}
        open={textOpen}
        toggle={() => setTextOpen(!textOpen)}
        changed={textChanged}
        summary={textSummary}
        reset={() => without(textKeys)}
      >
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
        <Row label={tr('粗細')}>
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
        <Row label={tr('對齊')}>
          <Group gap={6} wrap="nowrap">
            <SegmentedControl
              size="xs"
              style={{ flex: 1 }}
              aria-label={tr('對齊')}
              value={style.align ?? 'default'}
              data={[
                { value: 'default', label: tr('左') },
                { value: 'center', label: tr('中') },
                { value: 'right', label: tr('右') },
              ]}
              onChange={(value) =>
                patch({ align: value === 'default' ? undefined : (value as Style['align']) })
              }
            />
            <SegmentedControl
              size="xs"
              style={{ flex: 1 }}
              aria-label={tr('垂直對齊')}
              value={style.valign ?? 'default'}
              data={[
                { value: 'top', label: tr('上') },
                { value: 'default', label: tr('中') },
                { value: 'bottom', label: tr('下') },
              ]}
              onChange={(value) =>
                patch({ valign: value === 'default' ? undefined : (value as Style['valign']) })
              }
            />
          </Group>
        </Row>
        <ColorInput
          label={tr('文字顏色')}
          format="hex"
          value={style.textColor}
          onChange={(v) => /^#[0-9a-f]{6}$/i.test(v) && patch({ textColor: v })}
        />
        <Group gap={6} grow wrap="nowrap" align="flex-start">
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
        </Group>
        {extra}
      </Section>
      <Section
        title={tr('外框')}
        open={boxOpen}
        toggle={() => setBoxOpen(!boxOpen)}
        changed={boxChanged}
        summary={boxSummary}
        reset={() => without(boxKeys, { backgroundColor: 'transparent' })}
      >
        <Row label={tr('背景顏色')}>
          <Group gap={6} wrap="nowrap">
            <Button
              size="xs"
              variant={transparent ? 'filled' : 'default'}
              aria-pressed={transparent}
              onClick={() => patch({ backgroundColor: 'transparent' })}
            >
              {tr('無')}
            </Button>
            <ColorInput
              style={{ flex: 1 }}
              aria-label={tr('背景顏色')}
              format="hex"
              placeholder={tr('選擇顏色')}
              value={transparent ? '' : style.backgroundColor}
              onChange={(v) => /^#[0-9a-f]{6}$/i.test(v) && patch({ backgroundColor: v })}
            />
          </Group>
        </Row>
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
          label={tr('透明度')}
          value={style.opacity}
          options={[
            { value: 'default', label: tr('不透明') },
            { value: 'soft', label: tr('柔和') },
            { value: 'faint', label: tr('淡') },
          ]}
          onChange={(opacity) => patch({ opacity })}
        />
      </Section>
    </Stack>
  )
}
