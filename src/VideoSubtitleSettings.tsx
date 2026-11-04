import type { Dispatch, SetStateAction } from 'react'
import {
  Accordion,
  Alert,
  Button,
  ColorInput,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
} from '@mantine/core'
import {
  defaultSubtitle,
  type ExplorerResponse,
  type MediaEntry,
  type SubtitlePrefs,
} from '../shared/explorer'
import { t as tr, useLocale } from './i18n'

interface Props {
  captions: boolean
  toggleCaptions: () => void
  section: string | null
  changeSection: (value: string | null) => void
  error: string
  subtitle: ExplorerResponse['subtitle']
  files: File[]
  subtitles: MediaEntry[]
  settings: SubtitlePrefs
  readonly?: boolean
  load: (entry?: MediaEntry, external?: File) => Promise<void>
  clear: () => void
  save: () => Promise<void>
  importSubtitle: () => Promise<void>
  changeEncoding: (encoding: string | null) => Promise<void>
  setSettings: Dispatch<SetStateAction<SubtitlePrefs>>
}

// Controlled view: playback state, file access and persistence stay in VideoViewer.
export function VideoSubtitleSettings({
  captions,
  toggleCaptions,
  section,
  changeSection,
  error,
  subtitle,
  files,
  subtitles,
  settings,
  readonly,
  load,
  clear,
  save,
  importSubtitle,
  changeEncoding,
  setSettings,
}: Props) {
  useLocale()
  return (
    <Stack gap="xs" className="player-subtitle-settings">
      <Switch
        label={tr('顯示／隱藏字幕')}
        checked={captions}
        disabled={!subtitle}
        onChange={toggleCaptions}
      />
      {error && <Alert color="orange">{error}</Alert>}

      {subtitle && (
        <Text size="xs" className="player-subtitle-source" title={subtitle.name}>
          {subtitle.name} · {subtitle.portable ? tr('資料夾內來源') : tr('本次臨時來源')}
        </Text>
      )}
      <Accordion
        value={section}
        onChange={changeSection}
        variant="separated"
        transitionDuration={0}
      >
        <Accordion.Item value="source">
          <Accordion.Control>{tr('字幕來源')}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <Group gap="xs">
                <Button size="xs" variant="light" onClick={() => void load()}>
                  {tr('載入字幕／拖到播放器')}
                </Button>
                <Button size="xs" variant="default" disabled={!subtitle} onClick={clear}>
                  {tr('關閉字幕')}
                </Button>
                {subtitle && !subtitle.portable && (
                  <Button size="xs" disabled={readonly} onClick={() => void importSubtitle()}>
                    {tr('匯入字幕（存一份在資料夾資訊裡）')}
                  </Button>
                )}
              </Group>

              {files.length > 1 && (
                <Select
                  label={tr('選擇拖入的字幕')}
                  comboboxProps={{ withinPortal: false }}
                  data={files.map((f, i) => ({ value: String(i), label: f.name }))}
                  onChange={(v) => v !== null && void load(undefined, files[Number(v)])}
                />
              )}

              {subtitles.length > 0 && (
                <div className="subtitle-list">
                  {subtitles.map((s) => (
                    <Button
                      key={s.id}
                      size="xs"
                      variant={subtitle?.token === s.id ? 'light' : 'subtle'}
                      aria-pressed={subtitle?.token === s.id}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData('application/x-media-subtitle', s.id)
                      }
                      onClick={() => void load(s)}
                    >
                      {s.name}
                    </Button>
                  ))}
                </div>
              )}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="sync">
          <Accordion.Control disabled={!subtitle}>{tr('同步與編碼')}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <NumberInput
                label={tr('延後秒數（正值＝晚出現）')}
                decimalScale={1}
                step={0.1}
                min={-86400}
                max={86400}
                value={settings.offset}
                onChange={(v) => typeof v === 'number' && setSettings((s) => ({ ...s, offset: v }))}
              />
              <Button
                size="xs"
                onClick={() =>
                  setSettings((s) => ({ ...s, offset: Math.round((s.offset - 0.1) * 10) / 10 }))
                }
              >
                {tr('提早 0.1 秒')}
              </Button>
              <Button
                size="xs"
                onClick={() =>
                  setSettings((s) => ({ ...s, offset: Math.round((s.offset + 0.1) * 10) / 10 }))
                }
              >
                {tr('延後 0.1 秒')}
              </Button>
              <Select
                label={tr('文字編碼')}
                comboboxProps={{ withinPortal: false }}
                value={settings.encoding}
                data={['utf-8', 'big5', 'shift_jis']}
                onChange={changeEncoding}
              />
              <small className="muted">
                {tr(
                  '固定延遲無法修復逐漸累積的時間差；請改用對應版本字幕。設定按影片與字幕來源保存。'
                )}
              </small>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="appearance">
          <Accordion.Control disabled={!subtitle}>{tr('字幕外觀')}</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <NumberInput
                label={tr('字幕大小')}
                min={10}
                max={80}
                value={settings.size}
                onChange={(v) => typeof v === 'number' && setSettings((s) => ({ ...s, size: v }))}
              />
              <NumberInput
                label={tr('距畫面底部 %')}
                min={0}
                max={80}
                value={settings.bottom}
                onChange={(v) => typeof v === 'number' && setSettings((s) => ({ ...s, bottom: v }))}
              />
              <ColorInput
                label={tr('字幕顏色')}
                popoverProps={{ withinPortal: false }}
                value={settings.color}
                onChange={(v) =>
                  /^#[0-9a-f]{6}$/i.test(v) && setSettings((s) => ({ ...s, color: v }))
                }
              />
              <ColorInput
                label={tr('字幕背景')}
                popoverProps={{ withinPortal: false }}
                value={settings.background}
                onChange={(v) =>
                  /^#[0-9a-f]{6}$/i.test(v) && setSettings((s) => ({ ...s, background: v }))
                }
              />
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      {subtitle && (
        <Group gap="xs" className="player-subtitle-footer">
          <Button size="xs" disabled={readonly} onClick={() => void save()}>
            {tr('保存字幕設定')}
          </Button>
          <Button variant="default" size="xs" onClick={() => setSettings(defaultSubtitle())}>
            {tr('重設')}
          </Button>
        </Group>
      )}
    </Stack>
  )
}
