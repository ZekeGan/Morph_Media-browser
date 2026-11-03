import './media-workspace.css'
import { t as tr } from './i18n'
import { Icon } from './icons'
import {
  ActionIcon,
  Button,
  Checkbox,
  Menu,
  NumberInput,
  Popover,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { cardPresets } from '../shared/layouts'
import { cardDisplay } from '../shared/browse'
import { type FolderRow, type Project } from '../shared/model'
import type { BrowseMode, BrowseState } from '../shared/explorer'
type Props = {
  boundariesOnly: boolean
  browse: BrowseState
  busy: boolean
  cardSaveError: string
  changedCard: () => void
  columnQuery: string
  currentFolder?: FolderRow
  deepest: number
  density: { itemsPerRow: number | string; pageSize: number | string }
  detail?: FolderRow
  display: ReturnType<typeof cardDisplay>
  edit: (category?: string) => void
  folderMode: boolean
  hasGames: boolean
  openConfig: (id: string, tab?: string) => void
  orderedColumns: { id: string; label: string }[]
  persist: (next: BrowseState) => void
  pickPreset: (id: string) => void
  presets: ReturnType<typeof cardPresets>
  project: Project
  ready: boolean
  setBoundariesOnly: (value: boolean) => void
  setColumnQuery: (value: string) => void
  setDensity: (value: { itemsPerRow: number | string; pageSize: number | string }) => void
  setDisplay: (value: ReturnType<typeof cardDisplay>) => void
  setFilePreview: (value: undefined) => void
  setOverviewTools: (element: HTMLDivElement | null) => void
  setPage: (page: number) => void
  state: { current: BrowseState }
  switchMode: (mode: BrowseMode) => Promise<void>
}

// The folder-mode toolbar (view mode, presets, filters, tools) and the CARD display controls under it.
export function BrowseToolbar(props: Props) {
  const {
    boundariesOnly,
    browse,
    busy,
    cardSaveError,
    changedCard,
    columnQuery,
    currentFolder,
    deepest,
    density,
    detail,
    display,
    edit,
    folderMode,
    hasGames,
    openConfig,
    orderedColumns,
    persist,
    pickPreset,
    presets,
    project,
    ready,
    setBoundariesOnly,
    setColumnQuery,
    setDensity,
    setDisplay,
    setFilePreview,
    setOverviewTools,
    setPage,
    state,
    switchMode,
  } = props
  return (
    <>
      <div className={'workspace-toolbar' + (folderMode ? '' : ' file-mode-toolbar')}>
        <div className="toolbar-left">
          <SegmentedControl
            aria-label={tr('展示內容')}
            size="xs"
            value={browse.contentMode ?? 'folders'}
            disabled={busy || !ready}
            data={[
              { value: 'folders', label: tr('資料夾') },
              { value: 'files', label: tr('檔案') },
            ]}
            onChange={(value) => {
              setFilePreview(undefined)
              persist({
                ...state.current,
                contentMode: value as 'folders' | 'files',
                fileRootId: detail?.rowId ?? currentFolder?.rowId,
                filePresentation: state.current.filePresentation ?? 'tiles',
                fileScope: state.current.fileScope ?? 'descendants',
              })
            }}
          />
          {folderMode && browse.mode === 'CARD' && (
            <>
              <div className="preset-controls">
                <Select
                  aria-label={tr('版面方案')}
                  size="xs"
                  value={project.activeLayoutId ?? presets[0].id}
                  allowDeselect={false}
                  data={presets.map((p) => ({
                    value: p.id,
                    label: p.id === 'default' && p.name === '預設版面' ? tr('預設版面') : p.name,
                  }))}
                  disabled={busy}
                  onChange={(id) => id && pickPreset(id)}
                />
                <Button
                  size="xs"
                  variant="default"
                  leftSection={<Icon name="edit" />}
                  disabled={busy}
                  onClick={() => edit()}
                >
                  {tr('編輯版面')}
                </Button>
              </div>
              <Menu>
                <Menu.Target>
                  <ActionIcon
                    className="compact-presets"
                    aria-label={tr('版面方案選單')}
                    variant="subtle"
                  >
                    <Icon name="grid" />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {presets.map((p) => (
                    <Menu.Item key={p.id} onClick={() => pickPreset(p.id)}>
                      {p.id === 'default' && p.name === '預設版面' ? tr('預設版面') : p.name}
                    </Menu.Item>
                  ))}
                  <Menu.Divider />
                  <Menu.Item onClick={() => edit()}>{tr('編輯版面')}</Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </>
          )}
          {folderMode && hasGames && browse.mode !== 'TREE' && (
            <>
              <Select
                className="game-boundary-filter"
                size="xs"
                aria-label={tr('遊戲資料夾篩選')}
                allowDeselect={false}
                value={boundariesOnly ? 'boundaries' : 'all'}
                data={[
                  { value: 'all', label: tr('全部資料夾') },
                  { value: 'boundaries', label: tr('邊界的資料夾') },
                ]}
                onChange={(value) => {
                  setBoundariesOnly(value === 'boundaries')
                  setPage(1)
                }}
              />
              {/* Narrow toolbars swap the select for an icon menu so tools never overlap. */}
              <Menu>
                <Menu.Target>
                  <ActionIcon
                    className="compact-boundary"
                    aria-label={tr('遊戲資料夾篩選')}
                    variant={boundariesOnly ? 'light' : 'subtle'}
                  >
                    <Icon name="sliders" />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {(
                    [
                      [false, '全部資料夾'],
                      [true, '邊界的資料夾'],
                    ] as const
                  ).map(([only, label]) => (
                    <Menu.Item
                      key={label}
                      leftSection={boundariesOnly === only ? <Icon name="check" /> : null}
                      onClick={() => {
                        setBoundariesOnly(only)
                        setPage(1)
                      }}
                    >
                      {tr(label)}
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            </>
          )}
        </div>
        <SegmentedControl
          style={{ display: folderMode ? undefined : 'none' }}
          className="center-mode"
          aria-label={tr('瀏覽模式')}
          size="xs"
          value={browse.mode}
          data={(['CARD', 'TABLE', 'TREE'] as const).map((mode) => ({
            value: mode,
            label: (
              <>
                <Icon
                  name={mode === 'CARD' ? 'grid' : mode === 'TABLE' ? 'list' : 'tree'}
                  size={14}
                />
                {mode === 'CARD' ? tr('卡片') : mode === 'TABLE' ? tr('表格') : tr('樹狀圖')}
              </>
            ),
          }))}
          disabled={busy || !ready}
          onChange={(mode) => void switchMode(mode as BrowseMode)}
        />
        <div
          ref={setOverviewTools}
          className="workspace-file-tools"
          style={{ display: folderMode ? 'none' : undefined }}
        />
        <div className="toolbar-right">
          {folderMode && browse.mode === 'CARD' && (
            <Popover position="bottom-end" withArrow shadow="md" width={260}>
              <Popover.Target>
                <Button
                  className="card-display-button"
                  size="compact-sm"
                  variant="default"
                  aria-label={tr('卡片顯示設定')}
                  leftSection={<Icon name="sliders" size={14} />}
                >
                  <span className="card-display-summary">
                    {(display.mode === 'multi' ? tr('多層') : tr('單層')) +
                      ' · ' +
                      (display.level === 'all'
                        ? tr('全部')
                        : tr('第 ') + display.level + tr(' 層')) +
                      ' · ' +
                      tr('每列 {0}', density.itemsPerRow)}
                  </span>
                </Button>
              </Popover.Target>
              <Popover.Dropdown>
                <div className="card-inline-controls">
                  <div>
                    <Text size="xs" c="dimmed" mb={4}>
                      {tr('層級顯示')}
                    </Text>
                    <SegmentedControl
                      size="xs"
                      fullWidth
                      aria-label={tr('層級顯示')}
                      value={display.mode}
                      data={[
                        { value: 'multi', label: tr('多層') },
                        { value: 'single', label: tr('單層') },
                      ]}
                      onChange={(mode) => {
                        setDisplay({
                          mode: mode as 'multi' | 'single',
                          level: mode === 'single' && display.level === 'all' ? 1 : display.level,
                        })
                        changedCard()
                      }}
                    />
                  </div>
                  <Select
                    size="xs"
                    label={tr('顯示層數')}
                    aria-label={tr('顯示層數')}
                    value={String(display.level)}
                    allowDeselect={false}
                    data={[
                      ...(display.mode === 'multi' ? [{ value: 'all', label: tr('全部') }] : []),
                      ...Array.from({ length: deepest }, (_, index) => ({
                        value: String(index + 1),
                        label: tr('第 ') + (index + 1) + tr(' 層'),
                      })),
                    ]}
                    onChange={(value) => {
                      if (value) {
                        setDisplay({ ...display, level: value === 'all' ? 'all' : Number(value) })
                        changedCard()
                      }
                    }}
                  />
                  <NumberInput
                    size="xs"
                    label={tr('每列卡片數')}
                    min={1}
                    max={6}
                    allowDecimal={false}
                    value={density.itemsPerRow}
                    onChange={(value) => {
                      setDensity({ ...density, itemsPerRow: value })
                      changedCard()
                    }}
                  />
                  <NumberInput
                    size="xs"
                    label={tr('每頁筆數')}
                    min={1}
                    max={500}
                    allowDecimal={false}
                    value={density.pageSize}
                    onChange={(value) => {
                      setDensity({ ...density, pageSize: value })
                      changedCard()
                    }}
                  />
                  {cardSaveError && (
                    <Button size="compact-xs" color="red" variant="subtle" onClick={changedCard}>
                      {cardSaveError}
                    </Button>
                  )}
                </div>
              </Popover.Dropdown>
            </Popover>
          )}
          {folderMode && browse.mode === 'TABLE' && (
            <Menu closeOnItemClick={false}>
              <Menu.Target>
                <ActionIcon variant="subtle" aria-label={tr('選擇表格欄位')}>
                  <Icon name="list" />
                </ActionIcon>
              </Menu.Target>
              <Menu.Dropdown>
                <TextInput
                  placeholder={tr('搜尋欄位')}
                  aria-label={tr('搜尋欄位')}
                  value={columnQuery}
                  onChange={(event) => setColumnQuery(event.currentTarget.value)}
                />
                <Stack gap="xs" p="xs" style={{ maxHeight: 'min(48vh,320px)', overflowY: 'auto' }}>
                  {orderedColumns
                    .filter((column) =>
                      column.label.toLocaleLowerCase().includes(columnQuery.toLocaleLowerCase())
                    )
                    .map((column) => (
                      <Checkbox
                        key={column.id}
                        label={column.label}
                        disabled={column.id === 'name' || busy}
                        checked={column.id === 'name' || !browse.hiddenColumns?.includes(column.id)}
                        onChange={(event) =>
                          persist({
                            ...state.current,
                            hiddenColumns: event.currentTarget.checked
                              ? (state.current.hiddenColumns ?? []).filter((id) => id !== column.id)
                              : [...new Set([...(state.current.hiddenColumns ?? []), column.id])],
                          })
                        }
                      />
                    ))}
                </Stack>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => persist({ ...state.current, hiddenColumns: [] })}
                >
                  {tr('恢復預設')}
                </Button>
              </Menu.Dropdown>
            </Menu>
          )}
          <Tooltip label={tr('目前資料夾設定')}>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label={tr('目前資料夾設定')}
              disabled={!currentFolder || busy}
              onClick={() => currentFolder && openConfig(currentFolder.rowId)}
            >
              <Icon name="folder-settings" />
            </ActionIcon>
          </Tooltip>
        </div>
      </div>
    </>
  )
}
