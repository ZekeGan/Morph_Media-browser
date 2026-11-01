import type { SettingsImportPreview } from '../shared/workspace'
import { t as tr, useLocale } from './i18n'
import { HelpLabel, HelpTip } from './HelpTip'
import { useEffect, useState, type ReactNode } from 'react'
import { Alert, Button, Group, Modal, Select, Stack, Switch, Tabs, Text } from '@mantine/core'
import { localeOptions, type LocaleId } from '../shared/locales'
import { themes, useAppTheme } from './themes/ThemeProvider'
import { Icon } from './icons'

export function ApplicationSettings({
  opened,
  close,
  onDirty,
  maintenance,
}: {
  opened: boolean
  close: () => void
  onDirty: (value: boolean) => void
  maintenance: ReactNode
}) {
  useLocale()

  const appearance = useAppTheme(),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('')
  const [autoOpenContent, setAutoOpenContent] = useState(false),
    [importPreview, setImportPreview] = useState<SettingsImportPreview>(),
    [importMode, setImportMode] = useState<'merge' | 'replace'>('merge'),
    [backups, setBackups] = useState<{ id: string; createdAt: string }[]>([]),
    [transferResult, setTransferResult] = useState('')
  const dirty =
    appearance.theme !== appearance.saved || appearance.locale !== appearance.savedLocale
  useEffect(() => {
    onDirty(opened && (dirty || !!importPreview))
    return () => onDirty(false)
  }, [opened, dirty, importPreview, onDirty])
  useEffect(() => {
    if (opened) {
      setError('')
      setImportPreview(undefined)
      setTransferResult('')
      void window.desktop
        .updateWorkspace({ action: 'listBackups' })
        .then((state) => setBackups(state.backups ?? []))
        .catch((reason) => setError(String(reason)))
      void window.desktop
        .workspace()
        .then((state) => setAutoOpenContent(state.prefs.autoOpenContent === true))
        .catch((reason) => setError(String(reason)))
    }
  }, [opened])
  const cancel = () => {
    appearance.preview(appearance.saved)
    appearance.previewLocale(appearance.savedLocale)
    close()
  }
  const requestClose = () => {
    if (!saving && ((!dirty && !importPreview) || window.confirm(tr('放棄尚未保存的外觀變更？'))))
      cancel()
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
    autoOpenContent: tr('自動開啟資料夾內容'),
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
      setImportPreview(undefined)
      onDirty(false)
      setTimeout(() => window.location.reload(), 0)
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
  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await appearance.save(appearance.theme, appearance.locale)
      close()
    } catch (e) {
      setError(String(e))
    } finally {
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
      <Tabs defaultValue="appearance" keepMounted>
        <Tabs.List>
          <Tabs.Tab value="appearance" leftSection={<Icon name="sliders" />}>
            {tr('外觀')}
          </Tabs.Tab>
          <Tabs.Tab value="browse" disabled={dirty || saving}>
            {tr('瀏覽')}
          </Tabs.Tab>
          <Tabs.Tab value="transfer" disabled={dirty || saving}>
            {tr('設定移轉')}
          </Tabs.Tab>
          <Tabs.Tab value="maintenance" disabled={dirty || saving}>
            {tr('連結與維護')}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="appearance" pt="lg">
          <Select
            label={
              <HelpLabel
                label={tr('介面語言')}
                help={tr('立即預覽；專案名稱與資料內容保持原樣。')}
              />
            }
            data={localeOptions}
            value={appearance.locale}
            allowDeselect={false}
            disabled={!appearance.ready || saving || !!appearance.error}
            onChange={(value) => value && appearance.previewLocale(value as LocaleId)}
            mb="xl"
          />
          <Group gap={4} mb="lg" wrap="nowrap">
            <Text fw={600} size="sm">
              {tr('選擇你的介面風格')}
            </Text>
            <HelpTip text={tr('套用到整個應用程式。點選預覽，保存後下次開啟仍會使用。')} />
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
                onClick={() => appearance.preview(theme.id)}
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
            <Alert color="red" mt="md" title={tr('外觀尚未保存')}>
              {error || appearance.error}
            </Alert>
          )}
          <Group justify="space-between" mt="xl">
            <Text size="xs" c="dimmed" role="status">
              {dirty ? tr('預覽中 · 尚未保存') : tr('目前外觀已保存')}
            </Text>
            <Group gap="xs">
              <Button variant="default" disabled={saving} onClick={cancel}>
                {tr('取消')}
              </Button>
              <Button
                disabled={!dirty || !appearance.ready || !!appearance.error}
                loading={saving}
                onClick={() => void save()}
              >
                {tr('保存外觀設定')}
              </Button>
            </Group>
          </Group>
        </Tabs.Panel>
        <Tabs.Panel value="transfer" pt="lg">
          <Stack>
            <Text size="sm">
              {tr('匯出群組、收藏與操作偏好；不包含媒體、路徑連結或登入憑證。')}
            </Text>
            <Group>
              <Button disabled={saving} onClick={() => void transfer('export')}>
                {tr('匯出設定包')}
              </Button>
              <Button variant="default" disabled={saving} onClick={() => void transfer('import')}>
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
            <Text fw={600}>{tr('可復原的設定備份')}</Text>
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
        </Tabs.Panel>
        <Tabs.Panel value="maintenance" pt="lg">
          <Stack>{maintenance}</Stack>
        </Tabs.Panel>
        <Tabs.Panel value="browse" pt="lg">
          <Stack>
            <Switch
              aria-label={tr('自動開啟資料夾內容')}
              label={
                <HelpLabel
                  label={tr('自動開啟資料夾內容')}
                  help={tr('進入其他資料夾時，自動展開右側內容面板')}
                />
              }
              checked={autoOpenContent}
              disabled={saving}
              onChange={(event) => {
                const value = event.currentTarget.checked,
                  previous = autoOpenContent
                setAutoOpenContent(value)
                setSaving(true)
                setError('')
                void window.desktop
                  .updateWorkspace({ action: 'browseBehavior', autoOpenContent: value })
                  .then((state) => setAutoOpenContent(state.prefs.autoOpenContent === true))
                  .catch((reason) => {
                    setAutoOpenContent(previous)
                    setError(String(reason))
                  })
                  .finally(() => setSaving(false))
              }}
            />
            <Text size="xs" c="dimmed">
              {tr('立即保存；手動顯隱面板不會改變此偏好。')}
            </Text>
            {error && <Alert color="red">{error}</Alert>}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Modal>
  )
}
