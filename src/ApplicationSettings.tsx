import type { BackupEntry, BackupPreview } from '../shared/backup'

// The way back from the last settings restore survives the reload that applies it.
const UNDO_KEY = 'morph.settingsUndo'
const readUndo = (): { id: string; at: string } | undefined => {
  try {
    const value = JSON.parse(localStorage.getItem(UNDO_KEY) ?? 'null')
    return value && typeof value.id === 'string' && typeof value.at === 'string' ? value : undefined
  } catch {
    return undefined
  }
}
const writeUndo = (value?: { id: string; at: string }) => {
  try {
    if (value) localStorage.setItem(UNDO_KEY, JSON.stringify(value))
    else localStorage.removeItem(UNDO_KEY)
  } catch {
    // Without storage the way back is simply not offered.
  }
}
import type { Request, Response } from '../shared/model'
import { t as tr, useLocale } from './i18n'
import { HelpLabel, HelpTip } from './HelpTip'
import { useEffect, useState } from 'react'
import { Alert, Button, Checkbox, Group, Modal, Select, Stack, Tabs, Text } from '@mantine/core'
import { localeOptions, type LocaleId } from '../shared/locales'
import { themes, useAppTheme } from './themes/ThemeProvider'
import type { ThemeId } from '../shared/themes'
import { flushSync } from 'react-dom'
import { Icon } from './icons'

