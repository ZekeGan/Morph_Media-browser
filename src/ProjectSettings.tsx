import { t as tr, useLocale } from './i18n'
import { HelpTip } from './HelpTip'
import { useState } from 'react'
import { cardPresets } from '../shared/layouts'
import { folderKinds } from '../shared/kind'
import { Alert, Button, Checkbox, Group, Select, Stack, Tabs, Text, TextInput } from '@mantine/core'
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
  saved,
}: {
  project: Project
  root: string
  busy: boolean
  dirty: boolean
  change: (project: Project) => void
  act: (request: Request) => Promise<Response | undefined>
  close: () => void
  saved: Project
}) {
  useLocale()

  const [preview, setPreview] = useState<ProjectRemovalPreview>(),
    [result, setResult] = useState<CleanupResult>()
  const [fullPreview, setFullPreview] = useState<FullRemovalPreview>(),
    [alsoShared, setAlsoShared] = useState(false)
  // Deleting removes only this project's own info. Clearing everything M:orph made in the tree (shared info, game
  // decisions, projects removed from the list earlier) needs its own tick, even when no other linked project uses it.
  const deleteShared = !!fullPreview && alsoShared
  const resetDelete = () => {
    setPreview(undefined)
    setFullPreview(undefined)
    setAlsoShared(false)
  }
  const planDelete = async () => {
    resetDelete()
    setResult(undefined)
    const full = (await act({ action: 'fullRemovalPreview', projectId: project.projectId }))
      ?.fullRemovalPreview
    if (!full) return
    const own = (await act({ action: 'removeProjectPreview', projectId: project.projectId }))
      ?.removalPreview
    if (!own) return
    setPreview(own)
    setFullPreview(full)
  }
  return (
    <Stack gap="md">
      <Tabs defaultValue="general">
        <Tabs.List>
          <Tabs.Tab value="general">{tr('一般')}</Tabs.Tab>
          <Tabs.Tab value="connection">{tr('移除')}</Tabs.Tab>
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
              <Group gap={4} wrap="nowrap">
                <Text fw={600}>{tr('各類型的預設版面')}</Text>
                <HelpTip text={tr('版面套用優先序：資料夾自選 › 類型預設 › 專案目前版面。')} />
              </Group>
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
            {!project.scanAll && (
              <Button
                variant="default"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      tr('擴大掃描全部層級？只在允許的資料夾建立資訊，遊戲保護與清除排除仍然有效。')
                    )
                  )
                    change({ ...project, scanAll: true })
                }}
              >
                {tr('舊專案：擴大掃描範圍')}
              </Button>
            )}
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="connection" pt="lg">
          <Stack gap="lg">
            <section className="settings-section">
              <Text fw={600}>{tr('移除專案')}</Text>
              <Group justify="space-between" wrap="nowrap" gap="md" mt="sm">
                <Text size="sm" c="dimmed">
                  {tr('從清單移除後，資訊都會保留，之後可以加回來。')}
                </Text>
                <Button
                  variant="default"
                  disabled={busy || dirty}
                  onClick={async () => {
                    if (await act({ action: 'unlink', projectId: project.projectId })) close()
                  }}
                >
                  {tr('從清單移除')}
                </Button>
              </Group>
              {!fullPreview && (
                <Group justify="space-between" wrap="nowrap" gap="md" mt="md">
                  <Text size="sm" c="dimmed">
                    {tr('想連資訊一起刪掉？')}
                  </Text>
                  <Button
                    variant="light"
                    color="red"
                    disabled={busy || dirty}
                    onClick={() => void planDelete()}
                  >
                    {tr('刪除這個專案的資訊…')}
                  </Button>
                </Group>
              )}
              {fullPreview && (
                <Stack gap="sm" mt="md" className="cleanup-section">
                  <Alert color="red" title={tr('刪除「{0}」的資訊', project.name)}>
                    <Text size="sm">
                      {deleteShared
                        ? tr(
                            '會刪除 M:orph 在這些資料夾建立的所有資訊（{0} 個檔案）。',
                            fullPreview.paths.length
                          )
                        : tr(
                            '會刪除這個專案的設定，以及 {0} 個資料夾裡只屬於這個專案的資訊。',
                            preview?.privateCount ?? 0
                          )}
                    </Text>
                    <Text size="sm" fw={600} mt="xs">
                      {tr('你的檔案（漫畫、圖片、影片）不會被刪除。')}
                    </Text>
                  </Alert>
                  <div>
                    {!!fullPreview.affectedProjects.length && (
                      <>
                        <Text size="sm">{tr('這些資料夾也被下列專案使用：')}</Text>
                        {fullPreview.affectedProjects.map((ref) => (
                          <Text key={ref.projectId} size="sm">
                            {ref.name}
                            <small className="path"> · {ref.root}</small>
                          </Text>
                        ))}
                      </>
                    )}
                    <Checkbox
                      mt="sm"
                      color="red"
                      checked={alsoShared}
                      disabled={busy}
                      onChange={(event) => setAlsoShared(event.currentTarget.checked)}
                      label={tr('也刪除這些資料夾裡 M:orph 建立的其他資訊')}
                      description={tr(
                        '包含各專案共用的資訊、遊戲判斷，以及之前從清單移除的專案；也使用這些資料夾的專案會失去這些資訊。只檢查目前已連結的專案。'
                      )}
                    />
                    {alsoShared && (
                      <Text size="xs" mt="xs" className="path">
                        {tr('刪除前會先備份到：')}
                        {fullPreview.recoveryPath}
                      </Text>
                    )}
                  </div>
                  <details>
                    <summary>{tr('查看詳細')}</summary>
                    <div className="file-list">
                      {(deleteShared ? fullPreview.paths : (preview?.paths ?? [])).map((file) => (
                        <div key={file}>{file}</div>
                      ))}
                    </div>
                    {(deleteShared ? fullPreview.skipped : (preview?.skipped ?? [])).map(
                      (text, index) => (
                        <Text size="xs" key={index}>
                          {text}
                        </Text>
                      )
                    )}
                    {(deleteShared || preview?.rootCleanup) && (
                      <Text size="xs" className="path">
                        {tr('復原位置：')}
                        {deleteShared ? fullPreview.recoveryPath : preview?.recoveryPath}
                      </Text>
                    )}
                  </details>
                  <Group justify="flex-end">
                    <Button variant="default" disabled={busy} onClick={resetDelete}>
                      {tr('取消')}
                    </Button>
                    <Button
                      color="red"
                      loading={busy}
                      disabled={dirty}
                      onClick={async () => {
                        const response = deleteShared
                          ? await act({ action: 'fullRemoval', token: fullPreview.token })
                          : await act({ action: 'removeProject', token: preview!.token })
                        resetDelete()
                        if (response?.removal) {
                          setResult(response.removal)
                          if (!response.removal.failed.length) close()
                        }
                      }}
                    >
                      {tr('刪除「{0}」的資訊', project.name)}
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
                <Text size="xs">{tr('已處理的資訊都有備份；其餘的資料保留，可以重新預覽。')}</Text>
              </Alert>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>
      {dirty && (
        <div className="settings-savebar" role="region" aria-label={tr('未保存的變更')}>
          <Text size="sm">{tr('專案設定尚未保存')}</Text>
          <Group gap="xs" wrap="nowrap">
            <Button variant="default" disabled={busy} onClick={() => change(saved)}>
              {tr('放棄')}
            </Button>
            <Button
              loading={busy}
              disabled={!project.name.trim()}
              onClick={async () => {
                // The saved copy has a new revision; the draft follows it so the bar clears and the next save
                // is not refused as a conflict.
                const result = await act({ action: 'saveProject', project })
                const stored = result?.snapshot.projects.find(
                  (linked) => linked.projectId === project.projectId
                )?.project
                if (stored) change(structuredClone(stored))
              }}
            >
              {tr('保存')}
            </Button>
          </Group>
        </div>
      )}
    </Stack>
  )
}
