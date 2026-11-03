import { useEffect, useState } from 'react'
import {
  Button,
  Group,
  Modal,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core'
import { t as tr } from './i18n'
import type { ProjectInput, Request, Response } from '../shared/model'
import type { WorkspacePrefs } from '../shared/workspace'

type Choice = { token: string; path: string }
export type CreateMode = 'create' | 'import'

// One door for bringing a project in: build one from a folder, or import project data exported earlier.
export function CreateProjectDialog({
  opened,
  initialMode,
  busy,
  input,
  setInput,
  groups,
  group,
  setGroup,
  rootChoice,
  setRootChoice,
  act,
  create,
  preview,
  close,
}: {
  opened: boolean
  initialMode: CreateMode
  busy: boolean
  input: ProjectInput
  setInput: (input: ProjectInput) => void
  groups: WorkspacePrefs['groups']
  group: string
  setGroup: (id: string) => void
  rootChoice?: Choice
  setRootChoice: (choice?: Choice) => void
  act: (request: Request) => Promise<Response | undefined>
  create: () => Promise<void>
  preview: (bundleToken: string, rootToken: string) => Promise<void>
  close: () => void
}) {
  const [mode, setMode] = useState<CreateMode>(initialMode),
    [bundle, setBundle] = useState<Choice>(),
    [target, setTarget] = useState<Choice>(),
    [named, setNamed] = useState(false)
  useEffect(() => {
    if (!opened) return
    setMode(initialMode)
    setBundle(undefined)
    setTarget(undefined)
    setNamed(false)
  }, [opened, initialMode])
  const pick = async (action: 'chooseRoot' | 'chooseBundle') =>
    (await act({ action }))?.rootSelection
  const row = (
    label: string,
    value: Choice | undefined,
    empty: string,
    button: string,
    choose: () => void,
    aria?: string
  ) => (
    <div>
      <Text size="sm" fw={500} mb={4}>
        {label}
      </Text>
      <Group gap="xs" wrap="nowrap" align="stretch">
        <div className="pick-path" data-empty={!value} aria-label={aria} title={value?.path}>
          {value?.path ?? empty}
        </div>
        <Button variant="default" disabled={busy} onClick={choose}>
          {button}
        </Button>
      </Group>
    </div>
  )
  return (
    <Modal opened={opened} onClose={close} title={tr('新增專案')} size="lg">
      <Stack>
        <SegmentedControl
          fullWidth
          aria-label={tr('新增方式')}
          value={mode}
          disabled={busy}
          onChange={(value) => setMode(value as CreateMode)}
          data={[
            { value: 'create', label: tr('從資料夾建立') },
            { value: 'import', label: tr('匯入匯出的專案資料') },
          ]}
        />
        {mode === 'create' ? (
          <>
            <Text size="sm" c="dimmed">
              {tr('選一個資料夾開始瀏覽；原始資料夾不會被搬移或刪除。')}
            </Text>
            {row(
              tr('要瀏覽的資料夾'),
              rootChoice,
              tr('尚未選擇資料夾'),
              tr('選擇資料夾'),
              async () => {
                const choice = await pick('chooseRoot')
                if (!choice) return
                setRootChoice(choice)
                // The folder's own name is a sensible project name until the user types one.
                if (!named)
                  setInput({
                    ...input,
                    name: choice.path.split(/[\/]/).filter(Boolean).pop() ?? '',
                  })
              },
              tr('已選資料夾')
            )}
            <TextInput
              label={tr('專案名稱')}
              value={input.name}
              maxLength={100}
              onChange={(e) => {
                setNamed(true)
                setInput({ ...input, name: e.currentTarget.value })
              }}
            />
            <Select
              label={tr('所屬群組')}
              value={group}
              allowDeselect={false}
              data={[
                { value: '', label: tr('未分類') },
                ...groups.map((g) => ({ value: g.id, label: g.name })),
              ]}
              onChange={(v) => setGroup(v ?? '')}
            />
            <Group justify="space-between" mt="xs">
              <Text size="xs" c="dimmed" role="status">
                {!rootChoice
                  ? tr('請先選擇要瀏覽的資料夾')
                  : !input.name.trim()
                    ? tr('請輸入專案名稱')
                    : ''}
              </Text>
              <Group gap="xs">
                <Button variant="default" disabled={busy} onClick={close}>
                  {tr('取消')}
                </Button>
                <Button
                  loading={busy}
                  disabled={!rootChoice || !input.name.trim()}
                  onClick={() => void create()}
                >
                  {tr('完成建立')}
                </Button>
              </Group>
            </Group>
          </>
        ) : (
          <>
            <Text size="sm" c="dimmed">
              {tr(
                '把先前「匯出專案資料」得到的資料夾，放回一個根資料夾。匯入前會先預覽，不會直接寫入。'
              )}
            </Text>
            {row(
              tr('匯出的資料夾'),
              bundle,
              tr('尚未選擇資料夾'),
              tr('選擇匯出資料夾'),
              async () => setBundle((await pick('chooseBundle')) ?? bundle),
              tr('已選匯出資料夾')
            )}
            {row(
              tr('放入的根資料夾'),
              target,
              tr('尚未選擇資料夾'),
              tr('選擇放入位置'),
              async () => setTarget((await pick('chooseRoot')) ?? target),
              tr('已選放入位置')
            )}
            <Group justify="space-between" mt="xs">
              <Text size="xs" c="dimmed" role="status">
                {!bundle
                  ? tr('請先選擇匯出的資料夾')
                  : !target
                    ? tr('請再選擇要放入的根資料夾')
                    : ''}
              </Text>
              <Group gap="xs">
                <Button variant="default" disabled={busy} onClick={close}>
                  {tr('取消')}
                </Button>
                <Button
                  loading={busy}
                  disabled={!bundle || !target}
                  onClick={() => void preview(bundle!.token, target!.token)}
                >
                  {tr('預覽匯入')}
                </Button>
              </Group>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  )
}