export function ApplicationSettings({
  opened,
  close,
  onDirty,
  act,
  busy,
}: {
  opened: boolean
  close: () => void
  onDirty: (value: boolean) => void
  act: (request: Request) => Promise<Response | undefined>
  busy: boolean
}) {
  useLocale()

  const appearance = useAppTheme(),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('')
  const [restorePreview, setRestorePreview] = useState<BackupPreview>(),
    [restoreSettings, setRestoreSettings] = useState(true),
    [restoreProjects, setRestoreProjects] = useState<string[]>([]),
    [backups, setBackups] = useState<BackupEntry[]>([]),
    [undo, setUndo] = useState(readUndo)
  const [applied, setApplied] = useState(false)
  useEffect(() => {
    onDirty(opened && !!restorePreview)
    return () => onDirty(false)
  }, [opened, restorePreview, onDirty])
  useEffect(() => {
    if (opened) {
      setError('')
      setRestorePreview(undefined)
      void act({ action: 'listBackups' }).then((result) => setBackups(result?.backups ?? []))
      setUndo(readUndo())
      setApplied(false)
    }
  }, [opened])
  const requestClose = () => {
    if (!saving && (!restorePreview || window.confirm(tr('放棄尚未完成的還原？')))) close()
  }
  // Language and theme apply as soon as they are chosen; a failed save puts the saved choice back.
  const apply = async (theme: ThemeId, locale: LocaleId) => {
    setSaving(true)
    setError('')
    setApplied(false)
    appearance.preview(theme)
    appearance.previewLocale(locale)
    try {
      await appearance.save(theme, locale)
      setApplied(true)
    } catch (reason) {
      appearance.preview(appearance.saved)
      appearance.previewLocale(appearance.savedLocale)
      setError(String(reason))
    } finally {
      setSaving(false)
    }
  }
  const showRestore = (preview: BackupPreview) => {
    setRestorePreview(preview)
    setRestoreSettings(preview.settings !== undefined)
    setRestoreProjects(preview.projects.filter((p) => p.state === 'ready').map((p) => p.projectId))
  }
  // Without an id the user picks a backup folder (one made on another computer, or exported).
  const chooseBackup = async (id?: string) => {
    setError('')
    const result = await act({ action: 'previewBackup', id })
    if (result?.backup) showRestore(result.backup)
  }
  const createBackup = async () => {
    const result = await act({ action: 'createBackup' })
    if (result?.backups) setBackups(result.backups)
  }
  const removeBackup = async (entry: BackupEntry) => {
    if (!window.confirm(tr('刪除 {0} 的備份？刪除後無法復原。', when(entry.createdAt)))) return
    const result = await act({ action: 'deleteBackup', id: entry.id })
    if (result?.backups) setBackups(result.backups)
  }
  const when = (date: string) =>
    new Date(date).toLocaleString(appearance.locale, { dateStyle: 'medium', timeStyle: 'short' })
  const size = (bytes: number) =>
    bytes >= 1024 * 1024
      ? (bytes / 1024 / 1024).toFixed(1) + ' MB'
      : Math.max(1, Math.round(bytes / 1024)) + ' KB'
  const locate = async (projectId: string) => {
    if (!restorePreview) return
    const result = await act({ action: 'locateBackup', token: restorePreview.token, projectId })
    if (!result?.backup) return
    setRestorePreview(result.backup)
    if (result.backup.projects.find((p) => p.projectId === projectId)?.state === 'ready')
      setRestoreProjects((list) => [...new Set([...list, projectId])])
  }
  const applyRestore = async () => {
    if (!restorePreview) return
    const result = await act({
      action: 'restoreBackup',
      token: restorePreview.token,
      settings: restoreSettings && restorePreview.settings !== undefined,
      projects: restoreProjects,
    })
    if (!result?.restored) return
    // Restored settings change groups, theme and language: reload so every part of the window reads them again.
    flushSync(() => {
      setRestorePreview(undefined)
      if (result.backups) setBackups(result.backups)
      onDirty(false)
    })
    if (result.restored.settingsUndo) {
      writeUndo({ id: result.restored.settingsUndo, at: restorePreview.createdAt })
      window.location.reload()
    }
  }
  // Puts back the settings saved just before the last restore (the restore of projects only fills in).
  const undoRestore = async () => {
    if (!undo) return
    setSaving(true)
    setError('')
    try {
      await window.desktop.updateWorkspace({ action: 'restorePackage', backupId: undo.id })
      writeUndo()
      window.location.reload()
    } catch (reason) {
      setError(String(reason))
      setSaving(false)
    }
  }
  return (
    <Modal
      opened={opened}
      onClose={requestClose}
      title={tr('應用程式設定')}
      size="lg"
      className="application-settings"
      closeButtonProps={{ 'aria-label': tr('關閉應用程式設定') }}
      closeOnClickOutside={!saving}
      closeOnEscape={!saving}
    >
      <Tabs defaultValue="general" keepMounted>
        <Tabs.List>
          <Tabs.Tab value="general" leftSection={<Icon name="sliders" />}>
            {tr('一般')}
          </Tabs.Tab>
          <Tabs.Tab value="data">{tr('備份')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="general" pt="lg">
          <Select
            label={
              <HelpLabel
                label={tr('介面語言')}
                help={tr('選了就套用；專案名稱與資料內容保持原樣。')}
              />
            }
            data={localeOptions}
            value={appearance.locale}
            allowDeselect={false}
            disabled={!appearance.ready || saving || !!appearance.error}
            onChange={(value) => value && void apply(appearance.theme, value as LocaleId)}
            mb="xl"
          />
          <Group gap={4} mb="lg" wrap="nowrap">
            <Text fw={600} size="sm">
              {tr('選擇你的介面風格')}
            </Text>
            <HelpTip text={tr('套用到整個應用程式，下次開啟仍會使用。')} />
          </Group>
          <div className="theme-options" role="group" aria-label={tr('介面主題')}>
            {themes.map((theme) => (
              <button
                type="button"
                key={theme.id}
                className={'theme-option' + (appearance.theme === theme.id ? ' selected' : '')}
                aria-label={tr(theme.name) + ' ' + tr('主題')}
                aria-pressed={appearance.theme === theme.id}
                disabled={!appearance.ready || saving || !!appearance.error}
                onClick={() => void apply(theme.id, appearance.locale)}
              >
                <span className="theme-sample" data-preview={theme.id} aria-hidden="true">
                  <span className="sample-title">
                    <Icon name="book" size={12} />
                    <i />
                    <Icon name="settings" size={11} />
                  </span>
                  <span className="sample-body">
                    <span className="sample-sidebar">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="sample-cards">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="sample-panel">
                      <i />
                      <i />
                      <i />
                    </span>
                  </span>
                </span>
                <span className="theme-option-heading">
                  <strong>{tr(theme.name)}</strong>
                  <span className="theme-choice">
                    {appearance.theme === theme.id && <Icon name="check" size={15} />}
                  </span>
                </span>
                <span className="theme-description">{tr(theme.description)}</span>
              </button>
            ))}
          </div>
          {(error || appearance.error) && (
            <Alert color="red" mt="md" title={tr('無法套用')}>
              {error || appearance.error}
            </Alert>
          )}
          <Text size="xs" c="dimmed" mt="md" role="status">
            {applied ? tr('已套用') : ''}
          </Text>
        </Tabs.Panel>
        <Tabs.Panel value="data" pt="lg">
          <Stack gap="lg">
            <section className="settings-section">
              <Text fw={600}>{tr('備份')}</Text>
              {undo && !restorePreview && (
                <Alert color="blue" my="sm" className="restore-undo">
                  <Group justify="space-between" gap="xs">
                    <Text size="sm">{tr('已從 {0} 的備份還原設定。', when(undo.at))}</Text>
                    <Group gap="xs" wrap="nowrap">
                      <Button
                        size="compact-sm"
                        variant="subtle"
                        disabled={saving}
                        onClick={() => {
                          writeUndo()
                          setUndo(undefined)
                        }}
                      >
                        {tr('知道了')}
                      </Button>
                      <Button
                        size="compact-sm"
                        loading={saving}
                        disabled={busy}
                        onClick={() => void undoRestore()}
                      >
                        {tr('回到還原之前')}
                      </Button>
                    </Group>
                  </Group>
                </Alert>
              )}
              <Text size="sm" c="dimmed" mb="sm">
                {tr(
                  '把設定和所有專案的資訊（標籤、評分、封面）存一份。你的檔案（漫畫、圖片、影片）不會被複製。'
                )}
              </Text>
              <Group justify="space-between" gap="xs">
                <Button disabled={busy || !!restorePreview} onClick={() => void createBackup()}>
                  {tr('建立備份')}
                </Button>
                <Button
                  variant="default"
                  disabled={busy || !!restorePreview}
                  onClick={() => void chooseBackup()}
                >
                  {tr('從檔案還原…')}
                </Button>
              </Group>
              {restorePreview ? (
                <Stack gap="sm" mt="md" className="restore-preview">
                  <Text fw={600}>{tr('從 {0} 的備份還原', when(restorePreview.createdAt))}</Text>
                  <Text size="sm" c="dimmed">
                    {tr('勾選要還原的項目。已經有資訊的資料夾會保留現在的內容，不會被覆蓋。')}
                  </Text>
                  {restorePreview.settings && (
                    <Checkbox
                      label={tr('設定（群組、最愛、主題、語言）')}
                      description={tr('會取代目前的設定；還原後可以按「回到還原之前」退回。')}
                      checked={restoreSettings}
                      disabled={busy}
                      onChange={(event) => setRestoreSettings(event.currentTarget.checked)}
                    />
                  )}
                  {restorePreview.projects.map((item) => (
                    <Group
                      key={item.projectId}
                      justify="space-between"
                      wrap="nowrap"
                      align="flex-start"
                    >
                      <Checkbox
                        label={item.name}
                        description={
                          <>
                            <span className="path">{item.root}</span>
                            <br />
                            {item.state === 'ready'
                              ? tr('找到資料夾')
                              : item.state === 'missing'
                                ? tr('找不到這個資料夾，請選擇它現在的位置或略過。')
                                : item.message}
                          </>
                        }
                        checked={restoreProjects.includes(item.projectId)}
                        disabled={busy || item.state !== 'ready'}
                        onChange={(event) => {
                          const on = event.currentTarget.checked
                          setRestoreProjects((list) =>
                            on
                              ? [...list, item.projectId]
                              : list.filter((id) => id !== item.projectId)
                          )
                        }}
                      />
                      {item.state !== 'ready' && (
                        <Button
                          size="xs"
                          variant="default"
                          disabled={busy}
                          onClick={() => void locate(item.projectId)}
                        >
                          {tr('選擇新位置')}
                        </Button>
                      )}
                    </Group>
                  ))}
                  <Group justify="flex-end">
                    <Button
                      variant="default"
                      disabled={busy}
                      onClick={() => setRestorePreview(undefined)}
                    >
                      {tr('取消')}
                    </Button>
                    <Button
                      loading={busy}
                      disabled={
                        !restoreProjects.length &&
                        !(restoreSettings && restorePreview.settings !== undefined)
                      }
                      onClick={() => void applyRestore()}
                    >
                      {tr('還原勾選的項目')}
                    </Button>
                  </Group>
                </Stack>
              ) : backups.length ? (
                <ul className="backup-list" aria-label={tr('備份清單')}>
                  {backups.map((entry) => (
                    <li key={entry.id} className="backup-row">
                      <div className="backup-row-text">
                        <Text size="sm">{when(entry.createdAt)}</Text>
                        <Text size="xs" c="dimmed">
                          {entry.label === 'auto' ? tr('還原前自動備份') : tr('手動備份')} ·{' '}
                          {tr('{0} 個專案', entry.projects)} · {size(entry.size)}
                        </Text>
                      </div>
                      <Group gap={4} wrap="nowrap">
                        <Button
                          size="compact-sm"
                          variant="default"
                          aria-label={tr('還原 {0} 的備份', when(entry.createdAt))}
                          disabled={busy}
                          onClick={() => void chooseBackup(entry.id)}
                        >
                          {tr('還原')}
                        </Button>
                        <Button
                          size="compact-sm"
                          variant="subtle"
                          aria-label={tr('匯出 {0} 的備份', when(entry.createdAt))}
                          disabled={busy}
                          onClick={() => void act({ action: 'exportBackup', id: entry.id })}
                        >
                          {tr('匯出…')}
                        </Button>
                        <Button
                          size="compact-sm"
                          variant="subtle"
                          color="red"
                          aria-label={tr('刪除 {0} 的備份', when(entry.createdAt))}
                          disabled={busy}
                          onClick={() => void removeBackup(entry)}
                        >
                          {tr('刪除')}
                        </Button>
                      </Group>
                    </li>
                  ))}
                </ul>
              ) : (
                <Text size="sm" c="dimmed" mt="md">
                  {tr('還沒有備份。')}
                </Text>
              )}
              {error && (
                <Alert color="red" mt="md">
                  {error}
                </Alert>
              )}
              <Text size="xs" c="dimmed" mt="md">
                {tr('備份存在這台電腦裡。要防硬碟故障，請把備份匯出到其他磁碟。')}
              </Text>
            </section>
          </Stack>
        </Tabs.Panel>
      </Tabs>
      <Text size="xs" c="dimmed" mt="md" ta="right" className="app-version">
        M:orph {__APP_VERSION__}
      </Text>
    </Modal>
  )
}
