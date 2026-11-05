import { Icon } from './icons'
import { t as tr } from './i18n'
import { HelpLabel } from './HelpTip'
import { useState } from 'react'
import {
  Button,
  Checkbox,
  Collapse,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Tabs,
  TagsInput,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import type { Attribute, Cell, CellKind, FolderRow, Project } from '../shared/model'
import { isFieldKind, launchTemplates } from '../shared/explorer'
import { typeKinds } from './editorKinds'
import { FallbackFields } from './FallbackFields'
import { CellStyleEditor } from './CellStyleEditor'
import { EnumColors } from './EnumColors'
import { FallbackActions } from './FallbackActions'

type Binding = Project['fieldBindings'][number]
export type InspectorTab = 'content' | 'style' | 'condition'

// The right-hand settings: content, style and condition tabs for the selected cell, or the whole card when nothing
// is selected. State lives in Editor.
export type EditorInspectorProps = {
  selectedCell?: Cell
  draft: Project
  conditionField?: Binding
  preview?: FolderRow
  fieldSources: { attributeId: string; key: string; type: string }[]
  attributes: Attribute[]
  setFieldIds: (ids: string[], newSource?: string) => void
  enumOptions: string[]
  hasContent: boolean
  hints: Record<CellKind, string>
  labels: Record<CellKind, string>
  tab: InspectorTab
  setTab: (tab: InspectorTab) => void
  optionError: string
  setOptionError: (message: string) => void
  optionUsage: (option: string) => number
  change: (next: Project) => void
  updateCell: (update: Partial<Cell>) => void
  setRenaming: (value: { id: string; name: string }) => void
  // Shows a folder whose value comes from a fallback field of the selected component.
  findFallback: () => void
  canFindFallback: boolean
  // The whole card, for the summary shown when no component is selected.
  cells: Cell[]
  overflowing: string[]
  selectCell: (cellId: string) => void
}

export function EditorInspector(props: EditorInspectorProps) {
  const {
    selectedCell,
    draft,
    conditionField,
    preview,
    fieldSources,
    attributes,
    setFieldIds,
    enumOptions,
    hasContent,
    hints,
    labels,
    tab,
    setTab,
    optionError,
    setOptionError,
    optionUsage,
    change,
    updateCell,
    setRenaming,
    findFallback,
    canFindFallback,
    cells,
    overflowing,
    selectCell,
  } = props
  // Position and size are rarely typed in; they sit under "Advanced" in the style tab.
  const [advanced, setAdvanced] = useState(false)
  const cellName = (cell: Cell) => {
    const alias = draft.fieldBindings.find((f) => f.attributeId === cell.attributeId)?.alias
    return alias ? `${labels[cell.kind]} · ${alias}` : labels[cell.kind]
  }
  return (
    <aside className="editor-inspector" aria-label={tr('組件設定')}>
      {selectedCell ? (
        <Stack gap="sm">
          <div className="inspector-head">
            <h3>{labels[selectedCell.kind]}</h3>
            <Text size="xs" c="dimmed">
              {hints[selectedCell.kind]}
            </Text>
          </div>
          <Tabs
            value={tab}
            onChange={(value) => value && setTab(value as InspectorTab)}
            keepMounted={false}
            className="inspector-tabs"
          >
            <Tabs.List grow>
              <Tabs.Tab value="content">{tr('內容')}</Tabs.Tab>
              <Tabs.Tab value="style">{tr('樣式')}</Tabs.Tab>
              <Tabs.Tab
                value="condition"
                rightSection={
                  selectedCell.condition ? (
                    <span
                      className="inspector-tab-dot"
                      role="img"
                      aria-label={tr('已啟用')}
                      title={tr('已啟用')}
                    />
                  ) : undefined
                }
              >
                {tr('條件')}
              </Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="content" pt="sm">
              {hasContent ? (
                <Stack gap="sm">
                  {isFieldKind(selectedCell.kind) &&
                    ['field-text', 'field-tags'].includes(selectedCell.kind) && (
                      <SegmentedControl
                        aria-label={tr('顯示方式')}
                        value={selectedCell.kind}
                        data={[
                          { value: 'field-text', label: tr('文字') },
                          { value: 'field-tags', label: tr('標籤') },
                        ]}
                        onChange={(kind) =>
                          updateCell({
                            kind: kind as CellKind,
                            wrap: undefined,
                            tagColors: undefined,
                            tagPrefix: undefined,
                          })
                        }
                      />
                    )}
                  {isFieldKind(selectedCell.kind) && (
                    <FallbackFields
                      cell={selectedCell}
                      draft={draft}
                      preview={preview}
                      sources={fieldSources}
                      attributes={attributes}
                      setFieldIds={setFieldIds}
                      setRenaming={setRenaming}
                    />
                  )}
                  {!!selectedCell.fallbackIds?.length && (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      className="find-fallback"
                      disabled={!canFindFallback}
                      onClick={findFallback}
                    >
                      {tr('找使用備用欄位的資料夾')}
                    </Button>
                  )}
                  {(selectedCell.kind === 'static-text' || selectedCell.kind === 'field-url') && (
                    <Textarea
                      label={
                        selectedCell.kind === 'static-text'
                          ? tr('版面文字內容')
                          : tr('連結顯示文字')
                      }
                      value={selectedCell.text ?? ''}
                      maxLength={10000}
                      onChange={(event) => updateCell({ text: event.currentTarget.value })}
                    />
                  )}
                  {selectedCell.kind === 'system-info' && (
                    <Select
                      label={tr('系統資訊')}
                      allowDeselect={false}
                      value={selectedCell.systemInfo ?? 'category'}
                      data={[
                        { value: 'category', label: tr('分類') },
                        { value: 'files', label: tr('檔案數') },
                        { value: 'size', label: tr('容量') },
                      ]}
                      onChange={(value) => updateCell({ systemInfo: value as Cell['systemInfo'] })}
                    />
                  )}
                  {selectedCell.kind === 'field-enum' && (
                    <div>
                      <TagsInput
                        label={
                          <HelpLabel
                            label={tr('選項')}
                            help={tr('選項會成為資料夾設定中的下拉選單；使用中的選項不能移除。')}
                          />
                        }
                        error={optionError || undefined}
                        value={enumOptions}
                        onChange={(options) => {
                          const used = enumOptions.filter(
                            (option) => !options.includes(option) && optionUsage(option) > 0
                          )
                          if (used.length) {
                            setOptionError(
                              tr(
                                '「{0}」仍有 {1} 個資料夾使用，請先把這些資料夾改成其他值再移除。',
                                used[0],
                                optionUsage(used[0])
                              )
                            )
                            return
                          }
                          if (!options.length) {
                            setOptionError(tr('單選至少需要一個選項'))
                            return
                          }
                          setOptionError('')
                          change({
                            ...draft,
                            fieldBindings: draft.fieldBindings.map((field) =>
                              field.attributeId === selectedCell.attributeId
                                ? {
                                    ...field,
                                    options,
                                    // Colours of removed options go with them.
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
                        }}
                      />
                      {enumOptions.some((option) => optionUsage(option) > 0) && (
                        <Text size="xs" c="dimmed" mt={4}>
                          {tr(
                            '使用中：{0}',
                            enumOptions
                              .filter((option) => optionUsage(option) > 0)
                              .map((option) => `${option} × ${optionUsage(option)}`)
                              .join('、')
                          )}
                        </Text>
                      )}
                      <EnumColors
                        binding={draft.fieldBindings.find(
                          (field) => field.attributeId === selectedCell.attributeId
                        )}
                        options={enumOptions}
                        onChange={(optionColors) =>
                          change({
                            ...draft,
                            fieldBindings: draft.fieldBindings.map((field) => {
                              if (field.attributeId !== selectedCell.attributeId) return field
                              const { optionColors: _old, ...rest } = field
                              return optionColors ? { ...rest, optionColors } : rest
                            }),
                          })
                        }
                      />
                    </div>
                  )}
                  {['image', 'game-cover'].includes(selectedCell.kind) && (
                    <Select
                      label={tr('圖片填滿方式')}
                      allowDeselect={false}
                      value={
                        selectedCell.imageFit ??
                        (selectedCell.kind === 'game-cover' ? 'blur' : 'contain')
                      }
                      data={[
                        { value: 'blur', label: tr('完整顯示，空白處以模糊背景填滿') },
                        { value: 'cover', label: tr('填滿容器（裁切多餘部分）') },
                        { value: 'contain', label: tr('完整顯示（保留空白）') },
                      ]}
                      onChange={(value) => updateCell({ imageFit: value as Cell['imageFit'] })}
                    />
                  )}
                  {selectedCell.kind === 'game-launch' &&
                    (launchTemplates(draft).length ? (
                      <>
                        <Select
                          label={
                            <HelpLabel
                              label={tr('啟動動作')}
                              help={tr('卡片按鈕要啟動哪一個遊戲操作；未指定時用預設啟動遊戲。')}
                            />
                          }
                          placeholder={tr('自動（預設啟動遊戲）')}
                          clearable
                          value={selectedCell.actionId ?? null}
                          data={launchTemplates(draft).map((t) => ({
                            value: t.id,
                            label: t.id === 'default-launch-game' ? tr(t.label) : t.label,
                          }))}
                          onChange={(value) => updateCell({ actionId: value ?? undefined })}
                        />
                        <FallbackActions
                          cell={selectedCell}
                          draft={draft}
                          preview={preview}
                          updateCell={updateCell}
                        />
                      </>
                    ) : (
                      <Text size="sm" c="orange">
                        {tr('尚無可用的啟動動作，請先在遊戲操作新增。')}
                      </Text>
                    ))}
                  {selectedCell.kind === 'image' && (
                    <Stack gap="xs">
                      <HelpLabel
                        label={<Text size="sm">{tr('選用圖片')}</Text>}
                        help={tr(
                          '可新增多張；保存版面後，在資料夾設定的「圖片」頁分別選圖，沒有圖片可留空。'
                        )}
                      />
                      <Select
                        label={tr('沒有手動選圖時')}
                        allowDeselect={false}
                        value={selectedCell.imageIndex ? 'nth' : 'none'}
                        data={[
                          { value: 'none', label: tr('留空') },
                          { value: 'nth', label: tr('顯示資料夾內第 N 張圖片') },
                        ]}
                        onChange={(value) =>
                          updateCell({ imageIndex: value === 'nth' ? 1 : undefined })
                        }
                      />
                      {selectedCell.imageIndex && (
                        <NumberInput
                          label={
                            <HelpLabel
                              label={tr('第幾張圖片')}
                              help={tr(
                                '依檔名排序，只看這個資料夾直接包含的圖片（不含子資料夾）。資料夾已手動選圖時以手動為準；沒有那一張時留空。'
                              )}
                            />
                          }
                          min={1}
                          max={999}
                          allowDecimal={false}
                          clampBehavior="strict"
                          value={selectedCell.imageIndex}
                          onChange={(value) =>
                            typeof value === 'number' && updateCell({ imageIndex: value })
                          }
                        />
                      )}
                    </Stack>
                  )}
                  {['field-number', 'field-enum', 'field-boolean'].includes(selectedCell.kind) && (
                    <Select
                      label={tr('顯示方式')}
                      allowDeselect={false}
                      value={selectedCell.presentation ?? 'plain'}
                      data={[
                        { value: 'plain', label: tr('一般文字') },
                        ...(selectedCell.kind === 'field-number'
                          ? [
                              { value: 'rating', label: tr('評分') },
                              { value: 'progress', label: tr('進度') },
                            ]
                          : [{ value: 'badge', label: tr('狀態徽章') }]),
                      ]}
                      onChange={(value) =>
                        updateCell({
                          presentation:
                            value === 'plain' ? undefined : (value as Cell['presentation']),
                        })
                      }
                    />
                  )}
                  {selectedCell.kind === 'field-number' && selectedCell.presentation && (
                    <NumberInput
                      label={tr('滿分／總量')}
                      min={0.001}
                      max={1e9}
                      value={
                        selectedCell.maximum ?? (selectedCell.presentation === 'rating' ? 5 : 100)
                      }
                      onChange={(value) =>
                        typeof value === 'number' && value > 0 && updateCell({ maximum: value })
                      }
                    />
                  )}
                  {selectedCell.kind === 'field-number' && (
                    <NumberInput
                      label={<HelpLabel label={tr('小數位數')} help={tr('留空則依數值原樣顯示')} />}
                      min={0}
                      max={6}
                      allowDecimal={false}
                      value={selectedCell.decimals ?? ''}
                      onChange={(value) =>
                        updateCell({
                          decimals: typeof value === 'number' ? value : undefined,
                        })
                      }
                    />
                  )}
                  {selectedCell.kind === 'field-number' && !selectedCell.presentation && (
                    <div>
                      <TextInput
                        label={<HelpLabel label={tr('單位文字')} help={tr('例如：分、集、%、$')} />}
                        maxLength={20}
                        value={selectedCell.unit ?? ''}
                        onChange={(event) =>
                          updateCell({ unit: event.currentTarget.value || undefined })
                        }
                      />
                      {selectedCell.unit && (
                        <SegmentedControl
                          mt="xs"
                          size="xs"
                          fullWidth
                          aria-label={tr('單位位置')}
                          value={selectedCell.unitPosition ?? 'suffix'}
                          data={[
                            { value: 'prefix', label: tr('數字前') },
                            { value: 'suffix', label: tr('數字後') },
                          ]}
                          onChange={(value) =>
                            updateCell({
                              unitPosition: value === 'suffix' ? undefined : 'prefix',
                            })
                          }
                        />
                      )}
                    </div>
                  )}
                  {isFieldKind(selectedCell.kind) && (
                    <Checkbox
                      label={tr('顯示複製按鈕')}
                      checked={selectedCell.copyValue ?? false}
                      onChange={(event) => updateCell({ copyValue: event.currentTarget.checked })}
                    />
                  )}
                </Stack>
              ) : (
                <Text size="xs" c="dimmed">
                  {tr('這個組件沒有內容設定，可到「樣式」調整外觀。')}
                </Text>
              )}
            </Tabs.Panel>
            <Tabs.Panel value="condition" pt="sm">
              <Stack gap="sm">
                <Select
                  label={
                    <HelpLabel
                      label={tr('顯示條件欄位')}
                      help={tr('只在所選欄位符合條件時顯示這個組件；不符合時保留空位。')}
                    />
                  }
                  placeholder={tr('一律顯示')}
                  clearable
                  value={selectedCell.condition?.attributeId ?? null}
                  data={draft.fieldBindings
                    .filter((field) => Object.hasOwn(typeKinds, field.type))
                    .map((field) => ({ value: field.attributeId, label: field.alias }))}
                  onChange={(attributeId) =>
                    updateCell({
                      condition: attributeId ? { attributeId, operator: 'set' } : undefined,
                    })
                  }
                />
                {selectedCell.condition && (
                  <>
                    <Select
                      label={tr('顯示條件')}
                      allowDeselect={false}
                      value={selectedCell.condition.operator}
                      data={[
                        { value: 'set', label: tr('已有值') },
                        { value: 'unset', label: tr('未填') },
                        ...(conditionField?.type === 'tags'
                          ? []
                          : [
                              { value: 'equals', label: tr('等於') },
                              { value: 'not-equals', label: tr('不等於') },
                            ]),
                        ...(['number', 'date', 'datetime'].includes(conditionField?.type ?? '')
                          ? [
                              { value: 'gt', label: tr('大於') },
                              { value: 'lt', label: tr('小於') },
                            ]
                          : []),
                      ]}
                      onChange={(operator) => {
                        if (!operator) return
                        const condition = {
                          ...selectedCell.condition!,
                          operator: operator as NonNullable<Cell['condition']>['operator'],
                        }
                        if (operator === 'set' || operator === 'unset') delete condition.value
                        else
                          condition.value =
                            conditionField?.type === 'boolean'
                              ? false
                              : conditionField?.type === 'number'
                                ? 0
                                : conditionField?.type === 'enum'
                                  ? (conditionField.options?.[0] ?? '')
                                  : ''
                        updateCell({ condition })
                      }}
                    />
                    {['equals', 'not-equals', 'gt', 'lt'].includes(
                      selectedCell.condition.operator
                    ) &&
                      (conditionField?.type === 'boolean' ? (
                        <Select
                          label={tr('比較值')}
                          allowDeselect={false}
                          value={String(selectedCell.condition.value)}
                          data={[
                            { value: 'true', label: tr('是') },
                            { value: 'false', label: tr('否') },
                          ]}
                          onChange={(value) =>
                            value &&
                            updateCell({
                              condition: {
                                ...selectedCell.condition!,
                                value: value === 'true',
                              },
                            })
                          }
                        />
                      ) : conditionField?.type === 'enum' ? (
                        <Select
                          label={tr('比較值')}
                          allowDeselect={false}
                          value={String(selectedCell.condition.value ?? '')}
                          data={(conditionField.options ?? []).map((option) => ({
                            value: option,
                            label: option,
                          }))}
                          onChange={(value) =>
                            value &&
                            updateCell({ condition: { ...selectedCell.condition!, value } })
                          }
                        />
                      ) : conditionField?.type === 'number' ? (
                        <NumberInput
                          label={tr('比較值')}
                          value={selectedCell.condition.value as number}
                          onChange={(value) =>
                            typeof value === 'number' &&
                            updateCell({ condition: { ...selectedCell.condition!, value } })
                          }
                        />
                      ) : (
                        <TextInput
                          label={tr('比較值')}
                          value={String(selectedCell.condition.value ?? '')}
                          maxLength={10000}
                          type={
                            conditionField?.type === 'date'
                              ? 'date'
                              : conditionField?.type === 'datetime'
                                ? 'datetime-local'
                                : conditionField?.type === 'url'
                                  ? 'url'
                                  : 'text'
                          }
                          onChange={(event) =>
                            updateCell({
                              condition: {
                                ...selectedCell.condition!,
                                value: event.currentTarget.value,
                              },
                            })
                          }
                        />
                      ))}
                  </>
                )}
              </Stack>
            </Tabs.Panel>
            <Tabs.Panel value="style" pt="sm">
              <CellStyleEditor
                key={selectedCell.cellId}
                cell={selectedCell}
                updateCell={updateCell}
                saved={draft.stylePresets}
                onSaved={(stylePresets) =>
                  change({
                    ...draft,
                    stylePresets: stylePresets.length ? stylePresets : undefined,
                  })
                }
                extra={
                  <>
                    {['field-text', 'field-tags', 'static-text'].includes(selectedCell.kind) && (
                      <Checkbox
                        label={
                          <HelpLabel
                            label={tr('內容多時可捲動')}
                            help={tr('保持組件高度，超出的內容用捲動查看，不會被截掉')}
                          />
                        }
                        checked={selectedCell.scroll ?? false}
                        onChange={(event) =>
                          updateCell({ scroll: event.currentTarget.checked || undefined })
                        }
                      />
                    )}
                    {['name', 'path', 'field-text'].includes(selectedCell.kind) && (
                      <Checkbox
                        label={
                          <HelpLabel
                            label={tr('長文字換行顯示')}
                            help={
                              selectedCell.scroll
                                ? tr('可捲動時一律換行顯示')
                                : tr('關閉時只顯示一行，過長的部分以「…」截斷')
                            }
                          />
                        }
                        disabled={!!selectedCell.scroll}
                        checked={selectedCell.wrap ?? !!selectedCell.scroll}
                        onChange={(event) =>
                          updateCell({ wrap: event.currentTarget.checked || undefined })
                        }
                      />
                    )}
                  </>
                }
              />
              <Button
                mt="sm"
                fullWidth
                size="xs"
                variant="subtle"
                justify="space-between"
                aria-expanded={advanced}
                rightSection={<Icon name={advanced ? 'minus' : 'plus'} size={12} />}
                onClick={() => setAdvanced(!advanced)}
              >
                {tr('進階：位置與大小')}
              </Button>
              <Collapse in={advanced}>
                <div className="coordinates">
                  {(['x', 'y', 'w', 'h'] as const).map((key) => (
                    <NumberInput
                      key={key}
                      label={
                        {
                          x: tr('水平位置 X'),
                          y: tr('垂直位置 Y'),
                          w: tr('寬度'),
                          h: tr('高度'),
                        }[key]
                      }
                      min={key === 'w' || key === 'h' ? 1 : 0}
                      max={
                        key === 'x'
                          ? 12 - selectedCell.grid.w
                          : key === 'w'
                            ? 12 - selectedCell.grid.x
                            : 100
                      }
                      value={selectedCell.grid[key]}
                      onChange={(v) =>
                        typeof v === 'number' &&
                        updateCell({ grid: { ...selectedCell.grid, [key]: v } })
                      }
                    />
                  ))}
                </div>
              </Collapse>
            </Tabs.Panel>
          </Tabs>
        </Stack>
      ) : (
        <Stack gap={8} className="inspector-empty">
          <h3>{tr('整張卡片')}</h3>
          <Text size="sm">{tr('{0} 個組件', cells.length)}</Text>
          {overflowing.length > 0 ? (
            <div>
              <Text size="xs" c="dimmed" mb={4}>
                {tr('在預覽中被截掉的組件（點一下選取並處理）：')}
              </Text>
              <Stack gap={2}>
                {cells
                  .filter((cell) => overflowing.includes(cell.cellId))
                  .map((cell) => (
                    <Button
                      key={cell.cellId}
                      size="compact-xs"
                      variant="subtle"
                      color="orange"
                      justify="flex-start"
                      onClick={() => selectCell(cell.cellId)}
                    >
                      {cellName(cell)}
                    </Button>
                  ))}
              </Stack>
            </div>
          ) : (
            cells.length > 0 && (
              <Text size="xs" c="dimmed">
                {tr('預覽中沒有內容被截掉')}
              </Text>
            )
          )}
          <Text size="xs" c="dimmed">
            {tr('點選畫布上的組件，就能在這裡調整內容、樣式與條件。')}
          </Text>
          <Text size="xs" c="dimmed">
            {tr('拖曳移動、拉邊角縮放；Delete 移除、Ctrl+D 複製。')}
          </Text>
          <Text size="xs" c="dimmed">
            {tr('要加入新組件或欄位，請從左側拖入畫布，或直接點選。')}
          </Text>
        </Stack>
      )}
    </aside>
  )
}
