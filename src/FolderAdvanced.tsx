import { useState } from 'react'
import {
  Accordion,
  Alert,
  Button,
  Checkbox,
  Group,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from '@mantine/core'
import { t as tr } from './i18n'
import { HelpTip } from './HelpTip'
import type { CleanupPreview, CleanupResult, FolderRow, Request, Response } from '../shared/model'

// The folder settings "Advanced" tab: scan boundary, record recovery, stored attributes and the dangerous actions.
export function FolderAdvanced({
  row,
  disabled,
  busy,
  fieldDirty,
  showBoundary,
  boundary,
  act,
  error,
  setError,
}: {
  row: FolderRow
  disabled: boolean
  busy: boolean
  fieldDirty: boolean
  showBoundary: boolean
  boundary: (state: 'root' | 'not-game' | 'candidate', traverse?: boolean) => void
  act: (request: Request) => Promise<Response | undefined>
  error: string
  setError: (message: string) => void
}) {
  const [cleanup, setCleanup] = useState<CleanupPreview>(),
    [cleanupResult, setCleanupResult] = useState<CleanupResult>(),
    [restart, setRestart] = useState(false)
  const previewCleanup = async (scope: 'folder' | 'private') => {
    setCleanupResult(undefined)
    setRestart(false)
    const result = await act({ action: 'cleanupPreview', rowId: row.rowId, scope })
    if (result?.preview) setCleanup(result.preview)
  }
  return (
    <Tabs.Panel value="advanced" pt="md">
      <Stack>
        {showBoundary && (
          <section className="settings-section">
            <Group gap={4} wrap="nowrap">
              <Text fw={600}>{tr('掃描邊界')}</Text>
              <HelpTip
                text={tr(
                  '遊戲資料夾裡的檔案很多，也不該被改動。所以只把「遊戲根目錄（ROOT）」這一層當成一筆資料夾記錄，裡面的子資料夾受保護，不會被掃描或寫入。'
                )}
              />
            </Group>
            {row.boundary ? (
              <>
                <Text size="sm" mt={4}>
                  {row.boundary.engines.length
                    ? tr('這個資料夾看起來是 {0} 遊戲。', row.boundary.engines.join('／'))
                    : tr('這個資料夾看起來像遊戲或封裝程式，但無法確定是哪種引擎。')}
                </Text>
                <Text size="xs" c="dimmed">
                  {tr('請確認它是不是遊戲：')}
                </Text>
                <Group mt="sm">
                  <Tooltip
                    multiline
                    maw={240}
                    withArrow
                    label={tr('把這個資料夾當成遊戲的根目錄：記錄放在這一層，裡面的檔案受保護。')}
                  >
                    <Button size="xs" disabled={disabled} onClick={() => boundary('root')}>
                      {tr('確認遊戲 ROOT')}
                    </Button>
                  </Tooltip>
                  <Tooltip
                    multiline
                    maw={240}
                    withArrow
                    label={tr('只查看裡面的檔案，不會在內部寫入任何東西。')}
                  >
                    <Button
                      size="xs"
                      variant="default"
                      disabled={disabled}
                      onClick={() => boundary('root', true)}
                    >
                      {tr('唯讀查看內部')}
                    </Button>
                  </Tooltip>
                  <Tooltip
                    multiline
                    maw={240}
                    withArrow
                    label={tr('取消遊戲判定，當成一般資料夾；之後不再提示。')}
                  >
                    <Button
                      size="xs"
                      variant="subtle"
                      disabled={disabled}
                      onClick={() => boundary('not-game')}
                    >
                      {tr('這不是遊戲目錄')}
                    </Button>
                  </Tooltip>
                </Group>
                {!!row.boundary.evidence.length && (
                  <details className="boundary-evidence">
                    <summary>{tr('判斷依據')}</summary>
                    <ul>
                      {row.boundary.evidence.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <Button size="xs" mt="sm" disabled={disabled} onClick={() => boundary('root')}>
                {tr('標記為遊戲 ROOT')}
              </Button>
            )}
          </section>
        )}
        {(row.stopped || row.duplicate || row.error) && (
          <section className="settings-section">
            <Text fw={600} mb="sm">
              {tr('記錄復原')}
            </Text>
            <Stack gap="xs">
              {row.stopped && (
                <Button
                  variant="default"
                  onClick={() => void act({ action: 'resume', rowId: row.rowId })}
                >
                  {tr('重新啟用記錄')}
                </Button>
              )}
              {row.duplicate && (
                <Button
                  color="orange"
                  onClick={() =>
                    window.confirm(tr('確認是副本？原值保留並分配新 ID。')) &&
                    void act({ action: 'copyIdentity', rowId: row.rowId })
                  }
                >
                  {tr('這筆是副本，另配新 ID')}
                </Button>
              )}
              {row.error && !row.duplicate && (
                <Button
                  color="orange"
                  variant="default"
                  onClick={() =>
                    window.confirm(tr('從上一個有效備份恢復？原檔會保留。')) &&
                    void act({ action: 'restore', rowId: row.rowId })
                  }
                >
                  {tr('從上一版備份恢復')}
                </Button>
              )}
            </Stack>
          </section>
        )}
        <details className="settings-section">
          <summary>{tr('全部已存屬性與來源')}</summary>
          <pre>{JSON.stringify(row.record, null, 2) ?? tr('沒有可攜記錄')}</pre>
        </details>
        <Accordion variant="separated" className="danger-accordion">
          <Accordion.Item value="danger">
            <Accordion.Control c="red">{tr('危險操作')}</Accordion.Control>
            <Accordion.Panel>
              <section className="settings-section cleanup-section">
                <Text fw={600}>{tr('清除此資料夾的程式資料')}</Text>
                <Text size="sm" c="dimmed">
                  {tr('原始資料夾與媒體保留。先預覽範圍，確認後才清理。')}
                </Text>
                <Group>
                  <Button
                    size="xs"
                    variant="default"
                    color="red"
                    disabled={busy || fieldDirty || row.readonly}
                    onClick={() => void previewCleanup('folder')}
                  >
                    {tr('預覽清除此資料夾資料')}
                  </Button>
                  {!!row.record?.projectOverrides[row.projectId]?.length && (
                    <Button
                      size="xs"
                      variant="subtle"
                      color="red"
                      disabled={busy || fieldDirty}
                      onClick={() => void previewCleanup('private')}
                    >
                      {tr('只清此專案私有覆寫')}
                    </Button>
                  )}
                </Group>
                {cleanup && (
                  <Stack mt="md">
                    <Alert color="orange" title={tr('清理預覽')}>
                      {cleanup.scope === 'private'
                        ? tr('只移除目前專案私有覆寫')
                        : tr('移除此資料夾的受管記錄及資產')}
                      {tr('；共')}
                      {cleanup.count} {tr('筆。未知檔案、離線與未連結副本不在範圍。')}
                    </Alert>
                    <div className="file-list">
                      {cleanup.paths.map((p) => (
                        <div key={p}>{p}</div>
                      ))}
                    </div>
                    {cleanup.skipped.map((s, i) => (
                      <Text key={i} size="xs" c="dimmed">
                        {s}
                      </Text>
                    ))}
                    {cleanup.scope === 'folder' && (
                      <Checkbox
                        label={tr('清除後立即重新開始記錄')}
                        description={tr('預設停止記錄，避免下次掃描立即建立資料。')}
                        checked={restart}
                        onChange={(e) => setRestart(e.currentTarget.checked)}
                      />
                    )}
                    <Group justify="flex-end">
                      <Button
                        variant="default"
                        disabled={busy}
                        onClick={() => setCleanup(undefined)}
                      >
                        {tr('取消清理')}
                      </Button>
                      <Button
                        color="red"
                        disabled={busy || fieldDirty}
                        loading={busy}
                        onClick={async () => {
                          const result = await act({
                            action: 'cleanup',
                            token: cleanup.token,
                            restart,
                          })
                          if (result?.cleanup) {
                            setCleanupResult(result.cleanup)
                            setCleanup(undefined)
                          } else {
                            setCleanup(undefined)
                            setError(tr('清理未完成，請重新預覽範圍後重試。'))
                          }
                        }}
                      >
                        {tr('確認清理列出的本程式資料')}
                      </Button>
                    </Group>
                  </Stack>
                )}
                {cleanupResult && (
                  <Alert
                    mt="md"
                    color={cleanupResult.failed.length ? 'orange' : 'teal'}
                    title={tr('已清理 ') + cleanupResult.removed + tr(' 筆')}
                  >
                    <Text size="sm">{tr('原始媒體保留。')}</Text>
                    {[...cleanupResult.failed, ...cleanupResult.skipped].map((s, i) => (
                      <Text size="xs" key={i}>
                        {s}
                      </Text>
                    ))}
                  </Alert>
                )}
              </section>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </Stack>
    </Tabs.Panel>
  )
}
