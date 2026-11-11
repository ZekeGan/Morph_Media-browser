import { useEffect, useState, useLayoutEffect, useRef } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  ColorPicker,
  ColorSwatch,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core'
import {
  gameActionTemplates,
  type ActionKind,
  type ActionTemplate,
  type ExplorerRequest,
  type ExplorerResponse,
} from '../../shared/explorer'
import type { FolderRow, Project } from '../../shared/model'
import { t as tr } from '../i18n'
import { Icon } from '../common/icons'
import { describeError } from '../notices/errors'
import { parseLaunchArgs } from '../../shared/launchArgs'
import { useGameExtras } from './useGameExtras'
import './game-actions.css'

const kindLabel = (kind: ActionKind) =>
  ({
    exe: tr('啟動 EXE'),
    folder: tr('開啟資料夾'),
    'file-app': tr('以指定應用程式開啟檔案'),
    url: tr('開啟網址'),
    shortcut: tr('執行資料夾內的捷徑'),
    file: tr('開啟資料夾內的檔案'),
  })[kind]

const exampleArgs = '["-run","D:\\\\Games\\\\Title\\\\game.exe"]'
function parseArgs(text: string): string[] {
  const parsed = parseLaunchArgs(text)
  if (!parsed)
    throw new Error(
      tr('啟動參數格式不正確。請用 JSON 字串陣列，每一項各用雙引號，例如：') + ' ' + exampleArgs
    )
  return parsed
}

