import { t as tr, useLocale } from './i18n'
import { HelpTip } from './HelpTip'
import { useState } from 'react'
import { cardPresets } from '../shared/layouts'
import { folderKinds } from '../shared/kind'
import { Alert, Button, Group, Select, Stack, Tabs, Text, TextInput } from '@mantine/core'
import type {
  Project,
  ProjectRemovalPreview,
  FullRemovalPreview,
  CleanupResult,
  Request,
  Response,
} from '../shared/model'

export function ProjectSettings({
  project,
  root,
  busy,
  dirty,
  change,
  act,
  close,
}: {
  project: Project
  root: string
  busy: boolean
  dirty: boolean
  change: (project: Project) => void
  act: (request: Request) => Promise<Response | undefined>
  close: () => void
}) {
  useLocale()

  const [preview, setPreview] = useState<ProjectRemovalPreview>(),
    [result, setResult] = useState<CleanupResult>()
  const [fullPreview, setFullPreview] = useState<FullRemovalPreview>()
  return (
    <Tabs defaultValue="general">
      <Tabs.List>
        <Tabs.Tab value="general">{tr('一般')}</Tabs.Tab>
        <Tabs.Tab value="connection">{tr('連結與資料')}</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="general" pt="lg">
        <Stack gap="lg">
          <section className="settings-section">
            <TextInput
              label={tr('專案名稱')}
              value={project.name}
              maxLength={100}
              onChange={(event) => change({ ...project, name: event.currentTarget.value })}
            />
          </section>
          <section className="settings-section">
            <Text fw={600}>{tr('各類型的預設版面')}</Text>
            <Text size="xs" c="dimmed">
              {tr('每個資料夾依其類型套用；資料夾設定中另選的版面優先。')}
            </Text>
            {folderKinds.map((kind) => (
              <Select
                key={kind}
                mt="xs"
                label={
                  {
                    game: tr('遊戲'),
                    book: tr('書籍／漫畫'),
                    media: tr('影音'),
                    general: tr('一般'),
                  }[kind]
                }
                allowDeselect={false}
                value={project.kindLayouts?.[kind] ?? ''}
                disabled={busy}
                data={[
                  { value: '', label: tr('遵循專案目前版面') },
                  ...cardPresets(project).map((preset) => ({
                    value: preset.id,
                    label:
                      preset.id === 'default' && preset.name === '預設版面'
                        ? tr('預設版面')
                        : preset.name,
                  })),
                ]}
                onChange={(id) => {
                  const kindLayouts = { ...project.kindLayouts }
                  if (id) kindLayouts[kind] = id
                  else delete kindLayouts[kind]
                  change({ ...project, kindLayouts })
                }}
              />
            ))}
          </section>
          <div>
            <Text size="xs" c="dimmed">
              {tr('資料夾位置')}
            </Text>
            <Text size="sm" className="path">
              {root}
            </Text>
          </div>
          <Group gap={4} wrap="nowrap">
            <Text size="sm">{tr('CARD 顯示')}</Text>
            <HelpTip
              text={tr('CARD 的層級、密度與每頁筆數，請由資料夾檢視區的「CARD 顯示設定」調整。')}
            />
          </Group>
          {!project.scanAll && (
            <Button
              variant="default"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    tr('擴大掃描全部層級？僅在允許的資料夾建立記錄，遊戲保護與清理排除仍保留。')
                  )
                )
                  change({ ...project, scanAll: true })
              }}
            >
              {tr('舊專案：擴大掃描範圍')}
            </Button>
          )}
          <Group justify="space-between">
            <Text size="xs" c="dimmed" role="status">
              {dirty ? tr('尚未保存') : tr('目前設定已保存')}
            </Text>
            <Group gap="xs">
              <Button variant="default" disabled={busy} onClick={close}>
                {tr('取消')}
              </Button>
              <Button
                loading={busy}
                disabled={!project.name.trim() || !dirty}
                onClick={async () => {
                  if (await act({ action: 'saveProject', project })) close()
                }}
              >
                {tr('保存專案設定')}
              </Button>
            </Group>
          </Group>
        </Stack>
      </Tabs.Panel>
      <Tabs.Panel value="connection" pt="lg">
        <Stack gap="lg">
          <section className="settings-section">
            <Text fw={600}>{tr('取消專案連結')}</Text>
            <Text size="sm" c="dimmed" my="sm">
              {tr('只從本機清單移除。專案設定與資料保留，之後可重新連結。')}
            </Text>
            <Button
              variant="default"
              disabled={busy || dirty}
              onClick={async () => {
                if (await act({ action: 'unlink', projectId: project.projectId })) close()
              }}
            >
              {tr('取消專案連結（保留資料）')}
            </Button>
          </section>
          <section className="settings-section cleanup-section">
            <Text fw={600}>{tr('移除專案（刪除資料）')}</Text>
            <Text size="sm" c="dimmed" my="sm">
              {tr(
                '移除此專案設定與私有覆寫。空白且無其他專案使用的根記錄會先備份到本機復原區，再清除根目錄的 .media-viewer。共用值、圖片、其他專案及原始媒體保留。'
              )}
            </Text>
            {!preview && (
              <Button
                variant="light"
                color="red"
                disabled={busy || dirty}
                onClick={async () => {
                  setFullPreview(undefined)
                  setResult(undefined)
                  const response = await act({
                    action: 'removeProjectPreview',
                    projectId: project.projectId,
                  })
                  if (response?.removalPreview) setPreview(response.removalPreview)
                }}
              >
                {tr('預覽移除專案')}
              </Button>
            )}
            {preview && (
              <Stack gap="sm" mt="md">
                <Alert color="orange" title={tr('即將移除「') + preview.name + '」'}>
                  {tr('從')}
                  {preview.privateCount}{' '}
                  {tr('筆現用資料夾記錄移除此專案私有值，並封存此專案設定及備份。')}
                  {preview.rootCleanup && (
                    <>
                      <Text size="sm" mt="xs">
                        {tr('根目錄 .media-viewer 將移至本機復原區，重新新增時可建立新的根記錄。')}
                      </Text>
                      <Text size="xs" className="path">
                        {tr('復原位置：')}
                        {preview.recoveryPath}
                      </Text>
                    </>
                  )}
                </Alert>
                <details>
                  <summary>
                    {tr('查看影響範圍（')}
                    {preview.paths.length} {tr('個檔案）')}
                  </summary>
                  <div className="file-list">
                    {preview.paths.map((file) => (
                      <div key={file}>{file}</div>
                    ))}
                  </div>
                </details>
                {preview.skipped.length > 0 && (
                  <details>
                    <summary>
                      {tr('保留／略過項目（')}
                      {preview.skipped.length}）
                    </summary>
                    {preview.skipped.map((text, index) => (
                      <Text size="xs" key={index}>
                        {text}
                      </Text>
                    ))}
                  </details>
                )}
                <Group justify="flex-end">
                  <Button variant="default" disabled={busy} onClick={() => setPreview(undefined)}>
                    {tr('取消移除')}
                  </Button>
                  <Button
                    color="red"
                    loading={busy}
                    onClick={async () => {
                      const response = await act({ action: 'removeProject', token: preview.token })
                      setPreview(undefined)
                      if (response?.removal) {
                        setResult(response.removal)
                        if (!response.removal.failed.length) close()
                      }
                    }}
                  >
                    {tr('確認移除專案及私有資料')}
                  </Button>
                </Group>
              </Stack>
            )}
          </section>
          <section className="settings-section">
            <Text fw={600}>{tr('完全移除專案資料')}</Text>
            <Text size="sm" c="dimmed" my="sm">
              {tr(
                '清除根目錄與所有子資料夾內的本工具資料、共用值、設定及原位置備份。原始媒體保留；可能影響其他綁定專案。'
              )}
            </Text>
            <Button
              color="red"
              variant="default"
              disabled={busy || dirty}
              onClick={async () => {
                setPreview(undefined)
                setResult(undefined)
                const result = await act({
                  action: 'fullRemovalPreview',
                  projectId: project.projectId,
                })
                if (result?.fullRemovalPreview) setFullPreview(result.fullRemovalPreview)
              }}
            >
              {tr('預覽完全移除')}
            </Button>
            {fullPreview && (
              <Stack mt="md">
                <Alert
                  color="red"
                  title={tr('可能受影響的其他專案（{0}）', fullPreview.affectedProjects.length)}
                >
                  {tr('此範圍內的綁定或共用資料會被清除，可能影響其他專案。')}
                  {fullPreview.affectedProjects.map((ref) => (
                    <Text key={ref.projectId} size="sm">
                      {ref.name}
                      <small className="path"> · {ref.root}</small>
                    </Text>
                  ))}
                  {!fullPreview.affectedProjects.length && (
                    <Text size="sm">{tr('已檢查目前已連結的同根、巢狀及重疊專案。')}</Text>
                  )}
                </Alert>
                <details>
                  <summary>
                    {tr('查看影響範圍（')}
                    {fullPreview.paths.length}
                    {tr('個檔案）')}
                  </summary>
                  <div className="file-list">
                    {fullPreview.paths.map((file) => (
                      <div key={file}>{file}</div>
                    ))}
                  </div>
                </details>
                {fullPreview.skipped.map((text) => (
                  <Text size="xs" key={text}>
                    {text}
                  </Text>
                ))}
                <Text size="xs" className="path">
                  {tr('復原位置：')}
                  {fullPreview.recoveryPath}
                </Text>
                <Group justify="flex-end">
                  <Button
                    variant="default"
                    disabled={busy}
                    onClick={() => setFullPreview(undefined)}
                  >
                    {tr('取消')}
                  </Button>
                  <Button
                    color="red"
                    loading={busy}
                    onClick={async () => {
                      const result = await act({ action: 'fullRemoval', token: fullPreview.token })
                      setFullPreview(undefined)
                      if (result?.removal) {
                        setResult(result.removal)
                        if (!result.removal.failed.length) close()
                      }
                    }}
                  >
                    {tr('確認完全移除列出的程式資料')}
                  </Button>
                </Group>
              </Stack>
            )}
          </section>
          {result && (
            <Alert mt="md" color="orange" title={tr('部分移除未完成')}>
              {result.failed.map((text, index) => (
                <Text size="xs" key={index}>
                  {text}
                </Text>
              ))}
              <Text size="xs">{tr('已處理的記錄保有備份；剩餘資料保留，可重新預覽。')}</Text>
            </Alert>
          )}
        </Stack>
      </Tabs.Panel>
    </Tabs>
  )
}
