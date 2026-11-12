import '../media/media-workspace.css'
import { setKindBadgeVisible, useKindBadgeVisible } from './folderKind'
import { t as tr } from '../i18n'
import { Icon } from '../common/icons'
import { iconLabel } from '../common/IconLabel'
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
  Switch,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core'
import { cardPresets } from '../../shared/layouts'
import { cardDisplay } from '../../shared/browse'
import { type FolderRow, type Project } from '../../shared/model'
import type { BrowseMode, BrowseState } from '../../shared/explorer'
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
  display: ReturnType<typeof cardDisplay>
  edit: (category?: string) => void
  folderMode: boolean
  switchContent: (value: 'folders' | 'files') => void
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
  setOverviewTools: (element: HTMLDivElement | null) => void
  setOverviewScope: (element: HTMLDivElement | null) => void
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
    display,
    edit,
    folderMode,
    switchContent,
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
    setOverviewTools,
    setOverviewScope,
    setPage,
    state,
    switchMode,
  } = props
  const kindBadge = useKindBadgeVisible()
  return (
    <>
      <div className={'workspace-toolbar' + (folderMode ? '' : ' file-mode-toolbar')}>
        <div className="toolbar-left">
          <SegmentedControl
            className="content-switch"
            aria-label={tr('展示內容')}
            size="xs"
            value={browse.contentMode ?? 'folders'}
            disabled={busy || !ready}
            data={[
              {
                value: 'folders',
                label: (
                  <span className="content-switch-label">
                    <Icon name="folder" size={15} />
                    {tr('資料夾')}
                  </span>
                ),
              },
              {
                value: 'files',
                label: (
                  <span className="content-switch-label">
                    <Icon name="file" size={15} />
                    {tr('檔案')}
                  </span>
                ),
              },
            ]}
            onChange={(value) => switchContent(value as 'folders' | 'files')}
          />
          {folderMode && (
            <SegmentedControl
              className="center-mode"
              aria-label={tr('瀏覽模式')}
              size="xs"
              value={browse.mode}
              data={(['CARD', 'TABLE', 'TREE'] as const).map((mode) => ({
                value: mode,
                label: iconLabel(
                  mode === 'CARD' ? 'grid' : mode === 'TABLE' ? 'list' : 'tree',
                  mode === 'CARD' ? tr('卡片') : mode === 'TABLE' ? tr('表格') : tr('樹狀圖')
                ),
              }))}
              disabled={busy || !ready}
              onChange={(mode) => void switchMode(mode as BrowseMode)}
            />
          )}
          <div
            ref={setOverviewTools}
            className="workspace-file-tools"
            style={{ display: folderMode ? 'none' : undefined }}
          />
          {folderMode && browse.mode === 'CARD' && (
            <>
              <div className="preset-controls">
                <Select
                  aria-label={tr('卡片外觀')}
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
                <Tooltip label={tr('編輯版面')} openDelay={350} withArrow>
                  <ActionIcon
                    variant="default"
                    aria-label={tr('編輯版面')}
                    disabled={busy}
                    onClick={() => edit()}
                  >
                    <Icon name="layout" size={16} />
                  </ActionIcon>
                </Tooltip>
              </div>
              <Menu>
                <Menu.Target>
                  <ActionIcon
                    className="compact-presets"
                    aria-label={tr('卡片外觀選單')}
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
        <div className="toolbar-right">
          <div
            ref={setOverviewScope}
            className="workspace-file-scope"
            style={{ display: folderMode ? 'none' : undefined }}
          />
          {folderMode && browse.mode === 'CARD' && (
            // R-331: a fade, not the default scale, so the switch inside measures its real size when it opens.
            <Popover
              position="bottom-end"
              withArrow
              shadow="md"
              width={260}
              transitionProps={{ transition: 'fade' }}
            >
              <Popover.Target>
                <Button
                  className="card-display-button scope-button"
                  size="xs"
                  variant="default"
                  aria-label={tr('卡片顯示設定')}
                  leftSection={<Icon name="sliders" size={14} />}
                >
                  <span className="card-display-summary">
                    {display.works
                      ? tr('所有作品') +
                        (display.level === 'all' ? '' : ' · ' + tr('最多 {0} 層', display.level))
                      : tr('逐層瀏覽')}
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
                      value={display.works ? 'works' : 'step'}
                      data={[
                        { value: 'step', label: tr('逐層瀏覽') },
                        { value: 'works', label: tr('所有作品') },
                      ]}
                      onChange={(value) => {
                        setDisplay(
                          value === 'works'
                            ? { mode: 'multi', level: 'all', works: true }
                            : { mode: 'single', level: 1, works: false }
                        )
                        changedCard()
                      }}
                    />
                    <Text size="xs" c="dimmed" mt={4}>
                      {display.works
                        ? tr('往下找到每個作品就停；只裝資料夾的分類會直接穿過。')
                        : tr('像檔案總管一樣，一次看一層。')}
                    </Text>
                  </div>
                  {display.works && (
                    <details className="card-display-advanced">
                      <summary>{tr('進階')}</summary>
                      <Select
                        size="xs"
                        label={tr('最多往下幾層')}
                        aria-label={tr('最多往下幾層')}
                        value={String(display.level)}
                        allowDeselect={false}
                        data={[
                          { value: 'all', label: tr('不限') },
                          ...Array.from({ length: deepest }, (_, index) => ({
                            value: String(index + 1),
                            label: tr('{0} 層', index + 1),
                          })),
                        ]}
                        onChange={(value) => {
                          if (value) {
                            setDisplay({
                              ...display,
                              level: value === 'all' ? 'all' : Number(value),
                            })
                            changedCard()
                          }
                        }}
                      />
                    </details>
                  )}
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
                  <Switch
                    size="xs"
                    label={tr('顯示類型圖示')}
                    checked={kindBadge}
                    onChange={(event) => setKindBadgeVisible(event.currentTarget.checked)}
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
                <Button
                  size="xs"
                  variant="default"
                  aria-label={tr('選擇表格欄位')}
                  leftSection={<Icon name="list" size={14} />}
                >
                  {tr('欄位')}
                </Button>
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
