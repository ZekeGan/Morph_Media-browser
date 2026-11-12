import { useEffect, useState } from 'react'
import { Alert, Button, Group, Text } from '@mantine/core'
import { t as tr } from '../i18n'
import { describeError } from '../notices/errors'

// Application settings (R-320): the program that plays .swf games (Flash Player projector or Ruffle desktop). It is
// picked in a main-process dialog; the window only shows the path. M:orph never plays Flash itself.
export function FlashPlayerSetting({ opened }: { opened: boolean }) {
  const [file, setFile] = useState<string>(),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false)
  useEffect(() => {
    if (!opened) return
    void window.desktop
      .workspace()
      .then((state) => setFile(state.prefs.flashPlayer))
      .catch(() => {})
  }, [opened])
  const change = async (clear: boolean) => {
    setPending(true)
    setError('')
    try {
      const result = await window.explorer.request({ action: 'chooseFlashPlayer', clear })
      if (clear) setFile(undefined)
      else if (result.flashPlayer) setFile(result.flashPlayer)
    } catch (reason) {
      setError(describeError(reason).message)
    } finally {
      setPending(false)
    }
  }
  return (
    <section className="settings-section" aria-label={tr('Flash 播放器')}>
      <Text fw={600}>{tr('Flash 播放器')}</Text>
      <Text size="sm" c="dimmed" mb="xs">
        {tr(
          '指定播放 .swf 的程式（Flash Player projector 或 Ruffle 桌面版）後，遊戲的「啟動遊戲」可以選 .swf 檔。'
        )}
      </Text>
      <Text size="sm" className="path" title={file}>
        {file ?? tr('尚未指定')}
      </Text>
      <Group gap="xs" mt="xs">
        <Button size="xs" variant="default" disabled={pending} onClick={() => void change(false)}>
          {tr('選擇播放程式')}
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