export function GameActionTargets({
  row,
  project,
  disabled,
  run,
  onDirty,
}: {
  row: FolderRow
  project: Project
  disabled: boolean
  run: (request: ExplorerRequest) => Promise<ExplorerResponse | undefined>
  onDirty: (dirty: boolean) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, { args: string; url: string }>>({}),
    [error, setError] = useState(''),
    [shortcuts, setShortcuts] = useState<string[]>(),
    [choice, setChoice] = useState<Record<string, string>>({})
  const templates = gameActionTemplates(project)
  const localeReady = useGameExtras(row)?.localeEmulator
  const wantsShortcuts = templates.some((t) => t.kind === 'shortcut')
  // The folder's own shortcuts (.lnk/.url), e.g. one made by Locale Emulator, are listed for picking.
  useEffect(() => {
    if (!wantsShortcuts) return
    let alive = true
    // A plain read: it must not be skipped while another operation is busy (the busy-gated runner would drop it).
    void window.explorer
      .request({ action: 'listShortcuts', rowId: row.rowId })
      .then((result) => {
        if (alive) setShortcuts(result.shortcuts ?? [])
      })
      .catch(() => {
        if (alive) setShortcuts([])
      })
    return () => {
      alive = false
    }
  }, [wantsShortcuts, row.rowId])
  const original = (id: string) => ({
    args: JSON.stringify(row.record?.details?.targets?.[id]?.args ?? []),
    url:
      row.record?.details?.targets?.[id]?.kind === 'url' ? row.record.details.targets[id].path : '',
  })
  const dirty = templates.some(
    (t) => drafts[t.id] && JSON.stringify(drafts[t.id]) !== JSON.stringify(original(t.id))
  )
  useEffect(() => {
    onDirty(dirty)
    return () => onDirty(false)
  }, [dirty, onDirty])
  const edit = (id: string, key: 'args' | 'url', value: string) =>
    setDrafts((previous) => ({
      ...previous,
      [id]: { ...(previous[id] ?? original(id)), [key]: value },
    }))
  const reset = (id: string) =>
    setDrafts((previous) => {
      const next = { ...previous }
      delete next[id]
      return next
    })
  const bind = async (template: ActionTemplate) => {
    try {
      const draft = drafts[template.id] ?? original(template.id),
        args = ['exe', 'file-app'].includes(template.kind) ? parseArgs(draft.args) : []
      const response = await run({
        action: 'bindTarget',
        rowId: row.rowId,
        revision: row.record!.revision,
        templateId: template.id,
        args,
        url: template.kind === 'url' ? draft.url.trim() : undefined,
        shortcut: template.kind === 'shortcut' ? choice[template.id] : undefined,
      })
      if (response && !response.cancelled) reset(template.id)
      setError('')
    } catch (e) {
      setError(describeError(e).message)
    }
  }
  return (
    <Stack gap="sm">
      {error && (
        <Alert color="orange" withCloseButton onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {templates.map((template) => {
        const target = row.record?.details?.targets?.[template.id],
          draft = drafts[template.id] ?? original(template.id),
          changed = JSON.stringify(draft) !== JSON.stringify(original(template.id)),
          bound = target?.kind === template.kind,
          hiddenHere = !!row.record?.details?.hiddenActions?.includes(template.id)
        return (
          <section
            className={'settings-section game-target' + (bound ? '' : ' unbound')}
            key={template.id}
          >
            <Group justify="space-between" wrap="nowrap">
              <Text fw={600}>{tr(template.label)}</Text>
              <Group gap={6} wrap="nowrap">
                <Text size="xs" c="dimmed">
                  {kindLabel(template.kind)}
                </Text>
                <Tooltip label={tr('測試啟動')}>
                  <ActionIcon
                    variant="subtle"
                    aria-label={tr('測試啟動 {0}', tr(template.label))}
                    disabled={disabled || !bound}
                    onClick={() => {
                      if (
                        ['exe', 'file-app', 'shortcut'].includes(template.kind) &&
                        !window.confirm(tr('啟動「{0}」？', tr(template.label)))
                      )
                        return
                      void run({
                        action: 'runTarget',
                        rowId: row.rowId,
                        templateId: template.id,
                      })
                    }}
                  >
                    <Icon name="play" size={16} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip
                  label={
                    !bound
                      ? tr('尚未綁定目標，按鈕列不會顯示這個按鈕')
                      : hiddenHere
                        ? tr('此遊戲的按鈕列不顯示這個按鈕，點擊顯示')
                        : tr('此遊戲的按鈕列顯示這個按鈕，點擊隱藏')
                  }
                >
                  <ActionIcon
                    variant="subtle"
                    color={hiddenHere ? 'gray' : undefined}
                    aria-label={
                      hiddenHere
                        ? tr('顯示按鈕 {0}', tr(template.label))
                        : tr('隱藏按鈕 {0}', tr(template.label))
                    }
                    aria-pressed={!hiddenHere}
                    disabled={disabled || !bound}
                    onClick={() =>
                      void run({
                        action: 'actionVisible',
                        rowId: row.rowId,
                        revision: row.record!.revision,
                        templateId: template.id,
                        visible: hiddenHere,
                      })
                    }
                  >
                    <Icon name={hiddenHere ? 'eye-off' : 'eye'} size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
            {['exe', 'folder', 'file-app', 'file'].includes(template.kind) && (
              <Text size="sm" c="dimmed" className="path-line" title={target?.path}>
                {target?.kind === template.kind ? target.path : tr('尚未綁定目標')}
              </Text>
            )}
            {template.kind === 'url' ? (
              <TextInput
                label={tr('網址')}
                value={draft.url}
                placeholder="https://"
                disabled={disabled}
                onChange={(e) => edit(template.id, 'url', e.currentTarget.value)}
              />
            ) : template.kind === 'shortcut' ? (
              <>
                <Text size="sm" c="dimmed" className="path">
                  {target?.kind === 'shortcut' ? target.path : tr('尚未綁定目標')}
                </Text>
                <Select
                  comboboxProps={{ zIndex: 460 }}
                  label={tr('選擇資料夾內的捷徑')}
                  placeholder={
                    shortcuts && !shortcuts.length
                      ? tr('此資料夾內沒有捷徑（.lnk／.url）')
                      : tr('選擇捷徑')
                  }
                  data={shortcuts ?? []}
                  value={choice[template.id] ?? null}
                  disabled={disabled || !shortcuts?.length}
                  nothingFoundMessage={tr('此資料夾內沒有捷徑（.lnk／.url）')}
                  onChange={(value) => setChoice({ ...choice, [template.id]: value ?? '' })}
                />
              </>
            ) : null}
            {target?.kind === 'file-app' && target.application && (
              <Text size="xs" c="dimmed" className="path">
                {tr('應用程式')} · {target.application.path}
              </Text>
            )}
            {template.kind === 'exe' && bound && (
              <Checkbox
                label={tr('用日文語系啟動（Locale Emulator）')}
                description={
                  localeReady === false
                    ? tr('先到「應用程式設定」指定 LEProc.exe 才能使用')
                    : undefined
                }
                checked={!!target?.localeEmulator}
                disabled={disabled || (localeReady === false && !target?.localeEmulator)}
                onChange={(event) =>
                  void run({
                    action: 'targetLocale',
                    rowId: row.rowId,
                    revision: row.record!.revision,
                    templateId: template.id,
                    value: event.currentTarget.checked,
                  })
                }
              />
            )}
            {['exe', 'file-app'].includes(template.kind) && (
              <Textarea
                label={tr('啟動參數（JSON 字串陣列）')}
                value={draft.args}
                disabled={disabled}
                onChange={(e) => edit(template.id, 'args', e.currentTarget.value)}
                placeholder={tr('["--fullscreen", "含空白的值"]')}
                autosize
                minRows={1}
              />
            )}
            <Group gap="xs">
              <Button
                variant="default"
                size="xs"
                disabled={disabled || (template.kind === 'shortcut' && !choice[template.id])}
                onClick={() => void bind(template)}
              >
                {template.kind === 'url'
                  ? tr('保存網址')
                  : template.kind === 'shortcut'
                    ? tr('綁定此捷徑')
                    : template.kind === 'file'
                      ? tr('選擇遊戲資料夾內的檔案')
                      : template.kind === 'file-app'
                        ? tr('選擇應用程式與檔案')
                        : template.kind === 'exe'
                          ? tr('選擇 EXE 並保存參數')
                          : tr('選擇資料夾')}
              </Button>
              {changed && (
                <Button
                  variant="subtle"
                  size="xs"
                  disabled={disabled}
                  onClick={() => reset(template.id)}
                >
                  {tr('取消變更')}
                </Button>
              )}
            </Group>
          </section>
        )
      })}
    </Stack>
  )
}

// Colours offered at a glance; anything else is one click away under "custom colour".
const actionColors = [
  '#168c77',
  '#2f80ed',
  '#7c5cff',
  '#d6336c',
  '#e5484d',
  '#e8590c',
  '#f59f00',
  '#2f9e44',
  '#1098ad',
  '#868e96',
]

export function GameActionEditor({
  tasks,
  onChange,
  disabled,
}: {
  tasks: ActionTemplate[]
  onChange: (tasks: ActionTemplate[]) => void
  disabled: boolean
}) {
  const [selected, setSelected] = useState(tasks[0]?.id ?? ''),
    [dragged, setDragged] = useState<string>()
  const list = useRef<HTMLDivElement>(null),
    positions = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const next = new Map<string, number>()
    for (const node of list.current?.querySelectorAll<HTMLElement>('[data-task-id]') ?? []) {
      const id = node.dataset.taskId!,
        top = node.getBoundingClientRect().top,
        previous = positions.current.get(id)
      next.set(id, top)
      if (
        previous !== undefined &&
        previous !== top &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches
      )
        node.animate(
          [{ transform: 'translateY(' + (previous - top) + 'px)' }, { transform: 'translateY(0)' }],
          { duration: 180, easing: 'ease-out' }
        )
    }
    positions.current = next
  }, [tasks])
  const current = tasks.find((task) => task.id === selected) ?? tasks[0]
  const update = (change: Partial<ActionTemplate>) =>
    current &&
    onChange(tasks.map((task) => (task.id === current.id ? { ...task, ...change } : task)))
  const move = (id: string, to: number) => {
    const from = tasks.findIndex((task) => task.id === id)
    if (from < 0 || to < 0 || to >= tasks.length || from === to) return
    const next = [...tasks],
      [task] = next.splice(from, 1)
    next.splice(to, 0, task)
    onChange(next)
  }
  return (
    <div className="game-action-editor">
      <div ref={list} className="game-action-list" role="list" aria-label={tr('操作順序')}>
        {tasks.map((task, i) => (
          <div
            data-task-id={task.id}
            role="listitem"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key) && !disabled) {
                event.preventDefault()
                move(task.id, i + (event.key === 'ArrowUp' ? -1 : 1))
              }
            }}
            className={`game-action-item${current?.id === task.id ? ' selected' : ''}`}
            key={task.id}
            draggable={!disabled}
            onDragStart={(e) => {
              setDragged(task.id)
              e.dataTransfer.setData('application/x-game-action', task.id)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragEnd={() => setDragged(undefined)}
            // Decide from the drag data, not from state: a quick drag reaches dragover before React has re-rendered
            // with the dragged id, and refusing that dragover silently cancels the drop.
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('application/x-game-action')) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
              }
            }}
            onDrop={(e) => {
              e.preventDefault()
              const id = e.dataTransfer.getData('application/x-game-action') || dragged
              if (id) move(id, i)
              setDragged(undefined)
            }}
          >
            <button
              type="button"
              className="game-action-select"
              disabled={disabled}
              aria-pressed={current?.id === task.id}
              onClick={() => setSelected(task.id)}
            >
              <span className="game-action-grip" aria-hidden="true">
                ⠿
              </span>
              <span className="game-action-dot" style={{ background: task.color }} />
              <span>{tr(task.label)}</span>
            </button>
            <Tooltip label={tr('移除')}>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={tr('移除 {0}', task.label)}
                disabled={disabled}
                onClick={() => onChange(tasks.filter((item) => item.id !== task.id))}
              >
                <Icon name="close" size={14} />
              </ActionIcon>
            </Tooltip>
          </div>
        ))}
        <Button
          variant="light"
          size="xs"
          disabled={disabled || tasks.length >= 30}
          onClick={() => {
            const id = crypto.randomUUID()
            onChange([...tasks, { id, label: tr('啟動遊戲'), kind: 'exe', color: '#168c77' }])
            setSelected(id)
          }}
        >
          {tr('加入按鈕')}
        </Button>
      </div>
      {current ? (
        <Stack className="game-action-inspector" gap="sm">
          <TextInput
            label={tr('按鈕文字')}
            value={current.label}
            maxLength={100}
            disabled={disabled}
            onChange={(e) => update({ label: e.currentTarget.value })}
          />
          <Select
            comboboxProps={{ zIndex: 460 }}
            label={tr('任務類型')}
            value={current.kind}
            disabled={disabled}
            data={(['exe', 'folder', 'file-app', 'url', 'shortcut', 'file'] as const).map(
              (kind) => ({
                value: kind,
                label: kindLabel(kind),
              })
            )}
            onChange={(value) => value && update({ kind: value as ActionKind })}
          />
          <div>
            <Text size="sm" fw={500} mb={6}>
              {tr('顏色')}
            </Text>
            <Group gap={8} role="radiogroup" aria-label={tr('顏色')}>
              {actionColors.map((color) => (
                <ColorSwatch
                  key={color}
                  component="button"
                  type="button"
                  color={color}
                  size={26}
                  role="radio"
                  aria-checked={current.color.toLowerCase() === color}
                  aria-label={color}
                  disabled={disabled}
                  style={{ cursor: disabled ? 'default' : 'pointer', color: '#fff' }}
                  onClick={() => update({ color })}
                >
                  {current.color.toLowerCase() === color && <Icon name="check" size={14} />}
                </ColorSwatch>
              ))}
            </Group>
            <details className="action-custom-color">
              <summary>{tr('自訂顏色')}</summary>
              <ColorPicker
                format="hex"
                fullWidth
                size="sm"
                value={current.color}
                onChange={(value) => /^#[0-9a-f]{6}$/i.test(value) && update({ color: value })}
              />
            </details>
          </div>
          <div>
            <Text size="xs" c="dimmed" mb={4}>
              {tr('預覽')}
            </Text>
            <Button size="xs" style={{ background: current.color, color: '#fff' }} tabIndex={-1}>
              {tr(current.label)}
            </Button>
          </div>
        </Stack>
      ) : (
        <Text c="dimmed" size="sm">
          {tr('加入按鈕以建立操作。')}
        </Text>
      )}
    </div>
  )
}
