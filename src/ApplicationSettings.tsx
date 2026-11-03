import type { SettingsImportPreview } from '../shared/workspace'
import { t as tr, useLocale } from './i18n'
import { HelpLabel, HelpTip } from './HelpTip'
import { useEffect, useState } from 'react'
import { Accordion, Alert, Button, Group, Modal, Select, Stack, Tabs, Text } from '@mantine/core'
import { localeOptions, type LocaleId } from '../shared/locales'
import { themes, useAppTheme } from './themes/ThemeProvider'
import type { ThemeId } from '../shared/themes'
import { flushSync } from 'react-dom'
import { Icon } from './icons'

export function ApplicationSettings({
  opened,
  close,
  onDirty,
  actions,
}: {
  opened: boolean
  close: () => void
  onDirty: (value: boolean) => void
  actions: {
    busy: boolean
    legacyAvailable: boolean
    legacy: () => void
    cleanAll: () => void
  }
}) {
  useLocale()

  const appearance = useAppTheme(),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('')
  const [importPreview, setImportPreview] = useState<SettingsImportPreview>(),
    [importMode, setImportMode] = useState<'merge' | 'replace'>('merge'),
    [backups, setBackups] = useState<{ id: string; createdAt: string }[]>([]),
    [transferResult, setTransferResult] = useState('')
  const [applied, setApplied] = useState(false)
  useEffect(() => {
    onDirty(opened && !!importPreview)
    return () => onDirty(false)
  }, [opened, importPreview, onDirty])
  useEffect(() => {
    if (opened) {
      setError('')
      setImportPreview(undefined)
      setTransferResult('')
      void window.desktop
        .updateWorkspace({ action: 'listBackups' })
        .then((state) => setBackups(state.backups ?? []))
        .catch((reason) => setError(String(reason)))
      setApplied(false)
    }
  }, [opened])
  const requestClose = () => {
    if (!saving && (!importPreview || window.confirm(tr('放棄尚未套用的設定匯入？')))) close()
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
  const transferLabels: Record<string, string> = {
    groups: tr('群組'),
    projects: tr('專案分類與最愛'),
    theme: tr('介面主題'),
    locale: tr('介面語言'),
    sidebarWidth: tr('側欄寬度'),
    sidebarHidden: tr('隱藏側欄'),
    collapsed: tr('收合狀態'),
    sections: tr('群組順序'),
    projectOrder: tr('專案順序'),
    videoAudio: tr('影片音量'),
  }
  const formatPreference = (value: unknown, field: string): string => {
    if (value === undefined) return tr('未設定')
    if (typeof value === 'boolean') return value ? tr('是') : tr('否')
    if (field === 'locale')
      return localeOptions.find((option) => option.value === value)?.label ?? String(value)
    if (field === 'theme')
      return tr(themes.find((theme) => theme.id === value)?.name ?? String(value))
    if (field === 'groups' && Array.isArray(value))
      return value.map((group) => group.name).join('、') || tr('無')
    if (field === 'projects' && value && typeof value === 'object')
      return tr(
        '{0} 個專案，{1} 個最愛',
        Object.keys(value).length,
        Object.values(value).filter((project) => project.favorite).length
      )
    return typeof value === 'object' ? tr('{0} 筆', Object.keys(value ?? {}).length) : String(value)
  }
  const transfer = async (action: 'export' | 'import') => {
    setSaving(true)
    setError('')
    setTransferResult('')
    try {
      const state = await window.desktop.settingsFile(action)
      if (state.cancelled) return
      if (state.importPreview) {
        setImportPreview(state.importPreview)
        setImportMode('merge')
      } else setTransferResult('設定包已匯出')
    } catch (reason) {
      setError(String(reason))
    } finally {
      setSaving(false)
    }
  }
  const applyImport = async () => {
    if (!importPreview) return
    setSaving(true)
    setError('')
    try {
      await window.desktop.updateWorkspace({
        action: 'applyPackage',
        token: importPreview.token,
        mode: importMode,
      })
      // The page is reloaded next; the unsaved-changes guard must already see "clean", so the state is committed first
      // (React 19 no longer applies updates made after an await before a timer callback runs).
      flushSync(() => {
        setImportPreview(undefined)
        onDirty(false)
      })
      window.location.reload()
    } catch (reason) {
      setError(String(reason))
      setSaving(false)
    }
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
          <Tabs.Tab value="data">{tr('資料與備份')}</Tabs.Tab>
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
            {actions.legacyAvailable && (
              <section className="settings-section">
                <Text fw={600}>{tr('舊版資料')}</Text>
                <Text size="xs" c="dimmed" mb="xs">
                  {tr('偵測到舊版資料，可預覽後匯入。')}
                </Text>
                <Button variant="default" disabled={actions.busy} onClick={actions.legacy}>
                  {tr('檢視舊資料匯入')}
                </Button>
              </section>
            )}
            <section className="settings-section">
              <Text fw={600}>{tr('設定備份')}</Text>
              <Text size="xs" c="dimmed" mb="xs">
                {tr('匯出群組、收藏與操作偏好；不包含媒體、路徑連結或登入憑證。')}
              </Text>
              <Stack>
                <Group>
                  <Button disabled={saving} onClick={() => void transfer('export')}>
                    {tr('匯出設定包')}
                  </Button>
                  <Button
                    variant="default"
                    disabled={saving}
                    onClick={() => void transfer('import')}
                  >
                    {tr('匯入設定包')}
                  </Button>
                </Group>
                {importPreview && (
                  <Stack>
                    <Text fw={600}>{tr('設定匯入預覽')}</Text>
                    {importPreview.changes.map((change) => (
                      <Text key={change.field} size="sm">
                        {transferLabels[change.field] ?? change.field}:{' '}
                        {formatPreference(change.current, change.field)} →{' '}
                        {formatPreference(change.incoming, change.field)}
                      </Text>
                    ))}
                    <Select
                      label={tr('匯入方式')}
                      allowDeselect={false}
                      value={importMode}
                      onChange={(value) => setImportMode(value as 'merge' | 'replace')}
                      data={[
                        { value: 'merge', label: tr('合併：保留目前設定') },
                        { value: 'replace', label: tr('以匯入設定取代') },
                      ]}
                    />
                    <Group>
                      <Button
                        variant="default"
                        disabled={saving}
                        onClick={() => setImportPreview(undefined)}
                      >
                        {tr('取消匯入')}
                      </Button>
                      <Button loading={saving} onClick={() => void applyImport()}>
                        {tr('備份並匯入')}
                      </Button>
                    </Group>
                  </Stack>
                )}
                {transferResult && <Alert color="teal">{tr(transferResult)}</Alert>}
                {error && <Alert color="red">{error}</Alert>}
                {backups.length ? (
                  <Accordion variant="separated">
                    <Accordion.Item value="restore-points">
                      <Accordion.Control>
                        {tr('可復原的設定備份')} ({backups.length})
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
                                disabled={saving}
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
                ) : (
                  <Text size="xs" c="dimmed">
                    {tr('尚無設定備份')}
                  </Text>
                )}
              </Stack>
            </section>
            <Accordion variant="separated" className="danger-accordion">
              <Accordion.Item value="danger">
                <Accordion.Control c="red">{tr('危險操作')}</Accordion.Control>
                <Accordion.Panel>
                  <Text size="sm" fw={600}>
                    {tr('清理全部已連結資料')}
                  </Text>
                  <Text size="xs" c="dimmed" my="xs">
                    {tr('預覽範圍後才會清理；原始資料夾與媒體保留。')}
                  </Text>
                  <Button
                    variant="default"
                    color="red"
                    disabled={actions.busy}
                    onClick={actions.cleanAll}
                  >
                    {tr('清理全部已連結資料')}
                  </Button>
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  )
}
