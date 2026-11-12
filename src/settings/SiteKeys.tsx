import { useEffect, useRef, useState } from 'react'
import { Alert, Badge, Button, Group, PasswordInput, Stack, Text } from '@mantine/core'
import { keySites, type KeySite, type KeyStatus } from '../../shared/keys'
import { t as tr } from '../i18n'
import { describeError } from '../notices/errors'

// R-285: one row per website that needs (or can use) the user's own key. Keys go to main once and are never shown
// back; the row only knows whether one is saved and how its last test went.
export function SiteKeys({ opened, focus }: { opened: boolean; focus?: string }) {
  const [status, setStatus] = useState<Record<string, KeyStatus>>({}),
    [error, setError] = useState('')
  useEffect(() => {
    if (!opened) return
    void window.explorer
      .request({ action: 'keyStatus' })
      .then((result) => setStatus(result.keys ?? {}))
      .catch((reason) => setError(describeError(reason).message))
  }, [opened])
  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {tr('金鑰只存在這台電腦、加密保存，只在向該網站查資料時使用；不會寫進資料夾記錄或設定包。')}
      </Text>
      {error && <Alert color="orange">{error}</Alert>}
      {keySites.map((site) => (
        <KeyRow
          key={site.id}
          site={site}
          status={status[site.id]}
          focused={focus === site.id}
          onStatus={setStatus}
        />
      ))}
    </Stack>
  )
}

function KeyRow({
  site,
  status,
  focused,
  onStatus,
}: {
  site: KeySite
  status?: KeyStatus
  focused: boolean
  onStatus: (status: Record<string, KeyStatus>) => void
}) {
  const [values, setValues] = useState<Record<string, string>>({}),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(''),
    [help, setHelp] = useState(false),
    row = useRef<HTMLElement>(null)
  useEffect(() => {
    if (focused) row.current?.scrollIntoView({ block: 'center' })
  }, [focused])
  const call = async (request: Parameters<typeof window.explorer.request>[0]) => {
    setPending(true)
    setMessage('')
    try {
      const result = await window.explorer.request(request)
      if (result.keys) onStatus(result.keys)
      return result
    } catch (reason) {
      setMessage(describeError(reason).message)
    } finally {
      setPending(false)
    }
  }
  const filled = site.fields.every((field) => field.optional || values[field.id]?.trim())
  const state = !status?.set
    ? { label: tr('未設定'), color: 'gray' }
    : status.test === 'ok'
      ? { label: tr('可用'), color: 'teal' }
      : status.test === 'failed'
        ? { label: tr('無法驗證'), color: 'red' }
        : { label: tr('已設定'), color: 'blue' }
  return (
    <section
      ref={row}
      className={'settings-section site-key' + (focused ? ' focused' : '')}
      aria-label={site.name}
    >
      <Group justify="space-between" wrap="nowrap">
        <div>
          <Group gap={6}>
            <Text fw={600}>{site.name}</Text>
            <Badge size="xs" variant="light" color={site.need === 'required' ? 'orange' : 'gray'}>
              {site.need === 'required' ? tr('必要') : tr('選填')}
            </Badge>
          </Group>
          <Text size="xs" c="dimmed">
            {tr(site.purpose)}
          </Text>
        </div>
        <Badge variant="light" color={state.color}>
          {state.label}
        </Badge>
      </Group>
      <Stack gap={6} mt="xs">
        {site.fields.map((field) => (
          <PasswordInput
            key={field.id}
            size="xs"
            label={tr(field.label) + (field.optional ? ' ' + tr('（選填）') : '')}
            placeholder={status?.set ? tr('已保存；輸入新的值會取代') : ''}
            value={values[field.id] ?? ''}
            disabled={pending}
            autoComplete="off"
            onChange={(event) => {
              const value = event.currentTarget.value
              setValues((previous) => ({ ...previous, [field.id]: value }))
            }}
          />
        ))}
      </Stack>
      <Group gap="xs" mt="xs">
        <Button
          size="xs"
          disabled={pending || !filled}
          onClick={async () => {
            if (await call({ action: 'setKey', site: site.id, values })) {
              setValues({})
              await call({ action: 'testKey', site: site.id })
            }
          }}
        >
          {tr('保存並測試')}
        </Button>
        <Button
          size="xs"
          variant="default"
          disabled={pending || !status?.set}
          onClick={() => void call({ action: 'testKey', site: site.id })}
        >
          {tr('測試')}
        </Button>
        <Button
          size="xs"
          variant="subtle"
          disabled={pending || !status?.set}
          onClick={() => void call({ action: 'clearKey', site: site.id })}
        >
          {tr('清除')}
        </Button>
        <Button size="xs" variant="subtle" onClick={() => setHelp((value) => !value)}>
          {tr('怎麼申請')}
        </Button>
      </Group>
      {help && (
        <Text size="xs" c="dimmed" mt="xs">
          {tr(site.steps)}
        </Text>
      )}
      {message && (
        <Alert color="orange" mt="xs">
          {message}
        </Alert>
      )}
    </section>
  )
}
