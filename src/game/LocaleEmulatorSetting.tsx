import { useEffect, useState } from 'react'
import { Alert, Button, Group, Text } from '@mantine/core'
import { t as tr } from '../i18n'
import { describeError } from '../notices/errors'

// Application settings (R-309): where Locale Emulator's LEProc.exe is. The file is picked in a main-process dialog;
// the window only shows the path. Game EXE actions can then start in Japanese locale through it.
export function LocaleEmulatorSetting({ opened }: { opened: boolean }) {
  const [file, setFile] = useState<string>(),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false)
  useEffect(() => {
    if (!opened) return
    void window.desktop
      .workspace()
      .then((state) => setFile(state.prefs.localeEmulator))
      .catch(() => {})
  }, [opened])
  const change = async (clear: boolean) => {
    setPending(true)
    setError('')
    try {
      const result = await window.explorer.request({ action: 'chooseLocaleEmulator', clear })
      if (clear) setFile(undefined)
      else if (result.localeEmulator) setFile(result.localeEmulator)
    } catch (reason) {
      setError(describeError(reason).message)
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="settings-section" aria-label="Locale Emulator">
      <Text fw={600}>Locale Emulator</Text>
      <Text size="sm" c="dimmed" mb="xs">
        {tr('指定 LEProc.exe 後，遊戲的 EXE 操作可以勾選「用日文語系啟動」。')}
      </Text>
      <Text size="sm" className="path" title={file}>
        {file ?? tr('尚未指定')}
      </Text>
      <Group gap="xs" mt="xs">
        <Button size="xs" variant="default" disabled={pending} onClick={() => void change(false)}>
          {tr('選擇 LEProc.exe')}
        </Button>
        {file && (
          <Button size="xs" variant="subtle" disabled={pending} onClick={() => void change(true)}>
            {tr('清除')}
          </Button>
        )}
      </Group>
      {error && (
        <Alert color="orange" mt="xs">
          {error}
        </Alert>
      )}
    </section>
  )
}
