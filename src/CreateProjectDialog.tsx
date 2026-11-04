import { useEffect, useState } from 'react'
import { Alert, Button, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core'
import { t as tr } from './i18n'
import type { ProjectInput, Request, Response, RootSelection } from '../shared/model'
import type { WorkspacePrefs } from '../shared/workspace'

// One door for bringing a project in: pick a folder. If the folder already holds a project that is not in the
// list (moved drive, new computer), the dialog offers to bring that one back instead of starting a new one.
export function CreateProjectDialog({
  opened,
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
  link,
  close,
}: {
  opened: boolean
  busy: boolean
  input: ProjectInput
  setInput: (input: ProjectInput) => void
  groups: WorkspacePrefs['groups']
  group: string
  setGroup: (id: string) => void
  rootChoice?: RootSelection
  setRootChoice: (choice?: RootSelection) => void
  act: (request: Request) => Promise<Response | undefined>
  create: () => Promise<void>
  link: (rootToken: string) => Promise<void>
  close: () => void
}) {
  const [named, setNamed] = useState(false),
    [startNew, setStartNew] = useState(false)
  useEffect(() => {
    if (opened) {
      setNamed(false)
      setStartNew(false)
    }
  }, [opened])
  const earlier = rootChoice?.existing?.filter((project) => !project.linked) ?? []
  const offerLink = earlier.length > 0 && !startNew
  const choose = async () => {
    const choice = (await act({ action: 'chooseRoot' }))?.rootSelection
    if (!choice) return
    setRootChoice(choice)
    setStartNew(false)
    // The folder's own name is a sensible project name until the user types one.
    if (!named) setInput({ ...input, name: choice.path.split(/[\\/]/).filter(Boolean).pop() ?? '' })
  }
  return (
    <Modal opened={opened} onClose={close} title={tr('新增專案')} size="lg">
      <Stack>
        <Text size="sm" c="dimmed">
          {tr('選一個資料夾開始瀏覽；原始資料夾不會被搬移或刪除。')}
        </Text>
        <div>
          <Text size="sm" fw={500} mb={4}>
            {tr('要瀏覽的資料夾')}
          </Text>
          <Group gap="xs" wrap="nowrap" align="stretch">
            <div
              className="pick-path"
              data-empty={!rootChoice}
              aria-label={tr('已選資料夾')}
              title={rootChoice?.path}
            >
              {rootChoice?.path ?? tr('尚未選擇資料夾')}
            </div>
            <Button variant="default" disabled={busy} onClick={() => void choose()}>
              {tr('選擇資料夾')}
            </Button>
          </Group>
        </div>
        {offerLink ? (
          <>
            <Alert color="blue" title={tr('這個資料夾裡有之前的專案')}>
              <Text size="sm">
                {tr(
                  '「{0}」。要接回原本的專案嗎？原有的設定與資訊都會保留。',
                  earlier.map((project) => project.name).join('」「')
                )}
              </Text>
            </Alert>
            <Group justify="space-between" mt="xs">
              <Button variant="subtle" disabled={busy} onClick={() => setStartNew(true)}>
                {tr('改為建立新專案')}
              </Button>
              <Group gap="xs">
                <Button variant="default" disabled={busy} onClick={close}>
                  {tr('取消')}
                </Button>
                <Button loading={busy} onClick={() => void link(rootChoice!.token)}>
                  {tr('接回原本的專案')}
                </Button>
              </Group>
            </Group>
          </>
        ) : (
          <>
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
        )}
      </Stack>
    </Modal>
  )
}
