import type { ReactNode } from 'react'
import { Accordion, Alert, Badge, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { t as tr, useLocale } from './i18n'
import type { FolderRow, LinkedProject, Request, Response, Snapshot } from '../shared/model'
import type { ExplorerRequest, ExplorerResponse } from '../shared/explorer'

type Overview = Pick<Snapshot, 'projects' | 'rows' | 'problems'>

// What needs attention, grouped by what can be done about it.
export const problemItems = (snapshot: Overview) => ({
  roots: snapshot.projects.filter((p) => p.error),
  duplicates: snapshot.rows.filter((r) => r.duplicate),
  broken: snapshot.rows.filter((r) => r.error && !r.duplicate),
  stopped: snapshot.rows.filter((r) => r.stopped && !r.error && !r.duplicate),
  // Looks like a game but nobody has said so yet.
  candidates: snapshot.rows.filter(
    (r) => r.boundary && r.boundary.state !== 'root' && r.boundary.state !== 'not-game' && r.record
  ),
})
// Scan messages that only say a game folder is being protected are notes, not problems.
const isNote = (text: string) => /內部不寫入|唯讀且不深入/.test(text)
export const splitMessages = (messages: string[]) => ({
  notes: messages.filter(isNote),
  others: messages.filter((text) => !isNote(text)),
})
export const problemCount = (snapshot: Overview) => {
  const { roots, duplicates, broken, stopped } = problemItems(snapshot)
  const structured = roots.length + duplicates.length + broken.length + stopped.length
  return structured || splitMessages(snapshot.problems).others.length
}
const shortPath = (path: string) => {
  const parts = path.split(/[\\/]+/).filter(Boolean),
    separator = path.includes('\\') ? '\\' : '/'
  return (parts.length > 2 ? '…' + separator : '') + parts.slice(-2).join(separator)
}

export function ProblemsDialog({
  opened,
  close,
  snapshot,
  busy,
  act,
  run,
  openFolder,
  relink,
}: {
  opened: boolean
  close: () => void
  snapshot: Snapshot
  busy: boolean
  act: (request: Request) => Promise<Response | undefined>
  run: (request: ExplorerRequest) => Promise<ExplorerResponse | undefined>
  openFolder: (row: FolderRow) => void
  relink: () => void
}) {
  useLocale()
  const { roots, duplicates, broken, stopped, candidates } = problemItems(snapshot),
    count = roots.length + duplicates.length + broken.length + stopped.length + candidates.length,
    { notes, others } = splitMessages(snapshot.problems)
  const entry = (
    key: string,
    title: string,
    detail: string | undefined,
    where: string,
    actions: ReactNode,
    jump?: () => void
  ) => (
    <Alert key={key} color="orange" variant="light">
      <Group justify="space-between" align="flex-start" wrap="nowrap" gap="sm">
        <div style={{ minWidth: 0 }}>
          {jump ? (
            <button type="button" className="source-link" onClick={jump} title={where}>
              {title}
            </button>
          ) : (
            <Text fw={600} size="sm">
              {title}
            </Text>
          )}
          <Text size="xs" c="dimmed" className="path" title={where}>
            {shortPath(where)}
          </Text>
          {detail && (
            <details className="boundary-evidence">
              <summary>{tr('技術細節')}</summary>
              <div className="path">{detail}</div>
            </details>
          )}
        </div>
        <Group gap="xs" wrap="nowrap">
          {actions}
        </Group>
      </Group>
    </Alert>
  )
  const group = (title: string, hint: string, items: ReactNode[]) =>
    items.length ? (
      <section className="settings-section" key={title}>
        <Group gap={8}>
          <Text fw={600}>{title}</Text>
          <Badge size="sm" color="orange" variant="light">
            {items.length}
          </Badge>
        </Group>
        <Text size="xs" c="dimmed" mb="xs">
          {hint}
        </Text>
        <Stack gap="xs">{items}</Stack>
      </section>
    ) : null
  const rowEntry = (row: FolderRow, actions: ReactNode) =>
    entry(row.rowId, row.name, row.error, row.path, actions, () => openFolder(row))
  return (
    <Modal opened={opened} onClose={close} title={tr('問題與復原')} size="xl">
      <Stack>
        {!count && !others.length ? (
          <Alert color="teal" variant="light">
            {tr('目前沒有需要處理的問題。')}
          </Alert>
        ) : (
          <Text size="sm" c="dimmed">
            {tr('每一項旁邊的按鈕就是處理方式；點資料夾名稱可以直接跳過去查看。')}
          </Text>
        )}
        {group(
          tr('專案位置失效'),
          tr('資料夾被移動或刪除，專案找不到它。指回新的位置即可，原有設定與資料都在。'),
          roots.map((p: LinkedProject) =>
            entry(
              p.projectId,
              p.project?.name ?? tr('待重新連結'),
              p.error,
              p.root,
              <Button size="compact-sm" disabled={busy} onClick={relink}>
                {tr('重新連結專案')}
              </Button>
            )
          )
        )}
        {group(
          tr('重複的資料夾 ID'),
          tr(
            '這些資料夾像是被複製出來的，和另一個資料夾共用同一個身分。另配新 ID 後兩者各自獨立。'
          ),
          duplicates.map((row) =>
            rowEntry(
              row,
              <Button
                size="compact-sm"
                color="orange"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(tr('確認是副本？原值保留並分配新 ID。')))
                    void act({ action: 'copyIdentity', rowId: row.rowId })
                }}
              >
                {tr('這筆是副本，另配新 ID')}
              </Button>
            )
          )
        )}
        {group(
          tr('記錄損壞'),
          tr('資料夾的記錄檔讀不出來。可以從上一個有效的備份恢復，原檔會保留。'),
          broken.map((row) =>
            rowEntry(
              row,
              <Button
                size="compact-sm"
                variant="default"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(tr('從上一個有效備份恢復？原檔會保留。')))
                    void act({ action: 'restore', rowId: row.rowId })
                }}
              >
                {tr('從上一版備份恢復')}
              </Button>
            )
          )
        )}
        {group(
          tr('已停止記錄'),
          tr('這些資料夾的記錄已暫停，不會更新。重新啟用後恢復記錄。'),
          stopped.map((row) =>
            rowEntry(
              row,
              <Button
                size="compact-sm"
                variant="default"
                disabled={busy}
                onClick={() => void act({ action: 'resume', rowId: row.rowId })}
              >
                {tr('重新啟用記錄')}
              </Button>
            )
          )
        )}
        {group(
          tr('待確認的遊戲'),
          tr('這些資料夾看起來像遊戲，所以內部先受保護、不會寫入。請告訴工具它是不是遊戲。'),
          candidates.map((row) =>
            entry(
              row.rowId,
              row.name,
              undefined,
              row.path,
              <>
                <Button
                  size="compact-sm"
                  disabled={busy}
                  onClick={() =>
                    void run({
                      action: 'boundary',
                      rowId: row.rowId,
                      revision: row.record!.revision,
                      state: 'root',
                    })
                  }
                >
                  {tr('確認遊戲 ROOT')}
                </Button>
                <Button
                  size="compact-sm"
                  variant="default"
                  disabled={busy}
                  onClick={() =>
                    void run({
                      action: 'boundary',
                      rowId: row.rowId,
                      revision: row.record!.revision,
                      state: 'not-game',
                    })
                  }
                >
                  {tr('這不是遊戲目錄')}
                </Button>
              </>,
              () => openFolder(row)
            )
          )
        )}
        {!!others.length && (
          <Accordion variant="separated">
            <Accordion.Item value="messages">
              <Accordion.Control>
                {tr('其他訊息')} ({others.length})
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap="xs">
                  {others.map((text, index) => (
                    <Text size="xs" className="path" key={index}>
                      {text}
                    </Text>
                  ))}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        )}
        {!!notes.length && (
          <Accordion variant="separated">
            <Accordion.Item value="notes">
              <Accordion.Control>
                {tr('遊戲資料夾的保護提示')} ({notes.length})
              </Accordion.Control>
              <Accordion.Panel>
                <Text size="xs" c="dimmed" mb="xs">
                  {tr(
                    '這些是遊戲資料夾，工具只在遊戲根目錄這一層建立記錄，內部不會寫入。這不是錯誤。'
                  )}
                </Text>
                <Stack gap={6}>
                  {notes.map((text, index) => {
                    const match = /^(.+?): (.+)$/.exec(text)
                    return (
                      <div key={index}>
                        <Text size="sm" className="path" title={match?.[1] ?? text}>
                          {shortPath(match?.[1] ?? text)}
                        </Text>
                        {match && (
                          <Text size="xs" c="dimmed">
                            {match[2]}
                          </Text>
                        )}
                      </div>
                    )
                  })}
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        )}
        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            {tr('重新掃描只更新列表，不會改動原始檔案。')}
          </Text>
          <Button variant="default" loading={busy} onClick={() => void act({ action: 'scan' })}>
            {tr('重新掃描並重建列表')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
