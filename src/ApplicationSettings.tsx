import type { BackupPreview } from '../shared/backup'
import type { Request, Response } from '../shared/model'
import { t as tr, useLocale } from './i18n'
import { HelpLabel, HelpTip } from './HelpTip'
import { useEffect, useState } from 'react'
import {
  Accordion,
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  Select,
  Stack,
  Tabs,
  Text,
} from '@mantine/core'
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
    [backups, setBackups] = useState<{ id: string; createdAt: string }[]>([])
  const [applied, setApplied] = useState(false)
  useEffect(() => {
    onDirty(opened && !!restorePreview)
    return () => onDirty(false)
  }, [opened, restorePreview, onDirty])
  useEffect(() => {
    if (opened) {
      setError('')
      setRestorePreview(undefined)
      void window.desktop
        .updateWorkspace({ action: 'listBackups' })
        .then((state) => setBackups(state.backups ?? []))
        .catch((reason) => setError(String(reason)))
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
  const chooseBackup = async () => {
    setError('')
    const result = await act({ action: 'previewBackup' })
    if (result?.backup) showRestore(result.backup)
  }
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
      onDirty(false)
    })
    if (result.restored.settings) window.location.reload()
  }
  const restore = async (backupId: string) => {
    if (!window.confirm(tr('復原此設定備份？目前設定會先另存備份，媒體與專案連結保持原樣。')))
      return
    setSaving(true)
    setError('')
    try {
      await window.desktop.updateWorkspace({ action: 'restorePackage', backupId })
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
              <Text size="sm" c="dimmed" mb="sm">
                {tr(
                  '把設定和所有專案的資訊（標籤、評分、封面）存成一個資料夾。你的檔案（漫畫、圖片、影片）不會被複製。'
                )}
              </Text>
              <Stack>
                <Group>
                  <Button
                    disabled={busy || !!restorePreview}
                    onClick={() => void act({ action: 'createBackup' })}
                  >
                    {tr('建立備份')}
                  </Button>
                  <Button
                    variant="default"
                    disabled={busy || !!restorePreview}
                    onClick={() => void chooseBackup()}
                  >
                    {tr('從備份還原')}
                  </Button>
                </Group>
                {restorePreview && (
                  <Stack gap="sm" className="restore-preview">
                    <Text fw={600}>
                      {tr(
                        '從 {0} 的備份還原',
                        new Date(restorePreview.createdAt).toLocaleString(appearance.locale)
                      )}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {tr('勾選要還原的項目。已經有資訊的資料夾會保留現在的內容。')}
                    </Text>
                    {restorePreview.settings && (
                      <Checkbox
                        label={tr('設定（群組、最愛、主題、語言）')}
                        description={tr('目前的設定會先另存一份，之後可以回到還原之前。')}
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
                )}
                {error && <Alert color="red">{error}</Alert>}
                {backups.length ? (
                  <Accordion variant="separated">
                    <Accordion.Item value="restore-points">
                      <Accordion.Control>
                        {tr('回到之前的設定')} ({backups.length})
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Stack gap="xs">
                          {backups.map((backup) => (
                            <Group key={backup.id} justify="space-between">
                              <Text size="xs">
                                {new Date(backup.createdAt).toLocaleString(appearance.locale)}
                              </Text>
                              <Button
                                size="xs"
                                variant="default"
                                disabled={saving || busy || !!restorePreview}
                                onClick={() => void restore(backup.id)}
                              >
                                {tr('復原此備份')}
                              </Button>
                            </Group>
                          ))}
                        </Stack>
                      </Accordion.Panel>
                    </Accordion.Item>
                  </Accordion>
                ) : null}
              </Stack>
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
